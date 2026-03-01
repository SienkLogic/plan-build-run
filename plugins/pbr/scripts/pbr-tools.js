#!/usr/bin/env node

/**
 * pbr-tools.js — Structured JSON state operations for Plan-Build-Run skills.
 *
 * Thin dispatcher that imports from lib/ modules. All core logic lives in:
 *   lib/core.js    — Foundation utilities (parsers, file ops, constants)
 *   lib/config.js  — Config loading, validation, depth profiles
 *   lib/state.js   — STATE.md operations (load, update, patch, advance)
 *   lib/roadmap.js — ROADMAP.md operations (parse, update status/plans)
 *   lib/phase.js   — Phase operations (add, remove, list, info, plan-index)
 *   lib/init.js    — Compound init commands (execute-phase, plan-phase, etc.)
 *   lib/history.js — HISTORY.md operations (append, load)
 *
 * Skills call this via:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js <command> [args]
 *
 * Commands:
 *   state load              — Full project state as JSON
 *   state check-progress    — Recalculate progress from filesystem
 *   state update <f> <v>    — Atomically update a STATE.md field
 *   config validate          — Validate config.json against schema
 *   plan-index <phase>      — Plan inventory for a phase, grouped by wave
 *   frontmatter <filepath>  — Parse .md file's YAML frontmatter → JSON
 *   must-haves <phase>      — Collect all must-haves from phase plans → JSON
 *   phase-info <phase>      — Comprehensive single-phase status → JSON
 *   roadmap update-status <phase> <status>      — Update phase status in ROADMAP.md
 *   roadmap update-plans <phase> <complete> <total> — Update phase plans in ROADMAP.md
 *   history append <type> <title> [body] — Append record to HISTORY.md
 *   history load                         — Load all HISTORY.md records as JSON
 *   todo list [--theme X] [--status Y]  — List todos as JSON (default: pending)
 *   todo get <NNN>                       — Get a specific todo by number
 *   todo add <title> [--priority P] [--theme T] — Add a new todo
 *   todo done <NNN>                      — Mark a todo as complete
 *   llm metrics [--session <ISO>]        — Lifetime or session-scoped LLM usage metrics
 *   validate-project        — Comprehensive .planning/ integrity check
 *   phase add <slug> [--after N] — Add a new phase directory (with renumbering)
 *   phase remove <N>             — Remove an empty phase directory (with renumbering)
 *   phase list                   — List all phase directories with status
 *   learnings ingest <json-file>  — Ingest a learning entry into global store
 *   learnings query [--tags X] [--min-confidence Y] [--stack S] [--type T] — Query learnings
 *   learnings check-thresholds   — Check deferral trigger conditions
 *   spot-check <phaseSlug> <planId>  — Verify SUMMARY, key_files, and commits exist for a plan
 *   staleness-check <phase-slug>  — Check if phase plans are stale vs dependencies
 *   summary-gate <phase-slug> <plan-id>  — Verify SUMMARY.md exists, non-empty, valid frontmatter
 *   checkpoint init <phase-slug> [--plans "id1,id2"]  — Initialize checkpoint manifest
 *   checkpoint update <phase-slug> --wave N --resolved id [--sha hash]  — Update manifest
 *   seeds match <phase-slug> <phase-number>  — Find matching seed files for a phase
 *
 * Environment: PBR_PROJECT_ROOT — Override project root directory (used when hooks fire from subagent cwd)
 */

const fs = require('fs');
const path = require('path');

// --- Import lib modules ---
const {
  KNOWN_AGENTS,
  VALID_STATUS_TRANSITIONS,
  validateStatusTransition,
  output,
  error,
  parseYamlFrontmatter,
  parseMustHaves,
  findFiles,
  tailLines,
  countMustHaves,
  determinePhaseStatus,
  atomicWrite,
  lockedFileUpdate,
  writeActiveSkill
} = require('./lib/core');

const {
  configLoad: _configLoad,
  configClearCache: _configClearCache,
  configValidate: _configValidate,
  resolveDepthProfile,
  DEPTH_PROFILE_DEFAULTS,
  loadUserDefaults,
  saveUserDefaults,
  mergeUserDefaults,
  USER_DEFAULTS_PATH
} = require('./lib/config');

const {
  parseStateMd,
  updateLegacyStateField,
  updateFrontmatterField,
  stateLoad: _stateLoad,
  stateCheckProgress: _stateCheckProgress,
  stateUpdate: _stateUpdate,
  statePatch: _statePatch,
  stateAdvancePlan: _stateAdvancePlan,
  stateRecordMetric: _stateRecordMetric
} = require('./lib/state');

const {
  parseRoadmapMd,
  findRoadmapRow,
  updateTableRow,
  roadmapUpdateStatus: _roadmapUpdateStatus,
  roadmapUpdatePlans: _roadmapUpdatePlans
} = require('./lib/roadmap');

const {
  frontmatter: _frontmatter,
  planIndex: _planIndex,
  mustHavesCollect: _mustHavesCollect,
  phaseInfo: _phaseInfo,
  phaseAdd: _phaseAdd,
  phaseRemove: _phaseRemove,
  phaseList: _phaseList,
  milestoneStats: _milestoneStats
} = require('./lib/phase');

const {
  initExecutePhase: _initExecutePhase,
  initPlanPhase: _initPlanPhase,
  initQuick: _initQuick,
  initVerifyWork: _initVerifyWork,
  initResume: _initResume,
  initProgress: _initProgress,
  initStateBundle: _initStateBundle
} = require('./lib/init');

const {
  historyAppend: _historyAppend,
  historyLoad: _historyLoad
} = require('./lib/history');

const {
  todoList: _todoList,
  todoGet: _todoGet,
  todoAdd: _todoAdd,
  todoDone: _todoDone
} = require('./lib/todo');

const {
  applyMigrations: _applyMigrations
} = require('./lib/migrate');

const {
  spotCheck: _spotCheck
} = require('./lib/spot-check');

const {
  learningsIngest: _learningsIngest,
  learningsQuery: _learningsQuery,
  checkDeferralThresholds: _checkDeferralThresholds
} = require('./lib/learnings');

const {
  referenceGet: _referenceGet
} = require('./lib/reference');

const {
  contextTriage: _contextTriage
} = require('./lib/context');

const {
  stalenessCheck: _stalenessCheck,
  summaryGate: _summaryGate,
  checkpointInit: _checkpointInit,
  checkpointUpdate: _checkpointUpdate,
  seedsMatch: _seedsMatch
} = require('./lib/build');

// --- Local LLM imports (not extracted — separate module tree) ---
const { resolveConfig, checkHealth } = require('./local-llm/health');
const { classifyArtifact } = require('./local-llm/operations/classify-artifact');
const { scoreSource } = require('./local-llm/operations/score-source');
const { classifyError } = require('./local-llm/operations/classify-error');
const { summarizeContext } = require('./local-llm/operations/summarize-context');
const { readSessionMetrics, summarizeMetrics, computeLifetimeMetrics } = require('./local-llm/metrics');
const { computeThresholdAdjustments } = require('./local-llm/threshold-tuner');

// --- Module-level state (for backwards compatibility) ---

let cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
let planningDir = path.join(cwd, '.planning');

// --- Wrapper functions that pass planningDir to lib modules ---
// These preserve the original function signatures (no planningDir param)
// so existing callers (hook scripts, tests) continue to work.

function configLoad(dir) {
  return _configLoad(dir || planningDir);
}

function configClearCache() {
  _configClearCache();
  cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  planningDir = path.join(cwd, '.planning');
}

function configValidate(preloadedConfig) {
  return _configValidate(preloadedConfig, planningDir);
}

function stateLoad() {
  return _stateLoad(planningDir);
}

function stateCheckProgress() {
  return _stateCheckProgress(planningDir);
}

function stateUpdate(field, value) {
  return _stateUpdate(field, value, planningDir);
}

function statePatch(jsonStr) {
  return _statePatch(jsonStr, planningDir);
}

function stateAdvancePlan() {
  return _stateAdvancePlan(planningDir);
}

function stateRecordMetric(metricArgs) {
  return _stateRecordMetric(metricArgs, planningDir);
}

function roadmapUpdateStatus(phaseNum, newStatus) {
  return _roadmapUpdateStatus(phaseNum, newStatus, planningDir);
}

function roadmapUpdatePlans(phaseNum, complete, total) {
  return _roadmapUpdatePlans(phaseNum, complete, total, planningDir);
}

function frontmatter(filePath) {
  return _frontmatter(filePath);
}

function planIndex(phaseNum) {
  return _planIndex(phaseNum, planningDir);
}

function mustHavesCollect(phaseNum) {
  return _mustHavesCollect(phaseNum, planningDir);
}

function phaseInfo(phaseNum) {
  return _phaseInfo(phaseNum, planningDir);
}

function phaseAdd(slug, afterPhase) {
  return _phaseAdd(slug, afterPhase, planningDir);
}

function phaseRemove(phaseNum) {
  return _phaseRemove(phaseNum, planningDir);
}

function phaseList() {
  return _phaseList(planningDir);
}

function milestoneStats(version) {
  return _milestoneStats(version, planningDir);
}

function initExecutePhase(phaseNum) {
  return _initExecutePhase(phaseNum, planningDir);
}

function initPlanPhase(phaseNum) {
  return _initPlanPhase(phaseNum, planningDir);
}

function initQuick(description) {
  return _initQuick(description, planningDir);
}

function initVerifyWork(phaseNum) {
  return _initVerifyWork(phaseNum, planningDir);
}

function initResume() {
  return _initResume(planningDir);
}

function initProgress() {
  return _initProgress(planningDir);
}

function stateBundle(phaseNum) {
  return _initStateBundle(phaseNum, planningDir);
}

function historyAppend(entry, dir) {
  return _historyAppend(entry, dir || planningDir);
}

function historyLoad(dir) {
  return _historyLoad(dir || planningDir);
}

function todoList(opts) {
  return _todoList(planningDir, opts);
}

function todoGet(num) {
  return _todoGet(planningDir, num);
}

function todoAdd(title, opts) {
  return _todoAdd(planningDir, title, opts);
}

function todoDone(num) {
  return _todoDone(planningDir, num);
}

function migrate(options) {
  return _applyMigrations(planningDir, options);
}

function spotCheck(phaseDir, planId) {
  return _spotCheck(planningDir, phaseDir, planId);
}

function referenceGet(name, options) {
  // Resolve plugin root — try CLAUDE_PLUGIN_ROOT env, then walk up from __dirname
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  // Fix MSYS paths on Windows (same pattern as run-hook.js)
  let root = pluginRoot;
  const msysMatch = root.match(/^\/([a-zA-Z])\/(.*)/);
  if (msysMatch) root = msysMatch[1] + ':' + path.sep + msysMatch[2];
  return _referenceGet(name, options, root);
}

function contextTriage(options) {
  return _contextTriage(options, planningDir);
}

function stalenessCheck(phaseSlug) { return _stalenessCheck(phaseSlug, planningDir); }
function summaryGate(phaseSlug, planId) { return _summaryGate(phaseSlug, planId, planningDir); }
function checkpointInit(phaseSlug, plans) { return _checkpointInit(phaseSlug, plans, planningDir); }
function checkpointUpdate(phaseSlug, opts) { return _checkpointUpdate(phaseSlug, opts, planningDir); }
function seedsMatch(phaseSlug, phaseNum) { return _seedsMatch(phaseSlug, phaseNum, planningDir); }

// --- validateProject stays here (cross-cutting across modules) ---

/**
 * Comprehensive .planning/ integrity check.
 * Returns { valid, errors, warnings, checks } — errors mean workflow should not proceed.
 */
function validateProject() {
  const checks = [];
  const errors = [];
  const warnings = [];

  // 1. .planning/ directory exists
  if (!fs.existsSync(planningDir)) {
    return { valid: false, errors: ['.planning/ directory not found'], warnings: [], checks: ['directory_exists: FAIL'] };
  }
  checks.push('directory_exists: PASS');

  // 2. config.json exists and is valid
  const config = configLoad();
  if (!config) {
    errors.push('config.json missing or invalid JSON');
    checks.push('config_valid: FAIL');
  } else {
    const configResult = configValidate(config);
    if (!configResult.valid) {
      errors.push(...configResult.errors.map(e => 'config: ' + e));
    }
    warnings.push(...(configResult.warnings || []).map(w => 'config: ' + w));
    checks.push('config_valid: ' + (configResult.valid ? 'PASS' : 'FAIL'));
  }

  // 3. STATE.md exists and has valid frontmatter
  const statePath = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    errors.push('STATE.md not found');
    checks.push('state_exists: FAIL');
  } else {
    try {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      const fm = parseYamlFrontmatter(stateContent);
      if (!fm || !fm.current_phase) {
        warnings.push('STATE.md frontmatter missing current_phase');
        checks.push('state_frontmatter: WARN');
      } else {
        checks.push('state_frontmatter: PASS');
      }
    } catch (e) {
      errors.push('STATE.md unreadable: ' + e.message);
      checks.push('state_readable: FAIL');
    }
  }

  // 4. ROADMAP.md exists
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    warnings.push('ROADMAP.md not found (may be a new project)');
    checks.push('roadmap_exists: WARN');
  } else {
    checks.push('roadmap_exists: PASS');
  }

  // 5. Phase directory matches STATE.md current_phase
  try {
    if (fs.existsSync(statePath)) {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      const fm = parseYamlFrontmatter(stateContent);
      if (fm && fm.current_phase) {
        const phaseNum = String(fm.current_phase).padStart(2, '0');
        const phasesDir = path.join(planningDir, 'phases');
        if (fs.existsSync(phasesDir)) {
          const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(phaseNum + '-'));
          if (dirs.length === 0) {
            warnings.push(`Phase directory for current_phase ${fm.current_phase} not found in .planning/phases/`);
            checks.push('phase_directory: WARN');
          } else {
            checks.push('phase_directory: PASS');
          }
        }
      }
    }
  } catch (_e) { /* best effort */ }

  // 6. No stale .active-skill (>2 hours old)
  const activeSkillPath = path.join(planningDir, '.active-skill');
  if (fs.existsSync(activeSkillPath)) {
    try {
      const stat = fs.statSync(activeSkillPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 2 * 60 * 60 * 1000) {
        const ageHours = Math.round(ageMs / (60 * 60 * 1000));
        warnings.push(`.active-skill is ${ageHours}h old — may be stale from a crashed session`);
        checks.push('active_skill_fresh: WARN');
      } else {
        checks.push('active_skill_fresh: PASS');
      }
    } catch (_e) { checks.push('active_skill_fresh: SKIP'); }
  } else {
    checks.push('active_skill_fresh: SKIP');
  }

  // 7. No .tmp files left from atomic writes
  try {
    const tmpFiles = fs.readdirSync(planningDir).filter(f => f.endsWith('.tmp.' + process.pid) || f.match(/\.tmp\.\d+$/));
    if (tmpFiles.length > 0) {
      warnings.push(`Found ${tmpFiles.length} leftover temp files in .planning/: ${tmpFiles.join(', ')}`);
      checks.push('no_temp_files: WARN');
    } else {
      checks.push('no_temp_files: PASS');
    }
  } catch (_e) { /* best effort */ }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks
  };
}

// --- CLI entry point ---

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  try {
    if (command === 'state' && subcommand === 'load') {
      output(stateLoad());
    } else if (command === 'state' && subcommand === 'check-progress') {
      output(stateCheckProgress());
    } else if (command === 'state' && subcommand === 'update') {
      const field = args[2];
      const value = args[3];
      if (!field || value === undefined) {
        error('Usage: pbr-tools.js state update <field> <value>\nFields: current_phase, status, plans_complete, last_activity, progress_percent, phase_slug, total_phases, last_command, blockers');
      }
      output(stateUpdate(field, value));
    } else if (command === 'config' && subcommand === 'validate') {
      output(configValidate());
    } else if (command === 'config' && subcommand === 'load-defaults') {
      const defaults = loadUserDefaults();
      output(defaults || { exists: false, path: USER_DEFAULTS_PATH });
    } else if (command === 'config' && subcommand === 'save-defaults') {
      const config = configLoad();
      if (!config) error('No config.json found. Run /pbr:setup first.');
      output(saveUserDefaults(config));
    } else if (command === 'config' && subcommand === 'resolve-depth') {
      const dir = args[2] || undefined;
      const config = configLoad(dir);
      output(resolveDepthProfile(config));
    } else if (command === 'plan-index') {
      const phase = args[1];
      if (!phase) {
        error('Usage: pbr-tools.js plan-index <phase-number>');
      }
      output(planIndex(phase));
    } else if (command === 'frontmatter') {
      const filePath = args[1];
      if (!filePath) {
        error('Usage: pbr-tools.js frontmatter <filepath>');
      }
      output(frontmatter(filePath));
    } else if (command === 'must-haves') {
      const phase = args[1];
      if (!phase) {
        error('Usage: pbr-tools.js must-haves <phase-number>');
      }
      output(mustHavesCollect(phase));
    } else if (command === 'phase-info') {
      const phase = args[1];
      if (!phase) {
        error('Usage: pbr-tools.js phase-info <phase-number>');
      }
      output(phaseInfo(phase));
    } else if (command === 'roadmap' && subcommand === 'update-status') {
      const phase = args[2];
      const status = args[3];
      if (!phase || !status) {
        error('Usage: pbr-tools.js roadmap update-status <phase-number> <status>');
      }
      output(roadmapUpdateStatus(phase, status));
    } else if (command === 'roadmap' && subcommand === 'update-plans') {
      const phase = args[2];
      const complete = args[3];
      const total = args[4];
      if (!phase || complete === undefined || total === undefined) {
        error('Usage: pbr-tools.js roadmap update-plans <phase-number> <complete> <total>');
      }
      output(roadmapUpdatePlans(phase, complete, total));
    } else if (command === 'history' && subcommand === 'append') {
      const type = args[2];   // 'milestone' or 'phase'
      const title = args[3];
      const body = args[4] || '';
      if (!type || !title) {
        error('Usage: pbr-tools.js history append <milestone|phase> <title> [body]');
      }
      output(historyAppend({ type, title, body }));
    } else if (command === 'history' && subcommand === 'load') {
      output(historyLoad());
    } else if (command === 'event') {
      const category = args[1];
      const event = args[2];
      let details = {};
      if (args[3]) {
        try { details = JSON.parse(args[3]); } catch (_e) { details = { raw: args[3] }; }
      }
      if (!category || !event) {
        error('Usage: pbr-tools.js event <category> <event> [JSON-details]');
      }
      const { logEvent } = require('./event-logger');
      logEvent(category, event, details);
      output({ logged: true, category, event });
    } else if (command === 'llm' && subcommand === 'health') {
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* use defaults */ }
      const llmConfig = resolveConfig(rawConfig.local_llm);
      const health = await checkHealth(llmConfig);
      output(health);
    } else if (command === 'llm' && subcommand === 'status') {
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* use defaults */ }
      const llmConfig = resolveConfig(rawConfig.local_llm);
      output({
        enabled: llmConfig.enabled,
        model: llmConfig.model,
        endpoint: llmConfig.endpoint,
        features: llmConfig.features,
        metrics_file: path.join(planningDir, 'logs', 'local-llm-metrics.jsonl'),
        timeout_ms: llmConfig.timeout_ms,
        disable_after_failures: llmConfig.advanced.disable_after_failures
      });
    } else if (command === 'llm' && subcommand === 'classify') {
      const fileType = args[2];
      const filePath = args[3];
      if (!fileType || !filePath) {
        error('Usage: pbr-tools.js llm classify <PLAN|SUMMARY> <filepath>');
      }
      const upperType = fileType.toUpperCase();
      if (upperType !== 'PLAN' && upperType !== 'SUMMARY') {
        error('llm classify: fileType must be PLAN or SUMMARY');
      }
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (_e) {
        error('llm classify: cannot read file: ' + filePath);
      }
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* use defaults */ }
      const llmConfig = resolveConfig(rawConfig.local_llm);
      const result = await classifyArtifact(llmConfig, planningDir, content, upperType, undefined);
      output(result || { classification: null, reason: 'LLM disabled or unavailable' });
    } else if (command === 'llm' && subcommand === 'score-source') {
      const sourceUrl = args[2];
      const filePath = args[3];
      if (!sourceUrl || !filePath) {
        error('Usage: pbr-tools.js llm score-source <url> <file-path>');
      }
      if (!fs.existsSync(filePath)) {
        error('File not found: ' + filePath);
      }
      const content = fs.readFileSync(filePath, 'utf8');
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* use defaults */ }
      const llmConfig = resolveConfig(rawConfig.local_llm);
      const result = await scoreSource(llmConfig, planningDir, content, sourceUrl, undefined);
      output(result || { level: null, reason: 'LLM disabled or unavailable' });
    } else if (command === 'llm' && subcommand === 'classify-error') {
      const filePath = args[2];
      const agentType = args[3] || 'unknown';
      if (!filePath) {
        error('Usage: pbr-tools.js llm classify-error <file-path> [agent-type]');
      }
      if (!fs.existsSync(filePath)) {
        error('File not found: ' + filePath);
      }
      const errorText = fs.readFileSync(filePath, 'utf8');
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* use defaults */ }
      const llmConfig = resolveConfig(rawConfig.local_llm);
      const result = await classifyError(llmConfig, planningDir, errorText, agentType, undefined);
      output(result || { category: null, reason: 'LLM disabled or unavailable' });
    } else if (command === 'llm' && subcommand === 'summarize') {
      const filePath = args[2];
      const maxWords = args[3] ? parseInt(args[3], 10) : undefined;
      if (!filePath) {
        error('Usage: pbr-tools.js llm summarize <file-path> [max-words]');
      }
      if (!fs.existsSync(filePath)) {
        error('File not found: ' + filePath);
      }
      const contextText = fs.readFileSync(filePath, 'utf8');
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* use defaults */ }
      const llmConfig = resolveConfig(rawConfig.local_llm);
      const result = await summarizeContext(llmConfig, planningDir, contextText, maxWords, undefined);
      output(result || { summary: null, reason: 'LLM disabled or unavailable' });
    } else if (command === 'llm' && subcommand === 'metrics') {
      const sessionFlag = args[2]; // '--session'
      const sessionStart = args[3]; // ISO timestamp
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* defaults */ }
      const rate = rawConfig.local_llm && rawConfig.local_llm.metrics && rawConfig.local_llm.metrics.frontier_token_rate
        ? rawConfig.local_llm.metrics.frontier_token_rate : 3.0;
      if (sessionFlag === '--session' && sessionStart) {
        const entries = readSessionMetrics(planningDir, sessionStart);
        const summary = summarizeMetrics(entries, rate);
        output({ scope: 'session', session_start: sessionStart, ...summary });
      } else {
        const lifetime = computeLifetimeMetrics(planningDir, rate);
        output({ scope: 'lifetime', ...lifetime });
      }
    } else if (command === 'llm' && subcommand === 'adjust-thresholds') {
      let rawConfig = {};
      try { rawConfig = configLoad(planningDir) || {}; } catch (_e) { /* use defaults */ }
      const llmConfig = resolveConfig(rawConfig.local_llm);
      const currentThreshold = llmConfig.advanced.confidence_threshold;
      const suggestions = computeThresholdAdjustments(planningDir, currentThreshold);
      output(suggestions.length > 0
        ? { suggestions }
        : { suggestions: [], message: 'Not enough shadow samples yet (need >= 20 per operation)' });
    // --- Compound init commands ---
    } else if (command === "init" && subcommand === "execute-phase") {
      const phase = args[2];
      if (!phase) error("Usage: pbr-tools.js init execute-phase <phase-number>");
      output(initExecutePhase(phase));
    } else if (command === "init" && subcommand === "plan-phase") {
      const phase = args[2];
      if (!phase) error("Usage: pbr-tools.js init plan-phase <phase-number>");
      output(initPlanPhase(phase));
    } else if (command === "init" && subcommand === "quick") {
      const desc = args.slice(2).join(" ") || "";
      output(initQuick(desc));
    } else if (command === "init" && subcommand === "verify-work") {
      const phase = args[2];
      if (!phase) error("Usage: pbr-tools.js init verify-work <phase-number>");
      output(initVerifyWork(phase));
    } else if (command === "init" && subcommand === "resume") {
      output(initResume());
    } else if (command === "init" && subcommand === "progress") {
      output(initProgress());
    } else if (command === 'state-bundle') {
      const phaseNum = args[1];
      if (!phaseNum) error('Usage: pbr-tools.js state-bundle <phase-number>');
      output(stateBundle(phaseNum));
    // --- State patch/advance/metric ---
    } else if (command === "state" && subcommand === "patch") {
      const jsonStr = args[2];
      if (!jsonStr) error("Usage: pbr-tools.js state patch JSON");
      output(statePatch(jsonStr));
    } else if (command === "state" && subcommand === "advance-plan") {
      output(stateAdvancePlan());
    } else if (command === "state" && subcommand === "record-metric") {
      output(stateRecordMetric(args.slice(2)));
    } else if (command === 'phase' && subcommand === 'add') {
      const slug = args[2];
      if (!slug) { error('Usage: phase add <slug> [--after <phase_num>]'); }
      const afterIdx = args.indexOf('--after');
      const afterPhase = afterIdx !== -1 ? args[afterIdx + 1] : null;
      output(phaseAdd(slug, afterPhase));
    } else if (command === 'phase' && subcommand === 'remove') {
      const phaseNum = args[2];
      if (!phaseNum) { error('Usage: phase remove <phase_num>'); }
      output(phaseRemove(phaseNum));
    } else if (command === 'phase' && subcommand === 'list') {
      output(phaseList());
    } else if (command === 'todo' && subcommand === 'list') {
      const opts = {};
      const themeIdx = args.indexOf('--theme');
      if (themeIdx !== -1 && args[themeIdx + 1]) opts.theme = args[themeIdx + 1];
      const statusIdx = args.indexOf('--status');
      if (statusIdx !== -1 && args[statusIdx + 1]) opts.status = args[statusIdx + 1];
      output(todoList(opts));
    } else if (command === 'todo' && subcommand === 'get') {
      const num = args[2];
      if (!num) error('Usage: pbr-tools.js todo get <NNN>');
      output(todoGet(num));
    } else if (command === 'todo' && subcommand === 'add') {
      const titleParts = [];
      const opts = {};
      // Parse: todo add <title words...> [--priority P1] [--theme security] [--source cli]
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--priority' && args[i + 1]) { opts.priority = args[++i]; }
        else if (args[i] === '--theme' && args[i + 1]) { opts.theme = args[++i]; }
        else if (args[i] === '--source' && args[i + 1]) { opts.source = args[++i]; }
        else { titleParts.push(args[i]); }
      }
      const title = titleParts.join(' ');
      if (!title) error('Usage: pbr-tools.js todo add <title> [--priority P1|P2|P3] [--theme <theme>]');
      output(todoAdd(title, opts));
    } else if (command === 'todo' && subcommand === 'done') {
      const num = args[2];
      if (!num) error('Usage: pbr-tools.js todo done <NNN>');
      output(todoDone(num));
    } else if (command === 'migrate') {
      const dryRun = args.includes('--dry-run');
      const force = args.includes('--force');
      const result = await migrate({ dryRun, force });
      output(result);
    } else if (command === 'learnings') {
      const subCmd = args[1];

      if (subCmd === 'ingest') {
        // learnings ingest <json-file-path>
        const jsonFile = args[2];
        if (!jsonFile) { error('Usage: learnings ingest <json-file>'); process.exit(1); }
        const raw = fs.readFileSync(jsonFile, 'utf8');
        const entry = JSON.parse(raw);
        const result = _learningsIngest(entry);
        output(result);

      } else if (subCmd === 'query') {
        // learnings query [--tags tag1,tag2] [--min-confidence low|medium|high] [--stack react] [--type tech-pattern]
        const filters = {};
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[++i].split(',').map(t => t.trim()); }
          else if (args[i] === '--min-confidence' && args[i + 1]) { filters.minConfidence = args[++i]; }
          else if (args[i] === '--stack' && args[i + 1]) { filters.stack = args[++i]; }
          else if (args[i] === '--type' && args[i + 1]) { filters.type = args[++i]; }
        }
        const results = _learningsQuery(filters);
        output(results);

      } else if (subCmd === 'check-thresholds') {
        // learnings check-thresholds — for progress-tracker to call
        const triggered = _checkDeferralThresholds();
        output(triggered);

      } else {
        error('Usage: learnings <ingest|query|check-thresholds>');
        process.exit(1);
      }
    } else if (command === 'spot-check') {
      // spot-check <phaseSlug> <planId>
      // Returns JSON: { ok, summary_exists, key_files_checked, commits_present, detail }
      const phaseSlug = args[1];
      const planId = args[2];
      if (!phaseSlug || !planId) {
        error('Usage: spot-check <phaseSlug> <planId>');
      }
      output(spotCheck(phaseSlug, planId));
    } else if (command === 'staleness-check') {
      const slug = args[1];
      if (!slug) { error('Usage: staleness-check <phase-slug>'); process.exit(1); }
      output(stalenessCheck(slug));
    } else if (command === 'summary-gate') {
      const [slug, planId] = args.slice(1);
      if (!slug || !planId) { error('Usage: summary-gate <phase-slug> <plan-id>'); process.exit(1); }
      output(summaryGate(slug, planId));
    } else if (command === 'checkpoint') {
      const sub = args[1];
      const slug = args[2];
      if (sub === 'init') {
        const plans = args[3] || '';
        output(checkpointInit(slug, plans));
      } else if (sub === 'update') {
        const waveIdx = args.indexOf('--wave');
        const wave = waveIdx !== -1 ? parseInt(args[waveIdx + 1], 10) : 1;
        const resolvedIdx = args.indexOf('--resolved');
        const resolved = resolvedIdx !== -1 ? args[resolvedIdx + 1] : '';
        const shaIdx = args.indexOf('--sha');
        const sha = shaIdx !== -1 ? args[shaIdx + 1] : '';
        output(checkpointUpdate(slug, { wave, resolved, sha }));
      } else {
        error('Usage: checkpoint init|update <phase-slug> [options]'); process.exit(1);
      }
    } else if (command === 'seeds') {
      const sub = args[1];
      if (sub === 'match') {
        const slug = args[2];
        const num = args[3];
        if (!slug) { error('Usage: seeds match <phase-slug> <phase-number>'); process.exit(1); }
        output(seedsMatch(slug, num));
      } else {
        error('Usage: seeds match <phase-slug> <phase-number>'); process.exit(1);
      }
    } else if (command === 'context-triage') {
      const options = {};
      const agentsIdx = args.indexOf('--agents-done');
      if (agentsIdx !== -1) options.agentsDone = parseInt(args[agentsIdx + 1], 10);
      const plansIdx = args.indexOf('--plans-total');
      if (plansIdx !== -1) options.plansTotal = parseInt(args[plansIdx + 1], 10);
      const stepIdx = args.indexOf('--step');
      if (stepIdx !== -1) options.currentStep = args[stepIdx + 1];
      output(contextTriage(options));
    } else if (command === 'reference') {
      const name = args[1];
      if (!name) error('Usage: pbr-tools.js reference <name> [--section <heading>] [--list]');
      const listFlag = args.includes('--list');
      const sectionIdx = args.indexOf('--section');
      const section = sectionIdx !== -1 ? args.slice(sectionIdx + 1).join(' ') : null;
      output(referenceGet(name, { section: section, list: listFlag }));
    } else if (command === 'milestone-stats') {
      const version = args[1];
      if (!version) error('Usage: pbr-tools.js milestone-stats <version>');
      output(milestoneStats(version));
    } else if (command === 'validate-project') {
      output(validateProject());
    } else {
      error(`Unknown command: ${args.join(' ')}\nCommands: state load|check-progress|update|patch|advance-plan|record-metric, config validate|load-defaults|save-defaults|resolve-depth, validate-project, migrate [--dry-run] [--force], init execute-phase|plan-phase|quick|verify-work|resume|progress, state-bundle <phase>, plan-index, frontmatter, must-haves, phase-info, phase add|remove|list, roadmap update-status|update-plans, history append|load, todo list|get|add|done, event, llm health|status|classify|score-source|classify-error|summarize|metrics [--session <ISO>]|adjust-thresholds, learnings ingest|query|check-thresholds, milestone-stats <version>, context-triage [--agents-done N] [--plans-total N] [--step NAME]`);
    }
  } catch (e) {
    error(e.message);
  }
}

if (require.main === module || process.argv[1] === __filename) { main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); }); }
module.exports = { KNOWN_AGENTS, initExecutePhase, initPlanPhase, initQuick, initVerifyWork, initResume, initProgress, initStateBundle: stateBundle, stateBundle, statePatch, stateAdvancePlan, stateRecordMetric, parseStateMd, parseRoadmapMd, parseYamlFrontmatter, parseMustHaves, countMustHaves, stateLoad, stateCheckProgress, configLoad, configClearCache, configValidate, lockedFileUpdate, planIndex, determinePhaseStatus, findFiles, atomicWrite, tailLines, frontmatter, mustHavesCollect, phaseInfo, stateUpdate, roadmapUpdateStatus, roadmapUpdatePlans, updateLegacyStateField, updateFrontmatterField, updateTableRow, findRoadmapRow, resolveDepthProfile, DEPTH_PROFILE_DEFAULTS, historyAppend, historyLoad, VALID_STATUS_TRANSITIONS, validateStatusTransition, writeActiveSkill, validateProject, phaseAdd, phaseRemove, phaseList, loadUserDefaults, saveUserDefaults, mergeUserDefaults, USER_DEFAULTS_PATH, todoList, todoGet, todoAdd, todoDone, migrate, spotCheck, referenceGet, milestoneStats, contextTriage, stalenessCheck, summaryGate, checkpointInit, checkpointUpdate, seedsMatch };
// NOTE: validateProject, phaseAdd, phaseRemove, phaseList were previously CLI-only (not exported).
// They are now exported for testability. This is additive and backwards-compatible.

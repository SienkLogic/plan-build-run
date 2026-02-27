#!/usr/bin/env node

/**
 * pbr-tools.js — Structured JSON state operations for Plan-Build-Run skills.
 *
 * Provides read-only commands that return JSON, replacing LLM-based text parsing
 * of STATE.md, ROADMAP.md, and config.json. Skills call this via:
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
 *   llm metrics [--session <ISO>]        — Lifetime or session-scoped LLM usage metrics
 */

const fs = require('fs');
const path = require('path');
const { resolveConfig, checkHealth } = require('./local-llm/health');
const { classifyArtifact } = require('./local-llm/operations/classify-artifact');
const { scoreSource } = require('./local-llm/operations/score-source');
const { classifyError } = require('./local-llm/operations/classify-error');
const { summarizeContext } = require('./local-llm/operations/summarize-context');

/**
 * Canonical list of known PBR agent types.
 * Imported by validate-task.js and check-subagent-output.js to avoid drift.
 */
const KNOWN_AGENTS = [
  'researcher',
  'planner',
  'plan-checker',
  'executor',
  'verifier',
  'integration-checker',
  'debugger',
  'codebase-mapper',
  'synthesizer',
  'general',
  'audit',
  'dev-sync'
];

const { readSessionMetrics, summarizeMetrics, computeLifetimeMetrics } = require('./local-llm/metrics');
const { computeThresholdAdjustments } = require('./local-llm/threshold-tuner');

let cwd = process.cwd();
let planningDir = path.join(cwd, '.planning');

// --- Phase status transition state machine ---

/**
 * Valid phase status transitions. Each key is a current status, and its value
 * is an array of statuses that are legal to transition to. This is advisory —
 * invalid transitions produce a stderr warning but are not blocked, to avoid
 * breaking existing workflows.
 *
 * State machine:
 *   pending -> planned, skipped
 *   planned -> building
 *   building -> built, partial, needs_fixes
 *   built -> verified, needs_fixes
 *   partial -> building, needs_fixes
 *   verified -> building (re-execution)
 *   needs_fixes -> planned, building
 *   skipped -> pending (unskip)
 */
const VALID_STATUS_TRANSITIONS = {
  pending:     ['planned', 'skipped'],
  planned:     ['building'],
  building:    ['built', 'partial', 'needs_fixes'],
  built:       ['verified', 'needs_fixes'],
  partial:     ['building', 'needs_fixes'],
  verified:    ['building'],
  needs_fixes: ['planned', 'building'],
  skipped:     ['pending']
};

/**
 * Check whether a phase status transition is valid according to the state machine.
 * Returns { valid, warning? } — never blocks, only advises.
 *
 * @param {string} oldStatus - Current phase status
 * @param {string} newStatus - Desired phase status
 * @returns {{ valid: boolean, warning?: string }}
 */
function validateStatusTransition(oldStatus, newStatus) {
  const from = (oldStatus || '').trim().toLowerCase();
  const to = (newStatus || '').trim().toLowerCase();

  // If the status isn't changing, that's always fine
  if (from === to) {
    return { valid: true };
  }

  // If the old status is unknown to our map, we can't validate — allow it
  if (!VALID_STATUS_TRANSITIONS[from]) {
    return { valid: true };
  }

  const allowed = VALID_STATUS_TRANSITIONS[from];
  if (allowed.includes(to)) {
    return { valid: true };
  }

  return {
    valid: false,
    warning: `Suspicious status transition: "${from}" -> "${to}". Expected one of: [${allowed.join(', ')}]. Proceeding anyway (advisory).`
  };
}

// --- Cached config loader ---

let _configCache = null;
let _configMtime = 0;
let _configPath = null;

/**
 * Load config.json with in-process mtime-based caching.
 * Returns the parsed config object, or null if not found / parse error.
 * Cache invalidates when file mtime changes or path differs.
 *
 * @param {string} [dir] - Path to .planning directory (defaults to cwd/.planning)
 * @returns {object|null} Parsed config or null
 */
function configLoad(dir) {
  const configPath = path.join(dir || planningDir, 'config.json');
  try {
    if (!fs.existsSync(configPath)) return null;
    const stat = fs.statSync(configPath);
    const mtime = stat.mtimeMs;
    if (_configCache && mtime === _configMtime && configPath === _configPath) {
      return _configCache;
    }
    _configCache = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    _configMtime = mtime;
    _configPath = configPath;
    return _configCache;
  } catch (_e) {
    return null;
  }
}

/**
 * Clear the configLoad() in-process cache.
 * Useful in tests where multiple temp directories are used in rapid succession.
 */
function configClearCache() {
  _configCache = null;
  _configMtime = 0;
  _configPath = null;
  cwd = process.cwd();
  planningDir = path.join(cwd, '.planning');
}

/**
 * Read the last N lines from a file efficiently.
 * Reads the entire file but only parses (JSON.parse) the trailing entries.
 * For JSONL files where full parsing is expensive, this avoids parsing
 * all lines when you only need recent entries.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {number} n - Number of trailing lines to return
 * @returns {string[]} Array of raw line strings (last n lines)
 */
function tailLines(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return [];
    const lines = content.split('\n');
    if (lines.length <= n) return lines;
    return lines.slice(lines.length - n);
  } catch (_e) {
    return [];
  }
}

/**
 * Built-in depth profile defaults. These define the effective settings
 * for each depth level. User config.depth_profiles overrides these.
 */
const DEPTH_PROFILE_DEFAULTS = {
  quick: {
    'features.research_phase': false,
    'features.plan_checking': false,
    'features.goal_verification': false,
    'features.inline_verify': false,
    'scan.mapper_count': 2,
    'scan.mapper_areas': ['tech', 'arch'],
    'debug.max_hypothesis_rounds': 3
  },
  standard: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': false,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 5
  },
  comprehensive: {
    'features.research_phase': true,
    'features.plan_checking': true,
    'features.goal_verification': true,
    'features.inline_verify': true,
    'scan.mapper_count': 4,
    'scan.mapper_areas': ['tech', 'arch', 'quality', 'concerns'],
    'debug.max_hypothesis_rounds': 10
  }
};

/**
 * Resolve the effective depth profile for the current config.
 * Merges built-in defaults with any user overrides from config.depth_profiles.
 *
 * @param {object|null} config - Parsed config.json (from configLoad). If null, returns 'standard' defaults.
 * @returns {{ depth: string, profile: object }} The resolved depth name and flattened profile settings.
 */
function resolveDepthProfile(config) {
  const depth = (config && config.depth) || 'standard';
  const defaults = DEPTH_PROFILE_DEFAULTS[depth] || DEPTH_PROFILE_DEFAULTS.standard;

  // Merge user overrides if present
  const userOverrides = (config && config.depth_profiles && config.depth_profiles[depth]) || {};
  const profile = { ...defaults, ...userOverrides };

  return { depth, profile };
}


// --- Compound init commands (Phase 2) ---

function initExecutePhase(phaseNum) {
  const state = stateLoad();
  if (!state.exists) return { error: "No .planning/ directory found" };
  const phase = phaseInfo(phaseNum);
  if (phase.error) return { error: phase.error };
  const plans = planIndex(phaseNum);
  const config = configLoad() || {};
  const depthProfile = resolveDepthProfile(config);
  const models = config.models || {};
  let gitState = { branch: null, clean: null };
  try {
    const { execSync } = require("child_process");
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", timeout: 5000 }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf8", timeout: 5000 }).trim();
    gitState = { branch, clean: status === "" };
  } catch (_e) { /* not a git repo */ }
  return {
    executor_model: models.executor || "sonnet",
    verifier_model: models.verifier || "sonnet",
    config: { depth: depthProfile.depth, mode: config.mode || "interactive", parallelization: config.parallelization || { enabled: false }, planning: config.planning || {}, gates: config.gates || {}, features: config.features || {} },
    phase: { num: phaseNum, dir: phase.phase, name: phase.name, goal: phase.goal, has_context: phase.has_context, status: phase.filesystem_status, plan_count: phase.plan_count, completed: phase.completed },
    plans: (plans.plans || []).map(p => ({ file: p.file, plan_id: p.plan_id, wave: p.wave, autonomous: p.autonomous, has_summary: p.has_summary, must_haves_count: p.must_haves_count, depends_on: p.depends_on })),
    waves: plans.waves || {},
    branch_name: gitState.branch, git_clean: gitState.clean
  };
}

function initPlanPhase(phaseNum) {
  const state = stateLoad();
  if (!state.exists) return { error: "No .planning/ directory found" };
  const config = configLoad() || {};
  const models = config.models || {};
  const depthProfile = resolveDepthProfile(config);
  const phasesDir = path.join(planningDir, "phases");
  const paddedPhase = String(phaseNum).padStart(2, "0");
  let existingArtifacts = [], phaseDirName = null;
  if (fs.existsSync(phasesDir)) {
    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + "-"));
    if (dirs.length > 0) { phaseDirName = dirs[0]; existingArtifacts = fs.readdirSync(path.join(phasesDir, phaseDirName)).filter(f => f.endsWith(".md")); }
  }
  let phaseGoal = null, phaseDeps = null;
  if (state.roadmap && state.roadmap.phases) {
    const rp = state.roadmap.phases.find(p => p.number === paddedPhase);
    if (rp) { phaseGoal = rp.goal; phaseDeps = rp.depends_on; }
  }
  return {
    researcher_model: models.researcher || "sonnet", planner_model: models.planner || "sonnet", checker_model: models.planner || "sonnet",
    config: { depth: depthProfile.depth, profile: depthProfile.profile, features: config.features || {}, planning: config.planning || {} },
    phase: { num: phaseNum, dir: phaseDirName, goal: phaseGoal, depends_on: phaseDeps },
    existing_artifacts: existingArtifacts,
    workflow: { research_phase: (config.features || {}).research_phase !== false, plan_checking: (config.features || {}).plan_checking !== false }
  };
}

function initQuick(description) {
  const config = configLoad() || {};
  const quickDir = path.join(planningDir, "quick");
  let nextNum = 1;
  if (fs.existsSync(quickDir)) {
    const dirs = fs.readdirSync(quickDir).filter(d => /^\d{3}-/.test(d)).sort();
    if (dirs.length > 0) { nextNum = parseInt(dirs[dirs.length - 1].substring(0, 3), 10) + 1; }
  }
  const slug = (description || "task").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 30);
  const paddedNum = String(nextNum).padStart(3, "0");
  return {
    next_task_number: paddedNum, slug, dir: path.join(".planning", "quick", paddedNum + "-" + slug),
    dir_name: paddedNum + "-" + slug, timestamp: new Date().toISOString(),
    config: { depth: config.depth || "standard", mode: config.mode || "interactive", models: config.models || {}, planning: config.planning || {} }
  };
}

function initVerifyWork(phaseNum) {
  const phase = phaseInfo(phaseNum);
  if (phase.error) return { error: phase.error };
  const config = configLoad() || {};
  const models = config.models || {};
  let priorAttempts = 0;
  if (phase.verification) { priorAttempts = parseInt(phase.verification.attempt, 10) || 0; }
  return {
    verifier_model: models.verifier || "sonnet",
    phase: { num: phaseNum, dir: phase.phase, name: phase.name, goal: phase.goal, plan_count: phase.plan_count, completed: phase.completed },
    has_verification: !!phase.verification, prior_attempts: priorAttempts,
    prior_status: phase.verification ? (phase.verification.status || "unknown") : null,
    summaries: phase.summaries || []
  };
}

function initResume() {
  const state = stateLoad();
  if (!state.exists) return { error: "No .planning/ directory found" };
  let autoNext = null, continueHere = null, activeSkill = null;
  try { autoNext = fs.readFileSync(path.join(planningDir, ".auto-next"), "utf8").trim(); } catch (_e) { /* file not found */ }
  try { continueHere = fs.readFileSync(path.join(planningDir, ".continue-here"), "utf8").trim(); } catch (_e) { /* file not found */ }
  try { activeSkill = fs.readFileSync(path.join(planningDir, ".active-skill"), "utf8").trim(); } catch (_e) { /* file not found */ }
  return { state: state.state, auto_next: autoNext, continue_here: continueHere, active_skill: activeSkill, current_phase: state.current_phase, progress: state.progress };
}

function initProgress() {
  const state = stateLoad();
  if (!state.exists) return { error: "No .planning/ directory found" };
  const progress = stateCheckProgress();
  return { current_phase: state.current_phase, total_phases: state.phase_count, status: state.state ? state.state.status : null, phases: progress.phases, total_plans: progress.total_plans, completed_plans: progress.completed_plans, percentage: progress.percentage };
}

// --- State mutation extensions (Phase 2g-i) ---

function statePatch(jsonStr) {
  const statePath = path.join(planningDir, "STATE.md");
  if (!fs.existsSync(statePath)) return { success: false, error: "STATE.md not found" };
  let fields;
  try { fields = JSON.parse(jsonStr); } catch (_e) { return { success: false, error: "Invalid JSON" }; }
  const validFields = ["current_phase", "status", "plans_complete", "last_activity", "progress_percent", "phase_slug", "total_phases", "last_command", "blockers"];
  const updates = [], errors = [];
  for (const [field, value] of Object.entries(fields)) {
    if (!validFields.includes(field)) { errors.push("Unknown field: " + field); continue; }
    try { stateUpdate(field, String(value)); updates.push(field); } catch (e) { errors.push(field + ": " + e.message); }
  }
  return { success: errors.length === 0, updated: updates, errors: errors.length > 0 ? errors : undefined };
}

function stateAdvancePlan() {
  const statePath = path.join(planningDir, "STATE.md");
  if (!fs.existsSync(statePath)) return { success: false, error: "STATE.md not found" };
  const stateContent = fs.readFileSync(statePath, "utf8");
  const planMatch = stateContent.match(/Plan:\s*(\d+)\s+of\s+(\d+)/);
  if (!planMatch) return { success: false, error: "Could not find Plan: N of M in STATE.md" };
  const current = parseInt(planMatch[1], 10), total = parseInt(planMatch[2], 10);
  const next = Math.min(current + 1, total);
  stateUpdate("plans_complete", String(next));
  const progressPct = total > 0 ? Math.round((next / total) * 100) : 0;
  stateUpdate("progress_percent", String(progressPct));
  return { success: true, previous_plan: current, current_plan: next, total_plans: total, progress_percent: progressPct };
}

function stateRecordMetric(metricArgs) {
  let duration = null, plansCompleted = null;
  for (let i = 0; i < metricArgs.length; i++) {
    if (metricArgs[i] === "--duration" && metricArgs[i + 1]) {
      const match = metricArgs[i + 1].match(/(\d+)(m|s|h)/);
      if (match) { const val = parseInt(match[1], 10); const unit = match[2]; duration = unit === "h" ? val * 60 : unit === "s" ? Math.round(val / 60) : val; }
      i++;
    } else if (metricArgs[i] === "--plans-completed" && metricArgs[i + 1]) {
      plansCompleted = parseInt(metricArgs[i + 1], 10); i++;
    }
  }
  const parts = [];
  if (duration !== null) parts.push("duration: " + duration + "m");
  if (plansCompleted !== null) parts.push("plans_completed: " + plansCompleted);
  if (parts.length > 0) historyAppend({ type: "metric", title: "Session metric", body: parts.join(", ") });
  stateUpdate("last_activity", "now");
  return { success: true, duration_minutes: duration, plans_completed: plansCompleted };
}

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
        error('Usage: pbr-tools.js state update <field> <value>\nFields: current_phase, status, plans_complete, last_activity');
      }
      output(stateUpdate(field, value));
    } else if (command === 'config' && subcommand === 'validate') {
      output(configValidate());
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
    // --- State patch/advance/metric ---
    } else if (command === "state" && subcommand === "patch") {
      const jsonStr = args[2];
      if (!jsonStr) error("Usage: pbr-tools.js state patch JSON");
      output(statePatch(jsonStr));
    } else if (command === "state" && subcommand === "advance-plan") {
      output(stateAdvancePlan());
    } else if (command === "state" && subcommand === "record-metric") {
      output(stateRecordMetric(args.slice(2)));
    } else {
      error(`Unknown command: ${args.join(' ')}\nCommands: state load|check-progress|update|patch|advance-plan|record-metric, config validate, init execute-phase|plan-phase|quick|verify-work|resume|progress, plan-index, frontmatter, must-haves, phase-info, roadmap update-status|update-plans, history append|load, event, llm health|status|classify|score-source|classify-error|summarize|metrics [--session <ISO>]|adjust-thresholds`);
    }
  } catch (e) {
    error(e.message);
  }
}

// --- Commands ---

function stateLoad() {
  const result = {
    exists: false,
    config: null,
    state: null,
    roadmap: null,
    phase_count: 0,
    current_phase: null,
    progress: null
  };

  if (!fs.existsSync(planningDir)) {
    return result;
  }
  result.exists = true;

  // Load config.json
  const configPath = path.join(planningDir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      result.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_) {
      result.config = { _error: 'Failed to parse config.json' };
    }
  }

  // Load STATE.md
  const statePath = path.join(planningDir, 'STATE.md');
  if (fs.existsSync(statePath)) {
    const content = fs.readFileSync(statePath, 'utf8');
    result.state = parseStateMd(content);
  }

  // Load ROADMAP.md
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const content = fs.readFileSync(roadmapPath, 'utf8');
    result.roadmap = parseRoadmapMd(content);
    result.phase_count = result.roadmap.phases.length;
  }

  // Extract current phase
  if (result.state && result.state.current_phase) {
    result.current_phase = result.state.current_phase;
  }

  // Calculate progress
  result.progress = calculateProgress();

  return result;
}

function stateCheckProgress() {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { phases: [], total_plans: 0, completed_plans: 0, percentage: 0 };
  }

  const phases = [];
  let totalPlans = 0;
  let completedPlans = 0;

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const phaseDir = path.join(phasesDir, entry.name);
    const plans = findFiles(phaseDir, /-PLAN\.md$/);
    const summaries = findFiles(phaseDir, /^SUMMARY-.*\.md$/);
    const verification = fs.existsSync(path.join(phaseDir, 'VERIFICATION.md'));

    const completedSummaries = summaries.filter(s => {
      const content = fs.readFileSync(path.join(phaseDir, s), 'utf8');
      return /status:\s*["']?complete/i.test(content);
    });

    const phaseInfo = {
      directory: entry.name,
      plans: plans.length,
      summaries: summaries.length,
      completed: completedSummaries.length,
      has_verification: verification,
      status: determinePhaseStatus(plans.length, completedSummaries.length, summaries.length, verification, phaseDir)
    };

    phases.push(phaseInfo);
    totalPlans += plans.length;
    completedPlans += completedSummaries.length;
  }

  return {
    phases,
    total_plans: totalPlans,
    completed_plans: completedPlans,
    percentage: totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0
  };
}

function planIndex(phaseNum) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  // Find phase directory matching the number
  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  const planFiles = findFiles(fullDir, /-PLAN\.md$/);

  const plans = [];
  const waves = {};

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const frontmatter = parseYamlFrontmatter(content);

    const plan = {
      file,
      plan_id: frontmatter.plan || file.replace(/-PLAN\.md$/, ''),
      wave: parseInt(frontmatter.wave, 10) || 1,
      type: frontmatter.type || 'unknown',
      autonomous: frontmatter.autonomous !== false,
      depends_on: frontmatter.depends_on || [],
      gap_closure: frontmatter.gap_closure || false,
      has_summary: fs.existsSync(path.join(fullDir, `SUMMARY-${frontmatter.plan || ''}.md`)),
      must_haves_count: countMustHaves(frontmatter.must_haves)
    };

    plans.push(plan);

    const waveKey = `wave_${plan.wave}`;
    if (!waves[waveKey]) waves[waveKey] = [];
    waves[waveKey].push(plan.plan_id);
  }

  return {
    phase: phaseDir.name,
    total_plans: plans.length,
    plans,
    waves
  };
}

function configValidate(preloadedConfig) {
  let config;
  if (preloadedConfig) {
    config = preloadedConfig;
  } else {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      return { valid: false, errors: ['config.json not found'], warnings: [] };
    }

    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return { valid: false, errors: [`config.json is not valid JSON: ${e.message}`], warnings: [] };
    }
  }

  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'config-schema.json'), 'utf8'));
  const warnings = [];
  const errors = [];

  validateObject(config, schema, '', errors, warnings);

  // Semantic conflict detection — logical contradictions that pass schema validation
  // Clear contradictions → errors; ambiguous/preference issues → warnings
  if (config.mode === 'autonomous' && config.gates) {
    const activeGates = Object.entries(config.gates || {}).filter(([, v]) => v === true).map(([k]) => k);
    if (activeGates.length > 0) {
      errors.push(`mode=autonomous with active gates (${activeGates.join(', ')}): gates are unreachable in autonomous mode`);
    }
  }
  if (config.features && config.features.auto_continue && config.mode === 'interactive') {
    warnings.push('features.auto_continue=true with mode=interactive: auto_continue only fires in autonomous mode');
  }
  if (config.parallelization) {
    if (config.parallelization.enabled === false && config.parallelization.plan_level === true) {
      warnings.push('parallelization.enabled=false with plan_level=true: plan_level is ignored when parallelization is disabled');
    }
    if (config.parallelization.max_concurrent_agents === 1 && config.teams && config.teams.coordination) {
      errors.push('parallelization.max_concurrent_agents=1 with teams.coordination set: teams require concurrent agents to be useful');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// --- New read-only commands ---

/**
 * Parse a markdown file's YAML frontmatter and return as JSON.
 * Wraps parseYamlFrontmatter() + parseMustHaves().
 */
function frontmatter(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { error: `File not found: ${resolved}` };
  }
  const content = fs.readFileSync(resolved, 'utf8');
  return parseYamlFrontmatter(content);
}

/**
 * Collect all must-haves from all PLAN.md files in a phase.
 * Returns per-plan grouping + flat deduplicated list + total count.
 */
function mustHavesCollect(phaseNum) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  const planFiles = findFiles(fullDir, /-PLAN\.md$/);

  const perPlan = {};
  const allTruths = new Set();
  const allArtifacts = new Set();
  const allKeyLinks = new Set();

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const fm = parseYamlFrontmatter(content);
    const planId = fm.plan || file.replace(/-PLAN\.md$/, '');
    const mh = fm.must_haves || { truths: [], artifacts: [], key_links: [] };

    perPlan[planId] = mh;
    (mh.truths || []).forEach(t => allTruths.add(t));
    (mh.artifacts || []).forEach(a => allArtifacts.add(a));
    (mh.key_links || []).forEach(k => allKeyLinks.add(k));
  }

  const all = {
    truths: [...allTruths],
    artifacts: [...allArtifacts],
    key_links: [...allKeyLinks]
  };

  return {
    phase: phaseDir.name,
    plans: perPlan,
    all,
    total: all.truths.length + all.artifacts.length + all.key_links.length
  };
}

/**
 * Comprehensive single-phase status combining roadmap, filesystem, and plan data.
 */
function phaseInfo(phaseNum) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);

  // Get roadmap info
  let roadmapInfo = null;
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
    const roadmap = parseRoadmapMd(roadmapContent);
    roadmapInfo = roadmap.phases.find(p => p.number === phaseNum.padStart(2, '0')) || null;
  }

  // Get plan index
  const plans = planIndex(phaseNum);

  // Check for verification
  const verificationPath = path.join(fullDir, 'VERIFICATION.md');
  let verification = null;
  if (fs.existsSync(verificationPath)) {
    const vContent = fs.readFileSync(verificationPath, 'utf8');
    verification = parseYamlFrontmatter(vContent);
  }

  // Check summaries
  const summaryFiles = findFiles(fullDir, /^SUMMARY-.*\.md$/);
  const summaries = summaryFiles.map(f => {
    const content = fs.readFileSync(path.join(fullDir, f), 'utf8');
    const fm = parseYamlFrontmatter(content);
    return { file: f, plan: fm.plan || f.replace(/^SUMMARY-|\.md$/g, ''), status: fm.status || 'unknown' };
  });

  // Determine filesystem status
  const planCount = plans.total_plans || 0;
  const completedCount = summaries.filter(s => s.status === 'complete').length;
  const hasVerification = fs.existsSync(verificationPath);
  const fsStatus = determinePhaseStatus(planCount, completedCount, summaryFiles.length, hasVerification, fullDir);

  return {
    phase: phaseDir.name,
    name: roadmapInfo ? roadmapInfo.name : phaseDir.name.replace(/^\d+-/, ''),
    goal: roadmapInfo ? roadmapInfo.goal : null,
    roadmap_status: roadmapInfo ? roadmapInfo.status : null,
    filesystem_status: fsStatus,
    plans: plans.plans || [],
    plan_count: planCount,
    summaries,
    completed: completedCount,
    verification,
    has_context: fs.existsSync(path.join(fullDir, 'CONTEXT.md'))
  };
}

// --- Mutation commands ---

/**
 * Atomically update a field in STATE.md using lockedFileUpdate.
 * Supports both legacy and frontmatter (v2) formats.
 *
 * @param {string} field - One of: current_phase, status, plans_complete, last_activity
 * @param {string} value - New value (use 'now' for last_activity to auto-timestamp)
 */
function stateUpdate(field, value) {
  const statePath = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    return { success: false, error: 'STATE.md not found' };
  }

  const validFields = ['current_phase', 'status', 'plans_complete', 'last_activity'];
  if (!validFields.includes(field)) {
    return { success: false, error: `Invalid field: ${field}. Valid fields: ${validFields.join(', ')}` };
  }

  // Auto-timestamp
  if (field === 'last_activity' && value === 'now') {
    value = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  const result = lockedFileUpdate(statePath, (content) => {
    const fm = parseYamlFrontmatter(content);
    if (fm.version === 2 || fm.current_phase !== undefined) {
      return updateFrontmatterField(content, field, value);
    }
    return updateLegacyStateField(content, field, value);
  });

  if (result.success) {
    return { success: true, field, value };
  }
  return { success: false, error: result.error };
}

/**
 * Append a record to HISTORY.md. Creates the file if it doesn't exist.
 * Each entry is a markdown section appended at the end.
 *
 * @param {object} entry - { type: 'milestone'|'phase', title: string, body: string }
 * @param {string} [dir] - Path to .planning directory (defaults to cwd/.planning)
 * @returns {{success: boolean, error?: string}}
 */
function historyAppend(entry, dir) {
  const historyPath = path.join(dir || planningDir, 'HISTORY.md');
  const timestamp = new Date().toISOString().slice(0, 10);

  let header = '';
  if (!fs.existsSync(historyPath)) {
    header = '# Project History\n\nCompleted milestones and phase records. This file is append-only.\n\n';
  }

  const section = `${header}## ${entry.type === 'milestone' ? 'Milestone' : 'Phase'}: ${entry.title}\n_Completed: ${timestamp}_\n\n${entry.body.trim()}\n\n---\n\n`;

  try {
    fs.appendFileSync(historyPath, section, 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Load HISTORY.md and parse it into structured records.
 * Returns null if HISTORY.md doesn't exist.
 *
 * @param {string} [dir] - Path to .planning directory
 * @returns {object|null} { records: [{type, title, date, body}], line_count }
 */
function historyLoad(dir) {
  const historyPath = path.join(dir || planningDir, 'HISTORY.md');
  if (!fs.existsSync(historyPath)) return null;

  const content = fs.readFileSync(historyPath, 'utf8');
  const records = [];
  const sectionRegex = /^## (Milestone|Phase): (.+)\n_Completed: (\d{4}-\d{2}-\d{2})_\n\n([\s\S]*?)(?=\n---|\s*$)/gm;

  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    records.push({
      type: match[1].toLowerCase(),
      title: match[2].trim(),
      date: match[3],
      body: match[4].trim()
    });
  }

  return {
    records,
    line_count: content.split('\n').length
  };
}

/**
 * Update the Status column for a phase in ROADMAP.md's Phase Overview table.
 */
function roadmapUpdateStatus(phaseNum, newStatus) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldStatus = null;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content; // No matching row found
    }
    const parts = lines[rowIdx].split('|');
    oldStatus = parts[6] ? parts[6].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 5, newStatus);
    return lines.join('\n');
  });

  if (!oldStatus) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  // Advisory transition validation — warn on suspicious transitions but don't block
  const transition = validateStatusTransition(oldStatus, newStatus);
  if (!transition.valid && transition.warning) {
    process.stderr.write(`[pbr-tools] WARNING: ${transition.warning}\n`);
  }

  if (result.success) {
    const response = { success: true, old_status: oldStatus, new_status: newStatus };
    if (!transition.valid) {
      response.transition_warning = transition.warning;
    }
    return response;
  }
  return { success: false, error: result.error };
}

/**
 * Update the Plans column for a phase in ROADMAP.md's Phase Overview table.
 */
function roadmapUpdatePlans(phaseNum, complete, total) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldPlans = null;
  const newPlans = `${complete}/${total}`;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content;
    }
    const parts = lines[rowIdx].split('|');
    oldPlans = parts[4] ? parts[4].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 3, newPlans);
    return lines.join('\n');
  });

  if (!oldPlans) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  if (result.success) {
    return { success: true, old_plans: oldPlans, new_plans: newPlans };
  }
  return { success: false, error: result.error };
}

// --- Mutation helpers ---

/**
 * Update a field in legacy (non-frontmatter) STATE.md content.
 * Pure function: content in, content out.
 */
function updateLegacyStateField(content, field, value) {
  const lines = content.split('\n');

  switch (field) {
    case 'current_phase': {
      const idx = lines.findIndex(l => /Phase:\s*\d+\s+of\s+\d+/.test(l));
      if (idx !== -1) {
        lines[idx] = lines[idx].replace(/(Phase:\s*)\d+/, (_, prefix) => `${prefix}${value}`);
      }
      break;
    }
    case 'status': {
      const idx = lines.findIndex(l => /^Status:/i.test(l));
      if (idx !== -1) {
        lines[idx] = `Status: ${value}`;
      } else {
        const phaseIdx = lines.findIndex(l => /Phase:/.test(l));
        if (phaseIdx !== -1) {
          lines.splice(phaseIdx + 1, 0, `Status: ${value}`);
        } else {
          lines.push(`Status: ${value}`);
        }
      }
      break;
    }
    case 'plans_complete': {
      const idx = lines.findIndex(l => /Plan:\s*\d+\s+of\s+\d+/.test(l));
      if (idx !== -1) {
        lines[idx] = lines[idx].replace(/(Plan:\s*)\d+/, (_, prefix) => `${prefix}${value}`);
      }
      break;
    }
    case 'last_activity': {
      const idx = lines.findIndex(l => /^Last Activity:/i.test(l));
      if (idx !== -1) {
        lines[idx] = `Last Activity: ${value}`;
      } else {
        const statusIdx = lines.findIndex(l => /^Status:/i.test(l));
        if (statusIdx !== -1) {
          lines.splice(statusIdx + 1, 0, `Last Activity: ${value}`);
        } else {
          lines.push(`Last Activity: ${value}`);
        }
      }
      break;
    }
  }

  return lines.join('\n');
}

/**
 * Update a field in YAML frontmatter content.
 * Pure function: content in, content out.
 */
function updateFrontmatterField(content, field, value) {
  const match = content.match(/^(---\s*\n)([\s\S]*?)(\n---)/);
  if (!match) return content;

  const before = match[1];
  let yaml = match[2];
  const after = match[3];
  const rest = content.slice(match[0].length);

  // Format value: integers stay bare, strings get quotes
  const isNum = /^\d+$/.test(String(value));
  const formatted = isNum ? value : `"${value}"`;

  const fieldRegex = new RegExp(`^(${field})\\s*:.*$`, 'm');
  if (fieldRegex.test(yaml)) {
    yaml = yaml.replace(fieldRegex, () => `${field}: ${formatted}`);
  } else {
    yaml = yaml + `\n${field}: ${formatted}`;
  }

  return before + yaml + after + rest;
}

/**
 * Find the row index of a phase in a ROADMAP.md table.
 * @returns {number} Line index or -1 if not found
 */
function findRoadmapRow(lines, phaseNum) {
  const paddedPhase = phaseNum.padStart(2, '0');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const parts = lines[i].split('|');
    if (parts.length < 3) continue;
    const phaseCol = parts[1] ? parts[1].trim() : '';
    if (phaseCol === paddedPhase) {
      return i;
    }
  }
  return -1;
}

/**
 * Update a specific column in a markdown table row.
 * @param {string} row - The full table row string (e.g., "| 01 | Setup | ... |")
 * @param {number} columnIndex - 0-based column index (Phase=0, Name=1, ..., Status=5)
 * @param {string} newValue - New cell value
 * @returns {string} Updated row
 */
function updateTableRow(row, columnIndex, newValue) {
  const parts = row.split('|');
  // parts[0] is empty (before first |), data starts at parts[1]
  const partIndex = columnIndex + 1;
  if (partIndex < parts.length) {
    parts[partIndex] = ` ${newValue} `;
  }
  return parts.join('|');
}

/**
 * Lightweight JSON Schema validator — supports type, enum, properties,
 * additionalProperties, minimum, maximum for the config schema.
 */
function validateObject(value, schema, prefix, errors, warnings) {
  if (schema.type && typeof value !== schema.type) {
    if (!(schema.type === 'integer' && typeof value === 'number' && Number.isInteger(value))) {
      errors.push(`${prefix || 'root'}: expected ${schema.type}, got ${typeof value}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${prefix || 'root'}: value "${value}" not in allowed values [${schema.enum.join(', ')}]`);
    return;
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${prefix || 'root'}: value ${value} is below minimum ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${prefix || 'root'}: value ${value} is above maximum ${schema.maximum}`);
  }

  if (schema.type === 'object' && schema.properties) {
    const knownKeys = new Set(Object.keys(schema.properties));

    for (const key of Object.keys(value)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (!knownKeys.has(key)) {
        if (schema.additionalProperties === false) {
          warnings.push(`${fullKey}: unrecognized key (possible typo?)`);
        }
        continue;
      }
      validateObject(value[key], schema.properties[key], fullKey, errors, warnings);
    }
  }
}

/**
 * Locked file update: read-modify-write with exclusive lockfile.
 * Prevents concurrent writes to STATE.md and ROADMAP.md.
 *
 * @param {string} filePath - Absolute path to the file to update
 * @param {function} updateFn - Receives current content, returns new content
 * @param {object} opts - Options: { retries: 3, retryDelayMs: 100, timeoutMs: 5000 }
 * @returns {object} { success, content?, error? }
 */
function lockedFileUpdate(filePath, updateFn, opts = {}) {
  const retries = opts.retries || 3;
  const retryDelayMs = opts.retryDelayMs || 100;
  const timeoutMs = opts.timeoutMs || 5000;
  const lockPath = filePath + '.lock';

  let lockFd = null;
  let lockAcquired = false;

  try {
    // Acquire lock with retries
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        lockFd = fs.openSync(lockPath, 'wx');
        lockAcquired = true;
        break;
      } catch (e) {
        if (e.code === 'EEXIST') {
          // Lock exists — check if stale (older than timeoutMs)
          try {
            const stats = fs.statSync(lockPath);
            if (Date.now() - stats.mtimeMs > timeoutMs) {
              // Stale lock — remove and retry
              fs.unlinkSync(lockPath);
              continue;
            }
          } catch (_statErr) {
            // Lock disappeared between check — retry
            continue;
          }

          if (attempt < retries - 1) {
            // Wait and retry
            const waitMs = retryDelayMs * (attempt + 1);
            const start = Date.now();
            while (Date.now() - start < waitMs) {
              // Busy wait (synchronous context)
            }
            continue;
          }
          return { success: false, error: `Could not acquire lock for ${path.basename(filePath)} after ${retries} attempts` };
        }
        throw e;
      }
    }

    if (!lockAcquired) {
      return { success: false, error: `Could not acquire lock for ${path.basename(filePath)}` };
    }

    // Write PID to lock file for debugging
    fs.writeSync(lockFd, `${process.pid}`);
    fs.closeSync(lockFd);
    lockFd = null;

    // Read current content
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    // Apply update
    const newContent = updateFn(content);

    // Write back atomically
    const writeResult = atomicWrite(filePath, newContent);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    return { success: true, content: newContent };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    // Close fd if still open
    try {
      if (lockFd !== null) fs.closeSync(lockFd);
    } catch (_e) { /* ignore */ }
    // Only release lock if we acquired it
    if (lockAcquired) {
      try {
        fs.unlinkSync(lockPath);
      } catch (_e) { /* ignore — may already be cleaned up */ }
    }
  }
}

// --- Parsers ---

function parseStateMd(content) {
  const result = {
    current_phase: null,
    phase_name: null,
    progress: null,
    status: null,
    line_count: content.split('\n').length,
    format: 'legacy' // 'legacy' or 'frontmatter'
  };

  // Check for YAML frontmatter (version 2 format)
  const frontmatter = parseYamlFrontmatter(content);
  if (frontmatter.version === 2 || frontmatter.current_phase !== undefined) {
    result.format = 'frontmatter';
    result.current_phase = frontmatter.current_phase || null;
    result.total_phases = frontmatter.total_phases || null;
    result.phase_name = frontmatter.phase_slug || frontmatter.phase_name || null;
    result.status = frontmatter.status || null;
    result.progress = frontmatter.progress_percent !== undefined ? frontmatter.progress_percent : null;
    result.plans_total = frontmatter.plans_total || null;
    result.plans_complete = frontmatter.plans_complete || null;
    result.last_activity = frontmatter.last_activity || null;
    result.last_command = frontmatter.last_command || null;
    result.blockers = frontmatter.blockers || [];
    return result;
  }

  // Legacy regex-based parsing (version 1 format, no frontmatter)
  // DEPRECATED (2026-02): v1 STATE.md format (no YAML frontmatter) is deprecated.
  // New projects should use v2 (frontmatter) format, generated by /pbr:setup.
  // v1 support will be removed in a future major version.
  process.stderr.write('[pbr] WARNING: STATE.md uses legacy v1 format. Run /pbr:setup to migrate to v2 format.\n');
  // Extract "Phase: N of M"
  const phaseMatch = content.match(/Phase:\s*(\d+)\s+of\s+(\d+)/);
  if (phaseMatch) {
    result.current_phase = parseInt(phaseMatch[1], 10);
    result.total_phases = parseInt(phaseMatch[2], 10);
  }

  // Extract phase name (line after "Phase:")
  const nameMatch = content.match(/--\s+(.+?)(?:\n|$)/);
  if (nameMatch) {
    result.phase_name = nameMatch[1].trim();
  }

  // Extract progress percentage
  const progressMatch = content.match(/(\d+)%/);
  if (progressMatch) {
    result.progress = parseInt(progressMatch[1], 10);
  }

  // Extract plan status
  const statusMatch = content.match(/Status:\s*(.+?)(?:\n|$)/i);
  if (statusMatch) {
    result.status = statusMatch[1].trim();
  }

  return result;
}

function parseRoadmapMd(content) {
  const result = { phases: [], has_progress_table: false };

  // Find Phase Overview table
  const overviewMatch = content.match(/## Phase Overview[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
  if (overviewMatch) {
    const rows = overviewMatch[0].split('\n').filter(r => r.includes('|'));
    // Skip header and separator rows
    for (let i = 2; i < rows.length; i++) {
      const cols = rows[i].split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        result.phases.push({
          number: cols[0],
          name: cols[1],
          goal: cols[2],
          plans: cols[3] || '',
          wave: cols[4] || '',
          status: cols[5] || 'pending'
        });
      }
    }
  }

  // Check for Progress table
  result.has_progress_table = /## Progress/.test(content);

  return result;
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};

  // Simple YAML parser for flat and basic nested values
  const lines = yaml.split('\n');
  let currentKey = null;

  for (const line of lines) {
    // Array item
    if (/^\s+-\s+/.test(line) && currentKey) {
      const val = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (!result[currentKey]) result[currentKey] = [];
      if (Array.isArray(result[currentKey])) {
        result[currentKey].push(val);
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let val = kvMatch[2].trim();

      if (val === '' || val === '|') {
        // Possible array or block follows
        continue;
      }

      // Handle arrays on same line: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        result[currentKey] = val.slice(1, -1).split(',')
          .map(v => v.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        continue;
      }

      // Clean quotes
      val = val.replace(/^["']|["']$/g, '');

      // Type coercion
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);

      result[currentKey] = val;
    }
  }

  // Handle must_haves as a nested object
  if (yaml.includes('must_haves:')) {
    result.must_haves = parseMustHaves(yaml);
  }

  return result;
}

function parseMustHaves(yaml) {
  const result = { truths: [], artifacts: [], key_links: [] };
  let section = null;

  const inMustHaves = yaml.split('\n');
  let collecting = false;

  for (const line of inMustHaves) {
    if (/^\s*must_haves:/.test(line)) {
      collecting = true;
      continue;
    }
    if (collecting) {
      if (/^\s{2}truths:/.test(line)) { section = 'truths'; continue; }
      if (/^\s{2}artifacts:/.test(line)) { section = 'artifacts'; continue; }
      if (/^\s{2}key_links:/.test(line)) { section = 'key_links'; continue; }
      if (/^\w/.test(line)) break; // New top-level key, stop

      if (section && /^\s+-\s+/.test(line)) {
        result[section].push(line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      }
    }
  }

  return result;
}

// --- Helpers ---

function findFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
  } catch (_) {
    return [];
  }
}

function determinePhaseStatus(planCount, completedCount, summaryCount, hasVerification, phaseDir) {
  if (planCount === 0) {
    // Check for CONTEXT.md (discussed only)
    if (fs.existsSync(path.join(phaseDir, 'CONTEXT.md'))) return 'discussed';
    return 'not_started';
  }
  if (completedCount === 0 && summaryCount === 0) return 'planned';
  if (completedCount < planCount) return 'building';
  if (!hasVerification) return 'built';
  // Check verification status
  try {
    const vContent = fs.readFileSync(path.join(phaseDir, 'VERIFICATION.md'), 'utf8');
    if (/status:\s*["']?passed/i.test(vContent)) return 'verified';
    if (/status:\s*["']?gaps_found/i.test(vContent)) return 'needs_fixes';
    return 'reviewed';
  } catch (_) {
    return 'built';
  }
}

function countMustHaves(mustHaves) {
  if (!mustHaves) return 0;
  return (mustHaves.truths || []).length +
    (mustHaves.artifacts || []).length +
    (mustHaves.key_links || []).length;
}

function calculateProgress() {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { total: 0, completed: 0, percentage: 0 };
  }

  let total = 0;
  let completed = 0;

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  for (const entry of entries) {
    const dir = path.join(phasesDir, entry.name);
    const plans = findFiles(dir, /-PLAN\.md$/);
    total += plans.length;

    const summaries = findFiles(dir, /^SUMMARY-.*\.md$/);
    for (const s of summaries) {
      const content = fs.readFileSync(path.join(dir, s), 'utf8');
      if (/status:\s*["']?complete/i.test(content)) completed++;
    }
  }

  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

function output(data) {
  process.stdout.write(JSON.stringify(data, null, 2));
  process.exit(0);
}

function error(msg) {
  process.stdout.write(JSON.stringify({ error: msg }));
  process.exit(1);
}

/**
 * Write content to a file atomically: write to .tmp, backup original to .bak,
 * rename .tmp over original. On failure, restore from .bak if available.
 *
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 * @returns {{success: boolean, error?: string}} Result
 */
function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';

  try {
    // 1. Write to temp file
    fs.writeFileSync(tmpPath, content, 'utf8');

    // 2. Backup original if it exists
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, bakPath);
      } catch (_e) {
        // Backup failure is non-fatal — proceed with rename
      }
    }

    // 3. Rename temp over original (atomic on most filesystems)
    fs.renameSync(tmpPath, filePath);

    return { success: true };
  } catch (e) {
    // Rename failed — try to restore from backup
    try {
      if (fs.existsSync(bakPath)) {
        fs.copyFileSync(bakPath, filePath);
      }
    } catch (_restoreErr) {
      // Restore also failed — nothing more we can do
    }

    // Clean up temp file if it still exists
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_cleanupErr) {
      // Best-effort cleanup
    }

    return { success: false, error: e.message };
  }
}

/**
 * Write .active-skill with OS-level mutual exclusion.
 * Uses a .active-skill.lock file with exclusive create (O_EXCL) to prevent
 * two sessions from racing on the same file.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {string} skillName - Skill name to write
 * @returns {{success: boolean, warning?: string}} Result
 */
function writeActiveSkill(planningDir, skillName) {
  const skillFile = path.join(planningDir, '.active-skill');
  const lockFile = skillFile + '.lock';
  const staleThresholdMs = 60 * 60 * 1000; // 60 minutes

  let lockFd = null;
  try {
    // Try exclusive create of lock file
    lockFd = fs.openSync(lockFile, 'wx');
    fs.writeSync(lockFd, `${process.pid}`);
    fs.closeSync(lockFd);
    lockFd = null;

    // Check for existing .active-skill from another session
    let warning = null;
    if (fs.existsSync(skillFile)) {
      try {
        const stats = fs.statSync(skillFile);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs < staleThresholdMs) {
          const existing = fs.readFileSync(skillFile, 'utf8').trim();
          warning = `.active-skill already set to "${existing}" (${Math.round(ageMs / 60000)}min ago). Overwriting — possible concurrent session.`;
        }
      } catch (_e) {
        // File disappeared between exists and stat — fine
      }
    }

    // Write the skill name
    fs.writeFileSync(skillFile, skillName, 'utf8');

    // Release lock
    try { fs.unlinkSync(lockFile); } catch (_e) { /* best effort */ }

    return { success: true, warning };
  } catch (e) {
    // Close fd if still open
    try { if (lockFd !== null) fs.closeSync(lockFd); } catch (_e) { /* ignore */ }

    if (e.code === 'EEXIST') {
      // Lock held by another process — check staleness
      try {
        const lockStats = fs.statSync(lockFile);
        const lockAgeMs = Date.now() - lockStats.mtimeMs;
        if (lockAgeMs > staleThresholdMs) {
          // Stale lock — force remove and retry once
          fs.unlinkSync(lockFile);
          return writeActiveSkill(planningDir, skillName);
        }
      } catch (_statErr) {
        // Lock disappeared — retry once
        return writeActiveSkill(planningDir, skillName);
      }
      return { success: false, warning: `.active-skill.lock held by another process. Another PBR session may be active.` };
    }

    // Other error — write without lock as fallback
    try {
      fs.writeFileSync(skillFile, skillName, 'utf8');
      return { success: true, warning: `Lock failed (${e.code}), wrote without lock` };
    } catch (writeErr) {
      return { success: false, warning: `Failed to write .active-skill: ${writeErr.message}` };
    }
  }
}

if (require.main === module || process.argv[1] === __filename) { main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); }); }
module.exports = { KNOWN_AGENTS, initExecutePhase, initPlanPhase, initQuick, initVerifyWork, initResume, initProgress, statePatch, stateAdvancePlan, stateRecordMetric, parseStateMd, parseRoadmapMd, parseYamlFrontmatter, parseMustHaves, countMustHaves, stateLoad, stateCheckProgress, configLoad, configClearCache, configValidate, lockedFileUpdate, planIndex, determinePhaseStatus, findFiles, atomicWrite, tailLines, frontmatter, mustHavesCollect, phaseInfo, stateUpdate, roadmapUpdateStatus, roadmapUpdatePlans, updateLegacyStateField, updateFrontmatterField, updateTableRow, findRoadmapRow, resolveDepthProfile, DEPTH_PROFILE_DEFAULTS, historyAppend, historyLoad, VALID_STATUS_TRANSITIONS, validateStatusTransition, writeActiveSkill };

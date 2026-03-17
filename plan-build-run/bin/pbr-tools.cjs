#!/usr/bin/env node

/**
 * PBR Tools -- CLI dispatcher for Plan-Build-Run workflow operations
 *
 * Thin dispatcher that imports from lib/ modules. All core logic lives in:
 *   lib/core.cjs       -- Foundation utilities (parsers, file ops, constants)
 *   lib/config.cjs     -- Config loading, validation, depth profiles
 *   lib/state.cjs      -- STATE.md operations (load, update, patch, advance)
 *   lib/roadmap.cjs    -- ROADMAP.md operations (parse, update status/plans)
 *   lib/phase.cjs      -- Phase operations (add, remove, list, info, plan-index)
 *   lib/init.cjs       -- Compound init commands (execute-phase, plan-phase, etc.)
 *   lib/history.cjs    -- History operations (append, load)
 *   lib/todo.cjs       -- Todo operations (list, get, add, done)
 *   lib/build.cjs      -- Build pipeline (staleness, gates, checkpoints, seeds, CI)
 *   lib/learnings.cjs  -- Learning ingestion, query, threshold checks
 *   lib/local-llm/     -- Local LLM operations (health, classify, score, summarize)
 *   lib/verify.cjs     -- Verification suite + consistency/health validation
 *   lib/frontmatter.cjs -- Frontmatter CRUD
 *   lib/commands.cjs   -- Standalone utility commands (commit, scaffold, etc.)
 *   lib/template.cjs   -- Template selection and fill
 *   lib/milestone.cjs  -- Milestone and requirements lifecycle
 *
 * Skills/agents call this via:
 *   node pbr-tools.cjs <command> [args] [--raw] [--cwd <path>]
 *
 * Environment: PBR_PROJECT_ROOT -- Override project root directory
 *
 * Commands:
 *
 * STATE OPERATIONS:
 *   state load                          Full project state as JSON
 *   state check-progress               Recalculate progress from filesystem
 *   state update <field> <value>        Atomically update a STATE.md field
 *   state get [section]                 Get STATE.md content or section
 *   state json                          Output STATE.md frontmatter as JSON
 *   state patch --field val ...         Batch update STATE.md fields
 *   state advance-plan                  Increment plan counter
 *   state record-metric --phase N       Record execution metrics
 *     --plan M --duration Xmin [--tasks N] [--files N]
 *   state update-progress               Recalculate progress bar
 *   state add-decision --summary "..."  Add decision to STATE.md
 *     [--phase N] [--rationale "..."] [--summary-file path] [--rationale-file path]
 *   state add-blocker --text "..."      Add blocker
 *   state resolve-blocker --text "..."  Remove blocker
 *   state record-session --stopped-at "..." [--resume-file path]
 *   state record-activity <description> Record activity in STATE.md
 *   state-bundle <phase>                Full state bundle for a phase
 *   state-snapshot                      Structured parse of STATE.md
 *
 * CONFIG OPERATIONS:
 *   config validate                     Validate config.json against schema
 *   config load-defaults                Load user defaults from home dir
 *   config save-defaults                Save current config as user defaults
 *   config resolve-depth [dir]          Resolve depth profile from config
 *   config get <key>                    Get a config value by dotted key
 *   config set <key> <value>            Set a config value
 *   config-ensure-section               Initialize .planning/config.json
 *   config-get <key>                    Legacy alias for config get
 *   config-set <key> <value>            Legacy alias for config set
 *
 * PHASE OPERATIONS:
 *   phase add <slug> [--after N] [--goal "..."] [--depends-on N]
 *   phase remove <N>                    Remove an empty phase directory
 *   phase list                          List all phase directories with status
 *   phase complete <N>                  Mark phase done, advance STATE.md
 *   phase insert <N> <slug> [--goal "..."] [--depends-on N]
 *   phase info <N>                      Comprehensive single-phase status
 *   phase commits-for <N>              Read phase manifest, output commits JSON
 *   phase first-last-commit <N>        Output first/last commit hashes
 *   phase next-decimal <phase>         Calculate next decimal phase number
 *   phases list [--type T] [--phase N] [--include-archived]
 *   phase-info <N>                     Alias for phase info
 *   phase-plan-index <phase>           Index plans with waves and status
 *   find-phase <phase>                 Find phase directory by number
 *   plan-index <phase>                 Plan inventory for a phase
 *   must-haves <phase>                 Collect all must-haves from phase plans
 *
 * ROADMAP OPERATIONS:
 *   roadmap get-phase <phase>          Extract phase section from ROADMAP.md
 *   roadmap analyze                    Full roadmap parse with disk status
 *   roadmap update-plan-progress <N>   Update progress table row from disk
 *   roadmap update-status <N> <status> Update phase status in ROADMAP.md
 *   roadmap update-plans <N> <c> <t>   Update phase plans in ROADMAP.md
 *   roadmap append-phase <slug> ...    Append new phase to roadmap
 *   roadmap remove-phase <N>           Remove phase from roadmap
 *   roadmap insert-phase <N> <slug>    Insert phase into roadmap
 *
 * INIT (COMPOUND COMMANDS):
 *   init execute-phase <phase>         All context for execute-phase workflow
 *   init plan-phase <phase>            All context for plan-phase workflow
 *   init new-project                   All context for new-project workflow
 *   init new-milestone                 All context for new-milestone workflow
 *   init quick <description>           All context for quick workflow
 *   init resume                        All context for resume-project workflow
 *   init verify-work <phase>           All context for verify-work workflow
 *   init phase-op <phase>              Generic phase operation context
 *   init todos [area]                  All context for todo workflows
 *   init milestone-op                  All context for milestone operations
 *   init map-codebase                  All context for map-codebase workflow
 *   init progress                      All context for progress workflow
 *
 * TODO OPERATIONS:
 *   todo list [--theme T] [--status S] List todos as JSON
 *   todo get <NNN>                     Get a specific todo by number
 *   todo add <title> [--priority P] [--theme T] [--source S]
 *   todo done <NNN>                    Mark a todo as complete
 *
 * HISTORY:
 *   history append <type> <title> [body]  Append record to STATE.md History
 *   history load                          Load history records as JSON
 *   history-digest                        Aggregate all SUMMARY.md data
 *
 * LEARNINGS:
 *   learnings ingest <json-file>          Ingest a learning entry
 *   learnings query [--tags X] [--min-confidence Y] [--stack S] [--type T]
 *   learnings check-thresholds            Check deferral trigger conditions
 *   learnings copy-global <path> <proj>   Copy cross_project LEARNINGS.md to ~/.claude/pbr-knowledge/
 *   learnings query-global [--tags X] [--project P]  Query global knowledge files
 *
 * NEGATIVE KNOWLEDGE:
 *   negative-knowledge record --title "..." --category <cat> --files "a,b" --what-tried "..." --why-failed "..."
 *   negative-knowledge query --files "path1,path2"
 *   negative-knowledge list [--category X] [--phase Y] [--status Z]
 *
 * INTEL OPERATIONS:
 *   intel query <term>                    Search intel files for a term
 *   intel update                          Trigger intel refresh (prints agent instructions)
 *   intel status                          Show staleness info for intel files
 *   intel diff                            Show changes since last full refresh
 *   intel snapshot                        Save refresh snapshot (.last-refresh.json)
 *   intel validate                        Validate all intel files for correctness
 *   intel extract-exports <filepath>      Extract exports from a JS/CJS file
 *   intel patch-meta <filepath>           Patch _meta.updated_at to current timestamp
 *
 * BUILD PIPELINE:
 *   staleness-check <phase-slug>          Check if phase plans are stale
 *   summary-gate <phase-slug> <plan-id>   Verify SUMMARY.md for a plan
 *   checkpoint init <slug> [--plans ids]  Initialize checkpoint manifest
 *   checkpoint update <slug> --wave N --resolved id [--sha hash]
 *   seeds match <slug> <phase-number>     Find matching seed files
 *   ci-poll <run-id> [--timeout <secs>]   Poll CI run status
 *   rollback <manifest-path>              Rollback from manifest
 *   build-preview <phase-slug>            Preview what build would do
 *
 * LLM OPERATIONS:
 *   llm health                            Check local LLM availability
 *   llm status                            Show LLM config status
 *   llm classify <PLAN|SUMMARY> <file>    Classify artifact via LLM
 *   llm score-source <url> <file>         Score a source via LLM
 *   llm classify-error <file> [agent]     Classify error via LLM
 *   llm summarize <file> [max-words]      Summarize context via LLM
 *   llm metrics [--session <ISO>]         LLM usage metrics
 *   llm adjust-thresholds                 Suggest threshold adjustments
 *
 * SESSION:
 *   session get <key> [--session-id <id>]
 *   session set <key> <value> [--session-id <id>]
 *   session clear [key] [--session-id <id>]
 *   session dump [--session-id <id>]
 *
 * CLAIMS:
 *   claim acquire <slug> --session-id <id> --skill <name>
 *   claim release <slug> --session-id <id>
 *   claim list
 *
 * VERIFICATION:
 *   verify plan-structure <file>       Check PLAN.md structure + tasks
 *   verify phase-completeness <phase>  Check all plans have summaries
 *   verify references <file>           Check @-refs + paths resolve
 *   verify commits <h1> [h2] ...      Batch verify commit hashes
 *   verify artifacts <plan-file>       Check must_haves.artifacts
 *   verify key-links <plan-file>       Check must_haves.key_links
 *   verify-summary <path>              Verify a SUMMARY.md file
 *   validate consistency               Check phase/roadmap sync
 *   validate health [--repair]         Check .planning/ integrity
 *   validate-project                   Comprehensive integrity check
 *
 * FRONTMATTER:
 *   frontmatter get <file> [--field k]
 *   frontmatter set <file> --field k --value v
 *   frontmatter merge <file> --data '{json}'
 *   frontmatter validate <file> --schema plan|summary|verification
 *   frontmatter <filepath>              Parse frontmatter (reference compat)
 *
 * TEMPLATES:
 *   template select <plan-path>        Select template type for a plan
 *   template fill summary|plan|verification --phase N [options]
 *
 * MILESTONES:
 *   milestone complete <version> [--name <name>] [--archive-phases]
 *   milestone stats <version>           Milestone statistics
 *   milestone-stats <version>           Alias for milestone stats
 *
 * REQUIREMENTS:
 *   requirements mark-complete <ids>   Mark requirement IDs as complete
 *   requirements update-status         Update REQ-ID checkboxes (--req-ids, --status done|reset)
 *   requirements mark-phase            Mark phase requirements (--phase-dir <path>)
 *   requirements status                Get all requirement statuses as JSON
 *
 * SCAFFOLDING:
 *   scaffold context|uat|verification|phase-dir --phase <N> [--name <name>]
 *
 * UTILITY:
 *   resolve-model <agent-type>         Get model for agent based on profile
 *   generate-slug <text>               Convert text to URL-safe slug
 *   slug-generate <text>              Alias for generate-slug
 *   quick init <description>          Create quick task directory + PLAN.md
 *   current-timestamp [format]         Get timestamp (full|date|filename)
 *   verify-path-exists <path>          Check file/directory existence
 *   summary-extract <path> [--fields]  Extract structured data from SUMMARY.md
 *   websearch <query> [--limit N] [--freshness day|week|month]
 *   progress [json|table|bar]          Render progress in various formats
 *   commit <message> [--files f1 f2]   Commit planning docs
 *   suggest-next                       Deterministic routing recommendation
 *
 * REFERENCE & SKILLS:
 *   reference <name> [--section heading] [--list]
 *   skill-section <skill> <section>
 *   skill-section --list <skill>
 *   step-verify <skill> <step> <checklist-json>
 *   context-triage [--agents-done N] [--plans-total N] [--step NAME]
 *   suggest-alternatives phase-not-found|missing-prereq|config-invalid [args]
 *   spot-check <phaseSlug> <planId>
 *
 * MIGRATION & EVENTS:
 *   migrate [--dry-run] [--force]      Run schema migrations
 *   event <category> <event> [details] Log an event
 *   tmux detect                         Detect tmux environment
 *
 * HELP:
 *   help                               Show this help message
 */

const fs = require('fs');
const path = require('path');

// ─── Module-level planningDir with MSYS path bridging ─────────────────────────

let cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
const msysMatch = cwd.match(/^\/([a-zA-Z])\/(.*)/);
if (msysMatch) cwd = msysMatch[1] + ':' + path.sep + msysMatch[2].replace(/\//g, path.sep);
let planningDir = path.join(cwd, '.planning');

// ─── Lazy module loaders ──────────────────────────────────────────────────────
// Each module is loaded on first use to minimize startup time

let _core, _config, _state, _phase, _roadmap, _init;
let _history, _todo, _learnings, _spotCheck, _build, _llm;
let _verify, _frontmatter, _commands, _template, _milestone;
let _reference, _skillSection, _stepVerify, _preview, _context;
let _alternatives, _migrate, _circuitState, _intel, _statusRender, _suggestNext, _parseArgs;
let _decisions;
let _negativeKnowledge;

function getCore() { if (!_core) _core = require('./lib/core.cjs'); return _core; }
function getConfig() { if (!_config) _config = require('./lib/config.cjs'); return _config; }
function getState() { if (!_state) _state = require('./lib/state.cjs'); return _state; }
function getPhase() { if (!_phase) _phase = require('./lib/phase.cjs'); return _phase; }
function getRoadmap() { if (!_roadmap) _roadmap = require('./lib/roadmap.cjs'); return _roadmap; }
function getInit() { if (!_init) _init = require('./lib/init.cjs'); return _init; }
function getHistory() { if (!_history) _history = require('./lib/history.cjs'); return _history; }
function getTodo() { if (!_todo) _todo = require('./lib/todo.cjs'); return _todo; }
function getLearnings() { if (!_learnings) _learnings = require('./lib/learnings.cjs'); return _learnings; }
function getSpotCheck() { if (!_spotCheck) _spotCheck = require('./lib/spot-check.cjs'); return _spotCheck; }
function getBuild() { if (!_build) _build = require('./lib/build.cjs'); return _build; }
function getLlm() { if (!_llm) _llm = require('./lib/local-llm/index.cjs'); return _llm; }
function getVerify() { if (!_verify) _verify = require('./lib/verify.cjs'); return _verify; }
function getFrontmatter() { if (!_frontmatter) _frontmatter = require('./lib/frontmatter.cjs'); return _frontmatter; }
function getCommands() { if (!_commands) _commands = require('./lib/commands.cjs'); return _commands; }
function getTemplate() { if (!_template) _template = require('./lib/template.cjs'); return _template; }
function getMilestone() { if (!_milestone) _milestone = require('./lib/milestone.cjs'); return _milestone; }
function getReference() { if (!_reference) _reference = require('./lib/reference.cjs'); return _reference; }
function getSkillSection() { if (!_skillSection) _skillSection = require('./lib/skill-section.cjs'); return _skillSection; }
function getStepVerify() { if (!_stepVerify) _stepVerify = require('./lib/step-verify.cjs'); return _stepVerify; }
function getPreview() { if (!_preview) _preview = require('./lib/preview.cjs'); return _preview; }
function getContext() { if (!_context) _context = require('./lib/context.cjs'); return _context; }
function getAlternatives() { if (!_alternatives) _alternatives = require('./lib/alternatives.cjs'); return _alternatives; }
function getMigrate() { if (!_migrate) _migrate = require('./lib/migrate.cjs'); return _migrate; }
function getIntel() { if (!_intel) _intel = require('./lib/intel.cjs'); return _intel; }
function getStatusRender() { if (!_statusRender) _statusRender = require('./lib/status-render.cjs'); return _statusRender; }
function getSuggestNext() { if (!_suggestNext) _suggestNext = require('./lib/suggest-next.cjs'); return _suggestNext; }
function getParseArgs() { if (!_parseArgs) _parseArgs = require('./lib/parse-args.cjs'); return _parseArgs; }
function getDecisions() { if (!_decisions) _decisions = require('./lib/decisions.cjs'); return _decisions; }
function getNegativeKnowledge() { if (!_negativeKnowledge) _negativeKnowledge = require('./lib/negative-knowledge.cjs'); return _negativeKnowledge; }

// ─── Helper: resolve plugin root ──────────────────────────────────────────────

function resolvePluginRoot() {
  const pluginRoot = process.env.PBR_PLUGIN_ROOT || path.resolve(__dirname, '..');
  let root = pluginRoot;
  const m = root.match(/^\/([a-zA-Z])\/(.*)/);
  if (m) root = m[1] + ':' + path.sep + m[2].replace(/\//g, path.sep);
  return root;
}

// ─── Wrapper functions (bridge planningDir to lib pure functions) ──────────────

function configLoad(dir) { return getConfig().configLoad(dir || planningDir); }
function configValidate(preloaded) { return getConfig().configValidate(preloaded, planningDir); }

function stateLoad() { return getState().stateLoad(planningDir); }
function stateCheckProgress() { return getState().stateCheckProgress(planningDir); }
function stateUpdate(field, value) { return getState().stateUpdate(field, value, planningDir); }
function statePatch(jsonStr) { return getState().statePatch(jsonStr, planningDir); }
function stateAdvancePlan() { return getState().stateAdvancePlan(planningDir); }
function stateRecordMetric(metricArgs) { return getState().stateRecordMetric(metricArgs, planningDir); }
function stateRecordActivity(desc) { return getState().stateRecordActivity(desc, planningDir); }
function stateUpdateProgress() { return getState().stateUpdateProgress(planningDir); }
function stateGetStatus() { return getState().stateGetStatus(planningDir); }
function stateSnapshot() { return getState().stateSnapshot(planningDir); }

function roadmapAnalyze() { return getRoadmap().roadmapAnalyze(planningDir); }
function roadmapUpdateStatus(p, s) { return getRoadmap().roadmapUpdateStatus(p, s, planningDir); }
function roadmapUpdatePlans(p, c, t) { return getRoadmap().roadmapUpdatePlans(p, c, t, planningDir); }
function roadmapUpdatePlanProgress(p) { return getRoadmap().roadmapUpdatePlanProgress(p, planningDir); }
function roadmapGetPhase(p) { return getRoadmap().roadmapGetPhase(p, planningDir); }
function roadmapAppendPhase(slug, opts) { return getRoadmap().roadmapAppendPhase(slug, planningDir, opts); }
function roadmapRemovePhase(p) { return getRoadmap().roadmapRemovePhase(p, planningDir); }
function roadmapInsertPhase(pos, slug, opts) { return getRoadmap().roadmapInsertPhase(pos, slug, planningDir, opts); }

function phaseFrontmatter(fp) { return getPhase().frontmatter(fp); }
function phasePlanIndex(p) { return getPhase().phasePlanIndex(p, planningDir); }
function phaseMustHaves(p) { return getPhase().phaseMustHaves(p, planningDir); }
function phaseInfo(p) { return getPhase().phaseInfo(p, planningDir); }
function phaseAdd(slug, after, opts) { return getPhase().phaseAdd(slug, after, planningDir, opts); }
function phaseRemove(p) { return getPhase().phaseRemove(p, planningDir); }
function phaseList() { return getPhase().phaseList(planningDir); }
function phaseComplete(p) { return getPhase().phaseComplete(p, planningDir); }
function phaseInsert(pos, slug, opts) { return getPhase().phaseInsert(pos, slug, planningDir, opts); }
function phaseCommitsFor(p) { return getPhase().phaseCommitsFor(p, planningDir); }
function phaseFirstLastCommit(p) { return getPhase().phaseFirstLastCommit(p, planningDir); }
function milestoneStats(v) { return getPhase().milestoneStats(v, planningDir); }

function initExecutePhase(p, dir, model) { return getInit().initExecutePhase(p, dir || planningDir, model); }
function initPlanPhase(p, dir, model) { return getInit().initPlanPhase(p, dir || planningDir, model); }
function initQuick(desc) { return getInit().initQuick(desc, planningDir); }
function initVerifyWork(p, dir, model) { return getInit().initVerifyWork(p, dir || planningDir, model); }
function initResume() { return getInit().initResume(planningDir); }
function initProgress() { return getInit().initProgress(planningDir); }
function initStateBundle(p) { return getInit().initStateBundle(p, planningDir); }

function historyAppend(entry, dir) { return getHistory().historyAppend(entry, dir || planningDir); }
function historyLoad(dir) { return getHistory().historyLoad(dir || planningDir); }

function todoList(opts) { return getTodo().todoList(planningDir, opts); }
function todoGet(num) { return getTodo().todoGet(planningDir, num); }
function todoAdd(title, opts) { return getTodo().todoAdd(planningDir, title, opts); }
function todoDone(num) { return getTodo().todoDone(planningDir, num); }

function decisionsRecord(opts) { return getDecisions().recordDecision(planningDir, opts); }
function decisionsList(filters) { return getDecisions().listDecisions(planningDir, filters); }

function spotCheck(phaseSlug, planId) { return getSpotCheck().spotCheck(planningDir, phaseSlug, planId); }
function verifySpotCheck(type, dirPath) { return getSpotCheck().verifySpotCheck(type, dirPath); }

function stalenessCheck(slug) { return getBuild().stalenessCheck(slug, planningDir); }
function summaryGate(slug, planId) { return getBuild().summaryGate(slug, planId, planningDir); }
function checkpointInit(slug, plans) { return getBuild().checkpointInit(slug, plans, planningDir); }
function checkpointUpdate(slug, opts) { return getBuild().checkpointUpdate(slug, opts, planningDir); }
function seedsMatch(slug, num) { return getBuild().seedsMatch(slug, num, planningDir); }
function ciPoll(runId, timeout) { return getBuild().ciPoll(runId, timeout, planningDir); }
function rollbackPlan(manifest) { return getBuild().rollback(manifest, planningDir); }

function referenceGet(name, opts) {
  return getReference().referenceGet(name, opts, resolvePluginRoot());
}

function skillSectionGet(skill, query) {
  return getSkillSection().skillSection(skill, query, resolvePluginRoot());
}

function listSkillHeadings(skill) {
  const root = resolvePluginRoot();
  const available = getSkillSection().listAvailableSkills(root);
  const skillPath = path.join(root, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return { error: `Skill not found: ${skill}`, available };
  }
  const content = fs.readFileSync(skillPath, 'utf8');
  return { skill, headings: getReference().listHeadings(content) };
}

function contextTriage(opts) {
  return getContext().contextTriage(opts, planningDir);
}

// ─── validateProject (cross-cutting) ──────────────────────────────────────────

function validateProject() {
  const core = getCore();
  const checks = [];
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(planningDir)) {
    return { valid: false, errors: ['.planning/ directory not found'], warnings: [], checks: ['directory_exists: FAIL'] };
  }
  checks.push('directory_exists: PASS');

  const config = configLoad();
  if (!config) {
    errors.push('config.json missing or invalid JSON');
    checks.push('config_valid: FAIL');
  } else {
    const configResult = configValidate(config);
    if (!configResult.valid) errors.push(...configResult.errors.map(e => 'config: ' + e));
    warnings.push(...(configResult.warnings || []).map(w => 'config: ' + w));
    checks.push('config_valid: ' + (configResult.valid ? 'PASS' : 'FAIL'));
  }

  const statePath = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    errors.push('STATE.md not found');
    checks.push('state_exists: FAIL');
  } else {
    try {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      const fm = core.parseYamlFrontmatter(stateContent);
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

  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    warnings.push('ROADMAP.md not found (may be a new project)');
    checks.push('roadmap_exists: WARN');
  } else {
    checks.push('roadmap_exists: PASS');
  }

  return { valid: errors.length === 0, errors, warnings, checks };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const { output, error } = getCore();

  // --cwd override
  const cwdEqArg = args.find(arg => arg.startsWith('--cwd='));
  const cwdIdx = args.indexOf('--cwd');
  if (cwdEqArg) {
    const value = cwdEqArg.slice('--cwd='.length).trim();
    if (!value) error('Missing value for --cwd');
    args.splice(args.indexOf(cwdEqArg), 1);
    cwd = path.resolve(value);
    planningDir = path.join(cwd, '.planning');
  } else if (cwdIdx !== -1) {
    const value = args[cwdIdx + 1];
    if (!value || value.startsWith('--')) error('Missing value for --cwd');
    args.splice(cwdIdx, 2);
    cwd = path.resolve(value);
    planningDir = path.join(cwd, '.planning');
  }

  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    error(`Invalid --cwd: ${cwd}`);
  }

  // --raw flag
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  const command = args[0];
  const subcommand = args[1];

  if (!command || command === 'help') {
    // Print help from the header comment
    const selfContent = fs.readFileSync(__filename, 'utf8');
    const commentEnd = selfContent.indexOf(' */');
    const helpText = selfContent
      .slice(selfContent.indexOf('/**') + 3, commentEnd)
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim();
    if (raw) {
      process.stdout.write(helpText + '\n');
    } else {
      output({ help: helpText }, false, helpText);
    }
    return;
  }

  try {
    // ─── State Operations ─────────────────────────────────────────────────────
    if (command === 'state' && subcommand === 'load') {
      output(stateLoad());
    } else if (command === 'state' && subcommand === 'check-progress') {
      output(stateCheckProgress());
    } else if (command === 'state' && subcommand === 'update') {
      const field = args[2];
      const value = args[3];
      if (!field || value === undefined) error('Usage: pbr-tools.cjs state update <field> <value>');
      output(stateUpdate(field, value));
    } else if (command === 'state' && subcommand === 'json') {
      // GSD compat: cmdStateJson
      getState().cmdStateJson(cwd, raw);
    } else if (command === 'state' && subcommand === 'get') {
      // GSD compat: cmdStateGet
      getState().cmdStateGet(cwd, args[2], raw);
    } else if (command === 'state' && subcommand === 'patch') {
      // Support both reference (JSON string) and GSD (--key val pairs) patterns
      if (args[2] && !args[2].startsWith('--')) {
        // Reference pattern: state patch '{"key": "val"}'
        output(statePatch(args[2]));
      } else {
        // GSD pattern: state patch --key val --key2 val2
        const patches = {};
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i].replace(/^--/, '');
          const value = args[i + 1];
          if (key && value !== undefined) patches[key] = value;
        }
        getState().cmdStatePatch(cwd, patches, raw);
      }
    } else if (command === 'state' && subcommand === 'advance-plan') {
      output(stateAdvancePlan());
    } else if (command === 'state' && subcommand === 'record-metric') {
      // Support both reference (positional) and GSD (--flag) patterns
      const phaseIdx = args.indexOf('--phase');
      if (phaseIdx !== -1) {
        // GSD pattern with --flags
        const planIdx = args.indexOf('--plan');
        const durationIdx = args.indexOf('--duration');
        const tasksIdx = args.indexOf('--tasks');
        const filesIdx = args.indexOf('--files');
        getState().cmdStateRecordMetric(cwd, {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          duration: durationIdx !== -1 ? args[durationIdx + 1] : null,
          tasks: tasksIdx !== -1 ? args[tasksIdx + 1] : null,
          files: filesIdx !== -1 ? args[filesIdx + 1] : null,
        }, raw);
      } else {
        // Reference pattern: positional args
        output(stateRecordMetric(args.slice(2)));
      }
    } else if (command === 'state' && subcommand === 'record-activity') {
      const description = args.slice(2).join(' ');
      if (!description) error('Usage: pbr-tools.cjs state record-activity <description>');
      output(stateRecordActivity(description));
    } else if (command === 'state' && subcommand === 'update-progress') {
      output(stateUpdateProgress());
    } else if (command === 'state' && subcommand === 'add-decision') {
      // GSD pattern: --summary "text" --phase N
      const phaseIdx = args.indexOf('--phase');
      const summaryIdx = args.indexOf('--summary');
      const summaryFileIdx = args.indexOf('--summary-file');
      const rationaleIdx = args.indexOf('--rationale');
      const rationaleFileIdx = args.indexOf('--rationale-file');
      getState().cmdStateAddDecision(cwd, {
        phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
        summary: summaryIdx !== -1 ? args[summaryIdx + 1] : null,
        summary_file: summaryFileIdx !== -1 ? args[summaryFileIdx + 1] : null,
        rationale: rationaleIdx !== -1 ? args[rationaleIdx + 1] : '',
        rationale_file: rationaleFileIdx !== -1 ? args[rationaleFileIdx + 1] : null,
      }, raw);
    } else if (command === 'state' && subcommand === 'add-blocker') {
      const textIdx = args.indexOf('--text');
      const textFileIdx = args.indexOf('--text-file');
      getState().cmdStateAddBlocker(cwd, {
        text: textIdx !== -1 ? args[textIdx + 1] : null,
        text_file: textFileIdx !== -1 ? args[textFileIdx + 1] : null,
      }, raw);
    } else if (command === 'state' && subcommand === 'resolve-blocker') {
      const textIdx = args.indexOf('--text');
      getState().cmdStateResolveBlocker(cwd, textIdx !== -1 ? args[textIdx + 1] : null, raw);
    } else if (command === 'state' && subcommand === 'record-session') {
      const stoppedIdx = args.indexOf('--stopped-at');
      const resumeIdx = args.indexOf('--resume-file');
      getState().cmdStateRecordSession(cwd, {
        stopped_at: stoppedIdx !== -1 ? args[stoppedIdx + 1] : null,
        resume_file: resumeIdx !== -1 ? args[resumeIdx + 1] : 'None',
      }, raw);
    } else if (command === 'state' && !subcommand) {
      // Bare "state" = state load
      output(stateLoad());

    // ─── State-bundle and state-snapshot (top-level aliases) ────────────────
    } else if (command === 'state-bundle') {
      const phaseNum = args[1];
      if (!phaseNum) error('Usage: pbr-tools.cjs state-bundle <phase-number>');
      output(initStateBundle(phaseNum));
    } else if (command === 'state-snapshot') {
      getState().cmdStateSnapshot(cwd, raw);

    // ─── Config Operations ────────────────────────────────────────────────────
    } else if (command === 'config' && subcommand === 'validate') {
      output(configValidate());
    } else if (command === 'config' && subcommand === 'load-defaults') {
      const defaults = getConfig().loadUserDefaults();
      output(defaults || { exists: false, path: getConfig().USER_DEFAULTS_PATH });
    } else if (command === 'config' && subcommand === 'save-defaults') {
      const cfg = configLoad();
      if (!cfg) error('No config.json found. Run /pbr:setup first.');
      output(getConfig().saveUserDefaults(cfg));
    } else if (command === 'config' && subcommand === 'resolve-depth') {
      const dir = args[2] || undefined;
      const cfg = configLoad(dir);
      output(getConfig().configResolveDepth(cfg));
    } else if (command === 'config' && subcommand === 'get') {
      getConfig().cmdConfigGet(cwd, args[2], raw);
    } else if (command === 'config' && subcommand === 'set') {
      getConfig().cmdConfigSet(cwd, args[2], args[3], raw);
    } else if (command === 'config' && subcommand === 'ensure-section') {
      getConfig().cmdConfigEnsureSection(cwd, raw);
    } else if (command === 'config-ensure-section') {
      getConfig().cmdConfigEnsureSection(cwd, raw);
    } else if (command === 'config-set') {
      getConfig().cmdConfigSet(cwd, args[1], args[2], raw);
    } else if (command === 'config-get') {
      getConfig().cmdConfigGet(cwd, args[1], raw);

    // ─── Phase Operations ─────────────────────────────────────────────────────
    } else if (command === 'phase' && subcommand === 'add') {
      const slug = args[2];
      if (!slug) error('Usage: phase add <slug> [--after N] [--goal "..."] [--depends-on N]');
      const afterIdx = args.indexOf('--after');
      const afterPhase = afterIdx !== -1 ? args[afterIdx + 1] : null;
      const goalIdx = args.indexOf('--goal');
      const goal = goalIdx !== -1 ? args[goalIdx + 1] : null;
      const depIdx = args.indexOf('--depends-on');
      const dependsOn = depIdx !== -1 ? args[depIdx + 1] : null;
      const opts = {};
      if (goal) opts.goal = goal;
      if (dependsOn) opts.dependsOn = dependsOn;
      output(phaseAdd(slug, afterPhase, Object.keys(opts).length > 0 ? opts : undefined));
    } else if (command === 'phase' && subcommand === 'remove') {
      const p = args[2];
      if (!p) error('Usage: phase remove <N>');
      output(phaseRemove(p));
    } else if (command === 'phase' && subcommand === 'list') {
      output(phaseList());
    } else if (command === 'phase' && subcommand === 'complete') {
      const p = args[2];
      if (!p) error('Usage: phase complete <N>');
      output(phaseComplete(p));
    } else if (command === 'phase' && subcommand === 'insert') {
      const position = args[2];
      const slug = args[3];
      if (!position || !slug) error('Usage: phase insert <N> <slug> [--goal "..."] [--depends-on N]');
      const goalIdx = args.indexOf('--goal');
      const goal = goalIdx !== -1 ? args[goalIdx + 1] : null;
      const depIdx = args.indexOf('--depends-on');
      const dependsOn = depIdx !== -1 ? args[depIdx + 1] : null;
      const opts = {};
      if (goal) opts.goal = goal;
      if (dependsOn) opts.dependsOn = dependsOn;
      output(phaseInsert(parseInt(position, 10), slug, Object.keys(opts).length > 0 ? opts : undefined));
    } else if (command === 'phase' && subcommand === 'info') {
      const p = args[2];
      if (!p) error('Usage: phase info <N>');
      output(phaseInfo(p));
    } else if (command === 'phase' && subcommand === 'commits-for') {
      const p = args[2];
      if (!p) error('Usage: phase commits-for <N>');
      output(phaseCommitsFor(p));
    } else if (command === 'phase' && subcommand === 'first-last-commit') {
      const p = args[2];
      if (!p) error('Usage: phase first-last-commit <N>');
      output(phaseFirstLastCommit(p));
    } else if (command === 'phase' && subcommand === 'next-decimal') {
      // GSD compat
      getPhase().cmdPhaseNextDecimal
        ? getPhase().cmdPhaseNextDecimal(cwd, args[2], raw)
        : output(getPhase().phaseNextDecimal ? getPhase().phaseNextDecimal(args[2], planningDir) : { error: 'not implemented' });
    } else if (command === 'phases' && subcommand === 'list') {
      // GSD compat: phases list with options
      const typeIndex = args.indexOf('--type');
      const phaseIndex = args.indexOf('--phase');
      const options = {
        type: typeIndex !== -1 ? args[typeIndex + 1] : null,
        phase: phaseIndex !== -1 ? args[phaseIndex + 1] : null,
        includeArchived: args.includes('--include-archived'),
      };
      getPhase().cmdPhasesList
        ? getPhase().cmdPhasesList(cwd, options, raw)
        : output(phaseList());
    } else if (command === 'phase-info') {
      const p = args[1];
      if (!p) error('Usage: pbr-tools.cjs phase-info <N>');
      output(phaseInfo(p));
    } else if (command === 'phase-plan-index') {
      const p = args[1];
      if (!p) error('Usage: pbr-tools.cjs phase-plan-index <phase>');
      getPhase().cmdPhasePlanIndex
        ? getPhase().cmdPhasePlanIndex(cwd, p, raw)
        : output(phasePlanIndex(p));
    } else if (command === 'find-phase') {
      getPhase().cmdFindPhase
        ? getPhase().cmdFindPhase(cwd, args[1], raw)
        : output(getCore().findPhaseInternal(cwd, args[1]));
    } else if (command === 'plan-index') {
      const p = args[1];
      if (!p) error('Usage: pbr-tools.cjs plan-index <phase>');
      output(phasePlanIndex(p));
    } else if (command === 'must-haves') {
      const p = args[1];
      if (!p) error('Usage: pbr-tools.cjs must-haves <phase>');
      output(phaseMustHaves(p));

    // ─── Roadmap Operations ───────────────────────────────────────────────────
    } else if (command === 'roadmap' && subcommand === 'get-phase') {
      const p = args[2];
      if (!p) error('Usage: roadmap get-phase <phase>');
      output(roadmapGetPhase(p));
    } else if (command === 'roadmap' && subcommand === 'analyze') {
      output(roadmapAnalyze());
    } else if (command === 'roadmap' && subcommand === 'update-plan-progress') {
      const p = args[2];
      if (!p) error('Usage: roadmap update-plan-progress <phase>');
      output(roadmapUpdatePlanProgress(p));
    } else if (command === 'roadmap' && subcommand === 'update-status') {
      const p = args[2];
      const s = args[3];
      if (!p || !s) error('Usage: roadmap update-status <phase> <status>');
      output(roadmapUpdateStatus(p, s));
    } else if (command === 'roadmap' && subcommand === 'update-plans') {
      const p = args[2];
      const c = args[3];
      const t = args[4];
      if (!p || c === undefined || t === undefined) error('Usage: roadmap update-plans <phase> <complete> <total>');
      output(roadmapUpdatePlans(p, c, t));
    } else if (command === 'roadmap' && subcommand === 'append-phase') {
      const slug = args[2];
      if (!slug) error('Usage: roadmap append-phase <slug> [options]');
      output(roadmapAppendPhase(slug));
    } else if (command === 'roadmap' && subcommand === 'remove-phase') {
      const p = args[2];
      if (!p) error('Usage: roadmap remove-phase <N>');
      output(roadmapRemovePhase(p));
    } else if (command === 'roadmap' && subcommand === 'insert-phase') {
      const pos = args[2];
      const slug = args[3];
      if (!pos || !slug) error('Usage: roadmap insert-phase <N> <slug>');
      output(roadmapInsertPhase(parseInt(pos, 10), slug));

    // ─── Init (Compound Commands) ─────────────────────────────────────────────
    } else if (command === 'init' && subcommand === 'execute-phase') {
      const p = args[2];
      if (!p) error('Usage: pbr-tools.cjs init execute-phase <phase>');
      output(initExecutePhase(p));
    } else if (command === 'init' && subcommand === 'plan-phase') {
      const p = args[2];
      if (!p) error('Usage: pbr-tools.cjs init plan-phase <phase>');
      output(initPlanPhase(p));
    } else if (command === 'init' && subcommand === 'new-project') {
      getInit().cmdInitNewProject
        ? getInit().cmdInitNewProject(cwd, raw)
        : output({ error: 'init new-project not available in reference mode' });
    } else if (command === 'init' && subcommand === 'new-milestone') {
      getInit().cmdInitNewMilestone
        ? getInit().cmdInitNewMilestone(cwd, raw)
        : output({ error: 'init new-milestone not available in reference mode' });
    } else if (command === 'init' && subcommand === 'quick') {
      const desc = args.slice(2).join(' ') || '';
      output(initQuick(desc));
    } else if (command === 'init' && subcommand === 'resume') {
      output(initResume());
    } else if (command === 'init' && subcommand === 'verify-work') {
      const p = args[2];
      if (!p) error('Usage: pbr-tools.cjs init verify-work <phase>');
      output(initVerifyWork(p));
    } else if (command === 'init' && subcommand === 'phase-op') {
      getInit().cmdInitPhaseOp
        ? getInit().cmdInitPhaseOp(cwd, args[2], raw)
        : output(phaseInfo(args[2]));
    } else if (command === 'init' && subcommand === 'todos') {
      getInit().cmdInitTodos
        ? getInit().cmdInitTodos(cwd, args[2], raw)
        : output(todoList({}));
    } else if (command === 'init' && subcommand === 'milestone-op') {
      getInit().cmdInitMilestoneOp
        ? getInit().cmdInitMilestoneOp(cwd, raw)
        : output({ error: 'init milestone-op not available' });
    } else if (command === 'init' && subcommand === 'map-codebase') {
      getInit().cmdInitMapCodebase
        ? getInit().cmdInitMapCodebase(cwd, raw)
        : output({ error: 'init map-codebase not available' });
    } else if (command === 'init' && subcommand === 'progress') {
      output(initProgress());
    } else if (command === 'init') {
      error(`Unknown init workflow: ${subcommand}\nAvailable: execute-phase, plan-phase, new-project, new-milestone, quick, resume, verify-work, phase-op, todos, milestone-op, map-codebase, progress`);

    // ─── Todo Operations ──────────────────────────────────────────────────────
    } else if (command === 'todo' && subcommand === 'list') {
      const opts = {};
      const themeIdx = args.indexOf('--theme');
      if (themeIdx !== -1 && args[themeIdx + 1]) opts.theme = args[themeIdx + 1];
      const statusIdx = args.indexOf('--status');
      if (statusIdx !== -1 && args[statusIdx + 1]) opts.status = args[statusIdx + 1];
      output(todoList(opts));
    } else if (command === 'todo' && subcommand === 'get') {
      const num = args[2];
      if (!num) error('Usage: pbr-tools.cjs todo get <NNN>');
      output(todoGet(num));
    } else if (command === 'todo' && subcommand === 'add') {
      const titleParts = [];
      const opts = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--priority' && args[i + 1]) { opts.priority = args[++i]; }
        else if (args[i] === '--theme' && args[i + 1]) { opts.theme = args[++i]; }
        else if (args[i] === '--source' && args[i + 1]) { opts.source = args[++i]; }
        else { titleParts.push(args[i]); }
      }
      const title = titleParts.join(' ');
      if (!title) error('Usage: pbr-tools.cjs todo add <title> [--priority P1|P2|P3] [--theme <theme>]');
      output(todoAdd(title, opts));
    } else if (command === 'todo' && subcommand === 'done') {
      const num = args[2];
      if (!num) error('Usage: pbr-tools.cjs todo done <NNN>');
      output(todoDone(num));

    // ─── History ──────────────────────────────────────────────────────────────
    } else if (command === 'history' && subcommand === 'append') {
      const type = args[2];
      const title = args[3];
      const body = args[4] || '';
      if (!type || !title) error('Usage: pbr-tools.cjs history append <type> <title> [body]');
      output(historyAppend({ type, title, body }));
    } else if (command === 'history' && subcommand === 'load') {
      output(historyLoad());
    } else if (command === 'history-digest') {
      getCommands().cmdHistoryDigest(cwd, raw);

    // ─── Learnings ────────────────────────────────────────────────────────────
    } else if (command === 'learnings' && subcommand === 'ingest') {
      const jsonFile = args[2];
      if (!jsonFile) error('Usage: learnings ingest <json-file>');
      const rawContent = fs.readFileSync(jsonFile, 'utf8');
      const entry = JSON.parse(rawContent);
      output(getLearnings().learningsIngest(entry));
    } else if (command === 'learnings' && subcommand === 'query') {
      const filters = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[++i].split(',').map(t => t.trim()); }
        else if (args[i] === '--min-confidence' && args[i + 1]) { filters.minConfidence = args[++i]; }
        else if (args[i] === '--stack' && args[i + 1]) { filters.stack = args[++i]; }
        else if (args[i] === '--type' && args[i + 1]) { filters.type = args[++i]; }
      }
      output(getLearnings().learningsQuery(filters));
    } else if (command === 'learnings' && subcommand === 'check-thresholds') {
      output(getLearnings().checkDeferralThresholds());
    } else if (command === 'learnings' && subcommand === 'copy-global') {
      const filePath = args[2];
      const projectName = args[3];
      if (!filePath || !projectName) error('Usage: learnings copy-global <learnings-md-path> <project-name>');
      output(getLearnings().copyToGlobal(filePath, projectName));
    } else if (command === 'learnings' && subcommand === 'query-global') {
      const filters = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[++i].split(',').map(t => t.trim()); }
        else if (args[i] === '--project' && args[i + 1]) { filters.project = args[++i]; }
      }
      output(getLearnings().queryGlobal(filters));

    // ─── Intel ──────────────────────────────────────────────────────────────────
    } else if (command === 'intel' && subcommand === 'query') {
      const term = args[2];
      if (!term) error('Usage: intel query <term>');
      output(getIntel().intelQuery(term, planningDir));
    } else if (command === 'intel' && subcommand === 'update') {
      output(getIntel().intelUpdate(planningDir));
    } else if (command === 'intel' && subcommand === 'status') {
      output(getIntel().intelStatus(planningDir));
    } else if (command === 'intel' && subcommand === 'diff') {
      output(getIntel().intelDiff(planningDir));
    } else if (command === 'intel' && subcommand === 'snapshot') {
      output(getIntel().intelSnapshot(planningDir));
    } else if (command === 'intel' && subcommand === 'validate') {
      output(getIntel().intelValidate(planningDir));
    } else if (command === 'intel' && subcommand === 'extract-exports') {
      const filePath = args[2];
      if (!filePath) error('Usage: intel extract-exports <filepath>');
      output(getIntel().intelExtractExports(filePath));
    } else if (command === 'intel' && subcommand === 'patch-meta') {
      const filePath = args[2];
      if (!filePath) error('Usage: intel patch-meta <filepath>');
      output(getIntel().intelPatchMeta(filePath));

    // ─── Build Pipeline ───────────────────────────────────────────────────────
    } else if (command === 'staleness-check') {
      const slug = args[1];
      if (!slug) error('Usage: staleness-check <phase-slug>');
      output(stalenessCheck(slug));
    } else if (command === 'summary-gate') {
      const slug = args[1];
      const planId = args[2];
      if (!slug || !planId) error('Usage: summary-gate <phase-slug> <plan-id>');
      output(summaryGate(slug, planId));
    } else if (command === 'checkpoint' && subcommand === 'init') {
      const slug = args[2];
      const plans = args[3] || '';
      output(checkpointInit(slug, plans));
    } else if (command === 'checkpoint' && subcommand === 'update') {
      const slug = args[2];
      const waveIdx = args.indexOf('--wave');
      const wave = waveIdx !== -1 ? parseInt(args[waveIdx + 1], 10) : 1;
      const resolvedIdx = args.indexOf('--resolved');
      const resolved = resolvedIdx !== -1 ? args[resolvedIdx + 1] : '';
      const shaIdx = args.indexOf('--sha');
      const sha = shaIdx !== -1 ? args[shaIdx + 1] : '';
      output(checkpointUpdate(slug, { wave, resolved, sha }));
    } else if (command === 'seeds' && subcommand === 'match') {
      const slug = args[2];
      const num = args[3];
      if (!slug) error('Usage: seeds match <phase-slug> <phase-number>');
      output(seedsMatch(slug, num));
    } else if (command === 'ci-poll') {
      const runId = args[1];
      const timeoutIdx = args.indexOf('--timeout');
      const timeoutSecs = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1], 10) : 300;
      if (!runId) error('Usage: pbr-tools.cjs ci-poll <run-id> [--timeout <seconds>]');
      output(ciPoll(runId, timeoutSecs));
    } else if (command === 'rollback') {
      const manifestPath = args[1];
      if (!manifestPath) error('Usage: pbr-tools.cjs rollback <manifest-path>');
      output(rollbackPlan(manifestPath));
    } else if (command === 'build-preview') {
      const phaseSlug = args[1];
      if (!phaseSlug) error('Usage: pbr-tools.cjs build-preview <phase-slug>');
      const result = getPreview().buildPreview(phaseSlug, {}, planningDir, resolvePluginRoot());
      if (result && result.error) { output(result); process.exit(1); }
      output(result);

    // ─── LLM Operations ──────────────────────────────────────────────────────
    } else if (command === 'llm' && subcommand === 'health') {
      output(getLlm().llmHealth(planningDir));
    } else if (command === 'llm' && subcommand === 'status') {
      output(getLlm().llmStatus(planningDir));
    } else if (command === 'llm' && subcommand === 'classify') {
      const fileType = args[2];
      const filePath = args[3];
      if (!fileType || !filePath) error('Usage: pbr-tools.cjs llm classify <PLAN|SUMMARY> <filepath>');
      output(await getLlm().llmClassify(planningDir, fileType, filePath));
    } else if (command === 'llm' && subcommand === 'score-source') {
      const sourceUrl = args[2];
      const filePath = args[3];
      if (!sourceUrl || !filePath) error('Usage: pbr-tools.cjs llm score-source <url> <file-path>');
      output(await getLlm().llmScoreSource(planningDir, sourceUrl, filePath));
    } else if (command === 'llm' && subcommand === 'classify-error') {
      const filePath = args[2];
      const agentType = args[3] || 'unknown';
      if (!filePath) error('Usage: pbr-tools.cjs llm classify-error <file-path> [agent-type]');
      output(await getLlm().llmClassifyError(planningDir, filePath, agentType));
    } else if (command === 'llm' && subcommand === 'summarize') {
      const filePath = args[2];
      const maxWords = args[3] ? parseInt(args[3], 10) : undefined;
      if (!filePath) error('Usage: pbr-tools.cjs llm summarize <file-path> [max-words]');
      output(await getLlm().llmSummarize(planningDir, filePath, maxWords));
    } else if (command === 'llm' && subcommand === 'metrics') {
      output(getLlm().llmMetrics(planningDir, args.slice(2)));
    } else if (command === 'llm' && subcommand === 'adjust-thresholds') {
      output(getLlm().llmAdjustThresholds(planningDir));

    // ─── Session ──────────────────────────────────────────────────────────────
    } else if (command === 'session') {
      const core = getCore();
      const sub = args[1];
      const sessionIdIdx = args.indexOf('--session-id');
      const sessionId = sessionIdIdx !== -1 ? args[sessionIdIdx + 1] : null;
      const positional = sessionIdIdx !== -1
        ? args.filter((_a, i) => i !== sessionIdIdx && i !== sessionIdIdx + 1)
        : args;
      const key = positional[2];
      const value = positional[3];
      const dir = planningDir;
      if (sub === 'get') {
        if (!key) error('Usage: pbr-tools.cjs session get <key> [--session-id <id>]');
        if (!core.SESSION_ALLOWED_KEYS.includes(key)) error(`Unknown session key: ${key}. Allowed: ${core.SESSION_ALLOWED_KEYS.join(', ')}`);
        const data = core.sessionLoad(dir, sessionId);
        const val = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        output({ key, value: val });
      } else if (sub === 'set') {
        if (!key || value === undefined) error('Usage: pbr-tools.cjs session set <key> <value> [--session-id <id>]');
        if (!core.SESSION_ALLOWED_KEYS.includes(key)) error(`Unknown session key: ${key}. Allowed: ${core.SESSION_ALLOWED_KEYS.join(', ')}`);
        let coerced = value;
        if (/^\d+$/.test(value)) coerced = parseInt(value, 10);
        else if (value === 'null') coerced = null;
        const result = core.sessionSave(dir, { [key]: coerced }, sessionId);
        if (!result.success) error(result.error || 'Failed to save session');
        output({ ok: true });
      } else if (sub === 'clear') {
        if (key) {
          if (!core.SESSION_ALLOWED_KEYS.includes(key)) error(`Unknown session key: ${key}. Allowed: ${core.SESSION_ALLOWED_KEYS.join(', ')}`);
          const result = core.sessionSave(dir, { [key]: null }, sessionId);
          if (!result.success) error(result.error || 'Failed to clear session key');
        } else {
          const sessionPath = sessionId
            ? core.resolveSessionPath(dir, '.session.json', sessionId)
            : path.join(dir, '.session.json');
          try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath); } catch (e) { error(e.message); }
        }
        output({ ok: true });
      } else if (sub === 'dump') {
        const data = core.sessionLoad(dir, sessionId);
        output(data);
      } else {
        error('Usage: pbr-tools.cjs session get|set|clear|dump <key> [value] [--session-id <id>]');
      }

    // ─── Claims ───────────────────────────────────────────────────────────────
    } else if (command === 'claim' && subcommand === 'acquire') {
      const phaseSlug = args[2];
      const sidIdx = args.indexOf('--session-id');
      const sessionId = sidIdx !== -1 ? args[sidIdx + 1] : null;
      const skillIdx = args.indexOf('--skill');
      const skill = skillIdx !== -1 ? args[skillIdx + 1] : 'unknown';
      if (!phaseSlug || !sessionId) error('Usage: pbr-tools.cjs claim acquire <phase-slug> --session-id <id> --skill <name>');
      const phaseDir = path.join(planningDir, 'phases', phaseSlug);
      if (!fs.existsSync(phaseDir)) { output({ error: `Phase directory not found: ${phaseSlug}` }); return; }
      output(getCore().acquireClaim(planningDir, phaseDir, sessionId, skill));
    } else if (command === 'claim' && subcommand === 'release') {
      const phaseSlug = args[2];
      const sidIdx = args.indexOf('--session-id');
      const sessionId = sidIdx !== -1 ? args[sidIdx + 1] : null;
      if (!phaseSlug || !sessionId) error('Usage: pbr-tools.cjs claim release <phase-slug> --session-id <id>');
      const phaseDir = path.join(planningDir, 'phases', phaseSlug);
      if (!fs.existsSync(phaseDir)) { output({ error: `Phase directory not found: ${phaseSlug}` }); return; }
      output(getCore().releaseClaim(planningDir, phaseDir, sessionId));
    } else if (command === 'claim' && subcommand === 'list') {
      output(getCore().listClaims(planningDir));

    // ─── Verification ─────────────────────────────────────────────────────────
    } else if (command === 'verify' && subcommand === 'plan-structure') {
      getVerify().cmdVerifyPlanStructure(cwd, args[2], raw);
    } else if (command === 'verify' && subcommand === 'phase-completeness') {
      getVerify().cmdVerifyPhaseCompleteness(cwd, args[2], raw);
    } else if (command === 'verify' && subcommand === 'references') {
      getVerify().cmdVerifyReferences(cwd, args[2], raw);
    } else if (command === 'verify' && subcommand === 'commits') {
      getVerify().cmdVerifyCommits(cwd, args.slice(2), raw);
    } else if (command === 'verify' && subcommand === 'artifacts') {
      getVerify().cmdVerifyArtifacts(cwd, args[2], raw);
    } else if (command === 'verify' && subcommand === 'key-links') {
      getVerify().cmdVerifyKeyLinks(cwd, args[2], raw);
    } else if (command === 'verify' && subcommand === 'spot-check') {
      const scType = args[2];
      const scPath = args[3];
      if (!scType || !scPath) { error('Usage: verify spot-check <type> <path>  (types: plan, summary, verification, quick)'); }
      const result = verifySpotCheck(scType, scPath);
      if (result.error) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exit(1); }
      output(result, raw, result.passed ? 'passed' : 'failed');
    } else if (command === 'verify-summary') {
      const summaryPath = args[1];
      const countIndex = args.indexOf('--check-count');
      const checkCount = countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
      getVerify().cmdVerifySummary(cwd, summaryPath, checkCount, raw);
    } else if (command === 'validate' && subcommand === 'consistency') {
      getVerify().cmdValidateConsistency(cwd, raw);
    } else if (command === 'validate' && subcommand === 'health') {
      const repairFlag = args.includes('--repair');
      getVerify().cmdValidateHealth(cwd, { repair: repairFlag }, raw);
    } else if (command === 'validate-project') {
      output(validateProject());

    // ─── Trust Gate ───────────────────────────────────────────────────────────
    } else if (command === 'trust-gate') {
      const phaseNum = args[1] || '';
      const { resolveVerificationDepth } = require(path.join(__dirname, '..', '..', 'plugins', 'pbr', 'scripts', 'lib', 'trust-gate'));
      const config = getConfig().configLoad(planningDir);
      const depth = resolveVerificationDepth(planningDir, config);
      output({ depth, phase: phaseNum });

    // ─── Frontmatter ──────────────────────────────────────────────────────────
    } else if (command === 'frontmatter' && subcommand === 'get') {
      const file = args[2];
      const fieldIdx = args.indexOf('--field');
      getFrontmatter().cmdFrontmatterGet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, raw);
    } else if (command === 'frontmatter' && subcommand === 'set') {
      const file = args[2];
      const fieldIdx = args.indexOf('--field');
      const valueIdx = args.indexOf('--value');
      getFrontmatter().cmdFrontmatterSet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, valueIdx !== -1 ? args[valueIdx + 1] : undefined, raw);
    } else if (command === 'frontmatter' && subcommand === 'merge') {
      const file = args[2];
      const dataIdx = args.indexOf('--data');
      getFrontmatter().cmdFrontmatterMerge(cwd, file, dataIdx !== -1 ? args[dataIdx + 1] : null, raw);
    } else if (command === 'frontmatter' && subcommand === 'validate') {
      const file = args[2];
      const schemaIdx = args.indexOf('--schema');
      getFrontmatter().cmdFrontmatterValidate(cwd, file, schemaIdx !== -1 ? args[schemaIdx + 1] : null, raw);
    } else if (command === 'frontmatter' && subcommand && !['get', 'set', 'merge', 'validate'].includes(subcommand)) {
      // Reference compat: frontmatter <filepath> (parse frontmatter from file)
      output(phaseFrontmatter(subcommand));

    // ─── Templates ────────────────────────────────────────────────────────────
    } else if (command === 'template' && subcommand === 'select') {
      getTemplate().cmdTemplateSelect(cwd, args[2], raw);
    } else if (command === 'template' && subcommand === 'fill') {
      const templateType = args[2];
      const phaseIdx = args.indexOf('--phase');
      const planIdx = args.indexOf('--plan');
      const nameIdx = args.indexOf('--name');
      const typeIdx = args.indexOf('--type');
      const waveIdx = args.indexOf('--wave');
      const fieldsIdx = args.indexOf('--fields');
      getTemplate().cmdTemplateFill(cwd, templateType, {
        phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
        plan: planIdx !== -1 ? args[planIdx + 1] : null,
        name: nameIdx !== -1 ? args[nameIdx + 1] : null,
        type: typeIdx !== -1 ? args[typeIdx + 1] : 'execute',
        wave: waveIdx !== -1 ? args[waveIdx + 1] : '1',
        fields: fieldsIdx !== -1 ? JSON.parse(args[fieldsIdx + 1]) : {},
      }, raw);

    // ─── Milestones ───────────────────────────────────────────────────────────
    } else if (command === 'milestone' && subcommand === 'complete') {
      const nameIndex = args.indexOf('--name');
      const archivePhases = args.includes('--archive-phases');
      let milestoneName = null;
      if (nameIndex !== -1) {
        const nameArgs = [];
        for (let i = nameIndex + 1; i < args.length; i++) {
          if (args[i].startsWith('--')) break;
          nameArgs.push(args[i]);
        }
        milestoneName = nameArgs.join(' ') || null;
      }
      getMilestone().cmdMilestoneComplete(cwd, args[2], { name: milestoneName, archivePhases }, raw);
    } else if (command === 'milestone' && subcommand === 'stats') {
      const version = args[2];
      if (!version) error('Usage: milestone stats <version>');
      output(milestoneStats(version));
    } else if (command === 'milestone-stats') {
      const version = args[1];
      if (!version) error('Usage: pbr-tools.cjs milestone-stats <version>');
      output(milestoneStats(version));

    // ─── Requirements ─────────────────────────────────────────────────────────
    } else if (command === 'requirements' && subcommand === 'mark-complete') {
      getMilestone().cmdRequirementsMarkComplete(cwd, args.slice(2), raw);

    } else if (command === 'requirements' && subcommand === 'update-status') {
      const reqMod = require('./lib/requirements.cjs');
      const reqIdsIdx = args.indexOf('--req-ids');
      const statusIdx = args.indexOf('--status');
      if (reqIdsIdx === -1 || statusIdx === -1) {
        error('Usage: requirements update-status --req-ids REQ-01,REQ-02 --status done|reset');
      }
      const reqIds = args[reqIdsIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
      const reqStatus = args[statusIdx + 1];
      if (!['done', 'reset'].includes(reqStatus)) error('--status must be "done" or "reset"');
      const result = reqMod.updateRequirementStatus(planningDir, reqIds, reqStatus);
      output(result, raw, `${result.updated} updated, ${result.skipped} skipped`);

    } else if (command === 'requirements' && subcommand === 'mark-phase') {
      const reqMod = require('./lib/requirements.cjs');
      const phaseDirIdx = args.indexOf('--phase-dir');
      if (phaseDirIdx === -1) error('Usage: requirements mark-phase --phase-dir <path>');
      const targetPhaseDir = args[phaseDirIdx + 1];
      const config = configLoad();
      if (config && config.features && config.features.living_requirements === false) {
        output({ skipped: true, reason: 'features.living_requirements is disabled' }, raw, 'living requirements disabled');
      } else {
        const result = reqMod.markPhaseRequirements(planningDir, targetPhaseDir);
        output(result, raw, result.skipped_reason || `${result.updated} requirements marked`);
      }

    } else if (command === 'requirements' && subcommand === 'status') {
      const reqMod = require('./lib/requirements.cjs');
      const statusMap = reqMod.getRequirementStatus(planningDir);
      const obj = {};
      for (const [k, v] of statusMap) { obj[k] = v; }
      output(obj, raw, `${statusMap.size} requirements found`);

    // ─── Scaffolding ──────────────────────────────────────────────────────────
    } else if (command === 'scaffold') {
      const scaffoldType = args[1];
      const phaseIndex = args.indexOf('--phase');
      const nameIndex = args.indexOf('--name');
      const scaffoldOptions = {
        phase: phaseIndex !== -1 ? args[phaseIndex + 1] : null,
        name: nameIndex !== -1 ? args.slice(nameIndex + 1).join(' ') : null,
      };
      getCommands().cmdScaffold(cwd, scaffoldType, scaffoldOptions, raw);

    // ─── Utility Commands ─────────────────────────────────────────────────────
    } else if (command === 'resolve-model') {
      getCommands().cmdResolveModel(cwd, args[1], raw);
    } else if (command === 'generate-slug' || command === 'slug-generate') {
      getCommands().cmdGenerateSlug(args[1], raw);

    // ─── Quick Task Operations ─────────────────────────────────────────────────
    } else if (command === 'quick' && subcommand === 'init') {
      const desc = args.slice(2).join(' ') || '';
      const quickInitMod = require('./lib/quick-init.cjs');
      output(quickInitMod.quickInit(desc, planningDir));

    } else if (command === 'current-timestamp') {
      getCommands().cmdCurrentTimestamp(args[1] || 'full', raw);
    } else if (command === 'verify-path-exists') {
      getCommands().cmdVerifyPathExists(cwd, args[1], raw);
    } else if (command === 'summary-extract') {
      const summaryPath = args[1];
      const fieldsIndex = args.indexOf('--fields');
      const fields = fieldsIndex !== -1 ? args[fieldsIndex + 1].split(',') : null;
      getCommands().cmdSummaryExtract(cwd, summaryPath, fields, raw);
    } else if (command === 'websearch') {
      const query = args[1];
      const limitIdx = args.indexOf('--limit');
      const freshnessIdx = args.indexOf('--freshness');
      await getCommands().cmdWebsearch(query, {
        limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10,
        freshness: freshnessIdx !== -1 ? args[freshnessIdx + 1] : null,
      }, raw);
    } else if (command === 'progress') {
      const fmt = args[1] || 'json';
      getCommands().cmdProgressRender(cwd, fmt, raw);
    } else if (command === 'commit') {
      const amend = args.includes('--amend');
      const filesIndex = args.indexOf('--files');
      const endIndex = filesIndex !== -1 ? filesIndex : args.length;
      const messageArgs = args.slice(1, endIndex).filter(a => !a.startsWith('--'));
      const message = messageArgs.join(' ') || undefined;
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
      getCommands().cmdCommit(cwd, message, files, raw, amend);

    // ─── Reference & Skills ───────────────────────────────────────────────────
    } else if (command === 'reference') {
      const name = args[1];
      if (!name) error('Usage: pbr-tools.cjs reference <name> [--section <heading>] [--list]');
      const listFlag = args.includes('--list');
      const sectionIdx = args.indexOf('--section');
      const section = sectionIdx !== -1 ? args.slice(sectionIdx + 1).join(' ') : null;
      output(referenceGet(name, { section, list: listFlag }));
    } else if (command === 'skill-section') {
      if (args[1] === '--list') {
        const skillName = args[2];
        if (!skillName) error('Usage: pbr-tools.cjs skill-section --list <skill>');
        const listResult = listSkillHeadings(skillName);
        output(listResult);
        if (listResult.error) process.exit(1);
      } else {
        const skillName = args[1];
        const sectionQuery = args.slice(2).join(' ');
        if (!skillName || !sectionQuery) error('Usage: pbr-tools.cjs skill-section <skill> <section>');
        const secResult = skillSectionGet(skillName, sectionQuery);
        output(secResult);
        if (secResult.error) process.exit(1);
      }
    } else if (command === 'step-verify') {
      const skill = args[1];
      const step = args[2];
      const checklistStr = args[3] || '[]';
      let checklist;
      try { checklist = JSON.parse(checklistStr); } catch (_e) { output({ error: 'Invalid checklist JSON' }); process.exit(1); return; }
      const svContext = {
        planningDir,
        phaseSlug: process.env.PBR_PHASE_SLUG || '',
        planId: process.env.PBR_PLAN_ID || ''
      };
      const svResult = getStepVerify().stepVerify(skill, step, checklist, svContext);
      output(svResult);
      if (svResult.error || svResult.all_passed === false) process.exit(1);
    } else if (command === 'context-triage') {
      const opts = {};
      const agentsIdx = args.indexOf('--agents-done');
      if (agentsIdx !== -1) opts.agentsDone = parseInt(args[agentsIdx + 1], 10);
      const plansIdx = args.indexOf('--plans-total');
      if (plansIdx !== -1) opts.plansTotal = parseInt(args[plansIdx + 1], 10);
      const stepIdx = args.indexOf('--step');
      if (stepIdx !== -1) opts.currentStep = args[stepIdx + 1];
      output(contextTriage(opts));
    } else if (command === 'suggest-alternatives') {
      const errorType = args[1];
      const alt = getAlternatives();
      if (errorType === 'phase-not-found') {
        output(alt.phaseAlternatives(args[2] || '', planningDir));
      } else if (errorType === 'missing-prereq') {
        output(alt.prerequisiteAlternatives(args[2] || '', planningDir));
      } else if (errorType === 'config-invalid') {
        output(alt.configAlternatives(args[2] || '', args[3] || '', planningDir));
      } else {
        output({ error: 'Unknown error type. Valid: phase-not-found, missing-prereq, config-invalid' });
        process.exit(1);
      }
    } else if (command === 'spot-check') {
      const phaseSlug = args[1];
      const planId = args[2];
      if (!phaseSlug || !planId) error('Usage: spot-check <phaseSlug> <planId>');
      output(spotCheck(phaseSlug, planId));

    // ─── Migration & Events ───────────────────────────────────────────────────
    } else if (command === 'migrate') {
      const dryRun = args.includes('--dry-run');
      const force = args.includes('--force');
      const result = await getMigrate().applyMigrations(planningDir, { dryRun, force });
      output(result);
    } else if (command === 'event') {
      const category = args[1];
      const eventName = args[2];
      let details = {};
      if (args[3]) {
        try { details = JSON.parse(args[3]); } catch (_e) { details = { raw: args[3] }; }
      }
      if (!category || !eventName) error('Usage: pbr-tools.cjs event <category> <event> [JSON-details]');
      const { logEvent } = require('./event-logger.cjs');
      logEvent(category, eventName, details);
      output({ logged: true, category, event: eventName });
    } else if (command === 'tmux' && subcommand === 'detect') {
      const tmuxEnv = process.env.TMUX || '';
      const result = {
        in_tmux: !!tmuxEnv,
        pane: process.env.TMUX_PANE || null,
        session: null
      };
      if (tmuxEnv) {
        const parts = tmuxEnv.split(',');
        if (parts.length >= 1) result.session = parts[0].split('/').pop() || null;
      }
      output(result);

    // ─── List-todos (legacy alias) ────────────────────────────────────────────
    } else if (command === 'list-todos') {
      // Legacy GSD command -- forward to todo list
      output(todoList({ theme: args[1] || undefined }));

    // ─── Status Render ────────────────────────────────────────────────────────
    } else if (command === 'status' && subcommand === 'render') {
      output(getStatusRender().statusRender(planningDir));

    // ─── Suggest Next ──────────────────────────────────────────────────────────
    } else if (command === 'suggest-next') {
      output(getSuggestNext().suggestNext(planningDir));

    // ─── Dashboard ─────────────────────────────────────────────────────────────
    } else if (command === 'dashboard') {
      const { spawn } = require('child_process');
      const dashboardDir = path.join(__dirname, '..', '..', 'dashboard', 'server');
      const dashboardIndex = path.join(dashboardDir, 'index.js');

      if (!fs.existsSync(dashboardIndex)) {
        error(`Dashboard server not found at ${dashboardDir}. Ensure dashboard/server/ exists.`);
      }

      // Check if node_modules exist in dashboard/server
      if (!fs.existsSync(path.join(dashboardDir, 'node_modules'))) {
        process.stderr.write('Installing dashboard dependencies...\n');
        const install = require('child_process').execSync('npm install', {
          cwd: dashboardDir,
          stdio: 'inherit'
        });
      }

      const port = subcommand || process.env.PBR_DASHBOARD_PORT || '3141';

      if (args[1] === 'stop') {
        // Find and kill existing dashboard process
        try {
          const pid = fs.readFileSync(path.join(cwd, '.planning', '.dashboard-pid'), 'utf8').trim();
          process.kill(Number(pid), 'SIGTERM');
          fs.unlinkSync(path.join(cwd, '.planning', '.dashboard-pid'));
          process.stderr.write(`Dashboard stopped (PID ${pid})\n`);
          output({ stopped: true, pid: Number(pid) });
        } catch {
          process.stderr.write('No running dashboard found.\n');
          output({ stopped: false });
        }
      } else {
        // Start dashboard server
        const child = spawn(process.execPath, [dashboardIndex], {
          cwd: cwd,
          env: { ...process.env, PBR_DASHBOARD_PORT: port },
          stdio: 'inherit',
          detached: false,
        });

        // Write PID for stop command
        const pidDir = path.join(cwd, '.planning');
        if (fs.existsSync(pidDir)) {
          fs.writeFileSync(path.join(pidDir, '.dashboard-pid'), String(child.pid));
        }

        child.on('error', (err) => {
          process.stderr.write(`Dashboard failed to start: ${err.message}\n`);
          process.exit(1);
        });

        // Keep parent alive while dashboard runs
        child.on('exit', (code) => {
          const pidFile = path.join(cwd, '.planning', '.dashboard-pid');
          try { fs.unlinkSync(pidFile); } catch {}
          process.exit(code || 0);
        });

        // Forward SIGINT/SIGTERM to child
        process.on('SIGINT', () => child.kill('SIGINT'));
        process.on('SIGTERM', () => child.kill('SIGTERM'));

        // Prevent main() from exiting
        return new Promise(() => {});
      }

    // ─── Parse Args ────────────────────────────────────────────────────────────
    } else if (command === 'parse-args') {
      const type = args[1];
      const rawInput = args.slice(2).join(' ');
      if (!type) error('Usage: pbr-tools.cjs parse-args <type> <args>\nTypes: plan, quick');
      output(getParseArgs().parseArgs(type, rawInput));

    // ─── Status Fingerprint ──────────────────────────────────────────────────
    } else if (command === 'status' && subcommand === 'fingerprint') {
      const crypto = require('crypto');
      const files = {};
      let combinedContent = '';
      for (const name of ['STATE.md', 'ROADMAP.md']) {
        const filePath = path.join(planningDir, name);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const stat = fs.statSync(filePath);
          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
          files[name] = {
            hash,
            mtime: stat.mtime.toISOString(),
            lines: content.split('\n').length
          };
          combinedContent += content;
        } catch {
          files[name] = { hash: null, mtime: null, lines: 0 };
        }
      }
      const fingerprint = combinedContent
        ? crypto.createHash('sha256').update(combinedContent).digest('hex').slice(0, 8)
        : null;
      // Count phase directories
      let phaseDirs = 0;
      const phasesDir = path.join(planningDir, 'phases');
      try {
        const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
        phaseDirs = entries.filter(e => e.isDirectory()).length;
      } catch { /* no phases dir */ }
      output({
        fingerprint,
        files,
        phase_dirs: phaseDirs,
        timestamp: new Date().toISOString()
      });

    // ─── Decisions Operations ───────────────────────────────────────────────
    } else if (command === 'decisions' && subcommand === 'record') {
      const opts = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--decision' && args[i + 1]) { opts.decision = args[++i]; }
        else if (args[i] === '--rationale' && args[i + 1]) { opts.rationale = args[++i]; }
        else if (args[i] === '--context' && args[i + 1]) { opts.context = args[++i]; }
        else if (args[i] === '--agent' && args[i + 1]) { opts.agent = args[++i]; }
        else if (args[i] === '--phase' && args[i + 1]) { opts.phase = args[++i]; }
        else if (args[i] === '--tags' && args[i + 1]) { opts.tags = args[++i].split(',').map(t => t.trim()); }
        else if (args[i] === '--alternatives' && args[i + 1]) { opts.alternatives = args[++i].split(',').map(a => a.trim()); }
        else if (args[i] === '--consequences' && args[i + 1]) { opts.consequences = args[++i]; }
      }
      if (!opts.decision) error('Usage: decisions record --decision "..." --rationale "..." [--context "..."] [--agent name] [--phase NN] [--tags t1,t2] [--alternatives a1,a2] [--consequences "..."]');
      output(decisionsRecord(opts));
    } else if (command === 'decisions' && subcommand === 'list') {
      const filters = {};
      const statusIdx = args.indexOf('--status');
      if (statusIdx !== -1 && args[statusIdx + 1]) filters.status = args[statusIdx + 1];
      const phaseIdx = args.indexOf('--phase');
      if (phaseIdx !== -1 && args[phaseIdx + 1]) filters.phase = args[phaseIdx + 1];
      const tagIdx = args.indexOf('--tag');
      if (tagIdx !== -1 && args[tagIdx + 1]) filters.tag = args[tagIdx + 1];
      output(decisionsList(Object.keys(filters).length > 0 ? filters : undefined));
    } else if (command === 'decisions') {
      error(`Unknown decisions subcommand: ${subcommand}\nAvailable: record, list`);

    // ─── Negative Knowledge ────────────────────────────────────────────────────
    } else if (command === 'negative-knowledge' && subcommand === 'record') {
      const nkArgs = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--title' && args[i + 1]) { nkArgs.title = args[++i]; }
        else if (args[i] === '--category' && args[i + 1]) { nkArgs.category = args[++i]; }
        else if (args[i] === '--files' && args[i + 1]) { nkArgs.filesInvolved = args[++i].split(',').map(f => f.trim()); }
        else if (args[i] === '--what-tried' && args[i + 1]) { nkArgs.whatTried = args[++i]; }
        else if (args[i] === '--why-failed' && args[i + 1]) { nkArgs.whyFailed = args[++i]; }
        else if (args[i] === '--what-worked' && args[i + 1]) { nkArgs.whatWorked = args[++i]; }
        else if (args[i] === '--phase' && args[i + 1]) { nkArgs.phase = args[++i]; }
      }
      if (!nkArgs.title || !nkArgs.category) error('Usage: negative-knowledge record --title "..." --category <cat> --files "a,b" --what-tried "..." --why-failed "..."');
      const result = getNegativeKnowledge().recordFailure(planningDir, nkArgs);
      output(result);
    } else if (command === 'negative-knowledge' && subcommand === 'query') {
      let files = [];
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--files' && args[i + 1]) { files = args[++i].split(',').map(f => f.trim()); }
      }
      if (files.length === 0) error('Usage: negative-knowledge query --files "path1,path2"');
      output(getNegativeKnowledge().queryByFiles(planningDir, files));
    } else if (command === 'negative-knowledge' && subcommand === 'list') {
      const filters = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--category' && args[i + 1]) { filters.category = args[++i]; }
        else if (args[i] === '--phase' && args[i + 1]) { filters.phase = args[++i]; }
        else if (args[i] === '--status' && args[i + 1]) { filters.status = args[++i]; }
      }
      output(getNegativeKnowledge().listFailures(planningDir, filters));
    } else if (command === 'negative-knowledge') {
      error(`Unknown negative-knowledge subcommand: ${subcommand}\nAvailable: record, query, list`);

    // ─── Graph Operations ─────────────────────────────────────────────────────
    } else if (command === 'graph') {
      const graphCli = require('./lib/graph-cli.cjs');
      graphCli.handleGraphCommand(subcommand, args, planningDir, cwd, output, error);

    // ─── Unknown Command ──────────────────────────────────────────────────────
    } else {
      const allCommands = 'state load|check-progress|update|get|json|patch|advance-plan|record-metric|record-activity|update-progress|add-decision|add-blocker|resolve-blocker|record-session, state-bundle, state-snapshot, config validate|load-defaults|save-defaults|resolve-depth|get|set|ensure-section, phase add|remove|list|complete|insert|info|commits-for|first-last-commit|next-decimal, phases list, phase-info, phase-plan-index, find-phase, plan-index, must-haves, roadmap get-phase|analyze|update-plan-progress|update-status|update-plans|append-phase|remove-phase|insert-phase, init execute-phase|plan-phase|new-project|new-milestone|quick|resume|verify-work|phase-op|todos|milestone-op|map-codebase|progress, todo list|get|add|done, decisions record|list, negative-knowledge record|query|list, history append|load, history-digest, learnings ingest|query|check-thresholds, intel query|update|status|diff, staleness-check, summary-gate, checkpoint init|update, seeds match, ci-poll, rollback, build-preview, llm health|status|classify|score-source|classify-error|summarize|metrics|adjust-thresholds, session get|set|clear|dump, claim acquire|release|list, verify plan-structure|phase-completeness|references|commits|artifacts|key-links, verify-summary, validate consistency|health, validate-project, frontmatter get|set|merge|validate, template select|fill, milestone complete|stats, milestone-stats, requirements mark-complete, scaffold, resolve-model, generate-slug|slug-generate, quick init, current-timestamp, verify-path-exists, summary-extract, websearch, progress, commit, reference, skill-section, step-verify, context-triage, suggest-alternatives, spot-check, status render|fingerprint, parse-args plan|quick, migrate, event, dashboard [port|stop], tmux detect, help';
      error(`Unknown command: ${args.join(' ')}\nCommands: ${allCommands}`);
    }
  } catch (e) {
    getCore().error(e.message);
  }
}

if (require.main === module || process.argv[1] === __filename) {
  main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); });
}

module.exports = { main };

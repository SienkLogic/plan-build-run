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
 *   lib/history.js — History operations (append to STATE.md ## History, load with HISTORY.md fallback)
 *
 * Skills call this via:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js <command> [args]
 *
 * Commands:
 *   state load              — Full project state as JSON
 *   state check-progress    — Recalculate progress from filesystem
 *   state update <f> <v>    — Atomically update a STATE.md field
 *   config validate          — Validate config.json against schema
 *   config get <dot.path>   — Read a config value by dot-path key
 *   intel query <term>      — Search intel files for a term
 *   intel status             — Report staleness of each intel file
 *   intel diff               — Show changes since last refresh snapshot
 *   requirements mark-complete <ids> — Mark comma-separated REQ-IDs as complete
 *   plan-index <phase>      — Plan inventory for a phase, grouped by wave
 *   frontmatter <filepath>  — Parse .md file's YAML frontmatter → JSON
 *   must-haves <phase>      — Collect all must-haves from phase plans → JSON
 *   phase-info <phase>      — Comprehensive single-phase status → JSON
 *   roadmap update-status <phase> <status>      — Update phase status in ROADMAP.md
 *   roadmap update-plans <phase> <complete> <total> — Update phase plans in ROADMAP.md
 *   roadmap reconcile                              — Reconcile ROADMAP statuses against disk state
 *   roadmap get-phase <N>                          — Get comprehensive phase info JSON (alias for phase-info)
 *   roadmap append-phase [--goal "..."] [--name "..."] [--depends-on N] — Append a new phase to the roadmap
 *   history append <type> <title> [body] — Append record to STATE.md ## History (fallback: HISTORY.md)
 *   history load                         — Load history records as JSON (STATE.md first, HISTORY.md fallback)
 *   todo list [--theme X] [--status Y]  — List todos as JSON (default: pending)
 *   todo get <NNN>                       — Get a specific todo by number
 *   todo add <title> [--priority P] [--theme T] — Add a new todo
 *   todo done <NNN>                      — Mark a todo as complete
 *   auto-cleanup --phase N | --milestone vN — Auto-close todos and archive notes matching phase/milestone deliverables
 *   state reconcile          — Detect and repair STATE.md/ROADMAP.md desync
 *   state backup             — Create timestamped backup of STATE.md and ROADMAP.md
 *   llm <subcommand>                     — DEPRECATED: local_llm removed (no-op)
 *   validate-project        — Comprehensive .planning/ integrity check
 *   phase add <slug> [--after N] [--goal "..."] [--depends-on N] — Add phase with ROADMAP.md integration
 *   phase remove <N>             — Remove an empty phase directory (with renumbering)
 *   phase list [--status S] [--before N] — List phase directories with optional status/before filters
 *   phase complete <N>           — Mark phase N complete, advance STATE.md to next phase
 *   phase insert <N> <slug> [--goal "..."] [--depends-on N] — Insert phase at position N, renumber subsequent
 *   phase commits-for <N>       — Read .phase-manifest.json for phase N, output commits JSON. Falls back to git log
 *   phase first-last-commit <N> — Output { first, last } commit hashes from manifest or git log
 *   learnings ingest <json-file>  — Ingest a learning entry into global store
 *   learnings query [--tags X] [--min-confidence Y] [--stack S] [--type T] — Query learnings
 *   learnings check-thresholds   — Check deferral trigger conditions
 *   learnings copy-global <path> <proj> — Copy cross_project LEARNINGS.md to ~/.claude/pbr-knowledge/
 *   learnings query-global [--tags X] [--project P] — Query global knowledge files
 *   data status                      — Freshness report for research/, intel/, codebase/ directories
 *   data prune --before <ISO-date> [--dry-run] — Archive stale research/codebase files
 *   incidents list [--limit N]       — List recent incidents as JSON array
 *   incidents summary               — Aggregate incident stats by type/severity/source
 *   incidents query [--type T] [--severity S] [--source S] [--last Nd|Nh] — Filter incidents
 *   nk record --title "..." --category "..." --files "f1,f2" --tried "..." --failed "..." — Record negative knowledge entry
 *   nk list [--category X] [--phase X] [--status X] — List negative knowledge entries
 *   nk resolve <slug>               — Mark a negative knowledge entry as resolved
 *   insights import <html-path> [--project <name>] — Parse insights HTML report into learnings
 *   audit plan-checks [--last N]     — List all plan-check results from hooks.jsonl (default: last 30 days)
 *   spot-check <phaseSlug> <planId>  — Verify SUMMARY, key_files, and commits exist for a plan
 *   staleness-check <phase-slug>  — Check if phase plans are stale vs dependencies
 *   summary-gate <phase-slug> <plan-id>  — Verify SUMMARY.md exists, non-empty, valid frontmatter
 *   checkpoint init <phase-slug> [--plans "id1,id2"]  — Initialize checkpoint manifest
 *   checkpoint update <phase-slug> --wave N --resolved id [--sha hash]  — Update manifest
 *   seeds match <phase-slug> <phase-number>  — Find matching seed files for a phase
 *   session get <key>              — Read a key from .planning/.session.json
 *   session set <key> <value>      — Write a key to .planning/.session.json
 *   session clear [key]            — Delete .session.json or set key to null
 *   session dump                   — Print entire .session.json content
 *   skill-section <skill> <section>       — Extract a section from a skill's SKILL.md → JSON
 *   skill-section --list <skill>          — List all headings in a skill → JSON
 *   step-verify [skill] [step] [checklist-json]  — Validate per-step completion checklist → JSON
 *   build-preview [phase-slug]            — Preview what /pbr:execute-phase would do for a phase → JSON
 *   claim acquire <phase-slug> --session-id <id> --skill <name> — Acquire phase claim
 *   claim release <phase-slug> --session-id <id>              — Release phase claim
 *   claim list                                                 — List all active phase claims
 *   suggest-alternatives phase-not-found [slug]       — List available phases for unknown slug → JSON
 *   suggest-alternatives missing-prereq [phase]        — List missing prerequisites for a phase → JSON
 *   suggest-alternatives config-invalid [field] [val]  — List valid values for invalid config field → JSON
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
  writeActiveSkill,
  sessionLoad,
  sessionSave,
  SESSION_ALLOWED_KEYS,
  STALE_SESSION_MS,
  resolveSessionPath,
  acquireClaim,
  releaseClaim,
  releaseSessionClaims: _releaseSessionClaims,
  listClaims: _listClaims
} = require('./lib/core');

const {
  configLoad: _configLoad,
  configClearCache: _configClearCache,
  configValidate: _configValidate,
  configFormat: _configFormat,
  configWrite: _configWrite,
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
  stateRecordMetric: _stateRecordMetric,
  stateRecordActivity: _stateRecordActivity,
  stateUpdateProgress: _stateUpdateProgress
} = require('./lib/state');

const {
  stateReconcile: _stateReconcile,
  stateBackup: _stateBackup
} = require('./lib/state');

const {
  parseRoadmapMd,
  findRoadmapRow,
  updateTableRow,
  roadmapUpdateStatus: _roadmapUpdateStatus,
  roadmapUpdatePlans: _roadmapUpdatePlans,
  roadmapAnalyze: _roadmapAnalyze,
  roadmapAppendPhase: _roadmapAppendPhase,
  roadmapRemovePhase: _roadmapRemovePhase,
  roadmapRenumberPhases: _roadmapRenumberPhases,
  roadmapInsertPhase: _roadmapInsertPhase,
  reconcileRoadmapStatuses: _reconcileRoadmapStatuses
} = require('./lib/roadmap');

const {
  frontmatter: _frontmatter,
  planIndex: _planIndex,
  mustHavesCollect: _mustHavesCollect,
  phaseInfo: _phaseInfo,
  phaseAdd: _phaseAdd,
  phaseRemove: _phaseRemove,
  phaseList: _phaseList,
  milestoneStats: _milestoneStats,
  phaseComplete: _phaseComplete,
  phaseInsert: _phaseInsert
} = require('./lib/phase');

const {
  initExecutePhase: _initExecutePhase,
  initPlanPhase: _initPlanPhase,
  initQuick: _initQuick,
  initVerifyWork: _initVerifyWork,
  initResume: _initResume,
  initProgress: _initProgress,
  initStateBundle: _initStateBundle,
  initContinue: _initContinue,
  initMilestone: _initMilestone,
  initBegin: _initBegin,
  initStatus: _initStatus
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
  autoCloseTodos: _autoCloseTodos,
  autoArchiveNotes: _autoArchiveNotes
} = require('./lib/auto-cleanup');

const {
  applyMigrations: _applyMigrations
} = require('./lib/migrate');

const {
  spotCheck: _spotCheck,
  verifySpotCheck: _verifySpotCheck
} = require('./lib/spot-check');

const {
  learningsIngest: _learningsIngest,
  learningsQuery: _learningsQuery,
  checkDeferralThresholds: _checkDeferralThresholds,
  copyToGlobal: _copyToGlobal,
  queryGlobal: _queryGlobal
} = require('./lib/learnings');

const {
  insightsImport: _insightsImport
} = require('./lib/insights-parser');

const {
  referenceGet: _referenceGet
} = require('./lib/reference');

const {
  skillSection: _skillSection,
  listAvailableSkills: _listAvailableSkills
} = require('./lib/skill-section');

const {
  stepVerify: _stepVerify
} = require('./lib/step-verify');

const {
  buildPreview: _buildPreview
} = require('./lib/preview');

const {
  contextTriage: _contextTriage
} = require('./lib/context');

const {
  phaseAlternatives: _phaseAlternatives,
  prerequisiteAlternatives: _prereqAlternatives,
  configAlternatives: _configAlternatives
} = require('./lib/alternatives');

const {
  stalenessCheck: _stalenessCheck,
  summaryGate: _summaryGate,
  checkpointInit: _checkpointInit,
  checkpointUpdate: _checkpointUpdate,
  seedsMatch: _seedsMatch,
  ciPoll: _ciPoll,
  rollback: _rollback
} = require('./lib/build');

const {
  parseJestOutput: _parseJestOutput,
  parseLintOutput: _parseLintOutput,
  autoFixLint: _autoFixLint,
  runCiFixLoop: _runCiFixLoop
} = require('./lib/ci-fix-loop');

const {
  statusRender: _statusRender
} = require('./lib/status-render');

const {
  suggestNext: _suggestNext
} = require('./lib/suggest-next');

const {
  quickStatus: _quickStatus
} = require('./quick-status');

// --- Local LLM imports removed (feature archived in phase 53) ---

const {
  dataStatus: _dataStatus,
  dataPrune: _dataPrune
} = require('./lib/data-hygiene');

const {
  list: _incidentsList,
  query: _incidentsQuery,
  summary: _incidentsSummary
} = require('./lib/incidents');

// --- Module-level state (for backwards compatibility) ---

let cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
// MSYS path bridging: Git Bash on Windows can produce /d/Repos/... paths
// that Node.js cannot resolve. Convert to D:\Repos\... form.
const _msysCwdMatch = cwd.match(/^\/([a-zA-Z])\/(.*)/);
if (_msysCwdMatch) cwd = _msysCwdMatch[1] + ':' + path.sep + _msysCwdMatch[2].replace(/\//g, path.sep);
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
  const _msysResetMatch = cwd.match(/^\/([a-zA-Z])\/(.*)/);
  if (_msysResetMatch) cwd = _msysResetMatch[1] + ':' + path.sep + _msysResetMatch[2].replace(/\//g, path.sep);
  planningDir = path.join(cwd, '.planning');
}

function configValidate(preloadedConfig) {
  return _configValidate(preloadedConfig, planningDir);
}

function insightsImport(htmlPath, projectName) {
  return _insightsImport(htmlPath, projectName, planningDir);
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

function stateRecordActivity(description) {
  return _stateRecordActivity(description, planningDir);
}

function stateUpdateProgress() {
  return _stateUpdateProgress(planningDir);
}

function stateReconcile() {
  return _stateReconcile(planningDir);
}

function stateBackup() {
  return _stateBackup(planningDir);
}

function roadmapAnalyze() {
  return _roadmapAnalyze(planningDir);
}

function roadmapUpdateStatus(phaseNum, newStatus) {
  return _roadmapUpdateStatus(phaseNum, newStatus, planningDir);
}

function roadmapUpdatePlans(phaseNum, complete, total) {
  return _roadmapUpdatePlans(phaseNum, complete, total, planningDir);
}

function roadmapReconcile() {
  return _reconcileRoadmapStatuses(planningDir);
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

function phaseAdd(slug, afterPhase, options) {
  return _phaseAdd(slug, afterPhase, planningDir, options);
}

function phaseRemove(phaseNum) {
  return _phaseRemove(phaseNum, planningDir);
}

function phaseList(opts) {
  return _phaseList(planningDir, opts);
}

function phaseComplete(phaseNum) {
  return _phaseComplete(phaseNum, planningDir);
}

function phaseInsert(position, slug, options) {
  return _phaseInsert(position, slug, planningDir, options);
}

function milestoneStats(version) {
  return _milestoneStats(version, planningDir);
}

function initExecutePhase(phaseNum, overridePlanningDir, overrideModel) {
  return _initExecutePhase(phaseNum, overridePlanningDir || planningDir, overrideModel);
}

function initPlanPhase(phaseNum, overridePlanningDir, overrideModel) {
  return _initPlanPhase(phaseNum, overridePlanningDir || planningDir, overrideModel);
}

function initQuick(description) {
  return _initQuick(description, planningDir);
}

function initVerifyWork(phaseNum, overridePlanningDir, overrideModel) {
  return _initVerifyWork(phaseNum, overridePlanningDir || planningDir, overrideModel);
}

function initResume() {
  return _initResume(planningDir);
}

function initProgress() {
  return _initProgress(planningDir);
}

function initContinue() {
  return _initContinue(planningDir);
}

function initMilestone() {
  return _initMilestone(planningDir);
}

function initBegin() {
  return _initBegin(planningDir);
}

function initStatus() {
  return _initStatus(planningDir);
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

function autoCloseTodos(context) {
  return _autoCloseTodos(planningDir, context);
}

function autoArchiveNotes(context) {
  return _autoArchiveNotes(planningDir, context);
}

function incidentsList(opts) {
  return _incidentsList({ ...opts, planningDir });
}
function incidentsQuery(filter, opts) {
  return _incidentsQuery(filter, { ...opts, planningDir });
}
function incidentsSummary(opts) {
  return _incidentsSummary({ ...opts, planningDir });
}

function intelQuery(term) {
  const { intelQuery: _intelQuery } = require('./lib/intel');
  return _intelQuery(term, planningDir);
}

function intelStatus() {
  const { intelStatus: _intelStatus } = require('./lib/intel');
  return _intelStatus(planningDir);
}

function intelDiff() {
  const { intelDiff: _intelDiff } = require('./lib/intel');
  return _intelDiff(planningDir);
}

function requirementsMarkComplete(ids) {
  const { updateRequirementStatus } = require('./lib/requirements');
  return updateRequirementStatus(planningDir, ids, 'done');
}

function roadmapAppendPhase(phaseNum, name, goal, dependsOn) {
  return _roadmapAppendPhase(planningDir, phaseNum, name, goal, dependsOn);
}

function dataStatus() {
  return _dataStatus(planningDir);
}

function dataPrune(options) {
  return _dataPrune(planningDir, options);
}

function migrate(options) {
  return _applyMigrations(planningDir, options);
}

function spotCheck(phaseDir, planId) {
  return _spotCheck(planningDir, phaseDir, planId);
}

function verifySpotCheck(type, dirPath) {
  return _verifySpotCheck(type, dirPath);
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

function resolvePluginRoot() {
  // Resolve plugin root — try CLAUDE_PLUGIN_ROOT env, then walk up from __dirname
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  // Fix MSYS paths on Windows (same pattern as run-hook.js)
  let root = pluginRoot;
  const msysMatch = root.match(/^\/([a-zA-Z])\/(.*)/);
  if (msysMatch) root = msysMatch[1] + ':' + path.sep + msysMatch[2];
  return root;
}

function skillSectionGet(skillName, sectionQuery) {
  return _skillSection(skillName, sectionQuery, resolvePluginRoot());
}

function listSkillHeadings(skillName) {
  const { listHeadings } = require('./lib/reference');
  const root = resolvePluginRoot();
  const skillPath = require('path').join(root, 'skills', skillName, 'SKILL.md');
  if (!require('fs').existsSync(skillPath)) {
    return { error: `Skill not found: ${skillName}`, available: _listAvailableSkills(root) };
  }
  const content = require('fs').readFileSync(skillPath, 'utf8');
  return { skill: skillName, headings: listHeadings(content) };
}

function contextTriage(options) {
  return _contextTriage(options, planningDir);
}

function stalenessCheck(phaseSlug) { return _stalenessCheck(phaseSlug, planningDir); }
function summaryGate(phaseSlug, planId) { return _summaryGate(phaseSlug, planId, planningDir); }
function checkpointInit(phaseSlug, plans) { return _checkpointInit(phaseSlug, plans, planningDir); }
function checkpointUpdate(phaseSlug, opts) { return _checkpointUpdate(phaseSlug, opts, planningDir); }
function seedsMatch(phaseSlug, phaseNum) { return _seedsMatch(phaseSlug, phaseNum, planningDir); }
function ciPoll(runId, timeoutSecs) { return _ciPoll(runId, timeoutSecs, planningDir); }
function ciFix(options) { return _runCiFixLoop({ ...options, cwd: path.resolve('.') }); }
function rollbackPlan(manifestPath) { return _rollback(manifestPath, planningDir); }

function quickStatus() { return _quickStatus(planningDir); }

/**
 * Build cleanup context from phase SUMMARY files and git log.
 * @param {string} phaseNum - Phase number (e.g. "38")
 * @returns {{ phaseName: string, phaseNum: string, keyFiles: string[], commitMessages: string[], summaryDescriptions: string[] }}
 */
function buildCleanupContext(phaseNum) {
  const padded = String(phaseNum).padStart(2, '0');
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) throw new Error('No phases directory found');

  const phaseDir = fs.readdirSync(phasesDir).find(d => d.startsWith(padded + '-'));
  if (!phaseDir) throw new Error(`Phase ${phaseNum} directory not found`);

  const phaseName = phaseDir.replace(/^\d+-/, '').replace(/-/g, ' ');
  const phaseDirPath = path.join(phasesDir, phaseDir);

  // Collect key_files and descriptions from all SUMMARY files
  const keyFiles = [];
  const summaryDescriptions = [];
  const summaryFiles = fs.readdirSync(phaseDirPath).filter(f => /^SUMMARY/i.test(f) && f.endsWith('.md'));
  for (const sf of summaryFiles) {
    try {
      const content = fs.readFileSync(path.join(phaseDirPath, sf), 'utf8');
      const fm = parseYamlFrontmatter(content);
      if (fm.key_files && Array.isArray(fm.key_files)) {
        keyFiles.push(...fm.key_files.map(kf => typeof kf === 'string' ? kf.split(':')[0].trim() : ''));
      }
      if (fm.provides && Array.isArray(fm.provides)) {
        summaryDescriptions.push(...fm.provides);
      }
    } catch (_e) { /* skip unreadable summaries */ }
  }

  // Get recent commit messages
  let commitMessages = [];
  try {
    const { execSync } = require('child_process');
    const log = execSync('git log --oneline -20', { encoding: 'utf8', cwd: path.join(planningDir, '..') });
    commitMessages = log.split('\n').filter(l => l.trim()).map(l => {
      const parts = l.match(/^[0-9a-f]+\s+(.*)/);
      return parts ? parts[1] : '';
    }).filter(Boolean);
  } catch (_e) { /* git not available */ }

  return { phaseName, phaseNum: String(phaseNum), keyFiles, commitMessages, summaryDescriptions };
}

// --- Phase commit query functions ---

/**
 * Read .phase-manifest.json for phase N, output JSON array of commits.
 * Falls back to git log if no manifest exists.
 */
function _phaseCommitsFor(phaseNum) {
  const padded = String(phaseNum).padStart(2, '0');
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return { error: 'No phases directory found' };

  const phaseDir = fs.readdirSync(phasesDir).find(d => d.startsWith(padded + '-'));
  if (!phaseDir) return { error: `Phase ${phaseNum} directory not found` };

  const manifestPath = path.join(phasesDir, phaseDir, '.phase-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return { source: 'manifest', commits: manifest.commits || [] };
    } catch (_e) { /* fall through to git log */ }
  }

  // Fallback: scan git log for commits matching this phase scope
  try {
    const { execSync } = require('child_process');
    const log = execSync('git log --oneline --no-merges -100', { encoding: 'utf8' });
    const phasePattern = new RegExp(`\\((${padded}-|phase.*${phaseNum})`, 'i');
    const commits = log.split('\n')
      .filter(l => l.trim() && phasePattern.test(l))
      .map(l => {
        const parts = l.match(/^([0-9a-f]+)\s+(.*)/);
        return parts ? { hash: parts[1], message: parts[2] } : null;
      })
      .filter(Boolean);
    return { source: 'git_log', commits };
  } catch (_e) {
    return { error: 'Could not read git log', commits: [] };
  }
}

/**
 * Output { first, last } commit hashes from phase manifest or git log.
 */
function _phaseFirstLastCommit(phaseNum) {
  const result = _phaseCommitsFor(phaseNum);
  if (result.error && !result.commits) return result;
  const commits = result.commits || [];
  return {
    source: result.source,
    first: commits.length > 0 ? commits[0].hash : null,
    last: commits.length > 0 ? commits[commits.length - 1].hash : null,
    total: commits.length
  };
}

// --- Claim wrapper functions ---

function claimAcquire(phaseSlug, sessionId, skill) {
  const phaseDir = path.join(planningDir, 'phases', phaseSlug);
  if (!fs.existsSync(phaseDir)) return { error: `Phase directory not found: ${phaseSlug}` };
  return acquireClaim(planningDir, phaseDir, sessionId, skill);
}

function claimRelease(phaseSlug, sessionId) {
  const phaseDir = path.join(planningDir, 'phases', phaseSlug);
  if (!fs.existsSync(phaseDir)) return { error: `Phase directory not found: ${phaseSlug}` };
  return releaseClaim(planningDir, phaseDir, sessionId);
}

function claimList() {
  return _listClaims(planningDir);
}

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

  // 8. Session directory scan — count active, flag stale
  const sessionsResult = { count: 0, active: [], stale: [] };
  const sessionsDir = path.join(planningDir, '.sessions');
  try {
    if (fs.existsSync(sessionsDir)) {
      const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        sessionsResult.count++;
        sessionsResult.active.push(entry.name);

        // Check for staleness via meta.json
        const metaPath = path.join(sessionsDir, entry.name, 'meta.json');
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const ageMs = Date.now() - new Date(meta.created).getTime();
          if (ageMs > STALE_SESSION_MS) {
            sessionsResult.stale.push(entry.name);
          }
        } catch (_metaErr) {
          // Fall back to directory mtime
          try {
            const stats = fs.statSync(path.join(sessionsDir, entry.name));
            const ageMs = Date.now() - stats.mtimeMs;
            if (ageMs > STALE_SESSION_MS) {
              sessionsResult.stale.push(entry.name);
            }
          } catch (_statErr) { /* skip */ }
        }
      }

      if (sessionsResult.stale.length > 0) {
        warnings.push(`${sessionsResult.stale.length} stale session(s) found: ${sessionsResult.stale.join(', ')}. Run cleanStaleSessions to remove.`);
        checks.push('sessions_stale: WARN');
      } else {
        checks.push('sessions_stale: PASS');
      }

      // Check for singleton .active-skill coexisting with session-scoped ones
      if (fs.existsSync(path.join(planningDir, '.active-skill'))) {
        let hasSessionSkill = false;
        for (const sid of sessionsResult.active) {
          if (fs.existsSync(path.join(sessionsDir, sid, '.active-skill'))) {
            hasSessionSkill = true;
            break;
          }
        }
        if (hasSessionSkill) {
          warnings.push('.active-skill exists at both singleton and session-scoped paths — possible migration artifact. Consider removing the singleton .planning/.active-skill.');
          checks.push('active_skill_dual: WARN');
        }
      }
    }
  } catch (_e) { /* best effort */ }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
    sessions: sessionsResult
  };
}

// --- Spec subcommand handler ---

/**
 * Handle spec subcommands: parse, diff, reverse, impact.
 * @param {string[]} args - raw CLI args (args[0] is 'spec', args[1] is subcommand)
 * @param {string} pDir - planningDir
 * @param {string} projectRoot - cwd
 * @param {Function} outputFn - output function
 * @param {Function} errorFn - error function
 */
function handleSpec(args, pDir, projectRoot, outputFn, errorFn) {
  const subcommand = args[1];

  // Parse common flags
  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'json';
  const projectRootIdx = args.indexOf('--project-root');
  const effectiveRoot = projectRootIdx !== -1 ? args[projectRootIdx + 1] : projectRoot;

  // Load config for feature toggle checks
  let config = {};
  try {
    const configPath = path.join(pDir, 'config.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (_e) {
    // Config unreadable — use defaults
  }
  const features = config.features || {};

  // Audit log helper
  function writeAuditLog(cmd, featureName, status, fileCount) {
    try {
      const logDir = path.join(pDir, 'logs');
      if (fs.existsSync(logDir)) {
        const logFile = path.join(logDir, 'spec-engine.jsonl');
        const entry = JSON.stringify({
          ts: new Date().toISOString(),
          cmd: `spec.${cmd}`,
          feature: featureName,
          status,
          files: fileCount || 0,
        });
        fs.appendFileSync(logFile, entry + '\n', 'utf-8');
      }
    } catch (_e2) {
      // No-op if log dir missing or unwritable
    }
  }

  if (!subcommand || subcommand === '--help' || subcommand === 'help') {
    const usageText = [
      'Usage: spec <subcommand> [args] [--format json|markdown]',
      '',
      'Subcommands:',
      '  parse <plan-file>           Parse PLAN.md into structured JSON',
      '  diff <file-a> <file-b>      Semantic diff between two PLAN.md versions',
      '  reverse <file...>           Generate spec from source files',
      '  impact <file...>            Predict impact of changed files',
      '',
      'Flags:',
      '  --format json|markdown      Output format (default: json)',
      '  --project-root <path>       Project root for impact analysis',
    ].join('\n');
    outputFn(null, true, usageText);
    return;
  }

  if (subcommand === 'parse') {
    const planFile = args[2];
    if (!planFile) { errorFn('Usage: spec parse <plan-file>'); return; }
    const { parsePlanToSpec } = require('./lib/spec-engine');
    let content;
    try {
      content = fs.readFileSync(planFile, 'utf-8');
    } catch (e) {
      errorFn(`Cannot read file: ${planFile}: ${e.message}`);
      return;
    }
    const spec = parsePlanToSpec(content);
    writeAuditLog('parse', 'machine_executable_plans', 'ok', 1);
    outputFn({ frontmatter: spec.frontmatter, tasks: spec.tasks });
    return;
  }

  if (subcommand === 'diff') {
    if (features.spec_diffing === false) {
      outputFn({ error: 'Feature disabled. Enable features.spec_diffing in config.json' });
      return;
    }
    const fileA = args[2];
    const fileB = args[3];
    if (!fileA || !fileB) { errorFn('Usage: spec diff <file-a> <file-b>'); return; }
    const { diffPlanFiles, formatDiff } = require('./lib/spec-diff');
    let contentA, contentB;
    try {
      contentA = fs.readFileSync(fileA, 'utf-8');
      contentB = fs.readFileSync(fileB, 'utf-8');
    } catch (e) {
      errorFn(`Cannot read file: ${e.message}`);
      return;
    }
    const diff = diffPlanFiles(contentA, contentB);
    writeAuditLog('diff', 'spec_diffing', 'ok', 2);
    if (format === 'markdown') {
      outputFn(null, true, formatDiff(diff, 'markdown'));
    } else {
      outputFn(diff);
    }
    return;
  }

  if (subcommand === 'reverse') {
    if (features.reverse_spec === false) {
      outputFn({ error: 'Feature disabled. Enable features.reverse_spec in config.json' });
      return;
    }
    const files = [];
    for (let i = 2; i < args.length; i++) {
      if (!args[i].startsWith('--')) files.push(args[i]);
    }
    if (files.length === 0) { errorFn('Usage: spec reverse <file...>'); return; }
    const { generateReverseSpec } = require('./lib/reverse-spec');
    const { serializeSpec } = require('./lib/spec-engine');
    const spec = generateReverseSpec(files, { readFile: (p) => fs.readFileSync(p, 'utf-8') });
    writeAuditLog('reverse', 'reverse_spec', 'ok', files.length);
    if (format === 'markdown') {
      outputFn(null, true, serializeSpec(spec));
    } else {
      outputFn(spec);
    }
    return;
  }

  if (subcommand === 'impact') {
    if (features.predictive_impact === false) {
      outputFn({ error: 'Feature disabled. Enable features.predictive_impact in config.json' });
      return;
    }
    const files = [];
    for (let i = 2; i < args.length; i++) {
      if (!args[i].startsWith('--') && args[i - 1] !== '--project-root') files.push(args[i]);
    }
    if (files.length === 0) { errorFn('Usage: spec impact <file...>'); return; }
    const { analyzeImpact } = require('./lib/impact-analysis');
    const report = analyzeImpact(files, effectiveRoot);
    writeAuditLog('impact', 'predictive_impact', 'ok', files.length);
    outputFn(report);
    return;
  }

  errorFn(`Unknown spec subcommand: ${subcommand}\nAvailable: parse, diff, reverse, impact`);
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
        error('Usage: pbr-tools.js state update <field> <value>\nFields: current_phase, status, plans_complete, last_activity, progress_percent, phase_slug, last_command, blockers');
      }
      output(stateUpdate(field, value));
    } else if (command === 'config' && subcommand === 'validate') {
      output(configValidate());
    } else if (command === 'validate' && subcommand === 'health') {
      const { getAllPhase10Checks } = require('./lib/health-checks');
      const checks = getAllPhase10Checks(planningDir);
      output({ phase10: checks, timestamp: new Date().toISOString() });
    } else if (command === 'config' && subcommand === 'load-defaults') {
      const defaults = loadUserDefaults();
      output(defaults || { exists: false, path: USER_DEFAULTS_PATH });
    } else if (command === 'config' && subcommand === 'save-defaults') {
      const config = configLoad();
      if (!config) error('No config.json found. Run /pbr:setup first.');
      output(saveUserDefaults(config));
    } else if (command === 'config' && subcommand === 'format') {
      const config = configLoad();
      if (!config) error('No config.json found.');
      _configWrite(planningDir, config);
      output({ formatted: true, path: path.join(planningDir, 'config.json') });
    } else if (command === 'config' && subcommand === 'resolve-depth') {
      const dir = args[2] || undefined;
      const config = configLoad(dir);
      output(resolveDepthProfile(config));
    } else if (command === 'config' && subcommand === 'get') {
      const key = args[2];
      if (!key) { error('Usage: config get <dot.path.key>'); }
      const cfg = configLoad();
      if (!cfg) { error('No config.json found'); }
      const parts = key.split('.');
      let val = cfg;
      for (const p of parts) {
        if (val == null || typeof val !== 'object') { val = undefined; break; }
        val = val[p];
      }
      if (val === undefined) { error(`Config key not found: ${key}`); }
      output(typeof val === 'object' ? val : { value: val });

    } else if (command === 'intel') {
      const subCmd = args[1];
      if (subCmd === 'query') {
        const term = args[2];
        if (!term) { error('Usage: intel query <term>'); }
        output(intelQuery(term));
      } else if (subCmd === 'status') {
        output(intelStatus());
      } else if (subCmd === 'diff') {
        output(intelDiff());
      } else {
        error('Usage: intel <query|status|diff>');
      }

    } else if (command === 'requirements' && subcommand === 'mark-complete') {
      const ids = args[2];
      if (!ids) { error('Usage: requirements mark-complete <comma-separated-REQ-IDs>'); }
      const idList = ids.split(',').map(s => s.trim());
      output(requirementsMarkComplete(idList));

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
    } else if (command === 'roadmap' && subcommand === 'analyze') {
      output(roadmapAnalyze());
    } else if (command === 'roadmap' && subcommand === 'reconcile') {
      const result = roadmapReconcile();
      if (result.fixed > 0) {
        process.stderr.write(`Reconciled ${result.fixed} ROADMAP entries\n`);
        for (const m of result.mismatches) {
          process.stderr.write(`  Phase ${m.phase}: ${m.from} -> ${m.to}\n`);
        }
      } else {
        process.stderr.write('ROADMAP statuses are consistent\n');
      }
      output(result);
    } else if (command === 'roadmap' && subcommand === 'get-phase') {
      const phaseNum = args[2];
      if (!phaseNum) { error('Usage: roadmap get-phase <phase_num>'); }
      output(phaseInfo(phaseNum));
    } else if (command === 'roadmap' && subcommand === 'append-phase') {
      const goalIdx = args.indexOf('--goal');
      const goal = goalIdx >= 0 ? args[goalIdx + 1] : args[2] || '';
      const nameIdx = args.indexOf('--name');
      const name = nameIdx >= 0 ? args[nameIdx + 1] : '';
      const depIdx = args.indexOf('--depends-on');
      const dependsOn = depIdx >= 0 ? args[depIdx + 1] : null;
      const analysis = roadmapAnalyze();
      const maxPhase = analysis.phases ? Math.max(...analysis.phases.map(p => p.num || 0), 0) : 0;
      const nextNum = maxPhase + 1;
      output(roadmapAppendPhase(nextNum, name || goal, goal, dependsOn));

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
    } else if (command === 'llm') {
      // local_llm feature has been removed (phase 53). All subcommands are no-ops.
      output({ deprecated: true, message: 'local_llm feature has been removed. This subcommand is a no-op.' });
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
    } else if (command === "init" && subcommand === "continue") {
      output(initContinue());
    } else if (command === "init" && subcommand === "milestone") {
      output(initMilestone());
    } else if (command === "init" && subcommand === "begin") {
      output(initBegin());
    } else if (command === "init" && subcommand === "status") {
      output(initStatus());
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
    } else if (command === "state" && subcommand === "record-activity") {
      const description = args.slice(2).join(' ');
      if (!description) error("Usage: pbr-tools.js state record-activity <description>");
      output(stateRecordActivity(description));
    } else if (command === "state" && subcommand === "update-progress") {
      output(stateUpdateProgress());
    } else if (command === 'state' && subcommand === 'reconcile') {
      output(stateReconcile());
    } else if (command === 'state' && subcommand === 'backup') {
      output(stateBackup());
    } else if (command === 'state' && subcommand === 'enqueue') {
      const field = args[2];
      const value = args[3];
      if (!field || value === undefined) { error('Usage: state enqueue <field> <value>'); }
      const { stateEnqueue } = require('./lib/state-queue');
      output(stateEnqueue(field, value, planningDir));
    } else if (command === 'state' && subcommand === 'drain') {
      const { stateDrain } = require('./lib/state-queue');
      output(stateDrain(planningDir));
    } else if (command === 'phase' && subcommand === 'add') {
      const slug = args[2];
      if (!slug) { error('Usage: phase add <slug> [--after N] [--goal "..."] [--depends-on N]'); }
      const afterIdx = args.indexOf('--after');
      const afterPhase = afterIdx !== -1 ? args[afterIdx + 1] : null;
      const goalIdx = args.indexOf('--goal');
      const goal = goalIdx !== -1 ? args[goalIdx + 1] : null;
      const depIdx = args.indexOf('--depends-on');
      const dependsOn = depIdx !== -1 ? args[depIdx + 1] : null;
      const addOpts = {};
      if (goal) addOpts.goal = goal;
      if (dependsOn) addOpts.dependsOn = dependsOn;
      output(phaseAdd(slug, afterPhase, Object.keys(addOpts).length > 0 ? addOpts : undefined));
    } else if (command === 'phase' && subcommand === 'remove') {
      const phaseNum = args[2];
      if (!phaseNum) { error('Usage: phase remove <phase_num>'); }
      output(phaseRemove(phaseNum));
    } else if (command === 'phase' && subcommand === 'list') {
      const statusIdx = args.indexOf('--status');
      const beforeIdx = args.indexOf('--before');
      const listOpts = {};
      if (statusIdx >= 0) listOpts.status = args[statusIdx + 1];
      if (beforeIdx >= 0) listOpts.before = args[beforeIdx + 1];
      output(phaseList(listOpts));
    } else if (command === 'phase' && subcommand === 'complete') {
      const phaseNum = args[2];
      if (!phaseNum) { error('Usage: phase complete <phase_num>'); }
      output(phaseComplete(phaseNum));
    } else if (command === 'phase' && subcommand === 'insert') {
      const position = args[2];
      const slug = args[3];
      if (!position || !slug) { error('Usage: phase insert <N> <slug> [--goal "..."] [--depends-on N]'); }
      const goalIdx = args.indexOf('--goal');
      const goal = goalIdx !== -1 ? args[goalIdx + 1] : null;
      const depIdx = args.indexOf('--depends-on');
      const dependsOn = depIdx !== -1 ? args[depIdx + 1] : null;
      const insertOpts = {};
      if (goal) insertOpts.goal = goal;
      if (dependsOn) insertOpts.dependsOn = dependsOn;
      output(phaseInsert(parseInt(position, 10), slug, Object.keys(insertOpts).length > 0 ? insertOpts : undefined));
    } else if (command === 'phase' && subcommand === 'commits-for') {
      const phaseNum = args[2];
      if (!phaseNum) { error('Usage: phase commits-for <N>'); }
      output(_phaseCommitsFor(phaseNum));
    } else if (command === 'phase' && subcommand === 'first-last-commit') {
      const phaseNum = args[2];
      if (!phaseNum) { error('Usage: phase first-last-commit <N>'); }
      output(_phaseFirstLastCommit(phaseNum));
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
    } else if (command === 'auto-cleanup') {
      const phaseFlag = args.indexOf('--phase');
      const milestoneFlag = args.indexOf('--milestone');
      if (phaseFlag !== -1 && args[phaseFlag + 1]) {
        const phaseNum = args[phaseFlag + 1];
        const context = buildCleanupContext(phaseNum);
        const todoResult = autoCloseTodos(context);
        const noteResult = autoArchiveNotes(context);
        output({ phase: phaseNum, todos: todoResult, notes: noteResult });
      } else if (milestoneFlag !== -1 && args[milestoneFlag + 1]) {
        const version = args[milestoneFlag + 1];
        // Parse ROADMAP.md to find phases in this milestone
        const roadmapPath = path.join(planningDir, 'ROADMAP.md');
        if (!fs.existsSync(roadmapPath)) { error('ROADMAP.md not found'); }
        const roadmap = fs.readFileSync(roadmapPath, 'utf8');
        const milestoneMatch = roadmap.match(new RegExp('Milestone.*' + version.replace(/\./g, '\\.') + '[\\s\\S]*?Phases:\\s*(\\d+)\\s*-\\s*(\\d+)'));
        if (!milestoneMatch) { error('Milestone ' + version + ' not found in ROADMAP.md'); }
        const startPhase = parseInt(milestoneMatch[1]);
        const endPhase = parseInt(milestoneMatch[2]);
        const allResults = { milestone: version, phases: [] };
        for (let p = startPhase; p <= endPhase; p++) {
          try {
            const ctx = buildCleanupContext(String(p));
            const todoRes = autoCloseTodos(ctx);
            const noteRes = autoArchiveNotes(ctx);
            allResults.phases.push({ phase: p, todos: todoRes, notes: noteRes });
          } catch (_e) { /* skip phases without SUMMARY */ }
        }
        output(allResults);
      } else {
        error('Usage: auto-cleanup --phase N | --milestone vN');
      }
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

      } else if (subCmd === 'copy-global') {
        const filePath = args[2];
        const projectName = args[3];
        if (!filePath || !projectName) { error('Usage: learnings copy-global <learnings-md-path> <project-name>'); process.exit(1); }
        output(_copyToGlobal(filePath, projectName));

      } else if (subCmd === 'query-global') {
        const filters = {};
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[++i].split(',').map(t => t.trim()); }
          else if (args[i] === '--project' && args[i + 1]) { filters.project = args[++i]; }
        }
        output(_queryGlobal(filters));

      } else {
        error('Usage: learnings <ingest|query|check-thresholds|copy-global|query-global>');
        process.exit(1);
      }
    } else if (command === 'insights') {
      const subCmd = args[1];
      if (subCmd === 'import') {
        const htmlPath = args[2];
        if (!htmlPath) { error('Usage: insights import <html-file-path> [--project <name>]'); process.exit(1); }
        let projectName;
        for (let i = 3; i < args.length; i++) {
          if (args[i] === '--project' && args[i + 1]) { projectName = args[++i]; }
        }
        const result = insightsImport(htmlPath, projectName);
        output(result);
      } else {
        error('Usage: insights <import>');
        process.exit(1);
      }
    } else if (command === 'verify' && subcommand === 'spot-check') {
      const scType = args[2];
      const scPath = args[3];
      if (!scType || !scPath) { error('Usage: verify spot-check <type> <path>  (types: plan, summary, verification, quick)'); }
      const result = verifySpotCheck(scType, scPath);
      if (result.error) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exit(1); }
      output(result);

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
    } else if (command === 'ci-poll') {
      const runId = args[1];
      const timeoutIdx = args.indexOf('--timeout');
      const timeoutSecs = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1], 10) : 300;
      if (!runId) { error('Usage: pbr-tools.js ci-poll <run-id> [--timeout <seconds>]'); return; }
      output(ciPoll(runId, timeoutSecs));
    } else if (command === 'rollback') {
      const manifestPath = args[1];
      if (!manifestPath) { error('Usage: pbr-tools.js rollback <manifest-path>'); return; }
      output(rollbackPlan(manifestPath));
    } else if (command === 'session') {
      const sub = args[1];
      // Extract --session-id flag from remaining args
      const sessionIdIdx = args.indexOf('--session-id');
      const sessionId = sessionIdIdx !== -1 ? args[sessionIdIdx + 1] : null;
      // Filter out --session-id and its value from positional args
      const positional = sessionIdIdx !== -1
        ? args.filter((_a, i) => i !== sessionIdIdx && i !== sessionIdIdx + 1)
        : args;
      const key = positional[2];
      const value = positional[3];
      const dir = planningDir;
      if (sub === 'get') {
        if (!key) { error('Usage: pbr-tools.js session get <key> [--session-id <id>]'); return; }
        if (!SESSION_ALLOWED_KEYS.includes(key)) { error(`Unknown session key: ${key}. Allowed: ${SESSION_ALLOWED_KEYS.join(', ')}`); return; }
        const data = sessionLoad(dir, sessionId);
        const val = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        output({ key, value: val });
      } else if (sub === 'set') {
        if (!key || value === undefined) { error('Usage: pbr-tools.js session set <key> <value> [--session-id <id>]'); return; }
        if (!SESSION_ALLOWED_KEYS.includes(key)) { error(`Unknown session key: ${key}. Allowed: ${SESSION_ALLOWED_KEYS.join(', ')}`); return; }
        // Coerce numeric strings
        let coerced = value;
        if (/^\d+$/.test(value)) coerced = parseInt(value, 10);
        else if (value === 'null') coerced = null;
        const result = sessionSave(dir, { [key]: coerced }, sessionId);
        if (!result.success) { error(result.error || 'Failed to save session'); return; }
        output({ ok: true });
      } else if (sub === 'clear') {
        if (key) {
          // Clear a specific key — set to null
          if (!SESSION_ALLOWED_KEYS.includes(key)) { error(`Unknown session key: ${key}. Allowed: ${SESSION_ALLOWED_KEYS.join(', ')}`); return; }
          const result = sessionSave(dir, { [key]: null }, sessionId);
          if (!result.success) { error(result.error || 'Failed to clear session key'); return; }
        } else {
          // Clear entire session file
          const sessionPath = sessionId
            ? resolveSessionPath(dir, '.session.json', sessionId)
            : path.join(dir, '.session.json');
          try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath); } catch (e) { error(e.message); return; }
        }
        output({ ok: true });
      } else if (sub === 'dump') {
        const data = sessionLoad(dir, sessionId);
        output(data);
      } else {
        error('Usage: pbr-tools.js session get|set|clear|dump <key> [value] [--session-id <id>]');
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
    } else if (command === 'skill-section') {
      // skill-section --list <skill>  — list all headings
      if (args[1] === '--list') {
        const skillName = args[2];
        if (!skillName) { error('Usage: pbr-tools.js skill-section --list <skill>'); return; }
        const listResult = listSkillHeadings(skillName);
        output(listResult);
        if (listResult.error) process.exit(1);
      } else {
        // skill-section <skill> <section...>
        const skillName = args[1];
        const sectionQuery = args.slice(2).join(' ');
        if (!skillName || !sectionQuery) {
          error('Usage: pbr-tools.js skill-section <skill> <section>');
          return;
        }
        const secResult = skillSectionGet(skillName, sectionQuery);
        output(secResult);
        if (secResult.error) process.exit(1);
      }
    } else if (command === 'step-verify') {
      // step-verify <skill> <step> <checklist-json>
      const skill = args[1];
      const step = args[2];
      const checklistStr = args[3] || '[]';
      let checklist;
      try {
        checklist = JSON.parse(checklistStr);
      } catch (_e) {
        output({ error: 'Invalid checklist JSON' });
        process.exit(1);
        return;
      }
      const svPlanningDir = planningDir;
      const svContext = {
        planningDir: svPlanningDir,
        phaseSlug: process.env.PBR_PHASE_SLUG || '',
        planId: process.env.PBR_PLAN_ID || ''
      };
      const svResult = _stepVerify(skill, step, checklist, svContext);
      output(svResult);
      if (svResult.error || svResult.all_passed === false) process.exit(1);
    } else if (command === 'build-preview') {
      const phaseSlug = args[1];
      if (!phaseSlug) {
        error('Usage: pbr-tools.js build-preview <phase-slug>');
        return;
      }
      const previewPlanningDir = planningDir;
      const previewPluginRoot = path.resolve(__dirname, '..');
      const result = _buildPreview(phaseSlug, {}, previewPlanningDir, previewPluginRoot);
      if (result && result.error) {
        output(result);
        process.exit(1);
      }
      output(result);
    } else if (command === 'suggest-alternatives') {
      const errorType = args[1];
      const altPlanningDir = planningDir;
      if (errorType === 'phase-not-found') {
        output(_phaseAlternatives(args[2] || '', altPlanningDir));
      } else if (errorType === 'missing-prereq') {
        output(_prereqAlternatives(args[2] || '', altPlanningDir));
      } else if (errorType === 'config-invalid') {
        output(_configAlternatives(args[2] || '', args[3] || '', altPlanningDir));
      } else {
        output({ error: 'Unknown error type. Valid: phase-not-found, missing-prereq, config-invalid' });
        process.exit(1);
      }
    } else if (command === 'claim' && subcommand === 'acquire') {
      const phaseSlug = args[2];
      const sidIdx = args.indexOf('--session-id');
      const sessionId = sidIdx !== -1 ? args[sidIdx + 1] : null;
      const skillIdx = args.indexOf('--skill');
      const skill = skillIdx !== -1 ? args[skillIdx + 1] : 'unknown';
      if (!phaseSlug || !sessionId) {
        error('Usage: pbr-tools.js claim acquire <phase-slug> --session-id <id> --skill <name>');
      }
      output(claimAcquire(phaseSlug, sessionId, skill));
    } else if (command === 'claim' && subcommand === 'release') {
      const phaseSlug = args[2];
      const sidIdx = args.indexOf('--session-id');
      const sessionId = sidIdx !== -1 ? args[sidIdx + 1] : null;
      if (!phaseSlug || !sessionId) {
        error('Usage: pbr-tools.js claim release <phase-slug> --session-id <id>');
      }
      output(claimRelease(phaseSlug, sessionId));
    } else if (command === 'claim' && subcommand === 'list') {
      output(claimList());
    } else if (command === 'status' && subcommand === 'render') {
      output(_statusRender(planningDir));
    } else if (command === 'suggest-next') {
      output(_suggestNext(planningDir));
    } else if (command === 'tmux' && subcommand === 'detect') {
      const tmuxEnv = process.env.TMUX || '';
      const result = {
        in_tmux: !!tmuxEnv,
        pane: process.env.TMUX_PANE || null,
        session: null
      };
      if (tmuxEnv) {
        // TMUX env format: /socket/path,PID,INDEX
        const parts = tmuxEnv.split(',');
        if (parts.length >= 1) {
          result.session = parts[0].split('/').pop() || null;
        }
      }
      output(result);

    // ─── Quick Task Operations ─────────────────────────────────────────────────
    } else if (command === 'quick' && subcommand === 'init') {
      const desc = args.slice(2).join(' ') || '';
      const quickInitMod = require('./lib/quick-init.js');
      output(quickInitMod.quickInit(desc, planningDir));

    // ─── Slug Generation ─────────────────────────────────────────────────────
    } else if (command === 'generate-slug' || command === 'slug-generate') {
      const text = args.slice(1).join(' ');
      if (!text) error('Usage: pbr-tools.js generate-slug <text>');
      const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      output({ slug });

    // ─── Parse Args ────────────────────────────────────────────────────────────
    } else if (command === 'parse-args') {
      const type = args[1];
      const rawInput = args.slice(2).join(' ');
      if (!type) error('Usage: pbr-tools.js parse-args <type> <args>\nTypes: plan, quick');
      const { parseArgs } = require('./lib/parse-args');
      output(parseArgs(type, rawInput));

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

    } else if (command === 'quick-status') {
      const result = quickStatus();
      process.stdout.write(result.text + '\n');

    } else if (command === 'ci-fix') {
      const dryRun = args.includes('--dry-run');
      const maxIterIdx = args.indexOf('--max-iterations');
      const maxIterations = maxIterIdx !== -1 ? parseInt(args[maxIterIdx + 1], 10) : 3;
      output(ciFix({ dryRun, maxIterations }));

    // ─── Incidents ───────────────────────────────────────────────────────────
    } else if (command === 'incidents') {
      const sub = args[1];
      if (sub === 'list') {
        const limitIdx = args.indexOf('--limit');
        const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;
        output(incidentsList({ limit }));
      } else if (sub === 'summary') {
        output(incidentsSummary());
      } else if (sub === 'query') {
        const filter = {};
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--type' && args[i + 1]) { filter.type = args[++i]; }
          else if (args[i] === '--severity' && args[i + 1]) { filter.severity = args[++i]; }
          else if (args[i] === '--source' && args[i + 1]) { filter.source = args[++i]; }
          else if (args[i] === '--last' && args[i + 1]) { filter.last = args[++i]; }
        }
        output(incidentsQuery(filter));
      } else {
        error('Usage: incidents <list|summary|query> [--type T] [--severity S] [--source S] [--last Nd|Nh] [--limit N]');
      }

    } else if (command === 'nk') {
      // Lazy require to avoid loading for unrelated commands
      const nkLib = require(path.join(__dirname, 'lib', 'negative-knowledge'));

      if (subcommand === 'record') {
        const titleIdx = args.indexOf('--title');
        const categoryIdx = args.indexOf('--category');
        const filesIdx = args.indexOf('--files');
        const triedIdx = args.indexOf('--tried');
        const failedIdx = args.indexOf('--failed');
        const workedIdx = args.indexOf('--worked');
        const phaseIdx = args.indexOf('--phase');

        const title = titleIdx !== -1 ? args[titleIdx + 1] : null;
        const category = categoryIdx !== -1 ? args[categoryIdx + 1] : null;
        const tried = triedIdx !== -1 ? args[triedIdx + 1] : null;
        const failed = failedIdx !== -1 ? args[failedIdx + 1] : null;

        if (!title || !category || !tried || !failed) {
          error('Usage: pbr-tools.js nk record --title "..." --category "build-failure" --files "f1,f2" --tried "..." --failed "..."\nRequired: --title, --category, --tried, --failed\nCategories: build-failure, verification-gap, plan-revision, debug-finding');
        }

        const filesInvolved = filesIdx !== -1 ? (args[filesIdx + 1] || '').split(',').filter(Boolean) : [];
        const whatWorked = workedIdx !== -1 ? args[workedIdx + 1] : '';
        const phase = phaseIdx !== -1 ? args[phaseIdx + 1] : '';

        const result = nkLib.recordFailure(planningDir, {
          title, category, filesInvolved,
          whatTried: tried, whyFailed: failed,
          whatWorked, phase
        });
        output({ ok: true, path: result.path, slug: result.slug });

      } else if (subcommand === 'list') {
        const catIdx = args.indexOf('--category');
        const phIdx = args.indexOf('--phase');
        const stIdx = args.indexOf('--status');
        const filters = {};
        if (catIdx !== -1) filters.category = args[catIdx + 1];
        if (phIdx !== -1) filters.phase = args[phIdx + 1];
        if (stIdx !== -1) filters.status = args[stIdx + 1];
        output(nkLib.listFailures(planningDir, filters));

      } else if (subcommand === 'resolve') {
        const slug = args[2];
        if (!slug) {
          error('Usage: pbr-tools.js nk resolve <slug>');
        }
        nkLib.resolveEntry(planningDir, slug);
        output({ ok: true });

      } else {
        error('Usage: pbr-tools.js nk <record|list|resolve>\n  nk record --title "..." --category "..." --files "f1,f2" --tried "..." --failed "..."\n  nk list [--category X] [--phase X] [--status X]\n  nk resolve <slug>');
      }

    } else if (command === 'data') {
      const sub = args[1];
      if (sub === 'status') {
        output(dataStatus());
      } else if (sub === 'prune') {
        const beforeIdx = args.indexOf('--before');
        const before = beforeIdx !== -1 ? args[beforeIdx + 1] : null;
        const dryRun = args.includes('--dry-run');
        if (!before) {
          error('Usage: pbr-tools.js data prune --before <ISO-date> [--dry-run]');
        }
        output(dataPrune({ before, dryRun }));
      } else {
        error('Usage: pbr-tools.js data <status|prune>\n  data status — freshness report for research/, intel/, codebase/\n  data prune --before <ISO-date> [--dry-run] — archive stale files');
      }

    // --- Graph Operations ---
    } else if (command === 'graph') {
      const graphCli = require('./lib/graph-cli');
      graphCli.handleGraphCommand(subcommand, args, planningDir, cwd, output, error);

    // --- Audit Operations ---
    } else if (command === 'audit' && subcommand === 'plan-checks') {
      const { auditPlanChecks } = require('./lib/audit');
      const lastIdx = args.indexOf('--last');
      const last = lastIdx !== -1 ? parseInt(args[lastIdx + 1], 10) : 30;
      output(auditPlanChecks({ last }));

    // --- Spec Operations ---
    } else if (command === 'spec') {
      handleSpec(args, planningDir, cwd, output, error);

    } else {
      error(`Unknown command: ${args.join(' ')}\nCommands: state load|check-progress|update|patch|advance-plan|record-metric, config validate|load-defaults|save-defaults|resolve-depth, validate health, validate-project, migrate [--dry-run] [--force], init execute-phase|plan-phase|quick|verify-work|resume|progress, state-bundle <phase>, plan-index, frontmatter, must-haves, phase-info, phase add|remove|list|complete, roadmap update-status|update-plans, history append|load, todo list|get|add|done, auto-cleanup --phase N|--milestone vN, event, llm health|status|classify|score-source|classify-error|summarize|metrics [--session <ISO>]|adjust-thresholds, learnings ingest|query|check-thresholds, incidents list|summary|query, nk record|list|resolve, data status|prune, graph build|query|impact|stats, spec parse|diff|reverse|impact, milestone-stats <version>, context-triage [--agents-done N] [--plans-total N] [--step NAME], ci-poll <run-id> [--timeout <seconds>], ci-fix [--dry-run] [--max-iterations N], rollback <manifest-path>, session get|set|clear|dump, claim acquire|release|list, skill-section <skill> <section>|--list <skill>, step-verify <skill> <step> <checklist-json>, suggest-alternatives phase-not-found|missing-prereq|config-invalid [args], tmux detect, quick init, generate-slug|slug-generate, parse-args plan|quick, status fingerprint, quick-status`);
    }
  } catch (e) {
    error(e.message);
  }
}

if (require.main === module || process.argv[1] === __filename) { main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); }); }
module.exports = { KNOWN_AGENTS, initExecutePhase, initPlanPhase, initQuick, initVerifyWork, initResume, initProgress, initStateBundle: stateBundle, stateBundle, statePatch, stateAdvancePlan, stateRecordMetric, stateRecordActivity, stateUpdateProgress, parseStateMd, parseRoadmapMd, parseYamlFrontmatter, parseMustHaves, countMustHaves, stateLoad, stateCheckProgress, configLoad, configClearCache, configValidate, lockedFileUpdate, planIndex, determinePhaseStatus, findFiles, atomicWrite, tailLines, frontmatter, mustHavesCollect, phaseInfo, stateUpdate, roadmapUpdateStatus, roadmapUpdatePlans, roadmapAnalyze, updateLegacyStateField, updateFrontmatterField, updateTableRow, findRoadmapRow, resolveDepthProfile, DEPTH_PROFILE_DEFAULTS, historyAppend, historyLoad, VALID_STATUS_TRANSITIONS, validateStatusTransition, writeActiveSkill, validateProject, phaseAdd, phaseRemove, phaseList, loadUserDefaults, saveUserDefaults, mergeUserDefaults, USER_DEFAULTS_PATH, todoList, todoGet, todoAdd, todoDone, migrate, spotCheck, referenceGet, milestoneStats, contextTriage, stalenessCheck, summaryGate, checkpointInit, checkpointUpdate, seedsMatch, ciPoll, ciFix, parseJestOutput: _parseJestOutput, parseLintOutput: _parseLintOutput, autoFixLint: _autoFixLint, runCiFixLoop: _runCiFixLoop, rollbackPlan, sessionLoad, sessionSave, SESSION_ALLOWED_KEYS, claimAcquire, claimRelease, claimList, skillSectionGet, listSkillHeadings, stepVerify: _stepVerify, phaseAlternatives: _phaseAlternatives, prerequisiteAlternatives: _prereqAlternatives, configAlternatives: _configAlternatives, phaseComplete, phaseInsert, quickStatus, autoCloseTodos, autoArchiveNotes, buildCleanupContext, incidentsList, incidentsQuery, incidentsSummary };
// NOTE: validateProject, phaseAdd, phaseRemove, phaseList were previously CLI-only (not exported).
// They are now exported for testability. This is additive and backwards-compatible.

#!/usr/bin/env node

/**
 * pbr-tools.js — Structured JSON state operations for Plan-Build-Run skills.
 *
 * Thin router that delegates CLI commands to handler modules in commands/.
 * Core logic lives in lib/ modules. Wrapper functions here provide backward
 * compatibility for hook scripts and tests that require('./pbr-tools').
 *
 * Command modules:
 *   commands/state.js   — state, state-bundle
 *   commands/config.js  — config, validate
 *   commands/roadmap.js — roadmap
 *   commands/phase.js   — phase, compound, init, plan-index, frontmatter, must-haves, phase-info, milestone-stats
 *   commands/verify.js  — verify, spot-check, staleness-check, summary-gate, checkpoint, seeds
 *   commands/todo.js    — todo, history, auto-cleanup
 *   commands/misc.js    — all remaining (intel, learnings, session, claim, spec, help, etc.)
 *
 * Usage: node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js <command> [args]
 * Run `pbr-tools.js help` for full command listing.
 *
 * Environment: PBR_PROJECT_ROOT — Override project root directory
 */

const fs = require('fs');
const path = require('path');

// --- Import lib modules (used by wrapper functions for backward-compat exports) ---
const { parseYamlFrontmatter, parseMustHaves, countMustHaves } = require('./lib/yaml');
const { KNOWN_AGENTS, VALID_STATUS_TRANSITIONS, SESSION_ALLOWED_KEYS } = require('./lib/constants');
const { validateStatusTransition, output, error,
  findFiles, tailLines,
  determinePhaseStatus, atomicWrite, lockedFileUpdate } = require('./lib/core');
const { writeActiveSkill, sessionLoad, sessionSave, acquireClaim, releaseClaim,
  listClaims: _listClaims } = require('./lib/session');
const { configLoad: _configLoad, configClearCache: _configClearCache,
  configValidate: _configValidate, resolveDepthProfile, DEPTH_PROFILE_DEFAULTS,
  loadUserDefaults, saveUserDefaults, mergeUserDefaults, USER_DEFAULTS_PATH } = require('./lib/config');
const { parseStateMd, updateFrontmatterField, stateLoad: _stateLoad,
  stateCheckProgress: _stateCheckProgress, stateUpdate: _stateUpdate,
  statePatch: _statePatch, stateAdvancePlan: _stateAdvancePlan,
  stateRecordMetric: _stateRecordMetric, stateRecordActivity: _stateRecordActivity,
  stateUpdateProgress: _stateUpdateProgress, stateReconcile: _stateReconcile,
  stateBackup: _stateBackup } = require('./lib/state');
const { parseRoadmapMd, findRoadmapRow, updateTableRow,
  roadmapUpdateStatus: _roadmapUpdateStatus, roadmapUpdatePlans: _roadmapUpdatePlans,
  roadmapAnalyze: _roadmapAnalyze } = require('./lib/roadmap');
const { frontmatter: _frontmatter, planIndex: _planIndex,
  mustHavesCollect: _mustHavesCollect, phaseInfo: _phaseInfo, phaseAdd: _phaseAdd,
  phaseRemove: _phaseRemove, phaseList: _phaseList, milestoneStats: _milestoneStats,
  phaseComplete: _phaseComplete, phaseInsert: _phaseInsert,
  phaseNextNumber: _phaseNextNumber } = require('./lib/phase');
const { compoundInitPhase: _compoundInitPhase, compoundCompletePhase: _compoundCompletePhase,
  compoundInitMilestone: _compoundInitMilestone } = require('./lib/compound');
const { initExecutePhase: _initExecutePhase, initPlanPhase: _initPlanPhase,
  initQuick: _initQuick, initVerifyWork: _initVerifyWork, initResume: _initResume,
  initProgress: _initProgress, initStateBundle: _initStateBundle,
  initContinue: _initContinue, initMilestone: _initMilestone, initBegin: _initBegin,
  initStatus: _initStatus, initMapCodebase: _initMapCodebase } = require('./lib/init');
const { historyAppend: _historyAppend, historyLoad: _historyLoad } = require('./lib/history');
const { todoList: _todoList, todoGet: _todoGet, todoAdd: _todoAdd, todoDone: _todoDone } = require('./lib/todo');
const { autoCloseTodos: _autoCloseTodos, autoArchiveNotes: _autoArchiveNotes } = require('./lib/auto-cleanup');
const { applyMigrations: _applyMigrations } = require('./lib/migrate');
const { verifySpotCheck: _verifySpotCheck } = require('./lib/spot-check');
const { referenceGet: _referenceGet } = require('./lib/reference');
const { skillSection: _skillSection, listAvailableSkills: _listAvailableSkills } = require('./lib/skill-section');
const { helpList: _helpList, skillMetadata: _skillMetadata } = require('./lib/help');
const { stepVerify: _stepVerify } = require('./lib/step-verify');
const { contextTriage: _contextTriage } = require('./lib/context');
const { phaseAlternatives: _phaseAlternatives, prerequisiteAlternatives: _prereqAlternatives,
  configAlternatives: _configAlternatives } = require('./lib/alternatives');
const { stalenessCheck: _stalenessCheck, summaryGate: _summaryGate,
  checkpointInit: _checkpointInit, checkpointUpdate: _checkpointUpdate,
  seedsMatch: _seedsMatch, ciPoll: _ciPoll, rollback: _rollback } = require('./lib/build');
const { parseJestOutput: _parseJestOutput, parseLintOutput: _parseLintOutput,
  autoFixLint: _autoFixLint, runCiFixLoop: _runCiFixLoop } = require('./lib/ci-fix-loop');
const { quickStatus: _quickStatus } = require('./quick-status');

// --- Command modules (CLI dispatch handlers) ---
const { handleState, handleStateBundle } = require('./commands/state');
const { handleConfig } = require('./commands/config');
const { handleRoadmap } = require('./commands/roadmap');
const { handlePhase, handleCompound, handleInit, handlePhaseDirect } = require('./commands/phase');
const { handleVerify, handleSpotCheckDirect, handleStalenessCheck, handleSummaryGate, handleCheckpoint, handleSeeds } = require('./commands/verify');
const { handleTodo, handleHistory, handleAutoCleanup } = require('./commands/todo');
const { handleMisc } = require('./commands/misc');
const { handleBenchmarks } = require('./commands/benchmarks');
const { handleCalibrate } = require('./commands/calibrate');
const { handleStressTest } = require('./commands/stress-test');
const { normalizeMsysPath } = require('./lib/msys-path');

// --- Module-level state (for backwards compatibility) ---

let cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
cwd = normalizeMsysPath(cwd);
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
  cwd = normalizeMsysPath(cwd);
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

function phaseNextNumber() {
  return _phaseNextNumber(planningDir);
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

function compoundInitPhase(phaseNum, slug, opts) {
  return _compoundInitPhase(phaseNum, slug, planningDir, opts);
}

function compoundCompletePhase(phaseNum) {
  return _compoundCompletePhase(phaseNum, planningDir);
}

function compoundInitMilestone(version, opts) {
  return _compoundInitMilestone(version, planningDir, opts);
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

function initMapCodebase() {
  return _initMapCodebase(planningDir);
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


function migrate(options) {
  return _applyMigrations(planningDir, options);
}


function verifySpotCheck(type, dirPath) {
  return _verifySpotCheck(type, dirPath);
}

function referenceGet(name, options) {
  // Resolve plugin root — try CLAUDE_PLUGIN_ROOT env, then walk up from __dirname
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  let root = normalizeMsysPath(pluginRoot);
  return _referenceGet(name, options, root);
}

function resolvePluginRoot() {
  // Resolve plugin root — try CLAUDE_PLUGIN_ROOT env, then walk up from __dirname
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
  return normalizeMsysPath(pluginRoot);
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

function helpListCmd() {
  const root = resolvePluginRoot();
  return _helpList(root);
}
function skillMetadataCmd(skillName) {
  const root = resolvePluginRoot();
  return _skillMetadata(skillName, root);
}

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


// --- CLI entry point (thin router — delegates to command modules) ---

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const ctx = { planningDir, cwd, output, error };

  try {
    if (command === 'state') {
      await handleState(args, ctx);
    } else if (command === 'state-bundle') {
      handleStateBundle(args, ctx);
    } else if (command === 'config' || command === 'validate') {
      await handleConfig(args, ctx);
    } else if (command === 'roadmap') {
      await handleRoadmap(args, ctx);
    } else if (command === 'phase') {
      await handlePhase(args, ctx);
    } else if (command === 'compound') {
      await handleCompound(args, ctx);
    } else if (command === 'init') {
      await handleInit(args, ctx);
    } else if (['plan-index', 'frontmatter', 'must-haves', 'phase-info', 'milestone-stats'].includes(command)) {
      handlePhaseDirect(args, ctx);
    } else if (command === 'verify') {
      handleVerify(args, ctx);
    } else if (command === 'spot-check') {
      handleSpotCheckDirect(args, ctx);
    } else if (command === 'staleness-check') {
      handleStalenessCheck(args, ctx);
    } else if (command === 'summary-gate') {
      handleSummaryGate(args, ctx);
    } else if (command === 'checkpoint') {
      handleCheckpoint(args, ctx);
    } else if (command === 'seeds') {
      handleSeeds(args, ctx);
    } else if (command === 'todo') {
      handleTodo(args, ctx);
    } else if (command === 'history') {
      handleHistory(args, ctx);
    } else if (command === 'auto-cleanup') {
      handleAutoCleanup(args, ctx);
    } else if (command === 'benchmarks') {
      await handleBenchmarks(args, ctx);
    } else if (command === 'calibrate') {
      handleCalibrate(args, ctx);
    } else if (command === 'stress-test') {
      await handleStressTest(args, ctx);
    } else {
      // Delegate to misc handler for all remaining commands
      const result = await handleMisc(args, ctx);
      if (result === 'NOT_HANDLED') {
        error(`Unknown command: ${args.join(' ')}\nRun: pbr-tools.js help`);
      }
    }
  } catch (e) {
    error(e.message);
  }
}

if (require.main === module || process.argv[1] === __filename) { main().catch(err => { process.stderr.write(err.message + '\n'); process.exit(1); }); }
module.exports = { KNOWN_AGENTS, initExecutePhase, initPlanPhase, initQuick, initVerifyWork, initResume, initProgress, initStateBundle: stateBundle, stateBundle, statePatch, stateAdvancePlan, stateRecordMetric, stateRecordActivity, stateUpdateProgress, parseStateMd, parseRoadmapMd, parseYamlFrontmatter, parseMustHaves, countMustHaves, stateLoad, stateCheckProgress, configLoad, configClearCache, configValidate, lockedFileUpdate, planIndex, determinePhaseStatus, findFiles, atomicWrite, tailLines, frontmatter, mustHavesCollect, phaseInfo, stateUpdate, roadmapUpdateStatus, roadmapUpdatePlans, roadmapAnalyze, updateFrontmatterField, updateTableRow, findRoadmapRow, resolveDepthProfile, DEPTH_PROFILE_DEFAULTS, historyAppend, historyLoad, VALID_STATUS_TRANSITIONS, validateStatusTransition, writeActiveSkill, phaseAdd, phaseRemove, phaseList, loadUserDefaults, saveUserDefaults, mergeUserDefaults, USER_DEFAULTS_PATH, todoList, todoGet, todoAdd, todoDone, migrate, verifySpotCheck, referenceGet, milestoneStats, contextTriage, stalenessCheck, summaryGate, checkpointInit, checkpointUpdate, seedsMatch, ciPoll, ciFix, parseJestOutput: _parseJestOutput, parseLintOutput: _parseLintOutput, autoFixLint: _autoFixLint, runCiFixLoop: _runCiFixLoop, rollbackPlan, sessionLoad, sessionSave, SESSION_ALLOWED_KEYS, claimAcquire, claimRelease, claimList, skillSectionGet, listSkillHeadings, stepVerify: _stepVerify, phaseAlternatives: _phaseAlternatives, prerequisiteAlternatives: _prereqAlternatives, configAlternatives: _configAlternatives, phaseComplete, phaseInsert, quickStatus, autoCloseTodos, autoArchiveNotes, buildCleanupContext, helpListCmd, skillMetadataCmd, initMapCodebase };

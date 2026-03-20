/**
 * lib/completion.cjs — Compound completion commands for Plan-Build-Run.
 *
 * Each function replaces 3-6 separate CLI calls with one atomic operation.
 * All functions return JSON with { success: true/false } and on partial
 * failure include { step, partial } fields.
 *
 * Exported functions:
 *   buildComplete(phaseNum, opts, planningDir)
 *   planComplete(phaseNum, plansTotal, opts, planningDir)
 *   reviewComplete(phaseNum, opts, planningDir)
 *   milestoneArchive(version, opts, planningDir)
 *   importComplete(phaseNum, opts, planningDir)
 */

'use strict';

const path = require('path');

// ─── Lazy module loaders ─────────────────────────────────────────────────────

let _state, _roadmap, _milestone;

function getState() { if (!_state) _state = require('./state.cjs'); return _state; }
function getRoadmap() { if (!_roadmap) _roadmap = require('./roadmap.cjs'); return _roadmap; }
function getMilestone() { if (!_milestone) _milestone = require('./milestone.cjs'); return _milestone; }

/**
 * Resolve the .planning directory from the given planningDir or env/cwd fallback.
 * @param {string} [planningDir]
 * @returns {string}
 */
function resolvePlanningDir(planningDir) {
  if (planningDir) return planningDir;
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  return path.join(cwd, '.planning');
}

/**
 * Run a step and track partial completion. Returns { ok, result, error }.
 */
function runStep(stepName, fn, partial) {
  try {
    const result = fn();
    if (result && result.success === false) {
      return { ok: false, error: result.error || `${stepName} failed`, step: stepName };
    }
    partial.push(stepName);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message, step: stepName };
  }
}

// ---------------------------------------------------------------------------
// buildComplete
// ---------------------------------------------------------------------------

/**
 * Compound command replacing build skill Step 8 multi-step sequence.
 *
 * Steps: roadmapUpdatePlans, roadmapUpdateStatus, statePatch, stateRecordActivity, stateUpdateProgress
 *
 * @param {string|number} phaseNum
 * @param {{ completed?: number, total?: number, status?: string, last_command?: string }} opts
 * @param {string} [planningDir]
 * @returns {{ success: boolean, phase?, roadmap_status?, state_status?, plans?, activity?, error?, step?, partial? }}
 */
function buildComplete(phaseNum, opts, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  if (!phaseNum) return { success: false, error: 'phase number required' };
  const phase = String(phaseNum);

  const completed = opts.completed != null ? Number(opts.completed) : 0;
  const total = opts.total != null ? Number(opts.total) : 0;
  const status = opts.status || (completed >= total && total > 0 ? 'built' : 'partial');
  const lastCommand = opts.last_command || '/pbr:build';
  const partial = [];

  // Step a: roadmapUpdatePlans
  let step = runStep('roadmapUpdatePlans', () =>
    getRoadmap().roadmapUpdatePlans(phase, completed, total, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step b: roadmapUpdateStatus
  step = runStep('roadmapUpdateStatus', () =>
    getRoadmap().roadmapUpdateStatus(phase, status, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step c: statePatch
  step = runStep('statePatch', () =>
    getState().statePatch(JSON.stringify({ status, last_command: lastCommand }), pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step d: stateRecordActivity
  const description = `Phase ${phase} ${status} (${completed}/${total} plans)`;
  step = runStep('stateRecordActivity', () =>
    getState().stateRecordActivity(description, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step e: stateUpdateProgress
  step = runStep('stateUpdateProgress', () =>
    getState().stateUpdateProgress(pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  return {
    success: true,
    phase: phase,
    roadmap_status: status,
    state_status: status,
    plans: `${completed}/${total}`,
    activity: description
  };
}

// ---------------------------------------------------------------------------
// planComplete
// ---------------------------------------------------------------------------

/**
 * Compound command replacing plan skill Step 8.
 *
 * Steps: roadmapUpdatePlans, roadmapUpdateStatus, statePatch, stateRecordActivity
 *
 * @param {string|number} phaseNum
 * @param {string|number} plansTotal
 * @param {{ last_command?: string }} opts
 * @param {string} [planningDir]
 * @returns {{ success: boolean, phase?, plans_total?, roadmap_status?, state_status?, error?, step?, partial? }}
 */
function planComplete(phaseNum, plansTotal, opts, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  if (!phaseNum) return { success: false, error: 'phase number required' };
  if (!plansTotal && plansTotal !== 0) return { success: false, error: 'plans_total required' };

  const phase = String(phaseNum);
  const total = Number(plansTotal);
  const lastCommand = (opts && opts.last_command) || '/pbr:plan-phase';
  const partial = [];

  // Step a: roadmapUpdatePlans
  let step = runStep('roadmapUpdatePlans', () =>
    getRoadmap().roadmapUpdatePlans(phase, 0, total, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step b: roadmapUpdateStatus
  step = runStep('roadmapUpdateStatus', () =>
    getRoadmap().roadmapUpdateStatus(phase, 'planned', pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step c: statePatch
  step = runStep('statePatch', () =>
    getState().statePatch(JSON.stringify({
      status: 'planned',
      plans_total: String(total),
      last_command: lastCommand
    }), pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step d: stateRecordActivity
  const description = `Phase ${phase} planned (${total} plans)`;
  step = runStep('stateRecordActivity', () =>
    getState().stateRecordActivity(description, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  return {
    success: true,
    phase: phase,
    plans_total: total,
    roadmap_status: 'planned',
    state_status: 'planned'
  };
}

// ---------------------------------------------------------------------------
// reviewComplete
// ---------------------------------------------------------------------------

/**
 * Compound command replacing review skill Step 6.
 *
 * Steps: roadmapUpdateStatus, statePatch, stateRecordActivity, stateUpdateProgress
 *
 * @param {string|number} phaseNum
 * @param {{ status?: string, last_command?: string }} opts
 * @param {string} [planningDir]
 * @returns {{ success: boolean, phase?, roadmap_status?, state_status?, error?, step?, partial? }}
 */
function reviewComplete(phaseNum, opts, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  if (!phaseNum) return { success: false, error: 'phase number required' };

  const phase = String(phaseNum);
  const status = (opts && opts.status) || 'verified';
  const lastCommand = (opts && opts.last_command) || '/pbr:review';
  const partial = [];

  // Step a: roadmapUpdateStatus
  let step = runStep('roadmapUpdateStatus', () =>
    getRoadmap().roadmapUpdateStatus(phase, status, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step b: statePatch
  step = runStep('statePatch', () =>
    getState().statePatch(JSON.stringify({ status, last_command: lastCommand }), pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step c: stateRecordActivity
  const description = `Phase ${phase} ${status}`;
  step = runStep('stateRecordActivity', () =>
    getState().stateRecordActivity(description, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step d: stateUpdateProgress
  step = runStep('stateUpdateProgress', () =>
    getState().stateUpdateProgress(pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  return {
    success: true,
    phase: phase,
    roadmap_status: status,
    state_status: status
  };
}

// ---------------------------------------------------------------------------
// milestoneArchive
// ---------------------------------------------------------------------------

/**
 * Compound command wrapping milestone completion.
 *
 * Delegates to cmdMilestoneComplete from milestone.cjs.
 *
 * @param {string} version
 * @param {{ name?: string, archivePhases?: boolean }} opts
 * @param {string} [planningDir]
 * @returns {{ success: boolean, version?, archived?, state_updated?, error? }}
 */
function milestoneArchive(version, opts, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  if (!version) return { success: false, error: 'version required' };

  // Derive cwd from planningDir (go up one level from .planning)
  const cwd = path.dirname(pd);
  const options = {
    name: (opts && opts.name) || undefined,
    archivePhases: !!(opts && opts.archivePhases)
  };

  try {
    // cmdMilestoneComplete with raw=true outputs JSON to stdout.
    // We capture stdout and intercept process.exit since core.cjs output() calls it.
    const result = captureOutput(() => {
      getMilestone().cmdMilestoneComplete(cwd, version, options, true);
    });

    if (result) {
      return {
        success: true,
        version,
        archived: result.archived || {},
        state_updated: result.state_updated || false
      };
    }

    return {
      success: true,
      version,
      archived: {},
      state_updated: false
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Capture stdout output from a function call and parse as JSON.
 * Also intercepts process.exit() since core.cjs output() calls it.
 * @param {Function} fn
 * @returns {object|null}
 */
function captureOutput(fn) {
  const originalWrite = process.stdout.write;
  const originalExit = process.exit;
  let captured = '';

  process.stdout.write = function (chunk) {
    captured += String(chunk);
    return true;
  };

  // Prevent process.exit() from killing the process
  process.exit = function () {
    // no-op: swallow exit calls from output()/error()
  };

  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
    process.exit = originalExit;
  }

  if (captured.trim()) {
    try {
      return JSON.parse(captured.trim());
    } catch (_e) {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// importComplete
// ---------------------------------------------------------------------------

/**
 * Compound command replacing import skill Step 8.
 *
 * Steps: roadmapUpdateStatus, statePatch, stateRecordActivity
 *
 * @param {string|number} phaseNum
 * @param {{ status?: string, last_command?: string }} opts
 * @param {string} [planningDir]
 * @returns {{ success: boolean, phase?, roadmap_status?, state_status?, error?, step?, partial? }}
 */
function importComplete(phaseNum, opts, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  if (!phaseNum) return { success: false, error: 'phase number required' };

  const phase = String(phaseNum);
  const status = (opts && opts.status) || 'planned';
  const lastCommand = (opts && opts.last_command) || '/pbr:import';
  const partial = [];

  // Step a: roadmapUpdateStatus
  let step = runStep('roadmapUpdateStatus', () =>
    getRoadmap().roadmapUpdateStatus(phase, status, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step b: statePatch
  step = runStep('statePatch', () =>
    getState().statePatch(JSON.stringify({
      status: status,
      last_command: lastCommand
    }), pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  // Step c: stateRecordActivity
  const description = `Phase ${phase} imported`;
  step = runStep('stateRecordActivity', () =>
    getState().stateRecordActivity(description, pd), partial);
  if (!step.ok) return { success: false, error: step.error, step: step.step, partial };

  return {
    success: true,
    phase: phase,
    roadmap_status: status,
    state_status: status
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildComplete,
  planComplete,
  reviewComplete,
  milestoneArchive,
  importComplete
};

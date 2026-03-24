'use strict';
/**
 * commands/state.js — CLI handlers for `state` and `state-bundle` subcommands.
 * Each handler receives (args, ctx) where ctx = { planningDir, cwd, output, error }.
 */

const {
  stateLoad: _stateLoad,
  stateCheckProgress: _stateCheckProgress,
  stateUpdate: _stateUpdate,
  statePatch: _statePatch,
  stateAdvancePlan: _stateAdvancePlan,
  stateRecordMetric: _stateRecordMetric,
  stateRecordActivity: _stateRecordActivity,
  stateUpdateProgress: _stateUpdateProgress,
  stateReconcile: _stateReconcile,
  stateBackup: _stateBackup
} = require('../lib/state');

const { initStateBundle: _initStateBundle } = require('../lib/init');

/**
 * Handle all `state <subcommand>` dispatches.
 * @param {string[]} args - Full CLI args (args[0] === 'state')
 * @param {{ planningDir: string, cwd: string, output: function, error: function }} ctx
 */
function handleState(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'load') {
    ctx.output(_stateLoad(ctx.planningDir));
  } else if (subcommand === 'check-progress') {
    ctx.output(_stateCheckProgress(ctx.planningDir));
  } else if (subcommand === 'update') {
    const field = args[2];
    const value = args[3];
    if (!field || value === undefined) {
      ctx.error('Usage: pbr-tools.js state update <field> <value>\nFields: current_phase, status, plans_complete, last_activity, progress_percent, phase_slug, last_command, blockers');
    }
    ctx.output(_stateUpdate(field, value, ctx.planningDir));
  } else if (subcommand === 'patch') {
    const jsonStr = args[2];
    if (!jsonStr) ctx.error('Usage: pbr-tools.js state patch JSON');
    ctx.output(_statePatch(jsonStr, ctx.planningDir));
  } else if (subcommand === 'advance-plan') {
    ctx.output(_stateAdvancePlan(ctx.planningDir));
  } else if (subcommand === 'record-metric') {
    ctx.output(_stateRecordMetric(args.slice(2), ctx.planningDir));
  } else if (subcommand === 'record-activity') {
    const description = args.slice(2).join(' ');
    if (!description) ctx.error('Usage: pbr-tools.js state record-activity <description>');
    ctx.output(_stateRecordActivity(description, ctx.planningDir));
  } else if (subcommand === 'update-progress') {
    ctx.output(_stateUpdateProgress(ctx.planningDir));
  } else if (subcommand === 'reconcile') {
    ctx.output(_stateReconcile(ctx.planningDir));
  } else if (subcommand === 'backup') {
    ctx.output(_stateBackup(ctx.planningDir));
  } else if (subcommand === 'enqueue') {
    const field = args[2];
    const value = args[3];
    if (!field || value === undefined) { ctx.error('Usage: state enqueue <field> <value>'); }
    const { stateEnqueue } = require('../lib/state-queue');
    ctx.output(stateEnqueue(field, value, ctx.planningDir));
  } else if (subcommand === 'drain') {
    const { stateDrain } = require('../lib/state-queue');
    ctx.output(stateDrain(ctx.planningDir));
  } else {
    ctx.error('Usage: state load|check-progress|update|patch|advance-plan|record-metric|record-activity|update-progress|reconcile|backup|enqueue|drain');
  }
}

/**
 * Handle the `state-bundle <N>` command.
 * @param {string[]} args - Full CLI args (args[0] === 'state-bundle')
 * @param {{ planningDir: string, cwd: string, output: function, error: function }} ctx
 */
function handleStateBundle(args, ctx) {
  const phaseNum = args[1];
  if (!phaseNum) ctx.error('Usage: pbr-tools.js state-bundle <phase-number>');
  ctx.output(_initStateBundle(phaseNum, ctx.planningDir));
}

module.exports = { handleState, handleStateBundle };

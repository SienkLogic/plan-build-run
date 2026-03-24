'use strict';
/**
 * commands/roadmap.js — CLI handlers for `roadmap` subcommands.
 * Each handler receives (args, ctx) where ctx = { planningDir, cwd, output, error }.
 */

const {
  roadmapUpdateStatus: _roadmapUpdateStatus,
  roadmapUpdatePlans: _roadmapUpdatePlans,
  roadmapAnalyze: _roadmapAnalyze,
  roadmapAppendPhase: _roadmapAppendPhase,
  reconcileRoadmapStatuses: _reconcileRoadmapStatuses
} = require('../lib/roadmap');

const {
  phaseInfo: _phaseInfo
} = require('../lib/phase');

/**
 * Handle all `roadmap <subcommand>` dispatches.
 * @param {string[]} args - Full CLI args (args[0] === 'roadmap')
 * @param {{ planningDir: string, cwd: string, output: function, error: function }} ctx
 */
function handleRoadmap(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'update-status') {
    const phase = args[2];
    const status = args[3];
    if (!phase || !status) {
      ctx.error('Usage: pbr-tools.js roadmap update-status <phase-number> <status>');
    }
    ctx.output(_roadmapUpdateStatus(phase, status, ctx.planningDir));
  } else if (subcommand === 'update-plans') {
    const phase = args[2];
    const complete = args[3];
    const total = args[4];
    if (!phase || complete === undefined || total === undefined) {
      ctx.error('Usage: pbr-tools.js roadmap update-plans <phase-number> <complete> <total>');
    }
    ctx.output(_roadmapUpdatePlans(phase, complete, total, ctx.planningDir));
  } else if (subcommand === 'analyze') {
    ctx.output(_roadmapAnalyze(ctx.planningDir));
  } else if (subcommand === 'reconcile') {
    const result = _reconcileRoadmapStatuses(ctx.planningDir);
    if (result.fixed > 0) {
      process.stderr.write(`Reconciled ${result.fixed} ROADMAP entries\n`);
      for (const m of result.mismatches) {
        process.stderr.write(`  Phase ${m.phase}: ${m.from} -> ${m.to}\n`);
      }
    } else {
      process.stderr.write('ROADMAP statuses are consistent\n');
    }
    ctx.output(result);
  } else if (subcommand === 'get-phase') {
    const phaseNum = args[2];
    if (!phaseNum) { ctx.error('Usage: roadmap get-phase <phase_num>'); }
    ctx.output(_phaseInfo(phaseNum, ctx.planningDir));
  } else if (subcommand === 'append-phase') {
    const goalIdx = args.indexOf('--goal');
    const goal = goalIdx >= 0 ? args[goalIdx + 1] : args[2] || '';
    const nameIdx = args.indexOf('--name');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : '';
    const depIdx = args.indexOf('--depends-on');
    const dependsOn = depIdx >= 0 ? args[depIdx + 1] : null;
    const analysis = _roadmapAnalyze(ctx.planningDir);
    const maxPhase = analysis.phases ? Math.max(...analysis.phases.map(p => p.num || 0), 0) : 0;
    const nextNum = maxPhase + 1;
    ctx.output(_roadmapAppendPhase(ctx.planningDir, nextNum, name || goal, goal, dependsOn));
  } else {
    ctx.error('Usage: roadmap update-status|update-plans|analyze|reconcile|get-phase|append-phase');
  }
}

module.exports = { handleRoadmap };

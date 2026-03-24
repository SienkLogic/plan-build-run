'use strict';

/**
 * commands/phase.js — Command handlers for phase, compound, init, and phase-direct commands.
 *
 * Extracted from pbr-tools.js to reduce monolith size. Each handler receives
 * (args, ctx) where ctx provides { planningDir, cwd, output(), error() }.
 */

const fs = require('fs');
const path = require('path');

const {
  frontmatter: _frontmatter,
  planIndex: _planIndex,
  mustHavesCollect: _mustHavesCollect,
  phaseInfo: _phaseInfo,
  phaseAdd: _phaseAdd,
  phaseRemove: _phaseRemove,
  phaseList: _phaseList,
  phaseComplete: _phaseComplete,
  phaseInsert: _phaseInsert,
  phaseNextNumber: _phaseNextNumber,
  milestoneStats: _milestoneStats
} = require('../lib/phase');

const {
  compoundInitPhase: _compoundInitPhase,
  compoundCompletePhase: _compoundCompletePhase,
  compoundInitMilestone: _compoundInitMilestone
} = require('../lib/compound');

const {
  initExecutePhase: _initExecutePhase,
  initPlanPhase: _initPlanPhase,
  initVerifyWork: _initVerifyWork,
  initResume: _initResume,
  initProgress: _initProgress,
  initContinue: _initContinue,
  initMilestone: _initMilestone,
  initBegin: _initBegin,
  initStatus: _initStatus,
  initMapCodebase: _initMapCodebase,
  initQuick: _initQuick,
  initStateBundle: _initStateBundle
} = require('../lib/init');

// --- Private functions extracted from pbr-tools.js lines 692-739 ---

/**
 * Read .phase-manifest.json for phase N, output JSON array of commits.
 * Falls back to git log if no manifest exists.
 *
 * @param {string|number} phaseNum - Phase number
 * @param {string} planningDir - Path to .planning directory
 * @returns {object} { source, commits } or { error }
 */
function _phaseCommitsFor(phaseNum, planningDir) {
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
 *
 * @param {string|number} phaseNum - Phase number
 * @param {string} planningDir - Path to .planning directory
 * @returns {object} { source, first, last, total } or { error }
 */
function _phaseFirstLastCommit(phaseNum, planningDir) {
  const result = _phaseCommitsFor(phaseNum, planningDir);
  if (result.error && !result.commits) return result;
  const commits = result.commits || [];
  return {
    source: result.source,
    first: commits.length > 0 ? commits[0].hash : null,
    last: commits.length > 0 ? commits[commits.length - 1].hash : null,
    total: commits.length
  };
}

// --- Exported command handlers ---

/**
 * Handle phase subcommands: add, remove, list, next-number, complete, insert, commits-for, first-last-commit.
 *
 * @param {string[]} args - CLI args (args[0] is 'phase', args[1] is subcommand)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handlePhase(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'add') {
    const slug = args[2];
    if (!slug) { ctx.error('Usage: phase add <slug> [--after N] [--goal "..."] [--depends-on N]'); return; }
    const afterIdx = args.indexOf('--after');
    const afterPhase = afterIdx !== -1 ? args[afterIdx + 1] : null;
    const goalIdx = args.indexOf('--goal');
    const goal = goalIdx !== -1 ? args[goalIdx + 1] : null;
    const depIdx = args.indexOf('--depends-on');
    const dependsOn = depIdx !== -1 ? args[depIdx + 1] : null;
    const addOpts = {};
    if (goal) addOpts.goal = goal;
    if (dependsOn) addOpts.dependsOn = dependsOn;
    ctx.output(_phaseAdd(slug, afterPhase, ctx.planningDir, Object.keys(addOpts).length > 0 ? addOpts : undefined));
  } else if (subcommand === 'remove') {
    const phaseNum = args[2];
    if (!phaseNum) { ctx.error('Usage: phase remove <phase_num>'); return; }
    ctx.output(_phaseRemove(phaseNum, ctx.planningDir));
  } else if (subcommand === 'list') {
    const statusIdx = args.indexOf('--status');
    const beforeIdx = args.indexOf('--before');
    const listOpts = {};
    if (statusIdx >= 0) listOpts.status = args[statusIdx + 1];
    if (beforeIdx >= 0) listOpts.before = args[beforeIdx + 1];
    ctx.output(_phaseList(ctx.planningDir, listOpts));
  } else if (subcommand === 'next-number') {
    ctx.output(_phaseNextNumber(ctx.planningDir));
  } else if (subcommand === 'complete') {
    const phaseNum = args[2];
    if (!phaseNum) { ctx.error('Usage: phase complete <phase_num>'); return; }
    ctx.output(_phaseComplete(phaseNum, ctx.planningDir));
  } else if (subcommand === 'insert') {
    const position = args[2];
    const slug = args[3];
    if (!position || !slug) { ctx.error('Usage: phase insert <N> <slug> [--goal "..."] [--depends-on N]'); return; }
    const goalIdx = args.indexOf('--goal');
    const goal = goalIdx !== -1 ? args[goalIdx + 1] : null;
    const depIdx = args.indexOf('--depends-on');
    const dependsOn = depIdx !== -1 ? args[depIdx + 1] : null;
    const insertOpts = {};
    if (goal) insertOpts.goal = goal;
    if (dependsOn) insertOpts.dependsOn = dependsOn;
    ctx.output(_phaseInsert(parseInt(position, 10), slug, ctx.planningDir, Object.keys(insertOpts).length > 0 ? insertOpts : undefined));
  } else if (subcommand === 'commits-for') {
    const phaseNum = args[2];
    if (!phaseNum) { ctx.error('Usage: phase commits-for <N>'); return; }
    ctx.output(_phaseCommitsFor(phaseNum, ctx.planningDir));
  } else if (subcommand === 'first-last-commit') {
    const phaseNum = args[2];
    if (!phaseNum) { ctx.error('Usage: phase first-last-commit <N>'); return; }
    ctx.output(_phaseFirstLastCommit(phaseNum, ctx.planningDir));
  } else {
    ctx.error('Usage: phase add|remove|list|next-number|complete|insert|commits-for|first-last-commit');
  }
}

/**
 * Handle compound subcommands: init-phase, complete-phase, init-milestone.
 *
 * @param {string[]} args - CLI args (args[0] is 'compound', args[1] is subcommand)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleCompound(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'init-phase') {
    const phaseNum = args[2];
    const slug = args[3];
    if (!phaseNum || !slug) { ctx.error('Usage: compound init-phase <N> <slug> [--goal "..."] [--depends-on N]'); return; }
    const goalIdx = args.indexOf('--goal');
    const goal = goalIdx !== -1 ? args[goalIdx + 1] : null;
    const depIdx = args.indexOf('--depends-on');
    const dependsOn = depIdx !== -1 ? args[depIdx + 1] : null;
    ctx.output(_compoundInitPhase(phaseNum, slug, ctx.planningDir, { goal, dependsOn }));
  } else if (subcommand === 'complete-phase') {
    const phaseNum = args[2];
    if (!phaseNum) { ctx.error('Usage: compound complete-phase <N>'); return; }
    ctx.output(_compoundCompletePhase(phaseNum, ctx.planningDir));
  } else if (subcommand === 'init-milestone') {
    const version = args[2];
    if (!version) { ctx.error('Usage: compound init-milestone <version> [--name "..."] [--phases "N-M"]'); return; }
    const nameIdx = args.indexOf('--name');
    const name = nameIdx !== -1 ? args[nameIdx + 1] : null;
    const phasesIdx = args.indexOf('--phases');
    const phases = phasesIdx !== -1 ? args[phasesIdx + 1] : null;
    ctx.output(_compoundInitMilestone(version, ctx.planningDir, { name, phases }));
  } else {
    ctx.error('Usage: compound init-phase|complete-phase|init-milestone');
  }
}

/**
 * Handle init subcommands: execute-phase, plan-phase, quick, verify-work, resume, progress, continue, milestone, begin, status, map-codebase.
 *
 * @param {string[]} args - CLI args (args[0] is 'init', args[1] is subcommand)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleInit(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'execute-phase') {
    const phase = args[2];
    if (!phase) { ctx.error('Usage: init execute-phase <phase-number>'); return; }
    ctx.output(_initExecutePhase(phase, ctx.planningDir));
  } else if (subcommand === 'plan-phase') {
    const phase = args[2];
    if (!phase) { ctx.error('Usage: init plan-phase <phase-number>'); return; }
    ctx.output(_initPlanPhase(phase, ctx.planningDir));
  } else if (subcommand === 'quick') {
    const desc = args.slice(2).join(' ') || '';
    ctx.output(_initQuick(desc, ctx.planningDir));
  } else if (subcommand === 'verify-work') {
    const phase = args[2];
    if (!phase) { ctx.error('Usage: init verify-work <phase-number>'); return; }
    ctx.output(_initVerifyWork(phase, ctx.planningDir));
  } else if (subcommand === 'resume') {
    ctx.output(_initResume(ctx.planningDir));
  } else if (subcommand === 'progress') {
    ctx.output(_initProgress(ctx.planningDir));
  } else if (subcommand === 'continue') {
    ctx.output(_initContinue(ctx.planningDir));
  } else if (subcommand === 'milestone') {
    ctx.output(_initMilestone(ctx.planningDir));
  } else if (subcommand === 'begin') {
    ctx.output(_initBegin(ctx.planningDir));
  } else if (subcommand === 'status') {
    ctx.output(_initStatus(ctx.planningDir));
  } else if (subcommand === 'map-codebase') {
    ctx.output(_initMapCodebase(ctx.planningDir));
  } else {
    ctx.error('Usage: init execute-phase|plan-phase|quick|verify-work|resume|progress|continue|milestone|begin|status|map-codebase');
  }
}

/**
 * Handle single-arg phase-direct commands: plan-index, frontmatter, must-haves, phase-info, milestone-stats, state-bundle.
 *
 * @param {string[]} args - CLI args (args[0] is the command name)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handlePhaseDirect(args, ctx) {
  const command = args[0];

  if (command === 'plan-index') {
    const phase = args[1];
    if (!phase) { ctx.error('Usage: plan-index <phase-number>'); return; }
    ctx.output(_planIndex(phase, ctx.planningDir));
  } else if (command === 'frontmatter') {
    const filePath = args[1];
    if (!filePath) { ctx.error('Usage: frontmatter <filepath>'); return; }
    ctx.output(_frontmatter(filePath));
  } else if (command === 'must-haves') {
    const phase = args[1];
    if (!phase) { ctx.error('Usage: must-haves <phase-number>'); return; }
    ctx.output(_mustHavesCollect(phase, ctx.planningDir));
  } else if (command === 'phase-info') {
    const phase = args[1];
    if (!phase) { ctx.error('Usage: phase-info <phase-number>'); return; }
    ctx.output(_phaseInfo(phase, ctx.planningDir));
  } else if (command === 'milestone-stats') {
    const version = args[1];
    if (!version) { ctx.error('Usage: milestone-stats <version>'); return; }
    ctx.output(_milestoneStats(version, ctx.planningDir));
  } else if (command === 'state-bundle') {
    const phaseNum = args[1];
    if (!phaseNum) { ctx.error('Usage: state-bundle <phase-number>'); return; }
    ctx.output(_initStateBundle(phaseNum, ctx.planningDir));
  } else {
    ctx.error('Unknown phase-direct command: ' + command);
  }
}

module.exports = { handlePhase, handleCompound, handleInit, handlePhaseDirect };

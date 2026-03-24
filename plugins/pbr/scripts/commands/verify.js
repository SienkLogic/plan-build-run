'use strict';

/**
 * commands/verify.js — Command handlers for verify, spot-check, staleness-check,
 * summary-gate, checkpoint, and seeds commands.
 *
 * Extracted from pbr-tools.js to reduce monolith size. Each handler receives
 * (args, ctx) where ctx provides { planningDir, cwd, output(), error() }.
 */

const {
  cmdVerifySummary: _cmdVerifySummary,
  cmdVerifyPlanStructure: _cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness: _cmdVerifyPhaseCompleteness,
  cmdVerifyArtifacts: _cmdVerifyArtifacts,
  cmdVerifyKeyLinks: _cmdVerifyKeyLinks,
  cmdVerifyCommits: _cmdVerifyCommits,
  cmdVerifyReferences: _cmdVerifyReferences
} = require('../lib/verify');

const {
  verifySpotCheck: _verifySpotCheck
} = require('../lib/spot-check');

const {
  stalenessCheck: _stalenessCheck,
  summaryGate: _summaryGate,
  checkpointInit: _checkpointInit,
  checkpointUpdate: _checkpointUpdate,
  seedsMatch: _seedsMatch
} = require('../lib/build');

// --- Exported command handlers ---

/**
 * Handle verify subcommands: spot-check, summary, plan-structure, phase-completeness,
 * artifacts, key-links, commits, references.
 *
 * @param {string[]} args - CLI args (args[0] is 'verify', args[1] is subcommand)
 * @param {object} ctx - { planningDir, cwd, output(), error() }
 */
function handleVerify(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'spot-check') {
    const scType = args[2];
    const scPath = args[3];
    if (!scType || !scPath) { ctx.error('Usage: verify spot-check <type> <path>  (types: plan, summary, verification, quick)'); return; }
    const result = _verifySpotCheck(scType, scPath);
    if (result.error) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exit(1); }
    ctx.output(result);
  } else if (subcommand === 'summary') {
    const spath = args[2];
    const cfIdx = args.indexOf('--check-files');
    const cf = cfIdx !== -1 ? parseInt(args[cfIdx + 1], 10) : 2;
    if (!spath) { ctx.error('Usage: verify summary <path> [--check-files N]'); return; }
    _cmdVerifySummary(ctx.cwd, spath, cf, false);
  } else if (subcommand === 'plan-structure') {
    const ppath = args[2];
    if (!ppath) { ctx.error('Usage: verify plan-structure <path>'); return; }
    _cmdVerifyPlanStructure(ctx.cwd, ppath, false);
  } else if (subcommand === 'phase-completeness') {
    const phase = args[2];
    if (!phase) { ctx.error('Usage: verify phase-completeness <phase>'); return; }
    _cmdVerifyPhaseCompleteness(ctx.cwd, phase, false);
  } else if (subcommand === 'artifacts') {
    const planPath = args[2];
    if (!planPath) { ctx.error('Usage: verify artifacts <plan-path>'); return; }
    _cmdVerifyArtifacts(ctx.cwd, planPath, false);
  } else if (subcommand === 'key-links') {
    const planPath = args[2];
    if (!planPath) { ctx.error('Usage: verify key-links <plan-path>'); return; }
    _cmdVerifyKeyLinks(ctx.cwd, planPath, false);
  } else if (subcommand === 'commits') {
    const hashes = args.slice(2);
    if (!hashes.length) { ctx.error('Usage: verify commits <hash1> [hash2] ...'); return; }
    _cmdVerifyCommits(ctx.cwd, hashes, false);
  } else if (subcommand === 'references') {
    const rpath = args[2];
    if (!rpath) { ctx.error('Usage: verify references <path>'); return; }
    _cmdVerifyReferences(ctx.cwd, rpath, false);
  } else {
    ctx.error('Usage: verify spot-check|summary|plan-structure|phase-completeness|artifacts|key-links|commits|references');
  }
}

/**
 * Handle the direct spot-check command (not verify spot-check).
 *
 * @param {string[]} args - CLI args (args[0] is 'spot-check')
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleSpotCheckDirect(args, ctx) {
  const phaseSlug = args[1];
  const planId = args[2];
  if (!phaseSlug || !planId) { ctx.error('Usage: spot-check <phase-slug> <plan-id>'); return; }
  ctx.output(_verifySpotCheck(phaseSlug, planId));
}

/**
 * Handle staleness-check command.
 *
 * @param {string[]} args - CLI args (args[0] is 'staleness-check')
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleStalenessCheck(args, ctx) {
  const slug = args[1];
  if (!slug) { ctx.error('Usage: staleness-check <phase-slug>'); return; }
  ctx.output(_stalenessCheck(slug, ctx.planningDir));
}

/**
 * Handle summary-gate command.
 *
 * @param {string[]} args - CLI args (args[0] is 'summary-gate')
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleSummaryGate(args, ctx) {
  const slug = args[1];
  const planId = args[2];
  if (!slug || !planId) { ctx.error('Usage: summary-gate <phase-slug> <plan-id>'); return; }
  ctx.output(_summaryGate(slug, planId, ctx.planningDir));
}

/**
 * Handle checkpoint subcommands: init, update.
 *
 * @param {string[]} args - CLI args (args[0] is 'checkpoint', args[1] is subcommand)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleCheckpoint(args, ctx) {
  const sub = args[1];
  const slug = args[2];

  if (sub === 'init') {
    const plans = args[3] || '';
    ctx.output(_checkpointInit(slug, plans, ctx.planningDir));
  } else if (sub === 'update') {
    const waveIdx = args.indexOf('--wave');
    const wave = waveIdx !== -1 ? parseInt(args[waveIdx + 1], 10) : 1;
    const resolvedIdx = args.indexOf('--resolved');
    const resolved = resolvedIdx !== -1 ? args[resolvedIdx + 1] : '';
    const shaIdx = args.indexOf('--sha');
    const sha = shaIdx !== -1 ? args[shaIdx + 1] : '';
    ctx.output(_checkpointUpdate(slug, { wave, resolved, sha }, ctx.planningDir));
  } else {
    ctx.error('Usage: checkpoint init|update <phase-slug> [options]');
  }
}

/**
 * Handle seeds subcommands: match.
 *
 * @param {string[]} args - CLI args (args[0] is 'seeds', args[1] is subcommand)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleSeeds(args, ctx) {
  const sub = args[1];
  if (sub === 'match') {
    const slug = args[2];
    const num = args[3];
    if (!slug) { ctx.error('Usage: seeds match <phase-slug> <phase-number>'); return; }
    ctx.output(_seedsMatch(slug, num, ctx.planningDir));
  } else {
    ctx.error('Usage: seeds match <phase-slug> <phase-number>');
  }
}

module.exports = { handleVerify, handleSpotCheckDirect, handleStalenessCheck, handleSummaryGate, handleCheckpoint, handleSeeds };

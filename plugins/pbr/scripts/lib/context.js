'use strict';

/**
 * lib/context.js — Context triage for orchestrator decision-making.
 *
 * Provides contextTriage() which reads data from the context-bridge and
 * context-tracker files to return a concrete PROCEED / CHECKPOINT / COMPACT
 * recommendation, replacing vague LLM self-assessment with data-driven logic.
 *
 * Data sources (in priority order):
 *   1. .context-budget.json   — written by context-bridge.js, contains real % from Claude
 *   2. .context-tracker       — written by track-context-budget.js, heuristic char count
 *
 * Decision thresholds:
 *   Bridge (fresh):   < 50% → PROCEED, 50-70% → CHECKPOINT, > 70% → COMPACT
 *   Heuristic:        < 30k → PROCEED, 30k-60k → CHECKPOINT, > 60k → COMPACT
 *
 * Adjustments:
 *   Near completion (agentsDone/plansTotal > 0.8): relax one tier
 *   currentStep contains "finalize" or "cleanup":  always PROCEED
 */

const fs = require('fs');
const path = require('path');

const BRIDGE_STALENESS_MS = 60 * 1000; // 60 seconds

/**
 * Read and parse .context-budget.json.
 * @param {string} planningDir
 * @returns {{ percentage: number, tier: string, timestamp: string, chars_read: number, stale: boolean } | null}
 */
function readBridgeData(planningDir) {
  const bridgePath = path.join(planningDir, '.context-budget.json');
  try {
    const stat = fs.statSync(bridgePath);
    const content = fs.readFileSync(bridgePath, 'utf8');
    const data = JSON.parse(content);
    const ageMs = Date.now() - stat.mtimeMs;
    data.stale = ageMs > BRIDGE_STALENESS_MS;
    return data;
  } catch (_e) {
    return null;
  }
}

/**
 * Read and parse .context-tracker.
 * @param {string} planningDir
 * @returns {{ total_chars: number, unique_files: number } | null}
 */
function readTrackerData(planningDir) {
  const trackerPath = path.join(planningDir, '.context-tracker');
  try {
    const content = fs.readFileSync(trackerPath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    return null;
  }
}

/**
 * Apply near-completion relaxation: relax CHECKPOINT → PROCEED or COMPACT → CHECKPOINT.
 * @param {string} recommendation
 * @returns {string} Possibly relaxed recommendation
 */
function relaxTier(recommendation) {
  if (recommendation === 'CHECKPOINT') return 'PROCEED';
  if (recommendation === 'COMPACT') return 'CHECKPOINT';
  return recommendation;
}

/**
 * Main context triage function.
 *
 * @param {Object} options
 * @param {number} [options.agentsDone]   — How many agents/plans have completed
 * @param {number} [options.plansTotal]   — Total plans in current phase
 * @param {string} [options.currentStep]  — Name/description of the current step
 * @param {string} [planningDir]          — Override .planning/ directory path
 * @returns {{
 *   recommendation: 'PROCEED'|'CHECKPOINT'|'COMPACT',
 *   reason: string,
 *   data_source: 'bridge'|'heuristic'|'stale_bridge',
 *   percentage: number|null,
 *   tier: string|null,
 *   agents_done: number|null,
 *   plans_total: number|null
 * }}
 */
function contextTriage(options, planningDir) {
  options = options || {};
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const pd = planningDir || path.join(cwd, '.planning');

  const agentsDone = (typeof options.agentsDone === 'number' && !isNaN(options.agentsDone))
    ? options.agentsDone : null;
  const plansTotal = (typeof options.plansTotal === 'number' && !isNaN(options.plansTotal))
    ? options.plansTotal : null;
  const currentStep = options.currentStep || '';

  // Cleanup/finalize override — always PROCEED
  const isCleanup = /finalize|cleanup/i.test(currentStep);

  // Read data sources
  const bridge = readBridgeData(pd);
  const tracker = readTrackerData(pd);

  let recommendation;
  let dataSource;
  let percentage = null;
  let tier = null;

  if (bridge && !bridge.stale) {
    // Fresh bridge data — authoritative
    dataSource = 'bridge';
    percentage = typeof bridge.percentage === 'number' ? bridge.percentage : null;
    tier = bridge.tier || null;

    if (percentage === null) {
      // Bridge exists but has no percentage — fall through to heuristic
      dataSource = 'heuristic';
    } else if (percentage < 50) {
      recommendation = 'PROCEED';
    } else if (percentage <= 70) {
      recommendation = 'CHECKPOINT';
    } else {
      recommendation = 'COMPACT';
    }
  }

  if (!recommendation) {
    // Stale bridge or missing bridge — use heuristic
    if (bridge && bridge.stale) {
      dataSource = 'stale_bridge';
      // Use stale percentage as a hint for tier/percentage display
      percentage = typeof bridge.percentage === 'number' ? bridge.percentage : null;
      tier = bridge.tier || null;
    } else {
      dataSource = 'heuristic';
    }

    const totalChars = tracker && typeof tracker.total_chars === 'number'
      ? tracker.total_chars : 0;

    if (totalChars < 30000) {
      recommendation = 'PROCEED';
    } else if (totalChars <= 60000) {
      recommendation = 'CHECKPOINT';
    } else {
      recommendation = 'COMPACT';
    }

    // Use tracker chars to estimate a pseudo-percentage for heuristic source
    if (dataSource === 'heuristic' && percentage === null) {
      // Map 0-100k chars to 0-100% for display purposes
      percentage = Math.min(100, Math.round((totalChars / 100000) * 100));
      tier = percentage < 30 ? 'PEAK'
        : percentage < 50 ? 'GOOD'
          : percentage < 70 ? 'DEGRADING'
            : percentage < 85 ? 'POOR'
              : 'CRITICAL';
    }
  }

  // Cleanup override — before near-completion so it always wins
  if (isCleanup) {
    recommendation = 'PROCEED';
  } else {
    // Near-completion adjustment
    const nearComplete = agentsDone !== null && plansTotal !== null && plansTotal > 0
      && (agentsDone / plansTotal) > 0.8;
    if (nearComplete) {
      recommendation = relaxTier(recommendation);
    }
  }

  // Build human-readable reason
  const pctStr = percentage !== null ? `${percentage}%` : 'unknown';
  const tierStr = tier || 'unknown';

  let reason;
  if (dataSource === 'bridge') {
    reason = `Context at ${pctStr} (${tierStr} tier).`;
  } else if (dataSource === 'stale_bridge') {
    reason = `Bridge data is stale (>60s old). Using heuristic fallback. Last known: ${pctStr} (${tierStr}).`;
  } else {
    const charsStr = tracker ? `${Math.round((tracker.total_chars || 0) / 1000)}k chars read` : 'no read data';
    reason = `No bridge data. Heuristic: ${charsStr} (estimated ${pctStr}).`;
  }

  if (agentsDone !== null && plansTotal !== null) {
    reason += ` ${agentsDone} of ${plansTotal} plans complete.`;
  }

  if (isCleanup) {
    reason += ' Cleanup/finalize step — not interrupting.';
  } else if (agentsDone !== null && plansTotal !== null && plansTotal > 0 && (agentsDone / plansTotal) > 0.8) {
    reason += ' Near completion — threshold relaxed.';
  }

  const safeLabel = recommendation === 'PROCEED' ? 'Safe to continue.'
    : recommendation === 'CHECKPOINT' ? 'Suggest /pbr:pause after current agent completes.'
      : 'Suggest running /compact immediately.';
  reason += ' ' + safeLabel;

  return {
    recommendation,
    reason,
    data_source: dataSource,
    percentage,
    tier,
    agents_done: agentsDone,
    plans_total: plansTotal
  };
}

module.exports = { contextTriage, readBridgeData, readTrackerData };

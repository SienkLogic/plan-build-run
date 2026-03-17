#!/usr/bin/env node

/**
 * PostToolUse hook on Write|Edit: Tracks tool call count per session
 * and suggests /compact when approaching context limits.
 *
 * Primary path: reads .planning/.context-budget.json (written by context-bridge.js)
 * and emits tier-labeled warnings (DEGRADING/POOR/CRITICAL) when bridge data is
 * fresh (<60s old). CRITICAL tier always emits; others use REMINDER_INTERVAL debounce.
 *
 * Fallback: when bridge is absent or stale, uses call-count threshold.
 * Counter stored in .planning/.compact-counter (JSON).
 * Threshold configurable via config.json hooks.compactThreshold (default: 50).
 * Counter resets on SessionStart (via progress-tracker.js).
 *
 * Exit codes:
 *   0 = always (advisory only)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { loadBridge, getEffectiveThresholds, TIER_MESSAGES } = require('./context-bridge');
const { readLedger } = require('./track-context-budget');


const DEFAULT_THRESHOLD = 50;
const REMINDER_INTERVAL = 25;

const BASE_THRESHOLD = DEFAULT_THRESHOLD; // 50 at 200k tokens
const BASE_TOKENS = 200000;

/**
 * Get the compact threshold scaled to context_window_tokens from config.
 * Base threshold at 200k tokens: 50. At 1M tokens: 250.
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {number} Scaled threshold
 */
function getScaledThreshold(planningDir) {
  try {
    const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
    const config = configLoad(planningDir);
    const tokens = (config && config.context_window_tokens) || BASE_TOKENS;
    const budgetPct = (config && config.orchestrator_budget_pct) || 25;
    const scale = tokens / BASE_TOKENS;
    const budgetScale = budgetPct / 25;
    return Math.round(BASE_THRESHOLD * scale * budgetScale);
  } catch (_e) {
    return BASE_THRESHOLD;
  }
}

/**
 * Build composition-aware compact advice from the context ledger.
 * Groups ledger entries by phase, identifies stale content, and returns
 * a human-readable breakdown string. Returns null when no ledger data exists.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {string|null} Composition advice string, or null if no data
 */
function buildCompositionAdvice(planningDir) {
  const entries = readLedger(planningDir);
  if (!entries || entries.length === 0) return null;

  // Read stale_after_minutes from config (default 60)
  let staleMinutes = 60;
  try {
    const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
    const config = configLoad(planningDir);
    if (config && config.context_ledger && config.context_ledger.stale_after_minutes != null) {
      staleMinutes = config.context_ledger.stale_after_minutes;
    }
  } catch (_e) { /* use default */ }

  const now = Date.now();
  const staleThresholdMs = staleMinutes * 60 * 1000;

  // Group entries by phase
  const groups = {};
  let totalTokens = 0;

  for (const entry of entries) {
    const phase = entry.phase || 'untracked';
    if (!groups[phase]) {
      groups[phase] = { tokens: 0, staleCount: 0, staleTokens: 0, count: 0 };
    }
    const tokens = entry.est_tokens || 0;
    groups[phase].tokens += tokens;
    groups[phase].count += 1;
    totalTokens += tokens;

    // Check staleness
    if (entry.timestamp) {
      const entryAge = now - new Date(entry.timestamp).getTime();
      if (entryAge >= staleThresholdMs) {
        groups[phase].staleCount += 1;
        groups[phase].staleTokens += tokens;
      }
    }
  }

  const totalK = Math.round(totalTokens / 1000);
  let msg = `Context composition: ~${totalK}k tokens across ${entries.length} reads.`;

  // Add phase-level stale info
  for (const [phase, data] of Object.entries(groups)) {
    if (data.staleCount > 0) {
      const phaseK = Math.round(data.staleTokens / 1000);
      msg += ` Phase ${phase}: ~${phaseK}k (${data.staleCount} stale reads >=${staleMinutes}m).`;
    }
  }

  // Check if any stale content exists
  const hasStale = Object.values(groups).some(g => g.staleCount > 0);
  if (hasStale) {
    msg += ' Consider /compact to free stale context.';
  }

  return msg;
}

function main() {
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('end', () => {
    try {
      const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
      const planningDir = path.join(cwd, '.planning');
      if (!fs.existsSync(planningDir)) {
        process.exit(0);
      }

      const result = checkCompaction(planningDir, cwd);
      if (result) {
        process.stdout.write(JSON.stringify(result));
      }
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

/**
 * Check the context bridge for the current tier.
 * Returns { tier, message } for actionable tiers (DEGRADING/POOR/CRITICAL),
 * or null if bridge is absent, stale (>60s), or tier is PEAK/GOOD (<50%).
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ tier: string, message: string }|null}
 */
function checkBridgeTier(planningDir) {
  const bridgePath = path.join(planningDir, '.context-budget.json');
  const bridge = loadBridge(bridgePath);
  if (!bridge) return null;

  // Check staleness: if timestamp is older than 60 seconds, treat as stale
  if (bridge.timestamp) {
    const ageMs = Date.now() - new Date(bridge.timestamp).getTime();
    if (ageMs > 60000) return null;
  }

  const percent = bridge.estimated_percent || 0;
  const thresholds = getEffectiveThresholds(planningDir);

  if (percent >= thresholds.critical) {
    return { tier: 'CRITICAL', message: TIER_MESSAGES.CRITICAL };
  } else if (percent >= thresholds.poor) {
    return { tier: 'POOR', message: TIER_MESSAGES.POOR };
  } else if (percent >= thresholds.degrading) {
    return { tier: 'DEGRADING', message: TIER_MESSAGES.DEGRADING };
  }

  // Below degrading threshold — no tier message needed
  return null;
}

/**
 * Increment tool call counter and return a suggestion if threshold is reached.
 * Checks bridge tier first; falls back to call-count when bridge is absent or stale.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {string} cwd - Current working directory (for config loading)
 * @returns {Object|null} Hook output with additionalContext, or null
 */
function checkCompaction(planningDir, cwd) {
  const counterPath = path.join(planningDir, '.compact-counter');
  const counter = loadCounter(counterPath);
  const threshold = getThreshold(cwd);

  counter.count += 1;
  saveCounter(counterPath, counter);

  // Check bridge tier first
  const bridgeTier = checkBridgeTier(planningDir);
  if (bridgeTier !== null) {
    const { tier, message } = bridgeTier;
    const isFirstSuggestion = !counter.lastSuggested;
    const callsSinceSuggestion = counter.count - (counter.lastSuggested || 0);
    const shouldEmit = tier === 'CRITICAL' || isFirstSuggestion || callsSinceSuggestion >= REMINDER_INTERVAL;

    if (shouldEmit) {
      counter.lastSuggested = counter.count;
      saveCounter(counterPath, counter);

      logHook('suggest-compact', 'PostToolUse', 'tier-suggest', { tier, count: counter.count });

      const composition = buildCompositionAdvice(planningDir);
      const baseMsg = `[Context Budget - ${tier}] ${message}`;
      return {
        additionalContext: composition ? `${baseMsg}\n${composition}` : baseMsg
      };
    }
    return null;
  }

  // Fall back to counter-based suggestion when bridge is absent or stale
  if (counter.count < threshold) return null;

  const isFirstSuggestion = !counter.lastSuggested;
  const callsSinceSuggestion = counter.count - (counter.lastSuggested || 0);

  if (isFirstSuggestion || callsSinceSuggestion >= REMINDER_INTERVAL) {
    counter.lastSuggested = counter.count;
    saveCounter(counterPath, counter);

    logHook('suggest-compact', 'PostToolUse', 'suggest', {
      count: counter.count,
      threshold
    });

    return {
      additionalContext: `[Context Budget] ${counter.count} tool calls this session (threshold: ${threshold}). Consider running /compact to free context space before quality degrades.`
    };
  }

  return null;
}

function loadCounter(counterPath) {
  try {
    const content = fs.readFileSync(counterPath, 'utf8');
    const data = JSON.parse(content);
    return { count: data.count || 0, lastSuggested: data.lastSuggested || 0 };
  } catch (_e) {
    return { count: 0, lastSuggested: 0 };
  }
}

function saveCounter(counterPath, counter) {
  try {
    fs.writeFileSync(counterPath, JSON.stringify(counter), 'utf8');
  } catch (_e) {
    // Best-effort
  }
  // Mirror to .session.json for consolidated session state tracking
  // Derive planningDir from counterPath (counterPath is planningDir/.compact-counter)
  try {
    const planningDir = path.dirname(counterPath);
    const { sessionSave } = require('../plan-build-run/bin/lib/core.cjs');
    // Note: saveCounter doesn't have sessionId context — mirror to legacy path
    sessionSave(planningDir, { compactCounter: counter });
  } catch (_e) { /* non-fatal mirror */ }
}

function getThreshold(cwd) {
  const planningDir = path.join(cwd, '.planning');
  const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
  const config = configLoad(planningDir);
  // Honor explicit hooks.compactThreshold override first
  if (config && config.hooks && config.hooks.compactThreshold != null) {
    return config.hooks.compactThreshold;
  }
  return getScaledThreshold(planningDir);
}

function resetCounter(planningDir, sessionId) {
  // Primary: reset compactCounter in .session.json to 0
  try {
    const { sessionSave } = require('../plan-build-run/bin/lib/core.cjs');
    sessionSave(planningDir, { compactCounter: { count: 0, lastSuggested: 0 } }, sessionId);
  } catch (_e) { /* best-effort */ }

  // Legacy: also delete .compact-counter file if present
  const counterPath = path.join(planningDir, '.compact-counter');
  try {
    if (fs.existsSync(counterPath)) {
      fs.unlinkSync(counterPath);
    }
  } catch (_e) {
    // Best-effort
  }
}

module.exports = { checkCompaction, checkBridgeTier, buildCompositionAdvice, loadCounter, saveCounter, getThreshold, getScaledThreshold, resetCounter, DEFAULT_THRESHOLD, REMINDER_INTERVAL };
if (require.main === module || process.argv[1] === __filename) { main(); }

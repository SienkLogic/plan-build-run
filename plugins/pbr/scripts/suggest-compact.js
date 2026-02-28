#!/usr/bin/env node

/**
 * PostToolUse hook on Write|Edit: Tracks tool call count per session
 * and suggests /compact when approaching context limits.
 *
 * Counter stored in .planning/.compact-counter (JSON).
 * Threshold configurable via config.json hooks.compactThreshold (default: 50).
 * After first suggestion, re-suggests every 25 calls.
 * Counter resets on SessionStart (via progress-tracker.js).
 *
 * Exit codes:
 *   0 = always (advisory only)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { configLoad } = require('./pbr-tools');
const { loadBridge, TIER_MESSAGES } = require('./context-bridge');

const DEFAULT_THRESHOLD = 50;
const REMINDER_INTERVAL = 25;

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

  if (percent >= 85) {
    return { tier: 'CRITICAL', message: TIER_MESSAGES.CRITICAL };
  } else if (percent >= 70) {
    return { tier: 'POOR', message: TIER_MESSAGES.POOR };
  } else if (percent >= 50) {
    return { tier: 'DEGRADING', message: TIER_MESSAGES.DEGRADING };
  }

  // PEAK tier (<50%) — no tier message needed
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

      return {
        additionalContext: `[Context Budget - ${tier}] ${message}`
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
}

function getThreshold(cwd) {
  const planningDir = path.join(cwd, '.planning');
  const config = configLoad(planningDir);
  if (!config) return DEFAULT_THRESHOLD;
  return config.hooks?.compactThreshold || DEFAULT_THRESHOLD;
}

function resetCounter(planningDir) {
  const counterPath = path.join(planningDir, '.compact-counter');
  try {
    if (fs.existsSync(counterPath)) {
      fs.unlinkSync(counterPath);
    }
  } catch (_e) {
    // Best-effort
  }
}

module.exports = { checkCompaction, checkBridgeTier, loadCounter, saveCounter, getThreshold, resetCounter, DEFAULT_THRESHOLD, REMINDER_INTERVAL };
if (require.main === module || process.argv[1] === __filename) { main(); }

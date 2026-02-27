#!/usr/bin/env node

/**
 * PostToolUse hook: Context monitor bridge.
 *
 * Replaces heuristic context budget estimation with real data when available.
 * Writes context state to .planning/.context-budget.json for consumption by
 * track-context-budget.js and suggest-compact.js.
 *
 * Context tiers:
 *   PEAK      (0-30%)  — no warnings
 *   GOOD      (30-50%) — no warnings
 *   DEGRADING (50-70%) — suggest subagent delegation
 *   POOR      (70%+)   — recommend /pbr:pause
 *
 * Debounce: same-tier warnings suppressed for 5 tool calls.
 * Tier escalation always warns immediately.
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, advisory only)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

const TIERS = [
  { name: 'PEAK', min: 0, max: 30 },
  { name: 'GOOD', min: 30, max: 50 },
  { name: 'DEGRADING', min: 50, max: 70 },
  { name: 'POOR', min: 70, max: 100 }
];

const TIER_MESSAGES = {
  DEGRADING: 'Context is filling. Consider delegating heavy work to subagents.',
  POOR: 'Context critically low. Recommend /pbr:pause to save state.'
};

const DEBOUNCE_INTERVAL = 5; // tool calls between same-tier warnings

/**
 * Determine the context tier for a given percentage.
 * @param {number} percent - Context usage percentage (0-100)
 * @returns {{ name: string, min: number, max: number }}
 */
function getTier(percent) {
  for (const tier of TIERS) {
    if (percent < tier.max) return tier;
  }
  return TIERS[TIERS.length - 1];
}

/**
 * Load the bridge state file.
 * @param {string} bridgePath - Absolute path to .context-budget.json
 * @returns {Object} Bridge state
 */
function loadBridge(bridgePath) {
  try {
    const content = fs.readFileSync(bridgePath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    return null;
  }
}

/**
 * Save the bridge state file atomically.
 * @param {string} bridgePath - Absolute path to .context-budget.json
 * @param {Object} data - Bridge state to persist
 */
function saveBridge(bridgePath, data) {
  try {
    const tmpPath = bridgePath + '.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, bridgePath);
  } catch (_e) {
    // Best-effort — clean up temp file if rename failed
    try { fs.unlinkSync(bridgePath + '.' + process.pid); } catch (_e2) { /* best-effort */ }
  }
}

/**
 * Estimate context percentage from heuristic tracker data.
 * Uses the .context-tracker file written by track-context-budget.js.
 * Assumes 200k token context window (~800k chars).
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {number} Estimated context usage percentage (0-100)
 */
function estimateFromHeuristic(planningDir) {
  const trackerPath = path.join(planningDir, '.context-tracker');
  try {
    const content = fs.readFileSync(trackerPath, 'utf8');
    const tracker = JSON.parse(content);
    const totalChars = tracker.total_chars || 0;
    // 200k tokens ~ 800k chars; use 800000 as denominator
    const percent = Math.min(100, Math.round((totalChars / 800000) * 100));
    return percent;
  } catch (_e) {
    return 0;
  }
}

/**
 * Check if a tier warning should fire, applying debounce logic.
 *
 * @param {Object} bridge - Current bridge state
 * @param {string} tierName - Current tier name
 * @returns {boolean} True if warning should fire
 */
function shouldWarn(bridge, tierName) {
  // No warning for PEAK or GOOD
  if (tierName === 'PEAK' || tierName === 'GOOD') return false;

  const prevTier = bridge.last_warned_tier || 'PEAK';
  const callsSinceWarn = bridge.calls_since_warn || 0;

  // Tier escalation — always warn
  const tierOrder = { PEAK: 0, GOOD: 1, DEGRADING: 2, POOR: 3 };
  if ((tierOrder[tierName] || 0) > (tierOrder[prevTier] || 0)) {
    return true;
  }

  // Same tier — debounce
  if (callsSinceWarn >= DEBOUNCE_INTERVAL) {
    return true;
  }

  return false;
}

/**
 * Core bridge logic: update bridge state, return warning if applicable.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {Object} stdinData - Parsed stdin JSON from Claude Code
 * @returns {{ bridge: Object, output: Object|null }} Updated bridge and optional warning output
 */
function updateBridge(planningDir, stdinData) {
  const bridgePath = path.join(planningDir, '.context-budget.json');

  // Check if Claude Code provides real context percentage in stdin
  // Look for context_percent, usage_percent, context_usage, or similar fields
  const contextPercent = stdinData.context_percent
    || stdinData.usage_percent
    || (stdinData.context && stdinData.context.percent)
    || null;

  const source = contextPercent !== null ? 'bridge' : 'heuristic';
  const estimatedPercent = contextPercent !== null
    ? Math.round(contextPercent)
    : estimateFromHeuristic(planningDir);

  // Load existing bridge state
  let bridge = loadBridge(bridgePath) || {
    timestamp: new Date().toISOString(),
    estimated_percent: 0,
    source: 'heuristic',
    chars_read: 0,
    warnings_issued: [],
    last_warned_tier: 'PEAK',
    calls_since_warn: 0,
    tool_calls: 0
  };

  // Update bridge
  bridge.timestamp = new Date().toISOString();
  bridge.estimated_percent = estimatedPercent;
  bridge.source = source;
  bridge.tool_calls = (bridge.tool_calls || 0) + 1;
  bridge.calls_since_warn = (bridge.calls_since_warn || 0) + 1;

  // Read chars from tracker if available
  const trackerPath = path.join(planningDir, '.context-tracker');
  try {
    const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    bridge.chars_read = tracker.total_chars || 0;
  } catch (_e) {
    // Keep existing value
  }

  const tier = getTier(estimatedPercent);
  let output = null;

  if (shouldWarn(bridge, tier.name)) {
    const msg = TIER_MESSAGES[tier.name];
    if (msg) {
      bridge.last_warned_tier = tier.name;
      bridge.calls_since_warn = 0;
      bridge.warnings_issued = bridge.warnings_issued || [];
      bridge.warnings_issued.push({
        tier: tier.name,
        percent: estimatedPercent,
        timestamp: new Date().toISOString()
      });

      // Keep only last 20 warnings
      if (bridge.warnings_issued.length > 20) {
        bridge.warnings_issued = bridge.warnings_issued.slice(-20);
      }

      output = {
        additionalContext: `[Context Monitor — ${tier.name}] ${estimatedPercent}% used (${source}). ${msg}`
      };
    }
  }

  // Save bridge state
  saveBridge(bridgePath, bridge);

  return { bridge, output };
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const cwd = process.cwd();
      const planningDir = path.join(cwd, '.planning');
      if (!fs.existsSync(planningDir)) {
        process.exit(0);
      }

      const data = input ? JSON.parse(input) : {};
      const { output } = updateBridge(planningDir, data);

      if (output) {
        logHook('context-bridge', 'PostToolUse', 'warn', {
          percent: output.additionalContext.match(/(\d+)%/)?.[1],
          source: 'bridge'
        });
        process.stdout.write(JSON.stringify(output));
      }

      process.exit(0);
    } catch (_e) {
      // Never block on tracking errors
      process.exit(0);
    }
  });
}

module.exports = {
  getTier,
  loadBridge,
  saveBridge,
  estimateFromHeuristic,
  shouldWarn,
  updateBridge,
  TIERS,
  TIER_MESSAGES,
  DEBOUNCE_INTERVAL
};

if (require.main === module || process.argv[1] === __filename) { main(); }

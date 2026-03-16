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
 *   POOR      (70-85%) — recommend /pbr:pause-work
 *   CRITICAL  (85%+)   — urgent stop, context rot imminent
 *
 * Debounce: same-tier warnings suppressed for 5 tool calls (2 for CRITICAL).
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
  { name: 'POOR', min: 70, max: 85 },
  { name: 'CRITICAL', min: 85, max: 100 }
];

const TIER_MESSAGES = {
  DEGRADING: 'Context at ~50-70%. Delegate heavy reads and analysis to Task() subagents to preserve orchestrator quality.',
  POOR: 'Context at ~70-85%. Run /pbr:pause-work soon to save state before quality degrades.',
  CRITICAL: 'STOP — Context at 85%+. Run /pbr:pause-work NOW. Context rot is imminent — further work risks hallucinations and skipped steps.'
};

const DEBOUNCE_INTERVAL = 5; // tool calls between same-tier warnings
const CRITICAL_DEBOUNCE_INTERVAL = 2; // shorter debounce for CRITICAL tier

// Adaptive threshold constants
const BASE_TOKENS = 200000;
const TARGET_TOKENS = 1000000;
const BASE_THRESHOLDS = { degrading: 50, poor: 70, critical: 85 };
const TARGET_THRESHOLDS = { degrading: 60, poor: 75, critical: 85 };
const LOG_SCALE = Math.log(TARGET_TOKENS / BASE_TOKENS); // log(5)

/**
 * Compute adaptive thresholds using logarithmic interpolation.
 * At 200k tokens: returns base thresholds (50/70/85).
 * At 1M tokens: returns target thresholds (60/75/85).
 * Between: smooth log interpolation. Below 200k: base thresholds.
 *
 * @param {number} [contextTokens=200000] - Context window size in tokens
 * @returns {{ degrading: number, poor: number, critical: number }}
 */
function getAdaptiveThresholds(contextTokens) {
  const tokens = contextTokens || BASE_TOKENS;
  if (tokens <= BASE_TOKENS) {
    return { ...BASE_THRESHOLDS };
  }
  const clamped = Math.min(tokens, TARGET_TOKENS);
  const t = Math.log(clamped / BASE_TOKENS) / LOG_SCALE;
  return {
    degrading: Math.round(BASE_THRESHOLDS.degrading + (TARGET_THRESHOLDS.degrading - BASE_THRESHOLDS.degrading) * t),
    poor: Math.round(BASE_THRESHOLDS.poor + (TARGET_THRESHOLDS.poor - BASE_THRESHOLDS.poor) * t),
    critical: Math.round(BASE_THRESHOLDS.critical + (TARGET_THRESHOLDS.critical - BASE_THRESHOLDS.critical) * t)
  };
}

/**
 * Get effective thresholds based on config.
 * If threshold_curve is "adaptive", uses logarithmic interpolation.
 * If "linear" (default), returns fixed base thresholds.
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {{ degrading: number, poor: number, critical: number }}
 */
function getEffectiveThresholds(planningDir) {
  try {
    const { configLoad } = require('./pbr-tools');
    const config = configLoad(planningDir);
    const curve = (config && config.context_budget && config.context_budget.threshold_curve) || 'linear';
    const tokens = (config && config.context_window_tokens) || BASE_TOKENS;
    if (curve === 'adaptive') {
      return getAdaptiveThresholds(tokens);
    }
  } catch (_e) { /* fall through to default */ }
  return { ...BASE_THRESHOLDS };
}

/**
 * Determine the context tier for a given percentage.
 * @param {number} percent - Context usage percentage (0-100)
 * @param {{ degrading: number, poor: number, critical: number }} [thresholds] - Custom tier boundaries
 * @returns {{ name: string, min: number, max: number }}
 */
function getTier(percent, thresholds) {
  if (thresholds) {
    if (percent < 30) return { name: 'PEAK', min: 0, max: 30 };
    if (percent < thresholds.degrading) return { name: 'GOOD', min: 30, max: thresholds.degrading };
    if (percent < thresholds.poor) return { name: 'DEGRADING', min: thresholds.degrading, max: thresholds.poor };
    if (percent < thresholds.critical) return { name: 'POOR', min: thresholds.poor, max: thresholds.critical };
    return { name: 'CRITICAL', min: thresholds.critical, max: 100 };
  }
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
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
    fs.renameSync(tmpPath, bridgePath);
  } catch (_e) {
    // Best-effort — clean up temp file if rename failed
    try { fs.unlinkSync(bridgePath + '.' + process.pid); } catch (_e2) { /* best-effort */ }
  }
}

/**
 * Get the char denominator for heuristic context estimation.
 * Reads context_window_tokens from config (default 200k) and multiplies by 4 chars/token.
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {number} Total char capacity (context_window_tokens × 4, default 800000)
 */
function getCharDenominator(planningDir) {
  try {
    const { configLoad } = require('./pbr-tools');
    const config = configLoad(planningDir);
    const tokens = (config && config.context_window_tokens) || 200000;
    return tokens * 4;
  } catch (_e) {
    return 800000; // 200k tokens × 4 chars/token
  }
}

/**
 * Estimate context percentage from heuristic tracker data.
 * Uses the .context-tracker file written by track-context-budget.js.
 * Assumes context_window_tokens × 4 chars (default 200k tokens = 800k chars, loaded from config).
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
    const percent = Math.min(100, Math.round((totalChars / getCharDenominator(planningDir)) * 100));
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
  const tierOrder = { PEAK: 0, GOOD: 1, DEGRADING: 2, POOR: 3, CRITICAL: 4 };
  if ((tierOrder[tierName] || 0) > (tierOrder[prevTier] || 0)) {
    return true;
  }

  // Same tier — debounce (CRITICAL uses shorter interval)
  const interval = tierName === 'CRITICAL' ? CRITICAL_DEBOUNCE_INTERVAL : DEBOUNCE_INTERVAL;
  if (callsSinceWarn >= interval) {
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

  const thresholds = getEffectiveThresholds(planningDir);
  bridge.thresholds = thresholds;
  const tier = getTier(estimatedPercent, thresholds);
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
        process.exit(0);
      }

      // For Write|Edit tools, also run suggest-compact check in-process
      // (eliminates a separate Node process spawn per Write/Edit).
      // Detect Write|Edit by presence of file_path in tool_input.
      const toolInput = data.tool_input || {};
      if (toolInput.file_path || toolInput.path) {
        try {
          const { checkCompaction } = require('./suggest-compact');
          const compactResult = checkCompaction(planningDir, cwd);
          if (compactResult) {
            process.stdout.write(JSON.stringify(compactResult));
          }
        } catch (_e) { /* best-effort — never block on compact check */ }
      }

      process.exit(0);
    } catch (_e) {
      // Never block on tracking errors
      process.exit(0);
    }
  });
}

/**
 * HTTP handler for hook-server.js.
 * Called directly instead of spawning a subprocess.
 *
 * @param {Object} reqBody - Full hook request body { event, tool, data, planningDir, cache }
 * @param {Object} _cache - Server in-memory cache (unused by this handler)
 * @returns {{ additionalContext: string }|null}
 */
function handleHttp(reqBody, _cache) {
  try {
    const planningDir = reqBody.planningDir;
    const data = reqBody.data || {};
    if (!planningDir || !fs.existsSync(planningDir)) {
      return null;
    }

    const { output } = updateBridge(planningDir, data);

    if (output) {
      logHook('context-bridge', 'PostToolUse', 'warn', {
        percent: output.additionalContext.match(/(\d+)%/)?.[1],
        source: 'bridge'
      });
    }

    // For Write|Edit tools, also run suggest-compact check in-process
    const toolInput = data.tool_input || {};
    if (!output && (toolInput.file_path || toolInput.path)) {
      try {
        const { checkCompaction } = require('./suggest-compact');
        const compactResult = checkCompaction(planningDir, reqBody.planningDir ? reqBody.planningDir.replace(/[/\\]\.planning$/, '') : process.cwd());
        if (compactResult) {
          return compactResult;
        }
      } catch (_e) { /* best-effort — never block on compact check */ }
    }

    return output || null;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  getTier,
  getAdaptiveThresholds,
  getEffectiveThresholds,
  loadBridge,
  saveBridge,
  getCharDenominator,
  estimateFromHeuristic,
  shouldWarn,
  updateBridge,
  handleHttp,
  TIERS,
  TIER_MESSAGES,
  DEBOUNCE_INTERVAL,
  CRITICAL_DEBOUNCE_INTERVAL
};

if (require.main === module || process.argv[1] === __filename) { main(); }

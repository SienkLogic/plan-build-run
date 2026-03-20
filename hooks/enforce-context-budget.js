#!/usr/bin/env node

/**
 * PreToolUse hook: Context budget hard-stop enforcement.
 *
 * Blocks Skill and Task invocations when context usage reaches the
 * hard_stop_percent threshold (default 70%). Read-only tools (Read, Glob,
 * Grep) and Bash are never blocked — only Skill and Task, which spawn
 * expensive subagents or skill flows.
 *
 * Reads .planning/.context-budget.json (written by context-bridge.js)
 * for current estimated_percent. Configurable via config.json:
 *   context_budget.hard_stop_percent (default: 70)
 *   context_budget.enforce (default: true)
 *
 * Exit codes:
 *   0 = always (PreToolUse hooks must exit 0; use decision:block in output)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

const DEFAULT_HARD_STOP_PERCENT = 70;
const STALE_THRESHOLD_MS = 60000; // 60 seconds

/**
 * Core enforcement logic. Returns block output or null (allow).
 *
 * @param {Object} options
 * @param {string} options.toolName - Name of the tool being invoked
 * @param {string} options.planningDir - Path to .planning/ directory
 * @returns {Object|null} { decision: "block", reason: "..." } or null
 */
function checkBudget({ toolName, planningDir }) {
  // Only enforce for Task and Skill
  if (toolName !== 'Task' && toolName !== 'Skill') {
    return null;
  }

  // Read bridge file
  const bridgePath = path.join(planningDir, '.context-budget.json');
  let bridge;
  try {
    const content = fs.readFileSync(bridgePath, 'utf8');
    bridge = JSON.parse(content);
  } catch (_e) {
    // No bridge file or unreadable — no enforcement
    return null;
  }

  // Check staleness
  if (bridge.timestamp) {
    const ageMs = Date.now() - new Date(bridge.timestamp).getTime();
    if (ageMs > STALE_THRESHOLD_MS) {
      return null; // Stale data is unreliable
    }
  }

  // Read config for thresholds and enforcement toggle
  let hardStopPercent = DEFAULT_HARD_STOP_PERCENT;
  let enforce = true;
  try {
    const { configLoad } = require('../plugins/pbr/scripts/lib/config');
    const config = configLoad(planningDir);
    if (config && config.context_budget) {
      if (config.context_budget.hard_stop_percent != null) {
        hardStopPercent = config.context_budget.hard_stop_percent;
      }
      if (config.context_budget.enforce === false) {
        enforce = false;
      }
    }
  } catch (_e) {
    // Use defaults
  }

  if (!enforce) {
    return null;
  }

  const percent = bridge.estimated_percent || 0;

  if (percent >= hardStopPercent) {
    logHook('enforce-context-budget', 'PreToolUse', 'block', {
      percent,
      threshold: hardStopPercent,
      tool: toolName
    });
    return {
      decision: 'block',
      reason: `Context budget at ${percent}% (threshold: ${hardStopPercent}%). Run /clear or /compact and start a fresh session. Read-only tools still work.`
    };
  }

  return null;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = input ? JSON.parse(input) : {};
      const toolName = data.tool_name || '';

      // Quick exit for non-target tools
      if (toolName !== 'Task' && toolName !== 'Skill') {
        process.stdout.write(JSON.stringify({}));
        process.exit(0);
      }

      const planningDir = path.join(
        process.env.PBR_PROJECT_ROOT || process.cwd(),
        '.planning'
      );

      if (!fs.existsSync(planningDir)) {
        process.stdout.write(JSON.stringify({}));
        process.exit(0);
      }

      const result = checkBudget({ toolName, planningDir });
      process.stdout.write(JSON.stringify(result || {}));
      process.exit(0);
    } catch (_e) {
      // Never crash — allow on error
      process.stdout.write(JSON.stringify({}));
      process.exit(0);
    }
  });
}

module.exports = { checkBudget };

if (require.main === module || process.argv[1] === __filename) { main(); }

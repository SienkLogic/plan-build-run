#!/usr/bin/env node

/**
 * PreToolUse hook on EnterPlanMode: Warns users in PBR projects that
 * native plan mode won't integrate with PBR's planning system.
 *
 * Suggests /pbr:plan-phase instead. Does NOT block — just advises.
 *
 * Exit codes:
 *   0 = not a PBR project (passes through)
 *   2 = blocked (PBR project detected — redirects to /pbr:plan-phase)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

/**
 * Core detection logic extracted for both stdin (main) and HTTP (handleHttp) paths.
 *
 * @param {Object} data - Parsed hook input (same as stdin JSON)
 * @returns {Object|null} { decision: 'block', reason } if PBR project detected, null otherwise
 */
function checkPlanMode(data) {
  const cwd = (data && data.cwd) || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only relevant for Plan-Build-Run projects
  if (!fs.existsSync(planningDir)) {
    return null;
  }

  logHook('intercept-plan-mode', 'PreToolUse', 'warn', {
    reason: 'native plan mode used in PBR project'
  });

  return {
    decision: 'block',
    reason: 'This is a Plan-Build-Run project. Native plan mode stores plans outside .planning/ and won\'t integrate with PBR\'s workflow.\n\nUse instead:\n  /pbr:plan-phase <phase>  — Create a PBR-formatted plan for a phase\n  /pbr:quick         — Plan and execute an ad-hoc task\n  /pbr:import        — Import an external plan document into PBR format\n\nIf you already generated a plan in native plan mode, paste it into /pbr:import to convert it.'
  };
}

/**
 * HTTP handler for hook-server.js.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 *
 * @param {Object} reqBody - Request body from hook-server
 * @param {Object} _cache - In-memory server cache (unused)
 * @returns {Object|null} Hook response or null
 */
async function handleHttp(reqBody, _cache) {
  try {
    const data = (reqBody && reqBody.data) ? reqBody.data : {};
    return checkPlanMode(data);
  } catch (_e) {
    return null;
  }
}

function main() {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => {
    try {
      const result = checkPlanMode({});
      if (!result) {
        process.stdout.write(JSON.stringify({ decision: 'allow' }));
        process.exit(0);
      }
      process.stdout.write(JSON.stringify(result));
      process.exit(2);
    } catch (_e) {
      process.stderr.write(`[pbr] intercept-plan-mode error: ${_e.message}\n`);
      process.stdout.write(JSON.stringify({ decision: 'allow', additionalContext: '⚠ [PBR] intercept-plan-mode failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { main, checkPlanMode, handleHttp };

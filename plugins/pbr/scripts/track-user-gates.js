#!/usr/bin/env node

/**
 * PostToolUse hook on AskUserQuestion: Tracks when a skill invokes
 * AskUserQuestion by writing a signal file.
 *
 * This enables check-subagent-output.js to warn when a gate-requiring
 * skill completes without any AskUserQuestion calls.
 *
 * Signal file: .planning/.user-gate-passed
 * Content: { skill, timestamp, tool }
 *
 * Exit codes:
 *   0 = always (PostToolUse hooks never block)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

/**
 * Core logic: read active skill and write .user-gate-passed signal file.
 * Shared by both the stdin-based main() and the HTTP handleHttp() paths.
 */
function handleGate(planningDir) {
  // Read active skill name
  let skill = 'unknown';
  try {
    const skillPath = path.join(planningDir, '.active-skill');
    skill = fs.readFileSync(skillPath, 'utf8').trim() || 'unknown';
  } catch (_e) {
    // .active-skill missing — use fallback
  }

  // Write signal file
  const signalPath = path.join(planningDir, '.user-gate-passed');
  const signalData = JSON.stringify({
    skill,
    timestamp: new Date().toISOString(),
    tool: 'AskUserQuestion'
  });

  try {
    fs.writeFileSync(signalPath, signalData, 'utf8');
  } catch (_e) {
    // Best-effort — never fail the hook
  }

  logHook('track-user-gates', 'AskUserQuestion invoked', { skill });
  return null;
}

function main() {
  // Read stdin (PostToolUse data)
  let _data = {};
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) _data = JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }

  // Resolve .planning/ directory
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Not a PBR project — exit silently
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  handleGate(planningDir);
  process.exit(0);
}

/**
 * HTTP handler for hook-server.js integration.
 * Called when PostToolUse:AskUserQuestion arrives via the HTTP server.
 */
async function handleHttp(reqBody, _cache) {
  const planningDir = (reqBody && reqBody.planningDir) || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  if (!fs.existsSync(planningDir)) return null;
  handleGate(planningDir);
  return null;
}

module.exports = { main, handleHttp, handleGate };
if (require.main === module || process.argv[1] === __filename) { main(); }

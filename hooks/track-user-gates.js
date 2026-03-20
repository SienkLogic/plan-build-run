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

  process.exit(0);
}

module.exports = { main };
if (require.main === module || process.argv[1] === __filename) { main(); }

#!/usr/bin/env node

/**
 * InstructionsLoaded hook: Lightweight PBR state reminder after CLAUDE.md loads.
 *
 * Fires each time Claude Code loads CLAUDE.md or .claude/rules/*.md files.
 * For PBR projects: injects a brief reminder that PBR workflow is active.
 * Debounces mid-session re-fires using .session.json load timestamp.
 *
 * Non-blocking — always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { resolveSessionPath } = require('../plugins/pbr/scripts/lib/core');

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) { /* empty or non-JSON stdin */ }
  return {};
}

function main() {
  const data = readStdin();
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only relevant for PBR projects
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  // Debounce: only emit additionalContext on first fire per session.
  // .session.json is written by progress-tracker.js at SessionStart.
  // If it exists with a sessionStart timestamp, this is a mid-session reload.
  const sessionId = data.session_id || null;
  let isMidSession = false;
  try {
    const sessionFile = sessionId
      ? resolveSessionPath(planningDir, '.session.json', sessionId)
      : path.join(planningDir, '.session.json');
    if (fs.existsSync(sessionFile)) {
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (session.sessionStart) {
        isMidSession = true;
      }
    }
  } catch (_e) { /* non-fatal */ }

  logHook('instructions-loaded', 'InstructionsLoaded', isMidSession ? 'mid-session-reload' : 'initial-load', {
    instructions_file: data.instructions_file || null
  });

  // Mid-session: note that instructions reloaded (CLAUDE.md may have changed)
  if (isMidSession) {
    process.stdout.write(JSON.stringify({
      additionalContext: '[Plan-Build-Run] Project CLAUDE.md was reloaded mid-session. If PBR workflow rules changed, current skill invocation may be affected. Check .planning/STATE.md for current position.'
    }));
    process.exit(0);
  }

  // Initial load: no additionalContext needed — progress-tracker.js already
  // injected full state at SessionStart. Avoid double-injection.
  process.exit(0);
}

/**
 * handleHttp — hook-server.js interface.
 * reqBody = { event, tool, data, planningDir, cache }
 * Returns { additionalContext: "..." } or null. Never calls process.exit().
 */
function handleHttp(reqBody) {
  const data = (reqBody && reqBody.data) || {};
  const planningDir = reqBody && reqBody.planningDir;
  if (!planningDir || !fs.existsSync(planningDir)) return null;

  const sessionId = data.session_id || null;
  let isMidSession = false;
  try {
    const sessionFile = sessionId
      ? resolveSessionPath(planningDir, '.session.json', sessionId)
      : path.join(planningDir, '.session.json');
    if (fs.existsSync(sessionFile)) {
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (session.sessionStart) isMidSession = true;
    }
  } catch (_e) { /* non-fatal */ }

  logHook('instructions-loaded', 'InstructionsLoaded', isMidSession ? 'mid-session-reload' : 'initial-load', {
    instructions_file: data.instructions_file || null
  });

  if (isMidSession) {
    return {
      additionalContext: '[Plan-Build-Run] Project CLAUDE.md was reloaded mid-session. If PBR workflow rules changed, current skill invocation may be affected. Check .planning/STATE.md for current position.'
    };
  }
  return null;
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { main, handleHttp };

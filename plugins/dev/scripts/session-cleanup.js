#!/usr/bin/env node

/**
 * SessionEnd cleanup hook.
 *
 * Removes stale planning artifacts that shouldn't persist across sessions:
 *   - .planning/.auto-next (prevents confusion on next session start)
 *   - .planning/.active-operation (stale operation lock)
 *
 * Logs session end with reason to hook-log.
 * Non-blocking — best-effort cleanup, fails silently.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

function tryRemove(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (_e) {
    // best-effort — don't fail the hook
  }
  return false;
}

function main() {
  const data = readStdin();
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  const cleaned = [];

  if (tryRemove(path.join(planningDir, '.auto-next'))) {
    cleaned.push('.auto-next');
  }
  if (tryRemove(path.join(planningDir, '.active-operation'))) {
    cleaned.push('.active-operation');
  }

  const decision = cleaned.length > 0 ? 'cleaned' : 'nothing';
  logHook('session-cleanup', 'SessionEnd', decision, {
    reason: data.reason || null,
    removed: cleaned
  });

  process.exit(0);
}

main();

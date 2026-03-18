#!/usr/bin/env node

/**
 * Shared hook execution logger.
 *
 * Usage in hooks:
 *   const { logHook } = require('./hook-logger');
 *   logHook('validate-commit', 'PreToolUse', 'allow', { message: 'chore: ...' });
 *
 * Log file: .planning/logs/hooks.jsonl (in the project's .planning directory)
 * Format: One JSON line per entry (JSONL)
 * Rotation: Keeps last 200 entries max (checked once per process)
 */

const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('./lib/resolve-root');

const MAX_ENTRIES = 200;

/** Module-level flag: rotation runs at most once per process */
let _rotated = false;

/**
 * Rotate log file if it exceeds MAX_ENTRIES lines.
 * Called once per process on first getLogPath() invocation.
 */
function rotateLog(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return;
    const lines = content.split('\n');
    if (lines.length > MAX_ENTRIES) {
      const kept = lines.slice(lines.length - MAX_ENTRIES);
      fs.writeFileSync(logPath, kept.join('\n') + '\n', 'utf8');
    }
  } catch (_e) {
    // Best-effort rotation — never fail the hook
  }
}

function getLogPath() {
  const cwd = resolveProjectRoot();
  const planningDir = path.join(cwd, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  const newPath = path.join(logsDir, 'hooks.jsonl');
  const oldPath = path.join(planningDir, '.hook-log');

  // Auto-create .planning/logs/ directory if it doesn't exist.
  // Uses recursive:true so both .planning/ and logs/ are created in one call.
  // This ensures SessionStart events are captured even before /pbr:begin runs.
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // One-time migration: move old .hook-log to new location
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath);
  }

  // Rotate once per process
  if (!_rotated) {
    _rotated = true;
    rotateLog(newPath);
  }

  return newPath;
}

function logHook(hookName, eventType, decision, details = {}, startTime) {
  const logPath = getLogPath();
  if (!logPath) return;

  const entry = {
    ts: new Date().toISOString(),
    hook: hookName,
    event: eventType,
    decision,
    ...details
  };

  if (typeof startTime === 'number' && startTime > 0) {
    entry.duration_ms = Date.now() - startTime;
  }

  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_e) {
    // Best-effort logging — never fail the hook
  }
}

module.exports = { logHook };

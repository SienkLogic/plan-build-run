#!/usr/bin/env node

/**
 * Shared hook execution logger.
 *
 * Usage in hooks:
 *   const { logHook } = require('./hook-logger');
 *   logHook('validate-commit', 'PreToolUse', 'allow', { message: 'chore: ...' });
 *
 * Log files: .planning/logs/hooks-YYYY-MM-DD.jsonl (one file per day, no size cap)
 * Format: One JSON line per entry (JSONL), append-only
 * Retention: Old daily files are cleaned up after MAX_DAYS days by session-cleanup.js
 */

const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('./lib/resolve-root');

const MAX_DAYS = 30;

/** Return today's date string as YYYY-MM-DD (local time). */
function getTodayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Return the log filename for a given date (defaults to today). */
function getLogFilename(date) {
  return `hooks-${date || getTodayDate()}.jsonl`;
}

/** Return the full path to the hooks log for a given date (defaults to today). */
function getLogPath(date) {
  const logDirOverride = process.env.PBR_LOG_DIR;
  if (logDirOverride) {
    if (!fs.existsSync(logDirOverride)) {
      fs.mkdirSync(logDirOverride, { recursive: true });
    }
    return path.join(logDirOverride, getLogFilename(date));
  }

  const cwd = resolveProjectRoot();
  const logsDir = path.join(cwd, '.planning', 'logs');

  // Auto-create .planning/logs/ if it doesn't exist.
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // One-time migration: rename legacy hooks.jsonl to yesterday's dated file.
  const legacyPath = path.join(logsDir, 'hooks.jsonl');
  if (fs.existsSync(legacyPath)) {
    const yesterday = new Date(Date.now() - 86400000);
    const yDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const migratedPath = path.join(logsDir, `hooks-${yDate}.jsonl`);
    // Only migrate if the dated file doesn't already exist (avoid overwriting)
    if (!fs.existsSync(migratedPath)) {
      try { fs.renameSync(legacyPath, migratedPath); } catch (_e) { /* best-effort */ }
    } else {
      try { fs.unlinkSync(legacyPath); } catch (_e) { /* best-effort */ }
    }
  }

  // One-time migration: move very old .hook-log to dated file
  const veryOldPath = path.join(cwd, '.planning', '.hook-log');
  if (fs.existsSync(veryOldPath)) {
    try { fs.unlinkSync(veryOldPath); } catch (_e) { /* best-effort */ }
  }

  return path.join(logsDir, getLogFilename(date));
}

/**
 * Delete hooks-*.jsonl files older than MAX_DAYS days.
 * Called by session-cleanup.js at session end — not called on every log write.
 */
function cleanOldHookLogs(logsDir) {
  try {
    const cutoff = Date.now() - MAX_DAYS * 86400000;
    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      if (!/^hooks-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) continue;
      const filePath = path.join(logsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
    }
  } catch (_e) {
    // Best-effort cleanup — never fail the caller
  }
}

function logHook(hookName, eventType, decision, details = {}, startTime, source, sessionId) {
  const logPath = getLogPath();
  if (!logPath) return;

  const entry = {
    ts: new Date().toISOString(),
    hook: hookName,
    event: eventType,
    decision,
    ...details
  };

  if (source) entry.source = source;
  if (sessionId) entry.sid = sessionId;

  if (typeof startTime === 'number' && startTime > 0) {
    entry.duration_ms = Date.now() - startTime;
  }

  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_e) {
    // Best-effort logging — never fail the hook
  }
}

module.exports = { logHook, getLogPath, getLogFilename, cleanOldHookLogs, getTodayDate };

#!/usr/bin/env node

/**
 * Workflow event logger for Plan-Build-Run observability.
 *
 * Usage as module:
 *   const { logEvent } = require('./event-logger');
 *   logEvent('workflow', 'phase-start', { phase: 3, name: 'API' });
 *
 * Usage as CLI:
 *   node event-logger.js <category> <event> [JSON-details]
 *
 * Log files: .planning/logs/events-YYYY-MM-DD.jsonl (one file per day, no size cap)
 * Format: One JSON line per entry (JSONL), append-only
 * Retention: Old daily files are cleaned up after MAX_DAYS days by session-cleanup.js
 */

const fs = require('fs');
const path = require('path');

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
  return `events-${date || getTodayDate()}.jsonl`;
}

/** Return the full path to the events log for a given date (defaults to today). */
function getLogPath(date) {
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const logsDir = path.join(cwd, '.planning', 'logs');
  // Auto-create .planning/logs/ if needed.
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // One-time migration: rename legacy events.jsonl to yesterday's dated file.
  const legacyPath = path.join(logsDir, 'events.jsonl');
  if (fs.existsSync(legacyPath)) {
    const yesterday = new Date(Date.now() - 86400000);
    const yDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const migratedPath = path.join(logsDir, `events-${yDate}.jsonl`);
    if (!fs.existsSync(migratedPath)) {
      try { fs.renameSync(legacyPath, migratedPath); } catch (_e) { /* best-effort */ }
    } else {
      try { fs.unlinkSync(legacyPath); } catch (_e) { /* best-effort */ }
    }
  }

  return path.join(logsDir, getLogFilename(date));
}

function logEvent(category, event, details = {}, sessionId) {
  const logPath = getLogPath();
  if (!logPath) return;

  const entry = {
    ts: new Date().toISOString(),
    cat: category,
    event,
    ...details
  };

  if (sessionId) entry.sid = sessionId;

  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_e) {
    // Best-effort logging — never fail the caller
  }
}

/**
 * Delete events-*.jsonl files older than MAX_DAYS days.
 * Called by session-cleanup.js at session end.
 */
function cleanOldEventLogs(logsDir) {
  try {
    const cutoff = Date.now() - MAX_DAYS * 86400000;
    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      if (!/^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) continue;
      const filePath = path.join(logsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
    }
  } catch (_e) {
    // Best-effort cleanup — never fail the caller
  }
}

// CLI mode
function main() {
  const args = process.argv.slice(2);
  const category = args[0];
  const event = args[1];
  let details = {};

  if (args[2]) {
    try {
      details = JSON.parse(args[2]);
    } catch (_e) {
      details = { raw: args[2] };
    }
  }

  if (!category || !event) {
    process.stdout.write(JSON.stringify({ error: 'Usage: event-logger.js <category> <event> [JSON-details]' }));
    process.exit(1);
  }

  logEvent(category, event, details);
  process.stdout.write(JSON.stringify({ logged: true, category, event }));
  process.exit(0);
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { logEvent, getLogPath, getLogFilename, cleanOldEventLogs };

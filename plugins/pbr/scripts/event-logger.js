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
 * Log file: .planning/logs/events.jsonl
 * Format: One JSON line per entry (JSONL)
 * Rotation: Keeps last 1000 entries max
 */

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 1000;

function getLogPath() {
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) return null;
  const logsDir = path.join(planningDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return path.join(logsDir, 'events.jsonl');
}

function logEvent(category, event, details = {}) {
  const logPath = getLogPath();
  if (!logPath) return;

  const entry = {
    ts: new Date().toISOString(),
    cat: category,
    event,
    ...details
  };

  try {
    let lines = [];
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8').trim();
      if (content) {
        lines = content.split('\n');
      }
    }

    lines.push(JSON.stringify(entry));

    if (lines.length > MAX_ENTRIES) {
      lines = lines.slice(lines.length - MAX_ENTRIES);
    }

    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
  } catch (_e) {
    // Best-effort logging — never fail the caller
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
module.exports = { logEvent };

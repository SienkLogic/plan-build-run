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
 * Rotation: Keeps last 200 entries max
 */

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 200;

function getLogPath() {
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) return null;

  const logsDir = path.join(planningDir, 'logs');
  const newPath = path.join(logsDir, 'hooks.jsonl');
  const oldPath = path.join(planningDir, '.hook-log');

  // Auto-create logs/ directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // One-time migration: move old .hook-log to new location
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath);
  }

  return newPath;
}

function logHook(hookName, eventType, decision, details = {}) {
  const logPath = getLogPath();
  if (!logPath) return; // Not a Towline project

  const entry = {
    ts: new Date().toISOString(),
    hook: hookName,
    event: eventType,
    decision,
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

    // Keep only last MAX_ENTRIES
    if (lines.length > MAX_ENTRIES) {
      lines = lines.slice(lines.length - MAX_ENTRIES);
    }

    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
  } catch (_e) {
    // Best-effort logging — never fail the hook
  }
}

module.exports = { logHook };

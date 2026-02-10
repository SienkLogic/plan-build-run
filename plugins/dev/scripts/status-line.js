#!/usr/bin/env node

/**
 * Status line: Updates Claude Code status bar with phase progress and
 * context usage bar.
 *
 * Reads STATE.md for project position. Receives session JSON on stdin
 * from Claude Code (context_window, model, cost, etc.).
 *
 * Output: plain text with ANSI color codes to stdout.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  boldCyan: '\x1b[1;36m',
  boldGreen: '\x1b[1;32m',
  boldYellow: '\x1b[1;33m',
  boldRed: '\x1b[1;31m',
};

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // stdin may be empty or not JSON — that's fine
  }
  return {};
}

function getContextPercent(stdinData) {
  // Claude Code statusLine sends context_window.used_percentage (0-100)
  if (stdinData.context_window && stdinData.context_window.used_percentage != null) {
    return Math.round(stdinData.context_window.used_percentage);
  }
  // Legacy field name
  if (stdinData.context_usage_fraction != null) {
    return Math.round(stdinData.context_usage_fraction * 100);
  }
  return null;
}

/**
 * Build a horizontal bar using Unicode block characters.
 * Width is in character cells. Color shifts green → yellow → red.
 */
function buildContextBar(percent, width) {
  if (width < 1) return '';
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  // Color based on usage threshold
  let barColor;
  if (percent >= 90) barColor = c.boldRed;
  else if (percent >= 70) barColor = c.boldYellow;
  else barColor = c.boldGreen;

  const filledStr = '\u2588'.repeat(filled);   // █
  const emptyStr = '\u2591'.repeat(empty);      // ░

  return `${barColor}${filledStr}${c.dim}${emptyStr}${c.reset}`;
}

/**
 * Pick a color for the phase status keyword.
 */
function statusColor(statusText) {
  const lower = statusText.toLowerCase();
  if (lower.includes('complete') || lower.includes('verified')) return c.green;
  if (lower.includes('progress') || lower.includes('building') || lower.includes('executing')) return c.yellow;
  if (lower.includes('planned') || lower.includes('ready')) return c.cyan;
  if (lower.includes('blocked') || lower.includes('failed')) return c.red;
  return c.white;
}

function main() {
  const stdinData = readStdin();
  const cwd = process.cwd();
  const stateFile = path.join(cwd, '.planning', 'STATE.md');

  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  try {
    const content = fs.readFileSync(stateFile, 'utf8');
    const ctxPercent = getContextPercent(stdinData);
    const status = buildStatusLine(content, ctxPercent);

    if (status) {
      process.stdout.write(status);
      logHook('status-line', 'StatusLine', 'updated', { ctxPercent });
    }
  } catch (_e) {
    logHook('status-line', 'StatusLine', 'error', { error: _e.message });
  }

  process.exit(0);
}

function buildStatusLine(content, ctxPercent) {
  const parts = [];

  // Extract phase info
  const phaseMatch = content.match(/Phase:\s*(\d+)\s*of\s*(\d+)\s*(?:\(([^)]+)\))?/);
  if (phaseMatch) {
    parts.push(`${c.boldCyan}\u25C6 Towline${c.reset} ${c.bold}Phase ${phaseMatch[1]}/${phaseMatch[2]}${c.reset}`);
    if (phaseMatch[3]) {
      parts.push(`${c.magenta}${phaseMatch[3]}${c.reset}`);
    }
  } else {
    // No phase info — still brand it
    parts.push(`${c.boldCyan}\u25C6 Towline${c.reset}`);
  }

  // Extract plan info
  const planMatch = content.match(/Plan:\s*(\d+)\s*of\s*(\d+)/);
  if (planMatch) {
    const done = parseInt(planMatch[1], 10);
    const total = parseInt(planMatch[2], 10);
    const planColor = done === total ? c.green : c.white;
    parts.push(`${planColor}Plan ${done}/${total}${c.reset}`);
  }

  // Extract status text
  const statusMatch = content.match(/Status:\s*(.+)/);
  if (statusMatch) {
    const text = statusMatch[1].trim();
    // Truncate long status to keep line manageable
    const short = text.length > 50 ? text.slice(0, 47) + '...' : text;
    parts.push(`${statusColor(text)}${short}${c.reset}`);
  }

  // Context usage bar
  if (ctxPercent != null) {
    const bar = buildContextBar(ctxPercent, 10);
    parts.push(`${bar} ${c.dim}${ctxPercent}%${c.reset}`);
  }

  if (parts.length === 0) return null;

  return parts.join(` ${c.dim}\u2502${c.reset} `);
}

if (require.main === module) { main(); }
module.exports = { buildStatusLine, buildContextBar, getContextPercent };

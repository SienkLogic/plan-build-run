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
const { configLoad } = require('./towline-tools');

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

// Default status_line config — works out of the box with zero config
const DEFAULTS = {
  sections: ['phase', 'plan', 'status', 'context'],
  brand_text: '\u25C6 Towline',
  max_status_length: 50,
  context_bar: {
    width: 10,
    thresholds: { green: 70, yellow: 90 },
    chars: { filled: '\u2588', empty: '\u2591' }
  }
};

/**
 * Load status_line config from .planning/config.json, merged with defaults.
 * Returns DEFAULTS if no config exists or no status_line section is present.
 */
function loadStatusLineConfig(planningDir) {
  const config = configLoad(planningDir);
  if (!config || !config.status_line) return DEFAULTS;

  const sl = config.status_line;
  return {
    sections: Array.isArray(sl.sections) ? sl.sections : DEFAULTS.sections,
    brand_text: typeof sl.brand_text === 'string' ? sl.brand_text : DEFAULTS.brand_text,
    max_status_length: typeof sl.max_status_length === 'number' ? sl.max_status_length : DEFAULTS.max_status_length,
    context_bar: {
      width: (sl.context_bar && typeof sl.context_bar.width === 'number') ? sl.context_bar.width : DEFAULTS.context_bar.width,
      thresholds: {
        green: (sl.context_bar && sl.context_bar.thresholds && typeof sl.context_bar.thresholds.green === 'number') ? sl.context_bar.thresholds.green : DEFAULTS.context_bar.thresholds.green,
        yellow: (sl.context_bar && sl.context_bar.thresholds && typeof sl.context_bar.thresholds.yellow === 'number') ? sl.context_bar.thresholds.yellow : DEFAULTS.context_bar.thresholds.yellow
      },
      chars: {
        filled: (sl.context_bar && sl.context_bar.chars && typeof sl.context_bar.chars.filled === 'string') ? sl.context_bar.chars.filled : DEFAULTS.context_bar.chars.filled,
        empty: (sl.context_bar && sl.context_bar.chars && typeof sl.context_bar.chars.empty === 'string') ? sl.context_bar.chars.empty : DEFAULTS.context_bar.chars.empty
      }
    }
  };
}

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
 * Width is in character cells. Color shifts green -> yellow -> red.
 *
 * @param {number} percent - Usage percentage (0-100)
 * @param {number} width - Bar width in characters
 * @param {object} [opts] - Optional config overrides
 * @param {object} [opts.thresholds] - { green: number, yellow: number }
 * @param {object} [opts.chars] - { filled: string, empty: string }
 */
function buildContextBar(percent, width, opts) {
  if (width < 1) return '';
  const thresholds = (opts && opts.thresholds) || DEFAULTS.context_bar.thresholds;
  const chars = (opts && opts.chars) || DEFAULTS.context_bar.chars;

  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  // Color based on usage threshold
  let barColor;
  if (percent >= thresholds.yellow) barColor = c.boldRed;
  else if (percent >= thresholds.green) barColor = c.boldYellow;
  else barColor = c.boldGreen;

  const filledStr = chars.filled.repeat(filled);
  const emptyStr = chars.empty.repeat(empty);

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
  const planningDir = path.join(cwd, '.planning');
  const stateFile = path.join(planningDir, 'STATE.md');

  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  try {
    const slConfig = loadStatusLineConfig(planningDir);
    const content = fs.readFileSync(stateFile, 'utf8');
    const ctxPercent = getContextPercent(stdinData);
    const status = buildStatusLine(content, ctxPercent, slConfig);

    if (status) {
      process.stdout.write(status);
      logHook('status-line', 'StatusLine', 'updated', { ctxPercent });
    }
  } catch (_e) {
    logHook('status-line', 'StatusLine', 'error', { error: _e.message });
  }

  process.exit(0);
}

function buildStatusLine(content, ctxPercent, cfg) {
  const config = cfg || DEFAULTS;
  const sections = config.sections || DEFAULTS.sections;
  const brandText = config.brand_text || DEFAULTS.brand_text;
  const maxLen = config.max_status_length || DEFAULTS.max_status_length;
  const barCfg = config.context_bar || DEFAULTS.context_bar;

  const parts = [];

  // Phase section (always includes brand text)
  if (sections.includes('phase')) {
    const phaseMatch = content.match(/Phase:\s*(\d+)\s*of\s*(\d+)\s*(?:\(([^)]+)\))?/);
    if (phaseMatch) {
      parts.push(`${c.boldCyan}${brandText}${c.reset} ${c.bold}Phase ${phaseMatch[1]}/${phaseMatch[2]}${c.reset}`);
      if (phaseMatch[3]) {
        parts.push(`${c.magenta}${phaseMatch[3]}${c.reset}`);
      }
    } else {
      parts.push(`${c.boldCyan}${brandText}${c.reset}`);
    }
  }

  // Plan section
  if (sections.includes('plan')) {
    const planMatch = content.match(/Plan:\s*(\d+)\s*of\s*(\d+)/);
    if (planMatch) {
      const done = parseInt(planMatch[1], 10);
      const total = parseInt(planMatch[2], 10);
      const planColor = done === total ? c.green : c.white;
      parts.push(`${planColor}Plan ${done}/${total}${c.reset}`);
    }
  }

  // Status section
  if (sections.includes('status')) {
    const statusMatch = content.match(/Status:\s*(.+)/);
    if (statusMatch) {
      const text = statusMatch[1].trim();
      const short = text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
      parts.push(`${statusColor(text)}${short}${c.reset}`);
    }
  }

  // Context bar section
  if (sections.includes('context') && ctxPercent != null) {
    const bar = buildContextBar(ctxPercent, barCfg.width || DEFAULTS.context_bar.width, {
      thresholds: barCfg.thresholds || DEFAULTS.context_bar.thresholds,
      chars: barCfg.chars || DEFAULTS.context_bar.chars
    });
    parts.push(`${bar} ${c.dim}${ctxPercent}%${c.reset}`);
  }

  if (parts.length === 0) return null;

  return parts.join(` ${c.dim}\u2502${c.reset} `);
}

if (require.main === module) { main(); }
module.exports = { buildStatusLine, buildContextBar, getContextPercent, loadStatusLineConfig, DEFAULTS };

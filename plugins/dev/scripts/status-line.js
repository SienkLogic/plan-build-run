#!/usr/bin/env node

/**
 * Status line hook: Updates Claude Code status line with current
 * phase/progress display.
 *
 * Reads STATE.md and outputs a concise status string.
 * Parses stdin JSON for context_usage_fraction when available.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

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
  if (stdinData.context_usage_fraction != null) {
    return Math.round(stdinData.context_usage_fraction * 100);
  }
  // Fallback: check env vars
  const used = process.env.CLAUDE_CONTEXT_TOKENS_USED;
  const total = process.env.CLAUDE_CONTEXT_TOKENS_TOTAL;
  if (used && total && Number(total) > 0) {
    return Math.round((Number(used) / Number(total)) * 100);
  }
  return null;
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
      const output = { statusLine: status };
      process.stdout.write(JSON.stringify(output));
      logHook('status-line', 'StatusLine', 'updated', { status, ctxPercent });
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
    parts.push(`Phase ${phaseMatch[1]}/${phaseMatch[2]}`);
    if (phaseMatch[3]) {
      parts.push(phaseMatch[3]);
    }
  }

  // Extract plan info
  const planMatch = content.match(/Plan:\s*(\d+)\s*of\s*(\d+)/);
  if (planMatch) {
    parts.push(`Plan ${planMatch[1]}/${planMatch[2]}`);
  }

  // Extract status
  const statusMatch = content.match(/Status:\s*(.+)/);
  if (statusMatch) {
    parts.push(statusMatch[1].trim());
  }

  // Append context usage
  if (ctxPercent != null) {
    const warn = ctxPercent > 80 ? '!' : '';
    parts.push(`ctx:${ctxPercent}%${warn}`);
  }

  if (parts.length === 0) return null;

  return `Towline: ${parts.join(' | ')}`;
}

main();

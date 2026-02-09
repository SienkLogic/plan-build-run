#!/usr/bin/env node

/**
 * Status line hook: Updates Claude Code status line with current
 * phase/progress display.
 *
 * Reads STATE.md and outputs a concise status string.
 */

const fs = require('fs');
const path = require('path');

function main() {
  const cwd = process.cwd();
  const stateFile = path.join(cwd, '.planning', 'STATE.md');

  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  try {
    const content = fs.readFileSync(stateFile, 'utf8');
    const status = buildStatusLine(content);

    if (status) {
      const output = { statusLine: status };
      process.stdout.write(JSON.stringify(output));
    }
  } catch (_e) {
    // Silent failure
  }

  process.exit(0);
}

function buildStatusLine(content) {
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

  if (parts.length === 0) return null;

  return `Towline: ${parts.join(' | ')}`;
}

main();

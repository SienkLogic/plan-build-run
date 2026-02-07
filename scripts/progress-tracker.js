#!/usr/bin/env node

/**
 * SessionStart hook: Auto-detects .planning/ directory and injects
 * project state as additionalContext.
 *
 * If no .planning/ directory exists, exits silently (non-Towline project).
 * If STATE.md exists, reads and outputs a concise summary.
 */

const fs = require('fs');
const path = require('path');

function main() {
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const stateFile = path.join(planningDir, 'STATE.md');

  // Not a Towline project
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  const context = buildContext(planningDir, stateFile);

  if (context) {
    const output = {
      additionalContext: context
    };
    process.stdout.write(JSON.stringify(output));
  }

  process.exit(0);
}

function buildContext(planningDir, stateFile) {
  const parts = [];

  parts.push('[Towline Project Detected]');

  // Read STATE.md if it exists
  if (fs.existsSync(stateFile)) {
    const state = fs.readFileSync(stateFile, 'utf8');

    // Extract key sections
    const position = extractSection(state, 'Current Position');
    if (position) {
      parts.push(`\nPosition:\n${position}`);
    }

    const blockers = extractSection(state, 'Blockers/Concerns');
    if (blockers && !blockers.includes('None')) {
      parts.push(`\nBlockers:\n${blockers}`);
    }

    const continuity = extractSection(state, 'Session Continuity');
    if (continuity) {
      parts.push(`\nLast Session:\n${continuity}`);
    }
  } else {
    parts.push('\nNo STATE.md found. Run /dev:begin to initialize or /dev:status to check.');
  }

  // Check for .continue-here.md files
  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    const continueFiles = findContinueFiles(phasesDir);
    if (continueFiles.length > 0) {
      parts.push(`\nPaused work found: ${continueFiles.join(', ')}`);
      parts.push('Run /dev:resume to pick up where you left off.');
    }
  }

  // Check for config
  const configFile = path.join(planningDir, 'config.json');
  if (fs.existsSync(configFile)) {
    try {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      parts.push(`\nConfig: depth=${config.depth || 'standard'}, mode=${config.mode || 'interactive'}`);
    } catch (e) {
      // Ignore parse errors
    }
  }

  parts.push('\nAvailable commands: /dev:status, /dev:plan, /dev:build, /dev:review, /dev:help');

  return parts.join('\n');
}

function extractSection(content, heading) {
  const regex = new RegExp(`##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const match = content.match(regex);
  if (!match) return null;
  const section = match[1].trim();
  // Return first 5 lines max
  return section.split('\n').slice(0, 5).join('\n');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findContinueFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findContinueFiles(fullPath));
      } else if (entry.name.includes('.continue-here')) {
        results.push(path.relative(dir, fullPath));
      }
    }
  } catch (e) {
    // Ignore permission errors
  }
  return results;
}

main();

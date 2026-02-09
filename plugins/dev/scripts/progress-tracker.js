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
const os = require('os');
const { logHook } = require('./hook-logger');

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
    logHook('progress-tracker', 'SessionStart', 'injected', { hasState: true });
  } else {
    logHook('progress-tracker', 'SessionStart', 'skipped', { hasState: false });
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
    } catch (_e) {
      // Ignore parse errors
    }
  }

  // Check for quick notes
  const projectNotesFile = path.join(planningDir, 'NOTES.md');
  const globalNotesFile = path.join(os.homedir(), '.claude', 'notes.md');
  const projectNoteCount = countNotes(projectNotesFile);
  const globalNoteCount = countNotes(globalNotesFile);
  if (projectNoteCount > 0 || globalNoteCount > 0) {
    const noteParts = [];
    if (projectNoteCount > 0) noteParts.push(`${projectNoteCount} project`);
    if (globalNoteCount > 0) noteParts.push(`${globalNoteCount} global`);
    parts.push(`\nNotes: ${noteParts.join(', ')}. \`/dev:note list\` to review.`);
  }

  // Check ROADMAP/STATE sync (S>M-2)
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  if (fs.existsSync(stateFile) && fs.existsSync(roadmapFile)) {
    try {
      const roadmap = fs.readFileSync(roadmapFile, 'utf8');
      const state = fs.readFileSync(stateFile, 'utf8');

      // Extract current phase from STATE.md
      const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
      if (phaseMatch) {
        const currentPhase = parseInt(phaseMatch[1], 10);
        // Check if ROADMAP shows this phase as already verified/complete
        const progressTable = roadmap.match(/## Progress[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
        if (progressTable) {
          const rows = progressTable[0].split('\n').filter(r => r.includes('|'));
          for (const row of rows) {
            const cols = row.split('|').map(c => c.trim()).filter(Boolean);
            if (cols.length >= 4) {
              const phaseNum = parseInt(cols[0], 10);
              const status = cols[3] ? cols[3].toLowerCase() : '';
              if (phaseNum === currentPhase && (status === 'verified' || status === 'complete')) {
                parts.push(`\nWarning: STATE.md may be outdated — ROADMAP.md shows phase ${currentPhase} as ${status}.`);
              }
            }
          }
        }
      }
    } catch (_e) {
      // Ignore parse errors
    }
  }

  // Check for stale .auto-next signal (S>M-9)
  const autoNextFile = path.join(planningDir, '.auto-next');
  if (fs.existsSync(autoNextFile)) {
    try {
      const stats = fs.statSync(autoNextFile);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageMinutes = Math.floor(ageMs / 60000);
      if (ageMinutes > 10) {
        parts.push(`\nWarning: Stale .auto-next signal found (${ageMinutes} minutes old). This may trigger an unexpected command. Consider deleting .planning/.auto-next.`);
        logHook('progress-tracker', 'SessionStart', 'stale-auto-next', { ageMinutes });
      }
    } catch (_e) {
      // Ignore errors
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
  } catch (_e) {
    // Ignore permission errors
  }
  return results;
}

function countNotes(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    return lines.filter(l => /^- \[/.test(l) && !l.includes('[promoted]')).length;
  } catch (_e) {
    return 0;
  }
}

main();

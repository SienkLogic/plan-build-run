#!/usr/bin/env node

/**
 * SessionStart hook: Auto-detects .planning/ directory and injects
 * project state as additionalContext.
 *
 * If no .planning/ directory exists, exits silently (non-Plan-Build-Run project).
 * If STATE.md exists, reads and outputs a concise summary.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { configLoad } = require('./pbr-tools');

function main() {
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const stateFile = path.join(planningDir, 'STATE.md');

  // Not a Plan-Build-Run project
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  // Reset compaction counter for new session
  const { resetCounter } = require('./suggest-compact');
  resetCounter(planningDir);

  const context = buildContext(planningDir, stateFile);

  // Auto-launch dashboard if configured
  const config = configLoad(planningDir);
  if (config && config.dashboard && config.dashboard.auto_launch) {
    tryLaunchDashboard(config.dashboard.port || 3000, planningDir, cwd);
  }

  if (context) {
    const output = {
      additionalContext: context
    };
    process.stdout.write(JSON.stringify(output));
    logHook('progress-tracker', 'SessionStart', 'injected', { hasState: true });
    logEvent('workflow', 'session-start', { hasState: true });
  } else {
    logHook('progress-tracker', 'SessionStart', 'skipped', { hasState: false });
    logEvent('workflow', 'session-start', { hasState: false });
  }

  process.exit(0);
}

function buildContext(planningDir, stateFile) {
  const parts = [];

  parts.push('[Plan-Build-Run Project Detected]');

  // Git context
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 3000 }).trim();
    const porcelain = execSync('git status --porcelain', { encoding: 'utf8', timeout: 3000 }).trim();
    const uncommitted = porcelain ? porcelain.split('\n').length : 0;
    const recentCommits = execSync('git log -5 --oneline', { encoding: 'utf8', timeout: 3000 }).trim();
    parts.push(`\nGit: ${branch} (${uncommitted} uncommitted file${uncommitted !== 1 ? 's' : ''})`);
    if (recentCommits) {
      parts.push(`Recent commits:\n${recentCommits}`);
    }
  } catch (_e) {
    // Not a git repo or git not available — skip
  }

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

    // Detect stale "Building" status — likely a crashed executor
    const statusMatch = state.match(/\*{0,2}(?:Phase\s+)?Status\*{0,2}:\s*["']?(\w+)["']?/i);
    if (statusMatch && statusMatch[1].toLowerCase() === 'building') {
      try {
        const stateStat = fs.statSync(stateFile);
        const ageMs = Date.now() - stateStat.mtimeMs;
        const ageMinutes = Math.round(ageMs / 60000);
        if (ageMinutes > 30) {
          // Auto-repair: reset stale "Building" status back to "Planned"
          try {
            const { stateUpdate } = require('./pbr-tools');
            stateUpdate(planningDir, { status: 'planned' });
            parts.push(`\nAuto-repaired: STATE.md was stuck in "Building" for ${ageMinutes} minutes (likely crashed executor). Reset to "Planned". Run /pbr:build to retry.`);
            logHook('progress-tracker', 'SessionStart', 'stale-building-repaired', { ageMinutes });
          } catch (_repairErr) {
            parts.push(`\nWarning: STATE.md shows status "Building" but was last modified ${ageMinutes} minutes ago. This may indicate a crashed executor. Run /pbr:health to diagnose.`);
            logHook('progress-tracker', 'SessionStart', 'stale-building', { ageMinutes });
          }
        }
      } catch (_e) { /* best-effort */ }
    }
  } else {
    parts.push('\nNo STATE.md found. Run /pbr:begin to initialize or /pbr:status to check.');
  }

  // Check for .continue-here.md files
  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    const continueFiles = findContinueFiles(phasesDir);
    if (continueFiles.length > 0) {
      parts.push(`\nPaused work found: ${continueFiles.join(', ')}`);
      parts.push('Run /pbr:resume to pick up where you left off.');
    }
  }

  // Check for config and validate
  const config = configLoad(planningDir);
  if (config) {
    parts.push(`\nConfig: depth=${config.depth || 'standard'}, mode=${config.mode || 'interactive'}`);

    // Validate config against schema (reuse already-loaded config)
    const schemaPath = path.join(__dirname, 'config-schema.json');
    if (fs.existsSync(schemaPath)) {
      const { configValidate } = require('./pbr-tools');
      const validation = configValidate(config);
      if (validation.warnings.length > 0) {
        parts.push(`\nConfig warnings: ${validation.warnings.join('; ')}`);
      }
      if (validation.errors.length > 0) {
        parts.push(`\nConfig errors: ${validation.errors.join('; ')}`);
      }
    }
  }

  // Check for quick notes
  const projectNotesDir = path.join(planningDir, 'notes');
  const globalNotesDir = path.join(os.homedir(), '.claude', 'notes');
  const projectNoteCount = countNotes(projectNotesDir);
  const globalNoteCount = countNotes(globalNotesDir);
  if (projectNoteCount > 0 || globalNoteCount > 0) {
    const noteParts = [];
    if (projectNoteCount > 0) noteParts.push(`${projectNoteCount} project`);
    if (globalNoteCount > 0) noteParts.push(`${globalNoteCount} global`);
    parts.push(`\nNotes: ${noteParts.join(', ')}. \`/pbr:note list\` to review.`);
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

  // Check for stale .active-skill (multi-session conflict detection)
  const activeSkillFile = path.join(planningDir, '.active-skill');
  if (fs.existsSync(activeSkillFile)) {
    try {
      const stats = fs.statSync(activeSkillFile);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageMinutes = Math.floor(ageMs / 60000);
      if (ageMinutes > 60) {
        const skill = fs.readFileSync(activeSkillFile, 'utf8').trim();
        // Auto-cleanup stale .active-skill lock (> 60 minutes = certainly stale)
        try {
          fs.unlinkSync(activeSkillFile);
          parts.push(`\nAuto-cleaned: Stale .active-skill lock removed (skill: "${skill}", age: ${ageMinutes} minutes). Was likely from a crashed or abandoned session.`);
          logHook('progress-tracker', 'SessionStart', 'stale-active-skill-cleaned', { ageMinutes, skill });
        } catch (_cleanupErr) {
          parts.push(`\nWarning: .active-skill is ${ageMinutes} minutes old (skill: "${skill}"). Could not auto-remove — delete .planning/.active-skill manually.`);
          logHook('progress-tracker', 'SessionStart', 'stale-active-skill', { ageMinutes, skill });
        }
      }
    } catch (_e) {
      // Ignore errors
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

  // Hook health summary from recent log entries
  const hookHealth = getHookHealthSummary(planningDir);
  if (hookHealth) {
    parts.push(`\n${hookHealth}`);
  }

  parts.push('\nAvailable commands: /pbr:status, /pbr:plan, /pbr:build, /pbr:review, /pbr:help');

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

function countNotes(notesDir) {
  try {
    if (!fs.existsSync(notesDir)) return 0;
    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
    let count = 0;
    for (const file of files) {
      const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
      if (!content.includes('promoted: true')) count++;
    }
    return count;
  } catch (_e) {
    return 0;
  }
}

const FAILURE_DECISIONS = /^(block|error|warn|warning|block-coauthor|block-sensitive|unlink-failed)$/;
const HOOK_HEALTH_MAX_ENTRIES = 50;

function getHookHealthSummary(planningDir) {
  const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
  try {
    if (!fs.existsSync(logPath)) return null;
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return null;

    const lines = content.split('\n');
    // Take only the last N entries
    const recent = lines.slice(-HOOK_HEALTH_MAX_ENTRIES);

    const failuresByHook = {};
    let totalFailures = 0;

    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        if (entry.decision && FAILURE_DECISIONS.test(entry.decision)) {
          const hookName = entry.hook || 'unknown';
          failuresByHook[hookName] = (failuresByHook[hookName] || 0) + 1;
          totalFailures++;
        }
      } catch (_e) {
        // Skip malformed lines
      }
    }

    if (totalFailures === 0) return null;

    // Sort hooks by failure count descending
    const sorted = Object.entries(failuresByHook)
      .sort((a, b) => b[1] - a[1])
      .map(([hook, count]) => `${hook}: ${count}`)
      .join(', ');

    return `Hook health: ${totalFailures} failure${totalFailures !== 1 ? 's' : ''} in last ${recent.length} entries (${sorted})`;
  } catch (_e) {
    return null;
  }
}

/**
 * Attempt to launch the dashboard in a detached background process.
 * Checks if the port is already in use before spawning.
 */
function tryLaunchDashboard(port, _planningDir, projectDir) {
  const net = require('net');
  const { spawn } = require('child_process');

  // Quick port probe — if something is already listening, skip launch
  const probe = net.createConnection({ port, host: '127.0.0.1' });
  probe.on('connect', () => {
    probe.destroy();
    logHook('progress-tracker', 'SessionStart', 'dashboard-already-running', { port });
  });
  probe.on('error', () => {
    // Port is free — launch dashboard
    const cliPath = path.join(__dirname, '..', 'dashboard', 'bin', 'cli.js');
    if (!fs.existsSync(cliPath)) {
      logHook('progress-tracker', 'SessionStart', 'dashboard-cli-missing', { cliPath });
      return;
    }

    try {
      const child = spawn(process.execPath, [cliPath, '--dir', projectDir, '--port', String(port)], {
        detached: true,
        stdio: 'ignore',
        cwd: projectDir
      });
      child.unref();
      logHook('progress-tracker', 'SessionStart', 'dashboard-launched', { port, pid: child.pid });
    } catch (e) {
      logHook('progress-tracker', 'SessionStart', 'dashboard-launch-error', { error: e.message });
    }
  });

  // Don't let the probe keep the process alive
  probe.unref();
}

// Exported for testing
module.exports = { getHookHealthSummary, FAILURE_DECISIONS, HOOK_HEALTH_MAX_ENTRIES, tryLaunchDashboard };

main();

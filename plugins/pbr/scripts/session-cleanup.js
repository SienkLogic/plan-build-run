#!/usr/bin/env node

/**
 * SessionEnd cleanup hook.
 *
 * Removes stale planning artifacts that shouldn't persist across sessions:
 *   - .planning/.active-operation (stale operation lock)
 *   - .planning/.active-skill (stale skill tracking)
 *
 * Additional cleanup:
 *   - Removes stale .checkpoint-manifest.json files (>24h old)
 *   - Rotates hooks.jsonl when >200KB (moves to hooks.jsonl.1)
 *   - Warns about orphaned .PROGRESS-* files (executor crash artifacts)
 *   - Writes session summary to logs/sessions.jsonl
 *
 * Logs session end with reason to hook-log.
 * Non-blocking — best-effort cleanup, fails silently.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { tailLines } = require('./pbr-tools');
const { readSessionMetrics, summarizeMetrics } = require('./local-llm/metrics');

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

function tryRemove(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (_e) {
    // best-effort — don't fail the hook
  }
  return false;
}

const STALE_CHECKPOINT_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_HOOKS_LOG_BYTES = 200 * 1024; // 200KB

function cleanStaleCheckpoints(planningDir) {
  const removed = [];
  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return removed;

    const dirs = fs.readdirSync(phasesDir);
    for (const dir of dirs) {
      const manifestPath = path.join(phasesDir, dir, '.checkpoint-manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const stat = fs.statSync(manifestPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > STALE_CHECKPOINT_MS) {
        fs.unlinkSync(manifestPath);
        removed.push(path.join('phases', dir, '.checkpoint-manifest.json'));
      }
    }
  } catch (_e) {
    // best-effort
  }
  return removed;
}

function rotateHooksLog(planningDir) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    const hooksLog = path.join(logsDir, 'hooks.jsonl');
    if (!fs.existsSync(hooksLog)) return false;

    const stat = fs.statSync(hooksLog);
    if (stat.size <= MAX_HOOKS_LOG_BYTES) return false;

    const rotatedPath = hooksLog + '.1';
    // Overwrite any existing .1 file
    fs.renameSync(hooksLog, rotatedPath);
    return true;
  } catch (_e) {
    return false;
  }
}

function findOrphanedProgressFiles(planningDir) {
  const orphans = [];
  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return orphans;

    const dirs = fs.readdirSync(phasesDir);
    for (const dir of dirs) {
      const phaseDir = path.join(phasesDir, dir);
      const files = fs.readdirSync(phaseDir);
      for (const file of files) {
        if (file.startsWith('.PROGRESS-')) {
          orphans.push(path.join('phases', dir, file));
        }
      }
    }
  } catch (_e) {
    // best-effort
  }
  return orphans;
}

const MAX_SESSION_ENTRIES = 100;

function writeSessionHistory(planningDir, data) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const sessionsFile = path.join(logsDir, 'sessions.jsonl');

    // Mine existing logs for session stats
    const hooksLog = path.join(logsDir, 'hooks.jsonl');
    const eventsLog = path.join(logsDir, 'events.jsonl');

    let agentsSpawned = 0;
    let commitsCreated = 0;
    const commandsRun = [];
    let sessionStart = null;

    // Count agents from hooks log (SubagentStart entries)
    // Hooks log is capped at 200 entries; read last 200 to cover the full session
    const hookLines = tailLines(hooksLog, 200);
    for (const line of hookLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.event === 'SubagentStart' && entry.decision === 'spawned') {
          agentsSpawned++;
        }
        // Track earliest timestamp as session start
        if (entry.ts && (!sessionStart || entry.ts < sessionStart)) {
          sessionStart = entry.ts;
        }
      } catch (_e) { /* skip malformed lines */ }
    }

    // Count commits and commands from events log
    // Read last 200 entries — sufficient for a single session's events
    const eventLines = tailLines(eventsLog, 200);
    for (const line of eventLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.event === 'commit-validated' && entry.status === 'allow') {
          commitsCreated++;
        }
        if (entry.cat === 'workflow' && entry.event) {
          if (!commandsRun.includes(entry.event)) {
            commandsRun.push(entry.event);
          }
        }
        if (entry.ts && (!sessionStart || entry.ts < sessionStart)) {
          sessionStart = entry.ts;
        }
      } catch (_e) { /* skip malformed lines */ }
    }

    const sessionEnd = new Date().toISOString();
    let durationMinutes = null;
    if (sessionStart) {
      durationMinutes = Math.round((new Date(sessionEnd) - new Date(sessionStart)) / 60000);
    }

    const summary = {
      start: sessionStart || sessionEnd,
      end: sessionEnd,
      duration_minutes: durationMinutes,
      reason: data.reason || null,
      agents_spawned: agentsSpawned,
      commits_created: commitsCreated,
      commands_run: commandsRun
    };

    // Append to sessions.jsonl, cap at MAX_SESSION_ENTRIES
    let lines = [];
    if (fs.existsSync(sessionsFile)) {
      const content = fs.readFileSync(sessionsFile, 'utf8').trim();
      if (content) {
        lines = content.split('\n');
      }
    }
    lines.push(JSON.stringify(summary));
    if (lines.length > MAX_SESSION_ENTRIES) {
      lines = lines.slice(lines.length - MAX_SESSION_ENTRIES);
    }
    fs.writeFileSync(sessionsFile, lines.join('\n') + '\n', 'utf8');
  } catch (_e) {
    // Best-effort — don't fail the hook
  }
}

function main() {
  const data = readStdin();
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  const cleaned = [];

  // NOTE: .auto-next is intentionally NOT cleaned here — it is a one-shot
  // signal consumed by auto-continue.js (Stop hook). SessionEnd cleanup
  // races with the Stop hook and would delete the signal before it is read.
  if (tryRemove(path.join(planningDir, '.active-operation'))) {
    cleaned.push('.active-operation');
  }
  if (tryRemove(path.join(planningDir, '.active-skill'))) {
    cleaned.push('.active-skill');
  }
  if (tryRemove(path.join(planningDir, '.active-plan'))) {
    cleaned.push('.active-plan');
  }

  // Clean stale checkpoint manifests (>24h old)
  const staleCheckpoints = cleanStaleCheckpoints(planningDir);
  cleaned.push(...staleCheckpoints);

  // Rotate hooks.jsonl if >200KB
  const rotated = rotateHooksLog(planningDir);

  // Detect orphaned .PROGRESS-* files (executor crash artifacts)
  const orphans = findOrphanedProgressFiles(planningDir);

  // Write session history log
  writeSessionHistory(planningDir, data);

  // Local LLM metrics summary (SessionEnd — sync reads only, never throws)
  try {
    const sessionStartFile = path.join(planningDir, '.session-start');
    if (fs.existsSync(sessionStartFile)) {
      const sessionStartTime = fs.readFileSync(sessionStartFile, 'utf8').trim();
      const entries = readSessionMetrics(planningDir, sessionStartTime);
      if (entries.length > 0) {
        const summary = summarizeMetrics(entries);
        logHook('session-cleanup', 'SessionEnd', 'llm-metrics', {
          total_calls: summary.total_calls,
          fallback_count: summary.fallback_count,
          avg_latency_ms: summary.avg_latency_ms,
          tokens_saved: summary.tokens_saved,
          cost_saved_usd: summary.cost_saved_usd
        });
      }
      // Clean up session-start file
      try { fs.unlinkSync(sessionStartFile); } catch (_e) { /* non-fatal */ }
    }
  } catch (_e) { /* metrics never crash the hook */ }

  const decision = cleaned.length > 0 ? 'cleaned' : 'nothing';
  logHook('session-cleanup', 'SessionEnd', decision, {
    reason: data.reason || null,
    removed: cleaned,
    log_rotated: rotated,
    orphaned_progress_files: orphans.length > 0 ? orphans : undefined
  });

  process.exit(0);
}

module.exports = { writeSessionHistory, tryRemove, cleanStaleCheckpoints, rotateHooksLog, findOrphanedProgressFiles };
if (require.main === module || process.argv[1] === __filename) { main(); }

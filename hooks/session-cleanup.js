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
const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
const { tailLines } = require('../plan-build-run/bin/lib/core.cjs');
const { removeSessionDir, releaseSessionClaims } = require('../plan-build-run/bin/lib/core.cjs');
const { readSessionMetrics, summarizeMetrics, formatSessionSummary } = require('../plan-build-run/bin/lib/local-llm/metrics.cjs');

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

/**
 * Extract session learnings by scanning hook/event logs for notable patterns.
 * Writes a brief session summary to .planning/logs/session-learnings.jsonl
 * when interesting patterns are found.
 *
 * Tracked patterns:
 * - Gates triggered (workflow blocks that caught mistakes)
 * - Agent failures (subagent output missing)
 * - Context pressure events (compaction, cycling)
 * - Phases completed in this session
 * - Frequently blocked patterns (repeated mistakes)
 */
function extractSessionLearnings(planningDir, _sessionId) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    const hooksLog = path.join(logsDir, 'hooks.jsonl');
    const eventsLog = path.join(logsDir, 'events.jsonl');

    const hookLines = tailLines(hooksLog, 200);
    const eventLines = tailLines(eventsLog, 200);

    const learnings = {
      timestamp: new Date().toISOString(),
      gates_triggered: [],
      agent_failures: [],
      context_events: [],
      phases_completed: 0,
      repeated_blocks: {}
    };

    // Scan hooks for blocks (gates that caught issues)
    for (const line of hookLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.decision === 'block' || entry.decision === 'blocked') {
          const key = `${entry.hook || 'unknown'}:${entry.event || ''}`;
          learnings.repeated_blocks[key] = (learnings.repeated_blocks[key] || 0) + 1;
          if (learnings.gates_triggered.length < 10) {
            learnings.gates_triggered.push({
              hook: entry.hook,
              event: entry.event,
              reason: (entry.reason || entry.warning || '').substring(0, 100)
            });
          }
        }
        // Agent failures
        if (entry.decision === 'warning' && entry.hook === 'check-subagent-output') {
          learnings.agent_failures.push({
            agent: entry.agent_type || 'unknown',
            expected: entry.expected || ''
          });
        }
      } catch (_e) { /* skip */ }
    }

    // Scan events for context pressure and phase completions
    for (const line of eventLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.event === 'compaction') {
          learnings.context_events.push('compaction');
        }
        if (entry.event === 'phase-complete' || entry.event === 'phase-verified') {
          learnings.phases_completed++;
        }
      } catch (_e) { /* skip */ }
    }

    // Only write if there's something interesting
    const hasLearnings = learnings.gates_triggered.length > 0
      || learnings.agent_failures.length > 0
      || learnings.context_events.length > 0
      || learnings.phases_completed > 0;

    if (!hasLearnings) return;

    // Find most-repeated block pattern
    const topBlock = Object.entries(learnings.repeated_blocks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    learnings.top_repeated_blocks = topBlock.map(([k, v]) => ({ pattern: k, count: v }));
    delete learnings.repeated_blocks;

    // Append to learnings log
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const learningsFile = path.join(logsDir, 'session-learnings.jsonl');
    fs.appendFileSync(learningsFile, JSON.stringify(learnings) + '\n', 'utf8');

    logHook('session-cleanup', 'SessionEnd', 'learnings-extracted', {
      gates: learnings.gates_triggered.length,
      failures: learnings.agent_failures.length,
      phases: learnings.phases_completed
    });
  } catch (_e) {
    // Never fail the hook on learnings extraction
  }
}

function main() {
  const data = readStdin();
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  const sessionId = data.session_id || null;
  const cleaned = [];

  // NOTE: .auto-next is intentionally NOT cleaned here — it is a one-shot
  // signal consumed by auto-continue.js (Stop hook). SessionEnd cleanup
  // races with the Stop hook and would delete the signal before it is read.

  // Session-scoped cleanup: remove the entire session directory if session_id is available
  if (sessionId) {
    try {
      removeSessionDir(planningDir, sessionId);
      cleaned.push(`.sessions/${sessionId}`);
    } catch (_e) { /* best-effort */ }

    // Release any phase claims held by this session
    try {
      const releasedClaims = releaseSessionClaims(planningDir, sessionId);
      if (releasedClaims.released.length > 0) {
        logHook('session-cleanup', 'SessionEnd', 'claims-released', {
          count: releasedClaims.released.length,
          claims: releasedClaims.released.join(', ')
        });
        cleaned.push(...releasedClaims.released.map(p => `phases/${p}/.claim`));
      }
    } catch (_e) { /* best-effort */ }
  }

  // Primary: remove .session.json (consolidated session state)
  if (tryRemove(path.join(planningDir, '.session.json'))) {
    cleaned.push('.session.json');
  }
  // Legacy fallback: also clean individual signal files during transition period
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

  // Extract session learnings from hook logs
  extractSessionLearnings(planningDir, sessionId);

  // Local LLM metrics summary (SessionEnd — sync reads only, never throws)
  let llmAdditionalContext = null;
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
        if (summary.total_calls > 0) {
          let modelName = null;
          try {
            const rawConfig = configLoad(planningDir) || {};
            modelName = (rawConfig.local_llm && rawConfig.local_llm.model) || null;
          } catch (_e) { /* config read failure is non-fatal */ }
          llmAdditionalContext = formatSessionSummary(summary, modelName);
        }
      }
      // Clean up session-start file
      try { fs.unlinkSync(sessionStartFile); } catch (_e) { /* non-fatal */ }
    }
  } catch (_e) { /* metrics never crash the hook */ }

  // Surface compliance violations from this session
  let complianceContext = null;
  try {
    const complianceFile = path.join(planningDir, 'logs', 'compliance.jsonl');
    if (fs.existsSync(complianceFile)) {
      const complianceLines = fs.readFileSync(complianceFile, 'utf8').trim().split('\n').filter(Boolean);
      if (complianceLines.length > 0) {
        const violations = complianceLines.map(l => { try { return JSON.parse(l); } catch (_e) { return null; } }).filter(Boolean);
        const required = violations.filter(v => v.severity === 'required');
        if (required.length > 0) {
          complianceContext = `\n\n⚠ COMPLIANCE: ${required.length} required artifact(s) missing this session:\n` +
            required.map(v => `  - ${v.agent}: ${v.violation}`).join('\n') +
            '\nThese artifacts should be created before the milestone is complete.';
        }
        // Clear compliance log after surfacing (fresh for next session)
        fs.unlinkSync(complianceFile);
        cleaned.push('logs/compliance.jsonl');
      }
    }
  } catch (_e) {
    // Best-effort
  }

  const decision = cleaned.length > 0 ? 'cleaned' : 'nothing';
  logHook('session-cleanup', 'SessionEnd', decision, {
    reason: data.reason || null,
    removed: cleaned,
    log_rotated: rotated,
    orphaned_progress_files: orphans.length > 0 ? orphans : undefined
  });

  const combinedContext = [llmAdditionalContext, complianceContext].filter(Boolean).join('\n');
  if (combinedContext) {
    process.stdout.write(JSON.stringify({ additionalContext: combinedContext }) + '\n');
  }

  process.exit(0);
}

/**
 * handleHttp — hook-server.js interface.
 * reqBody = { event, tool, data, planningDir, cache }
 * Returns null. Never calls process.exit().
 */
function handleHttp(reqBody) {
  const data = (reqBody && reqBody.data) || {};
  const planningDir = reqBody && reqBody.planningDir;
  if (!planningDir || !fs.existsSync(planningDir)) return null;

  const cleaned = [];
  if (tryRemove(path.join(planningDir, '.session.json'))) cleaned.push('.session.json');
  if (tryRemove(path.join(planningDir, '.active-operation'))) cleaned.push('.active-operation');
  if (tryRemove(path.join(planningDir, '.active-skill'))) cleaned.push('.active-skill');
  if (tryRemove(path.join(planningDir, '.active-plan'))) cleaned.push('.active-plan');

  const staleCheckpoints = cleanStaleCheckpoints(planningDir);
  cleaned.push(...staleCheckpoints);

  const rotated = rotateHooksLog(planningDir);
  const orphans = findOrphanedProgressFiles(planningDir);

  writeSessionHistory(planningDir, data);

  const decision = cleaned.length > 0 ? 'cleaned' : 'nothing';
  logHook('session-cleanup', 'SessionEnd', decision, {
    reason: data.reason || null,
    removed: cleaned,
    log_rotated: rotated,
    orphaned_progress_files: orphans.length > 0 ? orphans : undefined
  });

  return null;
}

module.exports = { writeSessionHistory, tryRemove, cleanStaleCheckpoints, rotateHooksLog, findOrphanedProgressFiles, extractSessionLearnings, handleHttp };
if (require.main === module || process.argv[1] === __filename) { main(); }

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
const { execSync } = require('child_process');
const { logHook, getLogFilename: getHooksFilename, cleanOldHookLogs } = require('./hook-logger');
const { getLogFilename: getEventsFilename, cleanOldEventLogs } = require('./event-logger');
const { tailLines, configLoad } = require('./pbr-tools');
const { removeSessionDir, releaseSessionClaims } = require('./lib/core');
const { readSessionMetrics, summarizeMetrics, formatSessionSummary } = require('./lib/local-llm/metrics');
const { writeSnapshot } = require('./lib/snapshot-manager');
const { readQueue, clearQueue } = require('./intel-queue');

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

/** @deprecated Daily dated log files no longer need size-based rotation. */
function rotateHooksLog(_planningDir) {
  return false;
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

/**
 * formatSessionMetrics — Format session stats into a human-readable report.
 * @param {Object} stats - Session statistics
 * @returns {string} Formatted multi-line string
 */
function formatSessionMetrics(stats) {
  const duration = stats.duration_min || 0;
  const agents = stats.agents_spawned || 0;
  const commits = stats.commits_created || 0;
  const plansExec = stats.plans_executed || 0;
  const plansVerified = stats.plans_verified || 0;
  const feedback = stats.feedback_loops || 0;
  const compliance = Math.round((plansVerified / Math.max(plansExec, 1)) * 100);

  return [
    'Session Metrics:',
    `  Duration:    ${duration}m`,
    `  Agents:      ${agents}`,
    `  Commits:     ${commits}`,
    `  Plans:       ${plansExec} executed, ${plansVerified} verified`,
    `  Compliance:  ${compliance}%`,
    `  Feedback:    ${feedback} loops triggered`
  ].join('\n');
}

const MAX_SESSION_ENTRIES = 100;
const MAX_SESSION_METRIC_FILES = 50;

/**
 * Write a per-session metrics JSON file to logs/sessions/ directory.
 * Each session gets its own file for easy browsing and archival.
 * Directory is capped at MAX_SESSION_METRIC_FILES (oldest deleted first).
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} sessionData - Session summary object from writeSessionHistory
 */
function writeSessionMetricsFile(planningDir, sessionData) {
  try {
    const sessionsDir = path.join(planningDir, 'logs', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Generate Windows-safe filename from timestamp (replace colons with dashes)
    const ts = (sessionData.end || new Date().toISOString()).replace(/:/g, '-');
    const filename = `${ts}-metrics.json`;

    const metricsData = {
      session_id: sessionData.session_id || null,
      start: sessionData.start || null,
      end: sessionData.end || null,
      duration_minutes: sessionData.duration_minutes || null,
      agents_spawned: sessionData.agents_spawned || 0,
      commits_created: sessionData.commits_created || 0,
      commands_run: sessionData.commands_run || [],
      plans_executed: sessionData.plans_executed || 0,
      plans_verified: sessionData.plans_verified || 0,
      compliance_pct: sessionData.compliance_pct || 0,
      feedback_loops_triggered: sessionData.feedback_loops_triggered || 0
    };

    fs.writeFileSync(
      path.join(sessionsDir, filename),
      JSON.stringify(metricsData, null, 2) + '\n',
      'utf8'
    );

    // Cap directory to MAX_SESSION_METRIC_FILES (delete oldest by name sort)
    const files = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('-metrics.json'))
      .sort();
    if (files.length > MAX_SESSION_METRIC_FILES) {
      const toRemove = files.slice(0, files.length - MAX_SESSION_METRIC_FILES);
      for (const f of toRemove) {
        try { fs.unlinkSync(path.join(sessionsDir, f)); } catch (_e) { /* best-effort */ }
      }
    }
  } catch (_e) {
    // Best-effort — don't fail the hook
  }
}

function writeSessionHistory(planningDir, data) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const sessionsFile = path.join(logsDir, 'sessions.jsonl');

    // Mine existing logs for session stats (today's dated log files)
    const hooksLog = path.join(logsDir, getHooksFilename());
    const eventsLog = path.join(logsDir, getEventsFilename());

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

    // Count commits, commands, and feedback loops from events log
    // Read last 200 entries — sufficient for a single session's events
    let feedbackLoopsTriggered = 0;
    const eventLines = tailLines(eventsLog, 200);
    for (const line of eventLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.event === 'commit-validated' && entry.status === 'allow') {
          commitsCreated++;
        }
        if (entry.event === 'feedback-injected') {
          feedbackLoopsTriggered++;
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

    // Count plans executed (SUMMARY-*.md files in phase dirs) and verified (VERIFICATION-*.md)
    let plansExecuted = 0;
    let plansVerified = 0;
    try {
      const phasesDir = path.join(planningDir, 'phases');
      if (fs.existsSync(phasesDir)) {
        const pDirs = fs.readdirSync(phasesDir);
        for (const pd of pDirs) {
          const pdPath = path.join(phasesDir, pd);
          try {
            const files = fs.readdirSync(pdPath);
            for (const f of files) {
              if (/^SUMMARY-.*\.md$/i.test(f)) plansExecuted++;
              if (/^VERIFICATION-.*\.md$/i.test(f)) plansVerified++;
            }
          } catch (_e) { /* skip unreadable dirs */ }
        }
      }
    } catch (_e) { /* best-effort */ }

    const sessionEnd = new Date().toISOString();
    let durationMinutes = null;
    if (sessionStart) {
      durationMinutes = Math.round((new Date(sessionEnd) - new Date(sessionStart)) / 60000);
    }

    const compliancePct = Math.round((plansVerified / Math.max(plansExecuted, 1)) * 100);

    const summary = {
      start: sessionStart || sessionEnd,
      end: sessionEnd,
      duration_minutes: durationMinutes,
      reason: data.reason || null,
      agents_spawned: agentsSpawned,
      commits_created: commitsCreated,
      commands_run: commandsRun,
      plans_executed: plansExecuted,
      compliance_pct: compliancePct,
      feedback_loops_triggered: feedbackLoopsTriggered
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

    // Write per-session metrics JSON file
    writeSessionMetricsFile(planningDir, summary);
  } catch (_e) {
    // Best-effort — don't fail the hook
  }
}

/**
 * Gather session context for mental model snapshot.
 * Reads recent git changes, STATE.md sections, and recent commits.
 * All operations are best-effort — returns partial data on failure.
 *
 * @param {string} cwd - Project working directory
 * @param {string} planningDir - Path to .planning directory
 * @param {string|null} sessionId - Session ID
 * @returns {object} Context object for writeSnapshot
 */
function gatherSessionContext(cwd, planningDir, sessionId) {
  const context = {
    session_id: sessionId || 'unknown',
    files_working_on: [],
    pending_decisions: [],
    current_approach: '',
    open_questions: [],
    recent_commits: []
  };

  // Gather recent git changes
  try {
    const diff = execSync('git diff --name-only HEAD~5 HEAD 2>/dev/null || echo ""', {
      cwd, encoding: 'utf8', timeout: 5000
    });
    context.files_working_on = diff.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (_e) { /* best-effort */ }

  // Gather recent commits
  try {
    const log = execSync('git log --oneline -5 2>/dev/null || echo ""', {
      cwd, encoding: 'utf8', timeout: 5000
    });
    context.recent_commits = log.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (_e) { /* best-effort */ }

  // Read STATE.md for approach, decisions, and open questions
  const stateFile = path.join(planningDir, 'STATE.md');
  try {
    if (fs.existsSync(stateFile)) {
      const stateContent = fs.readFileSync(stateFile, 'utf8');

      // Extract Current Position section
      const posMatch = stateContent.match(/## Current Position\s*\n([\s\S]*?)(?=\n##\s|$)/);
      if (posMatch) {
        context.current_approach = posMatch[1].trim().split('\n').slice(0, 5).join('\n');
      }

      // Extract Decisions section
      const decMatch = stateContent.match(/### Decisions\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/);
      if (decMatch) {
        context.pending_decisions = decMatch[1].trim().split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.slice(2).trim());
      }

      // Extract Blockers/Concerns section
      const blockMatch = stateContent.match(/### Blockers\/Concerns\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/);
      if (blockMatch) {
        context.open_questions = blockMatch[1].trim().split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.slice(2).trim());
      }
    }
  } catch (_e) { /* best-effort */ }

  return context;
}

function main() {
  // Safety timeout: prevent hang if stdin never closes or cleanup stalls
  const safetyTimeout = setTimeout(() => { process.exit(0); }, 3000);

  // Log invocation evidence before any I/O
  logHook('session-cleanup', 'SessionEnd', 'hook-invoked', { pid: process.pid });

  const data = readStdin();
  clearTimeout(safetyTimeout);

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

  // Clean up stale workflow._auto_chain_active config flag.
  // If the Stop hook didn't consume it (e.g., auto_continue disabled), clear it.
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (rawConfig.workflow && rawConfig.workflow._auto_chain_active) {
        delete rawConfig.workflow._auto_chain_active;
        fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2), 'utf8');
        cleaned.push('workflow._auto_chain_active');
      }
    }
  } catch (_e) {
    // best-effort — don't fail the hook
  }

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
        logHook('session-cleanup', 'SessionEnd', 'claims-released', { released: releasedClaims.released });
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
  if (tryRemove(path.join(planningDir, '.context-tracker'))) {
    cleaned.push('.context-tracker');
  }

  // Clean stale checkpoint manifests (>24h old)
  const staleCheckpoints = cleanStaleCheckpoints(planningDir);
  cleaned.push(...staleCheckpoints);

  // Rotate hooks.jsonl if >200KB (no-op now that we use daily dated files)
  const rotated = rotateHooksLog(planningDir);

  // Clean up daily log files older than 30 days
  const logsDir = path.join(planningDir, 'logs');
  if (fs.existsSync(logsDir)) {
    cleanOldHookLogs(logsDir);
    cleanOldEventLogs(logsDir);
  }

  // Detect orphaned .PROGRESS-* files (executor crash artifacts)
  const orphans = findOrphanedProgressFiles(planningDir);

  // Drain intel queue — preserve as signal file for next session's briefing
  try {
    const intelQueue = readQueue(planningDir);
    if (intelQueue.length > 0) {
      // Write signal file so next SessionStart can advise user to refresh intel
      const signalPath = path.join(planningDir, '.intel-refresh-needed');
      fs.writeFileSync(signalPath, JSON.stringify({
        files: intelQueue,
        timestamp: new Date().toISOString(),
        session: data && data.session_id ? data.session_id : undefined
      }, null, 2));
      logHook('session-cleanup', 'SessionEnd', 'intel-refresh-signaled', {
        queued_files: intelQueue.length,
        files: intelQueue.slice(0, 10) // Log first 10 for brevity
      });
      clearQueue(planningDir);
      cleaned.push('.intel-queue.json');
    }
  } catch (_e) { /* best-effort */ }

  // Write session history log
  writeSessionHistory(planningDir, data);

  // Session productivity metrics display (controlled by features.session_metrics)
  let metricsContext = null;
  try {
    const rawConfig = configLoad(planningDir) || {};
    if (rawConfig.features && rawConfig.features.session_metrics !== false) {
      // Build stats from the same data writeSessionHistory computed
      // Re-read the last session entry to get the computed values
      const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
      if (fs.existsSync(sessionsFile)) {
        const lastLine = fs.readFileSync(sessionsFile, 'utf8').trim().split('\n').pop();
        if (lastLine) {
          const lastEntry = JSON.parse(lastLine);
          metricsContext = formatSessionMetrics({
            duration_min: lastEntry.duration_minutes || 0,
            agents_spawned: lastEntry.agents_spawned || 0,
            commits_created: lastEntry.commits_created || 0,
            plans_executed: lastEntry.plans_executed || 0,
            plans_verified: Math.round((lastEntry.compliance_pct || 0) * Math.max(lastEntry.plans_executed || 0, 1) / 100),
            feedback_loops: lastEntry.feedback_loops_triggered || 0,
            commands_run: (lastEntry.commands_run || []).length
          });
        }
      }
    }
  } catch (_e) { /* metrics display is best-effort */ }

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
      const lines = fs.readFileSync(complianceFile, 'utf8').trim().split('\n').filter(Boolean);
      if (lines.length > 0) {
        const violations = lines.map(l => { try { return JSON.parse(l); } catch (_e) { return null; } }).filter(Boolean);
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

  // Write mental model snapshot (gated by config toggle)
  try {
    const config = configLoad(planningDir) || {};
    const snapshotsEnabled = config.features && config.features.mental_model_snapshots !== false;
    if (snapshotsEnabled) {
      const snapContext = gatherSessionContext(cwd, planningDir, sessionId);
      writeSnapshot(planningDir, snapContext);
      logHook('session-cleanup', 'SessionEnd', 'snapshot-written', {
        files_count: snapContext.files_working_on.length
      });
    }
  } catch (_e) {
    // Snapshot failure must never crash SessionEnd
  }

  const combinedContext = [metricsContext, llmAdditionalContext, complianceContext].filter(Boolean).join('\n');
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
  logHook('session-cleanup', 'SessionEnd', 'hook-invoked', { pid: process.pid, mode: 'http' });

  const data = (reqBody && reqBody.data) || {};
  const planningDir = reqBody && reqBody.planningDir;
  if (!planningDir || !fs.existsSync(planningDir)) return null;

  const cleaned = [];
  if (tryRemove(path.join(planningDir, '.session.json'))) cleaned.push('.session.json');
  if (tryRemove(path.join(planningDir, '.active-operation'))) cleaned.push('.active-operation');
  if (tryRemove(path.join(planningDir, '.active-skill'))) cleaned.push('.active-skill');
  if (tryRemove(path.join(planningDir, '.active-plan'))) cleaned.push('.active-plan');
  if (tryRemove(path.join(planningDir, '.context-tracker'))) cleaned.push('.context-tracker');

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

/**
 * Extract learnings from a session's hook logs and event logs.
 * Writes to planningDir/logs/session-learnings.jsonl only if interesting events found.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {string} sessionId - Session identifier
 */
function extractSessionLearnings(planningDir, sessionId) {
  const logsDir = path.join(planningDir, 'logs');
  // Use today's dated log files (built from planningDir, not from resolved project root).
  const hooksLog = path.join(logsDir, getHooksFilename());
  const eventsLog = path.join(logsDir, getEventsFilename());

  const gatesTriggered = [];
  const agentFailures = [];
  let phasesCompleted = 0;
  const contextEvents = [];

  // Parse hooks.jsonl for blocks and warnings
  if (fs.existsSync(hooksLog)) {
    const lines = fs.readFileSync(hooksLog, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.decision === 'block') {
          gatesTriggered.push({ hook: entry.hook, reason: entry.reason });
        }
        if (entry.decision === 'warning' && entry.hook === 'check-subagent-output' && entry.agent_type) {
          agentFailures.push({ agent_type: entry.agent_type, expected: entry.expected });
        }
      } catch (_e) { /* skip malformed */ }
    }
  }

  // Parse events.jsonl for phase completions and compactions
  if (fs.existsSync(eventsLog)) {
    const lines = fs.readFileSync(eventsLog, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.cat === 'workflow' && entry.event === 'phase-complete') {
          phasesCompleted++;
        }
        if (entry.cat === 'system' && entry.event === 'compaction') {
          contextEvents.push('compaction');
        }
      } catch (_e) { /* skip malformed */ }
    }
  }

  const hasInteresting = gatesTriggered.length > 0 || agentFailures.length > 0 || phasesCompleted > 0 || contextEvents.length > 0;
  if (!hasInteresting) return;

  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const learningsFile = path.join(logsDir, 'session-learnings.jsonl');
  const entry = JSON.stringify({
    session_id: sessionId,
    ts: new Date().toISOString(),
    gates_triggered: gatesTriggered,
    agent_failures: agentFailures,
    phases_completed: phasesCompleted,
    context_events: contextEvents
  });
  fs.appendFileSync(learningsFile, entry + '\n');
}

module.exports = { writeSessionHistory, writeSessionMetricsFile, tryRemove, cleanStaleCheckpoints, rotateHooksLog, findOrphanedProgressFiles, gatherSessionContext, handleHttp, formatSessionMetrics, extractSessionLearnings };
if (require.main === module || process.argv[1] === __filename) { main(); }

'use strict';

/**
 * Session Quality & UX Check Module
 *
 * Implements SQ-01 through SQ-03 session quality dimensions for the PBR audit system.
 * Each check returns a structured result: { dimension, status, message, evidence }.
 *
 * Checks:
 *   SQ-01: Session start quality (progress-tracker briefing injection)
 *   SQ-02: Briefing freshness (STATE.md staleness and size)
 *   SQ-03: Session duration/cost analysis (duration and tool call volume)
 *
 * Shared helpers:
 *   readJsonlFiles(logsDir, prefix) — reads all {prefix}-*.jsonl files
 *   readHookLogs(logsDir) — reads hook logs
 *   readEventLogs(logsDir) — reads event logs
 *   getLogsDir(planningDir) — resolves logs directory path
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "SQ-01")
 * @param {'pass'|'warn'|'fail'|'info'} status
 * @param {string} message
 * @param {string[]} [evidence]
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function result(dimCode, status, message, evidence) {
  return {
    dimension: dimCode,
    status,
    message,
    evidence: evidence || [],
  };
}

// ---------------------------------------------------------------------------
// Shared JSONL helpers
// ---------------------------------------------------------------------------

/**
 * Return the logs directory path for a planning directory.
 * @param {string} planningDir
 * @returns {string}
 */
function getLogsDir(planningDir) {
  return path.join(planningDir, 'logs');
}

/**
 * Read all {prefix}-*.jsonl files in logsDir, parse each line as JSON.
 * Returns a flat array of parsed entries. Skips unparseable lines.
 * Returns empty array if directory is missing.
 * @param {string} logsDir
 * @param {string} prefix
 * @returns {object[]}
 */
function readJsonlFiles(logsDir, prefix) {
  if (!fs.existsSync(logsDir)) return [];

  const entries = [];
  let files;
  try {
    files = fs.readdirSync(logsDir).filter(f => f.startsWith(prefix + '-') && f.endsWith('.jsonl'));
  } catch (_e) {
    return [];
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed));
        } catch (_e) {
          // Skip unparseable lines
        }
      }
    } catch (_e) {
      // Skip unreadable files
    }
  }

  return entries;
}

/**
 * Read all hook log entries from logsDir.
 * @param {string} logsDir
 * @returns {object[]}
 */
function readHookLogs(logsDir) {
  return readJsonlFiles(logsDir, 'hooks');
}

/**
 * Read all event log entries from logsDir.
 * @param {string} logsDir
 * @returns {object[]}
 */
function readEventLogs(logsDir) {
  return readJsonlFiles(logsDir, 'events');
}

// ---------------------------------------------------------------------------
// SQ-01: Session Start Quality
// ---------------------------------------------------------------------------

/**
 * Check whether progress-tracker injected a session-start briefing.
 * Examines hook logs for progress-tracker SessionStart entries and
 * event logs for workflow/session-start entries.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSessionStartQuality(planningDir, _config) {
  const logsDir = getLogsDir(planningDir);
  const hookLogs = readHookLogs(logsDir);
  const eventLogs = readEventLogs(logsDir);

  // Find progress-tracker SessionStart entries in hook logs
  const hookStarts = hookLogs.filter(
    e => e.hook === 'progress-tracker' && e.event === 'SessionStart'
  );

  // Find session-start entries in event logs
  const eventStarts = eventLogs.filter(
    e => e.cat === 'workflow' && e.event === 'session-start'
  );

  const allStarts = [...hookStarts, ...eventStarts];

  if (allStarts.length === 0) {
    return result('SQ-01', 'warn', 'No session start events found in logs', [
      'No session start events found in logs',
    ]);
  }

  // Check how many sessions had briefing injection
  // Hook logs: decision === 'injected' or presence of output/additionalContext
  // Event logs: details might contain hasState or injected fields
  let injectedCount = 0;
  let totalCount = allStarts.length;
  const evidence = [];

  for (const entry of hookStarts) {
    const injected = entry.decision === 'injected' || entry.decision === 'inject' ||
      (entry.detail && typeof entry.detail === 'string' && entry.detail.includes('inject'));
    const hasState = entry.hasState !== undefined ? entry.hasState : 'unknown';
    if (injected) injectedCount++;
    evidence.push(`Session start: briefing ${injected ? 'injected' : 'not injected'} (hasState: ${hasState})`);
  }

  for (const entry of eventStarts) {
    const injected = entry.injected === true || entry.hasState === true;
    if (injected) injectedCount++;
    evidence.push(`Session start event: briefing ${injected ? 'injected' : 'not detected'} (ts: ${entry.ts || 'unknown'})`);
  }

  let status;
  let message;
  if (injectedCount === totalCount) {
    status = 'pass';
    message = `All ${totalCount} sessions had briefing injection`;
  } else if (injectedCount > 0) {
    status = 'warn';
    message = `${injectedCount}/${totalCount} sessions had briefing injection`;
  } else {
    status = 'fail';
    message = `No sessions had briefing injection (${totalCount} sessions checked)`;
  }

  return result('SQ-01', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-02: Briefing Freshness
// ---------------------------------------------------------------------------

/**
 * Measure STATE.md staleness and size relative to the most recent session start.
 * Fresh = STATE.md modified within 1 hour of session start. Bloated = over 5000 chars.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} _config - Audit config (unused for this check)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkBriefingFreshness(planningDir, _config) {
  const stateFile = path.join(planningDir, 'STATE.md');

  // Check STATE.md existence
  if (!fs.existsSync(stateFile)) {
    return result('SQ-02', 'info', 'No STATE.md found', ['STATE.md does not exist']);
  }

  let stateMtime;
  let stateContent;
  try {
    const stat = fs.statSync(stateFile);
    stateMtime = stat.mtime;
    stateContent = fs.readFileSync(stateFile, 'utf8');
  } catch (_e) {
    return result('SQ-02', 'warn', 'Could not read STATE.md', ['Error reading STATE.md']);
  }

  const stateSize = stateContent.length;
  const evidence = [];

  // Find most recent session-start from event logs
  const logsDir = getLogsDir(planningDir);
  const eventLogs = readEventLogs(logsDir);
  const sessionStarts = eventLogs
    .filter(e => e.cat === 'workflow' && e.event === 'session-start' && e.ts)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (sessionStarts.length === 0) {
    // No session data — report size only
    const sizeAssessment = stateSize > 5000 ? 'bloated' : 'reasonable';
    evidence.push(`STATE.md: ${stateSize} chars (${sizeAssessment}), no session data to compare staleness`);
    if (stateSize > 5000) {
      return result('SQ-02', 'warn', `STATE.md is bloated (${stateSize} chars) — no session timing data`, evidence);
    }
    return result('SQ-02', 'info', 'No session data to measure staleness', evidence);
  }

  // Compare most recent session start to STATE.md mtime
  const latestStart = new Date(sessionStarts[0].ts);
  const stalenessMs = latestStart.getTime() - stateMtime.getTime();
  const stalenessMin = Math.round(stalenessMs / 60000);
  const isStale = stalenessMs > 3600000; // >1 hour
  const isBloated = stateSize > 5000;

  const ageStr = stalenessMs >= 0
    ? `${stalenessMin}min before session start`
    : `${Math.abs(stalenessMin)}min after session start`;

  evidence.push(`STATE.md: ${stateSize} chars, last modified ${ageStr}`);
  evidence.push(`Size assessment: ${isBloated ? 'bloated (>5000 chars)' : 'reasonable'}`);
  evidence.push(`Freshness: ${isStale ? 'stale (>1h)' : 'fresh'}`);

  let status;
  let message;
  if (!isStale && !isBloated) {
    status = 'pass';
    message = `STATE.md is fresh and ${stateSize} chars`;
  } else {
    status = 'warn';
    const issues = [];
    if (isStale) issues.push(`stale (${ageStr})`);
    if (isBloated) issues.push(`bloated (${stateSize} chars)`);
    message = `STATE.md: ${issues.join(', ')}`;
  }

  return result('SQ-02', status, message, evidence);
}

// ---------------------------------------------------------------------------
// SQ-03: Session Duration & Cost Analysis
// ---------------------------------------------------------------------------

/**
 * Measure session durations and tool call volumes. Flags sessions exceeding
 * the configured duration threshold.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Audit config (uses config.audit.thresholds.session_duration_warn_ms)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSessionDurationCost(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const eventLogs = readEventLogs(logsDir);

  // Get duration threshold from config (default 1 hour)
  const thresholds = (config && config.audit && config.audit.thresholds) || {};
  const session_duration_warn_ms = thresholds.session_duration_warn_ms || 3600000;

  // Find all session-start events
  const sessionStarts = eventLogs
    .filter(e => e.cat === 'workflow' && e.event === 'session-start' && e.ts)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  if (sessionStarts.length === 0) {
    return result('SQ-03', 'info', 'No session data', ['No session-start events found in logs']);
  }

  // Find session-end events
  const sessionEnds = eventLogs
    .filter(e => e.cat === 'workflow' && (e.event === 'session-end' || e.event === 'session-stop') && e.ts)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  // Count all tool-use events for cost proxy
  const toolUseEvents = eventLogs.filter(
    e => e.cat === 'tool' || e.event === 'tool-use' || e.event === 'PostToolUse'
  );

  // Also check hook logs for tool-use events as a supplementary source
  const hookLogs = readHookLogs(logsDir);
  const hookToolEvents = hookLogs.filter(e => e.event === 'PostToolUse' || e.event === 'PreToolUse');

  const evidence = [];
  let anyExceeded = false;

  for (let i = 0; i < sessionStarts.length; i++) {
    const startTs = new Date(sessionStarts[i].ts).getTime();
    const startDate = new Date(sessionStarts[i].ts).toISOString().slice(0, 16);

    // Find the matching end: next session-end after this start but before next start
    const nextStartTs = i + 1 < sessionStarts.length
      ? new Date(sessionStarts[i + 1].ts).getTime()
      : Infinity;

    const matchingEnd = sessionEnds.find(e => {
      const endTs = new Date(e.ts).getTime();
      return endTs > startTs && endTs <= nextStartTs;
    });

    let endTs;
    if (matchingEnd) {
      endTs = new Date(matchingEnd.ts).getTime();
    } else {
      // Use last event before next session start as approximate end
      const eventsInRange = eventLogs
        .filter(e => e.ts && new Date(e.ts).getTime() > startTs && new Date(e.ts).getTime() < nextStartTs)
        .map(e => new Date(e.ts).getTime());
      endTs = eventsInRange.length > 0 ? Math.max(...eventsInRange) : startTs;
    }

    const durationMs = endTs - startTs;
    const durationMin = Math.round(durationMs / 60000);

    // Count tool calls within this session's time range
    const sessionToolCalls = toolUseEvents.filter(e => {
      if (!e.ts) return false;
      const t = new Date(e.ts).getTime();
      return t >= startTs && t < nextStartTs;
    }).length;

    const sessionHookCalls = hookToolEvents.filter(e => {
      if (!e.ts) return false;
      const t = new Date(e.ts).getTime();
      return t >= startTs && t < nextStartTs;
    }).length;

    const totalCalls = sessionToolCalls + sessionHookCalls;

    if (durationMs > session_duration_warn_ms) {
      anyExceeded = true;
    }

    evidence.push(`Session ${startDate}: ${durationMin}min, ${totalCalls} tool calls`);
  }

  let status;
  let message;
  if (anyExceeded) {
    status = 'warn';
    message = `${sessionStarts.length} session(s) analyzed — some exceeded ${Math.round(session_duration_warn_ms / 60000)}min threshold`;
  } else {
    status = 'pass';
    message = `${sessionStarts.length} session(s) analyzed — all within duration threshold`;
  }

  return result('SQ-03', status, message, evidence);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkSessionStartQuality,
  checkBriefingFreshness,
  checkSessionDurationCost,
  // Shared helpers exported for reuse by other SQ checks and tests
  readJsonlFiles,
  readHookLogs,
  readEventLogs,
  getLogsDir,
};

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
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkSessionStartQuality,
  // Shared helpers exported for reuse by other SQ checks and tests
  readJsonlFiles,
  readHookLogs,
  readEventLogs,
  getLogsDir,
};

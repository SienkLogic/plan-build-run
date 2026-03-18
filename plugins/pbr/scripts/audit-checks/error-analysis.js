'use strict';

/**
 * Error & Failure Analysis Check Module
 *
 * Implements EF-01, EF-02, EF-05 error and failure analysis dimensions
 * for the PBR audit system. Each check returns a structured result:
 * { dimension, status, message, evidence }.
 *
 * Checks:
 *   EF-01: Tool failure rate analysis (PostToolUseFailure events by tool type)
 *   EF-02: Agent failure/timeout detection (missing completion markers, null durations)
 *   EF-05: Retry/repetition pattern detection (same tool called 3+ times consecutively)
 *
 * Config dependencies:
 *   - config.audit.thresholds.tool_failure_rate_warn (EF-01, default 0.10)
 *   - config.audit.thresholds.agent_timeout_ms (EF-02, default 600000)
 *   - config.audit.thresholds.retry_pattern_min_count (EF-05, default 3)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "EF-01")
 * @param {'pass'|'warn'|'fail'} status
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
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Get the logs directory path from a planningDir.
 * @param {string} planningDir - Path to .planning directory
 * @returns {string}
 */
function getLogsDir(planningDir) {
  return path.join(planningDir, 'logs');
}

/**
 * Read all JSONL files matching a prefix from a logs directory.
 * E.g., readJsonlFiles(logsDir, 'hooks') reads all hooks-*.jsonl files.
 * @param {string} logsDir - Path to logs directory
 * @param {string} prefix - File prefix (e.g. 'hooks', 'events')
 * @returns {object[]} Array of parsed JSON entries
 */
function readJsonlFiles(logsDir, prefix) {
  const entries = [];
  if (!fs.existsSync(logsDir)) return entries;

  let files;
  try {
    files = fs.readdirSync(logsDir);
  } catch (_e) {
    return entries;
  }

  const pattern = new RegExp(`^${prefix}-.*\\.jsonl$`);
  for (const file of files) {
    if (!pattern.test(file)) continue;
    try {
      const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed));
        } catch (_e) {
          // Skip malformed lines
        }
      }
    } catch (_e) {
      // Skip unreadable files
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// EF-01: Tool Failure Rate Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze tool failure rates from hook and event logs.
 * Groups failures by tool type, calculates rates where possible.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Config object (may have audit.thresholds.tool_failure_rate_warn)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkToolFailureRate(planningDir, config) {
  const logsDir = getLogsDir(planningDir);
  const threshold = config?.audit?.thresholds?.tool_failure_rate_warn ?? 0.10;

  // Collect failures from hook logs
  const hookEntries = readJsonlFiles(logsDir, 'hooks');
  const hookFailures = hookEntries.filter(
    e => e.hook === 'log-tool-failure' || e.event === 'PostToolUseFailure'
  );

  // Collect failures and total tool calls from event logs
  const eventEntries = readJsonlFiles(logsDir, 'events');
  const eventFailures = eventEntries.filter(
    e => e.cat === 'tool' && e.event === 'failure'
  );
  const totalToolEvents = eventEntries.filter(e => e.cat === 'tool');

  // Merge failure sources — extract tool name from various field locations
  const failuresByTool = {};
  for (const entry of hookFailures) {
    const tool = entry.details?.tool || entry.data?.tool || entry.tool || 'unknown';
    failuresByTool[tool] = (failuresByTool[tool] || 0) + 1;
  }
  for (const entry of eventFailures) {
    const tool = entry.tool || entry.data?.tool || 'unknown';
    failuresByTool[tool] = (failuresByTool[tool] || 0) + 1;
  }

  // Count total calls per tool from event logs
  const totalByTool = {};
  for (const entry of totalToolEvents) {
    const tool = entry.tool || entry.data?.tool || 'unknown';
    totalByTool[tool] = (totalByTool[tool] || 0) + 1;
  }

  const totalFailures = Object.values(failuresByTool).reduce((a, b) => a + b, 0);
  if (totalFailures === 0) {
    return result('EF-01', 'pass', 'No tool failures detected in logs', []);
  }

  // Build evidence and determine status
  const evidence = [];
  let anyAboveThreshold = false;

  for (const [tool, count] of Object.entries(failuresByTool)) {
    const total = totalByTool[tool];
    if (total && total > 0) {
      const rate = count / total;
      const pct = (rate * 100).toFixed(1);
      evidence.push(`${tool}: ${count} failures (${pct}% rate of ${total} calls)`);
      if (rate > threshold) anyAboveThreshold = true;
    } else {
      evidence.push(`${tool}: ${count} failures (total calls unknown)`);
    }
  }

  const status = anyAboveThreshold ? 'fail' : 'warn';
  const message = anyAboveThreshold
    ? `Tool failure rate exceeds ${(threshold * 100).toFixed(0)}% threshold for some tools`
    : `${totalFailures} tool failure(s) detected but within threshold`;

  return result('EF-01', status, message, evidence);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkToolFailureRate,
};

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 200;

/**
 * Appends a metric entry to the JSONL log file.
 * Rotates to keep only the last 200 entries when the log exceeds MAX_ENTRIES lines.
 * Swallows all errors silently — metrics must never crash hooks.
 *
 * @param {string} planningDir - path to the .planning directory
 * @param {object} entry - metric entry object
 * @param {string} entry.session_id
 * @param {string} entry.timestamp
 * @param {string} entry.operation
 * @param {string} entry.model
 * @param {number} entry.latency_ms
 * @param {number} entry.tokens_used_local
 * @param {number} entry.tokens_saved_frontier
 * @param {string} entry.result
 * @param {boolean} entry.fallback_used
 * @param {number} entry.confidence
 */
function logMetric(planningDir, entry) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');

    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');

    // Rotate if over MAX_ENTRIES
    try {
      const contents = fs.readFileSync(logFile, 'utf8');
      const lines = contents.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length > MAX_ENTRIES) {
        const trimmed = lines.slice(lines.length - MAX_ENTRIES);
        fs.writeFileSync(logFile, trimmed.join('\n') + '\n', 'utf8');
      }
    } catch (_) {
      // Rotation failure is non-fatal
    }
  } catch (_) {
    // Swallow all errors silently
  }
}

/**
 * Reads metric entries from the JSONL log that occurred at or after sessionStartTime.
 *
 * @param {string} planningDir - path to the .planning directory
 * @param {string|Date} sessionStartTime - ISO string or Date
 * @returns {object[]} Array of matching metric entry objects
 */
function readSessionMetrics(planningDir, sessionStartTime) {
  try {
    const logFile = path.join(planningDir, 'logs', 'local-llm-metrics.jsonl');
    const contents = fs.readFileSync(logFile, 'utf8');
    const startMs = new Date(sessionStartTime).getTime();

    return contents
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch (_) {
          return null;
        }
      })
      .filter((e) => e !== null)
      .filter((e) => {
        try {
          return new Date(e.timestamp).getTime() >= startMs;
        } catch (_) {
          return false;
        }
      });
  } catch (_) {
    return [];
  }
}

/**
 * Summarizes an array of metric entries.
 *
 * @param {object[]} entries
 * @param {number} [frontierTokenRate=3.0] - cost per million tokens in USD
 * @returns {{ total_calls: number, fallback_count: number, avg_latency_ms: number, tokens_saved: number, cost_saved_usd: number }}
 */
function summarizeMetrics(entries, frontierTokenRate) {
  if (!entries || entries.length === 0) {
    return {
      total_calls: 0,
      fallback_count: 0,
      avg_latency_ms: 0,
      tokens_saved: 0,
      cost_saved_usd: 0
    };
  }

  const rate = frontierTokenRate != null ? frontierTokenRate : 3.0;
  const total_calls = entries.length;
  const fallback_count = entries.filter((e) => e.fallback_used).length;
  const totalLatency = entries.reduce((sum, e) => sum + (e.latency_ms || 0), 0);
  const avg_latency_ms = total_calls > 0 ? totalLatency / total_calls : 0;
  const tokens_saved = entries.reduce((sum, e) => sum + (e.tokens_saved_frontier || 0), 0);
  const cost_saved_usd = tokens_saved * (rate / 1_000_000);

  return { total_calls, fallback_count, avg_latency_ms, tokens_saved, cost_saved_usd };
}

module.exports = { logMetric, readSessionMetrics, summarizeMetrics };

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

    // Update lifetime totals BEFORE appending to JSONL so seeding
    // (which reads the JSONL) doesn't double-count this entry
    try {
      updateLifetimeTotals(logsDir, entry);
    } catch (_) {
      // Totals update failure is non-fatal
    }

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
 * Atomically increments the lifetime-totals.json running counters.
 * This file persists across JSONL log rotations so lifetime metrics never plateau.
 *
 * @param {string} logsDir - path to the .planning/logs directory
 * @param {object} entry - the metric entry being logged
 */
function updateLifetimeTotals(logsDir, entry) {
  const totalsFile = path.join(logsDir, 'lifetime-totals.json');
  let totals = null;

  try {
    totals = JSON.parse(fs.readFileSync(totalsFile, 'utf8'));
  } catch (_) {
    // File doesn't exist yet or is corrupt — seed from existing JSONL
    totals = seedTotalsFromJsonl(logsDir);
  }

  totals.total_calls = (totals.total_calls || 0) + 1;
  totals.fallback_count = (totals.fallback_count || 0) + (entry.fallback_used ? 1 : 0);
  totals.tokens_saved = (totals.tokens_saved || 0) + (entry.tokens_saved_frontier || 0);
  totals.total_latency_ms = (totals.total_latency_ms || 0) + (entry.latency_ms || 0);

  fs.writeFileSync(totalsFile, JSON.stringify(totals) + '\n', 'utf8');
}

/**
 * Seeds lifetime totals by scanning the existing JSONL log.
 * Called once when lifetime-totals.json doesn't exist yet (migration from pre-totals installs).
 * Returns the accumulated totals from whatever entries remain in the JSONL.
 *
 * @param {string} logsDir - path to the .planning/logs directory
 * @returns {{ total_calls: number, fallback_count: number, tokens_saved: number, total_latency_ms: number }}
 */
function seedTotalsFromJsonl(logsDir) {
  const seed = { total_calls: 0, fallback_count: 0, tokens_saved: 0, total_latency_ms: 0 };
  try {
    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    const contents = fs.readFileSync(logFile, 'utf8');
    const lines = contents.split(/\r?\n/).filter((l) => l.trim() !== '');
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        seed.total_calls += 1;
        seed.fallback_count += e.fallback_used ? 1 : 0;
        seed.tokens_saved += e.tokens_saved_frontier || 0;
        seed.total_latency_ms += e.latency_ms || 0;
      } catch (_) {
        // Skip malformed lines
      }
    }
  } catch (_) {
    // No JSONL file — start at zero
  }
  return seed;
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

/**
 * Computes lifetime aggregate metrics by reading all entries from the JSONL log.
 * No date filter — reads everything. Adds a by_operation breakdown keyed by operation.
 *
 * @param {string} planningDir - path to the .planning directory
 * @param {number} [frontierTokenRate=3.0] - cost per million tokens in USD
 * @returns {{ total_calls: number, fallback_count: number, avg_latency_ms: number, tokens_saved: number, cost_saved_usd: number, by_operation: object }}
 */
function computeLifetimeMetrics(planningDir, frontierTokenRate) {
  const zero = {
    total_calls: 0,
    fallback_count: 0,
    avg_latency_ms: 0,
    tokens_saved: 0,
    cost_saved_usd: 0,
    by_operation: {}
  };

  try {
    const rate = frontierTokenRate != null ? frontierTokenRate : 3.0;
    const logsDir = path.join(planningDir, 'logs');
    const totalsFile = path.join(logsDir, 'lifetime-totals.json');

    // Primary path: read from lifetime-totals.json (survives log rotation)
    let totals = null;
    try {
      totals = JSON.parse(fs.readFileSync(totalsFile, 'utf8'));
    } catch (_) {
      // No totals file — fall back to JSONL scan (migration path for existing installs)
    }

    // Build by_operation from the JSONL (only covers recent entries, but still useful)
    const by_operation = {};
    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    try {
      const contents = fs.readFileSync(logFile, 'utf8');
      const entries = contents
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '')
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch (_) {
            return null;
          }
        })
        .filter((e) => e !== null);

      for (const e of entries) {
        const op = e.operation || 'unknown';
        if (!by_operation[op]) {
          by_operation[op] = { calls: 0, fallbacks: 0, tokens_saved: 0 };
        }
        by_operation[op].calls += 1;
        if (e.fallback_used) by_operation[op].fallbacks += 1;
        by_operation[op].tokens_saved += e.tokens_saved_frontier || 0;
      }

      // If no totals file, compute from JSONL (legacy/migration path)
      if (!totals) {
        if (entries.length === 0) return zero;
        const total_calls = entries.length;
        const fallback_count = entries.filter((e) => e.fallback_used).length;
        const totalLatency = entries.reduce((sum, e) => sum + (e.latency_ms || 0), 0);
        const avg_latency_ms = total_calls > 0 ? totalLatency / total_calls : 0;
        const tokens_saved = entries.reduce((sum, e) => sum + (e.tokens_saved_frontier || 0), 0);
        const cost_saved_usd = tokens_saved * (rate / 1_000_000);
        return { total_calls, fallback_count, avg_latency_ms, tokens_saved, cost_saved_usd, by_operation };
      }
    } catch (_) {
      // No JSONL file — if we have totals, continue; otherwise return zero
      if (!totals) return zero;
    }

    // Use lifetime totals for the headline numbers
    const total_calls = totals.total_calls || 0;
    const fallback_count = totals.fallback_count || 0;
    const tokens_saved = totals.tokens_saved || 0;
    const total_latency_ms = totals.total_latency_ms || 0;
    const avg_latency_ms = total_calls > 0 ? total_latency_ms / total_calls : 0;
    const cost_saved_usd = tokens_saved * (rate / 1_000_000);

    return { total_calls, fallback_count, avg_latency_ms, tokens_saved, cost_saved_usd, by_operation };
  } catch (_) {
    return zero;
  }
}

/**
 * Formats a metrics aggregate (output of summarizeMetrics) into a human-readable one-liner.
 *
 * @param {object} summary - output of summarizeMetrics()
 * @param {string} [model] - optional model name
 * @returns {string}
 */
function formatSessionSummary(summary, model) {
  if (!summary || summary.total_calls === 0) {
    return 'Local LLM: no calls this session';
  }

  const { total_calls, fallback_count, avg_latency_ms, tokens_saved, cost_saved_usd } = summary;

  let costStr = '';
  if (cost_saved_usd > 0) {
    costStr = ` ($${cost_saved_usd.toFixed(2)})`;
  }

  let fallbackStr = '';
  if (fallback_count > 0) {
    fallbackStr = `, ${fallback_count} fallback(s)`;
  }

  let modelStr = '';
  if (model) {
    modelStr = ` [${model}]`;
  }

  const avgMs = Math.round(avg_latency_ms);

  return `Local LLM: ${total_calls} calls, ~${tokens_saved} frontier tokens saved${costStr}, avg ${avgMs}ms${fallbackStr}${modelStr}`;
}

/**
 * Appends a shadow comparison entry to the shadow JSONL log file.
 * Rotates to keep only the last 200 entries. Swallows all errors silently.
 *
 * @param {string} planningDir - path to the .planning directory
 * @param {object} entry - shadow comparison entry object
 * @param {string} entry.timestamp
 * @param {string} entry.operation
 * @param {string} entry.session_id
 * @param {boolean} entry.agrees
 * @param {string|null} entry.local_result
 * @param {string} entry.frontier_result
 */
function logAgreement(planningDir, entry) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    const logFile = path.join(logsDir, 'local-llm-shadow.jsonl');

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

module.exports = { logMetric, readSessionMetrics, summarizeMetrics, computeLifetimeMetrics, formatSessionSummary, logAgreement, updateLifetimeTotals, seedTotalsFromJsonl };

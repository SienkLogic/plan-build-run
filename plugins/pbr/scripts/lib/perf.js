'use strict';

/**
 * lib/perf.js — Performance metric utilities for Plan-Build-Run hooks.
 *
 * Provides percentile calculation, hook performance summarization,
 * and formatted table output with regression detection.
 */

/**
 * Compute a percentile value from a pre-sorted ascending numeric array.
 * Uses the nearest-rank method.
 *
 * @param {number[]} sortedArr - Numeric array sorted ascending
 * @param {number} p - Percentile (0-100)
 * @returns {number|null} The percentile value, or null if array is empty
 */
function percentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return null;
  const idx = Math.max(0, Math.min(Math.ceil(p / 100 * sortedArr.length) - 1, sortedArr.length - 1));
  return sortedArr[idx];
}

/**
 * Compute stats (count, p50, p95, p99, min, max) for a sorted array of durations.
 * @param {number[]} sorted
 * @returns {{ count: number, p50: number|null, p95: number|null, p99: number|null, min: number, max: number }}
 */
function computeStats(sorted) {
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

/**
 * Summarize hook performance from JSONL event entries.
 *
 * @param {object[]} entries - Array of parsed JSONL event objects
 * @returns {{ byHook: object, byEvent: object }} Grouped performance stats
 */
function summarizeHookPerf(entries) {
  const withDuration = (entries || []).filter(e => typeof e.duration_ms === 'number');

  const byHookMap = {};
  const byEventMap = {};

  for (const entry of withDuration) {
    const hookKey = entry.hook || '(unknown)';
    const eventKey = entry.event || '(unknown)';

    if (!byHookMap[hookKey]) byHookMap[hookKey] = [];
    byHookMap[hookKey].push(entry.duration_ms);

    if (!byEventMap[eventKey]) byEventMap[eventKey] = [];
    byEventMap[eventKey].push(entry.duration_ms);
  }

  const byHook = {};
  for (const [key, durations] of Object.entries(byHookMap)) {
    durations.sort((a, b) => a - b);
    byHook[key] = computeStats(durations);
  }

  const byEvent = {};
  for (const [key, durations] of Object.entries(byEventMap)) {
    durations.sort((a, b) => a - b);
    byEvent[key] = computeStats(durations);
  }

  return { byHook, byEvent };
}

/**
 * Format a performance summary as a plain-text table.
 *
 * @param {{ byHook: object, byEvent: object }} summary - Output of summarizeHookPerf()
 * @returns {string} Plain-text table (no ANSI codes)
 */
function formatPerfTable(summary) {
  const pad = (str, width) => String(str).padEnd(width);
  const rpad = (val, width) => String(val === null ? '-' : val).padStart(width);

  function buildTable(title, data) {
    const lines = [];
    lines.push(title);
    lines.push(pad('Name', 30) + rpad('Count', 7) + rpad('P50', 7) + rpad('P95', 7) + rpad('P99', 7) + rpad('Max', 7));
    lines.push('-'.repeat(65));

    const keys = Object.keys(data).sort();
    for (const key of keys) {
      const s = data[key];
      let row = pad(key.length > 29 ? key.slice(0, 29) : key, 30)
        + rpad(s.count, 7)
        + rpad(s.p50, 7)
        + rpad(s.p95, 7)
        + rpad(s.p99, 7)
        + rpad(s.max, 7);
      if (s.max >= 100) {
        row += ' *** ALERT';
      }
      lines.push(row);
    }

    return lines.join('\n');
  }

  const hookTable = buildTable('== By Hook ==', summary.byHook || {});
  const eventTable = buildTable('== By Event ==', summary.byEvent || {});

  return hookTable + '\n\n' + eventTable;
}

module.exports = { percentile, summarizeHookPerf, formatPerfTable };

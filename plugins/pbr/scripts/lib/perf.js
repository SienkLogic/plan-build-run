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

/**
 * Load performance entries from hooks JSONL log files.
 *
 * @param {string} planningDir - Path to the .planning/ directory
 * @param {{ last?: number }} [opts] - Options: last = max days of log files to include
 * @returns {object[]} Flat array of matching entry objects with duration_ms and transport === 'http'
 */
function loadPerfEntries(planningDir, opts) {
  const fs = require('fs');
  const path = require('path');
  const logsDir = path.join(planningDir, 'logs');
  const entries = [];

  // Determine cutoff date if --last N is specified
  let cutoffDate = null;
  if (opts && typeof opts.last === 'number' && opts.last > 0) {
    const d = new Date();
    d.setDate(d.getDate() - opts.last);
    cutoffDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  // Collect files to read
  const files = [];

  // Read hooks-*.jsonl from logs dir
  try {
    const dirEntries = fs.readdirSync(logsDir);
    for (const fname of dirEntries) {
      const match = fname.match(/^hooks-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (match) {
        if (cutoffDate && match[1] < cutoffDate) continue;
        files.push(path.join(logsDir, fname));
      }
    }
  } catch (_e) {
    // logsDir may not exist — skip silently
  }

  // Also read .hook-events.jsonl in planningDir if it exists
  const eventsFile = path.join(planningDir, '.hook-events.jsonl');
  try {
    fs.accessSync(eventsFile, fs.constants.R_OK);
    files.push(eventsFile);
  } catch (_e) {
    // File doesn't exist — skip
  }

  // Parse each file
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed);
          if (typeof entry.duration_ms === 'number' && entry.transport === 'http') {
            entries.push(entry);
          }
        } catch (_e) {
          // Skip malformed lines
        }
      }
    } catch (_e) {
      // Skip unreadable files silently
    }
  }

  return entries;
}

module.exports = { percentile, summarizeHookPerf, formatPerfTable, loadPerfEntries };

/**
 * lib/benchmark.js — Cost & duration benchmarking aggregation library.
 *
 * Parses JSONL cost tracker files written by log-subagent.js trackAgentCost()
 * and aggregates entries by phase, agent type, skill, or session.
 *
 * Exports: parseCostLine, loadCostEntries, aggregateCosts, phaseSummary
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter } = require('./yaml');

/**
 * Parse one JSONL line from an agent cost tracker file.
 * @param {string} line - A single JSONL line
 * @returns {{ ts: number, type: string, ms: number, phase: string|null, skill: string|null }|null}
 */
function parseCostLine(line) {
  if (!line || typeof line !== 'string') return null;
  try {
    const obj = JSON.parse(line.trim());
    if (!obj || typeof obj !== 'object') return null;
    return {
      ts: obj.ts || 0,
      type: obj.type || 'unknown',
      ms: obj.ms || 0,
      phase: obj.phase || null,
      skill: obj.skill || null
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Load all cost entries from .planning/ cost tracker files.
 * Scans root .agent-cost-tracker and all session-scoped tracker files.
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {Array<{ ts: number, type: string, ms: number, phase: string|null, skill: string|null }>}
 */
function loadCostEntries(planningDir) {
  const entries = [];
  if (!planningDir) return entries;

  const COST_FILE = '.agent-cost-tracker';

  // Read root tracker
  _readTrackerFile(path.join(planningDir, COST_FILE), entries);

  // Read session-scoped trackers
  const sessionsDir = path.join(planningDir, '.sessions');
  try {
    const sessions = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const dirent of sessions) {
      if (dirent.isDirectory()) {
        _readTrackerFile(path.join(sessionsDir, dirent.name, COST_FILE), entries);
      }
    }
  } catch (_e) {
    // No .sessions dir or read error — that's fine
  }

  return entries;
}

/**
 * Read a single tracker file and push parsed entries into the array.
 * @param {string} filePath
 * @param {Array} entries
 */
function _readTrackerFile(filePath, entries) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    for (const line of lines) {
      const entry = parseCostLine(line);
      if (entry) entries.push(entry);
    }
  } catch (_e) {
    // File missing or unreadable — skip
  }
}

/**
 * Aggregate cost entries by a specified grouping key.
 * @param {Array<{ ts: number, type: string, ms: number, phase: string|null, skill: string|null }>} entries
 * @param {'phase'|'agent'|'skill'|'session'} groupBy
 * @returns {{ groups: Object<string, { count: number, total_ms: number, avg_ms: number }>, totals: { count: number, total_ms: number } }}
 */
function aggregateCosts(entries, groupBy) {
  const groups = {};
  let totalCount = 0;
  let totalMs = 0;

  const keyFn = _groupKeyFn(groupBy);

  for (const entry of entries) {
    const key = keyFn(entry) || 'unknown';
    if (!groups[key]) {
      groups[key] = { count: 0, total_ms: 0, avg_ms: 0 };
    }
    groups[key].count += 1;
    groups[key].total_ms += entry.ms || 0;
    totalCount += 1;
    totalMs += entry.ms || 0;
  }

  // Compute averages
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    g.avg_ms = g.count > 0 ? Math.round(g.total_ms / g.count) : 0;
  }

  return {
    groups,
    totals: { count: totalCount, total_ms: totalMs }
  };
}

/**
 * Return a function that extracts the grouping key from an entry.
 * @param {'phase'|'agent'|'skill'|'session'} groupBy
 * @returns {function(entry): string|null}
 */
function _groupKeyFn(groupBy) {
  switch (groupBy) {
    case 'phase': return (e) => e.phase;
    case 'agent': return (e) => e.type;
    case 'skill': return (e) => e.skill;
    case 'session': return (e) => e.session || null;
    default: return (e) => e.type;
  }
}

/**
 * Convenience: load entries, aggregate by phase, and pair with VERIFICATION.md quality scores.
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ phases: Object<string, { count: number, total_ms: number, avg_ms: number, quality: string|null }>, totals: { count: number, total_ms: number } }}
 */
function phaseSummary(planningDir) {
  const entries = loadCostEntries(planningDir);
  const { groups, totals } = aggregateCosts(entries, 'phase');

  // Enrich each phase group with quality from VERIFICATION.md
  const phases = {};
  for (const [phaseNum, stats] of Object.entries(groups)) {
    phases[phaseNum] = {
      ...stats,
      quality: _readPhaseQuality(planningDir, phaseNum)
    };
  }

  return { phases, totals };
}

/**
 * Read the quality/status from a phase's VERIFICATION.md frontmatter.
 * @param {string} planningDir
 * @param {string} phaseNum
 * @returns {string|null}
 */
function _readPhaseQuality(planningDir, phaseNum) {
  if (!phaseNum || phaseNum === 'unknown' || phaseNum === 'null') return null;

  const phasesDir = path.join(planningDir, 'phases');
  try {
    const entries = fs.readdirSync(phasesDir);
    const prefix = phaseNum + '-';
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        const verPath = path.join(phasesDir, entry, 'VERIFICATION.md');
        try {
          const content = fs.readFileSync(verPath, 'utf8');
          const fm = parseYamlFrontmatter(content);
          return fm.status || fm.result || null;
        } catch (_e) {
          return null;
        }
      }
    }
  } catch (_e) {
    // No phases dir
  }
  return null;
}

module.exports = { parseCostLine, loadCostEntries, aggregateCosts, phaseSummary };

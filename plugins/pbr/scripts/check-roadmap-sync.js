#!/usr/bin/env node

/**
 * PostToolUse hook (async): Checks that ROADMAP.md phase status
 * stays in sync with STATE.md after state updates.
 *
 * When STATE.md is written/edited and contains a phase status
 * (planned, built, partial, verified), this hook checks if the
 * ROADMAP.md Phase Overview table has a matching status for that
 * phase. If not, it warns Claude to update ROADMAP.md.
 *
 * Runs asynchronously (non-blocking). Issues are reported but
 * don't prevent saving.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');

const LIFECYCLE_STATUSES = ['planned', 'built', 'partial', 'verified'];

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const filePath = data.tool_input?.file_path || '';

      if (!filePath.endsWith('STATE.md')) {
        process.exit(0);
      }

      const cwd = process.cwd();
      const planningDir = path.join(cwd, '.planning');
      const roadmapPath = path.join(planningDir, 'ROADMAP.md');

      if (!fs.existsSync(filePath) || !fs.existsSync(roadmapPath)) {
        process.exit(0);
      }

      const stateContent = fs.readFileSync(filePath, 'utf8');
      const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');

      const stateInfo = parseState(stateContent);
      if (!stateInfo || !stateInfo.phase || !stateInfo.status) {
        logHook('check-roadmap-sync', 'PostToolUse', 'skip', { reason: 'could not parse STATE.md' });
        process.exit(0);
      }

      if (!LIFECYCLE_STATUSES.includes(stateInfo.status)) {
        logHook('check-roadmap-sync', 'PostToolUse', 'skip', {
          reason: `status "${stateInfo.status}" not a lifecycle status`
        });
        process.exit(0);
      }

      const roadmapStatus = getRoadmapPhaseStatus(roadmapContent, stateInfo.phase);
      if (!roadmapStatus) {
        logHook('check-roadmap-sync', 'PostToolUse', 'skip', {
          reason: `phase ${stateInfo.phase} not found in ROADMAP.md table`
        });
        process.exit(0);
      }

      if (roadmapStatus.toLowerCase() !== stateInfo.status) {
        logHook('check-roadmap-sync', 'PostToolUse', 'warn', {
          phase: stateInfo.phase,
          stateStatus: stateInfo.status,
          roadmapStatus: roadmapStatus
        });
        logEvent('workflow', 'roadmap-sync', {
          phase: stateInfo.phase,
          stateStatus: stateInfo.status,
          roadmapStatus: roadmapStatus,
          status: 'out-of-sync'
        });

        const output = {
          message: `ROADMAP.md out of sync: Phase ${stateInfo.phase} is "${roadmapStatus}" in ROADMAP.md but "${stateInfo.status}" in STATE.md. Update the Phase Overview table in ROADMAP.md to match.`
        };
        process.stdout.write(JSON.stringify(output));
      } else {
        logHook('check-roadmap-sync', 'PostToolUse', 'pass', {
          phase: stateInfo.phase,
          status: stateInfo.status
        });
        logEvent('workflow', 'roadmap-sync', {
          phase: stateInfo.phase,
          status: 'in-sync'
        });
      }

      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

/**
 * Extract current phase number and status from STATE.md.
 * Handles common formats:
 *   "**Phase**: 03 - slug-name"
 *   "Phase: 3"
 *   "Current phase: 03-slug-name"
 *   "**Status**: planned"
 *   "Phase status: built"
 */
function parseState(content) {
  const phaseMatch = content.match(
    /\*{0,2}(?:Current\s+)?Phase\*{0,2}:\s*(\d+(?:\.\d+)?)/i
  );

  const statusMatch = content.match(
    /\*{0,2}(?:Phase\s+)?Status\*{0,2}:\s*["']?(\w+)["']?/i
  );

  if (!phaseMatch || !statusMatch) return null;

  return {
    phase: normalizePhaseNum(phaseMatch[1]),
    status: statusMatch[1].toLowerCase()
  };
}

/**
 * Find the status for a given phase in ROADMAP.md's Phase Overview table.
 * Table format:
 *   | Phase | Name | Goal | Plans | Wave | Status |
 *   |-------|------|------|-------|------|--------|
 *   | 01    | ...  | ...  | ...   | ...  | pending |
 */
function getRoadmapPhaseStatus(content, phaseNum) {
  const lines = content.split('\n');

  let statusColIndex = -1;
  let phaseColIndex = -1;
  let inTable = false;

  for (const line of lines) {
    if (!inTable) {
      if (line.includes('|') && /Phase/i.test(line) && /Status/i.test(line)) {
        const cols = splitTableRow(line);
        phaseColIndex = cols.findIndex(c => /^Phase$/i.test(c));
        statusColIndex = cols.findIndex(c => /^Status$/i.test(c));
        if (phaseColIndex !== -1 && statusColIndex !== -1) {
          inTable = true;
        }
      }
      continue;
    }

    // Skip separator row
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) continue;

    // Non-table line ends the table
    if (!line.includes('|')) break;

    const cols = splitTableRow(line);
    if (cols.length <= Math.max(phaseColIndex, statusColIndex)) continue;

    const rowPhase = normalizePhaseNum(cols[phaseColIndex]);
    if (rowPhase === phaseNum) {
      return cols[statusColIndex];
    }
  }

  return null;
}

/** Split a markdown table row into trimmed cell values. */
function splitTableRow(line) {
  return line.split('|').map(c => c.trim()).filter(Boolean);
}

/**
 * Extract and normalize a phase number from various formats:
 *   "03"                    → "3"
 *   "3.1"                   → "3.1"
 *   "01. Project Scaffolding" → "1"
 *   "Phase 02"              → "2"
 */
function normalizePhaseNum(raw) {
  const match = raw.match(/(?:Phase\s+)?0*(\d+(?:\.\d+)?)/i);
  return match ? match[1] : raw.trim();
}

/**
 * Core roadmap sync check logic for use by dispatchers.
 * @param {Object} data - Parsed hook input (tool_input, etc.)
 * @returns {null|{output: Object}} null if pass or not applicable, result otherwise
 */
function checkSync(data) {
  const filePath = data.tool_input?.file_path || '';

  if (!filePath.endsWith('STATE.md')) return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');

  if (!fs.existsSync(filePath) || !fs.existsSync(roadmapPath)) return null;

  const stateContent = fs.readFileSync(filePath, 'utf8');
  const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');

  const stateInfo = parseState(stateContent);
  if (!stateInfo || !stateInfo.phase || !stateInfo.status) {
    logHook('check-roadmap-sync', 'PostToolUse', 'skip', { reason: 'could not parse STATE.md' });
    return null;
  }

  if (!LIFECYCLE_STATUSES.includes(stateInfo.status)) {
    logHook('check-roadmap-sync', 'PostToolUse', 'skip', {
      reason: `status "${stateInfo.status}" not a lifecycle status`
    });
    return null;
  }

  const roadmapStatus = getRoadmapPhaseStatus(roadmapContent, stateInfo.phase);
  if (!roadmapStatus) {
    logHook('check-roadmap-sync', 'PostToolUse', 'skip', {
      reason: `phase ${stateInfo.phase} not found in ROADMAP.md table`
    });
    return null;
  }

  if (roadmapStatus.toLowerCase() !== stateInfo.status) {
    logHook('check-roadmap-sync', 'PostToolUse', 'warn', {
      phase: stateInfo.phase, stateStatus: stateInfo.status, roadmapStatus
    });
    logEvent('workflow', 'roadmap-sync', {
      phase: stateInfo.phase, stateStatus: stateInfo.status, roadmapStatus, status: 'out-of-sync'
    });
    return {
      output: {
        message: `ROADMAP.md out of sync: Phase ${stateInfo.phase} is "${roadmapStatus}" in ROADMAP.md but "${stateInfo.status}" in STATE.md. Update the Phase Overview table in ROADMAP.md to match.`
      }
    };
  }

  logHook('check-roadmap-sync', 'PostToolUse', 'pass', { phase: stateInfo.phase, status: stateInfo.status });
  logEvent('workflow', 'roadmap-sync', { phase: stateInfo.phase, status: 'in-sync' });
  return null;
}

/**
 * Parse all phase directory slugs referenced in ROADMAP.md.
 * Looks for NN-slug patterns in the Phase Overview table or
 * phase reference lines like "## Phase 01-setup" or "01-setup".
 * Returns an array of unique directory names, e.g. ["01-setup", "02-auth"].
 */
function parseRoadmapPhases(content) {
  const phases = new Set();
  const lines = content.split('\n');

  for (const line of lines) {
    // Match NN-slug patterns (at least two-digit prefix with hyphen and slug)
    const matches = line.match(/\b(\d{2,}-[a-zA-Z][a-zA-Z0-9-]*)\b/g);
    if (matches) {
      for (const m of matches) {
        phases.add(m);
      }
    }
  }

  return Array.from(phases);
}

/**
 * Check for drift between ROADMAP.md phase references and actual
 * phase directories on disk under .planning/phases/.
 *
 * Returns an array of warning strings. Empty array means no drift.
 *
 * @param {string} roadmapContent - Contents of ROADMAP.md
 * @param {string} phasesDir - Absolute path to .planning/phases/
 * @returns {string[]} warnings
 */
function checkFilesystemDrift(roadmapContent, phasesDir) {
  const warnings = [];

  if (!fs.existsSync(phasesDir)) {
    return warnings;
  }

  const roadmapPhases = parseRoadmapPhases(roadmapContent);

  // Check that each ROADMAP.md phase has a directory on disk
  for (const phase of roadmapPhases) {
    const dirPath = path.join(phasesDir, phase);
    if (!fs.existsSync(dirPath)) {
      warnings.push(`Phase directory missing: .planning/phases/${phase} (referenced in ROADMAP.md)`);
    }
  }

  // Check for orphaned directories not referenced in ROADMAP.md
  let entries;
  try {
    entries = fs.readdirSync(phasesDir, { withFileTypes: true });
  } catch (_e) {
    return warnings;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Only consider NN-slug directories
    if (!/^\d{2,}-[a-zA-Z]/.test(entry.name)) continue;
    if (!roadmapPhases.includes(entry.name)) {
      warnings.push(`Orphaned phase directory: .planning/phases/${entry.name} (not referenced in ROADMAP.md)`);
    }
  }

  return warnings;
}

module.exports = { parseState, getRoadmapPhaseStatus, checkSync, parseRoadmapPhases, checkFilesystemDrift };
if (require.main === module) { main(); }

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

/** Ordered lifecycle statuses for regression detection. Higher index = more advanced. */
const STATUS_ORDER = ['planned', 'partial', 'built', 'verified'];

/**
 * Determine if a STATE.md → ROADMAP.md mismatch is high-risk.
 * High-risk scenarios:
 *   1. Status regression: ROADMAP status is earlier in lifecycle than STATE status
 *   2. Phase ordering gap: ROADMAP table skips phase numbers (e.g., 01 then 03)
 *
 * @param {string} stateContent - Contents of STATE.md
 * @param {string} roadmapContent - Contents of ROADMAP.md
 * @returns {boolean}
 */
function isHighRisk(stateContent, roadmapContent) {
  const stateInfo = parseState(stateContent);
  if (!stateInfo || !stateInfo.phase || !stateInfo.status) return false;

  // Check status regression
  const roadmapStatus = getRoadmapPhaseStatus(roadmapContent, stateInfo.phase);
  if (roadmapStatus) {
    const stateIdx = STATUS_ORDER.indexOf(stateInfo.status);
    const roadmapIdx = STATUS_ORDER.indexOf(roadmapStatus.toLowerCase());
    if (stateIdx !== -1 && roadmapIdx !== -1 && roadmapIdx < stateIdx) {
      return true;
    }
  }

  // Check phase ordering gaps
  const phaseNumbers = getAllRoadmapPhaseNumbers(roadmapContent);
  if (phaseNumbers.length >= 2) {
    for (let i = 1; i < phaseNumbers.length; i++) {
      if (phaseNumbers[i] - phaseNumbers[i - 1] > 1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract all phase numbers from ROADMAP.md table, sorted ascending.
 * @param {string} content - ROADMAP.md content
 * @returns {number[]}
 */
function getAllRoadmapPhaseNumbers(content) {
  const lines = content.split('\n');
  const numbers = [];
  let inTable = false;
  let phaseColIndex = -1;

  for (const line of lines) {
    if (!inTable) {
      if (line.includes('|') && /Phase/i.test(line) && /Status/i.test(line)) {
        const cols = splitTableRow(line);
        phaseColIndex = cols.findIndex(c => /^Phase$/i.test(c));
        if (phaseColIndex !== -1) inTable = true;
      }
      continue;
    }
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) continue;
    if (!line.includes('|')) break;
    const cols = splitTableRow(line);
    if (cols.length > phaseColIndex) {
      const num = parseInt(normalizePhaseNum(cols[phaseColIndex]), 10);
      if (!isNaN(num)) numbers.push(num);
    }
  }

  return numbers.sort((a, b) => a - b);
}

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
        const output = {
          additionalContext: '[Roadmap Sync] Could not parse phase/status from STATE.md — ensure it contains **Phase**: and **Status**: fields.'
        };
        process.stdout.write(JSON.stringify(output));
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
        logHook('check-roadmap-sync', 'PostToolUse', 'warn', {
          reason: `phase ${stateInfo.phase} not found in ROADMAP.md table`
        });
        logEvent('workflow', 'roadmap-sync', {
          phase: stateInfo.phase,
          stateStatus: stateInfo.status,
          status: 'missing-phase'
        });
        const output = {
          additionalContext: `CRITICAL: Phase ${stateInfo.phase} has status "${stateInfo.status}" in STATE.md but is not listed in ROADMAP.md Progress table. Update the ROADMAP.md Progress table NOW before continuing. Run: \`node plugins/pbr/scripts/pbr-tools.js state load\` to check current state.`
        };
        process.stdout.write(JSON.stringify(output));
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
          additionalContext: `CRITICAL: ROADMAP.md out of sync — Phase ${stateInfo.phase} is "${roadmapStatus}" in ROADMAP.md but "${stateInfo.status}" in STATE.md. Update the ROADMAP.md Progress table NOW before continuing. Run: \`node plugins/pbr/scripts/pbr-tools.js state load\` to check current state.`
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
    } catch (e) {
      logHook('check-roadmap-sync', 'PostToolUse', 'error', { reason: 'parse failure in main', error: e.message });
      const output = {
        additionalContext: `[Roadmap Sync] Warning: Failed to parse STATE.md or ROADMAP.md — ${e.message}. Run /pbr:health to diagnose.`
      };
      process.stdout.write(JSON.stringify(output));
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
    return {
      output: {
        additionalContext: '[Roadmap Sync] Could not parse phase/status from STATE.md — ensure it contains **Phase**: and **Status**: fields.'
      }
    };
  }

  if (!LIFECYCLE_STATUSES.includes(stateInfo.status)) {
    logHook('check-roadmap-sync', 'PostToolUse', 'skip', {
      reason: `status "${stateInfo.status}" not a lifecycle status`
    });
    return null;
  }

  const roadmapStatus = getRoadmapPhaseStatus(roadmapContent, stateInfo.phase);
  if (!roadmapStatus) {
    logHook('check-roadmap-sync', 'PostToolUse', 'warn', {
      reason: `phase ${stateInfo.phase} not found in ROADMAP.md table`
    });
    logEvent('workflow', 'roadmap-sync', {
      phase: stateInfo.phase, stateStatus: stateInfo.status, status: 'missing-phase'
    });
    return {
      output: {
        additionalContext: `CRITICAL: Phase ${stateInfo.phase} has status "${stateInfo.status}" in STATE.md but is not listed in ROADMAP.md Progress table. Update the ROADMAP.md Progress table NOW before continuing. Run: \`node plugins/pbr/scripts/pbr-tools.js state load\` to check current state.`
      }
    };
  }

  if (roadmapStatus.toLowerCase() !== stateInfo.status) {
    logHook('check-roadmap-sync', 'PostToolUse', 'warn', {
      phase: stateInfo.phase, stateStatus: stateInfo.status, roadmapStatus
    });
    logEvent('workflow', 'roadmap-sync', {
      phase: stateInfo.phase, stateStatus: stateInfo.status, roadmapStatus, status: 'out-of-sync'
    });

    // Block on high-risk regressions, advise on non-critical drift
    if (isHighRisk(stateContent, roadmapContent)) {
      return {
        output: {
          decision: 'block',
          reason: `ROADMAP.md status regression detected — Phase ${stateInfo.phase} is "${stateInfo.status}" in STATE.md but would regress to "${roadmapStatus}" in ROADMAP.md. This is a high-risk change that could corrupt milestone tracking.`
        }
      };
    }

    return {
      output: {
        additionalContext: `CRITICAL: ROADMAP.md out of sync — Phase ${stateInfo.phase} is "${roadmapStatus}" in ROADMAP.md but "${stateInfo.status}" in STATE.md. Update the ROADMAP.md Progress table NOW before continuing. Run: \`node plugins/pbr/scripts/pbr-tools.js state load\` to check current state.`
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
  } catch (e) {
    logHook('check-roadmap-sync', 'PostToolUse', 'error', { reason: 'failed to read phases dir', error: e.message });
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

/**
 * Validate ROADMAP.md after a milestone is marked complete.
 * All phases in the roadmap table must be "Verified" or "Archived".
 * If the milestone section is already collapsed (contains "COMPLETED"), passes.
 *
 * @param {string} roadmapContent - ROADMAP.md content
 * @param {string} completedMilestone - Milestone identifier (e.g., "v1.0")
 * @returns {null|{decision: string, reason: string}} null if valid, blocking result if not
 */
function validatePostMilestone(roadmapContent, completedMilestone) {
  // If milestone section is already collapsed/completed, pass
  const collapsedPattern = new RegExp(`##\\s+Milestone\\s+${completedMilestone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*COMPLETED`, 'i');
  if (collapsedPattern.test(roadmapContent)) return null;

  // Parse all phase statuses from the table
  const lines = roadmapContent.split('\n');
  let inTable = false;
  let phaseColIndex = -1;
  let statusColIndex = -1;
  const unverified = [];

  for (const line of lines) {
    if (!inTable) {
      if (line.includes('|') && /Phase/i.test(line) && /Status/i.test(line)) {
        const cols = splitTableRow(line);
        phaseColIndex = cols.findIndex(c => /^Phase$/i.test(c));
        statusColIndex = cols.findIndex(c => /^Status$/i.test(c));
        if (phaseColIndex !== -1 && statusColIndex !== -1) inTable = true;
      }
      continue;
    }
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) continue;
    if (!line.includes('|')) break;

    const cols = splitTableRow(line);
    if (cols.length <= Math.max(phaseColIndex, statusColIndex)) continue;

    const phaseNum = normalizePhaseNum(cols[phaseColIndex]);
    const status = cols[statusColIndex].toLowerCase().trim();

    if (status !== 'verified' && status !== 'archived') {
      unverified.push({ phase: phaseNum, status });
    }
  }

  if (unverified.length > 0) {
    const details = unverified.map(u => `Phase ${u.phase} (${u.status})`).join(', ');
    return {
      decision: 'block',
      reason: `Cannot complete milestone ${completedMilestone} — unverified phases: ${details}. All phases must be Verified or Archived before milestone completion.`
    };
  }

  return null;
}

module.exports = { parseState, getRoadmapPhaseStatus, checkSync, parseRoadmapPhases, checkFilesystemDrift, isHighRisk, validatePostMilestone };
if (require.main === module || process.argv[1] === __filename) { main(); }

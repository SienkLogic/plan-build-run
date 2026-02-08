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

        const output = {
          message: `ROADMAP.md out of sync: Phase ${stateInfo.phase} is "${roadmapStatus}" in ROADMAP.md but "${stateInfo.status}" in STATE.md. Update the Phase Overview table in ROADMAP.md to match.`
        };
        process.stdout.write(JSON.stringify(output));
      } else {
        logHook('check-roadmap-sync', 'PostToolUse', 'pass', {
          phase: stateInfo.phase,
          status: stateInfo.status
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

/** Normalize "03" → "3", "3.1" → "3.1" */
function normalizePhaseNum(raw) {
  const s = raw.replace(/^0+/, '');
  return s || '0';
}

module.exports = { parseState, getRoadmapPhaseStatus };
main();

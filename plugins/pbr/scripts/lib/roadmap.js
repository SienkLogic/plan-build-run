/**
 * lib/roadmap.js — ROADMAP.md operations for Plan-Build-Run tools.
 *
 * Handles parsing and updating the ROADMAP.md phase overview table.
 */

const fs = require('fs');
const path = require('path');
const { lockedFileUpdate, validateStatusTransition } = require('./core');

// --- Parsers ---

function parseRoadmapMd(content) {
  const result = { phases: [], has_progress_table: false };

  // Find Phase Overview table
  const overviewMatch = content.match(/## Phase Overview[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
  if (overviewMatch) {
    const rows = overviewMatch[0].split('\n').filter(r => r.includes('|'));
    // Skip header and separator rows
    for (let i = 2; i < rows.length; i++) {
      const cols = rows[i].split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        result.phases.push({
          number: cols[0],
          name: cols[1],
          goal: cols[2],
          plans: cols[3] || '',
          wave: cols[4] || '',
          status: cols[5] || 'pending'
        });
      }
    }
  }

  // Check for Progress table
  result.has_progress_table = /## Progress/.test(content);

  return result;
}

// --- Table helpers ---

/**
 * Find the row index of a phase in a ROADMAP.md table.
 * @returns {number} Line index or -1 if not found
 */
function findRoadmapRow(lines, phaseNum) {
  const paddedPhase = phaseNum.padStart(2, '0');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const parts = lines[i].split('|');
    if (parts.length < 3) continue;
    const phaseCol = parts[1] ? parts[1].trim() : '';
    if (phaseCol === paddedPhase) {
      return i;
    }
  }
  return -1;
}

/**
 * Update a specific column in a markdown table row.
 * @param {string} row - The full table row string (e.g., "| 01 | Setup | ... |")
 * @param {number} columnIndex - 0-based column index (Phase=0, Name=1, ..., Status=5)
 * @param {string} newValue - New cell value
 * @returns {string} Updated row
 */
function updateTableRow(row, columnIndex, newValue) {
  const parts = row.split('|');
  // parts[0] is empty (before first |), data starts at parts[1]
  const partIndex = columnIndex + 1;
  if (partIndex < parts.length) {
    parts[partIndex] = ` ${newValue} `;
  }
  return parts.join('|');
}

// --- Mutation commands ---

/**
 * Update the Status column for a phase in ROADMAP.md's Phase Overview table.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} newStatus - New status value
 * @param {string} [planningDir] - Path to .planning directory
 */
function roadmapUpdateStatus(phaseNum, newStatus, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldStatus = null;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content; // No matching row found
    }
    const parts = lines[rowIdx].split('|');
    oldStatus = parts[6] ? parts[6].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 5, newStatus);
    return lines.join('\n');
  });

  if (!oldStatus) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  // Advisory transition validation — warn on suspicious transitions but don't block
  const transition = validateStatusTransition(oldStatus, newStatus);
  if (!transition.valid && transition.warning) {
    process.stderr.write(`[pbr-tools] WARNING: ${transition.warning}\n`);
  }

  if (result.success) {
    const response = { success: true, old_status: oldStatus, new_status: newStatus };
    if (!transition.valid) {
      response.transition_warning = transition.warning;
    }
    return response;
  }
  return { success: false, error: result.error };
}

/**
 * Update the Plans column for a phase in ROADMAP.md's Phase Overview table.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} complete - Completed plan count
 * @param {string} total - Total plan count
 * @param {string} [planningDir] - Path to .planning directory
 */
function roadmapUpdatePlans(phaseNum, complete, total, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldPlans = null;
  const newPlans = `${complete}/${total}`;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content;
    }
    const parts = lines[rowIdx].split('|');
    oldPlans = parts[4] ? parts[4].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 3, newPlans);
    return lines.join('\n');
  });

  if (!oldPlans) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  if (result.success) {
    return { success: true, old_plans: oldPlans, new_plans: newPlans };
  }
  return { success: false, error: result.error };
}

module.exports = {
  parseRoadmapMd,
  findRoadmapRow,
  updateTableRow,
  roadmapUpdateStatus,
  roadmapUpdatePlans
};

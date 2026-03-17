#!/usr/bin/env node

/**
 * Pre-research trigger module.
 *
 * At 70%+ phase completion during SessionStart, emits a background
 * research signal for the next phase. Uses idempotent signal files
 * (.planning/.pre-research-{NN}) to ensure the advisory fires once.
 *
 * Pure advisory — no blocking, no side effects beyond signal file.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse STATE.md frontmatter for current phase, progress, and status.
 * @param {string} content - STATE.md content
 * @returns {{ current_phase: number, progress_percent: number, status: string }}
 */
function parseStateFrontmatter(content) {
  const result = { current_phase: 0, progress_percent: 0, status: '' };
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return result;

  const fm = fmMatch[1];
  const phaseMatch = fm.match(/current_phase:\s*(\d+)/);
  if (phaseMatch) result.current_phase = parseInt(phaseMatch[1], 10);

  const progressMatch = fm.match(/progress_percent:\s*(\d+)/);
  if (progressMatch) result.progress_percent = parseInt(progressMatch[1], 10);

  const statusMatch = fm.match(/status:\s*"?(\w+)"?/);
  if (statusMatch) result.status = statusMatch[1];

  return result;
}

/**
 * Find the name of a phase from ROADMAP.md checklist.
 * Looks for: - [ ] Phase N: Name  or  ### Phase N: Name
 * @param {string} content - ROADMAP.md content
 * @param {number} phaseNum - Phase number to find
 * @returns {string|null} Phase name or null
 */
function findPhaseName(content, phaseNum) {
  // Try checklist format first: - [ ] Phase N: Name
  const checkRegex = new RegExp(`- \\[[ x]\\] Phase ${phaseNum}:\\s*(.+)`, 'i');
  const checkMatch = content.match(checkRegex);
  if (checkMatch) return checkMatch[1].trim();

  // Try heading format: ### Phase N: Name
  const headingRegex = new RegExp(`### Phase ${phaseNum}:\\s*(.+)`, 'i');
  const headingMatch = content.match(headingRegex);
  if (headingMatch) return headingMatch[1].trim();

  return null;
}

/**
 * Check if the current phase is far enough along to trigger pre-research
 * for the next phase. Returns an advisory object or null.
 *
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @param {object} config - Loaded config object
 * @returns {{ nextPhase: number, name: string, command: string } | null}
 */
function checkPreResearch(planningDir, config) {
  // Feature gate
  if (config && config.features && config.features.pre_research === false) {
    return null;
  }

  // Read STATE.md
  const statePath = path.join(planningDir, 'STATE.md');
  let stateContent;
  try {
    stateContent = fs.readFileSync(statePath, 'utf8');
  } catch (_e) {
    return null;
  }

  const state = parseStateFrontmatter(stateContent);

  // Skip if phase is already verified/complete
  if (state.status === 'verified' || state.status === 'complete') {
    return null;
  }

  // Skip if progress below threshold
  if (state.progress_percent < 70) {
    return null;
  }

  // Compute next phase number
  const nextPhase = state.current_phase + 1;

  // Check signal file for idempotency
  const paddedNext = String(nextPhase).padStart(2, '0');
  const signalPath = path.join(planningDir, `.pre-research-${paddedNext}`);
  if (fs.existsSync(signalPath)) {
    return null;
  }

  // Read ROADMAP.md to check if next phase exists
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  let roadmapContent;
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
  } catch (_e) {
    return null;
  }

  const phaseName = findPhaseName(roadmapContent, nextPhase);
  if (!phaseName) {
    return null;
  }

  // Write signal file to prevent re-triggering
  try {
    fs.writeFileSync(signalPath, new Date().toISOString(), 'utf8');
  } catch (_e) {
    // Non-fatal — advisory still works, just won't be idempotent
  }

  return {
    nextPhase,
    name: phaseName,
    command: `/pbr:explore ${nextPhase}`
  };
}

module.exports = { checkPreResearch };

'use strict';

/**
 * Shared helpers for gate modules.
 * Centralizes repeated .active-skill reads and STATE.md phase parsing.
 */

const fs = require('fs');
const path = require('path');
const { resolveSessionPath } = require('../core');

/**
 * Read the current .active-skill value.
 * Returns the trimmed string, or null if the file doesn't exist or can't be read.
 * @param {string} planningDir - path to .planning directory
 * @param {string|null} [sessionId] - session identifier for session-scoped path
 * @returns {string|null}
 */
function readActiveSkill(planningDir, sessionId) {
  // Check .session.json first (consistent with check-subagent-output.js and log-subagent.js)
  try {
    const { sessionLoad } = require('../../pbr-tools');
    const session = sessionLoad(planningDir, sessionId);
    if (session && session.activeSkill) return session.activeSkill;
  } catch (_e) { /* pbr-tools unavailable */ }
  // Fall back to .active-skill file (session-scoped when sessionId available)
  try {
    const skillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    return fs.readFileSync(skillPath, 'utf8').trim();
  } catch (_e) {
    return null;
  }
}

/**
 * Parse STATE.md for the current phase string (zero-padded, e.g. "01").
 * Returns the padded phase string, or null if not found.
 * @param {string} planningDir - path to .planning directory
 * @returns {string|null}
 */
function readCurrentPhase(planningDir) {
  try {
    const state = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)/);
    if (!phaseMatch) return null;
    return phaseMatch[1].padStart(2, '0');
  } catch (_e) {
    return null;
  }
}

/**
 * Parse STATE.md for the current phase as an integer.
 * Checks frontmatter current_phase first, then falls back to body Phase: line.
 * Returns the integer, or null if not found.
 * @param {string} planningDir - path to .planning directory
 * @returns {number|null}
 */
function readCurrentPhaseInt(planningDir) {
  try {
    const state = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    const fmMatch = state.match(/current_phase:\s*(\d+)/);
    if (fmMatch) return parseInt(fmMatch[1], 10);
    const bodyMatch = state.match(/Phase:\s*(\d+)/);
    if (bodyMatch) return parseInt(bodyMatch[1], 10);
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * All valid phase status values in the 13-state lifecycle (+ legacy aliases).
 * Gates can use this to validate or map status values.
 */
const VALID_PHASE_STATUSES = [
  'not_started', 'discussed', 'ready_to_plan', 'planning',
  'planned', 'ready_to_execute', 'building', 'built',
  'partial', 'verified', 'needs_fixes', 'complete', 'skipped',
  // Legacy aliases
  'pending', 'reviewed', 'milestone_complete'
];

/** Map legacy status aliases to their canonical equivalents. */
const STATUS_ALIASES = {
  pending: 'not_started',
  reviewed: 'verified'
};

/**
 * Read and normalize the current status from STATE.md.
 * Checks frontmatter status: first, then falls back to body Status: line.
 * Resolves legacy aliases to canonical values.
 * @param {string} planningDir - path to .planning directory
 * @returns {string|null} Canonical status value, or null if not found
 */
function readCurrentStatus(planningDir) {
  try {
    const state = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    // Try frontmatter first
    const fmMatch = state.match(/^status:\s*["']?([a-z_]+)["']?/m);
    let status = null;
    if (fmMatch) {
      status = fmMatch[1].trim();
    } else {
      // Fall back to body Status: line
      const bodyMatch = state.match(/^Status:\s*(\S+)/m);
      if (bodyMatch) {
        status = bodyMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
      }
    }
    if (!status) return null;
    // Resolve legacy aliases
    return STATUS_ALIASES[status] || status;
  } catch (_e) {
    return null;
  }
}

/**
 * Detect whether a PLAN*.md file has speculative: true in its frontmatter.
 * Speculative plans are created for future phases and must not trigger validation gates.
 * @param {string} filePath - absolute path to the PLAN file
 * @returns {boolean}
 */
function isPlanSpeculative(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.startsWith('---')) return false;
    const endIdx = content.indexOf('---', 3);
    if (endIdx === -1) return false;
    const frontmatter = content.substring(3, endIdx);
    return /^\s*speculative\s*:\s*true\s*$/m.test(frontmatter);
  } catch (_e) {
    return false;
  }
}

module.exports = { readActiveSkill, readCurrentPhase, readCurrentPhaseInt, readCurrentStatus, VALID_PHASE_STATUSES, STATUS_ALIASES, isPlanSpeculative };

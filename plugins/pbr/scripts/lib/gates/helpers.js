'use strict';

/**
 * Shared helpers for gate modules.
 * Centralizes repeated .active-skill reads and STATE.md phase parsing.
 */

const fs = require('fs');
const path = require('path');

/**
 * Read the current .active-skill value.
 * Returns the trimmed string, or null if the file doesn't exist or can't be read.
 * @param {string} planningDir - path to .planning directory
 * @returns {string|null}
 */
function readActiveSkill(planningDir) {
  try {
    return fs.readFileSync(path.join(planningDir, '.active-skill'), 'utf8').trim();
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

module.exports = { readActiveSkill, readCurrentPhase, readCurrentPhaseInt };

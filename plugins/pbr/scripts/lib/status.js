// lib/status.js — Phase status transition validation for Plan-Build-Run tools.

const { VALID_STATUS_TRANSITIONS } = require('./constants');

/**
 * Check whether a phase status transition is valid according to the state machine.
 * Returns { valid, warning? } — never blocks, only advises.
 *
 * @param {string} oldStatus - Current phase status
 * @param {string} newStatus - Desired phase status
 * @returns {{ valid: boolean, warning?: string }}
 */
function validateStatusTransition(oldStatus, newStatus) {
  const from = (oldStatus || '').trim().toLowerCase();
  const to = (newStatus || '').trim().toLowerCase();

  if (from === to) return { valid: true };

  if (!VALID_STATUS_TRANSITIONS[from]) return { valid: true };

  const allowed = VALID_STATUS_TRANSITIONS[from];
  if (allowed.includes(to)) return { valid: true };

  return {
    valid: false,
    warning: `Suspicious status transition: "${from}" -> "${to}". Expected one of: [${allowed.join(', ')}]. Proceeding anyway (advisory).`
  };
}

module.exports = { validateStatusTransition };

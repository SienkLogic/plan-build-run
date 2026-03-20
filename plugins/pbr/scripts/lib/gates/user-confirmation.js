'use strict';

/**
 * Gate: user confirmation check for config-driven operations.
 * When an active skill performs a gated operation (e.g., milestone complete),
 * checks whether the AskUserQuestion signal file exists. If not, blocks or warns.
 *
 * Config: gates.user_confirmation.{operation_name} = { requires: "askuser", blocking: true|false }
 * Signal: .planning/.user-gate-passed (written by track-user-gates.js on AskUserQuestion)
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill } = require('./helpers');

/**
 * Map active skill + task description to a known operation name.
 * @param {string|null} skill - active skill name
 * @param {string} description - task/tool description
 * @returns {string|null} operation name or null if no match
 */
function resolveOperation(skill, description) {
  if (skill === 'milestone') {
    if (/complete/i.test(description)) return 'milestone_complete';
    if (/archive/i.test(description)) return 'milestone_archive';
  }
  if (skill === 'health') {
    if (/fix|autofix|auto-fix/i.test(description)) return 'health_autofix';
  }
  if (skill === 'import') return 'import_approval';
  if (/skip.*phase|phase.*skip/i.test(description)) return 'phase_skip';
  return null;
}

/**
 * Check whether the current operation requires user confirmation.
 * Returns { block: true, reason } to block, { block: false, warning } to warn,
 * or null if the gate does not apply.
 *
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason?: string, warning?: string }|null}
 */
function checkUserConfirmationGate(data) {
  const toolInput = data.tool_input || {};
  const description = toolInput.description || '';

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Not a PBR project
  if (!fs.existsSync(planningDir)) return null;

  // Read active skill
  const activeSkill = readActiveSkill(planningDir);

  // Load config
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
  } catch (_e) {
    return null;
  }

  const userConfirmation = (config.gates && config.gates.user_confirmation) || {};

  // Determine operation
  const operationName = resolveOperation(activeSkill, description);
  if (!operationName) return null;

  // Look up gate config
  const gate = userConfirmation[operationName];
  if (!gate) return null;
  if (gate.requires !== 'askuser') return null;

  // Check signal file
  const signalPath = path.join(planningDir, '.user-gate-passed');
  if (fs.existsSync(signalPath)) return null;

  // Gate not satisfied
  if (gate.blocking === true) {
    return {
      block: true,
      reason: `Operation '${operationName}' requires user confirmation.\n\nThis operation is configured in gates.user_confirmation to require an AskUserQuestion call before proceeding. The .user-gate-passed signal file was not found.\n\nEnsure the skill calls AskUserQuestion before this operation, or remove the gate from .planning/config.json gates.user_confirmation.${operationName}.`
    };
  }

  return {
    block: false,
    warning: `Operation '${operationName}' should include user confirmation via AskUserQuestion.`
  };
}

module.exports = { checkUserConfirmationGate, resolveOperation };

'use strict';

/**
 * Gate: review planner VERIFICATION.md check.
 * When active skill is "review" and pbr:planner is spawned, verify
 * that a VERIFICATION.md exists in the current phase directory.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill, readCurrentPhase } = require('./helpers');

/**
 * Blocking check: when the active skill is "review" and a planner is being
 * spawned, verify that a VERIFICATION.md exists in the current phase directory.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkReviewPlannerGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:planner
  if (subagentType !== 'pbr:planner') return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only gate when active skill is "review"
  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'review') return null;

  // Read STATE.md for current phase
  const currentPhase = readCurrentPhase(planningDir);
  if (!currentPhase) return null;

  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) return null;

    const phaseDir = path.join(phasesDir, dirs[0]);
    const hasVerification = fs.existsSync(path.join(phaseDir, 'VERIFICATION.md'));

    if (!hasVerification) {
      return {
        block: true,
        reason: 'Review planner gate: cannot spawn planner without VERIFICATION.md.\n\nGap closure requires an existing VERIFICATION.md to identify which gaps need closing. Without it, the planner has no input.\n\nRun /pbr:review {N} to create VERIFICATION.md first.'
      };
    }
  } catch (_e) {
    return null;
  }

  return null;
}

module.exports = { checkReviewPlannerGate };

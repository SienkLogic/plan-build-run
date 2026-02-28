'use strict';

/**
 * Gate: review verifier SUMMARY.md check.
 * When active skill is "review" and pbr:verifier is spawned, verify
 * that a SUMMARY*.md exists in the current phase directory.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill, readCurrentPhase } = require('./helpers');

/**
 * Blocking check: when the active skill is "review" and a verifier is being
 * spawned, verify that a SUMMARY*.md exists in the current phase directory.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkReviewVerifierGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:verifier
  if (subagentType !== 'pbr:verifier') return null;

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
    const files = fs.readdirSync(phaseDir);
    const hasSummary = files.some(f => {
      if (!/^SUMMARY/i.test(f)) return false;
      try {
        return fs.statSync(path.join(phaseDir, f)).size > 0;
      } catch (_e) {
        return false;
      }
    });

    if (!hasSummary) {
      return {
        block: true,
        reason: 'Review verifier gate: cannot spawn verifier without SUMMARY.md.\n\nThe verifier checks executor output against the plan. Without a SUMMARY.md, there is nothing to verify.\n\nRun /pbr:build {N} to create SUMMARY.md first.'
      };
    }
  } catch (_e) {
    return null;
  }

  return null;
}

module.exports = { checkReviewVerifierGate };

'use strict';

/**
 * Gate: quick executor PLAN.md check.
 * When active skill is "quick" and pbr:executor is spawned, verify
 * that at least one .planning/quick/{NNN}-{slug}/PLAN.md exists.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill } = require('./helpers');

/**
 * Blocking check: when the active skill is "quick" and an executor is being
 * spawned, verify that at least one .planning/quick/{NNN}-{slug}/PLAN.md exists.
 * Returns { block: true, reason: "..." } if the executor should be blocked,
 * or null if it's OK to proceed.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkQuickExecutorGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only gate when active skill is "quick"
  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'quick') return null;

  // Check for any PLAN.md in .planning/quick/*/
  const quickDir = path.join(planningDir, 'quick');
  if (!fs.existsSync(quickDir)) {
    return {
      block: true,
      reason: 'Cannot spawn executor: .planning/quick/ directory does not exist.\n\nThe quick skill must create the task directory and PLAN.md before an executor can run (Steps 4-6).\n\nRe-run /pbr:quick to create the quick task directory and PLAN.md.'
    };
  }

  try {
    const dirs = fs.readdirSync(quickDir).filter(d => {
      return /^\d{3}-/.test(d) && fs.statSync(path.join(quickDir, d)).isDirectory();
    });

    // Look for the most recent quick task dir that has a PLAN.md
    const hasPlan = dirs.some(d => {
      const planFile = path.join(quickDir, d, 'PLAN.md');
      try {
        const stat = fs.statSync(planFile);
        return stat.size > 0;
      } catch (_e) {
        return false;
      }
    });

    if (!hasPlan) {
      return {
        block: true,
        reason: 'Cannot spawn executor: no PLAN.md found in any .planning/quick/*/ directory.\n\nThe quick skill must write a non-empty PLAN.md inside .planning/quick/{NNN}-{slug}/ before an executor can run (Steps 4-6).\n\nRe-run /pbr:quick to create the quick task directory and PLAN.md.'
      };
    }
  } catch (_e) {
    return {
      block: true,
      reason: 'Cannot spawn executor: failed to read .planning/quick/ directory.\n\nThe directory exists but could not be read, possibly due to a permissions issue or filesystem error.\n\nRe-run /pbr:quick to recreate the quick task directory and PLAN.md.'
    };
  }

  return null;
}

module.exports = { checkQuickExecutorGate };

'use strict';

/**
 * Gate: plan skill executor block.
 * The plan skill should never spawn executors.
 */

const path = require('path');
const { readActiveSkill } = require('./helpers');

/**
 * Blocking check: when the active skill is "plan", block executor spawning.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkPlanExecutorGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'plan') return null;

  return {
    block: true,
    reason: 'Plan skill cannot spawn executors.\n\nThe plan skill creates plans; the build skill executes them. Spawning an executor from the plan skill violates the separation of concerns.\n\nRun /pbr:build to execute plans instead.'
  };
}

module.exports = { checkPlanExecutorGate };

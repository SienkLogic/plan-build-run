'use strict';

/**
 * Gate: build executor PLAN.md check.
 * When active skill is "build" and pbr:executor is spawned, verify
 * that a PLAN*.md exists in the current phase directory.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill, readCurrentPhase } = require('./helpers');

/**
 * Blocking check: when the active skill is "build" and an executor is being
 * spawned, verify that a PLAN*.md exists in the current phase directory.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkBuildExecutorGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only gate when active skill is "build"
  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'build') return null;

  // Read STATE.md for current phase
  const currentPhase = readCurrentPhase(planningDir);
  if (!currentPhase) return null;

  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) {
      return {
        block: true,
        reason: 'Cannot spawn executor: .planning/phases/ directory does not exist.\n\nThe build skill requires a phases directory with at least one PLAN.md before an executor can run.\n\nRun /pbr:plan {N} to create plans first.'
      };
    }

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) {
      return {
        block: true,
        reason: `Cannot spawn executor: no phase directory found for phase ${currentPhase}.\n\nThe build skill needs a phase directory (e.g., .planning/phases/${currentPhase}-slug/) containing PLAN.md files.\n\nRun /pbr:plan ${currentPhase} to create plans first.`
      };
    }

    const phaseDir = path.join(phasesDir, dirs[0]);
    const files = fs.readdirSync(phaseDir);
    const hasPlan = files.some(f => {
      if (!/^PLAN.*\.md$/i.test(f)) return false;
      try {
        return fs.statSync(path.join(phaseDir, f)).size > 0;
      } catch (_e) {
        return false;
      }
    });

    if (!hasPlan) {
      return {
        block: true,
        reason: `Cannot spawn executor: no PLAN.md found in .planning/phases/${dirs[0]}/.\n\nThe phase directory exists but contains no PLAN.md files. The executor needs at least one non-empty PLAN.md to work from.\n\nRun /pbr:plan ${currentPhase} to create plans first.`
      };
    }
  } catch (_e) {
    return null;
  }

  return null;
}

module.exports = { checkBuildExecutorGate };

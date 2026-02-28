'use strict';

/**
 * Gate: build dependency verification check.
 * When active skill is "build" and pbr:executor is spawned, verify
 * that dependent phases (from ROADMAP.md) have VERIFICATION.md.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill, readCurrentPhase } = require('./helpers');

/**
 * Blocking check: when the active skill is "build" and an executor is being
 * spawned, verify that dependent phases (from ROADMAP.md) have VERIFICATION.md.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkBuildDependencyGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only gate when active skill is "build"
  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'build') return null;

  // Read STATE.md for current phase (as integer for roadmap matching)
  let currentPhase;
  try {
    const state = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)/);
    if (!phaseMatch) return null;
    currentPhase = parseInt(phaseMatch[1], 10);
  } catch (_e) {
    return null;
  }

  // Read ROADMAP.md, find current phase section, check dependencies
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  try {
    const roadmap = fs.readFileSync(roadmapFile, 'utf8');

    // Find ### Phase N: section
    const phaseRegex = new RegExp(`### Phase ${currentPhase}:[\\s\\S]*?(?=### Phase \\d|$)`);
    const phaseSection = roadmap.match(phaseRegex);
    if (!phaseSection) return null;

    // Look for **Depends on:** line
    const depMatch = phaseSection[0].match(/\*\*Depends on:\*\*\s*(.*)/);
    if (!depMatch) return null;

    const depLine = depMatch[1].trim();
    if (!depLine || /^none$/i.test(depLine)) return null;

    // Parse phase numbers from "Phase 1", "Phase 1, Phase 2", etc.
    const depPhases = [];
    const depRegex = /Phase\s+(\d+)/gi;
    let match;
    while ((match = depRegex.exec(depLine)) !== null) {
      depPhases.push(parseInt(match[1], 10));
    }

    if (depPhases.length === 0) return null;

    // Check each dependent phase has VERIFICATION.md
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    for (const depPhase of depPhases) {
      const paddedPhase = String(depPhase).padStart(2, '0');
      const pDirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + '-'));
      if (pDirs.length === 0) {
        return {
          block: true,
          reason: `Build dependency gate: dependent phase ${paddedPhase} lacks VERIFICATION.md.\n\nPhase ${currentPhase} depends on phase ${paddedPhase}, which must be verified before building can proceed.\n\nRun /pbr:review ${paddedPhase} to verify the dependency phase first.`
        };
      }
      const hasVerification = fs.existsSync(path.join(phasesDir, pDirs[0], 'VERIFICATION.md'));
      if (!hasVerification) {
        return {
          block: true,
          reason: `Build dependency gate: dependent phase ${paddedPhase} lacks VERIFICATION.md.\n\nPhase ${currentPhase} depends on phase ${paddedPhase}, which must be verified before building can proceed.\n\nRun /pbr:review ${paddedPhase} to verify the dependency phase first.`
        };
      }
    }
  } catch (_e) {
    return null;
  }

  return null;
}

module.exports = { checkBuildDependencyGate };

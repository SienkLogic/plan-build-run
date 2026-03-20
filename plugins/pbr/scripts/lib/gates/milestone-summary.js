'use strict';

/**
 * Gate: milestone complete SUMMARY.md check.
 * When active skill is "milestone" and a general/planner agent is spawned
 * for a "complete" operation, verify all milestone phases have SUMMARY.md.
 *
 * This mirrors milestone-complete.cjs (which checks VERIFICATION.md) to
 * close the enforcement gap where SUMMARY.md was only advisory.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill, readCurrentPhaseInt } = require('./helpers');

/**
 * Blocking check: when the active skill is "milestone" and a general/planner agent
 * is being spawned for a "complete" operation, verify all milestone phases have SUMMARY.md.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkMilestoneSummaryGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';
  const description = toolInput.description || '';

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only gate when active skill is "milestone"
  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'milestone') return null;

  // Only gate pbr:general and pbr:planner
  if (subagentType !== 'pbr:general' && subagentType !== 'pbr:planner') return null;

  // Only gate "complete" operations
  if (!/complete/i.test(description)) return null;

  // Read STATE.md for current phase
  const currentPhase = readCurrentPhaseInt(planningDir);
  if (!currentPhase) return null;

  // Read ROADMAP.md and find the milestone containing the current phase
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  try {
    const roadmap = fs.readFileSync(roadmapFile, 'utf8');

    // Split into milestone sections
    const milestoneSections = roadmap.split(/^## Milestone:/m).slice(1);

    for (const section of milestoneSections) {
      // Parse phase numbers from table rows
      const phaseNumbers = [];
      const tableRowRegex = /^\|\s*(\d+)\s*\|/gm;
      let match;
      while ((match = tableRowRegex.exec(section)) !== null) {
        phaseNumbers.push(parseInt(match[1], 10));
      }

      // Fallback: parse from **Phases:** line or ### Phase NN: headings
      if (phaseNumbers.length === 0) {
        const phasesLineMatch = section.match(/\*\*Phases:\*\*\s*([\d,\s-]+)/);
        if (phasesLineMatch) {
          const nums = phasesLineMatch[1].match(/\d+/g);
          if (nums) nums.forEach(n => phaseNumbers.push(parseInt(n, 10)));
        }
      }
      if (phaseNumbers.length === 0) {
        const headingRegex = /^###\s+Phase\s+(\d+):/gm;
        let hMatch;
        while ((hMatch = headingRegex.exec(section)) !== null) {
          phaseNumbers.push(parseInt(hMatch[1], 10));
        }
      }

      // Check if current phase is in this milestone
      if (!phaseNumbers.includes(currentPhase)) continue;

      // Found the right milestone — check all phases have SUMMARY.md
      const phasesDir = path.join(planningDir, 'phases');
      if (!fs.existsSync(phasesDir)) return null;

      for (const phaseNum of phaseNumbers) {
        const paddedPhase = String(phaseNum).padStart(2, '0');
        const pDirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + '-'));
        if (pDirs.length === 0) continue; // Phase dir missing is caught by milestone-complete gate

        const phaseDir = path.join(phasesDir, pDirs[0]);
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
            reason: `Milestone SUMMARY gate: phase ${paddedPhase} (${pDirs[0]}) lacks SUMMARY.md.\n\nAll milestone phases must have SUMMARY.md before the milestone can be completed. This file is created by the executor agent during /pbr:build.\n\nRun /pbr:execute-phase ${paddedPhase} to build this phase and create SUMMARY.md.`
          };
        }
      }

      // All phases have SUMMARY.md
      return null;
    }
  } catch (_e) {
    return null;
  }

  return null;
}

module.exports = { checkMilestoneSummaryGate };

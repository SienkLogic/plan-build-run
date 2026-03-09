'use strict';

/**
 * Gate: milestone complete verification check.
 * When active skill is "milestone" and a general/planner agent is spawned
 * for a "complete" operation, verify all milestone phases have VERIFICATION.md.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill, readCurrentPhaseInt } = require('./helpers');

/**
 * Parse VERIFICATION.md frontmatter to extract status field.
 * Returns the status string or 'unknown' if not parseable.
 * @param {string} filePath - path to VERIFICATION.md
 * @returns {string}
 */
function getVerificationStatus(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return 'unknown';
    const statusMatch = fmMatch[1].match(/^status:\s*(\S+)/m);
    return statusMatch ? statusMatch[1] : 'unknown';
  } catch (_e) {
    return 'unknown';
  }
}

/**
 * Blocking check: when the active skill is "milestone" and a general/planner agent
 * is being spawned for a "complete" operation, verify all milestone phases have VERIFICATION.md.
 * Returns { block: true, reason: "..." } if blocked, or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|null}
 */
function checkMilestoneCompleteGate(data) {
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

      // Check if current phase is in this milestone
      if (!phaseNumbers.includes(currentPhase)) continue;

      // Found the right milestone — check all phases have VERIFICATION.md
      const phasesDir = path.join(planningDir, 'phases');
      if (!fs.existsSync(phasesDir)) return null;

      for (const phaseNum of phaseNumbers) {
        const paddedPhase = String(phaseNum).padStart(2, '0');
        const pDirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + '-'));
        if (pDirs.length === 0) {
          return {
            block: true,
            reason: `Milestone complete gate: phase ${paddedPhase} directory not found.\n\nAll milestone phases must exist and have a passing VERIFICATION.md before the milestone can be completed.\n\nRun /pbr:review ${paddedPhase} to verify the phase (it must reach status: passed).`
          };
        }
        const verificationFile = path.join(phasesDir, pDirs[0], 'VERIFICATION.md');
        const hasVerification = fs.existsSync(verificationFile);
        if (!hasVerification) {
          return {
            block: true,
            reason: `Milestone complete gate: phase ${paddedPhase} (${pDirs[0]}) lacks VERIFICATION.md.\n\nAll milestone phases must have a passing VERIFICATION.md before the milestone can be completed.\n\nRun /pbr:review ${paddedPhase} to verify the phase (it must reach status: passed).`
          };
        }
        const verStatus = getVerificationStatus(verificationFile);
        if (verStatus === 'gaps_found') {
          return {
            block: true,
            reason: `Milestone complete gate: phase ${paddedPhase} VERIFICATION.md has status: gaps_found.\n\nAll gaps must be closed before the milestone can be completed. The verifier found issues that need resolution.\n\nRun /pbr:review ${paddedPhase} to close gaps (phase must reach status: passed).`
          };
        }
      }

      // All phases verified
      return null;
    }
  } catch (_e) {
    return null;
  }

  return null;
}

module.exports = { checkMilestoneCompleteGate, getVerificationStatus };

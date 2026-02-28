'use strict';

/**
 * Advisory checks for validate-task.
 * These return warning strings rather than blocking the tool call.
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill } = require('./helpers');

/**
 * Advisory check: when pbr:debugger is spawned and .active-skill is 'debug',
 * warn if .planning/debug/ directory does not exist.
 * Returns a warning string or null.
 * @param {object} data - hook data with tool_input
 * @returns {string|null}
 */
function checkDebuggerAdvisory(data) {
  const subagentType = data.tool_input?.subagent_type || '';
  if (subagentType !== 'pbr:debugger') return null;

  // Only advise when spawned from the debug skill
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'debug') return null;

  const debugDir = path.join(planningDir, 'debug');
  if (!fs.existsSync(debugDir)) {
    return 'Debugger advisory: .planning/debug/ does not exist. Create it before spawning the debugger so output has a target location.';
  }
  return null;
}

/**
 * Advisory check: when pbr:executor is spawned in build context,
 * warn if .checkpoint-manifest.json is missing from the phase directory.
 * Returns a warning string or null.
 * @param {object} data - hook data with tool_input
 * @returns {string|null}
 */
function checkCheckpointManifest(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'build') return null;

  // Find current phase dir
  const stateFile = path.join(planningDir, 'STATE.md');
  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
    if (!phaseMatch) return null;

    const currentPhase = phaseMatch[1].padStart(2, '0');
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) return null;

    const phaseDir = path.join(phasesDir, dirs[0]);
    const manifestFile = path.join(phaseDir, '.checkpoint-manifest.json');
    if (!fs.existsSync(manifestFile)) {
      return 'Build advisory: .checkpoint-manifest.json not found in phase directory. The build skill should write this before spawning executors. To fix: Run /pbr:health to regenerate checkpoint manifest.';
    }
  } catch (_e) {
    return null;
  }

  return null;
}

/**
 * Advisory check: when any pbr:* agent is being spawned, warn if
 * .planning/.active-skill doesn't exist. Without this file, all
 * skill-specific enforcement is silently disabled.
 * Returns a warning string or null.
 * @param {object} data - hook data with tool_input
 * @returns {string|null}
 */
function checkActiveSkillIntegrity(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  if (typeof subagentType !== 'string' || !subagentType.startsWith('pbr:')) return null;

  // Advisory agents that run without an active skill context — exempt from .active-skill checks
  const EXEMPT_AGENTS = ['pbr:researcher', 'pbr:synthesizer', 'pbr:audit', 'pbr:dev-sync', 'pbr:general'];
  if (EXEMPT_AGENTS.includes(subagentType)) return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only check if .planning/ exists (PBR project)
  if (!fs.existsSync(planningDir)) return null;

  const activeSkillFile = path.join(planningDir, '.active-skill');
  if (!fs.existsSync(activeSkillFile)) {
    return 'Active-skill integrity: .planning/.active-skill not found. Skill-specific enforcement is disabled. The invoking skill should write this file. To fix: Wait for the current skill to finish, or delete .planning/.active-skill if stale.';
  }

  // Stale lock detection: warn if .active-skill is older than 2 hours
  try {
    const stat = fs.statSync(activeSkillFile);
    const ageMs = Date.now() - stat.mtimeMs;
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (ageMs > TWO_HOURS) {
      const ageHours = Math.round(ageMs / (60 * 60 * 1000));
      const skill = fs.readFileSync(activeSkillFile, 'utf8').trim();
      return `Active-skill integrity: .planning/.active-skill is ${ageHours}h old (skill: "${skill}"). This may be a stale lock from a crashed session. Run /pbr:health to diagnose, or delete .planning/.active-skill if the previous session is no longer running.`;
    }
  } catch (_e) { /* best-effort */ }

  return null;
}

module.exports = { checkDebuggerAdvisory, checkCheckpointManifest, checkActiveSkillIntegrity };

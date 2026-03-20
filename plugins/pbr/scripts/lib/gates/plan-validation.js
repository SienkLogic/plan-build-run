'use strict';

/**
 * Gate: plan-validation artifact check.
 * When active skill is "build" and pbr:executor is spawned, verify
 * that .plan-check.json exists in the phase directory with status: "passed".
 */

const fs = require('fs');
const path = require('path');
const { readActiveSkill, readCurrentPhase } = require('./helpers');

/**
 * Blocking check: when the active skill is "build" and an executor is being
 * spawned, verify that .plan-check.json exists and has status === "passed".
 * Returns { block: true, reason: "..." } if blocked,
 *         { warning: "..." } if advisory (quick depth),
 *         or null if OK.
 * @param {object} data - hook data with tool_input
 * @returns {{ block: boolean, reason: string }|{ warning: string }|null}
 */
function checkPlanValidationGate(data) {
  const toolInput = data.tool_input || {};
  const subagentType = toolInput.subagent_type || '';

  // Only gate pbr:executor
  if (subagentType !== 'pbr:executor') return null;

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only gate when active skill is "build"
  const activeSkill = readActiveSkill(planningDir);
  if (activeSkill !== 'build') return null;

  // Allow inline execution bypass
  try {
    if (fs.existsSync(path.join(planningDir, '.inline-active'))) {
      return null;
    }
  } catch (_e) { /* ignore */ }

  // Read STATE.md for current phase
  const currentPhase = readCurrentPhase(planningDir);
  if (!currentPhase) return null;

  try {
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase + '-'));
    if (dirs.length === 0) return null;

    const phaseDir = path.join(phasesDir, dirs[0]);

    // Skip gate if no PLAN files exist (empty/speculative phase dir)
    const files = fs.readdirSync(phaseDir);
    const hasPlanFiles = files.some(f => /^PLAN.*\.md$/i.test(f));
    if (!hasPlanFiles) return null;

    const checkFile = path.join(phaseDir, '.plan-check.json');

    // Read depth from config
    let depth = 'standard';
    try {
      const configPath = path.join(planningDir, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.depth) depth = config.depth;
    } catch (_e) { /* default to standard */ }

    // Check if .plan-check.json exists
    if (!fs.existsSync(checkFile)) {
      if (depth === 'quick') {
        return { warning: 'Plan validation skipped (quick depth) — .plan-check.json missing or not passed' };
      }
      return { block: true, reason: `Cannot spawn executor: .plan-check.json not found in phase directory.\n\nThe build gate requires a passing plan-check artifact before executor spawn. This artifact is written by the plan-checker agent during /pbr:plan-phase.\n\nRun /pbr:plan-phase ${currentPhase} with plan-checker enabled first.` };
    }

    // Parse the JSON
    const checkData = JSON.parse(fs.readFileSync(checkFile, 'utf8'));

    if (checkData.status !== 'passed') {
      if (depth === 'quick') {
        return { warning: 'Plan validation skipped (quick depth) — .plan-check.json missing or not passed' };
      }
      return {
        block: true,
        reason: `Cannot spawn executor: plan validation failed.\n\nThe plan-check artifact indicates unresolved issues (status: ${checkData.status}, blockers: ${checkData.blockers || 0}). Plans must pass validation before executors can run.\n\nFix plan issues and re-run /pbr:plan-phase ${currentPhase}.`
      };
    }

    // Check requirements coverage
    if (checkData.requirements_coverage) {
      const rc = checkData.requirements_coverage;
      if (Array.isArray(rc.uncovered) && rc.uncovered.length > 0) {
        if (depth === 'quick') {
          return { warning: `Requirements coverage incomplete (${rc.covered}/${rc.total}) — uncovered: ${rc.uncovered.join(', ')}` };
        }
        return {
          block: true,
          reason: `Cannot spawn executor: requirements coverage incomplete.\n\n${rc.uncovered.length} requirement(s) not covered by any plan's implements field: ${rc.uncovered.join(', ')}.\n\nAdd missing requirements to plan implements: fields and re-run /pbr:plan-phase.`
        };
      }
    }

    // status === "passed" — allow
    return null;
  } catch (_e) {
    // Fail open on unexpected errors
    return null;
  }
}

module.exports = { checkPlanValidationGate };

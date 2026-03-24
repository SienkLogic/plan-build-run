'use strict';

/**
 * Multi-Phase Plan Loader
 *
 * Loads plan files from the current phase and adjacent phases to provide
 * cross-phase awareness to Task() agents. Respects the multi_phase_awareness
 * feature toggle and max_phases_in_context workflow config.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('../../hook-logger');

/**
 * Load plans from the current phase and adjacent phases.
 *
 * @param {string} planningDir - path to .planning directory
 * @param {number} currentPhaseNum - current phase number (1-based)
 * @param {object} config - project config object
 * @returns {{ phases: Array<{ phaseNum: number, phaseName: string, plans: Array<{ planId: string, content: string }> }>, totalPlans: number, phasesLoaded: number }}
 */
function loadMultiPhasePlans(planningDir, currentPhaseNum, config) {
  const phasesDir = path.join(planningDir, 'phases');

  // List and sort all phase directories
  const allPhaseDirs = listPhaseDirs(phasesDir);

  // Determine which phases to load
  const featureEnabled = !(config && config.features && config.features.multi_phase_awareness === false);
  const maxPhases = (config && config.workflow && config.workflow.max_phases_in_context) || 3;

  let selectedPhaseNums;
  if (!featureEnabled) {
    // Only current phase
    selectedPhaseNums = [currentPhaseNum];
  } else {
    selectedPhaseNums = selectPhases(allPhaseDirs, currentPhaseNum, maxPhases);
  }

  // Load plans from selected phases
  const phases = [];
  let totalPlans = 0;

  for (const phaseNum of selectedPhaseNums) {
    const phaseInfo = allPhaseDirs.find(p => p.num === phaseNum);
    if (!phaseInfo) continue;

    const plans = loadPlansFromDir(phaseInfo.fullPath);
    if (plans.length === 0) continue; // Skip phases with no plans

    phases.push({
      phaseNum: phaseInfo.num,
      phaseName: phaseInfo.name,
      plans,
    });
    totalPlans += plans.length;
  }

  return {
    phases,
    totalPlans,
    phasesLoaded: phases.length,
  };
}

/**
 * List phase directories sorted by phase number.
 * @param {string} phasesDir - path to .planning/phases/
 * @returns {Array<{ num: number, name: string, fullPath: string }>}
 */
function listPhaseDirs(phasesDir) {
  if (!fs.existsSync(phasesDir)) return [];

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
  const dirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d+)-(.+)/);
    if (!match) continue;
    dirs.push({
      num: parseInt(match[1], 10),
      name: entry.name,
      fullPath: path.join(phasesDir, entry.name),
    });
  }

  return dirs.sort((a, b) => a.num - b.num);
}

/**
 * Select up to maxPhases phases centered on currentPhaseNum.
 * Always includes current. Then adds previous, next, then extends forward.
 */
function selectPhases(allPhaseDirs, currentPhaseNum, maxPhases) {
  const allNums = allPhaseDirs.map(p => p.num);
  if (allNums.length === 0) return [currentPhaseNum];

  const selected = new Set();
  selected.add(currentPhaseNum);

  // Add previous phase
  const prevPhases = allNums.filter(n => n < currentPhaseNum).sort((a, b) => b - a);
  if (prevPhases.length > 0 && selected.size < maxPhases) {
    selected.add(prevPhases[0]); // closest previous
  }

  // Add next phase
  const nextPhases = allNums.filter(n => n > currentPhaseNum).sort((a, b) => a - b);
  if (nextPhases.length > 0 && selected.size < maxPhases) {
    selected.add(nextPhases[0]); // closest next
  }

  // If max > 3, extend forward
  for (let i = 1; i < nextPhases.length && selected.size < maxPhases; i++) {
    selected.add(nextPhases[i]);
  }

  // If still room, extend backward
  for (let i = 1; i < prevPhases.length && selected.size < maxPhases; i++) {
    selected.add(prevPhases[i]);
  }

  return Array.from(selected).sort((a, b) => a - b);
}

/**
 * Load all PLAN-*.md files from a phase directory.
 * @param {string} phaseDir - full path to phase directory
 * @returns {Array<{ planId: string, content: string }>}
 */
function loadPlansFromDir(phaseDir) {
  try {
    const files = fs.readdirSync(phaseDir)
      .filter(f => /^PLAN-\d+\.md$/i.test(f))
      .sort();

    return files.map(f => ({
      planId: f.replace(/\.md$/i, ''),
      content: fs.readFileSync(path.join(phaseDir, f), 'utf8'),
    }));
  } catch (_e) {
    logHook('gate:multi-phase-loader', 'debug', 'Failed to read plans from phase dir', { error: _e.message, phaseDir });
    return [];
  }
}

module.exports = { loadMultiPhasePlans };

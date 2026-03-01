'use strict';

/**
 * lib/preview.js — Dry-run preview for /pbr:build and /pbr:plan.
 *
 * Reads PLAN.md frontmatter from a phase directory, aggregates file lists,
 * counts task tags, and builds a structured preview object without executing
 * any agents or making any state changes.
 *
 * Exports: buildPreview(phaseSlug, options, planningDir, pluginRoot)
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter, findFiles } = require('./core');

/**
 * Group an array of plan objects by their wave number.
 * Returns an array of { wave, plans, parallel } sorted ascending by wave.
 *
 * parallel = true when the wave contains more than one plan.
 *
 * @param {Array<object>} plans
 * @returns {Array<{wave: number, plans: Array<object>, parallel: boolean}>}
 */
function groupByWave(plans) {
  const waveMap = new Map();
  for (const plan of plans) {
    const waveNum = typeof plan.wave === 'number' ? plan.wave : 1;
    if (!waveMap.has(waveNum)) {
      waveMap.set(waveNum, []);
    }
    waveMap.get(waveNum).push(plan);
  }

  return Array.from(waveMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([wave, wavePlans]) => ({
      wave,
      plans: wavePlans,
      parallel: wavePlans.length > 1
    }));
}

/**
 * Build a preview object for a phase without executing any agents.
 *
 * @param {string} phaseSlug - Phase slug (partial match, e.g. "advanced-orchestrator-features" or "56-advanced-...")
 * @param {object} _options  - Reserved for future options (currently unused)
 * @param {string} planningDir - Absolute path to the .planning/ directory
 * @param {string} _pluginRoot - Plugin root (passed for API consistency, unused here)
 * @returns {object} Preview data or { error: string }
 */
function buildPreview(phaseSlug, _options, planningDir, _pluginRoot) {
  const phasesDir = path.join(planningDir, 'phases');

  // Find the phase directory
  let phaseDir = null;
  let phaseDirName = null;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === phaseSlug || entry.name.endsWith('-' + phaseSlug) || entry.name.includes(phaseSlug)) {
        phaseDir = path.join(phasesDir, entry.name);
        phaseDirName = entry.name;
        break;
      }
    }
  } catch (_e) {
    return { error: `Phase not found: ${phaseSlug}` };
  }

  if (!phaseDir) {
    return { error: `Phase not found: ${phaseSlug}` };
  }

  // Find all PLAN-*.md files
  const planFiles = findFiles(phaseDir, /^PLAN.*\.md$/i);

  if (planFiles.length === 0) {
    return {
      phase: phaseDirName,
      plans: [],
      waves: [],
      files_affected: [],
      agent_count: 0,
      critical_path: [],
      dependency_chain: []
    };
  }

  // Parse each plan file
  const plans = [];
  for (const filename of planFiles) {
    const filePath = path.join(phaseDir, filename);
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_e) {
      continue;
    }

    const fm = parseYamlFrontmatter(content);

    // Count task tags by matching "task id=" occurrences
    const taskMatches = content.match(/task id=/g);
    const taskCount = taskMatches ? taskMatches.length : 0;

    // Normalize wave to a number
    const wave = typeof fm.wave === 'number' ? fm.wave : (parseInt(fm.wave, 10) || 1);

    // Normalize depends_on to an array
    let dependsOn = fm.depends_on;
    if (!dependsOn) {
      dependsOn = [];
    } else if (!Array.isArray(dependsOn)) {
      dependsOn = [dependsOn];
    }

    // Normalize files_modified to an array
    let filesModified = fm.files_modified;
    if (!filesModified) {
      filesModified = [];
    } else if (!Array.isArray(filesModified)) {
      filesModified = [filesModified];
    }

    plans.push({
      id: fm.plan || filename.replace(/\.md$/i, ''),
      wave,
      depends_on: dependsOn,
      files_modified: filesModified,
      task_count: taskCount
    });
  }

  // Group plans by wave
  const waves = groupByWave(plans);

  // Aggregate files_affected: union of all files_modified, deduplicated and sorted
  const filesSet = new Set();
  for (const plan of plans) {
    for (const f of plan.files_modified) {
      filesSet.add(f);
    }
  }
  const files_affected = Array.from(filesSet).sort();

  // Sum agent_count
  const agent_count = plans.reduce((sum, p) => sum + p.task_count, 0);

  // Critical path: first plan ID from each wave in order
  const critical_path = waves.map(w => w.plans[0].id);

  // Dependency chain: [{id, wave, depends_on}] for all plans
  const dependency_chain = plans.map(p => ({
    id: p.id,
    wave: p.wave,
    depends_on: p.depends_on
  }));

  return {
    phase: phaseDirName,
    plans,
    waves,
    files_affected,
    agent_count,
    critical_path,
    dependency_chain
  };
}

module.exports = { buildPreview, groupByWave };

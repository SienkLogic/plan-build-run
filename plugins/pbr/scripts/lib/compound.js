/**
 * lib/compound.js — Compound CLI commands for Plan-Build-Run tools.
 *
 * Provides atomic multi-step operations that bundle directory creation,
 * STATE.md updates, and ROADMAP.md updates into single commands.
 * This prevents agents from skipping individual setup steps.
 *
 * Functions:
 *   compoundInitPhase(phaseNum, slug, planningDir, options)
 *   compoundCompletePhase(phaseNum, planningDir)
 *   compoundInitMilestone(version, planningDir, options)
 */

const fs = require('fs');
const path = require('path');
const { phaseAdd, phaseComplete } = require('./phase');
const { statePatch, stateUpdateProgress, updateFrontmatterField } = require('./state');
const { lockedFileUpdate } = require('./atomic');

/**
 * Atomically create a phase directory, update ROADMAP.md, and update STATE.md.
 *
 * @param {string|number} phaseNum - Phase number
 * @param {string} slug - Phase slug (kebab-case)
 * @param {string} [planningDir] - Path to .planning directory
 * @param {object} [options] - { goal, dependsOn }
 * @returns {object} Result with success, phase, slug, directory, roadmap_updated, state_updated
 */
async function compoundInitPhase(phaseNum, slug, planningDir, options) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const opts = options || {};
  const partial = { dir_created: false, roadmap_updated: false, state_updated: false };

  // Validate .planning/ exists
  if (!fs.existsSync(dir)) {
    return { success: false, error: `.planning/ directory not found at ${dir}`, partial };
  }

  // Check if phase directory already exists
  const phasesDir = path.join(dir, 'phases');
  if (fs.existsSync(phasesDir)) {
    const padded = String(phaseNum).padStart(2, '0');
    const entries = fs.readdirSync(phasesDir).filter(e => e.startsWith(padded + '-'));
    if (entries.length > 0) {
      return { success: true, already_exists: true, directory: entries[0] };
    }
  }

  // Create phase directory + update ROADMAP.md via phaseAdd
  let addResult;
  try {
    addResult = await phaseAdd(slug, null, dir, opts);
    partial.dir_created = true;
    partial.roadmap_updated = addResult.roadmap_updated || false;
  } catch (err) {
    return { success: false, error: `phaseAdd failed: ${err.message}`, partial };
  }

  // Update STATE.md
  try {
    await statePatch(JSON.stringify({
      current_phase: String(phaseNum),
      status: 'planned',
      phase_slug: slug
    }), dir);
    partial.state_updated = true;
  } catch (err) {
    return { success: false, error: `statePatch failed: ${err.message}`, partial };
  }

  // Recalculate progress
  try {
    await stateUpdateProgress(dir);
  } catch (_err) {
    // Non-fatal: progress update is best-effort
  }

  return {
    success: true,
    phase: parseInt(phaseNum, 10),
    slug,
    directory: addResult.directory,
    roadmap_updated: addResult.roadmap_updated || false,
    state_updated: true
  };
}

/**
 * Atomically validate SUMMARY exists, then complete a phase (ROADMAP + STATE).
 *
 * @param {string|number} phaseNum - Phase number to complete
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object} Result with success, summaries_found, plus phaseComplete fields
 */
async function compoundCompletePhase(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');

  // Validate .planning/ exists
  if (!fs.existsSync(dir)) {
    return { success: false, error: `.planning/ directory not found at ${dir}` };
  }

  // Find phase directory
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { success: false, error: 'No phases directory found' };
  }

  const padded = String(phaseNum).padStart(2, '0');
  const entries = fs.readdirSync(phasesDir).filter(e => e.startsWith(padded + '-'));
  if (entries.length === 0) {
    return { success: false, error: `No phase directory found matching phase ${phaseNum}` };
  }

  const phaseDir = path.join(phasesDir, entries[0]);

  // Scan for SUMMARY*.md files
  const summaries = fs.readdirSync(phaseDir).filter(f => /^SUMMARY.*\.md$/i.test(f));
  if (summaries.length === 0) {
    return {
      success: false,
      error: 'No SUMMARY.md found in phase directory. Build must produce summaries before completion.'
    };
  }

  // Delegate to phaseComplete for ROADMAP + STATE updates
  let result;
  try {
    result = await phaseComplete(phaseNum, dir);
  } catch (err) {
    return { success: false, error: `phaseComplete failed: ${err.message}` };
  }

  // Check for missing VERIFICATION.md (advisory warning)
  const warnings = [];
  if (result.verification_missing) {
    warnings.push(`Phase ${phaseNum} completed without VERIFICATION.md. Run /pbr:review ${phaseNum} to verify.`);
  }

  // Augment with summaries_found count and warnings
  return { ...result, summaries_found: summaries.length, ...(warnings.length > 0 ? { warnings } : {}) };
}

/**
 * Atomically create milestone archive directory structure and update STATE.md.
 *
 * @param {string} version - Milestone version (e.g., "v20.0")
 * @param {string} [planningDir] - Path to .planning directory
 * @param {object} [options] - { name, phases }
 * @returns {object} Result with success, version, archive_dir, roadmap_backed_up, etc.
 */
async function compoundInitMilestone(version, planningDir, options) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const _opts = options || {};

  // Validate .planning/ exists
  if (!fs.existsSync(dir)) {
    return { success: false, error: `.planning/ directory not found at ${dir}` };
  }

  // Create milestone archive directory structure
  const archiveDir = path.join(dir, 'milestones', version);
  const phasesArchiveDir = path.join(archiveDir, 'phases');
  try {
    fs.mkdirSync(phasesArchiveDir, { recursive: true });
  } catch (err) {
    return { success: false, error: `Failed to create milestone directory: ${err.message}` };
  }

  // Copy ROADMAP.md to archive
  let roadmapBackedUp = false;
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    try {
      fs.copyFileSync(roadmapPath, path.join(archiveDir, 'ROADMAP.md'));
      roadmapBackedUp = true;
    } catch (_err) {
      // Non-fatal
    }
  }

  // Copy REQUIREMENTS.md to archive if it exists
  let requirementsBackedUp = false;
  const requirementsPath = path.join(dir, 'REQUIREMENTS.md');
  if (fs.existsSync(requirementsPath)) {
    try {
      fs.copyFileSync(requirementsPath, path.join(archiveDir, 'REQUIREMENTS.md'));
      requirementsBackedUp = true;
    } catch (_err) {
      // Non-fatal
    }
  }

  // Update STATE.md with last_milestone_version (not in statePatch whitelist, use direct update)
  let stateUpdated = false;
  const statePath = path.join(dir, 'STATE.md');
  if (fs.existsSync(statePath)) {
    try {
      await lockedFileUpdate(statePath, (content) => {
        return updateFrontmatterField(content, 'last_milestone_version', version);
      });
      stateUpdated = true;
    } catch (_err) {
      // Non-fatal
    }
  }

  return {
    success: true,
    version,
    archive_dir: archiveDir,
    roadmap_backed_up: roadmapBackedUp,
    requirements_backed_up: requirementsBackedUp,
    state_updated: stateUpdated
  };
}

module.exports = {
  compoundInitPhase,
  compoundCompletePhase,
  compoundInitMilestone
};

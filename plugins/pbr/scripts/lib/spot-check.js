'use strict';

/**
 * lib/spot-check.js — Machine-enforced wave gate spot check.
 *
 * Verifies that a completed plan's SUMMARY file exists, lists real key_files
 * that exist on disk, and has a non-empty commits field.
 *
 * Used by pbr-tools.js `spot-check <phaseSlug> <planId>` subcommand.
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter } = require('./core');

/**
 * Perform a spot-check on a completed plan's SUMMARY artifact.
 *
 * @param {string} planningDir  - Absolute path to the .planning/ directory
 * @param {string} phaseSlug    - Phase directory name (e.g. "49-build-workflow-hardening")
 * @param {string} planId       - Plan identifier (e.g. "49-01")
 * @returns {{
 *   ok: boolean,
 *   summary_exists: boolean,
 *   key_files_checked: Array<{path: string, exists: boolean}>,
 *   commits_present: boolean,
 *   detail: string
 * }}
 */
function spotCheck(planningDir, phaseSlug, planId) {
  const summaryPath = path.join(planningDir, 'phases', phaseSlug, 'SUMMARY-' + planId + '.md');

  // Check 1: SUMMARY file must exist
  if (!fs.existsSync(summaryPath)) {
    return {
      ok: false,
      summary_exists: false,
      key_files_checked: [],
      commits_present: false,
      detail: 'SUMMARY-' + planId + '.md not found'
    };
  }

  // Read and parse SUMMARY frontmatter
  let content;
  try {
    content = fs.readFileSync(summaryPath, 'utf8');
  } catch (e) {
    return {
      ok: false,
      summary_exists: true,
      key_files_checked: [],
      commits_present: false,
      detail: 'Failed to read SUMMARY: ' + e.message
    };
  }

  const fm = parseYamlFrontmatter(content);
  const failures = [];

  // Check 2: key_files — check first 2 entries for existence on disk
  // key_files are repo-relative paths; resolve them relative to the repo root (planningDir/..)
  const repoRoot = path.resolve(path.join(planningDir, '..'));
  const rawKeyFiles = Array.isArray(fm.key_files) ? fm.key_files : [];
  const toCheck = rawKeyFiles.slice(0, 2);

  const key_files_checked = toCheck.map(kf => {
    const absPath = path.resolve(repoRoot, kf);
    const exists = fs.existsSync(absPath);
    return { path: kf, exists };
  });

  const missingFiles = key_files_checked.filter(kf => !kf.exists);
  if (missingFiles.length > 0) {
    failures.push('missing key_files: ' + missingFiles.map(kf => kf.path).join(', '));
  }

  // Check 3: commits field must be non-empty
  // Re-parse the raw frontmatter block for the commits field to match check-subagent-output.js pattern
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let commits_present = false;

  if (fmMatch) {
    const fmBlock = fmMatch[1];
    const commitsMatch = fmBlock.match(/commits:\s*(\[.*?\]|.*)/);
    if (commitsMatch) {
      const commitsVal = commitsMatch[1].trim();
      // Treat these as empty: [], '', ~, null
      commits_present = !(
        commitsVal === '[]' ||
        commitsVal === '' ||
        commitsVal === '~' ||
        commitsVal === 'null' ||
        commitsVal === '""'
      );
    }
  } else {
    // No frontmatter found at all
    failures.push('no frontmatter found in SUMMARY');
  }

  if (!commits_present) {
    failures.push('commits field is empty or missing');
  }

  const ok = missingFiles.length === 0 && commits_present && (fmMatch !== null);
  const detail = failures.length === 0 ? 'all checks passed' : failures.join('; ');

  return {
    ok,
    summary_exists: true,
    key_files_checked,
    commits_present,
    detail
  };
}

module.exports = { spotCheck };

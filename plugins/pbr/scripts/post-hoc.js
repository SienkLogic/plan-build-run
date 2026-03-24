'use strict';

/**
 * post-hoc.js — Phase-level post-hoc artifact generation.
 *
 * Generates SUMMARY.md and LEARNINGS.md content from git history,
 * PLAN frontmatter, VERIFICATION.md gaps, and hook logs.
 *
 * Exports: generateSummary, generateLearnings, isEnabled
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { extractFrontmatter } = require('./lib/frontmatter');

/**
 * Read all PLAN-*.md files from phaseDir and parse their frontmatter.
 */
function readPlanFiles(phaseDir) {
  const plans = [];
  try {
    const files = fs.readdirSync(phaseDir).filter(f => /^PLAN.*\.md$/i.test(f));
    for (const file of files) {
      const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
      const fm = extractFrontmatter(content);
      plans.push(fm);
    }
  } catch (_e) {
    // phaseDir may not exist or be unreadable
  }
  return plans;
}

/**
 * Run a git command and return stdout, or empty string on failure.
 */
function gitExec(args, cwd) {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (_e) {
    return '';
  }
}

/**
 * Read last N lines from a file (like tail -n).
 */
function readTailLines(filePath, n) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    return lines.slice(-n);
  } catch (_e) {
    return [];
  }
}

/**
 * Generate SUMMARY.md content from plan files and git history.
 * Does NOT write to disk — returns { path, content }.
 *
 * @param {string} phaseDir - Path to the phase directory containing PLAN-*.md files
 * @param {string} planningDir - Path to the .planning directory
 * @returns {{ path: string, content: string }}
 */
function generateSummary(phaseDir, planningDir) {
  const plans = readPlanFiles(phaseDir);

  // Collect provides, files_modified, must_haves from all plans
  const allProvides = [];
  const allFiles = new Set();
  const allTruths = [];

  for (const plan of plans) {
    // provides
    if (Array.isArray(plan.provides)) {
      allProvides.push(...plan.provides);
    }
    // files_modified
    if (Array.isArray(plan.files_modified)) {
      plan.files_modified.forEach(f => allFiles.add(f));
    }
    // must_haves.truths
    if (plan.must_haves && typeof plan.must_haves === 'object') {
      if (Array.isArray(plan.must_haves.truths)) {
        allTruths.push(...plan.must_haves.truths);
      }
    }
  }

  const keyFiles = Array.from(allFiles);

  // Get git log for phase files (last 50 commits)
  let commitLog = '';
  if (keyFiles.length > 0) {
    const fileArgs = keyFiles.map(f => `"${f}"`).join(' ');
    commitLog = gitExec(`log --oneline --no-decorate -50 -- ${fileArgs}`, planningDir);
  }

  // Read hook logs
  const hookLogPath = path.join(planningDir, 'logs', 'hooks.jsonl');
  const _hookLines = readTailLines(hookLogPath, 100);

  // Determine phase name from directory
  const phaseName = path.basename(phaseDir);

  // Build YAML frontmatter
  const fmLines = [
    '---',
    `phase: "${phaseName}"`,
    'status: "complete"',
    'requires: []',
    'key_files:',
    ...keyFiles.map(f => `  - "${f}"`),
    'deferred: []',
    'key_decisions: []',
    'patterns: []',
    '---'
  ];

  // Build body
  const bodyLines = [
    '',
    '## What Was Built',
    '',
    ...allProvides.map(p => `- ${p}`),
    '',
    '## Commits',
    '',
    commitLog || 'No matching commits found.',
    '',
    '## Must-Have Results',
    '',
    ...allTruths.map(t => `- ${t}`),
    ''
  ];

  const content = fmLines.join('\n') + '\n' + bodyLines.join('\n');
  const summaryPath = path.join(phaseDir, 'SUMMARY.md');

  return { path: summaryPath, content };
}

/**
 * Generate LEARNINGS.md content from VERIFICATION.md gaps and git diffs.
 * Does NOT write to disk — returns { path, content }.
 *
 * @param {string} phaseDir - Path to the phase directory
 * @param {string} _planningDir - Path to the .planning directory
 * @returns {{ path: string, content: string }}
 */
function generateLearnings(phaseDir, _planningDir) {
  // Check for VERIFICATION.md
  const verPath = path.join(phaseDir, 'VERIFICATION.md');
  let verStatus = '';
  let gaps = [];

  try {
    const verContent = fs.readFileSync(verPath, 'utf-8');
    const fm = extractFrontmatter(verContent);
    verStatus = fm.status || '';
    if (Array.isArray(fm.gaps)) {
      gaps = fm.gaps;
    }
  } catch (_e) {
    // No VERIFICATION.md — that's fine
  }

  // Get git diff stats for change hotspots
  const diffStat = gitExec('diff --stat HEAD~10..HEAD', _planningDir);

  // Read plan files for file list
  const plans = readPlanFiles(phaseDir);
  const allFiles = new Set();
  for (const plan of plans) {
    if (Array.isArray(plan.files_modified)) {
      plan.files_modified.forEach(f => allFiles.add(f));
    }
  }

  // Build content
  const bodyLines = [
    '---',
    `phase: "${path.basename(phaseDir)}"`,
    '---',
    '',
    '## What Worked',
    '',
    verStatus === 'complete' || !verStatus
      ? 'All verifications passed.'
      : 'Partial verification — see gaps below.',
    '',
    '## What Failed',
    '',
    gaps.length > 0
      ? gaps.map(g => `- ${g}`).join('\n')
      : 'No gaps identified.',
    '',
    '## Patterns',
    '',
    allFiles.size > 0
      ? `Files modified across plans: ${Array.from(allFiles).join(', ')}`
      : 'No file modification patterns detected.',
    '',
    diffStat ? `### Change Hotspots\n\n\`\`\`\n${diffStat}\n\`\`\`` : '',
    ''
  ];

  const content = bodyLines.join('\n');
  const learningsPath = path.join(phaseDir, 'LEARNINGS.md');

  return { path: learningsPath, content };
}

/**
 * Check if post-hoc artifact generation is enabled in config.
 *
 * @param {string} planningDir - Path to the .planning directory
 * @returns {boolean}
 */
function isEnabled(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config?.features?.post_hoc_artifacts !== false;
  } catch (_e) {
    // No config or parse error — default to enabled
    return true;
  }
}

module.exports = {
  generateSummary,
  generateLearnings,
  isEnabled,
};

'use strict';

/**
 * lib/spot-check.cjs -- Machine-enforced output spot checks for PBR agents.
 *
 * Two modes:
 * 1. Legacy: spotCheck(planningDir, phaseSlug, planId) -- wave gate check
 * 2. New:    verifySpotCheck(type, dirPath) -- comprehensive type-based check
 *
 * Type-based checks validate agent output exists and is well-formed:
 *   plan         -- after planner agent
 *   summary      -- after executor agent
 *   verification -- after verifier agent
 *   quick        -- after quick executor
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter, findFiles } = require('./core.cjs');

// ─── Legacy spot-check (wave gate) ──────────────────────────────────────────

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

  // Check 2: key_files -- check first 2 entries for existence on disk
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

// ─── Type-based spot-check (verify spot-check) ─────────────────────────────

/**
 * Count <task> elements in markdown content.
 * @param {string} content - Markdown file content
 * @returns {number}
 */
function countTasks(content) {
  const matches = content.match(/<task[\s>]/g);
  return matches ? matches.length : 0;
}

/**
 * Check if content has a ## Tasks section with at least one task.
 * @param {string} content
 * @returns {{ hasSection: boolean, taskCount: number }}
 */
function checkTasksSection(content) {
  const hasSection = /^##\s+Tasks/mi.test(content);
  const taskCount = countTasks(content);
  return { hasSection, taskCount };
}

/**
 * Verify planner output: PLAN files exist and are well-formed.
 * @param {string} dirPath - Phase directory path
 * @returns {object} Spot-check result
 */
function checkPlan(dirPath) {
  const checks = [];
  const failures = [];

  // Check 1: At least one PLAN*.md or *-PLAN.md file exists
  const planFiles = findFiles(dirPath, /PLAN.*\.md$|.*-PLAN\.md$/i);
  if (planFiles.length === 0) {
    checks.push({ name: 'files_exist', passed: false, detail: 'No PLAN files found' });
    failures.push('No PLAN*.md files found in directory');
    return { type: 'plan', path: dirPath, passed: false, checks, failures };
  }
  checks.push({ name: 'files_exist', passed: true, detail: 'Found ' + planFiles.length + ' PLAN file' + (planFiles.length > 1 ? 's' : '') });

  // Check each PLAN file
  let allFmValid = true;
  let allFieldsPresent = true;
  const fmDetails = [];
  const fieldDetails = [];
  let totalTaskCount = 0;
  let taskSectionOk = true;
  let taskCountMatch = true;
  const taskCountDetails = [];

  for (const file of planFiles) {
    const filePath = path.join(dirPath, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_e) {
      allFmValid = false;
      fmDetails.push(file + ': unreadable');
      failures.push(file + ' cannot be read');
      continue;
    }

    // Check 2: Valid YAML frontmatter
    const fm = parseYamlFrontmatter(content);
    const hasFm = content.replace(/\r\n/g, '\n').match(/^---\s*\n[\s\S]*?\n---/);
    if (!hasFm) {
      allFmValid = false;
      fmDetails.push(file + ': no frontmatter');
      failures.push(file + ' missing YAML frontmatter');
      continue;
    }

    // Check 3: Required fields (phase, plan or plan_id)
    const hasPhase = fm.phase !== undefined;
    const hasPlan = fm.plan !== undefined || fm.plan_id !== undefined;
    if (!hasPhase || !hasPlan) {
      allFieldsPresent = false;
      const missing = [];
      if (!hasPhase) missing.push('phase');
      if (!hasPlan) missing.push('plan/plan_id');
      fieldDetails.push(file + ' missing: ' + missing.join(', '));
      failures.push(file + ' missing required fields: ' + missing.join(', '));
    }

    // Check 4: ## Tasks section with at least one task
    const { hasSection, taskCount } = checkTasksSection(content);
    if (!hasSection || taskCount === 0) {
      taskSectionOk = false;
      if (!hasSection) {
        failures.push(file + ' missing ## Tasks section');
      } else {
        failures.push(file + ' has ## Tasks section but no <task> elements');
      }
    }
    totalTaskCount += taskCount;

    // Check 5: Task count matches frontmatter tasks field (if present)
    if (fm.tasks !== undefined) {
      const expected = typeof fm.tasks === 'number' ? fm.tasks : parseInt(fm.tasks, 10);
      if (!isNaN(expected) && expected !== taskCount) {
        taskCountMatch = false;
        taskCountDetails.push(file + ': frontmatter says ' + expected + ', found ' + taskCount);
        failures.push(file + ' task count mismatch: frontmatter=' + expected + ' actual=' + taskCount);
      }
    }
  }

  checks.push({ name: 'valid_frontmatter', passed: allFmValid, detail: allFmValid ? 'All files have valid YAML' : fmDetails.join('; ') });
  checks.push({ name: 'required_fields', passed: allFieldsPresent, detail: allFieldsPresent ? 'phase, plan present in all' : fieldDetails.join('; ') });
  checks.push({ name: 'task_section', passed: taskSectionOk, detail: taskSectionOk ? 'Tasks section found with ' + totalTaskCount + ' task' + (totalTaskCount !== 1 ? 's' : '') : 'Tasks section missing or empty' });
  checks.push({ name: 'task_count_match', passed: taskCountMatch, detail: taskCountMatch ? (totalTaskCount > 0 ? 'Task count consistent' : 'No tasks field in frontmatter (skipped)') : taskCountDetails.join('; ') });

  return { type: 'plan', path: dirPath, passed: failures.length === 0, checks, failures };
}

/**
 * Verify executor output: SUMMARY files exist and are well-formed.
 * @param {string} dirPath - Phase directory path
 * @returns {object} Spot-check result
 */
function checkSummary(dirPath) {
  const checks = [];
  const failures = [];

  // Check 1: At least one SUMMARY*.md file exists
  const summaryFiles = findFiles(dirPath, /^SUMMARY.*\.md$/i);
  if (summaryFiles.length === 0) {
    checks.push({ name: 'files_exist', passed: false, detail: 'No SUMMARY files found' });
    failures.push('No SUMMARY*.md files found in directory');
    return { type: 'summary', path: dirPath, passed: false, checks, failures };
  }
  checks.push({ name: 'files_exist', passed: true, detail: 'Found ' + summaryFiles.length + ' SUMMARY file' + (summaryFiles.length > 1 ? 's' : '') });

  let allFmValid = true;
  let allFieldsPresent = true;
  let allKeyFilesNonEmpty = true;
  let allPlansExist = true;
  const fmDetails = [];
  const fieldDetails = [];
  const kfDetails = [];
  const planDetails = [];

  for (const file of summaryFiles) {
    const filePath = path.join(dirPath, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_e) {
      allFmValid = false;
      fmDetails.push(file + ': unreadable');
      failures.push(file + ' cannot be read');
      continue;
    }

    // Check 2: Valid YAML frontmatter
    const fm = parseYamlFrontmatter(content);
    const hasFm = content.replace(/\r\n/g, '\n').match(/^---\s*\n[\s\S]*?\n---/);
    if (!hasFm) {
      allFmValid = false;
      fmDetails.push(file + ': no frontmatter');
      failures.push(file + ' missing YAML frontmatter');
      continue;
    }

    // Check 3: Required fields: requires, key_files, deferred
    const requiredFields = ['requires', 'key_files', 'deferred'];
    const missing = requiredFields.filter(f => fm[f] === undefined);
    if (missing.length > 0) {
      allFieldsPresent = false;
      fieldDetails.push(file + ' missing: ' + missing.join(', '));
      failures.push(file + ' missing required fields: ' + missing.join(', '));
    }

    // Check 4: key_files is a non-empty array
    if (!Array.isArray(fm.key_files) || fm.key_files.length === 0) {
      allKeyFilesNonEmpty = false;
      kfDetails.push(file + ': key_files empty or not array');
      failures.push(file + ' key_files is empty or not an array');
    }

    // Check 5: Corresponding PLAN.md exists
    // SUMMARY-setup-01.md -> setup-01-PLAN.md or PLAN-01.md etc.
    const summaryBase = file.replace(/^SUMMARY-?/i, '').replace(/\.md$/i, '');
    const planPatterns = [
      summaryBase + '-PLAN.md',
      'PLAN-' + summaryBase + '.md',
      'PLAN.md'
    ];
    const dirFiles = findFiles(dirPath, /\.md$/i);
    const hasPlan = planPatterns.some(p => dirFiles.includes(p)) ||
                    dirFiles.some(f => /^PLAN/i.test(f));
    if (!hasPlan) {
      allPlansExist = false;
      planDetails.push(file + ': no matching PLAN.md');
      failures.push('No corresponding PLAN.md found for ' + file);
    }
  }

  checks.push({ name: 'valid_frontmatter', passed: allFmValid, detail: allFmValid ? 'All files have valid YAML' : fmDetails.join('; ') });
  checks.push({ name: 'required_fields', passed: allFieldsPresent, detail: allFieldsPresent ? 'requires, key_files, deferred present in all' : fieldDetails.join('; ') });
  checks.push({ name: 'key_files_nonempty', passed: allKeyFilesNonEmpty, detail: allKeyFilesNonEmpty ? 'key_files non-empty in all' : kfDetails.join('; ') });
  checks.push({ name: 'plan_exists', passed: allPlansExist, detail: allPlansExist ? 'Corresponding PLAN.md found' : planDetails.join('; ') });

  return { type: 'summary', path: dirPath, passed: failures.length === 0, checks, failures };
}

/**
 * Verify verifier output: VERIFICATION.md exists and is well-formed.
 * @param {string} dirPath - Phase directory path
 * @returns {object} Spot-check result
 */
function checkVerification(dirPath) {
  const checks = [];
  const failures = [];
  const verFile = 'VERIFICATION.md';
  const verPath = path.join(dirPath, verFile);

  // Check 1: VERIFICATION.md exists
  if (!fs.existsSync(verPath)) {
    checks.push({ name: 'file_exists', passed: false, detail: 'VERIFICATION.md not found' });
    failures.push('VERIFICATION.md not found');
    return { type: 'verification', path: dirPath, passed: false, checks, failures };
  }
  checks.push({ name: 'file_exists', passed: true, detail: 'VERIFICATION.md exists' });

  let content;
  try {
    content = fs.readFileSync(verPath, 'utf8');
  } catch (_e) {
    checks.push({ name: 'valid_frontmatter', passed: false, detail: 'Cannot read file' });
    failures.push('VERIFICATION.md cannot be read');
    return { type: 'verification', path: dirPath, passed: false, checks, failures };
  }

  // Check 2: Valid YAML frontmatter
  const fm = parseYamlFrontmatter(content);
  const hasFm = content.replace(/\r\n/g, '\n').match(/^---\s*\n[\s\S]*?\n---/);
  if (!hasFm) {
    checks.push({ name: 'valid_frontmatter', passed: false, detail: 'No YAML frontmatter' });
    failures.push('VERIFICATION.md missing YAML frontmatter');
    return { type: 'verification', path: dirPath, passed: false, checks, failures };
  }
  checks.push({ name: 'valid_frontmatter', passed: true, detail: 'Valid YAML frontmatter' });

  // Check 3: result field (passed or gaps_found)
  const hasResult = fm.result !== undefined || fm.status !== undefined;
  const resultVal = fm.result || fm.status;
  const validResults = ['passed', 'gaps_found', 'failed'];
  const resultValid = hasResult && validResults.includes(String(resultVal));
  checks.push({
    name: 'result_field',
    passed: resultValid,
    detail: resultValid ? 'result=' + resultVal : (hasResult ? 'result value "' + resultVal + '" not in [passed, gaps_found]' : 'result field missing')
  });
  if (!resultValid) {
    failures.push('VERIFICATION.md missing or invalid result field');
  }

  // Check 4: must_haves_checked field with value > 0
  const mustHavesChecked = fm.must_haves_checked;
  const mhcValid = mustHavesChecked !== undefined && parseInt(mustHavesChecked, 10) > 0;
  checks.push({
    name: 'must_haves_checked',
    passed: mhcValid,
    detail: mhcValid ? 'must_haves_checked=' + mustHavesChecked : (mustHavesChecked !== undefined ? 'must_haves_checked=' + mustHavesChecked + ' (must be > 0)' : 'must_haves_checked field missing')
  });
  if (!mhcValid) {
    failures.push('VERIFICATION.md must_haves_checked missing or zero');
  }

  // Check 5: ## Must-Haves section
  const hasMustHavesSection = /^##\s+Must[- ]?Haves/mi.test(content);
  checks.push({
    name: 'must_haves_section',
    passed: hasMustHavesSection,
    detail: hasMustHavesSection ? '## Must-Haves section found' : '## Must-Haves section not found'
  });
  if (!hasMustHavesSection) {
    failures.push('VERIFICATION.md missing ## Must-Haves section');
  }

  return { type: 'verification', path: dirPath, passed: failures.length === 0, checks, failures };
}

/**
 * Verify quick executor output: PLAN.md and SUMMARY.md exist and are well-formed.
 * @param {string} dirPath - Quick task directory path
 * @returns {object} Spot-check result
 */
function checkQuick(dirPath) {
  const checks = [];
  const failures = [];

  // Check 1: PLAN.md exists
  const planPath = path.join(dirPath, 'PLAN.md');
  const planExists = fs.existsSync(planPath);
  checks.push({ name: 'plan_exists', passed: planExists, detail: planExists ? 'PLAN.md exists' : 'PLAN.md not found' });
  if (!planExists) {
    failures.push('PLAN.md not found in quick task directory');
  }

  // Check 2: SUMMARY.md exists
  const summaryPath = path.join(dirPath, 'SUMMARY.md');
  const summaryExists = fs.existsSync(summaryPath);
  checks.push({ name: 'summary_exists', passed: summaryExists, detail: summaryExists ? 'SUMMARY.md exists' : 'SUMMARY.md not found' });
  if (!summaryExists) {
    failures.push('SUMMARY.md not found in quick task directory');
    return { type: 'quick', path: dirPath, passed: false, checks, failures };
  }

  // Check 3: SUMMARY.md has valid frontmatter with requires, key_files, deferred
  let content;
  try {
    content = fs.readFileSync(summaryPath, 'utf8');
  } catch (_e) {
    checks.push({ name: 'summary_frontmatter', passed: false, detail: 'Cannot read SUMMARY.md' });
    failures.push('SUMMARY.md cannot be read');
    return { type: 'quick', path: dirPath, passed: false, checks, failures };
  }

  const fm = parseYamlFrontmatter(content);
  const hasFm = content.replace(/\r\n/g, '\n').match(/^---\s*\n[\s\S]*?\n---/);
  if (!hasFm) {
    checks.push({ name: 'summary_frontmatter', passed: false, detail: 'No YAML frontmatter' });
    failures.push('SUMMARY.md missing YAML frontmatter');
    return { type: 'quick', path: dirPath, passed: false, checks, failures };
  }

  const requiredFields = ['requires', 'key_files', 'deferred'];
  const missing = requiredFields.filter(f => fm[f] === undefined);
  const fmValid = missing.length === 0;
  checks.push({
    name: 'summary_frontmatter',
    passed: fmValid,
    detail: fmValid ? 'requires, key_files, deferred present' : 'Missing fields: ' + missing.join(', ')
  });
  if (!fmValid) {
    failures.push('SUMMARY.md missing required fields: ' + missing.join(', '));
  }

  // Check 4: Git commit (optional, best-effort)
  let commitCheck = { name: 'git_commit', passed: true, detail: 'Skipped (optional)' };
  try {
    const { execSync } = require('child_process');
    const result = execSync('git log --oneline -1', { cwd: dirPath, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    if (result && result.trim().length > 0) {
      commitCheck = { name: 'git_commit', passed: true, detail: 'Recent commit found' };
    } else {
      commitCheck = { name: 'git_commit', passed: false, detail: 'No commits found' };
      failures.push('No git commits found');
    }
  } catch (_e) {
    commitCheck = { name: 'git_commit', passed: true, detail: 'Git not available (skipped)' };
  }
  checks.push(commitCheck);

  return { type: 'quick', path: dirPath, passed: failures.length === 0, checks, failures };
}

/**
 * Dispatch to the correct type-based spot check.
 * @param {string} type - Check type: plan, summary, verification, quick
 * @param {string} dirPath - Directory to check
 * @returns {object} Spot-check result JSON
 */
function verifySpotCheck(type, dirPath) {
  const resolvedPath = path.resolve(dirPath);

  if (!fs.existsSync(resolvedPath)) {
    return { error: 'Directory not found: ' + dirPath };
  }

  switch (type) {
    case 'plan':
      return checkPlan(resolvedPath);
    case 'summary':
      return checkSummary(resolvedPath);
    case 'verification':
      return checkVerification(resolvedPath);
    case 'quick':
      return checkQuick(resolvedPath);
    default:
      return { error: 'Unknown spot-check type: ' + type + '. Valid types: plan, summary, verification, quick' };
  }
}

// ─── Plan Validate (combined spot-check + structural validation) ────────────

/**
 * Validate all PLAN files in a phase directory.
 * Combines verifySpotCheck('plan') with deeper structural checks.
 *
 * @param {string} projectCwd - Project root directory
 * @param {string} phase - Phase number or slug
 * @returns {object} Combined validation result
 */
function cmdPlanValidate(projectCwd, phase) {
  const { findPhaseInternal } = require('./core.cjs');

  const phaseInfo = findPhaseInternal(projectCwd, phase);
  if (!phaseInfo) {
    return { passed: false, error: 'Phase not found: ' + phase };
  }

  const phaseDir = path.join(projectCwd, phaseInfo.directory);

  // Run the existing spot-check
  const spotCheckResult = checkPlan(phaseDir);

  // Find all PLAN files for structural validation
  const planFiles = findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i);

  const structure = [];
  const requiredFmFields = ['phase', 'wave', 'depends_on', 'files_modified', 'must_haves'];
  const requiredTaskElements = ['name', 'action', 'verify', 'done'];

  for (const file of planFiles) {
    const filePath = path.join(phaseDir, file);
    const entry = { file, valid: true, errors: [], warnings: [], task_count: 0 };

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_e) {
      entry.valid = false;
      entry.errors.push('Cannot read file');
      structure.push(entry);
      continue;
    }

    // Check frontmatter
    const fm = parseYamlFrontmatter(content);
    const hasFm = content.replace(/\r\n/g, '\n').match(/^---\s*\n[\s\S]*?\n---/);
    if (!hasFm) {
      entry.valid = false;
      entry.errors.push('Missing YAML frontmatter');
      structure.push(entry);
      continue;
    }

    // Check required frontmatter fields
    const hasPlanField = fm.plan !== undefined || fm.plan_id !== undefined;
    if (!hasPlanField) {
      entry.errors.push('Missing required field: plan or plan_id');
    }
    for (const field of requiredFmFields) {
      if (fm[field] === undefined) {
        entry.errors.push('Missing required field: ' + field);
      }
    }

    // Check task elements
    const taskMatches = content.match(/<task[\s>][\s\S]*?<\/task>/g) || [];
    entry.task_count = taskMatches.length;

    if (taskMatches.length === 0) {
      entry.warnings.push('No <task> elements found');
    }

    for (let i = 0; i < taskMatches.length; i++) {
      const taskBlock = taskMatches[i];
      const taskNum = i + 1;
      for (const elem of requiredTaskElements) {
        const elemRegex = new RegExp('<' + elem + '[\\s>]');
        if (!elemRegex.test(taskBlock)) {
          entry.errors.push('Task ' + taskNum + ' missing <' + elem + '> element');
        }
      }
    }

    if (entry.errors.length > 0) {
      entry.valid = false;
    }
    structure.push(entry);
  }

  const allStructureValid = structure.every(s => s.valid);
  const passed = spotCheckResult.passed && allStructureValid;

  const failures = [];
  if (!spotCheckResult.passed) {
    failures.push(...spotCheckResult.failures);
  }
  for (const s of structure) {
    for (const err of s.errors) {
      failures.push(s.file + ': ' + err);
    }
  }

  return {
    passed,
    phase: path.basename(phaseInfo.directory),
    plan_count: planFiles.length,
    spot_check: spotCheckResult,
    structure,
    failures
  };
}

module.exports = { spotCheck, verifySpotCheck, cmdPlanValidate };

/**
 * Verify — Verification suite, consistency, and health validation
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile, normalizePhaseName, execGit, findPhaseInternal, getMilestoneInfo, output, error } = require('./core');
const { extractFrontmatter, parseMustHavesBlock } = require('./frontmatter');
const { logHook } = require('../hook-logger');
// writeStateMd was never exported from state.cjs — use fs.writeFileSync directly

function cmdVerifySummary(cwd, summaryPath, checkFileCount, raw) {
  if (!summaryPath) {
    error('summary-path required');
  }

  const fullPath = path.join(cwd, summaryPath);
  const checkCount = checkFileCount || 2;

  // Check 1: Summary exists
  if (!fs.existsSync(fullPath)) {
    const result = {
      passed: false,
      checks: {
        summary_exists: false,
        files_created: { checked: 0, found: 0, missing: [] },
        commits_exist: false,
        self_check: 'not_found',
      },
      errors: ['SUMMARY.md not found'],
    };
    output(result, raw, 'failed');
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const errors = [];

  // Check 2: Spot-check files mentioned in summary
  const mentionedFiles = new Set();
  const patterns = [
    /`([^`]+\.[a-zA-Z]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const filePath = m[1];
      if (filePath && !filePath.startsWith('http') && filePath.includes('/')) {
        mentionedFiles.add(filePath);
      }
    }
  }

  const filesToCheck = Array.from(mentionedFiles).slice(0, checkCount);
  const missing = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  // Check 3: Commits exist
  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const hashes = content.match(commitHashPattern) || [];
  let commitsExist = false;
  if (hashes.length > 0) {
    for (const hash of hashes.slice(0, 3)) {
      const result = execGit(cwd, ['cat-file', '-t', hash]);
      if (result.exitCode === 0 && result.stdout === 'commit') {
        commitsExist = true;
        break;
      }
    }
  }

  // Check 4: Self-check section
  let selfCheck = 'not_found';
  const selfCheckPattern = /##\s*(?:Self[- ]?Check|Verification|Quality Check)/i;
  if (selfCheckPattern.test(content)) {
    const passPattern = /(?:all\s+)?(?:pass|✓|✅|complete|succeeded)/i;
    const failPattern = /(?:fail|✗|❌|incomplete|blocked)/i;
    const checkSection = content.slice(content.search(selfCheckPattern));
    if (failPattern.test(checkSection)) {
      selfCheck = 'failed';
    } else if (passPattern.test(checkSection)) {
      selfCheck = 'passed';
    }
  }

  if (missing.length > 0) errors.push('Missing files: ' + missing.join(', '));
  if (!commitsExist && hashes.length > 0) errors.push('Referenced commit hashes not found in git history');
  if (selfCheck === 'failed') errors.push('Self-check section indicates failure');

  const checks = {
    summary_exists: true,
    files_created: { checked: filesToCheck.length, found: filesToCheck.length - missing.length, missing },
    commits_exist: commitsExist,
    self_check: selfCheck,
  };

  const passed = missing.length === 0 && selfCheck !== 'failed';
  const result = { passed, checks, errors };
  output(result, raw, passed ? 'passed' : 'failed');
}

function cmdVerifyPlanStructure(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const fm = extractFrontmatter(content);
  const errors = [];
  const warnings = [];

  // Check required frontmatter fields
  const required = ['phase', 'plan', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'];
  for (const field of required) {
    if (fm[field] === undefined) errors.push(`Missing required frontmatter field: ${field}`);
  }

  // Parse and check task elements
  const taskPattern = /<task[^>]*>([\s\S]*?)<\/task>/g;
  const tasks = [];
  let taskMatch;
  while ((taskMatch = taskPattern.exec(content)) !== null) {
    const taskContent = taskMatch[1];
    const nameMatch = taskContent.match(/<name>([\s\S]*?)<\/name>/);
    const taskName = nameMatch ? nameMatch[1].trim() : 'unnamed';
    const hasReadFirst = /<read_first>/.test(taskContent);
    const hasFiles = /<files>/.test(taskContent);
    const hasAction = /<action>/.test(taskContent);
    const hasAcceptanceCriteria = /<acceptance_criteria>/.test(taskContent);
    const hasVerify = /<verify>/.test(taskContent);
    const hasDone = /<done>/.test(taskContent);

    if (!nameMatch) errors.push('Task missing <name> element');
    if (!hasAction) errors.push(`Task '${taskName}' missing <action>`);
    if (!hasVerify) errors.push(`Task '${taskName}' missing <verify>`);
    if (!hasDone) errors.push(`Task '${taskName}' missing <done>`);
    if (!hasFiles) warnings.push(`Task '${taskName}' missing <files>`);
    if (!hasReadFirst) warnings.push(`Task '${taskName}' missing <read_first>`);
    if (!hasAcceptanceCriteria) warnings.push(`Task '${taskName}' missing <acceptance_criteria>`);

    tasks.push({ name: taskName, hasReadFirst, hasFiles, hasAction, hasAcceptanceCriteria, hasVerify, hasDone });
  }

  if (tasks.length === 0) warnings.push('No <task> elements found');

  // Wave/depends_on consistency
  if (fm.wave && parseInt(fm.wave) > 1 && (!fm.depends_on || (Array.isArray(fm.depends_on) && fm.depends_on.length === 0))) {
    warnings.push('Wave > 1 but depends_on is empty');
  }

  // Autonomous/checkpoint consistency
  const hasCheckpoints = /<task\s+type=["']?checkpoint/.test(content);
  if (hasCheckpoints && fm.autonomous !== 'false' && fm.autonomous !== false) {
    errors.push('Has checkpoint tasks but autonomous is not false');
  }

  output({
    valid: errors.length === 0,
    errors,
    warnings,
    task_count: tasks.length,
    tasks,
    frontmatter_fields: Object.keys(fm),
  }, raw, errors.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyPhaseCompleteness(cwd, phase, raw) {
  if (!phase) { error('phase required'); }
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const errors = [];
  const warnings = [];
  const phaseDir = path.join(cwd, phaseInfo.directory);

  // List plans and summaries
  let files;
  try { files = fs.readdirSync(phaseDir); } catch (err) { logHook('verify', 'debug', 'Cannot read phase directory', { dir: phaseDir, error: err.message }); output({ error: 'Cannot read phase directory' }, raw); return; }

  const plans = files.filter(f => f.match(/-PLAN\.md$/i));
  const summaries = files.filter(f => f.match(/-SUMMARY\.md$/i));

  // Extract plan IDs (everything before -PLAN.md)
  const planIds = new Set(plans.map(p => p.replace(/-PLAN\.md$/i, '')));
  const summaryIds = new Set(summaries.map(s => s.replace(/-SUMMARY\.md$/i, '')));

  // Plans without summaries
  const incompletePlans = [...planIds].filter(id => !summaryIds.has(id));
  if (incompletePlans.length > 0) {
    errors.push(`Plans without summaries: ${incompletePlans.join(', ')}`);
  }

  // Summaries without plans (orphans)
  const orphanSummaries = [...summaryIds].filter(id => !planIds.has(id));
  if (orphanSummaries.length > 0) {
    warnings.push(`Summaries without plans: ${orphanSummaries.join(', ')}`);
  }

  output({
    complete: errors.length === 0,
    phase: phaseInfo.phase_number,
    plan_count: plans.length,
    summary_count: summaries.length,
    incomplete_plans: incompletePlans,
    orphan_summaries: orphanSummaries,
    errors,
    warnings,
  }, raw, errors.length === 0 ? 'complete' : 'incomplete');
}

function cmdVerifyReferences(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const found = [];
  const missing = [];

  // Find @-references: @path/to/file (must contain / to be a file path)
  const atRefs = content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) || [];
  for (const ref of atRefs) {
    const cleanRef = ref.slice(1); // remove @
    const resolved = cleanRef.startsWith('~/')
      ? path.join(process.env.HOME || '', cleanRef.slice(2))
      : path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  // Find backtick file paths that look like real paths (contain / and have extension)
  const backtickRefs = content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) || [];
  for (const ref of backtickRefs) {
    const cleanRef = ref.slice(1, -1); // remove backticks
    if (cleanRef.startsWith('http') || cleanRef.includes('${') || cleanRef.includes('{{')) continue;
    if (found.includes(cleanRef) || missing.includes(cleanRef)) continue; // dedup
    const resolved = path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  output({
    valid: missing.length === 0,
    found: found.length,
    missing,
    total: found.length + missing.length,
  }, raw, missing.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyCommits(cwd, hashes, raw) {
  if (!hashes || hashes.length === 0) { error('At least one commit hash required'); }

  const valid = [];
  const invalid = [];
  for (const hash of hashes) {
    const result = execGit(cwd, ['cat-file', '-t', hash]);
    if (result.exitCode === 0 && result.stdout.trim() === 'commit') {
      valid.push(hash);
    } else {
      invalid.push(hash);
    }
  }

  output({
    all_valid: invalid.length === 0,
    valid,
    invalid,
    total: hashes.length,
  }, raw, invalid.length === 0 ? 'valid' : 'invalid');
}

/**
 * Parse a string-format artifact into { path, min_lines } or null if descriptive text.
 * Handles: "path/to/file.ext: >N lines", "path/to/file.ext", "descriptive text"
 */
function parseStringArtifact(str) {
  const pathLineMatch = str.match(/^([^\s:]+\.\w+)(?::\s*>(\d+)\s*lines?)?/);
  if (pathLineMatch) {
    return { path: pathLineMatch[1], min_lines: pathLineMatch[2] ? parseInt(pathLineMatch[2]) : null };
  }
  return null; // Descriptive text, skip
}

function cmdVerifyArtifacts(cwd, planFilePath, raw) {
  if (!planFilePath) { error('plan file path required'); }
  const fullPath = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: planFilePath }, raw); return; }

  const artifacts = parseMustHavesBlock(content, 'artifacts');
  if (artifacts.length === 0) {
    output({ error: 'No must_haves.artifacts found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results = [];
  for (const artifact of artifacts) {
    let artObj = artifact;
    if (typeof artifact === 'string') {
      artObj = parseStringArtifact(artifact);
      if (!artObj) continue; // genuinely descriptive, skip
    }
    const artPath = artObj.path;
    if (!artPath) continue;

    const artFullPath = path.join(cwd, artPath);
    const exists = fs.existsSync(artFullPath);
    const check = { path: artPath, exists, issues: [], passed: false };

    if (exists) {
      const fileContent = safeReadFile(artFullPath) || '';
      const lineCount = fileContent.split('\n').length;

      if (artObj.min_lines && lineCount < artObj.min_lines) {
        check.issues.push(`Only ${lineCount} lines, need ${artObj.min_lines}`);
      }
      if (artObj.contains && !fileContent.includes(artObj.contains)) {
        check.issues.push(`Missing pattern: ${artObj.contains}`);
      }
      if (artObj.exports) {
        const exports = Array.isArray(artObj.exports) ? artObj.exports : [artObj.exports];
        for (const exp of exports) {
          if (!fileContent.includes(exp)) check.issues.push(`Missing export: ${exp}`);
        }
      }
      check.passed = check.issues.length === 0;
    } else {
      check.issues.push('File not found');
    }

    results.push(check);
  }

  const passed = results.filter(r => r.passed).length;
  output({
    all_passed: passed === results.length,
    passed,
    total: results.length,
    artifacts: results,
  }, raw, passed === results.length ? 'valid' : 'invalid');
}

function cmdVerifyKeyLinks(cwd, planFilePath, raw) {
  if (!planFilePath) { error('plan file path required'); }
  const fullPath = path.isAbsolute(planFilePath) ? planFilePath : path.join(cwd, planFilePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: planFilePath }, raw); return; }

  const keyLinks = parseMustHavesBlock(content, 'key_links');
  if (keyLinks.length === 0) {
    output({ error: 'No must_haves.key_links found in frontmatter', path: planFilePath }, raw);
    return;
  }

  const results = [];
  for (const link of keyLinks) {
    if (typeof link === 'string') {
      // String-format key_link: attempt to extract file paths, otherwise treat as descriptive
      const pathMatch = link.match(/([^\s]+\.\w+)/g);
      if (pathMatch && pathMatch.length >= 1) {
        // Try to verify the first file path mentioned exists
        const firstPath = pathMatch[0];
        const exists = fs.existsSync(path.join(cwd, firstPath));
        results.push({
          description: link,
          verified: exists ? 'partial' : false,
          detail: exists ? 'Referenced file exists — manual wiring check recommended' : `Referenced file not found: ${firstPath}`,
        });
      } else {
        results.push({
          description: link,
          verified: 'manual',
          detail: 'Descriptive key_link — requires manual verification',
        });
      }
      continue;
    }
    const check = { from: link.from, to: link.to, via: link.via || '', verified: false, detail: '' };

    const sourceContent = safeReadFile(path.join(cwd, link.from || ''));
    if (!sourceContent) {
      check.detail = 'Source file not found';
    } else if (link.pattern) {
      try {
        const regex = new RegExp(link.pattern);
        if (regex.test(sourceContent)) {
          check.verified = true;
          check.detail = 'Pattern found in source';
        } else {
          const targetContent = safeReadFile(path.join(cwd, link.to || ''));
          if (targetContent && regex.test(targetContent)) {
            check.verified = true;
            check.detail = 'Pattern found in target';
          } else {
            check.detail = `Pattern "${link.pattern}" not found in source or target`;
          }
        }
      } catch (err) {
        logHook('verify', 'debug', 'Invalid regex pattern', { pattern: link.pattern, error: err.message });
        check.detail = `Invalid regex pattern: ${link.pattern}`;
      }
    } else {
      // No pattern: just check source references target
      if (sourceContent.includes(link.to || '')) {
        check.verified = true;
        check.detail = 'Target referenced in source';
      } else {
        check.detail = 'Target not referenced in source';
      }
    }

    results.push(check);
  }

  const verified = results.filter(r => r.verified).length;
  output({
    all_verified: verified === results.length,
    verified,
    total: results.length,
    links: results,
  }, raw, verified === results.length ? 'valid' : 'invalid');
}

function cmdValidateConsistency(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const errors = [];
  const warnings = [];

  // Check for ROADMAP
  if (!fs.existsSync(roadmapPath)) {
    errors.push('ROADMAP.md not found');
    output({ passed: false, errors, warnings }, raw, 'failed');
    return;
  }

  const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

  // Extract phases from ROADMAP
  const roadmapPhases = new Set();
  const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
  let m;
  while ((m = phasePattern.exec(roadmapContent)) !== null) {
    roadmapPhases.add(m[1]);
  }

  // Get phases on disk
  const diskPhases = new Set();
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
      if (dm) diskPhases.add(dm[1]);
    }
  } catch (err) { logHook('verify', 'debug', 'Failed to read phases directory', { error: err.message }); }

  // Check: phases in ROADMAP but not on disk
  for (const p of roadmapPhases) {
    if (!diskPhases.has(p) && !diskPhases.has(normalizePhaseName(p))) {
      warnings.push(`Phase ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Check: phases on disk but not in ROADMAP
  for (const p of diskPhases) {
    const unpadded = String(parseInt(p, 10));
    if (!roadmapPhases.has(p) && !roadmapPhases.has(unpadded)) {
      warnings.push(`Phase ${p} exists on disk but not in ROADMAP.md`);
    }
  }

  // Check: sequential phase numbers (integers only)
  const integerPhases = [...diskPhases]
    .filter(p => !p.includes('.'))
    .map(p => parseInt(p, 10))
    .sort((a, b) => a - b);

  for (let i = 1; i < integerPhases.length; i++) {
    if (integerPhases[i] !== integerPhases[i - 1] + 1) {
      warnings.push(`Gap in phase numbering: ${integerPhases[i - 1]} → ${integerPhases[i]}`);
    }
  }

  // Check: plan numbering within phases
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md')).sort();

      // Extract plan numbers
      const planNums = plans.map(p => {
        const pm = p.match(/-(\d{2})-PLAN\.md$/);
        return pm ? parseInt(pm[1], 10) : null;
      }).filter(n => n !== null);

      for (let i = 1; i < planNums.length; i++) {
        if (planNums[i] !== planNums[i - 1] + 1) {
          warnings.push(`Gap in plan numbering in ${dir}: plan ${planNums[i - 1]} → ${planNums[i]}`);
        }
      }

      // Check: plans without summaries (completed plans)
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md'));
      const planIds = new Set(plans.map(p => p.replace('-PLAN.md', '')));
      const summaryIds = new Set(summaries.map(s => s.replace('-SUMMARY.md', '')));

      // Summary without matching plan is suspicious
      for (const sid of summaryIds) {
        if (!planIds.has(sid)) {
          warnings.push(`Summary ${sid}-SUMMARY.md in ${dir} has no matching PLAN.md`);
        }
      }
    }
  } catch (err) { logHook('verify', 'debug', 'Failed to check plan numbering', { error: err.message }); }

  // Check: frontmatter in plans has required fields
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md'));

      for (const plan of plans) {
        const content = fs.readFileSync(path.join(phasesDir, dir, plan), 'utf-8');
        const fm = extractFrontmatter(content);

        if (!fm.wave) {
          warnings.push(`${dir}/${plan}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch (err) { logHook('verify', 'debug', 'Failed to check plan frontmatter', { error: err.message }); }

  const passed = errors.length === 0;
  output({ passed, errors, warnings, warning_count: warnings.length }, raw, passed ? 'passed' : 'failed');
}

/**
 * Check Phase 05 features: decision_journal, negative_knowledge, living_requirements.
 * @param {string} planningDir - Path to .planning directory
 * @param {object} config - Parsed config.json
 * @returns {object} Per-feature status object
 */
function checkPhase05Features(planningDir, config) {
  const features = config.features || {};
  const result = {};

  // decision_journal
  if (features.decision_journal === false) {
    result.decision_journal = { enabled: false, status: 'disabled' };
  } else if (features.decision_journal) {
    const decisionsDir = path.join(planningDir, 'decisions');
    if (fs.existsSync(decisionsDir)) {
      result.decision_journal = { enabled: true, status: 'healthy' };
    } else {
      result.decision_journal = { enabled: true, status: 'degraded', reason: 'decisions directory not found' };
    }
  }

  // negative_knowledge
  if (features.negative_knowledge === false) {
    result.negative_knowledge = { enabled: false, status: 'disabled' };
  } else if (features.negative_knowledge) {
    const nkDir = path.join(planningDir, 'negative-knowledge');
    if (fs.existsSync(nkDir)) {
      result.negative_knowledge = { enabled: true, status: 'healthy' };
    } else {
      result.negative_knowledge = { enabled: true, status: 'degraded', reason: 'negative-knowledge directory not found' };
    }
  }

  // living_requirements
  if (features.living_requirements === false) {
    result.living_requirements = { enabled: false, status: 'disabled' };
  } else if (features.living_requirements) {
    const reqPath = path.join(planningDir, 'REQUIREMENTS.md');
    if (fs.existsSync(reqPath)) {
      const content = fs.readFileSync(reqPath, 'utf-8');
      if (/REQ-/.test(content)) {
        result.living_requirements = { enabled: true, status: 'healthy' };
      } else {
        result.living_requirements = { enabled: true, status: 'degraded', reason: 'REQUIREMENTS.md not found or has no REQ-IDs' };
      }
    } else {
      result.living_requirements = { enabled: true, status: 'degraded', reason: 'REQUIREMENTS.md not found or has no REQ-IDs' };
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function cmdValidateHealth(cwd, options, raw) {
  const planningDir = path.join(cwd, '.planning');
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const statePath = path.join(planningDir, 'STATE.md');
  const configPath = path.join(planningDir, 'config.json');
  const phasesDir = path.join(planningDir, 'phases');

  const errors = [];
  const warnings = [];
  const info = [];
  const repairs = [];

  // Helper to add issue
  const addIssue = (severity, code, message, fix, repairable = false) => {
    const issue = { code, message, fix, repairable };
    if (severity === 'error') errors.push(issue);
    else if (severity === 'warning') warnings.push(issue);
    else info.push(issue);
  };

  // ─── Check 1: .planning/ exists ───────────────────────────────────────────
  if (!fs.existsSync(planningDir)) {
    addIssue('error', 'E001', '.planning/ directory not found', 'Run /pbr:new-project to initialize');
    output({
      status: 'broken',
      errors,
      warnings,
      info,
      repairable_count: 0,
    }, raw);
    return;
  }

  // ─── Check 2: PROJECT.md exists and has required sections ─────────────────
  if (!fs.existsSync(projectPath)) {
    addIssue('error', 'E002', 'PROJECT.md not found', 'Run /pbr:new-project to create');
  } else {
    const content = fs.readFileSync(projectPath, 'utf-8');
    const requiredSections = ['## What This Is', '## Core Value', '## Requirements'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        addIssue('warning', 'W001', `PROJECT.md missing section: ${section}`, 'Add section manually');
      }
    }
  }

  // ─── Check 3: ROADMAP.md exists ───────────────────────────────────────────
  if (!fs.existsSync(roadmapPath)) {
    addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /pbr:new-milestone to create roadmap');
  }

  // ─── Check 4: STATE.md exists and references valid phases ─────────────────
  if (!fs.existsSync(statePath)) {
    addIssue('error', 'E004', 'STATE.md not found', 'Run /pbr:health --repair to regenerate', true);
    repairs.push('regenerateState');
  } else {
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    // Extract phase references from STATE.md
    const phaseRefs = [...stateContent.matchAll(/[Pp]hase\s+(\d+(?:\.\d+)*)/g)].map(m => m[1]);
    // Get disk phases
    const diskPhases = new Set();
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const m = e.name.match(/^(\d+(?:\.\d+)*)/);
          if (m) diskPhases.add(m[1]);
        }
      }
    } catch (err) { logHook('verify', 'debug', 'Failed to read phases for state validation', { error: err.message }); }
    // Check for invalid references
    for (const ref of phaseRefs) {
      const normalizedRef = String(parseInt(ref, 10)).padStart(2, '0');
      if (!diskPhases.has(ref) && !diskPhases.has(normalizedRef) && !diskPhases.has(String(parseInt(ref, 10)))) {
        // Only warn if phases dir has any content (not just an empty project)
        if (diskPhases.size > 0) {
          addIssue('warning', 'W002', `STATE.md references phase ${ref}, but only phases ${[...diskPhases].sort().join(', ')} exist`, 'Run /pbr:health --repair to regenerate STATE.md', true);
          if (!repairs.includes('regenerateState')) repairs.push('regenerateState');
        }
      }
    }
  }

  // ─── Check 5: config.json valid JSON + valid schema ───────────────────────
  if (!fs.existsSync(configPath)) {
    addIssue('warning', 'W003', 'config.json not found', 'Run /pbr:health --repair to create with defaults', true);
    repairs.push('createConfig');
  } else {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Validate known fields
      const validProfiles = ['quality', 'balanced', 'budget'];
      if (parsed.model_profile && !validProfiles.includes(parsed.model_profile)) {
        addIssue('warning', 'W004', `config.json: invalid model_profile "${parsed.model_profile}"`, `Valid values: ${validProfiles.join(', ')}`);
      }
    } catch (err) {
      addIssue('error', 'E005', `config.json: JSON parse error - ${err.message}`, 'Run /pbr:health --repair to reset to defaults', true);
      repairs.push('resetConfig');
    }
  }

  // ─── Check 5b: Nyquist validation key presence ──────────────────────────
  if (fs.existsSync(configPath)) {
    try {
      const configRaw = fs.readFileSync(configPath, 'utf-8');
      const configParsed = JSON.parse(configRaw);
      if (configParsed.workflow && configParsed.workflow.nyquist_validation === undefined) {
        addIssue('warning', 'W008', 'config.json: workflow.nyquist_validation absent (defaults to enabled but agents may skip)', 'Run /pbr:health --repair to add key', true);
        if (!repairs.includes('addNyquistKey')) repairs.push('addNyquistKey');
      }
    } catch (err) { logHook('verify', 'debug', 'Failed to check nyquist key', { error: err.message }); }
  }

  // ─── Check 6: Phase directory naming (NN-name format) ─────────────────────
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.match(/^\d{2}(?:\.\d+)*-[\w-]+$/)) {
        addIssue('warning', 'W005', `Phase directory "${e.name}" doesn't follow NN-name format`, 'Rename to match pattern (e.g., 01-setup)');
      }
    }
  } catch (err) { logHook('verify', 'debug', 'Failed to check phase directory naming', { error: err.message }); }

  // ─── Check 7: Orphaned plans (PLAN without SUMMARY) ───────────────────────
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const phaseFiles = fs.readdirSync(path.join(phasesDir, e.name));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const summaryBases = new Set(summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')));

      for (const plan of plans) {
        const planBase = plan.replace('-PLAN.md', '').replace('PLAN.md', '');
        if (!summaryBases.has(planBase)) {
          addIssue('info', 'I001', `${e.name}/${plan} has no SUMMARY.md`, 'May be in progress');
        }
      }
    }
  } catch (err) { logHook('verify', 'debug', 'Failed to check orphaned plans', { error: err.message }); }

  // ─── Check 7b: Nyquist VALIDATION.md consistency ────────────────────────
  try {
    const phaseEntries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const e of phaseEntries) {
      if (!e.isDirectory()) continue;
      const phaseFiles = fs.readdirSync(path.join(phasesDir, e.name));
      const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md'));
      const hasValidation = phaseFiles.some(f => f.endsWith('-VALIDATION.md'));
      if (hasResearch && !hasValidation) {
        const researchFile = phaseFiles.find(f => f.endsWith('-RESEARCH.md'));
        const researchContent = fs.readFileSync(path.join(phasesDir, e.name, researchFile), 'utf-8');
        if (researchContent.includes('## Validation Architecture')) {
          addIssue('warning', 'W009', `Phase ${e.name}: has Validation Architecture in RESEARCH.md but no VALIDATION.md`, 'Re-run /pbr:plan-phase with --research to regenerate');
        }
      }
    }
  } catch (err) { logHook('verify', 'debug', 'Failed to check nyquist validation', { error: err.message }); }

  // ─── Check 8: Run existing consistency checks ─────────────────────────────
  // Inline subset of cmdValidateConsistency
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    const roadmapPhases = new Set();
    const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
    let m;
    while ((m = phasePattern.exec(roadmapContent)) !== null) {
      roadmapPhases.add(m[1]);
    }

    const diskPhases = new Set();
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const dm = e.name.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
          if (dm) diskPhases.add(dm[1]);
        }
      }
    } catch (err) { logHook('verify', 'debug', 'Failed to read phases for roadmap check', { error: err.message }); }

    // Phases in ROADMAP but not on disk
    for (const p of roadmapPhases) {
      const padded = String(parseInt(p, 10)).padStart(2, '0');
      if (!diskPhases.has(p) && !diskPhases.has(padded)) {
        addIssue('warning', 'W006', `Phase ${p} in ROADMAP.md but no directory on disk`, 'Create phase directory or remove from roadmap');
      }
    }

    // Phases on disk but not in ROADMAP
    for (const p of diskPhases) {
      const unpadded = String(parseInt(p, 10));
      if (!roadmapPhases.has(p) && !roadmapPhases.has(unpadded)) {
        addIssue('warning', 'W007', `Phase ${p} exists on disk but not in ROADMAP.md`, 'Add to roadmap or remove directory');
      }
    }
  }

  // ─── Check 9: Phase 1 feature status ────────────────────────────────────────
  const feature_status = {};
  if (fs.existsSync(configPath)) {
    try {
      const configRaw = fs.readFileSync(configPath, 'utf-8');
      const configParsed = JSON.parse(configRaw);
      const features = configParsed.features || {};
      const workflow = configParsed.workflow || {};

      // enhanced_session_start: default true (enabled unless explicitly false)
      const essEnabled = features.enhanced_session_start !== false;
      feature_status.enhanced_session_start = { enabled: essEnabled, status: essEnabled ? 'healthy' : 'disabled' };

      // context_quality_scoring: default true (enabled unless explicitly false)
      const cqsEnabled = features.context_quality_scoring !== false;
      feature_status.context_quality_scoring = { enabled: cqsEnabled, status: cqsEnabled ? 'healthy' : 'disabled' };

      // skip_rag: default false (enabled only if explicitly true)
      const srEnabled = features.skip_rag === true;
      feature_status.skip_rag = { enabled: srEnabled, status: srEnabled ? 'healthy' : 'disabled' };

      // ─── Phase 8 feature checks ──────────────────────────────────────────

      // graduated_verification: default true; degraded if enabled but no trust data
      const gvEnabled = features.graduated_verification !== false;
      if (!gvEnabled) {
        feature_status.graduated_verification = { enabled: false, status: 'disabled' };
      } else {
        const trustScoresPath = path.join(planningDir, 'trust', 'scores.json');
        const hasTrustData = fs.existsSync(trustScoresPath);
        feature_status.graduated_verification = {
          enabled: true,
          status: hasTrustData ? 'healthy' : 'degraded'
        };
      }

      // self_verification: default true; healthy if enabled, disabled otherwise
      const svEnabled = features.self_verification !== false;
      feature_status.self_verification = {
        enabled: svEnabled,
        status: svEnabled ? 'healthy' : 'disabled'
      };

      // autonomy: check autonomy.level config property
      const autonomyConfig = configParsed.autonomy || {};
      const autonomyLevel = autonomyConfig.level || 'supervised';
      const autonomyExplicit = !!(configParsed.autonomy && configParsed.autonomy.level);
      feature_status.autonomy = {
        enabled: true,
        status: autonomyExplicit ? 'healthy' : 'degraded',
        level: autonomyLevel
      };

      // Validate orchestrator_budget_pct range (15-50)
      const budgetPct = configParsed.orchestrator_budget_pct;
      if (budgetPct !== undefined) {
        if (budgetPct < 15 || budgetPct > 50) {
          addIssue('warning', 'W010', `orchestrator_budget_pct is ${budgetPct}, outside valid range 15-50`, 'Set to a value between 15 and 50 in config.json');
        }
      }

      // ─── Check 10: Phase 2 feature status ──────────────────────────────────────
      // inline_simple_tasks: default true, degraded if enabled but inline_max_files/inline_max_lines missing
      const istEnabled = features.inline_simple_tasks !== false;
      if (istEnabled) {
        const hasMaxFiles = workflow.inline_max_files !== undefined &&
          typeof workflow.inline_max_files === 'number' &&
          workflow.inline_max_files >= 1 && workflow.inline_max_files <= 20;
        const hasMaxLines = workflow.inline_max_lines !== undefined &&
          typeof workflow.inline_max_lines === 'number' &&
          workflow.inline_max_lines >= 10 && workflow.inline_max_lines <= 500;
        if (!hasMaxFiles || !hasMaxLines) {
          feature_status.inline_simple_tasks = { enabled: true, status: 'degraded' };
          addIssue('warning', 'W012', 'inline_simple_tasks enabled but inline_max_files/inline_max_lines not configured or invalid', 'Add workflow.inline_max_files (1-20) and workflow.inline_max_lines (10-500) to config.json');
        } else {
          feature_status.inline_simple_tasks = { enabled: true, status: 'enabled' };
        }
      } else {
        feature_status.inline_simple_tasks = { enabled: false, status: 'disabled' };
      }

      // rich_agent_prompts: default true, no extra validation needed
      const rapEnabled = features.rich_agent_prompts !== false;
      feature_status.rich_agent_prompts = { enabled: rapEnabled, status: rapEnabled ? 'enabled' : 'disabled' };

      // multi_phase_awareness: default true, degraded if enabled but max_phases_in_context missing
      const mpaEnabled = features.multi_phase_awareness !== false;
      if (mpaEnabled) {
        const hasMaxPhases = workflow.max_phases_in_context !== undefined &&
          typeof workflow.max_phases_in_context === 'number' &&
          workflow.max_phases_in_context >= 1 && workflow.max_phases_in_context <= 10;
        if (!hasMaxPhases) {
          feature_status.multi_phase_awareness = { enabled: true, status: 'degraded' };
          addIssue('warning', 'W013', 'multi_phase_awareness enabled but max_phases_in_context not configured or invalid', 'Add workflow.max_phases_in_context (1-10) to config.json');
        } else {
          feature_status.multi_phase_awareness = { enabled: true, status: 'enabled' };
        }
      } else {
        feature_status.multi_phase_awareness = { enabled: false, status: 'disabled' };
      }
    } catch (err) { logHook('verify', 'debug', 'Config parse error (handled in Check 5)', { error: err.message }); }
  }

  // ─── Check 11: Phase 05 feature status ────────────────────────────────────
  {
    let p05Config = {};
    try { p05Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase05', { error: err.message }); }
    var phase05_features = checkPhase05Features(planningDir, p05Config);
  }

  // ─── Check 12: Trust tracking health ──────────────────────────────────────
  {
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for trust', { error: err.message }); }

    if (config.features && config.features.trust_tracking === false) {
      addIssue('info', 'I-TRUST-DISABLED', 'trust_tracking is disabled in config', 'Enable features.trust_tracking in config.json if desired');
    } else {
      const trustFile = path.join(planningDir, 'trust', 'agent-scores.json');
      if (!fs.existsSync(trustFile)) {
        addIssue('info', 'I-TRUST-DEGRADED', 'trust_tracking: degraded — agent-scores.json missing. Will populate after first verification.', 'Run a build cycle to generate trust data');
      } else {
        try {
          const scores = JSON.parse(fs.readFileSync(trustFile, 'utf-8'));
          const agents = Object.keys(scores);
          let totalOutcomes = 0;
          for (const agent of agents) {
            for (const cat of Object.values(scores[agent])) {
              totalOutcomes += (cat.pass || 0) + (cat.fail || 0);
            }
          }
          addIssue('info', 'I-TRUST-HEALTHY', `trust_tracking: healthy — ${agents.length} agents, ${totalOutcomes} outcomes tracked`, '');
        } catch (err) {
          logHook('verify', 'warn', 'Failed to parse agent-scores.json', { error: err.message });
          addIssue('info', 'I-TRUST-DEGRADED', 'trust_tracking: degraded — agent-scores.json exists but is malformed', 'Delete .planning/trust/agent-scores.json to reset');
        }
      }
    }

    if (config.features && config.features.confidence_calibration === false) {
      addIssue('info', 'I-CONFIDENCE-DISABLED', 'confidence_calibration is disabled in config', 'Enable features.confidence_calibration in config.json if desired');
    } else {
      const trustFile = path.join(planningDir, 'trust', 'agent-scores.json');
      if (!fs.existsSync(trustFile)) {
        addIssue('info', 'I-CONFIDENCE-DEGRADED', 'confidence_calibration: degraded — no trust data available', 'Run a build cycle to generate trust data');
      } else {
        try {
          JSON.parse(fs.readFileSync(trustFile, 'utf-8'));
          addIssue('info', 'I-CONFIDENCE-HEALTHY', 'confidence_calibration: healthy — trust data available for calibration', '');
        } catch (err) {
          logHook('verify', 'warn', 'Failed to parse trust data for confidence', { error: err.message });
          addIssue('info', 'I-CONFIDENCE-DEGRADED', 'confidence_calibration: degraded — trust data malformed', 'Delete .planning/trust/agent-scores.json to reset');
        }
      }
    }
  }

  // ─── Check 13: Architecture graph feature health ──────────────────────────
  try {
    const graph = require('./graph');
    const graphHealth = graph.graphHealthCheck(planningDir);
    const guardHealth = graph.guardHealthCheck(planningDir);
    feature_status.architecture_graph = graphHealth;
    feature_status.architecture_guard = guardHealth;
  } catch (err) { logHook('verify', 'debug', 'Graph module not available', { error: err.message }); }

  // ─── Check 14: Phase 15 DX feature health ────────────────────────────────
  {
    let p15Config = {};
    try { p15Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase15', { error: err.message }); }
    const p15Features = (p15Config && p15Config.features) || {};

    const checkDxFeature = (featureName, modulePath, exportName) => {
      const enabled = p15Features[featureName] !== false; // default true
      if (!enabled) {
        return { enabled: false, status: 'disabled', detail: 'Feature disabled in config' };
      }
      try {
        const mod = require(modulePath);
        if (typeof mod[exportName] === 'function') {
          // Attempt a lightweight invocation to confirm operational
          const result = mod[exportName](planningDir, p15Config);
          const operational = result && result.enabled !== false;
          return {
            enabled: true,
            status: operational ? 'healthy' : 'degraded',
            detail: operational ? `${exportName} returned data` : 'Module returned disabled stub',
          };
        }
        return { enabled: true, status: 'degraded', detail: `${exportName} not a function` };
      } catch (err) {
        return { enabled: true, status: 'degraded', detail: `Error: ${err.message}` };
      }
    };

    feature_status.progress_visualization = checkDxFeature(
      'progress_visualization',
      path.join(__dirname, 'progress-visualization.js'),
      'getProgressData'
    );
    feature_status.contextual_help = checkDxFeature(
      'contextual_help',
      path.join(__dirname, 'contextual-help.js'),
      'getContextualHelp'
    );
    feature_status.team_onboarding = checkDxFeature(
      'team_onboarding',
      path.join(__dirname, 'onboarding-generator.js'),
      'generateOnboardingGuide'
    );
  }

  // ─── Check 15: Phase 14 Quality & Safety feature health ───────────────────
  {
    let p14Config = {};
    try { p14Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase14', { error: err.message }); }

    const p14Features = p14Config.features || {};

    // Helper: check a feature module loads correctly
    const checkFeatureHealth = (featureName, configEnabled, modulePath, validationFn) => {
      if (!configEnabled) {
        addIssue('info', `I-${featureName.toUpperCase()}-DISABLED`, `${featureName}: disabled`, `Enable features.${featureName} in config.json if desired`);
        return { enabled: false, status: 'disabled' };
      }
      try {
        const mod = require(modulePath);
        const isValid = validationFn(mod);
        if (isValid) {
          return { enabled: true, status: 'healthy' };
        }
        addIssue('warning', `W-${featureName.toUpperCase()}-DEGRADED`, `${featureName}: degraded (module validation failed)`, `Check ${modulePath} exports`);
        return { enabled: true, status: 'degraded' };
      } catch (err) {
        logHook('verify', 'debug', 'Feature module load failed', { feature: featureName, error: err.message });
        addIssue('warning', `W-${featureName.toUpperCase()}-DEGRADED`, `${featureName}: degraded (module load failed)`, `Ensure ${modulePath} exists and is valid`);
        return { enabled: true, status: 'degraded' };
      }
    };

    // regression_prevention: default true
    const rpEnabled = p14Features.regression_prevention !== false;
    const rpModPath = path.join(__dirname, 'test-selection.js');
    const rpHealth = checkFeatureHealth(
      'regression_prevention',
      rpEnabled,
      rpModPath,
      (mod) => typeof mod.selectTests === 'function'
    );
    if (rpHealth.status === 'healthy') {
      addIssue('info', 'I-RP-HEALTHY', 'regression_prevention: healthy', '');
    }
    feature_status.regression_prevention = rpHealth;

    // security_scanning: default true
    const ssEnabled = p14Features.security_scanning !== false;
    const ssModPath = path.join(__dirname, 'security-scan.js');
    const ssHealth = checkFeatureHealth(
      'security_scanning',
      ssEnabled,
      ssModPath,
      (mod) => Array.isArray(mod.SECURITY_RULES) && mod.SECURITY_RULES.length > 0
    );
    if (ssHealth.status === 'healthy') {
      try {
        const ssMod = require(ssModPath);
        const ruleCount = ssMod.SECURITY_RULES.length;
        addIssue('info', 'I-SS-HEALTHY', `security_scanning: healthy (${ruleCount} rules loaded)`, '');
      } catch (err) { logHook('verify', 'debug', 'Failed to load security rules', { error: err.message }); }
    }
    feature_status.security_scanning = ssHealth;
  }

  // ─── Check 16: Phase 11 Spec-Driven Development feature health ───────────
  {
    let p11Config = {};
    try { p11Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase11', { error: err.message }); }
    const p11Features = p11Config.features || {};

    const checkSpecFeatureHealth = (featureName, defaultEnabled, modulePath, exportName) => {
      const isEnabled = p11Features[featureName] === undefined ? defaultEnabled : p11Features[featureName];
      if (!isEnabled) {
        return { status: 'disabled', enabled: false, details: 'Feature toggle off' };
      }
      try {
        const mod = require(modulePath);
        if (typeof mod[exportName] === 'function') {
          return { status: 'healthy', enabled: true, details: `${exportName} loaded` };
        }
        return { status: 'degraded', enabled: true, details: `${exportName} not a function` };
      } catch (err) {
        logHook('verify', 'debug', 'Cannot load spec module', { error: err.message });
        return { status: 'degraded', enabled: true, details: `Cannot load module: ${err.message}` };
      }
    };

    feature_status.machine_executable_plans = checkSpecFeatureHealth(
      'machine_executable_plans', false, path.join(__dirname, 'spec-engine.js'), 'parsePlanToSpec'
    );
    feature_status.spec_diffing = checkSpecFeatureHealth(
      'spec_diffing', true, path.join(__dirname, 'spec-diff.js'), 'diffSpecs'
    );
    feature_status.reverse_spec = checkSpecFeatureHealth(
      'reverse_spec', true, path.join(__dirname, 'reverse-spec.js'), 'generateReverseSpec'
    );
    feature_status.predictive_impact = checkSpecFeatureHealth(
      'predictive_impact', true, path.join(__dirname, 'impact-analysis.js'), 'analyzeImpact'
    );
  }

  // ─── Check 17: Phase 16 cross-project intelligence feature health ────────
  {
    let p16Config = {};
    try { p16Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase16', { error: err.message }); }
    const p16Features = p16Config.features || {};

    // Helper: check if a feature is enabled (default true unless explicitly false)
    const checkFeatureToggle = (key, healthCheck) => {
      const enabled = p16Features[key] !== false;
      if (!enabled) {
        return { enabled: false, status: 'disabled' };
      }
      return { enabled: true, status: healthCheck() ? 'healthy' : 'degraded' };
    };

    // cross_project_patterns: healthy if ~/.claude/patterns/ exists and has .json files
    feature_status.cross_project_patterns = checkFeatureToggle(
      'cross_project_patterns',
      () => {
        try {
          const patternsDir = require('path').join(require('os').homedir(), '.claude', 'patterns');
          return fs.existsSync(patternsDir) &&
            fs.readdirSync(patternsDir).some(f => f.endsWith('.json'));
        } catch (err) { logHook('verify', 'debug', 'Failed to check patterns dir', { error: err.message }); return false; }
      }
    );

    // spec_templates: always healthy when enabled (built-in templates always available)
    feature_status.spec_templates = checkFeatureToggle(
      'spec_templates',
      () => true
    );

    // global_learnings: healthy if ~/.claude/learnings.jsonl exists
    feature_status.global_learnings = checkFeatureToggle(
      'global_learnings',
      () => {
        try {
          const learningsPath = require('path').join(require('os').homedir(), '.claude', 'learnings.jsonl');
          return fs.existsSync(learningsPath);
        } catch (err) { logHook('verify', 'debug', 'Failed to check learnings path', { error: err.message }); return false; }
      }
    );
  }

  // ─── Check 18: Phase 3 (zero-friction) feature status ────────────────────
  {
    let p3Config = {};
    try { p3Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase3', { error: err.message }); }
    const p3Features = p3Config.features || {};

    const zfqEnabled = p3Features.zero_friction_quick !== false;
    feature_status.zero_friction_quick = {
      enabled: zfqEnabled,
      status: zfqEnabled ? 'healthy' : 'disabled',
    };
  }

  // ─── Check 19: Phase 4 (NL routing) feature status ───────────────────────
  {
    let p4Config = {};
    try { p4Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase4', { error: err.message }); }
    const p4Features = p4Config.features || {};
    const pluginRoot = path.resolve(__dirname, '..', '..', '..', 'plugins', 'pbr');

    // natural_language_routing: default true; try to load module
    const nlrEnabled = p4Features.natural_language_routing !== false;
    if (!nlrEnabled) {
      feature_status.natural_language_routing = { enabled: false, status: 'disabled' };
    } else {
      try {
        require(path.join(pluginRoot, 'scripts', 'lib', 'alternatives.js'));
        feature_status.natural_language_routing = { enabled: true, status: 'healthy' };
      } catch (err) {
        logHook('verify', 'debug', 'Failed to load alternatives.js', { error: err.message });
        feature_status.natural_language_routing = { enabled: true, status: 'degraded' };
      }
    }

    // adaptive_ceremony: default true; workflow-only feature, no module
    const acEnabled = p4Features.adaptive_ceremony !== false;
    feature_status.adaptive_ceremony = {
      enabled: acEnabled,
      status: acEnabled ? 'healthy' : 'disabled',
    };
  }

  // ─── Check 20: Phase 6 (convention memory) feature status ────────────────
  {
    let p6Config = {};
    try { p6Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase6', { error: err.message }); }
    const p6Features = p6Config.features || {};
    const pluginRoot = path.resolve(__dirname, '..', '..', '..', 'plugins', 'pbr');

    // convention_memory: default true; try to load module
    const cmEnabled = p6Features.convention_memory !== false;
    if (!cmEnabled) {
      feature_status.convention_memory = { enabled: false, status: 'disabled' };
    } else {
      try {
        require(path.join(pluginRoot, 'scripts', 'lib', 'convention-detector.js'));
        feature_status.convention_memory = { enabled: true, status: 'healthy' };
      } catch (err) {
        logHook('verify', 'debug', 'Failed to load convention-detector.js', { error: err.message });
        feature_status.convention_memory = { enabled: true, status: 'degraded' };
      }
    }

    // mental_model_snapshots: default true; try to load module
    const mmsEnabled = p6Features.mental_model_snapshots !== false;
    if (!mmsEnabled) {
      feature_status.mental_model_snapshots = { enabled: false, status: 'disabled' };
    } else {
      try {
        require(path.join(pluginRoot, 'scripts', 'lib', 'snapshot-manager.js'));
        feature_status.mental_model_snapshots = { enabled: true, status: 'healthy' };
      } catch (err) {
        logHook('verify', 'debug', 'Failed to load snapshot-manager.js', { error: err.message });
        feature_status.mental_model_snapshots = { enabled: true, status: 'degraded' };
      }
    }
  }

  // ─── Check 21: Phase 9 (proactive intelligence) feature status ───────────
  {
    let p9Config = {};
    try { p9Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase9', { error: err.message }); }
    const scriptsDir = path.resolve(__dirname, '..', '..', '..', 'plugins', 'pbr', 'scripts');
    const { checkFeatureHealth: checkPhase9FeatureHealth } = require('./health');
    const phase9Features = [
      'smart_next_task',
      'dependency_break_detection',
      'pre_research',
      'pattern_routing',
      'tech_debt_surfacing',
    ];
    for (const name of phase9Features) {
      const result = checkPhase9FeatureHealth(name, p9Config, scriptsDir);
      feature_status[name] = { enabled: result.status !== 'disabled', status: result.status };
    }
  }

  // ─── Check 22: Phase 10 (post-hoc) feature status ────────────────────────
  {
    const p10ModPath = path.resolve(__dirname, '..', '..', '..', 'plugins', 'pbr', 'scripts', 'lib', 'health-checks.js');
    try {
      const p10Checks = require(p10ModPath);
      const postHocResult = p10Checks.checkPostHocArtifacts(planningDir);
      feature_status.post_hoc_artifacts = {
        enabled: postHocResult.enabled,
        status: postHocResult.status,
      };
      const feedbackResult = p10Checks.checkAgentFeedbackLoop(planningDir);
      feature_status.agent_feedback_loop = {
        enabled: feedbackResult.enabled,
        status: feedbackResult.status,
      };
      const metricsResult = p10Checks.checkSessionMetrics(planningDir);
      feature_status.session_metrics = {
        enabled: metricsResult.enabled,
        status: metricsResult.status,
      };
    } catch (err) {
      logHook('verify', 'debug', 'Failed to load health-checks.js', { error: err.message });
      // health-checks.js not available — mark all as degraded
      feature_status.post_hoc_artifacts = { enabled: true, status: 'degraded' };
      feature_status.agent_feedback_loop = { enabled: true, status: 'degraded' };
      feature_status.session_metrics = { enabled: true, status: 'degraded' };
    }
  }

  // ─── Check 23: Phase 13 (multi-agent) feature status ─────────────────────
  {
    let p13Config = {};
    try { p13Config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (err) { logHook('verify', 'debug', 'Failed to parse config for phase13', { error: err.message }); }
    const { checkMultiAgentHealth } = require('./health');
    const multiAgentResults = checkMultiAgentHealth(p13Config);
    for (const result of multiAgentResults) {
      feature_status[result.feature] = {
        enabled: result.status !== 'disabled',
        status: result.status,
      };
    }
  }

  // ─── Perform repairs if requested ─────────────────────────────────────────
  const repairActions = [];
  if (options.repair && repairs.length > 0) {
    for (const repair of repairs) {
      try {
        switch (repair) {
          case 'createConfig':
          case 'resetConfig': {
            const defaults = {
              model_profile: 'balanced',
              commit_docs: true,
              search_gitignored: false,
              branching_strategy: 'none',
              research: true,
              plan_checker: true,
              verifier: true,
              parallelization: true,
            };
            fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'config.json' });
            break;
          }
          case 'regenerateState': {
            // Create timestamped backup before overwriting
            if (fs.existsSync(statePath)) {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const backupPath = `${statePath}.bak-${timestamp}`;
              fs.copyFileSync(statePath, backupPath);
              repairActions.push({ action: 'backupState', success: true, path: backupPath });
            }
            // Generate minimal STATE.md from ROADMAP.md structure
            const milestone = getMilestoneInfo(cwd);
            let stateContent = `# Session State\n\n`;
            stateContent += `## Project Reference\n\n`;
            stateContent += `See: .planning/PROJECT.md\n\n`;
            stateContent += `## Position\n\n`;
            stateContent += `**Milestone:** ${milestone.version} ${milestone.name}\n`;
            stateContent += `**Current phase:** (determining...)\n`;
            stateContent += `**Status:** Resuming\n\n`;
            stateContent += `## Session Log\n\n`;
            stateContent += `- ${new Date().toISOString().split('T')[0]}: STATE.md regenerated by /pbr:health --repair\n`;
            fs.writeFileSync(statePath, stateContent, 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'STATE.md' });
            break;
          }
          case 'addNyquistKey': {
            if (fs.existsSync(configPath)) {
              try {
                const configRaw = fs.readFileSync(configPath, 'utf-8');
                const configParsed = JSON.parse(configRaw);
                if (!configParsed.workflow) configParsed.workflow = {};
                if (configParsed.workflow.nyquist_validation === undefined) {
                  configParsed.workflow.nyquist_validation = true;
                  fs.writeFileSync(configPath, JSON.stringify(configParsed, null, 2), 'utf-8');
                }
                repairActions.push({ action: repair, success: true, path: 'config.json' });
              } catch (err) {
                repairActions.push({ action: repair, success: false, error: err.message });
              }
            }
            break;
          }
        }
      } catch (err) {
        repairActions.push({ action: repair, success: false, error: err.message });
      }
    }
  }

  // ─── Determine overall status ─────────────────────────────────────────────
  let status;
  if (errors.length > 0) {
    status = 'broken';
  } else if (warnings.length > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const repairableCount = errors.filter(e => e.repairable).length +
                         warnings.filter(w => w.repairable).length;

  output({
    status,
    errors,
    warnings,
    info,
    repairable_count: repairableCount,
    repairs_performed: repairActions.length > 0 ? repairActions : undefined,
    feature_status: Object.keys(feature_status).length > 0 ? feature_status : undefined,
    phase05_features: phase05_features || undefined,
  }, raw);
}

/**
 * Generic health check for a feature backed by a loadable module.
 * @param {string} featureName - Feature name (e.g. 'natural_language_routing')
 * @param {string} planningDir - Path to .planning directory
 * @param {string} pluginRoot - Path to plugin root (plugins/pbr)
 * @param {string} togglePath - Dot path in config.features (same as featureName)
 * @param {string} modulePath - Relative path under pluginRoot to the module
 * @param {string} exportName - Name of the expected export function
 * @returns {{ feature: string, status: string, details: string }}
 */
function checkFeatureModuleHealth(featureName, planningDir, pluginRoot, modulePath, exportName) {
  const configPath = path.join(planningDir, 'config.json');
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    logHook('verify', 'debug', 'Config unreadable for feature health', { error: err.message });
    // Config unreadable — treat as defaults
  }

  const features = config.features || {};

  // Check toggle (default true)
  if (features[featureName] === false) {
    return { feature: featureName, status: 'disabled', details: 'Feature toggle off' };
  }

  // Try to load the module
  const fullModulePath = path.join(pluginRoot, modulePath);
  try {
    const mod = require(fullModulePath);
    if (typeof mod[exportName] === 'function') {
      return { feature: featureName, status: 'healthy', details: `${exportName} loaded from ${modulePath}` };
    }
    return { feature: featureName, status: 'degraded', details: `${exportName} not a function in ${modulePath}` };
  } catch (err) {
    return { feature: featureName, status: 'degraded', details: `Cannot load ${modulePath}: ${err.message}` };
  }
}

/**
 * Health check for natural_language_routing feature.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} pluginRoot - Path to plugin root (plugins/pbr)
 * @returns {{ feature: string, status: string, details: string }}
 */
function checkNLRoutingHealth(planningDir, pluginRoot) {
  return checkFeatureModuleHealth(
    'natural_language_routing', planningDir, pluginRoot,
    path.join('scripts', 'intent-router.cjs'), 'classifyIntent'
  );
}

/**
 * Health check for adaptive_ceremony feature.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} pluginRoot - Path to plugin root (plugins/pbr)
 * @returns {{ feature: string, status: string, details: string }}
 */
function checkAdaptiveCeremonyHealth(planningDir, pluginRoot) {
  return checkFeatureModuleHealth(
    'adaptive_ceremony', planningDir, pluginRoot,
    path.join('scripts', 'risk-classifier.cjs'), 'classifyRisk'
  );
}

module.exports = {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
  cmdValidateConsistency,
  cmdValidateHealth,
  checkNLRoutingHealth,
  checkAdaptiveCeremonyHealth,
  checkFeatureModuleHealth,
};

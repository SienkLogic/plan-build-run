'use strict';

/**
 * Workflow Compliance Check Module
 *
 * Implements WC-02, WC-03, WC-04, WC-08 workflow compliance dimensions
 * for the PBR audit system. Each check returns a structured result:
 * { dimension, status, message, evidence }.
 *
 * Checks:
 *   WC-02: State file integrity (STATE.md matches disk)
 *   WC-03: STATE.md frontmatter integrity (valid YAML, required fields)
 *   WC-04: ROADMAP sync validation (ROADMAP.md matches phase directories)
 *   WC-08: Naming convention compliance (PLAN-{NN}.md format)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "WC-02")
 * @param {'pass'|'warn'|'fail'} status
 * @param {string} message
 * @param {string[]} [evidence]
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function result(dimCode, status, message, evidence) {
  return {
    dimension: dimCode,
    status,
    message,
    evidence: evidence || [],
  };
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (lightweight, no external deps)
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from markdown content as key-value pairs.
 * Handles both \n and \r\n line endings.
 * @param {string} content
 * @returns {object} Parsed frontmatter fields
 */
function parseFrontmatter(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return {};

  const fields = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const match = lines[i].match(/^(\w[\w_-]*):\s*(.*)$/);
    if (match) {
      let value = match[2].trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Parse arrays (simple single-line format)
      if (value === '[]') {
        value = [];
      } else if (value === 'null' || value === '') {
        value = value === 'null' ? null : value;
      }
      fields[match[1]] = value;
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// WC-02: State File Integrity
// ---------------------------------------------------------------------------

/**
 * Check STATE.md integrity against actual phase directories.
 * Cross-references current_phase, phases_total, and status against disk.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkStateFileIntegrity(planningDir, _config) {
  const statePath = path.join(planningDir, 'STATE.md');
  let content;

  try {
    content = fs.readFileSync(statePath, 'utf8');
  } catch (_e) {
    return result('WC-02', 'fail', 'STATE.md not found', [
      `Expected at: ${statePath}`,
    ]);
  }

  const fm = parseFrontmatter(content);
  const evidence = [];

  // Get actual phase directories
  const phasesDir = path.join(planningDir, 'phases');
  let actualDirs = [];
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    actualDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch (_e) {
    evidence.push('Could not read phases/ directory');
  }

  const actualCount = actualDirs.length;

  // Check phases_total against actual directory count
  const phasesTotal = parseInt(fm.phases_total, 10);
  if (!isNaN(phasesTotal) && phasesTotal !== actualCount) {
    evidence.push(
      `phases_total=${phasesTotal} but ${actualCount} phase directories on disk`
    );
  }

  // Check current_phase refers to existing directory
  const currentPhase = parseInt(fm.current_phase, 10);
  if (!isNaN(currentPhase)) {
    const prefix = String(currentPhase).padStart(2, '0') + '-';
    const hasDir = actualDirs.some(d => d.startsWith(prefix));
    if (!hasDir && actualDirs.length > 0) {
      evidence.push(
        `current_phase=${currentPhase} but no directory starting with "${prefix}" in phases/`
      );
    }
  }

  // If status is building/built, verify current phase dir has PLAN files
  const status = fm.status;
  if (status === 'building' || status === 'built') {
    const prefix = String(currentPhase).padStart(2, '0') + '-';
    const phaseDir = actualDirs.find(d => d.startsWith(prefix));
    if (phaseDir) {
      const phasePath = path.join(phasesDir, phaseDir);
      try {
        const files = fs.readdirSync(phasePath);
        const planFiles = files.filter(f => /^PLAN.*\.md$/i.test(f));
        if (planFiles.length === 0) {
          evidence.push(
            `Status is "${status}" but phase dir "${phaseDir}" has no PLAN files`
          );
        }
      } catch (_e) {
        evidence.push(`Could not read phase dir "${phaseDir}"`);
      }
    }
  }

  if (evidence.length === 0) {
    return result('WC-02', 'pass', 'STATE.md aligns with disk state');
  }

  // Critical mismatches (missing dirs, wrong phase) = fail; minor = warn
  const hasCritical = evidence.some(
    e => e.includes('not found') || e.includes('no directory')
  );

  return result(
    'WC-02',
    hasCritical ? 'fail' : 'warn',
    `STATE.md has ${evidence.length} mismatch(es) with disk`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-03: STATE.md Frontmatter Integrity
// ---------------------------------------------------------------------------

/**
 * Validate STATE.md YAML frontmatter for required fields and correct types.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkStateFrontmatterIntegrity(planningDir, _config) {
  const statePath = path.join(planningDir, 'STATE.md');
  let content;

  try {
    content = fs.readFileSync(statePath, 'utf8');
  } catch (_e) {
    return result('WC-03', 'fail', 'STATE.md not found', [
      `Expected at: ${statePath}`,
    ]);
  }

  const fm = parseFrontmatter(content);
  const evidence = [];

  // Required fields
  const requiredFields = [
    'version', 'current_phase', 'phase_slug', 'status',
    'phases_total', 'plans_total', 'last_activity',
  ];

  const missingFields = [];
  for (const field of requiredFields) {
    if (fm[field] === undefined || fm[field] === '') {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    evidence.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Type validations
  const validStatuses = [
    'not_started', 'discussed', 'ready_to_plan', 'planning', 'planned',
    'ready_to_execute', 'building', 'built', 'partial', 'verified',
    'needs_fixes', 'complete', 'skipped',
  ];

  if (fm.version !== undefined) {
    const ver = Number(fm.version);
    if (isNaN(ver)) {
      evidence.push(`version "${fm.version}" is not a number`);
    }
  }

  if (fm.current_phase !== undefined) {
    const cp = Number(fm.current_phase);
    if (isNaN(cp)) {
      evidence.push(`current_phase "${fm.current_phase}" is not a number`);
    }
  }

  if (fm.status !== undefined && !validStatuses.includes(fm.status)) {
    evidence.push(
      `status "${fm.status}" is not a valid status (expected one of: ${validStatuses.join(', ')})`
    );
  }

  if (fm.phases_total !== undefined) {
    const pt = Number(fm.phases_total);
    if (isNaN(pt)) {
      evidence.push(`phases_total "${fm.phases_total}" is not numeric`);
    }
  }

  if (fm.plans_total !== undefined) {
    const plt = Number(fm.plans_total);
    if (isNaN(plt)) {
      evidence.push(`plans_total "${fm.plans_total}" is not numeric`);
    }
  }

  if (evidence.length === 0) {
    return result('WC-03', 'pass', 'STATE.md frontmatter is valid');
  }

  // Missing required fields = fail, type issues = warn
  const hasMissing = missingFields.length > 0;

  return result(
    'WC-03',
    hasMissing ? 'fail' : 'warn',
    `STATE.md frontmatter has ${evidence.length} issue(s)`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-04: ROADMAP Sync Validation
// ---------------------------------------------------------------------------

/**
 * Validate ROADMAP.md phase entries match actual phase directories on disk.
 * Detects orphan directories (on disk but not in ROADMAP) and phantom phases
 * (in ROADMAP but not on disk).
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkRoadmapSyncValidation(planningDir, _config) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  let content;

  try {
    content = fs.readFileSync(roadmapPath, 'utf8');
  } catch (_e) {
    return result('WC-04', 'fail', 'ROADMAP.md not found', [
      `Expected at: ${roadmapPath}`,
    ]);
  }

  // Get actual phase directories
  const phasesDir = path.join(planningDir, 'phases');
  let actualDirs = [];
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    actualDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch (_e) {
    return result('WC-04', 'warn', 'Could not read phases/ directory', [
      `Expected at: ${phasesDir}`,
    ]);
  }

  // Extract actual phase numbers from disk
  const diskPhaseNums = new Set();
  for (const dir of actualDirs) {
    const num = parseInt(dir.substring(0, 2), 10);
    if (!isNaN(num)) diskPhaseNums.add(num);
  }

  // Extract phase entries from ROADMAP.md
  // Look for patterns like:
  //   "| N. Name |" in progress tables
  //   "### Phase N: Name"
  //   "| {N}. {name} |"
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const roadmapPhaseNums = new Set();

  // Find the active milestone section (look for "## Progress" or most recent non-COMPLETED milestone)
  // We scan the entire file for phase references under the active milestone
  let inActiveMilestone = false;
  for (const line of lines) {
    // Detect active milestone sections (not COMPLETED)
    if (/^##\s+Milestone:.*(?:ACTIVE|COMPLETED)/i.test(line)) {
      inActiveMilestone = !line.includes('COMPLETED');
    }
    if (/^##\s+Progress\b/.test(line)) {
      inActiveMilestone = true;
    }

    if (!inActiveMilestone) continue;

    // Match table rows: "| N. Name |" or "|N. Name|"
    const tableMatch = line.match(/\|\s*(\d{1,2})\.\s+/);
    if (tableMatch) {
      roadmapPhaseNums.add(parseInt(tableMatch[1], 10));
    }

    // Match headers: "### Phase N: Name" or "### Phase NN: Name"
    const headerMatch = line.match(/^###\s+Phase\s+(\d{1,2})\b/);
    if (headerMatch) {
      roadmapPhaseNums.add(parseInt(headerMatch[1], 10));
    }
  }

  const evidence = [];

  // Orphan directories: on disk but not in ROADMAP
  for (const num of diskPhaseNums) {
    if (!roadmapPhaseNums.has(num)) {
      const dirName = actualDirs.find(d => parseInt(d.substring(0, 2), 10) === num);
      evidence.push(`Orphan directory: "${dirName}" (phase ${num}) not in ROADMAP`);
    }
  }

  // Phantom phases: in ROADMAP but not on disk
  for (const num of roadmapPhaseNums) {
    if (!diskPhaseNums.has(num)) {
      evidence.push(`Phantom phase: phase ${num} in ROADMAP but no directory on disk`);
    }
  }

  if (evidence.length === 0) {
    return result('WC-04', 'pass', 'ROADMAP.md aligns with phase directories');
  }

  return result('WC-04', 'fail',
    `ROADMAP has ${evidence.length} sync issue(s) with disk`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-08: Naming Convention Compliance
// ---------------------------------------------------------------------------

/**
 * Scan all phase directories for PLAN files and verify they follow
 * the PLAN-{NN}.md naming convention.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkNamingConventionCompliance(planningDir, _config) {
  const phasesDir = path.join(planningDir, 'phases');
  let phaseDirs;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    phaseDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch (_e) {
    return result('WC-08', 'warn', 'Could not read phases/ directory');
  }

  const conformingPattern = /^PLAN-\d{2}\.md$/;
  const planFilePattern = /^PLAN.*\.md$/i;
  const evidence = [];

  for (const dir of phaseDirs) {
    const dirPath = path.join(phasesDir, dir);
    let files;
    try {
      files = fs.readdirSync(dirPath);
    } catch (_e) {
      continue;
    }

    const planFiles = files.filter(f => planFilePattern.test(f));
    for (const planFile of planFiles) {
      if (!conformingPattern.test(planFile)) {
        evidence.push(`${dir}/${planFile} does not match PLAN-{NN}.md convention`);
      }
    }
  }

  if (evidence.length === 0) {
    return result('WC-08', 'pass', 'All PLAN files follow naming convention');
  }

  return result('WC-08', 'warn',
    `${evidence.length} PLAN file(s) do not follow naming convention`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-05: Planning Artifact Completeness
// ---------------------------------------------------------------------------

/**
 * Check that built phases have both SUMMARY and VERIFICATION artifacts.
 * Detects phases marked as built/complete that are missing required artifacts.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkPlanningArtifactCompleteness(planningDir, _config) {
  const phasesDir = path.join(planningDir, 'phases');
  let phaseDirs;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    phaseDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch (_e) {
    return result('WC-05', 'warn', 'Could not read phases/ directory');
  }

  // Read ROADMAP.md to detect phases marked as complete/verified
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  let roadmapContent = '';
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf8').replace(/\r\n/g, '\n');
  } catch (_e) {
    // No roadmap — can only check by artifact presence
  }

  const evidence = [];

  for (const dir of phaseDirs) {
    const dirPath = path.join(phasesDir, dir);
    let files;
    try {
      files = fs.readdirSync(dirPath);
    } catch (_e) {
      continue;
    }

    const summaryFiles = files.filter(f => /^SUMMARY.*\.md$/i.test(f));
    const verificationFiles = files.filter(f => /^VERIFICATION.*\.md$/i.test(f));
    const planFiles = files.filter(f => /^PLAN.*\.md$/i.test(f));

    // If SUMMARY exists (indicates phase was built) but no VERIFICATION
    if (summaryFiles.length > 0 && verificationFiles.length === 0) {
      evidence.push(
        `Phase "${dir}" built (has SUMMARY) but missing VERIFICATION.md`
      );
    }

    // Check ROADMAP for phases marked complete/verified but missing artifacts
    if (roadmapContent) {
      const phaseNum = parseInt(dir.substring(0, 2), 10);
      // Look for phase in roadmap marked as Complete or Verified
      const completePat = new RegExp(
        `\\|\\s*${phaseNum}\\.\\s+[^|]*\\|[^|]*(?:Complete|Verified|Built)`,
        'i'
      );
      if (completePat.test(roadmapContent)) {
        if (planFiles.length > 0 && summaryFiles.length === 0) {
          evidence.push(
            `Phase "${dir}" marked complete in ROADMAP but has no SUMMARY files`
          );
        }
      }
    }
  }

  if (evidence.length === 0) {
    return result('WC-05', 'pass', 'All built phases have required artifacts');
  }

  return result('WC-05', 'warn',
    `${evidence.length} artifact completeness gap(s) found`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-06: Artifact Format Validation
// ---------------------------------------------------------------------------

/**
 * Validate SUMMARY.md required fields and PLAN.md task block structure.
 * Checks SUMMARY frontmatter for requires, key_files, deferred fields
 * and PLAN files for at least one <task XML block.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkArtifactFormatValidation(planningDir, _config) {
  const phasesDir = path.join(planningDir, 'phases');
  let phaseDirs;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    phaseDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch (_e) {
    return result('WC-06', 'warn', 'Could not read phases/ directory');
  }

  const evidence = [];

  for (const dir of phaseDirs) {
    const dirPath = path.join(phasesDir, dir);
    let files;
    try {
      files = fs.readdirSync(dirPath);
    } catch (_e) {
      continue;
    }

    // Validate SUMMARY files
    const summaryFiles = files.filter(f => /^SUMMARY.*\.md$/i.test(f));
    for (const sf of summaryFiles) {
      try {
        const content = fs.readFileSync(path.join(dirPath, sf), 'utf8');
        const fm = parseFrontmatter(content);
        const missingFields = [];

        if (fm.requires === undefined) missingFields.push('requires');
        if (fm.key_files === undefined) missingFields.push('key_files');
        if (fm.deferred === undefined) missingFields.push('deferred');

        if (missingFields.length > 0) {
          evidence.push(
            `${dir}/${sf}: missing required fields: ${missingFields.join(', ')}`
          );
        }
      } catch (_e) {
        evidence.push(`${dir}/${sf}: could not read file`);
      }
    }

    // Validate PLAN files have at least one <task block
    const planFiles = files.filter(f => /^PLAN.*\.md$/i.test(f));
    for (const pf of planFiles) {
      try {
        const content = fs.readFileSync(path.join(dirPath, pf), 'utf8');
        if (!/<task\s/.test(content)) {
          evidence.push(`${dir}/${pf}: no <task XML block found`);
        }
      } catch (_e) {
        evidence.push(`${dir}/${pf}: could not read file`);
      }
    }
  }

  if (evidence.length === 0) {
    return result('WC-06', 'pass', 'All artifacts conform to format requirements');
  }

  return result('WC-06', 'warn',
    `${evidence.length} format violation(s) found`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkStateFileIntegrity,
  checkStateFrontmatterIntegrity,
  checkRoadmapSyncValidation,
  checkNamingConventionCompliance,
  checkPlanningArtifactCompleteness,
  checkArtifactFormatValidation,
};

'use strict';

/**
 * Workflow Compliance Check Module
 *
 * Implements WC-02, WC-03, WC-04, WC-05, WC-06, WC-08, WC-09, WC-12
 * workflow compliance dimensions for the PBR audit system. Each check
 * returns a structured result: { dimension, status, message, evidence }.
 *
 * Checks:
 *   WC-01: CI verification after push (gh run list/view/watch after git push)
 *   WC-02: State file integrity (STATE.md matches disk)
 *   WC-03: STATE.md frontmatter integrity (valid YAML, required fields)
 *   WC-04: ROADMAP sync validation (ROADMAP.md matches phase directories)
 *   WC-05: Planning artifact completeness (SUMMARY + VERIFICATION)
 *   WC-06: Artifact format validation (required fields, task blocks)
 *   WC-07: Compaction quality (STATE.md preservation after compact events)
 *   WC-08: Naming convention compliance (PLAN-{NN}.md format)
 *   WC-09: Commit pattern validation (heredoc, --no-verify detection)
 *   WC-10: Model selection compliance (agent model vs config.models)
 *   WC-11: Git branching compliance (phase branches when git.branching=phase)
 *   WC-12: Test health baseline comparison
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { extractFrontmatter } = require('../lib/frontmatter');

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
// Session log helper (shared by WC-01, WC-07, WC-09, WC-10)
// ---------------------------------------------------------------------------

/**
 * Find session JSONL log files for the current project.
 * Returns an array of absolute paths to the most recent log files.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {number} [maxFiles=5] - Maximum number of log files to return
 * @returns {string[]}
 */
function findSessionLogs(planningDir, maxFiles) {
  if (maxFiles === undefined) maxFiles = 5;
  const projectRoot = path.resolve(planningDir, '..');
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const encodedPath = projectRoot.replace(/[/\\:]/g, '-').replace(/^-+/, '');
  const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');
  const sessionLogs = [];

  try {
    const projectDirs = fs.readdirSync(claudeProjectsDir);
    for (const dir of projectDirs) {
      if (encodedPath.includes(dir) || dir.includes('plan-build-run')) {
        const fullDir = path.join(claudeProjectsDir, dir);
        try {
          const stat = fs.statSync(fullDir);
          if (!stat.isDirectory()) continue;
          const files = fs.readdirSync(fullDir);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          const paths = jsonlFiles
            .sort()
            .slice(-maxFiles)
            .map(f => path.join(fullDir, f));
          sessionLogs.push(...paths);
        } catch (_e) {
          // skip
        }
      }
    }
  } catch (_e) {
    // No session logs directory
  }

  return sessionLogs;
}

/**
 * Parse session JSONL entries from a list of log files.
 * Returns an array of parsed JSON objects.
 * @param {string[]} logFiles
 * @returns {object[]}
 */
function parseSessionEntries(logFiles) {
  const entries = [];
  for (const logFile of logFiles) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch (_e) {
          // skip malformed lines
        }
      }
    } catch (_e) {
      // skip unreadable files
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// WC-01: CI Verification After Push
// ---------------------------------------------------------------------------

/**
 * Detect git push commands not followed by CI verification (gh run list/view/watch).
 * Scans session JSONL logs for Bash tool_use entries.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkCiVerifyAfterPush(planningDir, _config) {
  const logFiles = findSessionLogs(planningDir);

  if (logFiles.length === 0) {
    return result('WC-01', 'pass', 'No session logs available');
  }

  const entries = parseSessionEntries(logFiles);
  const evidence = [];

  // Find all Bash tool_use entries and index them
  const bashEntries = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const command = entry.command ||
      (entry.input && entry.input.command ? entry.input.command : '');
    if (command && (entry.type === 'tool_use' || entry.type === 'assistant')) {
      bashEntries.push({ index: i, command });
    }
  }

  // For each git push, look for CI check in next 10 tool calls
  for (let b = 0; b < bashEntries.length; b++) {
    const { command } = bashEntries[b];
    if (!command.includes('git push')) continue;

    let foundCiCheck = false;
    const lookAhead = Math.min(b + 10, bashEntries.length);
    for (let j = b + 1; j < lookAhead; j++) {
      const nextCmd = bashEntries[j].command;
      if (/gh\s+run\s+(list|view|watch)/.test(nextCmd)) {
        foundCiCheck = true;
        break;
      }
    }

    if (!foundCiCheck) {
      const snippet = command.substring(0, 120);
      evidence.push(`git push at entry ${bashEntries[b].index} not followed by CI check: "${snippet}"`);
    }
  }

  if (evidence.length === 0) {
    return result('WC-01', 'pass', 'All git pushes followed by CI verification');
  }

  return result('WC-01', 'warn',
    `${evidence.length} git push(es) without CI verification`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-07: Compaction Quality
// ---------------------------------------------------------------------------

/**
 * Detect STATE.md content loss after compaction events.
 * Scans session JSONL for compact events and checks STATE.md integrity.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkCompactionQuality(planningDir, _config) {
  const logFiles = findSessionLogs(planningDir);

  if (logFiles.length === 0) {
    return result('WC-07', 'pass', 'No session logs available');
  }

  const entries = parseSessionEntries(logFiles);
  const evidence = [];

  // Find compact events
  const compactIndices = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const toolName = entry.tool || entry.name ||
      (entry.input && entry.input.tool ? entry.input.tool : '');
    const content = typeof entry.content === 'string' ? entry.content : '';

    if (toolName === 'Compact' ||
        (entry.type === 'tool_use' && content.includes('compact')) ||
        (entry.type === 'system' && content.includes('compact'))) {
      compactIndices.push(i);
    }
  }

  if (compactIndices.length === 0) {
    return result('WC-07', 'pass', 'No compaction events detected in session');
  }

  // For each compact event, check if STATE.md is read/written after it
  for (const ci of compactIndices) {
    let statePreserved = false;
    const lookAhead = Math.min(ci + 15, entries.length);
    for (let j = ci + 1; j < lookAhead; j++) {
      const entry = entries[j];
      const filePath = entry.file_path ||
        (entry.input && entry.input.file_path ? entry.input.file_path : '') ||
        (typeof entry.content === 'string' ? entry.content : '');
      if (filePath.includes('STATE.md')) {
        statePreserved = true;
        break;
      }
    }

    if (!statePreserved) {
      evidence.push(`Compact event at entry ${ci} — no STATE.md read/write detected within next 15 entries`);
    }
  }

  // Also check STATE.md itself for missing fields (sign of content loss)
  const statePath = path.join(planningDir, 'STATE.md');
  try {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const fm = extractFrontmatter(stateContent);
    const criticalFields = ['current_phase', 'status', 'last_activity'];
    const missing = criticalFields.filter(f => fm[f] === undefined || fm[f] === '');
    if (missing.length > 0) {
      evidence.push(`STATE.md missing critical fields after compaction: ${missing.join(', ')}`);
    }
  } catch (_e) {
    evidence.push('STATE.md not readable — possible compaction content loss');
  }

  if (evidence.length === 0) {
    return result('WC-07', 'pass',
      `${compactIndices.length} compaction event(s) — STATE.md intact`);
  }

  return result('WC-07', 'warn',
    `${evidence.length} compaction quality concern(s)`,
    evidence
  );
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

  const fm = extractFrontmatter(content);
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

  const fm = extractFrontmatter(content);
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
        const fm = extractFrontmatter(content);
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
// WC-09: Commit Pattern Validation
// ---------------------------------------------------------------------------

/**
 * Detect git commit commands using heredoc, missing -m flag, or --no-verify.
 * Scans session JSONL logs for the current project. Falls back to git log
 * format validation if session logs are unavailable.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkCommitPatternValidation(planningDir, _config) {
  const evidence = [];
  const sessionLogs = findSessionLogs(planningDir);

  if (sessionLogs.length > 0) {
    const entries = parseSessionEntries(sessionLogs);

    for (const entry of entries) {
      if (entry.type !== 'tool_use' && entry.type !== 'assistant') continue;

      const command = entry.command ||
        (entry.content && typeof entry.content === 'string' ? entry.content : '') ||
        (entry.input && entry.input.command ? entry.input.command : '');

      if (!command || !command.includes('git commit')) continue;

      // Flag heredoc usage
      if (command.includes('<<')) {
        const snippet = command.substring(0, 120);
        evidence.push(`Heredoc in commit: "${snippet}..."`);
      }

      // Flag missing -m flag (but not --amend which may not need -m)
      if (!command.includes('-m') && !command.includes('--amend')) {
        const snippet = command.substring(0, 120);
        evidence.push(`Missing -m flag: "${snippet}..."`);
      }

      // Flag --no-verify
      if (command.includes('--no-verify')) {
        const snippet = command.substring(0, 120);
        evidence.push(`Uses --no-verify: "${snippet}..."`);
      }
    }

    if (evidence.length === 0) {
      return result('WC-09', 'pass', 'No commit pattern violations in session logs');
    }

    return result('WC-09', 'warn',
      `${evidence.length} commit pattern violation(s) found`,
      evidence
    );
  }

  // Fallback: validate recent git log commit messages match convention
  const conventionPattern = /^[a-z]+\([^)]+\):\s.+$/;
  try {
    const _projectRoot = path.resolve(planningDir, '..');
    const log = execSync('git log --oneline -20', {
      cwd: _projectRoot,
      timeout: 10000,
      encoding: 'utf8',
    });

    const commits = log.trim().split('\n');
    for (const commit of commits) {
      // Strip SHA prefix
      const msg = commit.replace(/^[a-f0-9]+\s+/, '');
      // Skip merge commits
      if (msg.startsWith('Merge')) continue;
      if (!conventionPattern.test(msg)) {
        evidence.push(`Non-conventional commit: "${msg.substring(0, 120)}"`);
      }
    }
  } catch (_e) {
    return result('WC-09', 'pass', 'No session logs available for analysis');
  }

  if (evidence.length === 0) {
    return result('WC-09', 'pass', 'All recent commits follow convention format');
  }

  return result('WC-09', 'warn',
    `${evidence.length} non-conventional commit(s) in recent history`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-12: Test Health Baseline
// ---------------------------------------------------------------------------

/**
 * Compare current test failures against a known baseline.
 * Detects new test failures that were not previously known.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkTestHealthBaseline(planningDir, _config) {
  const projectRoot = path.resolve(planningDir, '..');

  // Run tests and detect pass/fail
  let testOutput = '';
  let hasFailures = false;

  try {
    testOutput = execSync('npm test -- --ci --silent 2>&1', {
      cwd: projectRoot,
      timeout: 60000,
      encoding: 'utf8',
    });
    hasFailures = testOutput.includes('FAIL');
  } catch (_e) {
    // Non-zero exit = test failures
    hasFailures = true;
    if (_e.stdout) testOutput = _e.stdout.toString();
  }

  const currentStatus = hasFailures ? 'HAS_FAILURES' : 'ALL_PASS';

  // Read baseline file
  const baselinePath = path.join(planningDir, 'test-baseline.json');
  let baseline = null;

  try {
    const raw = fs.readFileSync(baselinePath, 'utf8');
    baseline = JSON.parse(raw);
  } catch (_e) {
    // No baseline file
  }

  if (!baseline) {
    return result('WC-12', 'info',
      'No test baseline established yet',
      [`Current test status: ${currentStatus}`]
    );
  }

  // Compare against baseline
  const evidence = [];
  const knownFailures = baseline.known_failures || [];

  if (hasFailures && knownFailures.length === 0) {
    evidence.push('Tests have failures but baseline shows no known failures — new regressions detected');
  }

  // Extract failing test names if possible
  const failLines = testOutput.split('\n').filter(l => /FAIL\s/.test(l));
  for (const fl of failLines) {
    const trimmed = fl.trim().substring(0, 120);
    const isKnown = knownFailures.some(kf => trimmed.includes(kf));
    if (!isKnown) {
      evidence.push(`New failure: ${trimmed}`);
    }
  }

  if (evidence.length === 0) {
    return result('WC-12', 'pass',
      `Test health matches baseline (${currentStatus})`,
      [`Known failures: ${knownFailures.length}`]
    );
  }

  return result('WC-12', 'warn',
    `${evidence.length} new test issue(s) beyond baseline`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-10: Model Selection Compliance
// ---------------------------------------------------------------------------

/**
 * Cross-reference agent spawns in session logs against config.models settings.
 * Detects agents using models that differ from configured preferences.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkModelSelectionCompliance(planningDir, config) {
  const models = (config && config.models) || {};
  const logFiles = findSessionLogs(planningDir);

  if (logFiles.length === 0) {
    return result('WC-10', 'pass', 'No session logs available for model verification');
  }

  const entries = parseSessionEntries(logFiles);
  const evidence = [];
  let totalSpawns = 0;
  let compliant = 0;

  for (const entry of entries) {
    // Look for Task tool_use entries with subagent_type or model fields
    if (entry.type !== 'tool_use' && entry.type !== 'assistant') continue;

    const input = entry.input || {};
    const subagentType = input.subagent_type || input.agent_type || '';
    const usedModel = input.model || '';

    // Only care about pbr agent spawns
    if (!subagentType.startsWith('pbr:')) continue;

    totalSpawns++;
    const agentName = subagentType.replace('pbr:', '');

    // Check if config has a model preference for this agent type
    const configuredModel = models[agentName];
    if (!configuredModel || configuredModel === 'inherit') {
      // No specific model configured or set to inherit — always compliant
      compliant++;
      continue;
    }

    if (usedModel && usedModel !== configuredModel) {
      evidence.push(
        `Agent "${agentName}" used model "${usedModel}" but config specifies "${configuredModel}"`
      );
    } else {
      compliant++;
    }
  }

  if (totalSpawns === 0) {
    return result('WC-10', 'pass', 'No agent spawns detected for model verification');
  }

  const pct = Math.round((compliant / totalSpawns) * 100);

  if (evidence.length === 0) {
    return result('WC-10', 'pass',
      `${totalSpawns} agent spawn(s), ${pct}% model-compliant`);
  }

  return result('WC-10', 'info',
    `${evidence.length} model mismatch(es) across ${totalSpawns} spawns (${pct}% compliant)`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-11: Git Branching Compliance
// ---------------------------------------------------------------------------

/**
 * Verify phase branches exist when git.branching is set to "phase".
 * Reads config.json git settings and checks git branch list.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkGitBranchingCompliance(planningDir, config) {
  const gitConfig = (config && config.git) || {};
  const branching = gitConfig.branching || 'none';

  if (branching === 'none' || branching === 'disabled') {
    return result('WC-11', 'pass', 'Git branching not configured');
  }

  if (branching !== 'phase') {
    return result('WC-11', 'pass',
      `Git branching mode "${branching}" — phase branch check not applicable`);
  }

  const projectRoot = path.resolve(planningDir, '..');
  const template = gitConfig.phase_branch_template ||
    'plan-build-run/phase-{phase}-{slug}';

  // Get list of git branches
  let branches;
  try {
    const branchOutput = execSync('git branch --list --all', {
      cwd: projectRoot,
      timeout: 10000,
      encoding: 'utf8',
    });
    branches = branchOutput
      .split('\n')
      .map(b => b.replace(/^\*?\s+/, '').trim())
      .filter(b => b.length > 0);
  } catch (_e) {
    return result('WC-11', 'pass', 'Git not available');
  }

  // Get active phase directories
  const phasesDir = path.join(planningDir, 'phases');
  let phaseDirs;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    phaseDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch (_e) {
    return result('WC-11', 'pass', 'No phases/ directory');
  }

  const evidence = [];

  for (const dir of phaseDirs) {
    // Check if this phase has PLAN files (indicates active work)
    const dirPath = path.join(phasesDir, dir);
    let hasPlan = false;
    try {
      const files = fs.readdirSync(dirPath);
      hasPlan = files.some(f => /^PLAN.*\.md$/i.test(f));
    } catch (_e) {
      continue;
    }

    if (!hasPlan) continue;

    // Build expected branch name from template
    const phaseNum = dir.substring(0, 2);
    const slug = dir.substring(3); // everything after "NN-"
    const expectedBranch = template
      .replace('{phase}', phaseNum)
      .replace('{slug}', slug);

    // Check if any branch matches (local or remote)
    const hasBranch = branches.some(b =>
      b === expectedBranch ||
      b.endsWith('/' + expectedBranch) ||
      b.includes(expectedBranch)
    );

    if (!hasBranch) {
      evidence.push(`Phase "${dir}" missing expected branch "${expectedBranch}"`);
    }
  }

  if (evidence.length === 0) {
    return result('WC-11', 'pass',
      `All active phases have corresponding git branches`);
  }

  return result('WC-11', 'info',
    `${evidence.length} phase(s) missing expected git branches`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkCiVerifyAfterPush,
  checkStateFileIntegrity,
  checkStateFrontmatterIntegrity,
  checkRoadmapSyncValidation,
  checkPlanningArtifactCompleteness,
  checkArtifactFormatValidation,
  checkCompactionQuality,
  checkNamingConventionCompliance,
  checkCommitPatternValidation,
  checkModelSelectionCompliance,
  checkGitBranchingCompliance,
  checkTestHealthBaseline,
};

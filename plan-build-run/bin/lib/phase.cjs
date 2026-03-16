/**
 * lib/phase.cjs — Phase operations for Plan-Build-Run tools.
 *
 * Handles phase directory management (add/remove/list), plan indexing,
 * must-haves collection, comprehensive phase info, milestone stats,
 * and commit tracking (commits-for, first-last-commit).
 *
 * Hybrid module merging PBR reference features with GSD-unique utilities.
 */

const fs = require('fs');
const path = require('path');
const {
  parseYamlFrontmatter,
  findFiles,
  countMustHaves,
  determinePhaseStatus,
  lockedFileUpdate
} = require('./core.cjs');
const { stateUpdate, statePatch, stateUpdateProgress, updateFrontmatterField } = require('./state.cjs');
const {
  roadmapAppendPhase,
  roadmapRemovePhase,
  roadmapRenumberPhases
} = require('./roadmap.cjs');

/**
 * Parse a markdown file's YAML frontmatter and return as JSON.
 * Wraps parseYamlFrontmatter().
 *
 * @param {string} filePath - Path to markdown file
 * @returns {object} Parsed frontmatter or error
 */
function frontmatter(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { error: `File not found: ${resolved}` };
  }
  const content = fs.readFileSync(resolved, 'utf8');
  return parseYamlFrontmatter(content);
}

/**
 * Plan inventory for a phase, grouped by wave.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object} Plan index
 */
function phasePlanIndex(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  // Find phase directory matching the number
  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  const phaseDir = entries.find(e => e.name.startsWith(String(phaseNum).padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  // Match both {NN}-{MM}-PLAN.md (canonical) and PLAN-NN.md / PLAN.md (legacy)
  const planFiles = findFiles(fullDir, /PLAN.*\.md$/i);

  const plans = [];
  const waves = {};

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const fm = parseYamlFrontmatter(content);

    const plan = {
      file,
      plan_id: fm.plan || file.replace(/^PLAN-?/i, '').replace(/-PLAN/i, '').replace(/\.md$/i, ''),
      wave: parseInt(fm.wave, 10) || 1,
      type: fm.type || 'unknown',
      autonomous: fm.autonomous !== false,
      depends_on: fm.depends_on || [],
      gap_closure: fm.gap_closure || false,
      has_summary: fs.existsSync(path.join(fullDir, `SUMMARY-${fm.plan || ''}.md`)),
      must_haves_count: countMustHaves(fm.must_haves)
    };

    plans.push(plan);

    const waveKey = `wave_${plan.wave}`;
    if (!waves[waveKey]) waves[waveKey] = [];
    waves[waveKey].push(plan.plan_id);
  }

  return {
    phase: phaseDir.name,
    total_plans: plans.length,
    plans,
    waves
  };
}

/**
 * Collect all must-haves from all PLAN.md files in a phase.
 * Returns per-plan grouping + flat deduplicated list + total count.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 */
function phaseMustHaves(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(String(phaseNum).padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  const planFiles = findFiles(fullDir, /PLAN.*\.md$/i);

  const perPlan = {};
  const allTruths = new Set();
  const allArtifacts = new Set();
  const allKeyLinks = new Set();

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const fm = parseYamlFrontmatter(content);
    const planId = fm.plan || file.replace(/^PLAN-?/i, '').replace(/-PLAN/i, '').replace(/\.md$/i, '');
    const mh = fm.must_haves || { truths: [], artifacts: [], key_links: [] };

    perPlan[planId] = mh;
    (mh.truths || []).forEach(t => allTruths.add(t));
    (mh.artifacts || []).forEach(a => allArtifacts.add(a));
    (mh.key_links || []).forEach(k => allKeyLinks.add(k));
  }

  const all = {
    truths: [...allTruths],
    artifacts: [...allArtifacts],
    key_links: [...allKeyLinks]
  };

  return {
    phase: phaseDir.name,
    plans: perPlan,
    all,
    total: all.truths.length + all.artifacts.length + all.key_links.length
  };
}

/**
 * Comprehensive single-phase status combining roadmap, filesystem, and plan data.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 */
function phaseInfo(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const { parseRoadmapMd } = require('./roadmap.cjs');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(String(phaseNum).padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);

  // Get roadmap info
  let roadmapInfo = null;
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
    const roadmap = parseRoadmapMd(roadmapContent);
    roadmapInfo = roadmap.phases.find(p => p.number === String(phaseNum).padStart(2, '0')) || null;
  }

  // Get plan index
  const plans = phasePlanIndex(phaseNum, dir);

  // Check for verification
  const verificationPath = path.join(fullDir, 'VERIFICATION.md');
  let verification = null;
  if (fs.existsSync(verificationPath)) {
    const vContent = fs.readFileSync(verificationPath, 'utf8');
    verification = parseYamlFrontmatter(vContent);
  }

  // Check summaries
  const summaryFiles = findFiles(fullDir, /^SUMMARY-.*\.md$/);
  const summaries = summaryFiles.map(f => {
    const content = fs.readFileSync(path.join(fullDir, f), 'utf8');
    const fm = parseYamlFrontmatter(content);
    return { file: f, plan: fm.plan || f.replace(/^SUMMARY-|\.md$/g, ''), status: fm.status || 'unknown' };
  });

  // Determine filesystem status
  const planCount = plans.total_plans || 0;
  const completedCount = summaries.filter(s => s.status === 'complete').length;
  const hasVerification = fs.existsSync(verificationPath);
  const fsStatus = determinePhaseStatus(planCount, completedCount, summaryFiles.length, hasVerification, fullDir);

  return {
    phase: phaseDir.name,
    name: roadmapInfo ? roadmapInfo.name : phaseDir.name.replace(/^\d+-/, ''),
    goal: roadmapInfo ? roadmapInfo.goal : null,
    roadmap_status: roadmapInfo ? roadmapInfo.status : null,
    filesystem_status: fsStatus,
    plans: plans.plans || [],
    plan_count: planCount,
    summaries,
    completed: completedCount,
    verification,
    has_context: fs.existsSync(path.join(fullDir, 'CONTEXT.md'))
  };
}

/**
 * Add a new phase directory (with renumbering and optional ROADMAP.md integration).
 *
 * @param {string} slug - Phase slug
 * @param {string|null} afterPhase - Insert after this phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @param {object} [options] - Optional settings: { goal, dependsOn }
 */
function phaseAdd(slug, afterPhase, planningDir, options) {
  // Handle backward compat: if planningDir is an object, it's actually options
  if (typeof planningDir === 'object' && planningDir !== null && !options) {
    options = planningDir;
    planningDir = undefined;
  }
  const opts = options || {};
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    fs.mkdirSync(phasesDir, { recursive: true });
  }

  // Determine next phase number
  const existing = fs.readdirSync(phasesDir)
    .filter(d => /^\d+-/.test(d))
    .map(d => parseInt(d.split('-')[0], 10))
    .sort((a, b) => a - b);

  let newNum;
  if (afterPhase) {
    const after = parseInt(afterPhase, 10);
    // Find the next number after the specified phase
    const higher = existing.filter(n => n > after);
    if (higher.length > 0) {
      // Need to renumber: insert between after and next
      newNum = after + 1;
      // Renumber all phases >= newNum
      for (const dirName of fs.readdirSync(phasesDir).sort().reverse()) {
        const num = parseInt(dirName.split('-')[0], 10);
        if (num >= newNum) {
          const newName = dirName.replace(/^\d+/, String(num + 1).padStart(2, '0'));
          fs.renameSync(path.join(phasesDir, dirName), path.join(phasesDir, newName));
        }
      }
    } else {
      newNum = after + 1;
    }
  } else {
    newNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  }

  const dirName = `${String(newNum).padStart(2, '0')}-${slug}`;
  const fullPath = path.join(phasesDir, dirName);
  fs.mkdirSync(fullPath, { recursive: true });

  // ROADMAP.md integration
  let roadmapUpdated = false;
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const phaseName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const depNum = opts.dependsOn ? parseInt(opts.dependsOn, 10) : null;
    const result = roadmapAppendPhase(dir, newNum, phaseName, opts.goal || null, depNum);
    roadmapUpdated = result.success !== false;
  }

  return {
    phase: newNum,
    slug,
    directory: dirName,
    path: fullPath,
    renumbered: afterPhase ? true : false,
    goal: opts.goal || null,
    depends_on: opts.dependsOn || null,
    roadmap_updated: roadmapUpdated
  };
}

/**
 * Remove a phase directory (with renumbering, ROADMAP.md cleanup, STATE.md adjustment).
 * Refuses to remove current or completed phases.
 *
 * @param {string} phaseNum - Phase number to remove
 * @param {string} [planningDir] - Path to .planning directory
 */
function phaseRemove(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  const num = parseInt(phaseNum, 10);
  const padded = String(num).padStart(2, '0');
  const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(padded + '-'));

  if (dirs.length === 0) {
    return { removed: false, error: `Phase ${phaseNum} not found` };
  }

  const dirName = dirs[0];
  const fullPath = path.join(phasesDir, dirName);

  // Safety check: refuse to remove current phase
  const statePath = path.join(dir, 'STATE.md');
  let currentPhase = null;
  if (fs.existsSync(statePath)) {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const fm = parseYamlFrontmatter(stateContent);
    currentPhase = fm.current_phase != null ? parseInt(fm.current_phase, 10) : null;
    if (currentPhase === num) {
      return { removed: false, error: `Cannot remove phase ${phaseNum}: it is the current active phase` };
    }
  }

  // Safety check: refuse to remove completed phase (has passing VERIFICATION.md)
  const verPath = path.join(fullPath, 'VERIFICATION.md');
  if (fs.existsSync(verPath)) {
    const verContent = fs.readFileSync(verPath, 'utf8');
    const verFm = parseYamlFrontmatter(verContent);
    if (verFm.result === 'passed') {
      return { removed: false, error: `Cannot remove phase ${phaseNum}: it has passed verification` };
    }
  }

  // Check if phase has artifacts (still allow removal if empty)
  const contents = fs.readdirSync(fullPath);
  if (contents.length > 0) {
    return {
      removed: false,
      error: `Phase ${phaseNum} (${dirName}) has ${contents.length} files. Remove contents first or use --force.`,
      files: contents
    };
  }

  fs.rmdirSync(fullPath);

  // Renumber subsequent phases on disk
  const allDirs = fs.readdirSync(phasesDir)
    .filter(d => /^\d+-/.test(d))
    .sort();

  for (const d of allDirs) {
    const dNum = parseInt(d.split('-')[0], 10);
    if (dNum > num) {
      const newName = d.replace(/^\d+/, String(dNum - 1).padStart(2, '0'));
      fs.renameSync(path.join(phasesDir, d), path.join(phasesDir, newName));
    }
  }

  // ROADMAP.md integration
  let roadmapUpdated = false;
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    roadmapRemovePhase(dir, num);
    roadmapRenumberPhases(dir, num + 1, -1);
    roadmapUpdated = true;
  }

  // STATE.md adjustment: if current_phase > removed phase, decrement it
  let stateUpdated = false;
  if (currentPhase !== null && currentPhase > num && fs.existsSync(statePath)) {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const newContent = updateFrontmatterField(stateContent, 'current_phase', currentPhase - 1);
    fs.writeFileSync(statePath, newContent, 'utf8');
    stateUpdated = true;
  }

  return {
    removed: true,
    directory: dirName,
    renumbered: true,
    roadmap_updated: roadmapUpdated,
    state_updated: stateUpdated
  };
}

/**
 * List all phase directories with status.
 *
 * @param {string} [planningDir] - Path to .planning directory
 */
function phaseList(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { phases: [] };
  }

  const phases = fs.readdirSync(phasesDir)
    .filter(d => /^\d+-/.test(d))
    .sort()
    .map(d => {
      const num = parseInt(d.split('-')[0], 10);
      const slug = d.replace(/^\d+-/, '');
      const fullPath = path.join(phasesDir, d);
      const files = fs.readdirSync(fullPath);
      const hasPlan = files.some(f => /^PLAN/i.test(f));
      const hasSummary = files.some(f => /^SUMMARY/i.test(f));
      const hasVerification = files.some(f => /^VERIFICATION/i.test(f));
      return { num, slug, directory: d, files: files.length, hasPlan, hasSummary, hasVerification };
    });

  return { phases };
}

/**
 * Extract frontmatter-only stats from all SUMMARY.md files across a milestone's phases.
 * Never reads SUMMARY body content -- only YAML frontmatter.
 *
 * Strategy for finding phases:
 *   1. Check milestone archive: .planning/milestones/v{version}/phases/
 *   2. Fall back to active phases dir: .planning/phases/
 *      matching phase numbers extracted from ROADMAP.md milestone section.
 *
 * @param {string} version - Milestone version string (e.g. "5.0", "6.0")
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object} Milestone stats with per-phase summaries and aggregated fields
 */
function milestoneStats(version, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');

  const phases = [];

  // --- Strategy 1: Check milestone archive ---
  const archivePhasesDir = path.join(dir, 'milestones', `v${version}`, 'phases');
  if (fs.existsSync(archivePhasesDir)) {
    const phaseDirs = fs.readdirSync(archivePhasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d+-/.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const phaseEntry of phaseDirs) {
      const phaseData = _collectPhaseStats(path.join(archivePhasesDir, phaseEntry.name), phaseEntry.name);
      if (phaseData) phases.push(phaseData);
    }
  } else {
    // --- Strategy 2: Parse ROADMAP.md to find phase numbers for this milestone ---
    const roadmapPath = path.join(dir, 'ROADMAP.md');
    const phaseNums = _extractMilestonePhaseNums(roadmapPath, version);
    const phasesDir = path.join(dir, 'phases');

    if (fs.existsSync(phasesDir) && phaseNums.length > 0) {
      const allDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d+-/.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const phaseEntry of allDirs) {
        const num = parseInt(phaseEntry.name.split('-')[0], 10);
        if (phaseNums.includes(num)) {
          const phaseData = _collectPhaseStats(path.join(phasesDir, phaseEntry.name), phaseEntry.name);
          if (phaseData) phases.push(phaseData);
        }
      }
    }
  }

  // --- Aggregate across all phases ---
  const providesSet = new Set();
  const keyFilesSet = new Set();
  const patternsSet = new Set();
  const allKeyDecisions = [];
  const allDeferred = [];
  const totalMetrics = { tasks_completed: 0, commits: 0, files_changed: 0 };

  for (const phase of phases) {
    for (const summary of phase.summaries) {
      (summary.provides || []).forEach(v => providesSet.add(v));
      (summary.key_files || []).forEach(v => keyFilesSet.add(v));
      (summary.patterns || []).forEach(v => patternsSet.add(v));
      (summary.key_decisions || []).forEach(v => allKeyDecisions.push(v));
      (summary.deferred || []).forEach(v => allDeferred.push(v));
      const m = summary.metrics || {};
      totalMetrics.tasks_completed += parseInt(m.tasks_completed, 10) || 0;
      totalMetrics.commits += parseInt(m.commits, 10) || 0;
      totalMetrics.files_changed += parseInt(m.files_changed, 10) || 0;
    }
  }

  return {
    version,
    phase_count: phases.length,
    phases,
    aggregated: {
      all_provides: [...providesSet],
      all_key_files: [...keyFilesSet],
      all_key_decisions: allKeyDecisions,
      all_patterns: [...patternsSet],
      all_deferred: allDeferred,
      total_metrics: totalMetrics
    }
  };
}

/**
 * Collect frontmatter-only stats from all SUMMARY*.md files in a single phase directory.
 *
 * @param {string} fullDir - Full path to phase directory
 * @param {string} dirName - Directory name (e.g. "46-agent-contracts")
 * @returns {object}
 */
function _collectPhaseStats(fullDir, dirName) {
  const numStr = dirName.split('-')[0];
  const name = dirName.replace(/^\d+-/, '');

  const summaryFiles = findFiles(fullDir, /^SUMMARY.*\.md$/i);
  const summaries = [];

  for (const file of summaryFiles) {
    const filePath = path.join(fullDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract ONLY the YAML frontmatter -- never read body content
    const fm = parseYamlFrontmatter(content);

    // Collect only the documented frontmatter fields
    const entry = {};
    const fields = ['phase', 'plan', 'status', 'provides', 'requires', 'key_files',
      'key_decisions', 'patterns', 'metrics', 'deferred', 'tags'];
    for (const field of fields) {
      if (fm[field] !== undefined) {
        entry[field] = fm[field];
      }
    }
    summaries.push(entry);
  }

  return {
    number: numStr,
    name,
    summaries
  };
}

/**
 * Parse ROADMAP.md to find phase numbers belonging to a milestone version.
 * Scans for milestone section headers containing the version string, then
 * collects phase numbers from "### Phase N:" headings or "Phases N-M" text.
 *
 * @param {string} roadmapPath - Path to ROADMAP.md
 * @param {string} version - Version string (e.g. "5.0")
 * @returns {number[]} Array of phase numbers
 */
function _extractMilestonePhaseNums(roadmapPath, version) {
  if (!fs.existsSync(roadmapPath)) return [];

  const content = fs.readFileSync(roadmapPath, 'utf8');
  const lines = content.split(/\r?\n/);

  const phaseNums = [];
  let inMilestoneSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect milestone section header (## Milestone: ... (vX.Y) or containing version)
    if (/^##\s+Milestone:/i.test(line)) {
      inMilestoneSection = line.includes(`v${version}`) || line.includes(`(${version})`);
      continue;
    }

    // If we hit a new ## section (not ###), exit the milestone section
    if (/^##\s+[^#]/.test(line)) {
      if (inMilestoneSection) break;
      continue;
    }

    if (!inMilestoneSection) continue;

    // Extract phase numbers from "### Phase N:" headings
    const phaseHeading = line.match(/^###\s+Phase\s+(\d+)/i);
    if (phaseHeading) {
      phaseNums.push(parseInt(phaseHeading[1], 10));
      continue;
    }

    // Extract from "Phases N-M" or "Phase N" text
    const phaseRange = line.match(/Phases?\s+(\d+)(?:-(\d+))?/gi);
    if (phaseRange) {
      for (const match of phaseRange) {
        const rangeMatch = match.match(/(\d+)(?:-(\d+))?/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : start;
          for (let n = start; n <= end; n++) {
            if (!phaseNums.includes(n)) phaseNums.push(n);
          }
        }
      }
    }

    // Row entries in phase overview tables: | 51 | CLI Foundation | ...
    const tableRow = line.match(/^\|\s*(\d+)\s*\|/);
    if (tableRow) {
      const n = parseInt(tableRow[1], 10);
      if (!phaseNums.includes(n)) phaseNums.push(n);
    }
  }

  return phaseNums;
}

/**
 * Mark a phase as complete: update ROADMAP.md progress table and STATE.md.
 *
 * Atomically updates ROADMAP.md (status -> Complete, date appended, checklist checked)
 * and STATE.md (advance to next phase, reset plans_complete, set status).
 *
 * @param {string} phaseNum - Phase number to complete (string)
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object} Result with success, completed_phase, next_phase, etc.
 */
function phaseComplete(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const statePath = path.join(dir, 'STATE.md');
  const roadmapPath = path.join(dir, 'ROADMAP.md');

  if (!fs.existsSync(statePath)) {
    return { success: false, error: 'STATE.md not found' };
  }
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  const num = parseInt(phaseNum, 10);
  const today = new Date().toISOString().slice(0, 10);

  // --- Parse ROADMAP.md progress table to find all phases and the target row ---
  const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
  const lines = roadmapContent.split(/\r?\n/);

  // Find all phase entries in progress table rows
  const phaseEntries = [];
  let targetRowIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\|\s*(\d+)\.\s+(.+?)\s*\|/);
    if (match) {
      const entryNum = parseInt(match[1], 10);
      const entryName = match[2].trim();
      phaseEntries.push({ num: entryNum, name: entryName, lineIdx: i });
      if (entryNum === num) {
        targetRowIdx = i;
      }
    }
  }

  if (targetRowIdx === -1) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md progress table` };
  }

  // --- Update ROADMAP.md atomically ---
  const roadmapResult = lockedFileUpdate(roadmapPath, (content) => {
    let updated = content;
    const contentLines = updated.split(/\r?\n/);
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

    // Update the progress table row: replace status column with Complete and add date
    const row = contentLines[targetRowIdx];
    const cols = row.split('|').map(c => c.trim());
    // cols: ['', 'N. Name', 'X/Y', 'Status', '' (trailing)]
    // Find the status column (usually index 3)
    if (cols.length >= 4) {
      cols[3] = ` Complete`;
      // Add date
      if (cols.length === 5) {
        cols.splice(4, 0, ` ${today} `);
      } else if (cols.length > 5) {
        cols[4] = ` ${today} `;
      }
      contentLines[targetRowIdx] = cols.join('|');
    }

    // Update phase checklist if present: - [ ] Phase N: -> - [x] Phase N:
    const checklistPattern = new RegExp(`^(\\s*- \\[)( )(\\] Phase ${num}[:\\s])`, 'i');
    for (let i = 0; i < contentLines.length; i++) {
      if (checklistPattern.test(contentLines[i])) {
        contentLines[i] = contentLines[i].replace(checklistPattern, '$1x$3');
      }
    }

    return contentLines.join(lineEnding);
  });

  if (!roadmapResult.success) {
    return { success: false, error: `Failed to update ROADMAP.md: ${roadmapResult.error}` };
  }

  // --- Determine next phase ---
  const sortedEntries = phaseEntries.sort((a, b) => a.num - b.num);
  const currentIdx = sortedEntries.findIndex(e => e.num === num);
  const nextEntry = currentIdx !== -1 && currentIdx < sortedEntries.length - 1
    ? sortedEntries[currentIdx + 1]
    : null;

  const nextPhaseNum = nextEntry ? String(nextEntry.num) : null;
  // Derive slug from name: lowercase, replace spaces with hyphens
  const nextSlug = nextEntry
    ? nextEntry.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : null;

  // --- Update STATE.md (compound update via statePatch for atomicity) ---
  if (nextEntry) {
    statePatch(JSON.stringify({
      current_phase: nextPhaseNum,
      plans_complete: '0',
      status: 'planned',
      phase_slug: nextSlug
    }), dir);
  } else {
    // Final phase in milestone
    statePatch(JSON.stringify({ status: 'verified' }), dir);

    // Update PROJECT.md milestone status if it exists
    _updateProjectMilestoneStatus(dir, num);
  }

  // Recalculate progress
  stateUpdateProgress(dir);

  // --- Write .phase-manifest.json aggregating all plan commits ---
  let manifestWritten = false;
  try {
    const phasesDir = path.join(dir, 'phases');
    const padded = String(num).padStart(2, '0');
    const phaseDirEntry = fs.readdirSync(phasesDir).find(d => d.startsWith(padded + '-'));
    if (phaseDirEntry) {
      const fullPhaseDir = path.join(phasesDir, phaseDirEntry);
      const manifest = _buildPhaseManifest(num, fullPhaseDir);
      const manifestPath = path.join(fullPhaseDir, '.phase-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      manifestWritten = true;
    }
  } catch (_e) {
    // Non-fatal: manifest is advisory for undo operations
  }

  return {
    success: true,
    completed_phase: num,
    next_phase: nextPhaseNum ? parseInt(nextPhaseNum, 10) : null,
    next_slug: nextSlug,
    roadmap_updated: true,
    state_updated: true,
    final_phase: nextPhaseNum === null,
    manifest_written: manifestWritten
  };
}

/**
 * Update PROJECT.md milestone status when the final phase completes.
 * Non-fatal — if PROJECT.md doesn't exist or update fails, we skip silently.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {number} finalPhaseNum - The phase number that just completed
 */
function _updateProjectMilestoneStatus(planningDir, finalPhaseNum) {
  try {
    const projectPath = path.join(planningDir, 'PROJECT.md');
    if (!fs.existsSync(projectPath)) return;

    const today = new Date().toISOString().slice(0, 10);

    lockedFileUpdate(projectPath, (content) => {
      let updated = content;

      // Update frontmatter milestone_status if present
      updated = updated.replace(
        /^(milestone_status:\s*)"[^"]*"/m,
        `$1"complete"`
      );

      // Update "In progress" to "Complete" in body text
      updated = updated.replace(
        /\*\*Status:\*\*\s*In progress/i,
        `**Status:** Complete (${today})`
      );

      // Update "(none yet)" completed milestones marker
      updated = updated.replace(
        /\(none yet\)/,
        `v1.0 completed ${today} (phases 1-${finalPhaseNum})`
      );

      return updated;
    });
  } catch (_e) {
    // Non-fatal: PROJECT.md update is advisory
  }
}

/**
 * Build a phase manifest by collecting commit hashes from all plan SUMMARY.md files.
 *
 * @param {number} phaseNum - Phase number
 * @param {string} phaseDir - Full path to the phase directory
 * @returns {object} Phase manifest
 */
function _buildPhaseManifest(phaseNum, phaseDir) {
  const summaryFiles = findFiles(phaseDir, /^SUMMARY.*\.md$/i);
  const commits = [];

  for (const file of summaryFiles) {
    const content = fs.readFileSync(path.join(phaseDir, file), 'utf8');
    const fm = parseYamlFrontmatter(content);
    const planId = fm.plan || file.replace(/^SUMMARY-?/i, '').replace(/\.md$/i, '');

    // Extract commits from frontmatter metrics or commits field
    if (fm.commits && Array.isArray(fm.commits)) {
      for (const c of fm.commits) {
        commits.push({
          hash: c.hash || c.sha || c,
          message: c.message || '',
          plan: planId,
          task: c.task || null
        });
      }
    }

    // Also try to parse "Task Commits" section from body
    const taskCommitRegex = /\|\s*(\d+)\s*\|[^|]*\|\s*([0-9a-f]{7,})\s*\|/gi;
    let match;
    while ((match = taskCommitRegex.exec(content)) !== null) {
      const hash = match[2];
      // Avoid duplicates
      if (!commits.some(c => c.hash === hash)) {
        commits.push({
          hash,
          message: '',
          plan: planId,
          task: parseInt(match[1], 10)
        });
      }
    }
  }

  return {
    phase: String(phaseNum).padStart(2, '0'),
    completed: new Date().toISOString(),
    commits,
    first_commit: commits.length > 0 ? commits[0].hash : null,
    last_commit: commits.length > 0 ? commits[commits.length - 1].hash : null
  };
}

/**
 * Get all commits associated with a phase by scanning SUMMARY.md files.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object} { commits: Array, first_commit, last_commit }
 */
function phaseCommitsFor(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  const padded = String(phaseNum).padStart(2, '0');

  let phaseDir = null;
  try {
    const entries = fs.readdirSync(phasesDir);
    const match = entries.find(d => d.startsWith(padded + '-'));
    if (match) phaseDir = path.join(phasesDir, match);
  } catch (_e) { /* ignore */ }

  if (!phaseDir) {
    return { error: `Phase ${phaseNum} directory not found`, commits: [] };
  }

  const manifest = _buildPhaseManifest(parseInt(phaseNum, 10), phaseDir);
  return {
    commits: manifest.commits,
    first_commit: manifest.first_commit,
    last_commit: manifest.last_commit,
    phase: padded
  };
}

/**
 * Get the first and last commit hashes for a phase.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object} { first_commit, last_commit }
 */
function phaseFirstLastCommit(phaseNum, planningDir) {
  const result = phaseCommitsFor(phaseNum, planningDir);
  return {
    first_commit: result.first_commit || null,
    last_commit: result.last_commit || null,
    commit_count: result.commits ? result.commits.length : 0
  };
}

/**
 * Insert a new phase at a specific position, renumbering all subsequent phases
 * on disk, in ROADMAP.md, and in STATE.md.
 *
 * @param {number} position - Position to insert at (1-based)
 * @param {string} slug - Phase slug
 * @param {string} [planningDir] - Path to .planning directory
 * @param {object} [options] - Optional: { goal, dependsOn }
 * @returns {object} Result with phase, slug, directory, renumbered_count, etc.
 */
function phaseInsert(position, slug, planningDir, options) {
  // Handle backward compat: if planningDir is an object, it's actually options
  if (typeof planningDir === 'object' && planningDir !== null && !options) {
    options = planningDir;
    planningDir = undefined;
  }
  const opts = options || {};
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');

  if (!Number.isInteger(position) || position < 1) {
    return { error: 'Position must be a positive integer' };
  }

  if (!fs.existsSync(phasesDir)) {
    fs.mkdirSync(phasesDir, { recursive: true });
  }

  // Get existing phase dirs sorted by number
  const existingDirs = fs.readdirSync(phasesDir)
    .filter(d => /^\d+-/.test(d))
    .sort();

  // Renumber dirs with number >= position (iterate in REVERSE to avoid collisions)
  let renumberedCount = 0;
  const dirsToRename = existingDirs
    .filter(d => parseInt(d.split('-')[0], 10) >= position)
    .sort()
    .reverse();

  for (const d of dirsToRename) {
    const num = parseInt(d.split('-')[0], 10);
    const newName = d.replace(/^\d+/, String(num + 1).padStart(2, '0'));
    fs.renameSync(path.join(phasesDir, d), path.join(phasesDir, newName));
    renumberedCount++;
  }

  // Create the new phase directory
  const dirName = String(position).padStart(2, '0') + '-' + slug;
  const fullPath = path.join(phasesDir, dirName);
  fs.mkdirSync(fullPath, { recursive: true });

  // ROADMAP.md integration
  let roadmapUpdated = false;
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (fs.existsSync(roadmapPath)) {
    const { roadmapInsertPhase } = require('./roadmap.cjs');
    // First renumber existing phases in ROADMAP.md
    roadmapRenumberPhases(dir, position, +1);
    // Then insert the new phase at the right position
    const phaseName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const depNum = opts.dependsOn ? parseInt(opts.dependsOn, 10) : null;
    roadmapInsertPhase(dir, position, phaseName, opts.goal || null, depNum);
    roadmapUpdated = true;
  }

  // STATE.md adjustment: if current_phase >= position, increment it
  let stateUpdated = false;
  const statePath = path.join(dir, 'STATE.md');
  if (fs.existsSync(statePath)) {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const fm = parseYamlFrontmatter(stateContent);
    const currentPhase = fm.current_phase != null ? parseInt(fm.current_phase, 10) : null;
    if (currentPhase !== null && currentPhase >= position) {
      const newContent = updateFrontmatterField(stateContent, 'current_phase', currentPhase + 1);
      fs.writeFileSync(statePath, newContent, 'utf8');
      stateUpdated = true;
    }
  }

  return {
    phase: position,
    slug,
    directory: dirName,
    path: fullPath,
    renumbered_count: renumberedCount,
    roadmap_updated: roadmapUpdated,
    state_updated: stateUpdated
  };
}

module.exports = {
  frontmatter,
  phasePlanIndex,
  phaseMustHaves,
  phaseInfo,
  phaseAdd,
  phaseRemove,
  phaseList,
  milestoneStats,
  phaseComplete,
  phaseInsert,
  phaseCommitsFor,
  phaseFirstLastCommit
};

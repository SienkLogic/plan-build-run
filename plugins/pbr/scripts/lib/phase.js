/**
 * lib/phase.js — Phase operations for Plan-Build-Run tools.
 *
 * Handles phase directory management (add/remove/list), plan indexing,
 * must-haves collection, and comprehensive phase info.
 */

const fs = require('fs');
const path = require('path');
const {
  parseYamlFrontmatter,
  findFiles,
  countMustHaves,
  determinePhaseStatus
} = require('./core');

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
function planIndex(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  // Find phase directory matching the number
  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  const planFiles = findFiles(fullDir, /-PLAN\.md$/);

  const plans = [];
  const waves = {};

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const fm = parseYamlFrontmatter(content);

    const plan = {
      file,
      plan_id: fm.plan || file.replace(/-PLAN\.md$/, ''),
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
function mustHavesCollect(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
  if (!phaseDir) {
    return { error: `No phase directory found matching phase ${phaseNum}` };
  }

  const fullDir = path.join(phasesDir, phaseDir.name);
  const planFiles = findFiles(fullDir, /-PLAN\.md$/);

  const perPlan = {};
  const allTruths = new Set();
  const allArtifacts = new Set();
  const allKeyLinks = new Set();

  for (const file of planFiles) {
    const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
    const fm = parseYamlFrontmatter(content);
    const planId = fm.plan || file.replace(/-PLAN\.md$/, '');
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
  const { parseRoadmapMd } = require('./roadmap');
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { error: 'No phases directory found' };
  }

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());
  const phaseDir = entries.find(e => e.name.startsWith(phaseNum.padStart(2, '0') + '-'));
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
    roadmapInfo = roadmap.phases.find(p => p.number === phaseNum.padStart(2, '0')) || null;
  }

  // Get plan index
  const plans = planIndex(phaseNum, dir);

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
 * Add a new phase directory (with renumbering).
 *
 * @param {string} slug - Phase slug
 * @param {string|null} afterPhase - Insert after this phase number
 * @param {string} [planningDir] - Path to .planning directory
 */
function phaseAdd(slug, afterPhase, planningDir) {
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

  return {
    phase: newNum,
    slug,
    directory: dirName,
    path: fullPath,
    renumbered: afterPhase ? true : false
  };
}

/**
 * Remove an empty phase directory (with renumbering).
 *
 * @param {string} phaseNum - Phase number to remove
 * @param {string} [planningDir] - Path to .planning directory
 */
function phaseRemove(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phasesDir = path.join(dir, 'phases');
  const padded = String(phaseNum).padStart(2, '0');
  const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(padded + '-'));

  if (dirs.length === 0) {
    return { removed: false, error: `Phase ${phaseNum} not found` };
  }

  const dirName = dirs[0];
  const fullPath = path.join(phasesDir, dirName);

  // Check if phase has artifacts
  const contents = fs.readdirSync(fullPath);
  if (contents.length > 0) {
    return {
      removed: false,
      error: `Phase ${phaseNum} (${dirName}) has ${contents.length} files. Remove contents first or use --force.`,
      files: contents
    };
  }

  fs.rmdirSync(fullPath);

  // Renumber subsequent phases
  const allDirs = fs.readdirSync(phasesDir)
    .filter(d => /^\d+-/.test(d))
    .sort();

  for (const d of allDirs) {
    const num = parseInt(d.split('-')[0], 10);
    if (num > parseInt(phaseNum, 10)) {
      const newName = d.replace(/^\d+/, String(num - 1).padStart(2, '0'));
      fs.renameSync(path.join(phasesDir, d), path.join(phasesDir, newName));
    }
  }

  return {
    removed: true,
    directory: dirName,
    renumbered: true
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

module.exports = {
  frontmatter,
  planIndex,
  mustHavesCollect,
  phaseInfo,
  phaseAdd,
  phaseRemove,
  phaseList
};

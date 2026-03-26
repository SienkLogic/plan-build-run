// lib/phase-utils.js — Phase directory, roadmap, and milestone utilities.
// Phase/directory/roadmap/milestone utilities.

const fs = require('fs');
const path = require('path');
const { logHook } = require('../hook-logger');
const { toPosixPath, escapeRegex, findFiles } = require('./fs-utils');

// ─── Phase status determination ───────────────────────────────────────────────

function determinePhaseStatus(planCount, completedCount, summaryCount, hasVerification, phaseDir) {
  if (planCount === 0) {
    if (fs.existsSync(path.join(phaseDir, 'CONTEXT.md'))) return 'discussed';
    return 'not_started';
  }
  if (completedCount === 0 && summaryCount === 0) return 'planned';
  if (completedCount < planCount) return 'building';
  if (!hasVerification) return 'built';
  try {
    const vContent = fs.readFileSync(path.join(phaseDir, 'VERIFICATION.md'), 'utf8');
    if (/status:\s*["']?passed/i.test(vContent)) return 'verified';
    if (/status:\s*["']?gaps_found/i.test(vContent)) return 'needs_fixes';
    return 'reviewed';
  } catch (_) {
    // intentionally silent: VERIFICATION.md may not exist
    return 'built';
  }
}

// ─── Progress calculation ─────────────────────────────────────────────────────

function calculateProgress(pDir) {
  const phasesDir = path.join(pDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { total: 0, completed: 0, percentage: 0 };
  }

  let total = 0;
  let completed = 0;

  const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  for (const entry of entries) {
    const dir = path.join(phasesDir, entry.name);
    const plans = findFiles(dir, /PLAN.*\.md$/i);
    total += plans.length;

    const summaries = findFiles(dir, /^SUMMARY-.*\.md$/);
    for (const s of summaries) {
      const content = fs.readFileSync(path.join(dir, s), 'utf8');
      if (/status:\s*["']?complete/i.test(content)) completed++;
    }
  }

  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

// ─── Phase name/comparison utilities ──────────────────────────────────────────

function normalizePhaseName(phase) {
  const match = String(phase).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!match) return phase;
  const padded = match[1].padStart(2, '0');
  const letter = match[2] ? match[2].toUpperCase() : '';
  const decimal = match[3] || '';
  return padded + letter + decimal;
}

function comparePhaseNum(a, b) {
  const pa = String(a).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  const pb = String(b).match(/^(\d+)([A-Z])?((?:\.\d+)*)/i);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  const intDiff = parseInt(pa[1], 10) - parseInt(pb[1], 10);
  if (intDiff !== 0) return intDiff;
  const la = (pa[2] || '').toUpperCase();
  const lb = (pb[2] || '').toUpperCase();
  if (la !== lb) {
    if (!la) return -1;
    if (!lb) return 1;
    return la < lb ? -1 : 1;
  }
  const aDecParts = pa[3] ? pa[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const bDecParts = pb[3] ? pb[3].slice(1).split('.').map(p => parseInt(p, 10)) : [];
  const maxLen = Math.max(aDecParts.length, bDecParts.length);
  if (aDecParts.length === 0 && bDecParts.length > 0) return -1;
  if (bDecParts.length === 0 && aDecParts.length > 0) return 1;
  for (let i = 0; i < maxLen; i++) {
    const av = Number.isFinite(aDecParts[i]) ? aDecParts[i] : 0;
    const bv = Number.isFinite(bDecParts[i]) ? bDecParts[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// ─── Phase directory search ───────────────────────────────────────────────────

function searchPhaseInDir(baseDir, relBase, normalized) {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));
    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const phaseDir = path.join(baseDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);

    const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    const hasResearch = phaseFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = phaseFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = phaseFiles.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');

    const completedPlanIds = new Set(
      summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompletePlans = plans.filter(p => {
      const planId = p.replace('-PLAN.md', '').replace('PLAN.md', '');
      return !completedPlanIds.has(planId);
    });

    return {
      found: true,
      directory: toPosixPath(path.join(relBase, match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      phase_slug: phaseName ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
      plans,
      summaries,
      incomplete_plans: incompletePlans,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
    };
  } catch (e) {
    logHook('phase-utils', 'debug', 'Failed to search phase in directory', { error: e.message });
    return null;
  }
}

function findPhaseInternal(phaseCwd, phase) {
  if (!phase) return null;

  const phasesDir = path.join(phaseCwd, '.planning', 'phases');
  const normalized = normalizePhaseName(phase);

  const current = searchPhaseInDir(phasesDir, '.planning/phases', normalized);
  if (current) return current;

  const milestonesDir = path.join(phaseCwd, '.planning', 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const relBase = '.planning/milestones/' + archiveName;
      const result = searchPhaseInDir(archivePath, relBase, normalized);
      if (result) {
        result.archived = version;
        return result;
      }
    }
  } catch (e) { logHook('phase-utils', 'debug', 'Failed to search milestone archives', { error: e.message }); }

  return null;
}

function getArchivedPhaseDirs(archCwd) {
  const milestonesDir = path.join(archCwd, '.planning', 'milestones');
  const results = [];

  if (!fs.existsSync(milestonesDir)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const phaseDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-phases$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of phaseDirs) {
      const version = archiveName.match(/^(v[\d.]+)-phases$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const entries = fs.readdirSync(archivePath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join('.planning', 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch (e) { logHook('phase-utils', 'debug', 'Failed to list archived phase dirs', { error: e.message }); }

  return results;
}

// ─── Roadmap & milestone utilities ────────────────────────────────────────────

function getRoadmapPhaseInternal(rmCwd, phaseNum) {
  if (!phaseNum) return null;
  const roadmapPath = path.join(rmCwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  try {
    const content = fs.readFileSync(roadmapPath, 'utf8');
    const escapedPhase = escapeRegex(phaseNum.toString());
    const phasePattern = new RegExp(`#{2,4}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
    const headerMatch = content.match(phasePattern);
    if (!headerMatch) return null;

    const phaseName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Phase\s+\d/i);
    const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : content.length;
    const section = content.slice(headerIndex, sectionEnd).trim();

    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    return {
      found: true,
      phase_number: phaseNum.toString(),
      phase_name: phaseName,
      goal,
      section,
    };
  } catch (e) {
    logHook('phase-utils', 'debug', 'Failed to read roadmap for phase lookup', { error: e.message });
    return null;
  }
}

function getMilestoneInfo(miCwd) {
  try {
    const roadmap = fs.readFileSync(path.join(miCwd, '.planning', 'ROADMAP.md'), 'utf8');

    const inProgressMatch = roadmap.match(/\u{1F6A7}\s*\*\*v(\d+\.\d+)\s+([^*]+)\*\*/u);
    if (inProgressMatch) {
      return {
        version: 'v' + inProgressMatch[1],
        name: inProgressMatch[2].trim(),
      };
    }

    const cleaned = roadmap.replace(/<details>[\s\S]*?<\/details>/gi, '');
    const headingMatch = cleaned.match(/## .*v(\d+\.\d+)[:\s]+([^\n(]+)/);
    if (headingMatch) {
      return {
        version: 'v' + headingMatch[1],
        name: headingMatch[2].trim(),
      };
    }
    const versionMatch = cleaned.match(/v(\d+\.\d+)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: 'milestone',
    };
  } catch (e) {
    logHook('phase-utils', 'debug', 'Failed to read milestone info', { error: e.message });
    return { version: 'v1.0', name: 'milestone' };
  }
}

/**
 * Returns a filter function that checks whether a phase directory belongs
 * to the current milestone based on ROADMAP.md phase headings.
 */
function getMilestonePhaseFilter(filterCwd) {
  const milestonePhaseNums = new Set();
  try {
    const roadmap = fs.readFileSync(path.join(filterCwd, '.planning', 'ROADMAP.md'), 'utf8');
    const phasePattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:/gi;
    let m;
    while ((m = phasePattern.exec(roadmap)) !== null) {
      milestonePhaseNums.add(m[1]);
    }
  } catch (e) { logHook('phase-utils', 'debug', 'Failed to read roadmap for milestone filter', { error: e.message }); }

  if (milestonePhaseNums.size === 0) {
    const passAll = () => true;
    passAll.phaseCount = 0;
    return passAll;
  }

  const normalized = new Set(
    [...milestonePhaseNums].map(n => (n.replace(/^0+/, '') || '0').toLowerCase())
  );

  function isDirInMilestone(dirName) {
    const dm = dirName.match(/^0*(\d+[A-Za-z]?(?:\.\d+)*)/);
    if (!dm) return false;
    return normalized.has(dm[1].toLowerCase());
  }
  isDirInMilestone.phaseCount = milestonePhaseNums.size;
  return isDirInMilestone;
}

module.exports = {
  determinePhaseStatus,
  calculateProgress,
  normalizePhaseName,
  comparePhaseNum,
  searchPhaseInDir,
  findPhaseInternal,
  getArchivedPhaseDirs,
  getRoadmapPhaseInternal,
  getMilestoneInfo,
  getMilestonePhaseFilter,
};

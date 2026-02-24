import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { stripBOM } from '../utils/strip-bom.js';

const execFile = promisify(execFileCb);

// Plain-object cache for getRecentActivity: keyed by projectDir
// Each entry: { data: Array, expiresAt: number }
const _activityCache = new Map();
const ACTIVITY_CACHE_TTL_MS = 30_000;

/** Clear activity cache — exported for testing only */
export function _clearActivityCache() {
  _activityCache.clear();
}

/**
 * Run a git command in the given directory, returning stdout.
 * Returns empty string on failure.
 */
async function git(projectDir, args) {
  try {
    const { stdout } = await execFile('git', args, {
      cwd: projectDir,
      maxBuffer: 10 * 1024 * 1024
    });
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Parse STATE.md to extract project status information.
 * Uses regex on raw markdown body text (not YAML frontmatter).
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{projectName: string, currentPhase: object, lastActivity: object, progress: number}>}
 */
export async function parseStateFile(projectDir) {
  try {
    const path = join(projectDir, '.planning', 'STATE.md');
    const raw = await readFile(path, 'utf-8');
    const content = stripBOM(raw).replace(/\r\n/g, '\n');

    // Parse YAML frontmatter if present (STATE.md v2 format)
    let frontmatter = {};
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      for (const line of fmMatch[1].split('\n')) {
        const kv = line.match(/^(\w+):\s*(.+)/);
        if (kv) {
          const val = kv[2].trim().replace(/^"(.*)"$/, '$1');
          frontmatter[kv[1]] = val;
        }
      }
    }

    // Extract project name from **Current focus:** line
    let projectName = 'Unknown Project';
    const focusMatch = content.match(/\*\*Current focus:\*\*\s*(.+)/);
    if (focusMatch) {
      projectName = focusMatch[1].trim();
    } else {
      // Fallback: try H1 heading
      const h1Match = content.match(/^# (.+)/m);
      if (h1Match) {
        projectName = h1Match[1].trim();
      }
    }

    // Extract current phase: "Phase: 3 of 12 (UI Shell)"
    let currentPhaseId = 0;
    let totalPhases = 0;
    let phaseName = 'Not Started';
    const phaseMatch = content.match(/Phase:\s*(\d+)\s*of\s*(\d+)\s*\(([^)]+)\)/);
    if (phaseMatch) {
      currentPhaseId = parseInt(phaseMatch[1], 10);
      totalPhases = parseInt(phaseMatch[2], 10);
      phaseName = phaseMatch[3].trim();
    }

    // Extract plan status: "Plan: 2 of 2 complete"
    let planStatus = 'N/A';
    const planMatch = content.match(/Plan:\s*(.+)/);
    if (planMatch) {
      planStatus = planMatch[1].trim();
    }

    // Extract last activity: "Last activity: 2026-02-08 -- Phase 3 built (...)"
    let activityDate = '';
    let activityDescription = 'No activity recorded';
    const activityMatch = content.match(/Last activity:\s*([\d-]+)\s*--\s*(.+)/);
    if (activityMatch) {
      activityDate = activityMatch[1].trim();
      activityDescription = activityMatch[2].trim();
    }

    // Extract progress percentage: "Progress: [...] 25%"
    let progress = 0;
    const progressMatch = content.match(/Progress:.*?(\d+)%/);
    if (progressMatch) {
      progress = parseInt(progressMatch[1], 10);
    } else if (totalPhases > 0) {
      // Calculate from phase numbers if no explicit progress
      progress = Math.ceil((currentPhaseId / totalPhases) * 100);
    }

    // Determine phase status from frontmatter or body text
    // "built", "verified", "complete" all mean the current phase is done
    const fmStatus = (frontmatter.status || '').toLowerCase();
    const phaseStatus = ['built', 'verified', 'complete', 'reviewed'].includes(fmStatus)
      ? 'complete'
      : ['building', 'planning', 'planned', 'in-progress'].includes(fmStatus)
        ? 'in-progress'
        : fmStatus || 'unknown';

    return {
      projectName,
      currentPhase: {
        id: currentPhaseId,
        total: totalPhases,
        name: phaseName,
        planStatus,
        status: phaseStatus
      },
      lastActivity: {
        date: activityDate,
        description: activityDescription
      },
      progress
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        projectName: 'Unknown Project',
        currentPhase: { id: 0, total: 0, name: 'Not Started', planStatus: 'N/A', status: 'unknown' },
        lastActivity: { date: '', description: 'No activity recorded' },
        progress: 0
      };
    }
    throw error;
  }
}

/**
 * Parse ROADMAP.md to extract phase list from Progress table and checkbox list.
 * Uses the Progress table as primary source (contains ALL phases including those
 * added under milestone headings). Falls back to checkbox parsing for older
 * roadmaps that don't have a Progress table.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{phases: Array<{id: number, name: string, description: string, status: string}>, progress: number}>}
 */
export async function parseRoadmapFile(projectDir) {
  try {
    const filePath = join(projectDir, '.planning', 'ROADMAP.md');
    const raw = await readFile(filePath, 'utf-8');
    const content = stripBOM(raw).replace(/\r\n/g, '\n');

    // 1. Parse descriptions from checkbox list: "- [x] Phase 01: Name -- Description"
    const checkboxMap = new Map();
    const checkboxRegex = /^- \[([ xX])\] Phase (\d+):\s*([^-]+?)\s*--\s*(.+)$/gm;
    for (const match of content.matchAll(checkboxRegex)) {
      const id = parseInt(match[2], 10);
      checkboxMap.set(id, {
        name: match[3].trim(),
        description: match[4].trim(),
        status: (match[1] === 'x' || match[1] === 'X') ? 'complete' : 'not-started'
      });
    }

    // 2. Parse descriptions from Phase Details: "### Phase NN: Name\n**Goal**: ..."
    const goalMap = new Map();
    const goalRegex = /### Phase (\d+):\s*(.+)\n\*\*Goal:?\*\*:?\s*(.+)/g;
    for (const match of content.matchAll(goalRegex)) {
      goalMap.set(parseInt(match[1], 10), match[3].trim());
    }

    // 3. Parse Progress table: "| 01. Name | 2/2 | Complete | 2026-02-08 |"
    const progressRegex = /^\|\s*(\d+)\.\s+(.+?)\s*\|\s*(\d+)\/([\d?]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/gm;
    const progressPhases = [];
    for (const match of content.matchAll(progressRegex)) {
      const id = parseInt(match[1], 10);
      const name = match[2].trim();
      const statusText = match[5].trim().toLowerCase();

      // Get description: prefer checkbox description, fall back to Phase Details Goal
      const cbInfo = checkboxMap.get(id);
      const goalDesc = goalMap.get(id);
      const description = cbInfo?.description || goalDesc || '';

      let status;
      if (statusText === 'complete') status = 'complete';
      else if (statusText === 'in progress') status = 'in-progress';
      else status = 'not-started';

      progressPhases.push({ id, name, description, status });
    }

    // 4. Parse H3 Phase Details: "### Phase N: Name\n**Goal:** ..."
    const h3Phases = [];
    const h3Regex = /### Phase (\d+):\s*(.+)\n\*\*Goal\*?\*?:?\*?\*?\s*(.+)/g;
    for (const match of content.matchAll(h3Regex)) {
      const id = parseInt(match[1], 10);
      const name = match[2].trim();
      const description = match[3].trim();
      // Check checkbox map for status, default to not-started
      const cbInfo = checkboxMap.get(id);
      h3Phases.push({
        id,
        name,
        description,
        status: cbInfo?.status || 'not-started'
      });
    }

    // 5. Parse simple two-column table: "| 1. Name | Completed |"
    //    Used in milestone-archived roadmaps
    const simpleTableRegex = /^\|\s*(\d+)\.\s+(.+?)\s*\|\s*(.+?)\s*\|$/gm;
    const simplePhases = [];
    for (const match of content.matchAll(simpleTableRegex)) {
      const id = parseInt(match[1], 10);
      const name = match[2].trim();
      const statusText = match[3].trim().toLowerCase();

      let status;
      if (statusText === 'completed' || statusText === 'complete') status = 'complete';
      else if (statusText === 'in progress' || statusText === 'in-progress') status = 'in-progress';
      else status = 'not-started';

      const cbInfo = checkboxMap.get(id);
      const goalDesc = goalMap.get(id);
      const description = cbInfo?.description || goalDesc || '';

      simplePhases.push({ id, name, description, status });
    }

    // Use Progress table if available, then simple table, then checkbox list, then H3 headings
    let phases;
    if (progressPhases.length > 0) {
      phases = progressPhases;
    } else if (simplePhases.length > 0) {
      phases = simplePhases;
    } else if (checkboxMap.size > 0) {
      phases = [...checkboxMap.entries()]
        .map(([id, info]) => ({
          id,
          name: info.name,
          description: info.description,
          status: info.status
        }))
        .sort((a, b) => a.id - b.id);
    } else {
      phases = h3Phases.sort((a, b) => a.id - b.id);
    }

    const completed = phases.filter(p => p.status === 'complete').length;
    const total = phases.length;
    const progress = total > 0 ? Math.ceil((completed / total) * 100) : 0;

    return { phases, progress };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { phases: [], progress: 0 };
    }
    throw error;
  }
}

/**
 * Derive phase statuses by combining roadmap phases with STATE.md context.
 * Phases before the current phase are marked complete.
 * The current phase gets its status from STATE.md.
 * Phases after the current phase keep their roadmap status (typically not-started).
 *
 * @param {Array} phases - Raw phases from parseRoadmapFile
 * @param {{id: number, status: string}} currentPhase - Current phase from parseStateFile
 * @returns {Array} Phases with derived statuses
 */
export function derivePhaseStatuses(phases, currentPhase) {
  const currentId = currentPhase.id;
  const currentStatus = currentPhase.status || 'unknown';
  return phases.map(phase => {
    // If the roadmap already has explicit status (from progress table/checkboxes), keep it
    if (phase.status === 'complete') return phase;

    if (phase.id < currentId) {
      return { ...phase, status: 'complete' };
    }
    if (phase.id === currentId) {
      return { ...phase, status: currentStatus === 'complete' ? 'complete' : 'in-progress' };
    }
    return phase;
  });
}

/**
 * Get recent .planning/ file activity from git log.
 * Returns up to 10 deduplicated entries (most recent occurrence per path).
 * Results are cached for 30 seconds.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Array<{path: string, timestamp: string, type: string}>>}
 */
export async function getRecentActivity(projectDir) {
  const cached = _activityCache.get(projectDir);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  try {
    const output = await git(projectDir, [
      'log',
      '--name-only',
      '--format=COMMIT:%ai',
      '-n', '40',
      '--',
      '.planning/'
    ]);

    if (!output || !output.trim()) {
      return [];
    }

    // Parse output: lines starting with "COMMIT:" set the current timestamp,
    // non-empty lines that don't start with "COMMIT:" are file paths.
    const seen = new Map(); // path -> { timestamp, type }
    let currentTimestamp = '';

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('COMMIT:')) {
        currentTimestamp = trimmed.slice('COMMIT:'.length).trim();
      } else if (trimmed && currentTimestamp) {
        // Only record first occurrence per path (git log is newest-first)
        if (!seen.has(trimmed)) {
          seen.set(trimmed, { timestamp: currentTimestamp, type: 'commit' });
        }
      }
    }

    const data = [...seen.entries()]
      .slice(0, 10)
      .map(([path, meta]) => ({ path, timestamp: meta.timestamp, type: meta.type }));

    _activityCache.set(projectDir, { data, expiresAt: Date.now() + ACTIVITY_CACHE_TTL_MS });
    return data;
  } catch {
    return [];
  }
}

/**
 * Derive contextual quick-action buttons based on current phase status.
 * Pure function — no I/O.
 *
 * @param {{ status: string, id: number }} currentPhase
 * @returns {Array<{label: string, href: string, primary: boolean}>}
 */
export function deriveQuickActions(currentPhase) {
  const id = String(currentPhase.id).padStart(2, '0');
  const status = currentPhase.status || '';

  switch (status) {
    case 'building':
    case 'in-progress':
      return [
        { label: 'Continue Building', href: `/phases/${id}`, primary: true },
        { label: 'View Roadmap', href: '/roadmap', primary: false }
      ];

    case 'planning':
    case 'planned':
      return [
        { label: 'View Plans', href: `/phases/${id}`, primary: true },
        { label: 'Roadmap', href: '/roadmap', primary: false }
      ];

    case 'complete':
    case 'verified':
      return [
        { label: 'View Phase', href: `/phases/${id}`, primary: false },
        { label: 'Roadmap', href: '/roadmap', primary: true }
      ];

    default:
      return [
        { label: 'Get Started', href: '/roadmap', primary: true }
      ];
  }
}

/**
 * Get combined dashboard data by parsing both STATE.md and ROADMAP.md.
 * Orchestrates both parsers in parallel and derives in-progress status.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{projectName: string, currentPhase: object, lastActivity: object, progress: number, phases: Array, recentActivity: Array, quickActions: Array}>}
 */
export async function getDashboardData(projectDir) {
  const [stateData, roadmapData, recentActivity] = await Promise.all([
    parseStateFile(projectDir),
    parseRoadmapFile(projectDir),
    getRecentActivity(projectDir)
  ]);

  const phases = derivePhaseStatuses(roadmapData.phases, stateData.currentPhase);

  // Recalculate progress from derived phase statuses
  const completedPhases = phases.filter(p => p.status === 'complete').length;
  const progress = phases.length > 0
    ? Math.ceil((completedPhases / phases.length) * 100)
    : stateData.progress;

  const quickActions = deriveQuickActions(stateData.currentPhase);

  return {
    projectName: stateData.projectName,
    currentPhase: stateData.currentPhase,
    lastActivity: stateData.lastActivity,
    progress,
    phases,
    recentActivity,
    quickActions
  };
}

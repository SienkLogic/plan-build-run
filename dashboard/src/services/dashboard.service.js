import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Strip UTF-8 BOM from file content.
 * Duplicated from planning.repository.js intentionally --
 * this service reads raw text, not via the repository layer.
 *
 * @param {string} content - Raw file content
 * @returns {string} Content without BOM
 */
function stripBOM(content) {
  return content.replace(/^\uFEFF/, '');
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
    const content = stripBOM(raw);

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

    return {
      projectName,
      currentPhase: {
        id: currentPhaseId,
        total: totalPhases,
        name: phaseName,
        planStatus
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
        currentPhase: { id: 0, total: 0, name: 'Not Started', planStatus: 'N/A' },
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

    // Use Progress table if available, then checkbox list, then H3 headings
    let phases;
    if (progressPhases.length > 0) {
      phases = progressPhases;
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
 * Get combined dashboard data by parsing both STATE.md and ROADMAP.md.
 * Orchestrates both parsers in parallel and derives in-progress status.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{projectName: string, currentPhase: object, lastActivity: object, progress: number, phases: Array}>}
 */
export async function getDashboardData(projectDir) {
  const [stateData, roadmapData] = await Promise.all([
    parseStateFile(projectDir),
    parseRoadmapFile(projectDir)
  ]);

  // Derive "in-progress" status for the current phase
  const phases = roadmapData.phases.map(phase => ({
    ...phase,
    status: (phase.id === stateData.currentPhase.id && phase.status !== 'complete')
      ? 'in-progress'
      : phase.status
  }));

  // Prefer roadmap progress if phases exist, otherwise use state progress
  const progress = roadmapData.phases.length > 0
    ? roadmapData.progress
    : stateData.progress;

  return {
    projectName: stateData.projectName,
    currentPhase: stateData.currentPhase,
    lastActivity: stateData.lastActivity,
    progress,
    phases
  };
}

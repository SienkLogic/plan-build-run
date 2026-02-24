import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRoadmapFile } from './dashboard.service.js';
import { stripBOM } from '../utils/strip-bom.js';

/**
 * Count the number of PLAN.md files in a phase directory.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {number} phaseId - Numeric phase ID (e.g., 1, 5, 12)
 * @returns {Promise<number>} Number of NN-NN-PLAN.md files found
 */
async function countPlansForPhase(projectDir, phaseId) {
  const phaseIdPadded = String(phaseId).padStart(2, '0');
  const phasesDir = join(projectDir, '.planning', 'phases');

  try {
    const entries = await readdir(phasesDir, { withFileTypes: true });
    // When multiple directories match (e.g. stale rename leftover), prefer the longest name
    const matchingDirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith(`${phaseIdPadded}-`))
      .sort((a, b) => b.name.length - a.name.length);
    const phaseDir = matchingDirs[0];

    if (!phaseDir) return 0;

    const phaseFiles = await readdir(join(phasesDir, phaseDir.name));
    return phaseFiles.filter(f => /^(?:(?:\d{2}-\d{2})-)?PLAN(?:-\d{2})?\.md$/.test(f)).length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

/**
 * Extract dependency information from all Phase Details sections in ROADMAP.md.
 *
 * @param {string} roadmapContent - Raw ROADMAP.md content
 * @returns {Map<number, number[]>} Map of phaseId -> array of dependency phase IDs
 */
function extractAllDependencies(roadmapContent) {
  const dependencyMap = new Map();

  // Match Phase Details sections: "### Phase NN: ..." followed by "**Depends on**: ..."
  const sectionRegex = /### Phase (\d+):[\s\S]*?\*\*Depends on:?\*\*:?\s*([^\n]+)/g;
  let match;

  while ((match = sectionRegex.exec(roadmapContent)) !== null) {
    const phaseId = parseInt(match[1], 10);
    const depText = match[2].trim();

    if (depText.toLowerCase().includes('none')) {
      dependencyMap.set(phaseId, []);
      continue;
    }

    // Extract phase numbers from "Phase 01, Phase 02" format
    const deps = [];
    const depMatches = depText.matchAll(/Phase (\d+)/g);
    for (const dm of depMatches) {
      deps.push(parseInt(dm[1], 10));
    }
    dependencyMap.set(phaseId, deps);
  }

  return dependencyMap;
}

/**
 * Extract milestone information from ROADMAP.md.
 * Parses explicit "## Milestone:" sections and infers the implicit first milestone
 * from the roadmap title (phases before the first explicit milestone).
 *
 * @param {string} roadmapContent - Raw ROADMAP.md content (newlines normalized)
 * @returns {Array<{name: string, goal: string, startPhase: number, endPhase: number}>}
 */
function extractMilestones(roadmapContent) {
  const milestones = [];

  // Get project title from H1: "# Roadmap: PBR Dashboard"
  const titleMatch = roadmapContent.match(/^# Roadmap:\s*(.+)$/m);
  const projectTitle = titleMatch ? titleMatch[1].trim() : 'Project';

  // Parse explicit milestones: "## Milestone: Name\n\n**Goal:** ...\n**Phases:** N - M"
  const milestoneRegex = /## Milestone:\s*(.+)\n+\*\*Goal:?\*\*:?\s*(.+)\n\*\*Phases:?\*\*:?\s*(\d+)\s*-\s*(\d+)/g;
  const explicit = [];
  const seenNames = new Set();
  for (const match of roadmapContent.matchAll(milestoneRegex)) {
    const name = match[1].trim();
    seenNames.add(name);
    explicit.push({
      name,
      goal: match[2].trim(),
      startPhase: parseInt(match[3], 10),
      endPhase: parseInt(match[4], 10)
    });
  }

  // Parse completed/collapsed milestones: "## Milestone: Name -- COMPLETED\n\nPhases N-M completed..."
  const completedRegex = /## Milestone:\s*(.+?)\s*--\s*COMPLETED\n+Phases\s+(\d+)-(\d+)\s+completed[^\n]*/g;
  for (const match of roadmapContent.matchAll(completedRegex)) {
    const name = match[1].trim();
    if (seenNames.has(name)) continue; // avoid duplicates
    seenNames.add(name);
    explicit.push({
      name: name + ' (Completed)',
      goal: 'Completed',
      startPhase: parseInt(match[2], 10),
      endPhase: parseInt(match[3], 10),
      completed: true
    });
  }

  // Sort explicit milestones by start phase
  explicit.sort((a, b) => a.startPhase - b.startPhase);

  // Infer implicit first milestone (phases before first explicit milestone)
  if (explicit.length > 0) {
    const firstStart = explicit[0].startPhase;
    if (firstStart > 1) {
      milestones.push({
        name: projectTitle,
        goal: '',
        startPhase: 1,
        endPhase: firstStart - 1
      });
    }
  } else {
    // No explicit milestones — all phases belong to the project
    milestones.push({
      name: projectTitle,
      goal: '',
      startPhase: 1,
      endPhase: 9999
    });
  }

  milestones.push(...explicit);
  return milestones;
}

/**
 * Get enhanced roadmap data with plan counts, dependencies, and milestones.
 * Combines parseRoadmapFile with raw ROADMAP.md reading for dependency
 * extraction, milestone parsing, and directory scanning for plan counts.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{phases: Array, milestones: Array}>}
 */
/**
 * Generate a Mermaid flowchart string from ROADMAP.md phase dependencies.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<string>} Mermaid flowchart definition
 */
export async function generateDependencyMermaid(projectDir) {
  const { phases, milestones } = await getRoadmapData(projectDir);

  if (phases.length === 0) {
    return 'graph TD\n  empty["No phases found"]';
  }

  // Read raw ROADMAP.md for dependencies
  let dependencyMap = new Map();
  try {
    const roadmapPath = join(projectDir, '.planning', 'ROADMAP.md');
    const rawContent = stripBOM(await readFile(roadmapPath, 'utf-8')).replace(/\r\n/g, '\n');
    dependencyMap = extractAllDependencies(rawContent);
  } catch (_err) {
    // No ROADMAP.md — proceed with no deps
  }

  // Detect current phase (first non-complete phase, or last phase)
  const currentPhase = phases.find(p => p.status !== 'Complete') || phases[phases.length - 1];

  const lines = ['graph TD'];

  // Group phases by milestone
  const phaseById = new Map(phases.map(p => [p.id, p]));

  if (milestones.length > 0) {
    for (const ms of milestones) {
      const msPhases = phases.filter(p => p.id >= ms.startPhase && p.id <= ms.endPhase);
      if (msPhases.length === 0) continue;
      const safeName = ms.name.replace(/"/g, '#quot;');
      lines.push(`  subgraph ${safeName}`);
      for (const p of msPhases) {
        const label = `Phase ${p.id}: ${p.name}`.replace(/"/g, '#quot;');
        lines.push(`    P${p.id}["${label}"]`);
      }
      lines.push('  end');
    }
  } else {
    for (const p of phases) {
      const label = `Phase ${p.id}: ${p.name}`.replace(/"/g, '#quot;');
      lines.push(`  P${p.id}["${label}"]`);
    }
  }

  // Add dependency edges
  for (const [phaseId, deps] of dependencyMap) {
    if (!phaseById.has(phaseId)) continue;
    for (const depId of deps) {
      if (phaseById.has(depId)) {
        lines.push(`  P${depId} --> P${phaseId}`);
      }
    }
  }

  // Style current phase
  if (currentPhase) {
    lines.push(`  style P${currentPhase.id} fill:#4caf50,color:#fff`);
  }

  // Click handlers
  for (const p of phases) {
    lines.push(`  click P${p.id} "/phases/${p.id}"`);
  }

  return lines.join('\n');
}

export async function getRoadmapData(projectDir) {
  const { phases: basePhases } = await parseRoadmapFile(projectDir);

  // Read raw ROADMAP.md for dependencies and milestones
  let dependencyMap = new Map();
  let milestones = [];
  try {
    const roadmapPath = join(projectDir, '.planning', 'ROADMAP.md');
    const rawContent = stripBOM(await readFile(roadmapPath, 'utf-8')).replace(/\r\n/g, '\n');
    dependencyMap = extractAllDependencies(rawContent);
    milestones = extractMilestones(rawContent);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Enhance each phase with plan count and dependencies in parallel
  const enhancedPhases = await Promise.all(
    basePhases.map(async (phase) => {
      const planCount = await countPlansForPhase(projectDir, phase.id);
      const dependencies = dependencyMap.get(phase.id) || [];
      return { ...phase, planCount, dependencies };
    })
  );

  return { phases: enhancedPhases, milestones };
}

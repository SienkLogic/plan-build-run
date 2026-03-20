#!/usr/bin/env node

/**
 * Smart next-task suggestion module.
 *
 * Parses ROADMAP.md dependency graph and STATE.md to suggest
 * the highest-impact next task based on critical path analysis.
 *
 * Pure function — no side effects, no file writes.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse ROADMAP.md into phase objects with dependencies and completion status.
 * @param {string} content - ROADMAP.md content
 * @returns {{ phases: Map<number, { name: string, dependsOn: number[], completed: boolean }> }}
 */
function parseRoadmap(content) {
  const phases = new Map();

  // Parse phase sections: ### Phase N: Name
  const sectionRegex = /### Phase (\d+):\s*(.+)/g;
  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    const num = parseInt(match[1], 10);
    const name = match[2].trim();
    phases.set(num, { name, dependsOn: [], completed: false });
  }

  // Parse dependencies: **Depends on:** Phase N, Phase M
  // We need to associate each dependency with its phase section
  const lines = content.split('\n');
  let currentPhase = null;
  for (const line of lines) {
    const phaseMatch = line.match(/### Phase (\d+):/);
    if (phaseMatch) {
      currentPhase = parseInt(phaseMatch[1], 10);
    }
    const depMatch = line.match(/\*\*Depends on:\*\*\s*(.+)/);
    if (depMatch && currentPhase !== null && phases.has(currentPhase)) {
      const depStr = depMatch[1].trim();
      if (depStr.toLowerCase() !== 'none') {
        const depNums = [];
        const depNumRegex = /Phase\s+(\d+)/gi;
        let depNumMatch;
        while ((depNumMatch = depNumRegex.exec(depStr)) !== null) {
          depNums.push(parseInt(depNumMatch[1], 10));
        }
        phases.get(currentPhase).dependsOn = depNums;
      }
    }
  }

  // Parse completion status from checklist: - [x] Phase N:
  const checkRegex = /- \[(x| )\]\s*Phase\s+(\d+):/gi;
  while ((match = checkRegex.exec(content)) !== null) {
    const completed = match[1].toLowerCase() === 'x';
    const num = parseInt(match[2], 10);
    if (phases.has(num)) {
      phases.get(num).completed = completed;
    }
  }

  return phases;
}

/**
 * Parse STATE.md frontmatter for current phase info.
 * @param {string} content - STATE.md content
 * @returns {{ current_phase: number, status: string, plans_total: number, plans_complete: number }}
 */
function parseState(content) {
  const result = { current_phase: 0, status: '', plans_total: 0, plans_complete: 0 };
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return result;

  const fm = fmMatch[1];
  const phaseMatch = fm.match(/current_phase:\s*(\d+)/);
  if (phaseMatch) result.current_phase = parseInt(phaseMatch[1], 10);

  const statusMatch = fm.match(/status:\s*"?(\w+)"?/);
  if (statusMatch) result.status = statusMatch[1];

  const totalMatch = fm.match(/plans_total:\s*(\d+)/);
  if (totalMatch) result.plans_total = parseInt(totalMatch[1], 10);

  const completeMatch = fm.match(/plans_complete:\s*(\d+)/);
  if (completeMatch) result.plans_complete = parseInt(completeMatch[1], 10);

  return result;
}

/**
 * Count transitive downstream dependents for a phase.
 * @param {Map} phases - Parsed phases map
 * @param {number} phaseNum - Phase number to count dependents for
 * @returns {number} Count of transitive downstream dependents
 */
function countDownstream(phases, phaseNum) {
  const visited = new Set();
  const queue = [phaseNum];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const [num, phase] of phases) {
      if (!visited.has(num) && num !== phaseNum && phase.dependsOn.includes(current)) {
        visited.add(num);
        queue.push(num);
      }
    }
  }

  return visited.size;
}

/**
 * Suggest the highest-impact next task based on ROADMAP.md dependency graph.
 *
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @returns {{ phase: number, name: string, reason: string, command: string } | null}
 */
function suggestNextTask(planningDir) {
  // Read ROADMAP.md
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  let roadmapContent;
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
  } catch (_e) {
    return null;
  }

  const phases = parseRoadmap(roadmapContent);
  if (phases.size === 0) return null;

  // Read STATE.md
  const statePath = path.join(planningDir, 'STATE.md');
  let state = { current_phase: 0, status: '', plans_total: 0, plans_complete: 0 };
  try {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    state = parseState(stateContent);
  } catch (_e) {
    // No state file — proceed with defaults
  }

  // If current phase is in-progress, suggest continuing it
  if (state.current_phase > 0 && state.status && state.status !== 'verified') {
    const currentPhaseData = phases.get(state.current_phase);
    if (currentPhaseData && !currentPhaseData.completed) {
      return {
        phase: state.current_phase,
        name: currentPhaseData.name,
        reason: 'Current phase in progress — continue building',
        command: '/pbr:build'
      };
    }
  }

  // Check if all phases are completed
  const allCompleted = Array.from(phases.values()).every(p => p.completed);
  if (allCompleted) return null;

  // Find unblocked phases: not completed AND all dependencies completed
  const unblocked = [];
  for (const [num, phase] of phases) {
    if (phase.completed) continue;
    const allDepsCompleted = phase.dependsOn.every(dep => {
      const depPhase = phases.get(dep);
      return depPhase && depPhase.completed;
    });
    if (allDepsCompleted) {
      unblocked.push(num);
    }
  }

  if (unblocked.length === 0) return null;

  // Rank by critical path weight (most downstream dependents)
  let bestPhase = unblocked[0];
  let bestWeight = countDownstream(phases, unblocked[0]);

  for (let i = 1; i < unblocked.length; i++) {
    const weight = countDownstream(phases, unblocked[i]);
    if (weight > bestWeight) {
      bestWeight = weight;
      bestPhase = unblocked[i];
    }
  }

  const phaseData = phases.get(bestPhase);
  const downstreamCount = bestWeight;
  const reason = downstreamCount > 0
    ? `Critical path: ${downstreamCount} downstream phase${downstreamCount > 1 ? 's' : ''} depend on this`
    : 'Next available phase with no blockers';

  return {
    phase: bestPhase,
    name: phaseData.name,
    reason,
    command: `/pbr:plan-phase ${bestPhase}`
  };
}

module.exports = { suggestNextTask, parseRoadmap, parseState, countDownstream };

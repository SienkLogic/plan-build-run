/**
 * lib/suggest-next.cjs -- Deterministic routing decision tree for Plan-Build-Run.
 *
 * Encapsulates the priority-based routing logic used by status, continue,
 * and resume skills. Scans project state and returns a JSON recommendation
 * for the next command to run.
 *
 * Priority hierarchy (first match wins):
 *   1. Paused work (.continue-here.md)
 *   2. UAT blocker (STATE.md blockers)
 *   3. Active checkpoint (STATE.md active_checkpoint)
 *   4. Verification gaps (VERIFICATION.md with gaps_found)
 *   5. Built not verified (SUMMARY exists, no VERIFICATION)
 *   6. Planned not built (PLAN exists, no SUMMARY)
 *   7. Building in progress (some SUMMARYs, not all)
 *   8. All verified, more phases (unstarted phases in ROADMAP)
 *   9. All milestones complete (status === milestone-complete)
 *  10. Empty phases (phase dirs with no PLAN)
 *  11. No project (no .planning/)
 *
 * Called by: `node pbr-tools.cjs suggest-next`
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter, findFiles } = require('./core.cjs');

// ---- Helpers ----

function safeReadFile(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  } catch (_e) {
    return null;
  }
}

function safeParseFrontmatter(content) {
  if (!content) return {};
  try {
    return parseYamlFrontmatter(content) || {};
  } catch (_e) {
    return {};
  }
}

function countFilesIn(dirPath, filterFn) {
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const entries = fs.readdirSync(dirPath);
    return filterFn ? entries.filter(filterFn).length : entries.length;
  } catch (_e) {
    return 0;
  }
}

// ---- Phase scanning (lightweight, focused on routing) ----

function scanPhasesForRouting(planningDir) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return [];

  const phases = [];
  let entries;
  try {
    entries = fs.readdirSync(phasesDir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d+)-(.+)/);
    if (!match) continue;

    const phaseNum = parseInt(match[1], 10);
    const phaseName = match[2].replace(/-/g, ' ');
    const phaseDir = path.join(phasesDir, entry.name);

    const plans = findFiles(phaseDir, /^PLAN.*\.md$/i);
    const summaries = findFiles(phaseDir, /^SUMMARY.*\.md$/i);
    const verificationPath = path.join(phaseDir, 'VERIFICATION.md');
    let hasVerification = false;
    let verificationResult = null;

    if (fs.existsSync(verificationPath)) {
      hasVerification = true;
      const vContent = safeReadFile(verificationPath);
      if (vContent) {
        const fm = safeParseFrontmatter(vContent);
        verificationResult = fm.result || null;
      }
    }

    // Check for .continue-here.md in phase dir
    const hasContinueHere = fs.existsSync(path.join(phaseDir, '.continue-here.md'));

    // Determine status
    let status = 'empty';
    if (hasVerification && verificationResult === 'passed') {
      status = 'verified';
    } else if (hasVerification && verificationResult === 'gaps_found') {
      status = 'gaps_found';
    } else if (summaries.length > 0 && summaries.length >= plans.length && plans.length > 0) {
      status = 'built';
    } else if (summaries.length > 0) {
      status = 'building';
    } else if (plans.length > 0) {
      status = 'planned';
    }

    phases.push({
      number: phaseNum,
      name: phaseName,
      status,
      plans_total: plans.length,
      plans_complete: summaries.length,
      has_verification: hasVerification,
      verification_result: verificationResult,
      has_continue_here: hasContinueHere,
      dir_name: entry.name
    });
  }

  phases.sort((a, b) => a.number - b.number);
  return phases;
}

// ---- Main suggest-next function ----

/**
 * Determine the recommended next command based on project state.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {object} Routing recommendation with command, args, reason, alternatives, context
 */
function suggestNext(planningDir) {
  // Priority 11: No project
  if (!fs.existsSync(planningDir)) {
    return {
      command: '/pbr:begin',
      args: '',
      reason: 'No .planning/ directory found',
      alternatives: [],
      context: {
        current_phase: null,
        phase_status: null,
        plans_total: 0,
        plans_complete: 0
      }
    };
  }

  // Load state
  const stateContent = safeReadFile(path.join(planningDir, 'STATE.md'));
  const stateFm = safeParseFrontmatter(stateContent);
  const phases = scanPhasesForRouting(planningDir);

  // Count todos and notes for alternatives
  const todosPending = countFilesIn(
    path.join(planningDir, 'todos', 'pending'),
    f => f.endsWith('.md')
  );
  const notesActive = countFilesIn(
    path.join(planningDir, 'notes'),
    f => f.endsWith('.md')
  );

  // Build alternatives list
  const alternatives = [];
  if (todosPending > 0) {
    alternatives.push({
      command: '/pbr:todo list',
      reason: `${todosPending} pending todo${todosPending > 1 ? 's' : ''}`
    });
  }
  if (notesActive > 0) {
    alternatives.push({
      command: '/pbr:note list',
      reason: `${notesActive} active note${notesActive > 1 ? 's' : ''} to review`
    });
  }
  alternatives.push({
    command: '/pbr:quick',
    reason: 'Run an ad-hoc task'
  });

  // Helper to build result
  function result(command, args, reason, phase) {
    return {
      command,
      args: args || '',
      reason,
      alternatives,
      context: {
        current_phase: phase ? phase.number : (stateFm.current_phase || null),
        phase_status: phase ? phase.status : (stateFm.status || null),
        plans_total: phase ? phase.plans_total : 0,
        plans_complete: phase ? phase.plans_complete : 0
      }
    };
  }

  // Priority 1: Paused work (.continue-here.md in phases or project root)
  const rootContinueHere = path.join(planningDir, '..', '.continue-here.md');
  const phaseContinueHere = phases.find(p => p.has_continue_here);
  if (fs.existsSync(rootContinueHere) || phaseContinueHere) {
    const phase = phaseContinueHere || null;
    return result('/pbr:resume', '', 'Paused work detected', phase);
  }

  // Priority 2: UAT blocker
  if (stateFm.blockers && Array.isArray(stateFm.blockers)) {
    const uatBlocker = stateFm.blockers.find(b =>
      typeof b === 'string' ? /uat/i.test(b) : (b && /uat/i.test(b.text || b.description || ''))
    );
    if (uatBlocker) {
      const currentPhaseNum = stateFm.current_phase;
      const phase = phases.find(p => p.number === currentPhaseNum);
      return result('/pbr:review', String(currentPhaseNum || ''), 'UAT blocker requires review', phase);
    }
  }

  // Priority 3: Active checkpoint (YAML "null" parses as string "null", not JS null)
  if (stateFm.active_checkpoint && stateFm.active_checkpoint !== 'null') {
    const currentPhaseNum = stateFm.current_phase;
    const phase = phases.find(p => p.number === currentPhaseNum);
    return result('/pbr:build', String(currentPhaseNum || ''), 'Active checkpoint needs resolution', phase);
  }

  // Priority 4: Verification gaps
  const gapsPhase = phases.find(p => p.status === 'gaps_found');
  if (gapsPhase) {
    return result('/pbr:plan', `${gapsPhase.number} --gaps`, `Phase ${gapsPhase.number} has verification gaps`, gapsPhase);
  }

  // Priority 5: Built not verified
  const builtPhase = phases.find(p => p.status === 'built');
  if (builtPhase) {
    return result('/pbr:review', String(builtPhase.number), `Phase ${builtPhase.number} built but not verified`, builtPhase);
  }

  // Priority 6: Planned not built
  const plannedPhase = phases.find(p => p.status === 'planned');
  if (plannedPhase) {
    return result(
      '/pbr:build', String(plannedPhase.number),
      `Phase ${plannedPhase.number} planned, ready to build (${plannedPhase.plans_total} plan${plannedPhase.plans_total > 1 ? 's' : ''})`,
      plannedPhase
    );
  }

  // Priority 7: Building in progress
  const buildingPhase = phases.find(p => p.status === 'building');
  if (buildingPhase) {
    return result(
      '/pbr:build', String(buildingPhase.number),
      `Phase ${buildingPhase.number} build in progress (${buildingPhase.plans_complete}/${buildingPhase.plans_total} plans done)`,
      buildingPhase
    );
  }

  // Priority 8: All verified, more phases in ROADMAP
  const verified = phases.filter(p => p.status === 'verified');
  const allVerified = phases.length > 0 && verified.length === phases.length;
  if (allVerified) {
    // Check ROADMAP for unstarted phases
    const roadmapContent = safeReadFile(path.join(planningDir, 'ROADMAP.md'));
    if (roadmapContent) {
      // Look for phase references in roadmap that don't have phase dirs yet
      const roadmapPhaseNums = [];
      const lines = roadmapContent.replace(/\r\n/g, '\n').split('\n');
      for (const line of lines) {
        const phaseMatch = line.match(/###\s+Phase\s+(\d+)/i);
        if (phaseMatch) roadmapPhaseNums.push(parseInt(phaseMatch[1], 10));
        const tableMatch = line.match(/^\|\s*(\d+)\.\s/);
        if (tableMatch) roadmapPhaseNums.push(parseInt(tableMatch[1], 10));
      }
      const existingNums = new Set(phases.map(p => p.number));
      const unstarted = roadmapPhaseNums.filter(n => !existingNums.has(n));
      if (unstarted.length > 0) {
        const nextPhase = Math.min(...unstarted);
        return result('/pbr:plan', String(nextPhase), `All current phases verified, plan phase ${nextPhase}`, null);
      }
    }
  }

  // Priority 9: All milestones complete
  if (stateFm.status === 'milestone-complete') {
    return result('/pbr:new-milestone', '', 'Milestone complete, start next milestone', null);
  }

  // Priority 10: Empty phases exist
  const emptyPhase = phases.find(p => p.status === 'empty');
  if (emptyPhase) {
    return result('/pbr:plan', String(emptyPhase.number), `Phase ${emptyPhase.number} needs planning`, emptyPhase);
  }

  // No phases at all
  if (phases.length === 0) {
    if (stateFm.current_phase != null) {
      return result('/pbr:plan', '', 'No phases found, start planning', null);
    }
    return result('/pbr:begin', '', 'No project initialized', null);
  }

  // Fallback: all verified, no unstarted phases found
  if (allVerified) {
    return result('/pbr:new-milestone', '', 'All phases verified, ready for next milestone', null);
  }

  // True fallback
  return result('/pbr:status', '', 'Review current project state', null);
}

module.exports = { suggestNext };

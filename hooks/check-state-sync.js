#!/usr/bin/env node

/**
 * PostToolUse hook: Auto-sync STATE.md and ROADMAP.md when SUMMARY or
 * VERIFICATION files are written.
 *
 * Bridges the gap between build artifacts (SUMMARY/VERIFICATION) and
 * tracking files (STATE.md/ROADMAP.md) so the status line stays current
 * even when the orchestrator skips update steps.
 *
 * Trigger:
 *   - SUMMARY*.md or *SUMMARY*.md writes inside .planning/phases/
 *   - VERIFICATION.md writes inside .planning/phases/
 *
 * Guards:
 *   - Skips STATE.md / ROADMAP.md writes (prevents circular trigger)
 *   - Skips files outside .planning/phases/
 *   - Skips gracefully when tracking files don't exist
 *
 * Updates:
 *   - ROADMAP.md Progress table: Plans Complete, Status, Completed date
 *   - STATE.md Current Position: Plan count, Status, Last activity, Progress bar
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');

/**
 * Path to PBR lib modules for lazy-requiring state/core functions.
 * Lazy-loaded to avoid circular dependency issues at module load time.
 */
const pbrToolsPath = (() => {
  // Works from both hooks/ (root) and plugins/pbr/scripts/ locations
  const fromRoot = path.join(__dirname, '..', 'plan-build-run', 'bin', 'lib');
  const fromPlugin = path.join(__dirname, '..', '..', '..', 'plan-build-run', 'bin', 'lib');
  try { if (fs.existsSync(path.join(fromRoot, 'state.cjs'))) return fromRoot; } catch (_e) { /* fallthrough */ }
  return fromPlugin;
})();

/** @returns {typeof import('../../../plan-build-run/bin/lib/state.cjs')} */
function getStateLib() {
  return require(path.join(pbrToolsPath, 'state.cjs'));
}

/** @returns {typeof import('../../../plan-build-run/bin/lib/core.cjs')} */
function getCoreLib() {
  return require(path.join(pbrToolsPath, 'core.cjs'));
}

/**
 * Module-level mtime cache for dirty flag detection.
 * Keyed by absolute file path, value is the mtimeMs after our last write.
 * Used to detect external edits between state-sync invocations.
 */
const _lastWriteTimes = new Map();

/**
 * Clear the mtime cache. Exported for testing.
 */
function clearMtimeCache() {
  _lastWriteTimes.clear();
}

/**
 * Check if a file has been externally modified since our last write.
 * Returns true if dirty (external edit detected), false if clean.
 * On first call for a file (no cached mtime), records current mtime and returns false.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {boolean} true if external edit detected
 */
function isDirty(filePath) {
  try {
    const currentMtime = fs.statSync(filePath).mtimeMs;
    const lastMtime = _lastWriteTimes.get(filePath);

    if (lastMtime === undefined) {
      // First run — record current mtime, allow write
      _lastWriteTimes.set(filePath, currentMtime);
      return false;
    }

    // If mtime differs from what we last wrote, someone else edited it
    return currentMtime !== lastMtime;
  } catch (_e) {
    // File doesn't exist or stat failed — not dirty
    return false;
  }
}

/**
 * Record the current mtime of a file after we wrote it.
 *
 * @param {string} filePath - Absolute path to the file
 */
function recordWriteMtime(filePath) {
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    _lastWriteTimes.set(filePath, mtime);
  } catch (_e) {
    // Best effort
  }
}

/**
 * Extract phase number from a phase directory name.
 * E.g., "35-agent-output-budgets" → "35", "02-auth" → "02"
 *
 * @param {string} dirName - Directory name like "35-agent-output-budgets"
 * @returns {string|null} Phase number string or null
 */
function extractPhaseNum(dirName) {
  const match = dirName.match(/^(\d+)-/);
  return match ? match[1] : null;
}

/**
 * Count PLAN and SUMMARY files in a phase directory.
 *
 * @param {string} phaseDir - Absolute path to the phase directory
 * @returns {{ plans: number, summaries: number, completeSummaries: number }}
 */
function countPhaseArtifacts(phaseDir) {
  try {
    const files = fs.readdirSync(phaseDir);
    const plans = files.filter(f => /PLAN.*\.md$/i.test(f));
    const summaries = files.filter(f => /SUMMARY.*\.md$/.test(f) || /.*SUMMARY.*\.md$/.test(f));

    // Filter for summaries that have status: complete in frontmatter
    let completeSummaries = 0;
    for (const s of summaries) {
      try {
        const content = fs.readFileSync(path.join(phaseDir, s), 'utf8');
        if (/status:\s*["']?complete/i.test(content)) {
          completeSummaries++;
        }
      } catch (_e) {
        // Skip unreadable files
      }
    }

    return { plans: plans.length, summaries: summaries.length, completeSummaries };
  } catch (_e) {
    return { plans: 0, summaries: 0, completeSummaries: 0 };
  }
}

/**
 * Update the Progress table in ROADMAP.md content.
 *
 * Progress table format:
 *   | Phase | Plans Complete | Status | Completed |
 *   |-------|----------------|--------|-----------|
 *   | 01. Project Scaffolding | 2/2 | Complete | 2026-02-08 |
 *
 * Phase column contains "NN. Name" — we match on the leading number.
 *
 * @param {string} content - Full ROADMAP.md content
 * @param {string} phaseNum - Phase number (e.g., "35")
 * @param {string} plansComplete - Plans complete string (e.g., "2/3")
 * @param {string} status - New status (e.g., "Complete", "In progress")
 * @param {string|null} completedDate - ISO date or null (sets Completed column)
 * @returns {string} Updated content
 */
function updateProgressTable(content, phaseNum, plansComplete, status, completedDate) {
  const lines = content.split('\n');
  const paddedPhase = phaseNum.padStart(2, '0');

  // Find the Progress table by looking for a header row with "Plans Complete"
  let inProgressTable = false;
  let colIdx = { phase: -1, plans: -1, status: -1, completed: -1 };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inProgressTable) {
      if (line.includes('|') && /Plans?\s*Complete/i.test(line)) {
        // Dynamically detect column positions from header row
        const headers = line.split('|').map(h => h.trim().toLowerCase());
        colIdx = {
          phase: headers.findIndex(h => /phase/i.test(h)),
          milestone: headers.findIndex(h => /milestone/i.test(h)),
          plans: headers.findIndex(h => /plans?\s*complete/i.test(h)),
          status: headers.findIndex(h => /status/i.test(h)),
          completed: headers.findIndex(h => /completed/i.test(h))
        };
        // Need at least phase and plans columns
        if (colIdx.phase === -1) colIdx.phase = 1; // fallback
        inProgressTable = true;
      }
      continue;
    }

    // Skip separator row
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) continue;

    // Non-table line ends the table
    if (!line.includes('|')) break;

    // Check if this row matches our phase number
    const parts = line.split('|');
    if (parts.length < 3) continue;

    const phaseCol = (parts[colIdx.phase] || '').trim();
    const phaseMatch = phaseCol.match(/^(\d+)\./);
    if (!phaseMatch) continue;

    if (phaseMatch[1] === paddedPhase || String(parseInt(phaseMatch[1], 10)) === String(parseInt(phaseNum, 10))) {
      // Update columns using dynamic indices
      if (colIdx.plans !== -1 && colIdx.plans < parts.length) {
        parts[colIdx.plans] = ` ${plansComplete} `;
      }
      if (colIdx.status !== -1 && colIdx.status < parts.length) {
        parts[colIdx.status] = ` ${status} `;
      }
      if (completedDate !== undefined && completedDate !== null && colIdx.completed !== -1 && colIdx.completed < parts.length) {
        parts[colIdx.completed] = ` ${completedDate} `;
      }
      lines[i] = parts.join('|');

      return lines.join('\n');
    }
  }

  // Phase not found in Progress table — return unchanged
  return content;
}

/**
 * Calculate overall progress percentage from all phase directories.
 * Counts completed summaries vs total plans across all phases.
 *
 * @param {string} phasesDir - Path to .planning/phases/
 * @returns {number} Percentage 0-100
 */
function calculateOverallProgress(phasesDir) {
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory());

    let totalPlans = 0;
    let completedPlans = 0;

    for (const entry of entries) {
      const dir = path.join(phasesDir, entry.name);
      const artifacts = countPhaseArtifacts(dir);
      totalPlans += artifacts.plans;
      completedPlans += artifacts.completeSummaries;
    }

    return totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
  } catch (_e) {
    return 0;
  }
}

/**
 * Core state-sync check logic for use by dispatchers.
 *
 * @param {Object} data - Parsed hook input (tool_input, etc.)
 * @returns {null|{output: Object}} null if not applicable, result with message otherwise
 */
function checkStateSync(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const basename = path.basename(filePath);

  // Guard: skip STATE.md and ROADMAP.md writes (prevents circular trigger)
  if (basename === 'STATE.md' || basename === 'ROADMAP.md') return null;

  // Determine if this is a SUMMARY, VERIFICATION, or PLAN write
  const isSummary = basename.includes('SUMMARY') && basename.endsWith('.md');
  const isVerification = basename === 'VERIFICATION.md';
  const isPlan = /PLAN.*\.md$/i.test(basename) && !basename.includes('SUMMARY');

  if (!isSummary && !isVerification && !isPlan) return null;

  // Guard: must be inside .planning/phases/
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!normalizedPath.includes('.planning/phases/')) return null;

  // Extract phase directory
  const phaseDir = path.dirname(filePath);
  const phaseDirName = path.basename(phaseDir);
  const phaseNum = extractPhaseNum(phaseDirName);

  if (!phaseNum) {
    logHook('check-state-sync', 'PostToolUse', 'skip', { reason: 'could not extract phase number', dir: phaseDirName });
    return null;
  }

  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const statePath = path.join(planningDir, 'STATE.md');
  const phasesDir = path.join(planningDir, 'phases');

  // Count artifacts in this phase
  const artifacts = countPhaseArtifacts(phaseDir);

  if (artifacts.plans === 0) {
    logHook('check-state-sync', 'PostToolUse', 'skip', { reason: 'no plans in phase', phase: phaseNum });
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const messages = [];

  // Derive phase metadata for potential phase-line sync
  const phaseNumInt = parseInt(phaseNum, 10);
  const phaseSlug = phaseDirName.replace(/^\d+-/, '');
  const phaseName = phaseSlug.replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  let _totalPhases = 0;
  try {
    _totalPhases = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d+-/.test(e.name)).length;
  } catch (_e) { /* leave as 0 */ }

  if (isSummary) {
    const plansComplete = `${artifacts.completeSummaries}/${artifacts.plans}`;
    const allComplete = artifacts.completeSummaries >= artifacts.plans;
    const newStatus = allComplete ? 'Complete' : 'In progress';
    const completedDate = allComplete ? today : null;

    // Update ROADMAP.md Progress table via lockedFileUpdate
    if (fs.existsSync(roadmapPath)) {
      try {
        if (isDirty(roadmapPath)) {
          logHook('check-state-sync', 'PostToolUse', 'skip-dirty', { file: path.basename(roadmapPath), reason: 'external edit detected' });
        } else {
          const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
          const hasProgressTable = /Plans\s*Complete/i.test(roadmapContent);
          if (!hasProgressTable) {
            messages.push(`ROADMAP.md: No Progress table found. Add a table with columns: | Phase | Plans Complete | Status | Completed | for the current milestone phases.`);
          } else {
            const coreLib = getCoreLib();
            coreLib.lockedFileUpdate(roadmapPath, (content) => {
              return updateProgressTable(content, phaseNum, plansComplete, newStatus, completedDate);
            });
            recordWriteMtime(roadmapPath);
            messages.push(`ROADMAP.md: Phase ${phaseNum} → ${plansComplete} plans, ${newStatus}`);
          }
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'ROADMAP.md update failed', error: e.message });
      }
    }

    // Update STATE.md via lib/state.cjs (locked, atomic per-field updates)
    if (fs.existsSync(statePath)) {
      try {
        if (isDirty(statePath)) {
          logHook('check-state-sync', 'PostToolUse', 'skip-dirty', { file: path.basename(statePath), reason: 'external edit detected' });
        } else {
          const stateContent = fs.readFileSync(statePath, 'utf8');
          const overallPct = calculateOverallProgress(phasesDir);
          const stateLib = getStateLib();

          stateLib.stateUpdate('plans_complete', String(artifacts.completeSummaries), planningDir);
          stateLib.stateUpdate('status', allComplete ? 'built' : 'building', planningDir);
          stateLib.stateUpdate('last_activity', `${today} -- Phase ${phaseNum} plan completed`, planningDir);
          stateLib.stateUpdate('progress_percent', String(overallPct), planningDir);

          // Detect phase mismatch and add phase updates
          const currentPhaseMatch = stateContent.match(/^current_phase:\s*(\d+)/m)
            || stateContent.match(/^Phase:\s*(\d+)\s/m);
          const currentPhase = currentPhaseMatch ? parseInt(currentPhaseMatch[1], 10) : null;
          if (currentPhase !== null && currentPhase !== phaseNumInt) {
            stateLib.stateUpdate('current_phase', String(phaseNumInt), planningDir);
            stateLib.stateUpdate('phase_slug', phaseSlug, planningDir);
            // phase_name frontmatter not in stateUpdate's valid fields — use lockedFileUpdate directly
            const coreLib = getCoreLib();
            coreLib.lockedFileUpdate(statePath, (content) => {
              return stateLib.updateFrontmatterField(content, 'phase_name', phaseName);
            });
            messages.push(`STATE.md: Phase ${currentPhase} → ${phaseNumInt}`);
          }

          recordWriteMtime(statePath);
          messages.push(`STATE.md: ${artifacts.completeSummaries}/${artifacts.plans} plans, ${overallPct}%`);
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'STATE.md update failed', error: e.message });
      }
    }
  }

  if (isVerification) {
    // Read VERIFICATION.md frontmatter for status
    let verStatus = null;
    try {
      if (fs.existsSync(filePath)) {
        const vContent = fs.readFileSync(filePath, 'utf8');
        const statusMatch = vContent.match(/status:\s*["']?(\w+)/i);
        if (statusMatch) {
          verStatus = statusMatch[1].toLowerCase();
        }
      }
    } catch (_e) {
      // Skip if unreadable
    }

    if (!verStatus) {
      logHook('check-state-sync', 'PostToolUse', 'skip', { reason: 'no status in VERIFICATION.md', phase: phaseNum });
      return null;
    }

    const isPassed = verStatus === 'passed';
    const roadmapStatus = isPassed ? 'Complete' : 'Needs fixes';
    const stateStatus = isPassed ? 'Verified' : 'Needs fixes';
    const completedDate = isPassed ? today : null;
    const plansComplete = `${artifacts.completeSummaries}/${artifacts.plans}`;

    // Update ROADMAP.md Progress table via lockedFileUpdate
    if (fs.existsSync(roadmapPath)) {
      try {
        if (isDirty(roadmapPath)) {
          logHook('check-state-sync', 'PostToolUse', 'skip-dirty', { file: path.basename(roadmapPath), reason: 'external edit detected' });
        } else {
          const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
          const hasProgressTable = /Plans\s*Complete/i.test(roadmapContent);
          if (!hasProgressTable) {
            messages.push(`ROADMAP.md: No Progress table found. Add a table with columns: | Phase | Plans Complete | Status | Completed | for the current milestone phases.`);
          } else {
            const coreLib = getCoreLib();
            coreLib.lockedFileUpdate(roadmapPath, (content) => {
              return updateProgressTable(content, phaseNum, plansComplete, roadmapStatus, completedDate);
            });
            recordWriteMtime(roadmapPath);
            messages.push(`ROADMAP.md: Phase ${phaseNum} → ${roadmapStatus}`);
          }
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'ROADMAP.md update failed', error: e.message });
      }
    }

    // Update STATE.md via lib/state.cjs (locked, atomic per-field updates)
    if (fs.existsSync(statePath)) {
      try {
        if (isDirty(statePath)) {
          logHook('check-state-sync', 'PostToolUse', 'skip-dirty', { file: path.basename(statePath), reason: 'external edit detected' });
        } else {
          const stateContent = fs.readFileSync(statePath, 'utf8');
          const overallPct = calculateOverallProgress(phasesDir);
          const stateLib = getStateLib();

          stateLib.stateUpdate('status', isPassed ? 'verified' : 'needs_fixes', planningDir);
          stateLib.stateUpdate('last_activity', `${today} -- Phase ${phaseNum} ${isPassed ? 'verified' : 'needs fixes'}`, planningDir);
          stateLib.stateUpdate('progress_percent', String(overallPct), planningDir);

          // Detect phase mismatch and add phase updates
          const currentPhaseMatch = stateContent.match(/^current_phase:\s*(\d+)/m)
            || stateContent.match(/^Phase:\s*(\d+)\s/m);
          const currentPhase = currentPhaseMatch ? parseInt(currentPhaseMatch[1], 10) : null;
          if (currentPhase !== null && currentPhase !== phaseNumInt) {
            stateLib.stateUpdate('current_phase', String(phaseNumInt), planningDir);
            stateLib.stateUpdate('phase_slug', phaseSlug, planningDir);
            // phase_name frontmatter not in stateUpdate's valid fields — use lockedFileUpdate directly
            const coreLib = getCoreLib();
            coreLib.lockedFileUpdate(statePath, (content) => {
              return stateLib.updateFrontmatterField(content, 'phase_name', phaseName);
            });
            messages.push(`STATE.md: Phase ${currentPhase} → ${phaseNumInt}`);
          }

          recordWriteMtime(statePath);
          messages.push(`STATE.md: ${stateStatus}, ${overallPct}%`);
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'STATE.md update failed', error: e.message });
      }
    }
  }

  if (isPlan) {
    // Status ordering: only set Planning if current status is lower
    const statusOrder = { 'not started': 0, '': 0, 'planning': 1, 'in progress': 2, 'complete': 3, 'needs fixes': 4 };

    if (fs.existsSync(roadmapPath)) {
      try {
        const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
        const hasProgressTable = /Plans\s*Complete/i.test(roadmapContent);
        if (!hasProgressTable) {
          messages.push(`ROADMAP.md: No Progress table found. Add a table with columns: | Phase | Plans Complete | Status | Completed | for the current milestone phases.`);
        } else {
          // Read current status from the Progress table for this phase
          const lines = roadmapContent.split('\n');
          const paddedPhase = phaseNum.padStart(2, '0');
          let currentStatus = '';
          let inTable = false;
          for (const line of lines) {
            if (!inTable) {
              if (line.includes('|') && /Plans\s*Complete/i.test(line)) inTable = true;
              continue;
            }
            if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) continue;
            if (!line.includes('|')) break;
            const parts = line.split('|');
            if (parts.length < 5) continue;
            const phaseCol = (parts[1] || '').trim();
            const phaseMatch = phaseCol.match(/^(\d+)\./);
            if (!phaseMatch) continue;
            if (phaseMatch[1] === paddedPhase || String(parseInt(phaseMatch[1], 10)) === String(parseInt(phaseNum, 10))) {
              currentStatus = (parts[3] || '').trim().toLowerCase();
              break;
            }
          }

          // Only update to "Planning" if current status is lower
          const currentOrder = statusOrder[currentStatus] !== undefined ? statusOrder[currentStatus] : 0;
          const planningOrder = statusOrder['planning'];
          if (currentOrder < planningOrder) {
            const plansComplete = `${artifacts.completeSummaries}/${artifacts.plans}`;
            if (isDirty(roadmapPath)) {
              logHook('check-state-sync', 'PostToolUse', 'skip-dirty', { file: path.basename(roadmapPath), reason: 'external edit detected' });
            } else {
              const coreLib = getCoreLib();
              coreLib.lockedFileUpdate(roadmapPath, (content) => {
                return updateProgressTable(content, phaseNum, plansComplete, 'Planning', null);
              });
              recordWriteMtime(roadmapPath);
              messages.push(`ROADMAP.md: Phase ${phaseNum} → Planning`);
            }
          }
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'ROADMAP.md update failed', error: e.message });
      }
    }
  }

  if (messages.length > 0) {
    const msg = `Auto-synced tracking files: ${messages.join('; ')}`;
    logHook('check-state-sync', 'PostToolUse', 'sync', { phase: phaseNum, updates: messages });
    const trigger = isSummary ? 'summary' : isVerification ? 'verification' : 'plan';
    logEvent('workflow', 'state-sync', { phase: phaseNum, trigger, updates: messages });
    return { output: { additionalContext: msg } };
  }

  logHook('check-state-sync', 'PostToolUse', 'skip', { reason: 'no tracking files to update', phase: phaseNum });
  return null;
}

// Standalone mode
function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const result = checkStateSync(data);
      if (result) {
        process.stdout.write(JSON.stringify(result.output));
      }
      process.exit(0);
    } catch (_e) {
      process.stdout.write(JSON.stringify({ additionalContext: '⚠ [PBR] check-state-sync failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
// Re-export lib functions for backward compatibility with existing tests.
// These were previously defined locally but are now delegated to lib/state.cjs.
// DEPRECATED: Use stateUpdate() from lib/state.cjs for STATE.md mutations instead.
function buildProgressBar(pct) {
  return getStateLib().buildProgressBar(pct);
}

/**
 * @deprecated Use stateUpdate() from lib/state.cjs instead.
 * Kept as a re-export shim for backward compatibility with existing tests.
 */
function updateStatePosition(content, updates) {
  const stateLib = getStateLib();
  let result = content;

  // Frontmatter field updates
  if (result.startsWith('---')) {
    if (updates.fmCurrentPhase !== undefined)
      result = stateLib.updateFrontmatterField(result, 'current_phase', updates.fmCurrentPhase);
    if (updates.fmPhaseSlug !== undefined)
      result = stateLib.updateFrontmatterField(result, 'phase_slug', updates.fmPhaseSlug);
    if (updates.fmPhaseName !== undefined)
      result = stateLib.updateFrontmatterField(result, 'phase_name', updates.fmPhaseName);
    if (updates.fmPlansComplete !== undefined)
      result = stateLib.updateFrontmatterField(result, 'plans_complete', updates.fmPlansComplete);
    if (updates.fmStatus !== undefined)
      result = stateLib.updateFrontmatterField(result, 'status', updates.fmStatus);
    if (updates.fmLastActivity !== undefined)
      result = stateLib.updateFrontmatterField(result, 'last_activity', updates.fmLastActivity);
    if (updates.fmProgressPct !== undefined)
      result = stateLib.updateFrontmatterField(result, 'progress_percent', updates.fmProgressPct);
  }

  // Body line updates via syncBodyLine
  if (updates.status !== undefined)
    result = stateLib.syncBodyLine(result, 'status', updates.status);
  if (updates.planLine !== undefined) {
    // planLine sets "Plan: N of M in current phase" — extract N for plans_complete sync
    result = result.replace(/^(Plan:\s*).+/m, `$1${updates.planLine}`);
  }
  if (updates.phaseLine !== undefined) {
    result = result.replace(/^(Phase:\s*).+/m, `$1${updates.phaseLine}`);
  }
  if (updates.lastActivity !== undefined)
    result = stateLib.syncBodyLine(result, 'last_activity', updates.lastActivity);
  if (updates.progressPct !== undefined)
    result = stateLib.syncBodyLine(result, 'progress_percent', updates.progressPct);

  // Legacy (no frontmatter) — update body lines directly
  if (!content.startsWith('---')) {
    if (updates.status !== undefined)
      result = result.replace(/^(Status:\s*).+/m, `$1${updates.status}`);
    if (updates.progressPct !== undefined)
      result = result.replace(/^(Progress:\s*).+/m, `$1${buildProgressBar(updates.progressPct)}`);
  }

  return result;
}

module.exports = {
  extractPhaseNum,
  countPhaseArtifacts,
  updateProgressTable,
  updateStatePosition,
  buildProgressBar,
  calculateOverallProgress,
  checkStateSync,
  clearMtimeCache
};

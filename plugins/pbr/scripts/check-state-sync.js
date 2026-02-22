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
const { atomicWrite } = require('./pbr-tools');

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
    const plans = files.filter(f => /-PLAN\.md$/.test(f));
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inProgressTable) {
      if (line.includes('|') && /Plans\s*Complete/i.test(line)) {
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
    if (parts.length < 5) continue; // Need at least: empty | Phase | Plans | Status | Completed | empty

    const phaseCol = (parts[1] || '').trim();
    const phaseMatch = phaseCol.match(/^(\d+)\./);
    if (!phaseMatch) continue;

    if (phaseMatch[1] === paddedPhase || String(parseInt(phaseMatch[1], 10)) === String(parseInt(phaseNum, 10))) {
      // Update this row
      parts[2] = ` ${plansComplete} `;
      parts[3] = ` ${status} `;
      if (completedDate !== undefined && completedDate !== null) {
        parts[4] = ` ${completedDate} `;
      }
      lines[i] = parts.join('|');

      return lines.join('\n');
    }
  }

  // Phase not found in Progress table — return unchanged
  return content;
}

/**
 * Update the Current Position section in STATE.md.
 *
 * Handles the legacy (non-frontmatter) format:
 *   ## Current Position
 *   Phase: 1 of 10 (Setup)
 *   Plan: 0 of 2 in current phase
 *   Status: Ready to plan
 *   Last activity: 2026-02-08 -- Project initialized
 *   Progress: [████░░░░░░░░░░░░░░░░] 20%
 *
 * @param {string} content - Full STATE.md content
 * @param {object} updates - Fields to update
 * @param {string} [updates.planLine] - New Plan: line value (e.g., "2 of 3 in current phase")
 * @param {string} [updates.status] - New Status: value (e.g., "Building")
 * @param {string} [updates.lastActivity] - New Last activity: value
 * @param {number} [updates.progressPct] - New progress percentage (0-100)
 * @returns {string} Updated content
 */
function updateStatePosition(content, updates) {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (updates.phaseLine !== undefined && /^Phase:\s/.test(line)) {
      lines[i] = `Phase: ${updates.phaseLine}`;
    }

    if (updates.planLine !== undefined && /^Plan:\s/.test(line)) {
      lines[i] = `Plan: ${updates.planLine}`;
    }

    if (updates.status !== undefined && /^Status:\s/.test(line)) {
      lines[i] = `Status: ${updates.status}`;
    }

    if (updates.lastActivity !== undefined && /^Last activity:\s/i.test(line)) {
      lines[i] = `Last activity: ${updates.lastActivity}`;
    }

    if (updates.progressPct !== undefined && /^Progress:\s/.test(line)) {
      lines[i] = `Progress: ${buildProgressBar(updates.progressPct)}`;
    }
  }

  // Also update frontmatter fields if present
  if (content.startsWith('---')) {
    const fmEnd = content.indexOf('---', 3);
    if (fmEnd !== -1) {
      let fm = content.substring(0, fmEnd + 3);
      const body = content.substring(fmEnd + 3);

      if (updates.fmCurrentPhase !== undefined) {
        fm = fm.replace(/^(current_phase:\s*).*/m, (_, p) => `${p}${updates.fmCurrentPhase}`);
      }
      if (updates.fmTotalPhases !== undefined) {
        fm = fm.replace(/^(total_phases:\s*).*/m, (_, p) => `${p}${updates.fmTotalPhases}`);
      }
      if (updates.fmPhaseSlug !== undefined) {
        fm = fm.replace(/^(phase_slug:\s*).*/m, (_, p) => `${p}"${updates.fmPhaseSlug}"`);
      }
      if (updates.fmPhaseName !== undefined) {
        fm = fm.replace(/^(phase_name:\s*).*/m, (_, p) => `${p}"${updates.fmPhaseName}"`);
      }
      if (updates.fmPlansComplete !== undefined) {
        fm = fm.replace(/^(plans_complete:\s*).*/m, (_, p) => `${p}${updates.fmPlansComplete}`);
      }
      if (updates.fmStatus !== undefined) {
        fm = fm.replace(/^(status:\s*).*/m, (_, p) => `${p}"${updates.fmStatus}"`);
      }
      if (updates.fmLastActivity !== undefined) {
        fm = fm.replace(/^(last_activity:\s*).*/m, (_, p) => `${p}"${updates.fmLastActivity}"`);
      }
      if (updates.fmProgressPct !== undefined) {
        fm = fm.replace(/^(progress_percent:\s*).*/m, (_, p) => `${p}${updates.fmProgressPct}`);
      }

      // Reconstruct with updated frontmatter + body with line updates
      const updatedBody = updateStatePositionBody(body, updates);
      return fm + updatedBody;
    }
  }

  return lines.join('\n');
}

/**
 * Update only the body (after frontmatter) of STATE.md.
 */
function updateStatePositionBody(body, updates) {
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (updates.phaseLine !== undefined && /^Phase:\s/.test(line)) {
      lines[i] = `Phase: ${updates.phaseLine}`;
    }
    if (updates.planLine !== undefined && /^Plan:\s/.test(line)) {
      lines[i] = `Plan: ${updates.planLine}`;
    }
    if (updates.status !== undefined && /^Status:\s/.test(line)) {
      lines[i] = `Status: ${updates.status}`;
    }
    if (updates.lastActivity !== undefined && /^Last activity:\s/i.test(line)) {
      lines[i] = `Last activity: ${updates.lastActivity}`;
    }
    if (updates.progressPct !== undefined && /^Progress:\s/.test(line)) {
      lines[i] = `Progress: ${buildProgressBar(updates.progressPct)}`;
    }
  }

  return lines.join('\n');
}

/**
 * Build a text progress bar: [████░░░░░░░░░░░░░░░░] 20%
 * @param {number} pct - Percentage 0-100
 * @returns {string}
 */
function buildProgressBar(pct) {
  const width = 20;
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${pct}%`;
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

  // Determine if this is a SUMMARY or VERIFICATION write
  const isSummary = basename.includes('SUMMARY') && basename.endsWith('.md');
  const isVerification = basename === 'VERIFICATION.md';

  if (!isSummary && !isVerification) return null;

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

  const cwd = process.cwd();
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
  let totalPhases = 0;
  try {
    totalPhases = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d+-/.test(e.name)).length;
  } catch (_e) { /* leave as 0 */ }

  if (isSummary) {
    const plansComplete = `${artifacts.completeSummaries}/${artifacts.plans}`;
    const allComplete = artifacts.completeSummaries >= artifacts.plans;
    const newStatus = allComplete ? 'Complete' : 'In progress';
    const completedDate = allComplete ? today : null;

    // Update ROADMAP.md Progress table
    if (fs.existsSync(roadmapPath)) {
      try {
        const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
        const updatedRoadmap = updateProgressTable(roadmapContent, phaseNum, plansComplete, newStatus, completedDate);
        if (updatedRoadmap !== roadmapContent) {
          atomicWrite(roadmapPath, updatedRoadmap);
          messages.push(`ROADMAP.md: Phase ${phaseNum} → ${plansComplete} plans, ${newStatus}`);
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'ROADMAP.md update failed', error: e.message });
      }
    }

    // Update STATE.md
    if (fs.existsSync(statePath)) {
      try {
        const stateContent = fs.readFileSync(statePath, 'utf8');
        const overallPct = calculateOverallProgress(phasesDir);
        const stateUpdates = {
          planLine: `${artifacts.completeSummaries} of ${artifacts.plans} in current phase`,
          status: allComplete ? 'Built' : 'Building',
          lastActivity: `${today} -- Phase ${phaseNum} plan completed`,
          progressPct: overallPct,
          fmPlansComplete: artifacts.completeSummaries,
          fmStatus: allComplete ? 'built' : 'building',
          fmLastActivity: today,
          fmProgressPct: overallPct
        };

        // Detect phase mismatch and add phase updates
        const currentPhaseMatch = stateContent.match(/^current_phase:\s*(\d+)/m)
          || stateContent.match(/^Phase:\s*(\d+)\s/m);
        const currentPhase = currentPhaseMatch ? parseInt(currentPhaseMatch[1], 10) : null;
        if (currentPhase !== null && currentPhase !== phaseNumInt) {
          stateUpdates.phaseLine = `${phaseNumInt} of ${totalPhases} (${phaseName})`;
          stateUpdates.fmCurrentPhase = phaseNumInt;
          stateUpdates.fmTotalPhases = totalPhases;
          stateUpdates.fmPhaseSlug = phaseSlug;
          stateUpdates.fmPhaseName = phaseName;
          messages.push(`STATE.md: Phase ${currentPhase} → ${phaseNumInt}`);
        }

        const updatedState = updateStatePosition(stateContent, stateUpdates);
        if (updatedState !== stateContent) {
          atomicWrite(statePath, updatedState);
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

    // Update ROADMAP.md Progress table
    if (fs.existsSync(roadmapPath)) {
      try {
        const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
        const updatedRoadmap = updateProgressTable(roadmapContent, phaseNum, plansComplete, roadmapStatus, completedDate);
        if (updatedRoadmap !== roadmapContent) {
          atomicWrite(roadmapPath, updatedRoadmap);
          messages.push(`ROADMAP.md: Phase ${phaseNum} → ${roadmapStatus}`);
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'ROADMAP.md update failed', error: e.message });
      }
    }

    // Update STATE.md
    if (fs.existsSync(statePath)) {
      try {
        const stateContent = fs.readFileSync(statePath, 'utf8');
        const overallPct = calculateOverallProgress(phasesDir);
        const stateUpdates = {
          status: stateStatus,
          lastActivity: `${today} -- Phase ${phaseNum} ${isPassed ? 'verified' : 'needs fixes'}`,
          progressPct: overallPct,
          fmStatus: isPassed ? 'verified' : 'needs_fixes',
          fmLastActivity: today,
          fmProgressPct: overallPct
        };

        // Detect phase mismatch and add phase updates
        const currentPhaseMatch = stateContent.match(/^current_phase:\s*(\d+)/m)
          || stateContent.match(/^Phase:\s*(\d+)\s/m);
        const currentPhase = currentPhaseMatch ? parseInt(currentPhaseMatch[1], 10) : null;
        if (currentPhase !== null && currentPhase !== phaseNumInt) {
          stateUpdates.phaseLine = `${phaseNumInt} of ${totalPhases} (${phaseName})`;
          stateUpdates.fmCurrentPhase = phaseNumInt;
          stateUpdates.fmTotalPhases = totalPhases;
          stateUpdates.fmPhaseSlug = phaseSlug;
          stateUpdates.fmPhaseName = phaseName;
          messages.push(`STATE.md: Phase ${currentPhase} → ${phaseNumInt}`);
        }

        const updatedState = updateStatePosition(stateContent, stateUpdates);
        if (updatedState !== stateContent) {
          atomicWrite(statePath, updatedState);
          messages.push(`STATE.md: ${stateStatus}, ${overallPct}%`);
        }
      } catch (e) {
        logHook('check-state-sync', 'PostToolUse', 'error', { reason: 'STATE.md update failed', error: e.message });
      }
    }
  }

  if (messages.length > 0) {
    const msg = `Auto-synced tracking files: ${messages.join('; ')}`;
    logHook('check-state-sync', 'PostToolUse', 'sync', { phase: phaseNum, updates: messages });
    logEvent('workflow', 'state-sync', { phase: phaseNum, trigger: isSummary ? 'summary' : 'verification', updates: messages });
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
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = {
  extractPhaseNum,
  countPhaseArtifacts,
  updateProgressTable,
  updateStatePosition,
  buildProgressBar,
  calculateOverallProgress,
  checkStateSync
};

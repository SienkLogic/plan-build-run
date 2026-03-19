#!/usr/bin/env node

/**
 * quick-status.js -- Lightweight status snapshot for Plan-Build-Run.
 *
 * Reads ONLY STATE.md and ROADMAP.md to produce a 10-line plain text summary.
 * Designed to complete in <2 seconds with minimal I/O.
 *
 * Usage:
 *   node quick-status.js                    # standalone
 *   node pbr-tools.js quick-status          # via dispatcher
 *
 * Programmatic:
 *   const { quickStatus } = require('./quick-status');
 *   const { text, data } = quickStatus(planningDir);
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter } = require('./lib/core');

/**
 * Parse milestone information from ROADMAP.md content.
 * Returns { activeName, activeVersion, phaseCount, shippedCount }.
 */
function parseRoadmapInfo(content) {
  if (!content) {
    return { activeName: 'none', activeVersion: '', phaseCount: 0, shippedCount: 0 };
  }

  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let activeName = 'none';
  let activeVersion = '';
  let phaseCount = 0;
  let shippedCount = 0;
  let inActiveMilestone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect ## Milestone: Name (vX.Y) headings
    const msMatch = line.match(/^##\s+Milestone[:\s]+(.+)/i);
    if (msMatch) {
      const raw = msMatch[1].trim();
      const isCompleted = /COMPLETED/i.test(raw) || /SHIPPED/i.test(raw);

      if (isCompleted) {
        shippedCount++;
        inActiveMilestone = false;
        continue;
      }

      // This is an active milestone
      const versionMatch = raw.match(/\(?(v[\d.]+)\)?/i);
      activeVersion = versionMatch ? versionMatch[1] : '';
      activeName = raw
        .replace(/\(v[\d.]+\)/i, '')
        .replace(/\bCOMPLETED\b/i, '')
        .replace(/\bSHIPPED\b/i, '')
        .replace(/[[\]]/g, '')
        .replace(/--?\s*$/, '')
        .trim()
        .replace(/\s+/g, ' ');
      inActiveMilestone = true;
      phaseCount = 0;
      continue;
    }

    // Count phases under active milestone
    if (inActiveMilestone) {
      // Stop at next ## heading that isn't a milestone phase
      if (/^##\s/.test(line) && !msMatch) {
        inActiveMilestone = false;
        continue;
      }
      if (/^###\s+Phase\s+\d+/i.test(line)) {
        phaseCount++;
      }
    }
  }

  // Also count shipped milestones from the summary table
  // Table rows like: | vX.Y | Name | SHIPPED | date |
  const tableShipped = lines.filter(l => /^\|.*SHIPPED/i.test(l)).length;
  if (tableShipped > shippedCount) {
    shippedCount = tableShipped;
  }

  return { activeName, activeVersion, phaseCount, shippedCount };
}

/**
 * Produce a lightweight 10-line status snapshot.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ text: string, data: object }}
 */
function quickStatus(planningDir) {
  // Resolve planningDir from env if not provided
  if (!planningDir) {
    let cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
    const msysMatch = cwd.match(/^\/([a-zA-Z])\/(.*)/);
    if (msysMatch) cwd = msysMatch[1] + ':' + path.sep + msysMatch[2].replace(/\//g, path.sep);
    planningDir = path.join(cwd, '.planning');
  }

  // --- Read STATE.md ---
  let stateFm = {};
  const statePath = path.join(planningDir, 'STATE.md');
  try {
    if (fs.existsSync(statePath)) {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      stateFm = parseYamlFrontmatter(stateContent) || {};
    }
  } catch (_e) { /* graceful fallback */ }

  const currentPhase = stateFm.current_phase != null ? stateFm.current_phase : 'unknown';
  const phaseSlug = stateFm.phase_slug || stateFm.phase_name || 'unknown';
  const status = stateFm.status || 'unknown';
  const plansTotal = stateFm.plans_total != null ? stateFm.plans_total : 0;
  const plansComplete = stateFm.plans_complete != null ? stateFm.plans_complete : 0;
  const progressPercent = stateFm.progress_percent != null ? stateFm.progress_percent : 0;
  const lastActivity = stateFm.last_activity || 'none';

  // --- Read ROADMAP.md ---
  let roadmapInfo = { activeName: 'none', activeVersion: '', phaseCount: 0, shippedCount: 0 };
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  try {
    if (fs.existsSync(roadmapPath)) {
      const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
      roadmapInfo = parseRoadmapInfo(roadmapContent);
    }
  } catch (_e) { /* graceful fallback */ }

  // --- Build data object ---
  const data = {
    current_phase: currentPhase,
    phase_slug: phaseSlug,
    status,
    plans_total: plansTotal,
    plans_complete: plansComplete,
    progress_percent: progressPercent,
    milestone_name: roadmapInfo.activeName,
    milestone_version: roadmapInfo.activeVersion,
    phases_in_milestone: roadmapInfo.phaseCount,
    milestones_shipped: roadmapInfo.shippedCount,
    last_activity: lastActivity
  };

  // --- Build 10-line text output ---
  const milestoneLabel = roadmapInfo.activeVersion
    ? `${roadmapInfo.activeName} (${roadmapInfo.activeVersion})`
    : roadmapInfo.activeName;

  const text = [
    'PBR Quick Status',
    '================',
    `Phase: ${currentPhase} (${phaseSlug})`,
    `Status: ${status}`,
    `Progress: ${plansComplete}/${plansTotal} plans (${progressPercent}%)`,
    `Milestone: ${milestoneLabel}`,
    `Phases in milestone: ${roadmapInfo.phaseCount}`,
    `Milestones shipped: ${roadmapInfo.shippedCount}`,
    `Last activity: ${lastActivity}`,
    '================'
  ].join('\n');

  return { text, data };
}

// --- CLI entry point ---
if (require.main === module || process.argv[1] === __filename) {
  const result = quickStatus();
  process.stdout.write(result.text + '\n');
}

module.exports = { quickStatus };

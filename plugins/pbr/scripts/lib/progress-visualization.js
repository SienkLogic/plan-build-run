'use strict';

/**
 * lib/progress-visualization.cjs — Progress data, phase dependency graph, and agent activity.
 *
 * Provides:
 *   getProgressData(planningDir, config)      — Combined phase graph + agent activity + summary
 *   getPhaseDependencyGraph(planningDir)       — Phase nodes and dependency edges from ROADMAP.md
 *   getAgentActivity(planningDir)             — Recent agent sessions from hooks.jsonl
 */

const fs = require('fs');
const path = require('path');

// ─── Disabled stub ────────────────────────────────────────────────────────────

const DISABLED_STUB = {
  enabled: false,
  phases: [],
  dependencies: [],
  agentActivity: [],
};

// ─── ROADMAP.md phase parsing ─────────────────────────────────────────────────

/**
 * Parse phases from ROADMAP.md content.
 * Extracts phase headings, dependency references, and completion status.
 *
 * @param {string} content - Raw ROADMAP.md content
 * @returns {Array<{id: string, name: string, status: string, goal: string, dependsOn: string[]}>}
 */
function parseRoadmapPhases(content) {
  const phases = [];

  // Match phase headings: ## Phase N: Name or ### Phase N: Name
  const phaseHeadingRe = /^#{2,4}\s*Phase\s+(\d+(?:\.\d+)*)\s*:\s*([^\n]+)/gim;
  // Match checklist items: - [x] or - [ ]
  const checklistRe = /^[-*]\s*\[(x| )\]/im;
  // Match depends-on lines
  const dependsOnRe = /\*\*Depends\s+on[^:]*:\*\*\s*([^\n]+)/i;
  const dependsOnRe2 = /Depends\s+on[^:]*:\s*([^\n]+)/i;

  // Split content into phase blocks by finding heading positions
  const headingMatches = [];
  let m;
  while ((m = phaseHeadingRe.exec(content)) !== null) {
    headingMatches.push({ index: m.index, id: m[1], name: m[2].trim(), end: -1 });
  }

  for (let i = 0; i < headingMatches.length; i++) {
    const start = headingMatches[i].index;
    const end = i + 1 < headingMatches.length ? headingMatches[i + 1].index : content.length;
    const block = content.slice(start, end);

    // Check completion status from checklist items
    const checkMatches = block.match(/^[-*]\s*\[(x| )\]/gim) || [];
    const totalChecks = checkMatches.length;
    const doneChecks = checkMatches.filter(c => c.includes('[x]') || c.includes('[X]')).length;

    let status = 'planned';
    if (totalChecks > 0) {
      if (doneChecks === totalChecks) status = 'completed';
      else if (doneChecks > 0) status = 'in-progress';
      else status = 'planned';
    }

    // Extract depends-on references
    const depMatch = block.match(dependsOnRe) || block.match(dependsOnRe2);
    const dependsOn = [];
    if (depMatch) {
      const depText = depMatch[1];
      const depNums = depText.match(/\d+(?:\.\d+)*/g) || [];
      dependsOn.push(...depNums);
    }

    // Extract goal (first non-heading, non-empty line after heading)
    const blockLines = block.split('\n').slice(1).map(l => l.trim()).filter(Boolean);
    const goalLine = blockLines.find(l => !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('*') && !l.startsWith('**Depends'));
    const goal = goalLine ? goalLine.replace(/^\*+|\*+$/g, '').trim() : '';

    phases.push({
      id: headingMatches[i].id,
      name: headingMatches[i].name,
      status,
      goal,
      dependsOn,
    });
  }

  return phases;
}

// ─── Phase dependency graph ────────────────────────────────────────────────────

/**
 * Build a phase dependency graph from ROADMAP.md.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ nodes: Array, edges: Array }}
 */
function getPhaseDependencyGraph(planningDir) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    return { nodes: [], edges: [] };
  }

  const content = fs.readFileSync(roadmapPath, 'utf8');
  const phases = parseRoadmapPhases(content);

  const nodes = phases.map(p => ({
    id: p.id,
    name: p.name,
    status: p.status,
    goal: p.goal,
  }));

  const edges = [];
  for (const phase of phases) {
    for (const depId of phase.dependsOn) {
      edges.push({ from: depId, to: phase.id });
    }
  }

  return { nodes, edges };
}

// ─── Agent activity ────────────────────────────────────────────────────────────

/**
 * Read recent agent sessions from hooks.jsonl.
 * Pairs start/stop events by sessionId, computes duration.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {Array<{agent: string, startTime: string, endTime: string|null, duration: number|null, status: string}>}
 */
function getAgentActivity(planningDir) {
  const hooksLog = path.join(planningDir, 'logs', 'hooks.jsonl');

  if (!fs.existsSync(hooksLog)) {
    return [];
  }

  let lines;
  try {
    lines = fs.readFileSync(hooksLog, 'utf8').split('\n').filter(Boolean);
  } catch (_e) {
    return [];
  }

  // Parse only log-subagent entries
  const entries = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.hook === 'log-subagent' || entry.type === 'subagent') {
        entries.push(entry);
      }
    } catch (_e) {
      // Skip malformed lines
    }
  }

  // Pair start/stop by sessionId
  const sessions = new Map();
  for (const entry of entries) {
    const sid = entry.sessionId || entry.session_id || entry.id;
    if (!sid) continue;

    if (entry.event === 'start') {
      sessions.set(sid, {
        agent: entry.agent || entry.agentType || 'unknown',
        startTime: entry.timestamp,
        endTime: null,
        duration: null,
        status: 'running',
      });
    } else if (entry.event === 'stop') {
      if (sessions.has(sid)) {
        const session = sessions.get(sid);
        session.endTime = entry.timestamp;
        session.status = entry.exitCode === 0 ? 'success' : 'failed';
        if (session.startTime && session.endTime) {
          const start = new Date(session.startTime).getTime();
          const end = new Date(session.endTime).getTime();
          if (!isNaN(start) && !isNaN(end)) {
            session.duration = Math.round((end - start) / 1000);
          }
        }
      } else {
        // Got a stop without a start — add partial entry
        sessions.set(sid, {
          agent: entry.agent || entry.agentType || 'unknown',
          startTime: null,
          endTime: entry.timestamp,
          duration: null,
          status: entry.exitCode === 0 ? 'success' : 'failed',
        });
      }
    }
  }

  // Sort by startTime descending, limit to 50
  const result = Array.from(sessions.values())
    .sort((a, b) => {
      const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 50);

  return result;
}

// ─── Combined progress data ────────────────────────────────────────────────────

/**
 * Get combined progress data: phase graph + agent activity + summary stats.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object|null} config  - Parsed config object (or null)
 * @returns {object} Progress data or disabled stub
 */
function getProgressData(planningDir, config) {
  const features = (config && config.features) || {};

  // Check feature toggle (default: enabled)
  if (features.progress_visualization === false) {
    return { ...DISABLED_STUB };
  }

  const { nodes, edges } = getPhaseDependencyGraph(planningDir);
  const agentActivity = getAgentActivity(planningDir);

  const total = nodes.length;
  const completed = nodes.filter(n => n.status === 'completed').length;
  const inProgress = nodes.filter(n => n.status === 'in-progress').length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Log audit evidence
  logAuditEvidence(planningDir, 'progress_visualization', 'ok');

  return {
    enabled: true,
    phases: nodes,
    dependencies: edges,
    agentActivity,
    summary: {
      total,
      completed,
      inProgress,
      percentComplete,
    },
  };
}

// ─── Audit evidence ────────────────────────────────────────────────────────────

/**
 * Append an audit evidence entry to .planning/logs/hooks.jsonl.
 * Used to provide evidence that Phase 15 features are active.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {string} feature     - Feature name (e.g., "progress_visualization")
 * @param {string} result      - "ok" or "error"
 */
function logAuditEvidence(planningDir, feature, result) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path.join(logsDir, 'hooks.jsonl');
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      hook: 'dx-progress',
      type: 'audit',
      feature,
      result,
    });
    fs.appendFileSync(logPath, entry + '\n');
  } catch (_e) {
    // Never throw from audit logging
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getProgressData,
  getPhaseDependencyGraph,
  getAgentActivity,
  logAuditEvidence,
  parseRoadmapPhases,
};

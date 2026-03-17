#!/usr/bin/env node

/**
 * SubagentStart / SubagentStop logging hook.
 *
 * Usage:
 *   node log-subagent.js start   — called on SubagentStart
 *   node log-subagent.js stop    — called on SubagentStop
 *
 * On start: logs spawn event and injects project context via additionalContext.
 * On stop: logs completion event.
 *
 * Non-blocking — exits 0 always.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
const { sessionLoad } = require('../plan-build-run/bin/lib/core.cjs');
const { resolveSessionPath } = require('../plan-build-run/bin/lib/core.cjs');

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

/**
 * Extract agent type from hook data, checking multiple possible field locations.
 * Returns the first non-empty value found, or null if no type info is available.
 */
function resolveAgentType(data) {
  return data.agent_type
    || data.subagent_type
    || (data.tool_input && (data.tool_input.subagent_type || data.tool_input.agent_type))
    || null;
}

function main() {
  const action = process.argv[2]; // 'start' or 'stop'
  const data = readStdin();
  const agentType = resolveAgentType(data);

  const sessionId = data.session_id || null;

  if (action === 'start') {
    logHook('log-subagent', 'SubagentStart', 'spawned', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      description: data.description || null
    });
    logEvent('agent', 'spawn', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      description: data.description || null
    });

    // Write .active-agent signal so other hooks know a subagent is running
    writeActiveAgent(agentType || 'unknown');

    // Inject project context into subagent
    const context = buildAgentContext(sessionId);
    if (context) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
          additionalContext: context
        }
      };
      process.stdout.write(JSON.stringify(output));
    }
  } else if (action === 'stop') {
    // Remove .active-agent signal
    removeActiveAgent();
    logHook('log-subagent', 'SubagentStop', 'completed', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      duration_ms: data.duration_ms || null
    });
    logEvent('agent', 'complete', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      duration_ms: data.duration_ms || null
    });

    // Track cumulative agent spawns — warn when excessive
    const cwd = process.cwd();
    const planningDir = path.join(cwd, '.planning');
    const warning = trackAgentCost(planningDir, agentType, data.duration_ms, sessionId);
    if (warning) {
      process.stdout.write(JSON.stringify({ additionalContext: warning }));
    } else {
      // Emit stdout so Claude Code captures SubagentStop in session JSONL for audit visibility
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
    }
  }

  process.exit(0);
}

function writeActiveAgent(agentType) {
  try {
    const cwd = process.cwd();
    const filePath = path.join(cwd, '.planning', '.active-agent');
    if (fs.existsSync(path.join(cwd, '.planning'))) {
      fs.writeFileSync(filePath, agentType, 'utf8');
    }
  } catch (_e) {
    // Best-effort
  }
}

function removeActiveAgent() {
  try {
    const cwd = process.cwd();
    const filePath = path.join(cwd, '.planning', '.active-agent');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_e) {
    // Best-effort
  }
}

const AGENT_COST_FILE = '.agent-cost-tracker';
const AGENT_SPAWN_WARN_THRESHOLD = 10;
const AGENT_SPAWN_CRITICAL_THRESHOLD = 20;

/**
 * Track cumulative agent spawns per session. Returns warning string if threshold exceeded.
 * @param {string} planningDir
 * @param {string|null} agentType
 * @param {number|null} durationMs
 * @param {string|null} sessionId
 * @returns {string|null}
 */
function trackAgentCost(planningDir, agentType, durationMs, sessionId) {
  if (!fs.existsSync(planningDir)) return null;

  const trackerPath = sessionId
    ? resolveSessionPath(planningDir, AGENT_COST_FILE, sessionId)
    : path.join(planningDir, AGENT_COST_FILE);

  let tracker = { total_spawns: 0, total_duration_ms: 0, by_type: {} };
  try {
    tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
  } catch (_e) { /* start fresh */ }

  tracker.total_spawns = (tracker.total_spawns || 0) + 1;
  tracker.total_duration_ms = (tracker.total_duration_ms || 0) + (durationMs || 0);
  if (agentType) {
    if (!tracker.by_type) tracker.by_type = {};
    tracker.by_type[agentType] = (tracker.by_type[agentType] || 0) + 1;
  }

  try { fs.writeFileSync(trackerPath, JSON.stringify(tracker), 'utf8'); } catch (_e) { /* best-effort */ }

  // Warn at thresholds
  if (tracker.total_spawns === AGENT_SPAWN_CRITICAL_THRESHOLD) {
    const topAgents = Object.entries(tracker.by_type || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t}: ${c}`).join(', ');
    return `[pbr] CRITICAL: ${tracker.total_spawns} agents spawned this session (~${Math.round(tracker.total_duration_ms / 1000)}s total). Top: ${topAgents}. Run /pbr:pause-work to cycle session and reclaim context.`;
  }
  if (tracker.total_spawns === AGENT_SPAWN_WARN_THRESHOLD) {
    return `[pbr] Advisory: ${tracker.total_spawns} agents spawned this session (~${Math.round(tracker.total_duration_ms / 1000)}s total). Consider /pbr:pause-work if context quality is degrading.`;
  }

  return null;
}

function buildAgentContext(sessionId) {
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  if (!fs.existsSync(planningDir)) return '';

  const parts = [];

  // Current phase and status from STATE.md
  const stateFile = path.join(planningDir, 'STATE.md');
  if (fs.existsSync(stateFile)) {
    try {
      const state = fs.readFileSync(stateFile, 'utf8');
      const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+(\d+)/);
      const statusMatch = state.match(/\*{0,2}(?:Phase\s+)?Status\*{0,2}:\s*["']?(\w+)["']?/i);
      if (phaseMatch) {
        parts.push(`Phase ${phaseMatch[1]} of ${phaseMatch[2]}${statusMatch ? ' (' + statusMatch[1] + ')' : ''}`);
      }
    } catch (_e) {
      // skip
    }
  }

  // Active skill context — session-scoped when sessionId available
  let activeSkill = sessionLoad(planningDir, sessionId).activeSkill || '';
  if (!activeSkill) {
    const skillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    try { activeSkill = fs.readFileSync(skillPath, 'utf8').trim(); } catch (_) { /* file missing */ }
  }
  if (activeSkill) parts.push(`Active skill: /pbr:${activeSkill}`);

  // Config highlights
  const config = configLoad(planningDir);
  if (config) {
    const configParts = [];
    if (config.depth) configParts.push(`depth=${config.depth}`);
    if (config.git && config.git.auto_commit !== undefined) configParts.push(`auto_commit=${config.git.auto_commit}`);
    if (configParts.length > 0) parts.push(`Config: ${configParts.join(', ')}`);
  }

  if (parts.length === 0) return '';
  return '[Plan-Build-Run Project Context] ' + parts.join(' | ');
}

/**
 * HTTP handler for hook-server.js integration.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, ... }.
 * Uses reqBody.event to distinguish SubagentStart vs SubagentStop.
 * Must NOT call process.exit().
 * @param {{ event: string, data: object, planningDir: string }} reqBody
 * @returns {{ additionalContext: string }|null}
 */
function handleHttp(reqBody) {
  const event = reqBody.event || '';
  const data = reqBody.data || {};
  const agentType = resolveAgentType(data);

  if (event === 'SubagentStart') {
    logHook('log-subagent', 'SubagentStart', 'spawned', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      description: data.description || null
    });
    logEvent('agent', 'spawn', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      description: data.description || null
    });

    // Write .active-agent signal — use planningDir from reqBody if available
    const planningDir = reqBody.planningDir;
    if (planningDir) {
      try {
        const filePath = path.join(planningDir, '.active-agent');
        if (fs.existsSync(planningDir)) {
          fs.writeFileSync(filePath, agentType || 'unknown', 'utf8');
        }
      } catch (_e) { /* best-effort */ }
    } else {
      writeActiveAgent(agentType || 'unknown');
    }

    const httpSessionId = data.session_id || null;
    const context = buildAgentContext(httpSessionId);
    if (context) {
      return {
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
          additionalContext: context
        }
      };
    }
    return null;
  } else if (event === 'SubagentStop') {
    // Remove .active-agent signal
    const planningDir = reqBody.planningDir;
    if (planningDir) {
      try {
        const filePath = path.join(planningDir, '.active-agent');
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_e) { /* best-effort */ }
    } else {
      removeActiveAgent();
    }
    logHook('log-subagent', 'SubagentStop', 'completed', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      duration_ms: data.duration_ms || null
    });
    logEvent('agent', 'complete', {
      agent_id: data.agent_id || null,
      agent_type: agentType,
      duration_ms: data.duration_ms || null
    });

    // Track agent cost via HTTP path
    const costPlanningDir = reqBody.planningDir || path.join(process.cwd(), '.planning');
    const httpSessionId = data.session_id || null;
    const costWarning = trackAgentCost(costPlanningDir, agentType, data.duration_ms, httpSessionId);
    if (costWarning) {
      return { additionalContext: costWarning };
    }
    return null;
  }
  return null;
}

module.exports = { buildAgentContext, resolveAgentType, handleHttp, trackAgentCost, AGENT_SPAWN_WARN_THRESHOLD, AGENT_SPAWN_CRITICAL_THRESHOLD };
if (require.main === module || process.argv[1] === __filename) { main(); }

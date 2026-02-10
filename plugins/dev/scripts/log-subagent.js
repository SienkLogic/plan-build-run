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

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

function main() {
  const action = process.argv[2]; // 'start' or 'stop'
  const data = readStdin();

  if (action === 'start') {
    logHook('log-subagent', 'SubagentStart', 'spawned', {
      agent_id: data.agent_id || null,
      agent_type: data.agent_type || data.subagent_type || null,
      description: data.description || null
    });
    logEvent('agent', 'spawn', {
      agent_id: data.agent_id || null,
      agent_type: data.agent_type || data.subagent_type || null,
      description: data.description || null
    });

    // Write .active-agent signal so other hooks know a subagent is running
    writeActiveAgent(data.agent_type || data.subagent_type || 'unknown');

    // Inject project context into subagent
    const context = buildAgentContext();
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
      agent_type: data.agent_type || data.subagent_type || null,
      duration_ms: data.duration_ms || null
    });
    logEvent('agent', 'complete', {
      agent_id: data.agent_id || null,
      agent_type: data.agent_type || data.subagent_type || null,
      duration_ms: data.duration_ms || null
    });
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

function buildAgentContext() {
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

  // Active skill context
  const activeSkillFile = path.join(planningDir, '.active-skill');
  if (fs.existsSync(activeSkillFile)) {
    try {
      const skill = fs.readFileSync(activeSkillFile, 'utf8').trim();
      if (skill) parts.push(`Active skill: /dev:${skill}`);
    } catch (_e) {
      // skip
    }
  }

  // Config highlights
  const configFile = path.join(planningDir, 'config.json');
  if (fs.existsSync(configFile)) {
    try {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const configParts = [];
      if (config.depth) configParts.push(`depth=${config.depth}`);
      if (config.git && config.git.auto_commit !== undefined) configParts.push(`auto_commit=${config.git.auto_commit}`);
      if (configParts.length > 0) parts.push(`Config: ${configParts.join(', ')}`);
    } catch (_e) {
      // skip
    }
  }

  if (parts.length === 0) return '';
  return '[Towline Project Context] ' + parts.join(' | ');
}

module.exports = { buildAgentContext };
if (require.main === module) { main(); }

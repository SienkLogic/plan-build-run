#!/usr/bin/env node

/**
 * PreToolUse hook: Blocks subagents (except pbr:general) from writing STATE.md.
 *
 * STATE.md is the source of truth for project position and should only be
 * written by skills (orchestrators) or the general agent, never by specialized
 * agents like executor, planner, or verifier.
 *
 * Detection: reads .planning/.active-agent (written by log-subagent.js).
 *
 * Exit codes:
 *   0 = allowed or not applicable
 *   2 = blocked (agent not allowed to write STATE.md)
 */

const fs = require('fs');
const path = require('path');
const { resolveSessionPath } = require('./lib/core');

const BLOCKED_AGENTS = [
  'pbr:executor',
  'pbr:planner',
  'pbr:verifier',
  'pbr:researcher',
  'pbr:plan-checker',
  'pbr:integration-checker',
  'pbr:debugger',
  'pbr:codebase-mapper',
  'pbr:synthesizer',
  'pbr:audit',
];

function checkAgentStateWrite(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  if (!filePath) return null;

  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized.endsWith('.planning/STATE.md')) return null;

  // Check if we're inside a subagent — try session-scoped path first, fall back to global
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const sessionId = data.session_id || null;

  let agent;
  try {
    if (sessionId) {
      const sessionPath = resolveSessionPath(planningDir, '.active-agent', sessionId);
      if (fs.existsSync(sessionPath)) {
        agent = fs.readFileSync(sessionPath, 'utf8').trim();
      }
    }
    if (!agent) {
      const globalPath = path.join(planningDir, '.active-agent');
      agent = fs.readFileSync(globalPath, 'utf8').trim();
    }
  } catch (_e) {
    // No .active-agent file — not in an agent context
    return null;
  }

  if (!agent || !BLOCKED_AGENTS.includes(agent)) return null;

  return {
    exitCode: 2,
    output: {
      decision: 'block',
      reason: `Agent write to STATE.md blocked.\n\n${agent} is not allowed to write STATE.md. Only skills (orchestrators) and pbr:general may update this file to prevent state corruption.\n\nReturn results to the calling skill and let it update STATE.md.`
    }
  };
}

module.exports = { checkAgentStateWrite, BLOCKED_AGENTS };

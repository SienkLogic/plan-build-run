#!/usr/bin/env node

/**
 * TaskCompleted hook: Logs agent task completion with output summary.
 *
 * Fires when a Task() sub-agent finishes (distinct from SubagentStop).
 * Logs the completion event and agent type for workflow tracking.
 *
 * Non-blocking — exits 0 always.
 */

const fs = require('fs');
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
  const data = readStdin();

  logHook('task-completed', 'TaskCompleted', 'completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    duration_ms: data.duration_ms || null
  });

  logEvent('agent', 'task-completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    duration_ms: data.duration_ms || null
  });

  process.exit(0);
}

if (require.main === module) { main(); }
module.exports = { main };

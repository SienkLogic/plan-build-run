#!/usr/bin/env node

/**
 * SubagentStart / SubagentStop logging hook.
 *
 * Usage:
 *   node log-subagent.js start   — called on SubagentStart
 *   node log-subagent.js stop    — called on SubagentStop
 *
 * Parses stdin JSON for agent metadata and logs to .planning/.hook-log.
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
  } else if (action === 'stop') {
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

main();

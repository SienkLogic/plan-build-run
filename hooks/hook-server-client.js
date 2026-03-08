#!/usr/bin/env node

/**
 * hook-server-client.js — Thin HTTP client for the PBR hook server.
 *
 * Reads hook input from stdin (JSON), POSTs it to the local hook server,
 * and relays the server response to stdout.
 *
 * Fail-open by design: if the server is not reachable or any error occurs,
 * the client exits 0 (allowing the hook to pass through silently).
 *
 * Usage (called by hooks.json commands):
 *   node hook-server-client.js <hook-name> [port]
 *
 * Arguments:
 *   argv[2]  Hook name (e.g. "track-context-budget")
 *   argv[3]  Server port (default: 19836)
 */

'use strict';

const http = require('http');
const net = require('net');
const path = require('path');

const DEFAULT_PORT = 19836;

// ---------------------------------------------------------------------------
// HOOK_EVENT_MAP: maps hook script names to { event, tool } pairs
// ---------------------------------------------------------------------------

const HOOK_EVENT_MAP = {
  'track-context-budget': { event: 'PostToolUse',        tool: 'Read'  },
  'context-bridge':       { event: 'PostToolUse',        tool: 'Write' },
  'post-write-dispatch':  { event: 'PostToolUse',        tool: 'Write' },
  'post-bash-triage':     { event: 'PostToolUse',        tool: 'Bash'  },
  'check-subagent-output':{ event: 'PostToolUse',        tool: 'Task'  },
  'log-tool-failure':     { event: 'PostToolUseFailure', tool: '*'     },
  'log-subagent-start':   { event: 'SubagentStart',      tool: '*'     },
  'log-subagent':         { event: 'SubagentStop',       tool: '*'     },
  'event-handler':        { event: 'SubagentStop',       tool: '*'     },
  'task-completed':       { event: 'TaskCompleted',      tool: '*'     },
  'context-budget-check': { event: 'PreCompact',         tool: '*'     },
  'instructions-loaded':  { event: 'InstructionsLoaded', tool: '*'     },
  'check-config-change':  { event: 'ConfigChange',       tool: '*'     },
  'session-cleanup':      { event: 'SessionEnd',         tool: '*'     },
  'worktree-create':      { event: 'WorktreeCreate',     tool: '*'     },
  'worktree-remove':      { event: 'WorktreeRemove',     tool: '*'     }
};

// ---------------------------------------------------------------------------
// TCP probe — check if server port is open before committing to an HTTP call
// ---------------------------------------------------------------------------

/**
 * Probe whether the given port is accepting connections on 127.0.0.1.
 * @param {number} port
 * @param {number} [timeoutMs=200]
 * @returns {Promise<boolean>}
 */
function probePort(port, timeoutMs) {
  timeoutMs = timeoutMs || 200;
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function done(result) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(timeoutMs);
    socket.connect(port, '127.0.0.1', () => done(true));
    socket.on('error', () => done(false));
    socket.on('timeout', () => done(false));
  });
}

// ---------------------------------------------------------------------------
// HTTP POST to hook server
// ---------------------------------------------------------------------------

/**
 * POST payload to http://127.0.0.1:{port}/hook
 * @param {number} port
 * @param {string} body - JSON string
 * @param {number} [timeoutMs=200]
 * @returns {Promise<string>} Response body text
 */
function postHook(port, body, timeoutMs) {
  timeoutMs = timeoutMs || 200;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path: '/hook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('request timeout'));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Direct fallback for lifecycle hooks when the server is unreachable
// ---------------------------------------------------------------------------

const DIRECT_FALLBACK_SCRIPTS = {
  'worktree-create': 'worktree-create',
  'worktree-remove': 'worktree-remove'
};

/**
 * When the hook server is not running, lifecycle hooks like WorktreeCreate
 * still need to produce valid output. Fall back to requiring the script
 * directly and calling its handleHttp export.
 */
function tryDirectFallback(hookName, inputData) {
  const scriptBase = DIRECT_FALLBACK_SCRIPTS[hookName];
  if (!scriptBase) return null;

  try {
    const mod = require(path.join(__dirname, scriptBase + '.js'));
    if (typeof mod.handleHttp === 'function') {
      const mapping = HOOK_EVENT_MAP[hookName];
      return mod.handleHttp({
        event: mapping ? mapping.event : hookName,
        tool: mapping ? mapping.tool : '*',
        data: inputData
      });
    }
  } catch (_e) {
    // Fall through — return generic context so the hook still has output
  }
  return { additionalContext: `[Plan-Build-Run] ${hookName} completed (server offline).` };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const hookName = process.argv[2] || '';
  const port = parseInt(process.argv[3], 10) || DEFAULT_PORT;

  // Read stdin
  let stdinData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    stdinData += chunk;
  }

  // Parse stdin as JSON (fail-open on bad input)
  let inputData;
  try {
    inputData = JSON.parse(stdinData);
  } catch (_e) {
    process.stdout.write('{}');
    process.exit(0);
    return;
  }

  // Resolve event/tool from hook name
  const mapping = HOOK_EVENT_MAP[hookName];
  if (!mapping) {
    // Unknown hook — pass through silently
    process.stdout.write('{}');
    process.exit(0);
    return;
  }

  // Probe port before attempting HTTP call
  let reachable = false;
  try {
    reachable = await probePort(port, 200);
  } catch (_e) {
    reachable = false;
  }

  if (!reachable) {
    // Server not running — try direct fallback for lifecycle hooks
    const directFallback = tryDirectFallback(hookName, inputData);
    if (directFallback) {
      process.stdout.write(JSON.stringify(directFallback));
    } else {
      process.stdout.write('{}');
    }
    process.exit(0);
    return;
  }

  // Build request payload
  const payload = JSON.stringify({
    event: mapping.event,
    tool: mapping.tool,
    data: inputData
  });

  // POST to hook server
  let responseText = '';
  try {
    responseText = await postHook(port, payload, 200);
  } catch (_e) {
    process.stdout.write('{}');
    process.exit(0);
    return;
  }

  // Parse and relay response
  let response;
  try {
    response = JSON.parse(responseText);
  } catch (_e) {
    process.stdout.write('{}');
    process.exit(0);
    return;
  }

  // Relay additionalContext or decision/reason to Claude Code via stdout
  const out = {};
  if (response.additionalContext) out.additionalContext = response.additionalContext;
  if (response.decision !== undefined) {
    out.decision = response.decision;
    if (response.reason !== undefined) out.reason = response.reason;
  }
  // Always write JSON to stdout — WorktreeCreate hooks require output to confirm success
  process.stdout.write(JSON.stringify(out));

  process.exit(0);
}

main().catch(() => {
  // Fail-open on any unhandled error — still produce output for hooks that require it
  process.stdout.write('{}');
  process.exit(0);
});

module.exports = { probePort, postHook, HOOK_EVENT_MAP, DEFAULT_PORT };

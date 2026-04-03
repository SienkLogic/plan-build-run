#!/usr/bin/env node
'use strict';

/**
 * PermissionDenied hook: Logs permission denials to hooks.jsonl and events.jsonl.
 *
 * Fires when the auto mode classifier denies a tool call.
 * Captures tool name, denial reason, and truncated input for audit visibility.
 *
 * Exit codes:
 *   0 = always (informational hook, never blocks)
 */

const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(input));
      } catch (_e) {
        resolve({});
      }
    });
  });
}

async function main() {
  const data = await readStdin();

  const toolName = data.tool_name || 'unknown';
  const reason = data.error || data.reason || 'unknown reason';
  const toolInput = data.tool_input || {};
  const truncatedInput = JSON.stringify(toolInput).substring(0, 200);

  logHook('permission-denied', 'PermissionDenied', 'denied', {
    tool: toolName,
    reason: typeof reason === 'string' ? reason.substring(0, 200) : JSON.stringify(reason).substring(0, 200),
    input: truncatedInput
  });

  logEvent('permission', 'denied', {
    tool: toolName,
    reason: typeof reason === 'string' ? reason.substring(0, 500) : JSON.stringify(reason).substring(0, 500)
  });

  process.exit(0);
}

if (require.main === module || process.argv[1] === __filename) {
  main().catch(() => {});
}

/**
 * HTTP handler for hook-server.js integration.
 * Called as handleHttp(reqBody, cache) where reqBody = { data, planningDir, ... }.
 * Must NOT call process.exit().
 * @param {{ data: object }} reqBody
 * @returns {null}
 */
function handleHttp(reqBody) {
  const data = reqBody.data || {};
  const toolName = data.tool_name || 'unknown';
  const reason = data.error || data.reason || 'unknown reason';
  const toolInput = data.tool_input || {};
  const truncatedInput = JSON.stringify(toolInput).substring(0, 200);

  logHook('permission-denied', 'PermissionDenied', 'denied', {
    tool: toolName,
    reason: typeof reason === 'string' ? reason.substring(0, 200) : JSON.stringify(reason).substring(0, 200),
    input: truncatedInput
  });

  logEvent('permission', 'denied', {
    tool: toolName,
    reason: typeof reason === 'string' ? reason.substring(0, 500) : JSON.stringify(reason).substring(0, 500)
  });

  return null;
}

module.exports = { handleHttp };

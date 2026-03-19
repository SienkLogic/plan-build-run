#!/usr/bin/env node

/**
 * PostToolUseFailure hook: Logs tool failures to events.jsonl
 * and provides recovery hints via additionalContext.
 *
 * Fires when any tool execution fails. Captures tool name, error,
 * and session context for debugging.
 *
 * Exit codes:
 *   0 = always (informational hook, never blocks)
 */

const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { recordIncident } = require('./record-incident');

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
  const error = data.error || 'unknown error';
  const isInterrupt = data.is_interrupt || false;
  const toolInput = data.tool_input || {};

  // Log to hooks.jsonl
  logHook('log-tool-failure', 'PostToolUseFailure', 'logged', {
    tool: toolName,
    error: typeof error === 'string' ? error.substring(0, 200) : JSON.stringify(error).substring(0, 200),
    interrupt: isInterrupt
  });

  // Log to events.jsonl with more detail
  logEvent('tool', 'failure', {
    tool: toolName,
    error: typeof error === 'string' ? error.substring(0, 500) : JSON.stringify(error).substring(0, 500),
    interrupt: isInterrupt,
    input_summary: summarizeInput(toolName, toolInput)
  });

  // Record tool failure as incident (fire-and-forget)
  recordIncident({
    source: 'hook',
    type: 'error',
    severity: 'error',
    issue: `Tool failure: ${toolName} — ${typeof error === 'string' ? error.slice(0, 200) : JSON.stringify(error).slice(0, 200)}`,
    context: { tool: toolName, interrupt: isInterrupt }
  });

  // Provide recovery hints for Bash failures (most common actionable failure)
  if (toolName === 'Bash' && !isInterrupt) {
    const output = {
      additionalContext: '[Tool Failure] Bash command failed. To investigate: check the error output above for permission/path issues. For recurring failures: /pbr:debug for systematic investigation.'
    };
    process.stdout.write(JSON.stringify(output));
  }

  process.exit(0);
}

function summarizeInput(toolName, toolInput) {
  switch (toolName) {
  case 'Bash':
    return (toolInput.command || '').substring(0, 100);
  case 'Write':
  case 'Read':
  case 'Edit':
    return toolInput.file_path || '';
  case 'Glob':
    return toolInput.pattern || '';
  case 'Grep':
    return toolInput.pattern || '';
  case 'Task':
    return (toolInput.description || '').substring(0, 100);
  default:
    return '';
  }
}

main().catch(() => {});

/**
 * HTTP handler for hook-server.js integration.
 * Called as handleHttp(reqBody, cache) where reqBody = { data, planningDir, ... }.
 * Must NOT call process.exit().
 * @param {{ data: object }} reqBody
 * @returns {{ additionalContext: string }|null}
 */
function handleHttp(reqBody) {
  const data = reqBody.data || {};
  const toolName = data.tool_name || 'unknown';
  const error = data.error || 'unknown error';
  const isInterrupt = data.is_interrupt || false;
  const toolInput = data.tool_input || {};

  logHook('log-tool-failure', 'PostToolUseFailure', 'logged', {
    tool: toolName,
    error: typeof error === 'string' ? error.substring(0, 200) : JSON.stringify(error).substring(0, 200),
    interrupt: isInterrupt
  });

  logEvent('tool', 'failure', {
    tool: toolName,
    error: typeof error === 'string' ? error.substring(0, 500) : JSON.stringify(error).substring(0, 500),
    interrupt: isInterrupt,
    input_summary: summarizeInput(toolName, toolInput)
  });

  // Record tool failure as incident (fire-and-forget)
  recordIncident({
    source: 'hook',
    type: 'error',
    severity: 'error',
    issue: `Tool failure: ${toolName} — ${typeof error === 'string' ? error.slice(0, 200) : JSON.stringify(error).slice(0, 200)}`,
    context: { tool: toolName, interrupt: isInterrupt }
  });

  if (toolName === 'Bash' && !isInterrupt) {
    return {
      additionalContext: '[Tool Failure] Bash command failed. To investigate: check the error output above for permission/path issues. For recurring failures: /pbr:debug for systematic investigation.'
    };
  }
  return null;
}

module.exports = { handleHttp, summarizeInput };

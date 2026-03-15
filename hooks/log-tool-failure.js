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

  // Provide recovery hints for tool failures
  let hint = null;
  if (toolName === 'Bash' && !isInterrupt) {
    hint = '[Tool Failure] Bash command failed. Check the error output above for permission/path issues. For recurring failures: /pbr:debug for systematic investigation.';
  } else if (toolName === 'Write' || toolName === 'Edit') {
    hint = `[Tool Failure] ${toolName} failed for ${(toolInput.file_path || 'unknown file')}. Check: (1) directory exists, (2) file is not read-only, (3) path uses forward slashes. For path issues: verify with Glob.`;
  } else if (toolName === 'Read') {
    hint = `[Tool Failure] Read failed for ${(toolInput.file_path || 'unknown file')}. Check: (1) file exists on disk, (2) path is absolute, (3) no typos in filename. Use Glob to find the correct path.`;
  } else if (toolName === 'Task') {
    hint = '[Tool Failure] Task (subagent) failed. Check: (1) subagent_type is valid (pbr:*), (2) prompt is not empty, (3) no circular spawning. Re-run the parent skill to retry.';
  }
  if (hint) {
    const output = { additionalContext: hint };
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

  let hint = null;
  if (toolName === 'Bash' && !isInterrupt) {
    hint = '[Tool Failure] Bash command failed. Check the error output above for permission/path issues. For recurring failures: /pbr:debug for systematic investigation.';
  } else if (toolName === 'Write' || toolName === 'Edit') {
    hint = `[Tool Failure] ${toolName} failed for ${(toolInput.file_path || 'unknown file')}. Check: (1) directory exists, (2) file is not read-only, (3) path uses forward slashes. For path issues: verify with Glob.`;
  } else if (toolName === 'Read') {
    hint = `[Tool Failure] Read failed for ${(toolInput.file_path || 'unknown file')}. Check: (1) file exists on disk, (2) path is absolute, (3) no typos in filename. Use Glob to find the correct path.`;
  } else if (toolName === 'Task') {
    hint = '[Tool Failure] Task (subagent) failed. Check: (1) subagent_type is valid (pbr:*), (2) prompt is not empty, (3) no circular spawning. Re-run the parent skill to retry.';
  }
  if (hint) {
    return { additionalContext: hint };
  }
  return null;
}

module.exports = { handleHttp, summarizeInput };

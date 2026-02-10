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

  // Provide recovery hints for Bash failures (most common actionable failure)
  if (toolName === 'Bash' && !isInterrupt) {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: 'Bash command failed. If this is a recurring issue, consider using /dev:debug for systematic investigation.'
      }
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

main();

#!/usr/bin/env node

/**
 * PostToolUse hook for Bash: Triages test failure output using the local LLM.
 *
 * When a Bash command that looks like a test invocation exits with a non-zero
 * exit code, this hook sends the output to the local LLM for classification.
 * The triage result is returned as advisory context to help the frontier model
 * focus on the right failure category without re-parsing raw test output.
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, never blocks)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const TEST_COMMAND_PATTERNS = [
  /\bnpm\s+test\b/,
  /\bnpx\s+jest\b/,
  /\bnpx\s+vitest\b/,
  /\bpytest\b/,
  /\bmocha\b/,
  /\bjest\b/,
  /\bvitest\b/,
  /\bcargo\s+test\b/,
  /\bgo\s+test\b/,
  /\bnpm\s+run\s+test/
];

/**
 * Detect the test runner from the command string.
 * @param {string} command
 * @returns {string|null}
 */
function detectTestRunner(command) {
  if (/jest/i.test(command)) return 'jest';
  if (/vitest/i.test(command)) return 'vitest';
  if (/pytest/i.test(command)) return 'pytest';
  if (/mocha/i.test(command)) return 'mocha';
  if (/cargo\s+test/i.test(command)) return 'cargo';
  if (/go\s+test/i.test(command)) return 'go';
  return null;
}

/**
 * Check if Bash output contains test failure and triage it.
 * Local LLM triage removed (phase 53). This function now always returns null.
 * @param {object} _data - parsed hook data
 * @returns {Promise<{output: object}|null>}
 */
async function checkTestTriage(_data) {
  return null;
}

/**
 * HTTP handler for hook-server.js.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 *
 * @param {Object} reqBody - Request body from hook-server
 * @param {Object} _cache - In-memory server cache (unused)
 * @returns {Promise<Object|null>} Hook response or null
 */
async function handleHttp(reqBody, _cache) {
  const data = reqBody.data || {};
  try {
    const result = await checkTestTriage(data);
    return result ? result.output : null;
  } catch (_e) {
    return null;
  }
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);

      try { logHook('post-bash-triage', 'PostToolUse', 'entry', {}); } catch (_e) { /* never crash */ }

      const result = await checkTestTriage(data);
      if (result) {
        process.stdout.write(JSON.stringify(result.output));
      }
      process.exit(0);
    } catch (_e) {
      // Don't block on errors
      process.exit(0);
    }
  });
}

module.exports = { checkTestTriage, detectTestRunner, handleHttp };
if (require.main === module || process.argv[1] === __filename) { main(); }

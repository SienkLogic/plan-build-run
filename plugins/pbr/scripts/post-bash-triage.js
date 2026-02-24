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
const { resolveConfig } = require('./local-llm/health');
const { triageTestOutput } = require('./local-llm/operations/triage-test-output');

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
 * Load and resolve the local_llm config block from .planning/config.json.
 */
function loadLocalLlmConfig(cwd) {
  try {
    const configPath = path.join(cwd || process.cwd(), '.planning', 'config.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return resolveConfig(parsed.local_llm);
  } catch (_e) {
    return resolveConfig(undefined);
  }
}

/**
 * Check if Bash output contains test failure and triage it.
 * @param {object} data - parsed hook data
 * @returns {Promise<{output: object}|null>}
 */
async function checkTestTriage(data) {
  const command = data.tool_input?.command || '';
  const toolOutput = data.tool_output || '';
  const exitCode = data.tool_exit_code;

  // Only triage test commands that failed
  if (exitCode === 0 || exitCode === undefined) return null;
  if (!TEST_COMMAND_PATTERNS.some(p => p.test(command))) return null;
  if (!toolOutput || toolOutput.length < 20) return null;

  const cwd = process.cwd();
  const llmConfig = loadLocalLlmConfig(cwd);
  const planningDir = path.join(cwd, '.planning');
  const testRunner = detectTestRunner(command);

  // Truncate to last 2000 chars — test failures are usually at the end
  const tail = toolOutput.length > 2000 ? toolOutput.slice(-2000) : toolOutput;

  try {
    const llmResult = await triageTestOutput(llmConfig, planningDir, tail, testRunner, data.session_id);
    if (llmResult && llmResult.category && llmResult.category !== 'unknown') {
      logHook('post-bash-triage', 'PostToolUse', 'triage', {
        category: llmResult.category,
        file_hint: llmResult.file_hint,
        runner: testRunner
      });

      let msg = `[pbr] Test failure triage: ${llmResult.category}`;
      if (llmResult.file_hint) {
        msg += ` (likely: ${llmResult.file_hint})`;
      }
      msg += ` (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)`;

      return { output: { additionalContext: msg } };
    }
  } catch (_llmErr) {
    // Never propagate LLM errors
  }

  return null;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
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

module.exports = { checkTestTriage, detectTestRunner };
if (require.main === module || process.argv[1] === __filename) { main(); }

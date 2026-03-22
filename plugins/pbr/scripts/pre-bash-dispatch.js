#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Bash hooks.
 *
 * Consolidates check-dangerous-commands.js and validate-commit.js
 * into a single process, reading stdin once and routing to both
 * checks sequentially. This halves the process spawns per Bash call.
 *
 * -- Dispatch Order & Rationale --
 *
 *   1. check-dangerous-commands -- Blocks destructive shell operations
 *      (rm -rf, git push --force, etc.). Runs first because safety
 *      takes priority: if a command is dangerous, we must reject it
 *      before even considering whether its commit message is valid.
 *      Can block (exit 2).
 *
 *   2. validate-commit          -- Enforces conventional commit format
 *      ({type}({scope}): {desc}) on git commit commands. Runs second
 *      because commit format validation is only relevant for git
 *      commit operations, a narrow subset of all Bash calls. There's
 *      no benefit to checking format if the command was already
 *      blocked as dangerous. Can block (exit 2).
 *
 * -- Short-Circuit Behavior --
 *
 *   If an earlier check returns a result (blocking with exit 2),
 *   later checks are skipped entirely. The first failure is the
 *   most relevant -- a dangerous command should be blocked regardless
 *   of whether it also has a valid commit message.
 *
 * -- Adding New Checks --
 *
 *   1. Create a new check module exporting a function that takes
 *      the parsed hook data and returns null (pass) or
 *      { output: {...}, exitCode: N }.
 *   2. require() it at the top of this file.
 *   3. Add the call in sequence below, following the pattern:
 *        const result = checkFoo(data);
 *        if (result) { log; write output; exit with code; }
 *   4. Position the check based on severity: safety-critical checks
 *      should run earlier; format/style checks should run later.
 *
 * Exit codes:
 *   0 = allowed or warning only
 *   2 = blocked (dangerous command or invalid commit format)
 */

const { logHook } = require('./hook-logger');
const { checkDangerous } = require('./check-dangerous-commands');
const { checkCommit, enrichCommitLlm } = require('./validate-commit');
const { checkUnmanagedCommit } = require('./enforce-pbr-workflow');
const { checkRequirePaths, checkMirrorSync, checkLintErrors } = require('./lib/pre-commit-checks');
// Cross-plugin sync disabled -- derivative plugins updated separately
// const { checkCrossPluginSync } = require('./check-cross-plugin-sync');

/**
 * Core dispatch logic extracted for both stdin (main) and HTTP (handleHttp) paths.
 *
 * Runs all checks sequentially. Block decisions short-circuit immediately.
 * Warnings are collected and merged into a single advisory response.
 *
 * @param {Object} data - Parsed hook input (same as stdin JSON)
 * @returns {Promise<Object|null>} Hook response: { decision: 'block', reason } or { decision: 'allow', additionalContext? } or null
 */
async function processEvent(data) {
  try {
    // Dangerous commands check first -- can block
    const dangerousResult = checkDangerous(data);
    if (dangerousResult) {
      logHook('pre-bash-dispatch', 'PreToolUse', 'dispatched', { handler: 'check-dangerous-commands' });
      if (dangerousResult.exitCode === 2) {
        return { decision: 'block', reason: dangerousResult.output.reason || dangerousResult.output.additionalContext || 'Dangerous command blocked' };
      }
    }

    // Commit validation check -- can block
    const commitResult = checkCommit(data);
    if (commitResult) {
      logHook('pre-bash-dispatch', 'PreToolUse', 'dispatched', { handler: 'validate-commit' });
      if (commitResult.exitCode === 2) {
        return { decision: 'block', reason: commitResult.output.reason || commitResult.output.additionalContext || 'Invalid commit format' };
      }
      // exitCode 0 with output = warning
      if (commitResult.output && commitResult.output.additionalContext) {
        // Collect as warning below
      }
    }

    // Soft warnings for risky-but-allowed commands
    const command = data.tool_input?.command || '';
    const warnings = [];

    // Carry forward commit warning if it was advisory (exitCode 0)
    if (commitResult && commitResult.exitCode === 0 && commitResult.output && commitResult.output.additionalContext) {
      warnings.push(commitResult.output.additionalContext);
    }

    if (command) {
      // Warn about npm publish / deploy commands
      if (/\bnpm\s+publish\b/.test(command)) {
        warnings.push('npm publish detected -- ensure version is correct before publishing');
      }

      // Warn about touching production config files
      if (/\b(production|prod)\b.*\.(json|ya?ml|env|conf|cfg)\b/i.test(command) ||
          /\.(json|ya?ml|env|conf|cfg)\b.*\b(production|prod)\b/i.test(command)) {
        warnings.push('command references production config files -- verify you are not in a live environment');
      }

      // Warn about database operations
      if (/\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)\b/i.test(command)) {
        warnings.push('destructive database operation (DROP/TRUNCATE/DELETE/ALTER) -- verify correct database is targeted and a backup exists');
      }
    }

    // Pre-commit quality checks -- advisory only, on git commit commands
    if (/\bgit\s+commit\b/.test(command)) {
      const pathResult = checkRequirePaths(data);
      if (pathResult) warnings.push(...pathResult.warnings);

      const mirrorResult = checkMirrorSync(data);
      if (mirrorResult) warnings.push(...mirrorResult.warnings);

      const lintResult = checkLintErrors(data);
      if (lintResult) warnings.push(...lintResult.warnings);
    }

    // Unmanaged commit advisory -- warn when git commit runs without PBR skill
    const unmanagedCommitResult = checkUnmanagedCommit(data);
    if (unmanagedCommitResult) {
      warnings.push(unmanagedCommitResult.output.additionalContext);
    }

    // Cross-plugin sync advisory -- disabled (derivative plugins updated separately)
    // const syncResult = checkCrossPluginSync(data);
    // if (syncResult) {
    //   warnings.push(syncResult.additionalContext);
    // }

    // LLM commit semantic classification -- advisory only
    const llmAdvisory = await enrichCommitLlm(data);
    if (llmAdvisory) {
      warnings.push(llmAdvisory);
    }

    if (warnings.length > 0) {
      logHook('pre-bash-dispatch', 'PreToolUse', 'warn', { warnings: warnings.length, cmd: command.substring(0, 80) });
      return {
        decision: 'allow',
        additionalContext: `[pbr] Advisory: ${warnings.join('; ')}.`
      };
    }

    // Log pass-through so hook activity is visible in logs AND session JSONL
    logHook('pre-bash-dispatch', 'PreToolUse', 'allow', { cmd: command.substring(0, 80) });
    return { decision: 'allow' };
  } catch (e) {
    logHook('pre-bash-dispatch', 'PreToolUse', 'error', { error: e.message });
    return null;
  }
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
    return await processEvent(data);
  } catch (_e) {
    logHook('pre-bash-dispatch', 'PreToolUse', 'error', { error: _e.message });
    return null;
  }
}

module.exports = { handleHttp, processEvent };

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);

      const result = await processEvent(data);

      if (result && result.decision === 'block') {
        process.stdout.write(JSON.stringify(result));
        process.exit(2);
      }

      if (result) {
        process.stdout.write(JSON.stringify(result));
      } else {
        // processEvent returned null (error) -- allow through
        process.stdout.write(JSON.stringify({ decision: 'allow' }));
      }
      process.exit(0);
    } catch (e) {
      // Don't block on errors -- but emit valid output so Claude Code
      // doesn't report "hook error" for silent exit
      process.stderr.write(`[pbr] pre-bash-dispatch error: ${e.message}\n`);
      process.stdout.write(JSON.stringify({ decision: 'allow', additionalContext: '\u26a0 [PBR] pre-bash-dispatch failed: ' + e.message }));
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }

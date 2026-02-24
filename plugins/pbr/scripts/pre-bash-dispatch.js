#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Bash hooks.
 *
 * Consolidates check-dangerous-commands.js and validate-commit.js
 * into a single process, reading stdin once and routing to both
 * checks sequentially. This halves the process spawns per Bash call.
 *
 * ── Dispatch Order & Rationale ──────────────────────────────────
 *
 *   1. check-dangerous-commands — Blocks destructive shell operations
 *      (rm -rf, git push --force, etc.). Runs first because safety
 *      takes priority: if a command is dangerous, we must reject it
 *      before even considering whether its commit message is valid.
 *      Can block (exit 2).
 *
 *   2. validate-commit          — Enforces conventional commit format
 *      ({type}({scope}): {desc}) on git commit commands. Runs second
 *      because commit format validation is only relevant for git
 *      commit operations, a narrow subset of all Bash calls. There's
 *      no benefit to checking format if the command was already
 *      blocked as dangerous. Can block (exit 2).
 *
 * ── Short-Circuit Behavior ──────────────────────────────────────
 *
 *   If an earlier check returns a result (blocking with exit 2),
 *   later checks are skipped entirely. The first failure is the
 *   most relevant — a dangerous command should be blocked regardless
 *   of whether it also has a valid commit message.
 *
 * ── Adding New Checks ───────────────────────────────────────────
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

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);

      // Dangerous commands check first — can block
      const dangerousResult = checkDangerous(data);
      if (dangerousResult) {
        logHook('pre-bash-dispatch', 'PreToolUse', 'dispatched', { handler: 'check-dangerous-commands' });
        process.stdout.write(JSON.stringify(dangerousResult.output));
        process.exit(dangerousResult.exitCode);
      }

      // Commit validation check — can block
      const commitResult = checkCommit(data);
      if (commitResult) {
        logHook('pre-bash-dispatch', 'PreToolUse', 'dispatched', { handler: 'validate-commit' });
        process.stdout.write(JSON.stringify(commitResult.output));
        process.exit(commitResult.exitCode);
      }

      // Soft warnings for risky-but-allowed commands
      const command = data.tool_input?.command || '';
      const warnings = [];

      if (command) {
        // Warn about npm publish / deploy commands
        if (/\bnpm\s+publish\b/.test(command)) {
          warnings.push('npm publish detected — ensure version is correct before publishing');
        }

        // Warn about touching production config files
        if (/\b(production|prod)\b.*\.(json|ya?ml|env|conf|cfg)\b/i.test(command) ||
            /\.(json|ya?ml|env|conf|cfg)\b.*\b(production|prod)\b/i.test(command)) {
          warnings.push('command references production config files — verify you are not in a live environment');
        }

        // Warn about database operations
        if (/\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)\b/i.test(command)) {
          warnings.push('destructive database operation (DROP/TRUNCATE/DELETE/ALTER) — verify correct database is targeted and a backup exists');
        }
      }

      // Unmanaged commit advisory — warn when git commit runs without PBR skill
      const unmanagedCommitResult = checkUnmanagedCommit(data);
      if (unmanagedCommitResult) {
        warnings.push(unmanagedCommitResult.output.additionalContext);
      }

      // LLM commit semantic classification — advisory only
      const llmAdvisory = await enrichCommitLlm(data);
      if (llmAdvisory) {
        warnings.push(llmAdvisory);
      }

      if (warnings.length > 0) {
        process.stdout.write(JSON.stringify({
          decision: 'allow',
          additionalContext: `[pbr] Advisory: ${warnings.join('; ')}.`
        }));
        process.exit(0);
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on errors
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }

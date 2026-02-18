#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Bash hooks.
 *
 * Consolidates check-dangerous-commands.js and validate-commit.js
 * into a single process, reading stdin once and routing to both
 * checks sequentially. This halves the process spawns per Bash call.
 *
 * Check order:
 *   1. Dangerous commands check (can block destructive operations)
 *   2. Commit validation (can block badly-formatted commits)
 *
 * Exit codes:
 *   0 = allowed or warning only
 *   2 = blocked (dangerous command or invalid commit format)
 */

const { logHook } = require('./hook-logger');
const { checkDangerous } = require('./check-dangerous-commands');
const { checkCommit } = require('./validate-commit');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
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

      process.exit(0);
    } catch (_e) {
      // Don't block on errors
      process.exit(0);
    }
  });
}

if (require.main === module) { main(); }

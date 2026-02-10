#!/usr/bin/env node

/**
 * PreToolUse hook: Blocks dangerous Bash commands that could destroy
 * planning state or repository integrity.
 *
 * Patterns blocked (exit 2):
 *   - rm -rf .planning (or any rm that targets .planning/)
 *   - git reset --hard
 *   - git push --force / -f to main/master
 *   - git clean -fd / -fxd (removes untracked files including .planning/)
 *
 * Patterns warned (exit 0, additionalContext):
 *   - Large rm operations (rm -rf on project directories)
 *   - git checkout -- . (discards all unstaged changes)
 *
 * Exit codes:
 *   0 = not a dangerous command, or a warning-only match
 *   2 = blocked (destructive command detected)
 */

const { logHook } = require('./hook-logger');

// Commands that are outright blocked
const BLOCK_PATTERNS = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+.*\.planning\b/,
    reason: 'rm -rf targeting .planning/ directory — this would destroy all project state.'
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+.*\.planning[/\\]/,
    reason: 'rm -rf targeting files inside .planning/ — this would destroy project state.'
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    reason: 'git reset --hard discards all uncommitted changes. Use git stash or git checkout for specific files instead.'
  },
  {
    pattern: /\bgit\s+push\s+.*(-f|--force)\b.*\b(main|master)\b/,
    reason: 'Force-pushing to main/master can destroy shared history. This is almost never what you want.'
  },
  {
    pattern: /\bgit\s+push\s+.*\b(main|master)\b.*(-f|--force)\b/,
    reason: 'Force-pushing to main/master can destroy shared history. This is almost never what you want.'
  },
  {
    pattern: /\bgit\s+clean\s+(-[a-zA-Z]*f[a-zA-Z]*d|-[a-zA-Z]*d[a-zA-Z]*f)\b/,
    reason: 'git clean -fd removes untracked files including .planning/ contents. Use specific file paths instead.'
  }
];

// Commands that produce warnings but are not blocked
const WARN_PATTERNS = [
  {
    pattern: /\bgit\s+checkout\s+--\s+\.\s*$/,
    message: 'git checkout -- . discards ALL unstaged changes. Consider targeting specific files.'
  },
  {
    pattern: /\bgit\s+push\s+.*(-f|--force)\b/,
    message: 'Force-pushing can overwrite remote history. Ensure this is intentional.'
  }
];

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const command = data.tool_input?.command || '';

      // Skip empty commands
      if (!command.trim()) {
        process.exit(0);
      }

      // Check block patterns
      for (const { pattern, reason } of BLOCK_PATTERNS) {
        if (pattern.test(command)) {
          logHook('check-dangerous-commands', 'PreToolUse', 'block', {
            command: command.substring(0, 200),
            reason
          });
          const output = {
            decision: 'block',
            reason: `Dangerous command blocked.\n\n${reason}\n\nCommand: ${command.substring(0, 150)}`
          };
          process.stdout.write(JSON.stringify(output));
          process.exit(2);
        }
      }

      // Check warn patterns
      for (const { pattern, message } of WARN_PATTERNS) {
        if (pattern.test(command)) {
          logHook('check-dangerous-commands', 'PreToolUse', 'warn', {
            command: command.substring(0, 200),
            warning: message
          });
          const output = {
            additionalContext: `Warning: ${message}`
          };
          process.stdout.write(JSON.stringify(output));
          process.exit(0);
        }
      }

      // No match — allow
      process.exit(0);
    } catch (_e) {
      // Parse error — don't block
      process.exit(0);
    }
  });
}

module.exports = { BLOCK_PATTERNS, WARN_PATTERNS };
if (require.main === module) { main(); }

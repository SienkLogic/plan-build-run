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

const fs = require('fs');
const path = require('path');
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

/**
 * Check a parsed hook data object for dangerous commands.
 * Returns { output, exitCode } if the command should be blocked/warned, or null if allowed.
 * Used by pre-bash-dispatch.js for consolidated hook execution.
 */
function checkDangerous(data) {
  const command = data.tool_input?.command || '';

  // Skip empty commands
  if (!command.trim()) {
    return null;
  }

  // Check block patterns
  for (const { pattern, reason } of BLOCK_PATTERNS) {
    if (pattern.test(command)) {
      logHook('check-dangerous-commands', 'PreToolUse', 'block', {
        command: command.substring(0, 200),
        reason
      });
      return {
        output: {
          decision: 'block',
          reason: `Dangerous command blocked.\n\n${reason}\n\nCommand: ${command.substring(0, 150)}`
        },
        exitCode: 2
      };
    }
  }

  // Check warn patterns
  for (const { pattern, message } of WARN_PATTERNS) {
    if (pattern.test(command)) {
      logHook('check-dangerous-commands', 'PreToolUse', 'warn', {
        command: command.substring(0, 200),
        warning: message
      });
      return {
        output: {
          additionalContext: `Warning: ${message}`
        },
        exitCode: 0
      };
    }
  }

  // Skill-specific checks
  const skillResult = checkSkillSpecificBash(command);
  if (skillResult) return skillResult;

  // No match — allow
  return null;
}

/**
 * Skill-specific bash command checks.
 * Currently: statusline skill cannot use sed/awk/perl on JSON files.
 */
function checkSkillSpecificBash(command) {
  const planningDir = path.join(process.cwd(), '.planning');
  const skillFile = path.join(planningDir, '.active-skill');

  let activeSkill = null;
  try {
    activeSkill = fs.readFileSync(skillFile, 'utf8').trim();
  } catch (_e) {
    return null;
  }

  if (activeSkill !== 'statusline') return null;

  // Block sed/awk/perl targeting .json files
  const jsonManipPattern = /\b(sed|awk|perl)\b.*\.json/;
  const echoRedirectPattern = /echo\s.*>\s*.*\.json/;

  if (jsonManipPattern.test(command) || echoRedirectPattern.test(command)) {
    logHook('check-dangerous-commands', 'PreToolUse', 'block', {
      command: command.substring(0, 200),
      reason: 'JSON shell manipulation during statusline'
    });
    return {
      output: {
        decision: 'block',
        reason: 'CRITICAL: Use Read + Write tools for JSON files, not shell text manipulation. Shell tools can corrupt JSON structure.'
      },
      exitCode: 2
    };
  }

  return null;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const result = checkDangerous(data);
      if (result) {
        process.stdout.write(JSON.stringify(result.output));
        process.exit(result.exitCode);
      }
      process.exit(0);
    } catch (_e) {
      // Parse error — don't block
      process.exit(0);
    }
  });
}

module.exports = { BLOCK_PATTERNS, WARN_PATTERNS, checkDangerous };
if (require.main === module || process.argv[1] === __filename) { main(); }

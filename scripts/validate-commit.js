#!/usr/bin/env node

/**
 * PreToolUse hook: Validates git commit message format.
 *
 * Expected format: {type}({phase}-{plan}): {description}
 * Valid types: feat, fix, refactor, test, docs, chore
 *
 * Also accepts:
 * - Merge commits (starts with "Merge")
 * - Quick task commits: {type}(quick-{NNN}): {description}
 * - Planning doc commits: docs(planning): {description}
 * - WIP commits: wip: {description} or wip({area}): {description}
 *
 * Exit codes:
 *   0 = not a commit command or valid format
 *   2 = invalid commit message format (blocks the tool)
 */

const VALID_TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'wip'];

// Pattern: type(scope): description
// Scope can be: NN-MM (phase-plan), quick-NNN, planning, or any word
const COMMIT_PATTERN = /^(feat|fix|refactor|test|docs|chore|wip)(\([a-zA-Z0-9._-]+\))?:\s+.+/;

// Merge commits are always allowed
const MERGE_PATTERN = /^Merge\s/;

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const command = data.tool_input?.command || '';

      // Only validate git commit commands
      if (!isGitCommit(command)) {
        process.exit(0);
      }

      // Extract the commit message
      const message = extractCommitMessage(command);
      if (!message) {
        // Could not parse message - let it through (might be --amend or other form)
        process.exit(0);
      }

      // Validate format
      if (MERGE_PATTERN.test(message)) {
        process.exit(0);
      }

      if (!COMMIT_PATTERN.test(message)) {
        const output = {
          decision: 'block',
          reason: `Invalid commit message format.\n\nExpected: {type}({scope}): {description}\nTypes: ${VALID_TYPES.join(', ')}\nExamples:\n  feat(03-01): add user authentication\n  fix(02-02): resolve database connection timeout\n  docs(planning): update roadmap with phase 4\n  wip: save progress on auth middleware\n\nGot: "${message}"`
        };
        process.stdout.write(JSON.stringify(output));
        process.exit(2);
      }

      // Valid format
      process.exit(0);
    } catch (e) {
      // Parse error - don't block
      process.exit(0);
    }
  });
}

function isGitCommit(command) {
  // Match: git commit ... (but not git commit --amend with no message change)
  const trimmed = command.trim();
  return /^git\s+commit\b/.test(trimmed) && !trimmed.includes('--amend --no-edit');
}

function extractCommitMessage(command) {
  // Try -m "message" or -m 'message'
  const mFlagMatch = command.match(/-m\s+["']([^"']+)["']/);
  if (mFlagMatch) return mFlagMatch[1];

  // Try -m "message" with escaped quotes
  const mFlagMatch2 = command.match(/-m\s+"([^"]+)"/);
  if (mFlagMatch2) return mFlagMatch2[1];

  // Try heredoc: -m "$(cat <<'EOF'\n...\nEOF\n)"
  const heredocMatch = command.match(/<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) {
    // First line of heredoc is the commit message
    return heredocMatch[1].trim().split('\n')[0].trim();
  }

  return null;
}

main();

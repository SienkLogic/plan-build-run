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

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { resolveConfig } = require('./local-llm/health');
const { classifyCommit } = require('./local-llm/operations/classify-commit');

const VALID_TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'wip'];

const SENSITIVE_PATTERNS = [
  /^\.env$/,                          // .env exactly (not .env.example)
  /\.env\.[^.]+$/,                    // .env.production, .env.local etc (but not .env.example)
  /\.key$/i,
  /\.pem$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /credential/i,
  /secret/i,
];

const SAFE_PATTERNS = [
  /\.example$/i,
  /\.template$/i,
  /\.sample$/i,
  /^tests?[\\/]/i,
];

// Pattern: type(scope): description
// Scope can be: NN-MM (phase-plan), quick-NNN, planning, or any word
const COMMIT_PATTERN = /^(feat|fix|refactor|test|docs|chore|wip)(\([a-zA-Z0-9._-]+\))?:\s+.+/;

// Merge commits are always allowed
const MERGE_PATTERN = /^Merge\s/;

// AI co-author patterns to block
const AI_COAUTHOR_PATTERN = /Co-Authored-By:.*(?:Claude|Anthropic|noreply@anthropic\.com|OpenAI|Copilot|GPT|AI Assistant)/i;

function checkAiCoAuthorResult(command) {
  if (AI_COAUTHOR_PATTERN.test(command)) {
    logHook('validate-commit', 'PreToolUse', 'block-coauthor', { command: command.substring(0, 200) });
    return {
      output: {
        decision: 'block',
        reason: 'Commit blocked: contains AI co-author attribution.\n\nPlan-Build-Run commits must not include Co-Authored-By lines referencing AI tools (Claude, Copilot, GPT, etc.).\n\nRemove the Co-Authored-By line and try again.'
      },
      exitCode: 2
    };
  }
  return null;
}

function checkSensitiveFilesResult() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    const files = output.trim().split('\n').filter(Boolean);

    const matched = files.filter((file) => {
      // Skip files matching safe patterns
      if (SAFE_PATTERNS.some((pattern) => pattern.test(file))) return false;
      // Check against sensitive patterns (test basename and full path)
      const basename = path.basename(file);
      return SENSITIVE_PATTERNS.some((pattern) => pattern.test(basename) || pattern.test(file));
    });

    if (matched.length > 0) {
      logHook('validate-commit', 'PreToolUse', 'block-sensitive', { files: matched });
      return {
        output: {
          decision: 'block',
          reason: `Commit blocked: staged files may contain sensitive data.\n\nFiles: ${matched.join(', ')}\n\nRemove these files from staging with:\n  git reset HEAD ${matched.join(' ')}\n\nIf these files are intentionally safe (e.g., test fixtures), rename them to include .example, .template, or .sample.`
        },
        exitCode: 2
      };
    }
  } catch (_e) {
    // Not in a git repo or git not available - silently continue
  }
  return null;
}

/**
 * Check a parsed hook data object for commit validation issues.
 * Returns { output, exitCode } if the command should be blocked, or null if allowed.
 * Used by pre-bash-dispatch.js for consolidated hook execution.
 */
function checkCommit(data) {
  const command = data.tool_input?.command || '';

  // Only validate git commit commands
  if (!isGitCommit(command)) {
    return null;
  }

  // Extract the commit message
  const message = extractCommitMessage(command);
  if (!message) {
    // Could not parse message - let it through (might be --amend or other form)
    logHook('validate-commit', 'PreToolUse', 'allow', { reason: 'unparseable message' });
    return null;
  }

  // Validate format
  if (MERGE_PATTERN.test(message)) {
    logHook('validate-commit', 'PreToolUse', 'allow', { message, reason: 'merge commit' });
    return null;
  }

  if (!COMMIT_PATTERN.test(message)) {
    logHook('validate-commit', 'PreToolUse', 'block', { message });
    logEvent('workflow', 'commit-validated', { message: message.substring(0, 80), status: 'block' });
    return {
      output: {
        decision: 'block',
        reason: `Invalid commit message format.\n\nExpected: {type}({scope}): {description}\nTypes: ${VALID_TYPES.join(', ')}\nExamples:\n  feat(03-01): add user authentication\n  fix(02-02): resolve database connection timeout\n  docs(planning): update roadmap with phase 4\n  wip: save progress on auth middleware\n\nGot: "${message}"`
      },
      exitCode: 2
    };
  }

  // Valid format
  logHook('validate-commit', 'PreToolUse', 'allow', { message });
  logEvent('workflow', 'commit-validated', { message: message.substring(0, 80), status: 'allow' });

  // Check AI co-author
  const coAuthorResult = checkAiCoAuthorResult(command);
  if (coAuthorResult) return coAuthorResult;

  // Check sensitive files
  const sensitiveResult = checkSensitiveFilesResult();
  if (sensitiveResult) return sensitiveResult;

  return null;
}

/**
 * Load and resolve the local_llm config block from .planning/config.json.
 * Returns a resolved config (always safe to use — disabled by default on error).
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
 * Async LLM enrichment for commit messages. Returns an advisory string or null.
 * Called after checkCommit passes (valid format) to provide semantic classification.
 *
 * @param {object} data - parsed hook data
 * @returns {Promise<string|null>}
 */
async function enrichCommitLlm(data) {
  try {
    const command = data.tool_input?.command || '';
    const message = extractCommitMessage(command);
    if (!message) return null;

    const cwd = process.cwd();
    const llmConfig = loadLocalLlmConfig(cwd);
    const planningDir = path.join(cwd, '.planning');

    // Get staged files for scope validation
    let stagedFiles = [];
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
      stagedFiles = output.trim().split('\n').filter(Boolean);
    } catch (_e) {
      // Not in a git repo — skip staged files context
    }

    const llmResult = await classifyCommit(llmConfig, planningDir, message, stagedFiles, data.session_id);
    if (llmResult && llmResult.classification !== 'correct') {
      return 'LLM commit advisory: ' + llmResult.classification +
        ' (confidence: ' + (llmResult.confidence * 100).toFixed(0) + '%)';
    }
    return null;
  } catch (_llmErr) {
    // Never propagate LLM errors
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
      const result = checkCommit(data);
      if (result) {
        process.stdout.write(JSON.stringify(result.output));
        process.exit(result.exitCode);
      }

      // LLM semantic classification — advisory only (after format validation passes)
      const llmAdvisory = await enrichCommitLlm(data);
      if (llmAdvisory) {
        process.stdout.write(JSON.stringify({
          additionalContext: '[pbr] ' + llmAdvisory
        }));
      }

      process.exit(0);
    } catch (_e) {
      // Parse error - don't block
      process.exit(0);
    }
  });
}

function isGitCommit(command) {
  // Match: git commit anywhere in the command string
  // Handles chained commands like "cd /dir && git commit ..." or "git add . && git commit ..."
  const trimmed = command.trim();
  return /\bgit\s+commit\b/.test(trimmed) && !trimmed.includes('--amend --no-edit');
}

function extractCommitMessage(command) {
  // Try heredoc first: -m "$(cat <<'EOF'\n...\nEOF\n)" or -m "$(cat <<EOF\n...\nEOF\n)"
  // Must check before generic -m patterns to avoid capturing heredoc syntax as the message
  const heredocMatch = command.match(/<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) {
    // First line of heredoc is the commit message
    return heredocMatch[1].trim().split('\n')[0].trim();
  }

  // Try -m "message" or -m 'message'
  const mFlagMatch = command.match(/-m\s+["']([^"']+)["']/);
  if (mFlagMatch) return mFlagMatch[1];

  // Try -m "message" with escaped quotes
  const mFlagMatch2 = command.match(/-m\s+"([^"]+)"/);
  if (mFlagMatch2) return mFlagMatch2[1];

  return null;
}

module.exports = { checkCommit, enrichCommitLlm };
if (require.main === module || process.argv[1] === __filename) { main(); }

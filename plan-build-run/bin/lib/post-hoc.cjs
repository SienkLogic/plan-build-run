/**
 * lib/post-hoc.cjs — Post-hoc SUMMARY.md generation from git history.
 *
 * Generates SUMMARY.md artifacts by analyzing git log and diff output
 * after task execution, enabling zero-friction quick task workflows.
 *
 * Exports: generateSummary, parseGitLog, buildCommitGrep
 */

const fs = require('fs');
const path = require('path');
const { execGit, currentTimestamp } = require('./core.cjs');

/**
 * Parse git log --oneline output into structured commit data.
 *
 * @param {string} logOutput - Raw output from git log --oneline
 * @returns {Array<{hash: string, type: string, scope: string, message: string}>}
 */
function parseGitLog(logOutput) {
  if (!logOutput) return [];

  const lines = logOutput.trim().split('\n').filter(Boolean);
  const conventionalRe = /^(\S+)\s+(\w+)\(([^)]*)\):\s*(.+)$/;

  return lines.map(line => {
    const match = line.match(conventionalRe);
    if (match) {
      return { hash: match[1], type: match[2], scope: match[3], message: match[4] };
    }
    // Non-conventional: extract hash and rest as message
    const parts = line.match(/^(\S+)\s+(.+)$/);
    if (parts) {
      return { hash: parts[1], type: 'unknown', scope: '', message: parts[2] };
    }
    return { hash: '', type: 'unknown', scope: '', message: line };
  });
}

/**
 * Build a grep pattern for matching commits by task ID.
 *
 * @param {string} taskId - Task identifier (e.g., 'quick-001', '03-01')
 * @returns {string} Grep pattern string
 */
function buildCommitGrep(taskId) {
  return taskId;
}

/**
 * Generate a SUMMARY.md from git history for a completed task.
 *
 * @param {string} planningDir - Path to the .planning directory (or project root for git)
 * @param {string} taskDir - Directory to write SUMMARY.md into
 * @param {object} [options={}] - Generation options
 * @param {string} [options.commitPattern] - Grep pattern to match commits (default: 'quick-\\d+')
 * @param {string} [options.since] - ISO timestamp to limit git log range
 * @param {string} [options.description] - Task description for the summary body
 * @returns {{status: string, path: string, commitCount: number, keyFiles: string[]}}
 */
function generateSummary(planningDir, taskDir, options = {}) {
  const summaryPath = path.join(taskDir, 'SUMMARY.md');
  const grepPattern = options.commitPattern
    ? buildCommitGrep(options.commitPattern)
    : 'quick-\\d+';
  const gitCwd = planningDir;

  let commits = [];
  let keyFiles = [];

  try {
    // Get matching commits
    const logArgs = ['log', '--oneline', '--grep=' + grepPattern];
    if (options.since) {
      logArgs.push('--since=' + options.since);
    }
    const logOutput = execGit(gitCwd, logArgs);
    commits = parseGitLog(logOutput);

    // Get changed files if commits exist
    if (commits.length > 0) {
      try {
        const diffOutput = execGit(gitCwd, ['diff', '--name-only', 'HEAD~' + commits.length + '..HEAD']);
        keyFiles = diffOutput.trim().split('\n').filter(Boolean);
      } catch (_e) {
        // diff may fail for single-commit repos; fall back to show
        try {
          const showOutput = execGit(gitCwd, ['show', '--name-only', '--format=', commits[0].hash]);
          keyFiles = showOutput.trim().split('\n').filter(Boolean);
        } catch (_e2) {
          // ignore
        }
      }
    }
  } catch (_e) {
    // git commands failed entirely (empty repo, bad revision, etc.)
  }

  const status = commits.length > 0 ? 'complete' : 'failed';
  const commitHashes = commits.map(c => c.hash);
  const timestamp = currentTimestamp();

  // Build SUMMARY.md content
  const frontmatter = [
    '---',
    'status: "' + status + '"',
    'requires: []',
    'key_files:',
    ...keyFiles.map(f => '  - "' + f + '"'),
    'deferred: []',
    'provides: []',
    'key_decisions: []',
    'patterns: []',
    'generated: "post-hoc"',
    'commits:',
    ...commitHashes.map(h => '  - "' + h + '"'),
    'timestamp: "' + timestamp + '"',
    '---',
  ].join('\n');

  const description = options.description || 'Task completed.';

  const changesSection = commits.length > 0
    ? commits.map(c => '- ' + c.type + '(' + c.scope + '): ' + c.message + ' (`' + c.hash + '`)').join('\n')
    : 'No commits found.';

  const filesSection = keyFiles.length > 0
    ? keyFiles.map(f => '- ' + f).join('\n')
    : 'No files changed.';

  const body = [
    '',
    '# Summary',
    '',
    description,
    '',
    '## Changes',
    '',
    changesSection,
    '',
    '## Files Modified',
    '',
    filesSection,
    '',
  ].join('\n');

  const content = frontmatter + body;

  // Ensure taskDir exists
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(summaryPath, content, 'utf-8');

  return { status, path: summaryPath, commitCount: commits.length, keyFiles };
}

module.exports = {
  generateSummary,
  parseGitLog,
  buildCommitGrep,
};

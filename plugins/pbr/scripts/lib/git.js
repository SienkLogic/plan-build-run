/**
 * lib/git.js — Git utility functions for Plan-Build-Run.
 *
 * Extracted from lib/core.js. Wraps child_process.execSync for git operations.
 * Provides: execGit, isGitIgnored.
 */

const { execSync } = require('child_process');

/**
 * Execute a git command and return the result.
 *
 * @param {string} gitCwd - Working directory for git
 * @param {string[]} args - Git command arguments
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function execGit(gitCwd, args) {
  try {
    const escaped = args.map(a => {
      if (/^[a-zA-Z0-9._\-/=:@]+$/.test(a)) return a;
      return "'" + a.replace(/'/g, "'\\''") + "'";
    });
    const stdout = execSync('git ' + escaped.join(' '), {
      cwd: gitCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    // intentionally silent: git command failures are normal control flow
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

/**
 * Check if a path is git-ignored.
 *
 * @param {string} gitCwd - Working directory
 * @param {string} targetPath - Path to check
 * @returns {boolean}
 */
function isGitIgnored(gitCwd, targetPath) {
  try {
    execSync('git check-ignore -q --no-index -- ' + targetPath.replace(/[^a-zA-Z0-9._\-/]/g, ''), {
      cwd: gitCwd,
      stdio: 'pipe',
    });
    return true;
  } catch {
    // intentionally silent: non-zero exit means not ignored
    return false;
  }
}

module.exports = {
  execGit,
  isGitIgnored,
};

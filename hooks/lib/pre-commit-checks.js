'use strict';

/**
 * Pre-commit quality gate checks.
 *
 * Three advisory check functions that inspect staged files for common issues.
 * Each returns null (no issues) or { warnings: string[] }.
 * These never throw — all errors are caught and logged.
 *
 * Usage:
 *   const { checkRequirePaths, checkMirrorSync, checkLintErrors } = require('./lib/pre-commit-checks');
 *   const result = checkRequirePaths(data);
 *   if (result) console.log(result.warnings);
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logHook } = require('../hook-logger');

/**
 * Get list of staged files from git.
 * @returns {string[]} Array of staged file paths (relative to repo root)
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (_e) {
    return [];
  }
}

/**
 * Check staged JS/CJS files under hooks/ and plan-build-run/bin/ for broken
 * relative require() paths.
 *
 * @param {object} _data - Hook input data (unused, kept for interface consistency)
 * @returns {null|{warnings: string[]}}
 */
function checkRequirePaths(_data) {
  try {
    const staged = getStagedFiles();
    const jsFiles = staged.filter(f => {
      const ext = path.extname(f);
      return (ext === '.js' || ext === '.cjs') &&
        (f.startsWith(path.join('hooks', '')) || f.startsWith('hooks/') ||
         f.startsWith(path.join('plan-build-run', 'bin', '')) || f.startsWith('plan-build-run/bin/'));
    });

    if (jsFiles.length === 0) return null;

    const warnings = [];

    for (const file of jsFiles) {
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch (_e) {
        continue; // File may not exist on disk yet (deleted in staging)
      }

      // Match require('...') calls with relative paths
      const requireRegex = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
      let match;
      while ((match = requireRegex.exec(content)) !== null) {
        const reqPath = match[1];

        // Skip dynamic expressions (template literals, concatenation)
        if (reqPath.includes('${') || reqPath.includes('+')) continue;

        const fileDir = path.dirname(file);
        const resolved = path.resolve(fileDir, reqPath);

        // Try the path as-is, then with common extensions
        const candidates = [
          resolved,
          resolved + '.js',
          resolved + '.cjs',
          path.join(resolved, 'index.js'),
          path.join(resolved, 'index.cjs')
        ];

        const exists = candidates.some(c => fs.existsSync(c));
        if (!exists) {
          warnings.push(`Broken require path in ${file}: require('${reqPath}') — resolved to ${resolved}`);
        }
      }
    }

    if (warnings.length === 0) return null;

    logHook('pre-commit-checks', 'PreToolUse', 'warn-require-paths', { count: warnings.length });
    return { warnings };
  } catch (e) {
    logHook('pre-commit-checks', 'PreToolUse', 'error', { fn: 'checkRequirePaths', error: e.message });
    return null;
  }
}

/**
 * Mirror pair definitions: source -> mirror.
 * When a file in source dir is staged, its counterpart in mirror dir should also be staged.
 */
const MIRROR_PAIRS = {
  // Root commands/ directory removed — no mirror pairs needed
};

/**
 * Check that mirrored files are staged together.
 * Detects drift when one side of a mirror pair is modified but the other is not.
 *
 * @param {object} _data - Hook input data (unused)
 * @returns {null|{warnings: string[]}}
 */
function checkMirrorSync(_data) {
  try {
    const staged = getStagedFiles();
    if (staged.length === 0) return null;

    const warnings = [];
    const stagedSet = new Set(staged);

    for (const [sourceDir, mirrorDir] of Object.entries(MIRROR_PAIRS)) {
      // Normalize to forward slashes for comparison
      const srcNorm = sourceDir.replace(/\\/g, '/');
      const mirNorm = mirrorDir.replace(/\\/g, '/');

      for (const file of staged) {
        const fileNorm = file.replace(/\\/g, '/');
        let counterpart = null;

        if (fileNorm.startsWith(srcNorm)) {
          const relative = fileNorm.slice(srcNorm.length);
          counterpart = mirNorm + relative;
        } else if (fileNorm.startsWith(mirNorm)) {
          const relative = fileNorm.slice(mirNorm.length);
          counterpart = srcNorm + relative;
        }

        if (!counterpart) continue;

        // Check if counterpart is also staged
        if (stagedSet.has(counterpart) || stagedSet.has(counterpart.replace(/\//g, path.sep))) {
          continue; // Both sides staged — OK
        }

        // Check if counterpart exists on disk and has different content
        const counterpartOnDisk = counterpart.replace(/\//g, path.sep);
        if (!fs.existsSync(file) || !fs.existsSync(counterpartOnDisk)) continue;

        try {
          const srcContent = fs.readFileSync(file, 'utf8');
          const mirContent = fs.readFileSync(counterpartOnDisk, 'utf8');
          if (srcContent !== mirContent) {
            warnings.push(`Mirror drift: ${file} was modified but ${counterpart} was not staged`);
          }
        } catch (_e) {
          // Can't read one of the files — skip
        }
      }
    }

    if (warnings.length === 0) return null;

    logHook('pre-commit-checks', 'PreToolUse', 'warn-mirror-sync', { count: warnings.length });
    return { warnings };
  } catch (e) {
    logHook('pre-commit-checks', 'PreToolUse', 'error', { fn: 'checkMirrorSync', error: e.message });
    return null;
  }
}

/**
 * Run eslint on staged JS/CJS files and report any errors.
 *
 * @param {object} _data - Hook input data (unused)
 * @returns {null|{warnings: string[]}}
 */
function checkLintErrors(_data) {
  try {
    const staged = getStagedFiles();
    const jsFiles = staged.filter(f => {
      const ext = path.extname(f);
      return ext === '.js' || ext === '.cjs';
    });

    if (jsFiles.length === 0) return null;

    try {
      const fileList = jsFiles.join(' ');
      execSync(`npx eslint --quiet ${fileList}`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      // eslint exited 0 — no errors
      return null;
    } catch (lintErr) {
      // eslint exited non-zero — lint errors found
      if (lintErr.code === 'ENOENT') {
        // eslint not available
        return null;
      }

      const output = (lintErr.stdout || '') + (lintErr.stderr || '');
      const errorCountMatch = output.match(/(\d+)\s+errors?/i);
      const errorCount = errorCountMatch ? errorCountMatch[1] : 'unknown';

      const warnings = [`Lint errors found in staged files (${errorCount} errors). Run 'npm run lint' for details.`];
      logHook('pre-commit-checks', 'PreToolUse', 'warn-lint', { errorCount, fileCount: jsFiles.length });
      return { warnings };
    }
  } catch (e) {
    logHook('pre-commit-checks', 'PreToolUse', 'error', { fn: 'checkLintErrors', error: e.message });
    return null;
  }
}

module.exports = { checkRequirePaths, checkMirrorSync, checkLintErrors };

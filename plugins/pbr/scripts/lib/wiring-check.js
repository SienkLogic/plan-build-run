'use strict';

// STATUS: Standalone utility — tested but not auto-wired into gates. Referenced by build SKILL.md for confidence gate logic.

/**
 * lib/wiring-check.js -- Verify that SUMMARY key_files are actually imported/used
 * by other files in the project. Used as a 4th confidence gate signal.
 *
 * Returns { imported: true/false, orphaned: string[] }
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter } = require('./core');

/**
 * File extensions and basenames to skip during wiring checks.
 * These file types are not expected to be imported by other code.
 */
const SKIP_EXTENSIONS = new Set([
  '.test.js', '.spec.js', '.test.ts', '.spec.ts',
  '.test.cjs', '.spec.cjs', '.test.mjs', '.spec.mjs',
  '.md', '.json', '.env', '.yaml', '.yml', '.toml', '.ini',
  '.css', '.scss', '.html', '.svg', '.png', '.jpg', '.gif'
]);

const SKIP_BASENAMES = new Set([
  'config.json', '.env', '.env.example', '.env.local',
  'package.json', 'tsconfig.json', 'jest.config.js', 'jest.config.cjs',
  'vite.config.js', 'vite.config.ts', '.eslintrc.json', '.prettierrc'
]);

/**
 * Check if a file path should be skipped for wiring verification.
 * @param {string} filePath
 * @returns {boolean}
 */
function shouldSkip(filePath) {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath);

  // Skip config files by basename
  if (SKIP_BASENAMES.has(basename)) return true;

  // Skip test files (check compound extensions like .test.js)
  for (const skipExt of SKIP_EXTENSIONS) {
    if (basename.endsWith(skipExt)) return true;
  }

  // Skip markdown and other non-code files by extension
  if (['.md', '.json', '.env', '.yaml', '.yml', '.toml', '.ini',
       '.css', '.scss', '.html', '.svg', '.png', '.jpg', '.gif'].includes(ext)) {
    return true;
  }

  return false;
}

/** Code file extensions to search for import/require references. */
const SEARCH_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.md']);

/**
 * Recursively collect files with matching extensions, skipping node_modules.
 * @param {string} dir
 * @param {string[]} results
 * @returns {string[]}
 */
function collectFiles(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath, results);
      } else if (SEARCH_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  } catch (_e) {
    // Permission errors or missing dirs — skip silently
  }
  return results;
}

/**
 * Check if a key file is imported/required by at least one other file in the project.
 * Uses pure Node.js file search for cross-platform compatibility (grep cwd issues on Windows).
 *
 * @param {string} keyFilePath - Path to the key file (relative to project root)
 * @param {string} projectRoot - Absolute path to project root
 * @returns {boolean} true if at least one import/require reference found
 */
function isFileImported(keyFilePath, projectRoot) {
  const basename = path.basename(keyFilePath);
  const nameNoExt = basename.replace(/\.[^.]+$/, '');

  // Build regex: match require('...name') or import ... from '...name'
  const pattern = new RegExp(`(require\\(|from\\s+).*${escapeRegex(nameNoExt)}`);

  // Resolve the key file's absolute path for self-exclusion
  const keyFileAbs = path.resolve(projectRoot, keyFilePath);

  // Collect candidate files and search
  const files = collectFiles(projectRoot);

  for (const filePath of files) {
    // Skip the key file itself
    if (path.resolve(filePath) === keyFileAbs) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (pattern.test(content)) {
        return true;
      }
    } catch (_e) {
      // Unreadable file — skip
    }
  }

  return false;
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check that all key_files from SUMMARY.md files are actually imported/used
 * by other files in the project.
 *
 * @param {string[]} summaryFiles - Array of absolute paths to SUMMARY.md files
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ imported: boolean, orphaned: string[] }}
 */
function checkKeyFilesImported(summaryFiles, projectRoot) {
  if (!summaryFiles || summaryFiles.length === 0) {
    return { imported: true, orphaned: [] };
  }

  const allKeyFiles = [];

  // Collect key_files from each SUMMARY.md frontmatter
  for (const summaryPath of summaryFiles) {
    try {
      const content = fs.readFileSync(summaryPath, 'utf8');
      const fm = parseYamlFrontmatter(content);

      if (fm.key_files && Array.isArray(fm.key_files)) {
        for (const entry of fm.key_files) {
          // key_files entries can be "path: description" or just "path"
          const filePath = typeof entry === 'string'
            ? entry.split(':')[0].trim().replace(/^["']|["']$/g, '')
            : entry;
          if (filePath) allKeyFiles.push(filePath);
        }
      }
    } catch (_e) {
      // Skip unreadable summary files
    }
  }

  if (allKeyFiles.length === 0) {
    return { imported: true, orphaned: [] };
  }

  const orphaned = [];

  for (const keyFile of allKeyFiles) {
    if (shouldSkip(keyFile)) continue;

    if (!isFileImported(keyFile, projectRoot)) {
      orphaned.push(keyFile);
    }
  }

  return {
    imported: orphaned.length === 0,
    orphaned
  };
}

module.exports = {
  checkKeyFilesImported,
  isFileImported,
  shouldSkip,
  // Exported for testing
  escapeRegex,
  SKIP_EXTENSIONS,
  SKIP_BASENAMES
};

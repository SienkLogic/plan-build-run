/**
 * lib/tech-debt-scanner.js — Lightweight tech debt scanner for Plan-Build-Run.
 *
 * Identifies large files and deeply nested code as complexity hotspots.
 * Sync fs operations only, no external dependencies.
 *
 * Exports: scanTechDebt(projectDir, options)
 */

const fs = require('fs');
const path = require('path');

/** Directories to always skip during scanning */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.planning', 'dist', 'build',
  '.next', 'coverage', '.cache', '.vscode', '.idea'
]);

/** File extensions to scan */
const SCAN_EXTENSIONS = new Set(['.js', '.ts', '.cjs', '.mjs']);

/**
 * Recursively walk a directory, collecting files that match scan criteria.
 *
 * @param {string} dir - Current directory to scan
 * @param {string} baseDir - Project root (for relative path calculation)
 * @param {number} depth - Current nesting depth
 * @param {Array} results - Accumulator for found files
 */
function walkDir(dir, baseDir, depth, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkDir(path.join(dir, entry.name), baseDir, depth + 1, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!SCAN_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      results.push({ fullPath, relPath, depth: depth + 1 });
    }
  }
}

/**
 * Count lines in a file (sync).
 *
 * @param {string} filePath - Absolute path to file
 * @returns {number} Line count
 */
function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch (_e) {
    return 0;
  }
}

/**
 * Scan a project directory for tech debt indicators.
 *
 * @param {string} projectDir - Path to the project root
 * @param {object} [options={}] - Configuration options
 * @param {number} [options.limit=5] - Max items per category
 * @param {number} [options.maxLines=300] - Line count threshold for large files
 * @param {number} [options.maxDepth=5] - Nesting depth threshold for hotspots
 * @returns {{ hotspots: Array, largeFiles: Array, total: number }}
 */
function scanTechDebt(projectDir, options = {}) {
  const { limit = 5, maxLines = 300, maxDepth = 5 } = options;

  const files = [];
  walkDir(projectDir, projectDir, 0, files);

  const largeFiles = [];
  const hotspots = [];

  for (const file of files) {
    // Check line count
    const lines = countLines(file.fullPath);
    if (lines > maxLines) {
      largeFiles.push({ path: file.relPath, lines });
    }

    // Check nesting depth
    if (file.depth > maxDepth) {
      hotspots.push({ path: file.relPath, depth: file.depth, reason: 'deep-nesting' });
    }
  }

  // Sort: largeFiles by lines desc, hotspots by depth desc
  largeFiles.sort((a, b) => b.lines - a.lines);
  hotspots.sort((a, b) => b.depth - a.depth);

  // Truncate to limit
  const trimmedLarge = largeFiles.slice(0, limit);
  const trimmedHotspots = hotspots.slice(0, limit);

  return {
    hotspots: trimmedHotspots,
    largeFiles: trimmedLarge,
    total: trimmedHotspots.length + trimmedLarge.length
  };
}

module.exports = { scanTechDebt };

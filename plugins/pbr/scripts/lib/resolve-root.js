#!/usr/bin/env node

/**
 * Shared utility: resolve the project root by walking up from a start directory
 * to find the nearest ancestor containing a .planning/ directory.
 *
 * Usage:
 *   const { resolveProjectRoot } = require('./lib/resolve-root');
 *   const root = resolveProjectRoot(); // walks up from cwd
 *
 * Caching: Result is cached per process. Use clearRootCache() in tests.
 * Fallback: Returns startDir (or cwd) when .planning/ is not found.
 * Cross-platform: Handles both Unix (/) and Windows (C:\) filesystem roots.
 */

const fs = require('fs');
const path = require('path');

/** Cached project root -- resolved once per process */
let _cachedRoot = null;

/**
 * Walk up from startDir looking for a directory containing .planning/.
 * @param {string} [startDir] - Directory to start searching from. Defaults to process.cwd().
 * @returns {string} The project root directory, or startDir as fallback.
 */
function resolveProjectRoot(startDir) {
  if (_cachedRoot !== null) return _cachedRoot;

  const start = startDir || process.cwd();
  let current = path.resolve(start);
  const { root } = path.parse(current);

  while (true) {
    const candidate = path.join(current, '.planning');
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        _cachedRoot = current;
        return _cachedRoot;
      }
    } catch (_e) {
      // Permission error or similar -- skip this level
    }

    // Reached filesystem root?
    if (current === root) break;

    const parent = path.dirname(current);
    // Safety: if dirname returns same path, we're at root
    if (parent === current) break;
    current = parent;
  }

  // Fallback: return the start directory
  _cachedRoot = start;
  return _cachedRoot;
}

/**
 * Clear the cached root. Used in tests to reset state between runs.
 */
function clearRootCache() {
  _cachedRoot = null;
}

module.exports = { resolveProjectRoot, clearRootCache };

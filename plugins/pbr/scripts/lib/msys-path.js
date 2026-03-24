'use strict';

/**
 * Normalizes MSYS/Git-Bash paths on Windows.
 * Converts /d/Repos/... to D:\Repos\... — no-op on non-MSYS paths
 * and on non-Windows platforms.
 *
 * @param {string|null|undefined} p - Path to normalize
 * @returns {string|null|undefined} Normalized path, or original value if not an MSYS path
 */
function normalizeMsysPath(p) {
  if (!p) return p;
  const match = p.match(/^\/([a-zA-Z])\/(.*)/);
  if (match) {
    return match[1].toUpperCase() + ':\\' + match[2].replace(/\//g, '\\');
  }
  return p;
}

module.exports = { normalizeMsysPath };

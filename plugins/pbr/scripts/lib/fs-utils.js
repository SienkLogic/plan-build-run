// lib/fs-utils.js — File and path utility functions for Plan-Build-Run tools.

const fs = require('fs');
const path = require('path');
const { normalizeMsysPath } = require('./msys-path');

// ─── Module-level planningDir with MSYS path bridging ─────────────────────────

let cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
cwd = normalizeMsysPath(cwd);

let planningDir = path.join(cwd, '.planning');

/**
 * Override the working directory for subagent use.
 * Updates both cwd and planningDir.
 *
 * @param {string} newCwd - New working directory path
 */
function setCwd(newCwd) {
  cwd = newCwd;
  cwd = normalizeMsysPath(cwd);
  planningDir = path.join(cwd, '.planning');
}

/**
 * Get the current working directory.
 * @returns {string}
 */
function getCwd() { return cwd; }

/**
 * Get the current planning directory path.
 * @returns {string}
 */
function getPlanningDir() { return planningDir; }

/** Normalize a path to always use forward slashes (cross-platform). */
function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

/**
 * Read a file safely, returning null on any error.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {string|null} File contents or null
 */
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    // intentionally silent: file may not exist
    return null;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param {string} dirPath - Directory path to ensure
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Find files in a directory matching a regex pattern.
 *
 * @param {string} dir - Directory to search
 * @param {RegExp} pattern - Pattern to match filenames against
 * @returns {string[]} Sorted array of matching filenames
 */
function findFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
  } catch (_) {
    // intentionally silent: directory may not exist
    return [];
  }
}

/**
 * Read the last N lines from a file.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {number} n - Number of trailing lines to return
 * @returns {string[]} Array of line strings
 */
function tailLines(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return [];
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    if (lines.length <= n) return lines;
    return lines.slice(lines.length - n);
  } catch (_e) {
    // intentionally silent: file may not exist
    return [];
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  setCwd,
  getCwd,
  getPlanningDir,
  toPosixPath,
  safeReadFile,
  ensureDir,
  findFiles,
  tailLines,
  escapeRegex,
};

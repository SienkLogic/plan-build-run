/**
 * lib/intel.cjs -- Intel storage and query operations for Plan-Build-Run.
 *
 * Provides a persistent, queryable intelligence system for project metadata.
 * Intel files live in .planning/intel/ and store structured data about
 * the project's files, APIs, dependencies, architecture, and tech stack.
 *
 * All public functions gate on intel.enabled config (no-op when false).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Constants ───────────────────────────────────────────────────────────────

const INTEL_DIR = '.planning/intel';

const INTEL_FILES = {
  files: 'files.json',
  apis: 'apis.json',
  deps: 'deps.json',
  arch: 'arch.md',
  stack: 'stack.json'
};

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Ensure the intel directory exists under the given planning dir.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {string} Full path to .planning/intel/
 */
function ensureIntelDir(planningDir) {
  const intelPath = path.join(planningDir, 'intel');
  if (!fs.existsSync(intelPath)) {
    fs.mkdirSync(intelPath, { recursive: true });
  }
  return intelPath;
}

/**
 * Check whether intel is enabled in the project config.
 * Loads config via config.cjs. Returns true by default (when no config or no intel key).
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean}
 */
function isIntelEnabled(planningDir) {
  try {
    const { configLoad } = require('./config.cjs');
    const config = configLoad(planningDir);
    if (!config) return true;
    if (config.intel && config.intel.enabled === false) return false;
    return true;
  } catch (_e) {
    return true;
  }
}

/**
 * Return the standard disabled response object.
 * @returns {{ disabled: true, message: string }}
 */
function disabledResponse() {
  return { disabled: true, message: 'Intel system disabled (intel.enabled=false)' };
}

/**
 * Resolve full path to an intel file.
 * @param {string} planningDir
 * @param {string} filename
 * @returns {string}
 */
function intelFilePath(planningDir, filename) {
  return path.join(planningDir, 'intel', filename);
}

/**
 * Safely read and parse a JSON intel file.
 * Returns null if file doesn't exist or can't be parsed.
 *
 * @param {string} filePath
 * @returns {object|null}
 */
function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * Compute SHA-256 hash of a file's contents.
 * Returns null if the file doesn't exist.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function hashFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (_e) {
    return null;
  }
}

/**
 * Search for a term (case-insensitive) in a JSON object's keys and string values.
 * Returns an array of matching entries.
 *
 * @param {object} data - The JSON data (expects { _meta, entries } or flat object)
 * @param {string} term - Search term
 * @returns {Array<{ key: string, value: * }>}
 */
function searchJsonEntries(data, term) {
  if (!data || typeof data !== 'object') return [];

  const entries = data.entries || data;
  if (!entries || typeof entries !== 'object') return [];

  const lowerTerm = term.toLowerCase();
  const matches = [];

  for (const [key, value] of Object.entries(entries)) {
    if (key === '_meta') continue;

    // Check key match
    if (key.toLowerCase().includes(lowerTerm)) {
      matches.push({ key, value });
      continue;
    }

    // Check string value match (recursive for objects)
    if (matchesInValue(value, lowerTerm)) {
      matches.push({ key, value });
    }
  }

  return matches;
}

/**
 * Recursively check if a term appears in any string value.
 *
 * @param {*} value
 * @param {string} lowerTerm
 * @returns {boolean}
 */
function matchesInValue(value, lowerTerm) {
  if (typeof value === 'string') {
    return value.toLowerCase().includes(lowerTerm);
  }
  if (Array.isArray(value)) {
    return value.some(v => matchesInValue(v, lowerTerm));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(v => matchesInValue(v, lowerTerm));
  }
  return false;
}

/**
 * Search for a term in arch.md text content.
 * Returns matching lines.
 *
 * @param {string} filePath - Path to arch.md
 * @param {string} term - Search term
 * @returns {string[]}
 */
function searchArchMd(filePath, term) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lowerTerm = term.toLowerCase();
    const lines = content.split(/\r?\n/);
    return lines.filter(line => line.toLowerCase().includes(lowerTerm));
  } catch (_e) {
    return [];
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Query intel files for a search term.
 * Searches across all JSON intel files (keys and values) and arch.md (text lines).
 *
 * @param {string} term - Search term (case-insensitive)
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ matches: Array<{ source: string, entries: Array }>, term: string, total: number } | { disabled: true, message: string }}
 */
function intelQuery(term, planningDir) {
  if (!isIntelEnabled(planningDir)) return disabledResponse();

  const matches = [];
  let total = 0;

  // Search JSON intel files
  for (const [_key, filename] of Object.entries(INTEL_FILES)) {
    if (filename.endsWith('.md')) continue; // Skip arch.md here

    const filePath = intelFilePath(planningDir, filename);
    const data = safeReadJson(filePath);
    if (!data) continue;

    const found = searchJsonEntries(data, term);
    if (found.length > 0) {
      matches.push({ source: filename, entries: found });
      total += found.length;
    }
  }

  // Search arch.md
  const archPath = intelFilePath(planningDir, INTEL_FILES.arch);
  const archMatches = searchArchMd(archPath, term);
  if (archMatches.length > 0) {
    matches.push({ source: INTEL_FILES.arch, entries: archMatches });
    total += archMatches.length;
  }

  return { matches, term, total };
}

/**
 * Report status and staleness of each intel file.
 * A file is considered stale if its updated_at is older than 24 hours.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ files: object, overall_stale: boolean } | { disabled: true, message: string }}
 */
function intelStatus(planningDir) {
  if (!isIntelEnabled(planningDir)) return disabledResponse();

  const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();
  const files = {};
  let overallStale = false;

  for (const [_key, filename] of Object.entries(INTEL_FILES)) {
    const filePath = intelFilePath(planningDir, filename);
    const exists = fs.existsSync(filePath);

    if (!exists) {
      files[filename] = { exists: false, updated_at: null, stale: true };
      overallStale = true;
      continue;
    }

    let updatedAt = null;

    if (filename.endsWith('.md')) {
      // For arch.md, use file mtime
      try {
        const stat = fs.statSync(filePath);
        updatedAt = stat.mtime.toISOString();
      } catch (_e) {
        // fall through
      }
    } else {
      // For JSON files, read _meta.updated_at
      const data = safeReadJson(filePath);
      if (data && data._meta && data._meta.updated_at) {
        updatedAt = data._meta.updated_at;
      }
    }

    let stale = true;
    if (updatedAt) {
      const age = now - new Date(updatedAt).getTime();
      stale = age > STALE_MS;
    }

    if (stale) overallStale = true;
    files[filename] = { exists: true, updated_at: updatedAt, stale };
  }

  return { files, overall_stale: overallStale };
}

/**
 * Show changes since the last full refresh by comparing file hashes.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ changed: string[], added: string[], removed: string[] } | { no_baseline: true } | { disabled: true, message: string }}
 */
function intelDiff(planningDir) {
  if (!isIntelEnabled(planningDir)) return disabledResponse();

  const snapshotPath = intelFilePath(planningDir, '.last-refresh.json');
  const snapshot = safeReadJson(snapshotPath);

  if (!snapshot) {
    return { no_baseline: true };
  }

  const prevHashes = snapshot.hashes || {};
  const changed = [];
  const added = [];
  const removed = [];

  // Check current files against snapshot
  for (const [_key, filename] of Object.entries(INTEL_FILES)) {
    const filePath = intelFilePath(planningDir, filename);
    const currentHash = hashFile(filePath);

    if (currentHash && !prevHashes[filename]) {
      added.push(filename);
    } else if (currentHash && prevHashes[filename] && currentHash !== prevHashes[filename]) {
      changed.push(filename);
    } else if (!currentHash && prevHashes[filename]) {
      removed.push(filename);
    }
  }

  return { changed, added, removed };
}

/**
 * Stub for triggering an intel update.
 * The actual update is performed by the intel-updater agent (PLAN-02).
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ action: string, message: string } | { disabled: true, message: string }}
 */
function intelUpdate(planningDir) {
  if (!isIntelEnabled(planningDir)) return disabledResponse();

  return {
    action: 'spawn_agent',
    message: 'Run /pbr:intel or spawn pbr:intel-updater agent for full refresh'
  };
}

/**
 * Save a refresh snapshot with hashes of all current intel files.
 * Called by the intel-updater agent after completing a refresh.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ saved: boolean, timestamp: string, files: number }}
 */
function saveRefreshSnapshot(planningDir) {
  const intelPath = ensureIntelDir(planningDir);
  const hashes = {};
  let fileCount = 0;

  for (const [_key, filename] of Object.entries(INTEL_FILES)) {
    const filePath = path.join(intelPath, filename);
    const hash = hashFile(filePath);
    if (hash) {
      hashes[filename] = hash;
      fileCount++;
    }
  }

  const timestamp = new Date().toISOString();
  const snapshotPath = path.join(intelPath, '.last-refresh.json');
  fs.writeFileSync(snapshotPath, JSON.stringify({
    hashes,
    timestamp,
    version: 1
  }, null, 2), 'utf8');

  return { saved: true, timestamp, files: fileCount };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Public API
  intelQuery,
  intelUpdate,
  intelStatus,
  intelDiff,
  saveRefreshSnapshot,

  // Utilities
  ensureIntelDir,
  isIntelEnabled,

  // Constants
  INTEL_FILES,
  INTEL_DIR
};

#!/usr/bin/env node

/**
 * Intel queue module — tracks code file changes for auto-update.
 *
 * When intel.auto_update is true, Write/Edit of code files appends
 * the file path to .planning/.intel-queue.json. A separate mechanism
 * (skill or debounce hook) later drains the queue and spawns the
 * intel-updater agent for affected slices.
 *
 * Non-code files (.planning/, .git/, node_modules/, config/docs extensions)
 * are silently skipped to avoid noise.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = '.intel-queue.json';

// ─── Skip patterns ──────────────────────────────────────────────────────────

const SKIP_DIR_PREFIXES = ['.planning/', '.planning\\', '.git/', '.git\\', 'node_modules/', 'node_modules\\'];

const SKIP_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml',
  '.lock', '.env', '.gitignore', '.npmrc'
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a file path to forward slashes.
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Check whether a file path refers to a code file (not config/docs/internal).
 *
 * @param {string} filePath - Relative or absolute file path
 * @returns {boolean} true if code file, false if should be skipped
 */
function isCodeFile(filePath) {
  const normalized = normalizePath(filePath);

  // Skip internal directories
  for (const prefix of SKIP_DIR_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized.includes('/' + prefix)) {
      return false;
    }
  }

  // Skip non-code extensions
  const ext = path.extname(normalized).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) {
    return false;
  }

  return true;
}

// ─── Queue operations ───────────────────────────────────────────────────────

/**
 * Read the current queue from disk.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {string[]} Array of queued file paths
 */
function readQueue(planningDir) {
  try {
    const queuePath = path.join(planningDir, QUEUE_FILE);
    if (!fs.existsSync(queuePath)) return [];
    return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (_e) {
    return [];
  }
}

/**
 * Remove the queue file from disk.
 *
 * @param {string} planningDir - Path to .planning directory
 */
function clearQueue(planningDir) {
  try {
    const queuePath = path.join(planningDir, QUEUE_FILE);
    if (fs.existsSync(queuePath)) {
      fs.unlinkSync(queuePath);
    }
  } catch (_e) {
    // Ignore errors
  }
}

/**
 * Queue an intel update for a code file.
 *
 * @param {Object} data - Hook stdin data (tool_input with file_path)
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ queued: true, file: string, queueSize: number } | null}
 */
function queueIntelUpdate(data, planningDir) {
  try {
    // Extract file path
    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
    if (!filePath) return null;

    // Check intel.enabled
    const { isIntelEnabled } = require('../../../plan-build-run/bin/lib/intel.cjs');
    if (!isIntelEnabled(planningDir)) return null;

    // Check intel.auto_update
    const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
    const config = configLoad(planningDir);
    if (config && config.intel && config.intel.auto_update === false) return null;

    // Check if code file
    if (!isCodeFile(filePath)) return null;

    // Read existing queue
    const queue = readQueue(planningDir);

    // Normalize and deduplicate
    const normalized = normalizePath(filePath);
    if (!queue.includes(normalized)) {
      queue.push(normalized);
    }

    // Write queue
    const queuePath = path.join(planningDir, QUEUE_FILE);
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8');

    return { queued: true, file: normalized, queueSize: queue.length };
  } catch (_e) {
    return null;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  queueIntelUpdate,
  readQueue,
  clearQueue,
  isCodeFile
};

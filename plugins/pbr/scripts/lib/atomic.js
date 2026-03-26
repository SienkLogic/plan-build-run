// lib/atomic.js — Atomic file operations for Plan-Build-Run tools.

const fs = require('fs');
const path = require('path');
const { logHook } = require('../hook-logger');

/**
 * Write content to a file atomically: write to .tmp, backup original to .bak,
 * rename .tmp over original. On failure, restore from .bak if available.
 *
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 * @returns {{success: boolean, error?: string}} Result
 */
function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';

  try {
    fs.writeFileSync(tmpPath, content, 'utf8');

    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, bakPath); } catch (_e) { /* intentionally silent: backup is non-fatal */ }
    }

    fs.renameSync(tmpPath, filePath);

    try {
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    } catch (_e) { /* intentionally silent: non-fatal */ }

    return { success: true };
  } catch (e) {
    try {
      if (fs.existsSync(bakPath)) fs.copyFileSync(bakPath, filePath);
    } catch (_restoreErr) { /* intentionally silent: restore is last resort */ }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_cleanupErr) { /* intentionally silent: tmp cleanup is non-fatal */ }

    return { success: false, error: e.message };
  }
}

/**
 * Locked file update: read-modify-write with exclusive lockfile.
 * Prevents concurrent writes to STATE.md and ROADMAP.md.
 *
 * @param {string} filePath - Absolute path to the file to update
 * @param {function} updateFn - Receives current content, returns new content
 * @param {object} opts - Options: { retries: 3, retryDelayMs: 100, timeoutMs: 5000 }
 * @returns {object} { success, content?, error? }
 */
async function lockedFileUpdate(filePath, updateFn, opts = {}) {
  const retries = opts.retries || 10;
  const retryDelayMs = opts.retryDelayMs || 50;
  const timeoutMs = opts.timeoutMs || 10000;
  const lockPath = filePath + '.lock';

  // Async sleep helper — does NOT block the event loop
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let lockFd = null;
  let lockAcquired = false;

  try {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        lockFd = await fs.promises.open(lockPath, 'wx');
        lockAcquired = true;
        break;
      } catch (e) { // intentionally silent: lock contention is expected
        if (e.code === 'EEXIST') {
          // Check for stale lock
          try {
            const stats = await fs.promises.stat(lockPath);
            if (Date.now() - stats.mtimeMs > timeoutMs) {
              try { await fs.promises.unlink(lockPath); } catch (_unlinkErr) { /* best effort */ }
              continue;
            }
          } catch (_statErr) { // intentionally silent: lock stat failed
            continue;
          }

          if (attempt < retries - 1) {
            const baseWait = retryDelayMs * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * retryDelayMs);
            const waitMs = Math.min(baseWait + jitter, 2000);
            await sleep(waitMs);
            continue;
          }
          // Last retry exhausted — break to fall through to last-resort write
          break;
        }
        throw e;
      }
    }

    if (!lockAcquired) {
      process.stderr.write(`[pbr] WARN: lock contention on ${path.basename(filePath)} after ${retries} attempts — writing without lock\n`);
      // Fall through to read-modify-write below (last-resort write)
    }

    if (lockAcquired) {
      await lockFd.write(`${process.pid}`);
      await lockFd.close();
      lockFd = null;
    }

    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    const newContent = updateFn(content);

    const writeResult = atomicWrite(filePath, newContent);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    return { success: true, content: newContent };
  } catch (e) {
    logHook('core', 'debug', 'lockedFileUpdate failed', { error: e.message });
    return { success: false, error: e.message };
  } finally {
    try {
      if (lockFd !== null) {
        try { await lockFd.close(); } catch (_e) { /* intentionally silent */ }
      }
    } catch (_e) { /* intentionally silent: fd close in finally */ }
    if (lockAcquired) {
      try { await fs.promises.unlink(lockPath); } catch (_e) { /* intentionally silent: lock cleanup in finally block */ }
    }
  }
}

module.exports = { atomicWrite, lockedFileUpdate };

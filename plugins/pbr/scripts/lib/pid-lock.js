'use strict';

/**
 * pid-lock.js — PID lockfile management for the PBR hook server.
 *
 * Provides cross-platform PID-based lock acquisition, release, and
 * status checking. The lockfile lives at .planning/.hook-server.pid
 * and contains JSON: { pid, port, startedAt }.
 *
 * All functions are synchronous — no async needed for fs ops and process.kill.
 */

const fs = require('fs');
const path = require('path');

const LOCKFILE_NAME = '.hook-server.pid';

/**
 * Check if a process with the given PID is alive.
 * Uses process.kill(pid, 0) which throws on dead/inaccessible processes.
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Acquire the PID lockfile for the hook server.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {number} port - Port the server will listen on
 * @returns {{ acquired: boolean, reason?: string, pid?: number }}
 */
function acquireLock(planningDir, port) {
  const lockPath = path.join(planningDir, LOCKFILE_NAME);

  // Check existing lockfile
  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const lock = JSON.parse(content);

    if (lock.pid && isPidAlive(lock.pid)) {
      if (lock.port === port) {
        // Existing server is alive on the same port — don't replace it
        return { acquired: false, reason: 'server-running', pid: lock.pid };
      }
      // PID alive but different port — still running, don't clobber
      return { acquired: false, reason: 'server-running', pid: lock.pid };
    }

    // PID is dead — stale lockfile, clean it up
    try {
      fs.unlinkSync(lockPath);
    } catch (_e) {
      // Best-effort removal
    }
  } catch (_e) {
    // No lockfile or unreadable — proceed to create
  }

  // Write new lockfile
  try {
    const lockData = {
      pid: process.pid,
      port: port,
      startedAt: new Date().toISOString()
    };
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2) + '\n', 'utf8');
    return { acquired: true };
  } catch (_e) {
    // Can't write lockfile — proceed without it (fail-open)
    return { acquired: true };
  }
}

/**
 * Release the PID lockfile. Only deletes if the lockfile belongs to this process.
 *
 * @param {string} planningDir - Path to .planning directory
 */
function releaseLock(planningDir) {
  const lockPath = path.join(planningDir, LOCKFILE_NAME);

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const lock = JSON.parse(content);

    // Only delete our own lockfile
    if (lock.pid === process.pid) {
      fs.unlinkSync(lockPath);
    }
  } catch (_e) {
    // File missing or unreadable — no-op (fail-safe)
  }
}

/**
 * Check if the hook server is currently running based on lockfile state.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ running: boolean, pid: number|null, port: number|null }}
 */
function isServerRunning(planningDir) {
  const lockPath = path.join(planningDir, LOCKFILE_NAME);

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const lock = JSON.parse(content);

    if (lock.pid && isPidAlive(lock.pid)) {
      return { running: true, pid: lock.pid, port: lock.port || null };
    }

    // Stale lockfile — process is dead
    return { running: false, pid: null, port: null };
  } catch (_e) {
    // No lockfile or unreadable
    return { running: false, pid: null, port: null };
  }
}

module.exports = { acquireLock, releaseLock, isServerRunning };

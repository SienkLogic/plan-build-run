// lib/session.js — Session lifecycle, state, and phase claiming for Plan-Build-Run.

const fs = require('fs');
const path = require('path');
const { logHook } = require('../hook-logger');
const { STALE_SESSION_MS } = require('./constants');

// ─── Session-scoped path resolution ───────────────────────────────────────────

/**
 * Resolve a session-scoped file path.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} filename - Filename to resolve
 * @param {string} sessionId - Session identifier
 * @returns {string} Resolved path
 */
function resolveSessionPath(pDir, filename, sessionId) {
  return path.join(pDir, '.sessions', sessionId, filename);
}

/**
 * Ensure session directory exists and write meta.json.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} sessionId - Session identifier
 */
function ensureSessionDir(pDir, sessionId) {
  const dirPath = path.join(pDir, '.sessions', sessionId);
  fs.mkdirSync(dirPath, { recursive: true });
  const metaPath = path.join(dirPath, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({
      session_id: sessionId,
      created: new Date().toISOString(),
      pid: process.pid
    }, null, 2), 'utf8');
  }
}

/**
 * Remove a session directory and all its contents.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} sessionId - Session identifier
 */
function removeSessionDir(pDir, sessionId) {
  const dirPath = path.join(pDir, '.sessions', sessionId);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Remove stale session directories older than STALE_SESSION_MS.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @returns {Array<{sessionId: string, age: number}>} Removed sessions
 */
function cleanStaleSessions(pDir) {
  const sessionsDir = path.join(pDir, '.sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const removed = [];
  try {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(sessionsDir, entry.name);
      let ageMs = 0;

      const metaPath = path.join(dirPath, 'meta.json');
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        ageMs = Date.now() - new Date(meta.created).getTime();
      } catch (_e) {
        // intentionally silent: meta.json may not exist or be malformed
        try {
          const stats = fs.statSync(dirPath);
          ageMs = Date.now() - stats.mtimeMs;
        } catch (_statErr) {
          // intentionally silent: stat failure means skip this session
          continue;
        }
      }

      if (ageMs > STALE_SESSION_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        removed.push({ sessionId: entry.name, age: ageMs });
      }
    }
  } catch (_e) { logHook('session', 'debug', 'Failed during stale session cleanup'); }

  return removed;
}

// ─── Session state management ─────────────────────────────────────────────────

/**
 * Load .session.json from .planning/ directory.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {object} Parsed session data or empty object
 */
function sessionLoad(dir, sessionId) {
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  try {
    if (!fs.existsSync(sessionPath)) return {};
    const content = fs.readFileSync(sessionPath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    // intentionally silent: session file may not exist
    return {};
  }
}

/**
 * Save data to .session.json using atomic write.
 * Merges provided data with existing session data.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {object} data - Key-value pairs to merge into session
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {{ success: boolean, error?: string }}
 */
function sessionSave(dir, data, sessionId) {
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  const tmpPath = sessionPath + '.tmp';
  try {
    if (sessionId) ensureSessionDir(dir, sessionId);
    const existing = sessionLoad(dir, sessionId);
    const merged = Object.assign(existing, data);
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf8');
    fs.renameSync(tmpPath, sessionPath);
    return { success: true };
  } catch (e) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) { /* intentionally silent: tmp cleanup is non-fatal */ }
    return { success: false, error: e.message };
  }
}

/**
 * Clear session data by removing the .session.json file.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {{ success: boolean, error?: string }}
 */
function sessionClear(dir, sessionId) {
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  try {
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    return { success: true };
  } catch (e) {
    logHook('session', 'debug', 'Failed to clear session', { error: e.message });
    return { success: false, error: e.message };
  }
}

/**
 * Dump all session data as a JSON object for debugging.
 *
 * @param {string} dir - Path to .planning/ directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {object} Session data including metadata
 */
function sessionDump(dir, sessionId) {
  const data = sessionLoad(dir, sessionId);
  const sessionPath = sessionId
    ? resolveSessionPath(dir, '.session.json', sessionId)
    : path.join(dir, '.session.json');
  return {
    path: sessionPath,
    exists: fs.existsSync(sessionPath),
    data,
    keys: Object.keys(data)
  };
}

/**
 * Write .active-skill with OS-level mutual exclusion.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} skillName - Skill name to write
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {{success: boolean, warning?: string}} Result
 */
function writeActiveSkill(pDir, skillName, sessionId) {
  const skillFile = sessionId
    ? resolveSessionPath(pDir, '.active-skill', sessionId)
    : path.join(pDir, '.active-skill');
  const lockFile = skillFile + '.lock';
  const staleThresholdMs = 60 * 60 * 1000;

  if (sessionId) ensureSessionDir(pDir, sessionId);

  let lockFd = null;
  try {
    lockFd = fs.openSync(lockFile, 'wx');
    fs.writeSync(lockFd, `${process.pid}`);
    fs.closeSync(lockFd);
    lockFd = null;

    let warning = null;
    if (fs.existsSync(skillFile)) {
      try {
        const stats = fs.statSync(skillFile);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs < staleThresholdMs) {
          const existing = fs.readFileSync(skillFile, 'utf8').trim();
          warning = `.active-skill already set to "${existing}" (${Math.round(ageMs / 60000)}min ago). Overwriting.`;
        }
      } catch (_e) { /* intentionally silent: file may have been deleted concurrently */ }
    }

    fs.writeFileSync(skillFile, skillName, 'utf8');
    try { sessionSave(pDir, { activeSkill: skillName }, sessionId); } catch (_e) { /* intentionally silent: session save is non-fatal */ }
    try { fs.unlinkSync(lockFile); } catch (_e) { /* intentionally silent: lock cleanup is non-fatal */ }

    return { success: true, warning };
  } catch (e) {
    try { if (lockFd !== null) fs.closeSync(lockFd); } catch (_e) { /* intentionally silent: fd close on error path */ }

    if (e.code === 'EEXIST') {
      try {
        const lockStats = fs.statSync(lockFile);
        const lockAgeMs = Date.now() - lockStats.mtimeMs;
        if (lockAgeMs > staleThresholdMs) {
          fs.unlinkSync(lockFile);
          return writeActiveSkill(pDir, skillName, sessionId);
        }
      } catch (_statErr) {
        // intentionally silent: lock stat failed, retry write
        return writeActiveSkill(pDir, skillName, sessionId);
      }
      return { success: false, warning: `.active-skill.lock held by another process.` };
    }

    try {
      fs.writeFileSync(skillFile, skillName, 'utf8');
      return { success: true, warning: `Lock failed (${e.code}), wrote without lock` };
    } catch (writeErr) {
      logHook('session', 'warn', 'Failed to write .active-skill', { error: writeErr.message });
      return { success: false, warning: `Failed to write .active-skill: ${writeErr.message}` };
    }
  }
}

// ─── Phase claiming ───────────────────────────────────────────────────────────

/**
 * Check whether a claim is stale (its session directory no longer exists).
 *
 * @param {object} claimData - Parsed .claim JSON (must have session_id)
 * @param {string} pDir - Path to .planning/ directory
 * @returns {{ stale: boolean, reason?: string }}
 */
function isClaimStale(claimData, pDir) {
  const sessionDir = path.join(pDir, '.sessions', claimData.session_id);
  if (!fs.existsSync(sessionDir)) {
    return { stale: true, reason: 'session_dir_missing' };
  }
  return { stale: false };
}

/**
 * Acquire a phase claim for a session. Auto-releases stale claims.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} phaseDir - Absolute path to the phase directory
 * @param {string} sessionId - Session identifier
 * @param {string} skill - Skill name acquiring the claim
 * @returns {{ acquired: boolean, conflict?: object, auto_released?: object }}
 */
function acquireClaim(pDir, phaseDir, sessionId, skill) {
  const claimPath = path.join(phaseDir, '.claim');
  let autoReleased = null;

  if (fs.existsSync(claimPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
      if (existing.session_id !== sessionId) {
        const staleCheck = isClaimStale(existing, pDir);
        if (staleCheck.stale) {
          fs.unlinkSync(claimPath);
          autoReleased = existing;
        } else {
          return {
            acquired: false,
            conflict: {
              session_id: existing.session_id,
              skill: existing.skill,
              started: existing.started,
              pid: existing.pid
            },
            auto_released: null
          };
        }
      }
    } catch (_e) {
      try { fs.unlinkSync(claimPath); } catch (_unlinkErr) { /* intentionally silent: claim cleanup */ }
    }
  }

  const claimData = {
    session_id: sessionId,
    skill: skill,
    started: new Date().toISOString(),
    pid: process.pid
  };
  fs.writeFileSync(claimPath, JSON.stringify(claimData, null, 2), 'utf8');

  return { acquired: true, conflict: null, auto_released: autoReleased };
}

/**
 * Release a phase claim owned by a specific session.
 *
 * @param {string} _pDir - Path to .planning/ directory (unused, for API consistency)
 * @param {string} phaseDir - Absolute path to the phase directory
 * @param {string} sessionId - Session identifier
 * @returns {{ released: boolean, reason?: string, owner?: string }}
 */
function releaseClaim(_pDir, phaseDir, sessionId) {
  const claimPath = path.join(phaseDir, '.claim');

  if (!fs.existsSync(claimPath)) {
    return { released: false, reason: 'no_claim' };
  }

  try {
    const claim = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
    if (claim.session_id !== sessionId) {
      return { released: false, reason: 'not_owner', owner: claim.session_id };
    }
    fs.unlinkSync(claimPath);
    return { released: true };
  } catch (_e) {
    try { fs.unlinkSync(claimPath); } catch (_unlinkErr) { /* intentionally silent: claim cleanup */ }
    return { released: true };
  }
}

/**
 * List all active phase claims.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @returns {{ claims: Array<object> }}
 */
function listClaims(pDir) {
  const phasesDir = path.join(pDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { claims: [] };
  }

  const results = [];
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const claimPath = path.join(phasesDir, entry.name, '.claim');
      if (!fs.existsSync(claimPath)) continue;
      try {
        const claimData = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        results.push({
          phase: entry.name,
          ...claimData,
          stale: isClaimStale(claimData, pDir).stale
        });
      } catch (_e) { logHook('session', 'debug', 'Skipping malformed claim file'); }
    }
  } catch (_e) { logHook('session', 'debug', 'Failed to list claims'); }

  return { claims: results };
}

/**
 * Release all claims held by a specific session across all phase directories.
 *
 * @param {string} pDir - Path to .planning/ directory
 * @param {string} sessionId - Session identifier
 * @returns {{ released: string[] }}
 */
function releaseSessionClaims(pDir, sessionId) {
  const phasesDir = path.join(pDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { released: [] };
  }

  const released = [];
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const claimPath = path.join(phasesDir, entry.name, '.claim');
      if (!fs.existsSync(claimPath)) continue;
      try {
        const claimData = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
        if (claimData.session_id === sessionId) {
          fs.unlinkSync(claimPath);
          released.push(entry.name);
        }
      } catch (_e) { logHook('session', 'debug', 'Skipping malformed claim'); }
    }
  } catch (_e) { logHook('session', 'debug', 'Failed to release session claims'); }

  return { released };
}

module.exports = {
  resolveSessionPath,
  ensureSessionDir,
  removeSessionDir,
  cleanStaleSessions,
  sessionLoad,
  sessionSave,
  sessionClear,
  sessionDump,
  writeActiveSkill,
  isClaimStale,
  acquireClaim,
  releaseClaim,
  listClaims,
  releaseSessionClaims,
};

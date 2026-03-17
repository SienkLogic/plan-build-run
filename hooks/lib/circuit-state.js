'use strict';

/**
 * lib/circuit-state.js — Persistent cross-process circuit breaker state.
 *
 * Stores circuit state in .planning/logs/local-llm-circuit.json so multiple
 * hook processes share the same failure counts across process boundaries.
 *
 * Entries expire after STALE_TTL_MS (30 minutes) since the last failure.
 */

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./core');

const STALE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const STATE_FILENAME = 'local-llm-circuit.json';

/**
 * Returns the path to the circuit state file.
 * @param {string} planningDir
 * @returns {string}
 */
function _statePath(planningDir) {
  return path.join(planningDir, 'logs', STATE_FILENAME);
}

/**
 * Load circuit state from disk. Returns an empty object on any error.
 * Prunes entries whose last_failure timestamp is older than STALE_TTL_MS.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {object} Map of operationType -> { failures, disabled, last_failure }
 */
function loadCircuitState(planningDir) {
  const statePath = _statePath(planningDir);
  let raw = {};
  try {
    if (!fs.existsSync(statePath)) return {};
    raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (_e) {
    return {};
  }

  const now = Date.now();
  const pruned = {};
  for (const [opType, entry] of Object.entries(raw)) {
    if (entry && typeof entry.last_failure === 'number') {
      if (now - entry.last_failure < STALE_TTL_MS) {
        pruned[opType] = entry;
      }
      // else: stale — drop it
    }
  }
  return pruned;
}

/**
 * Atomically write circuit state to disk.
 * Uses a temp-file + rename pattern to avoid partial writes.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {object} state - State object to write
 */
function saveCircuitState(planningDir, state) {
  const logsDir = path.join(planningDir, 'logs');
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const statePath = _statePath(planningDir);
    atomicWrite(statePath, JSON.stringify(state, null, 2));
  } catch (_e) {
    // Best-effort — never crash the calling hook
  }
}

/**
 * Returns true if the circuit is open (disabled) for the given operation type,
 * based on persistent state.
 *
 * @param {string} planningDir
 * @param {string} operationType
 * @param {number} maxFailures
 * @returns {boolean}
 */
function isDisabledPersistent(planningDir, operationType, maxFailures) {
  const state = loadCircuitState(planningDir);
  const entry = state[operationType];
  if (!entry) return false;
  return entry.disabled === true || entry.failures >= maxFailures;
}

/**
 * Records a failure for the given operation type in persistent state.
 * Marks the circuit disabled when maxFailures is reached.
 *
 * @param {string} planningDir
 * @param {string} operationType
 * @param {number} maxFailures
 */
function recordFailurePersistent(planningDir, operationType, maxFailures) {
  const state = loadCircuitState(planningDir);
  const entry = state[operationType] || { failures: 0, disabled: false, last_failure: 0 };
  entry.failures += 1;
  entry.last_failure = Date.now();
  if (entry.failures >= maxFailures) {
    entry.disabled = true;
  }
  state[operationType] = entry;
  saveCircuitState(planningDir, state);
}

/**
 * Resets the persistent circuit state for the given operation type.
 *
 * @param {string} planningDir
 * @param {string} operationType
 */
function resetCircuitPersistent(planningDir, operationType) {
  const state = loadCircuitState(planningDir);
  delete state[operationType];
  saveCircuitState(planningDir, state);
}

module.exports = {
  loadCircuitState,
  saveCircuitState,
  isDisabledPersistent,
  recordFailurePersistent,
  resetCircuitPersistent,
  STALE_TTL_MS
};

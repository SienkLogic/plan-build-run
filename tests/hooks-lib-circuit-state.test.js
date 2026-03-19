/**
 * Tests for hooks/lib/circuit-state.js — Persistent circuit breaker state.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');
const {
  loadCircuitState,
  saveCircuitState,
  isDisabledPersistent,
  recordFailurePersistent,
  resetCircuitPersistent,
  STALE_TTL_MS
} = require('../hooks/lib/circuit-state');

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

describe('loadCircuitState', () => {
  test('returns empty object when no state file', () => {
    expect(loadCircuitState(planningDir)).toEqual({});
  });

  test('returns empty object for malformed JSON', () => {
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'local-llm-circuit.json'), 'not json');
    expect(loadCircuitState(planningDir)).toEqual({});
  });

  test('prunes stale entries', () => {
    const state = {
      fresh: { failures: 2, disabled: false, last_failure: Date.now() },
      stale: { failures: 5, disabled: true, last_failure: Date.now() - STALE_TTL_MS - 1000 }
    };
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      path.join(logsDir, 'local-llm-circuit.json'),
      JSON.stringify(state)
    );

    const loaded = loadCircuitState(planningDir);
    expect(loaded).toHaveProperty('fresh');
    expect(loaded).not.toHaveProperty('stale');
  });
});

describe('saveCircuitState + loadCircuitState round-trip', () => {
  test('save then load returns same state', () => {
    const state = {
      typecheck: { failures: 1, disabled: false, last_failure: Date.now() }
    };
    saveCircuitState(planningDir, state);
    const loaded = loadCircuitState(planningDir);
    expect(loaded.typecheck.failures).toBe(1);
  });
});

describe('recordFailurePersistent', () => {
  test('increments failure count', () => {
    recordFailurePersistent(planningDir, 'lint', 3);
    const state = loadCircuitState(planningDir);
    expect(state.lint.failures).toBe(1);
    expect(state.lint.disabled).toBe(false);
  });

  test('marks disabled after reaching maxFailures', () => {
    recordFailurePersistent(planningDir, 'lint', 2);
    recordFailurePersistent(planningDir, 'lint', 2);
    const state = loadCircuitState(planningDir);
    expect(state.lint.failures).toBe(2);
    expect(state.lint.disabled).toBe(true);
  });
});

describe('isDisabledPersistent', () => {
  test('returns false when no state', () => {
    expect(isDisabledPersistent(planningDir, 'lint', 3)).toBe(false);
  });

  test('returns true after threshold failures', () => {
    recordFailurePersistent(planningDir, 'lint', 2);
    recordFailurePersistent(planningDir, 'lint', 2);
    expect(isDisabledPersistent(planningDir, 'lint', 2)).toBe(true);
  });
});

describe('resetCircuitPersistent', () => {
  test('clears state for operation type', () => {
    recordFailurePersistent(planningDir, 'lint', 3);
    resetCircuitPersistent(planningDir, 'lint');
    const state = loadCircuitState(planningDir);
    expect(state).not.toHaveProperty('lint');
  });

  test('does not affect other operation types', () => {
    recordFailurePersistent(planningDir, 'lint', 3);
    recordFailurePersistent(planningDir, 'typecheck', 3);
    resetCircuitPersistent(planningDir, 'lint');
    const state = loadCircuitState(planningDir);
    expect(state).not.toHaveProperty('lint');
    expect(state).toHaveProperty('typecheck');
  });
});

describe('STALE_TTL_MS', () => {
  test('is 30 minutes', () => {
    expect(STALE_TTL_MS).toBe(30 * 60 * 1000);
  });
});

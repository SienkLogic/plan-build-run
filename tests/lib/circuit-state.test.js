'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadCircuitState,
  saveCircuitState,
  isDisabledPersistent,
  recordFailurePersistent,
  resetCircuitPersistent,
  STALE_TTL_MS
} = require('../../plugins/pbr/scripts/lib/circuit-state');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-circuit-'));
  fs.mkdirSync(path.join(tmpDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// loadCircuitState
// ---------------------------------------------------------------------------
describe('loadCircuitState', () => {
  test('returns empty object when state file does not exist', () => {
    const state = loadCircuitState(tmpDir);
    expect(state).toEqual({});
  });

  test('returns parsed state when file exists', () => {
    const now = Date.now();
    const data = { 'op-a': { failures: 2, disabled: false, last_failure: now } };
    fs.writeFileSync(path.join(tmpDir, 'logs', 'local-llm-circuit.json'), JSON.stringify(data));
    const state = loadCircuitState(tmpDir);
    expect(state['op-a']).toBeDefined();
    expect(state['op-a'].failures).toBe(2);
  });

  test('prunes stale entries older than TTL', () => {
    const staleTime = Date.now() - STALE_TTL_MS - 1000;
    const data = {
      'stale-op': { failures: 5, disabled: true, last_failure: staleTime },
      'fresh-op': { failures: 1, disabled: false, last_failure: Date.now() }
    };
    fs.writeFileSync(path.join(tmpDir, 'logs', 'local-llm-circuit.json'), JSON.stringify(data));
    const state = loadCircuitState(tmpDir);
    expect(state['stale-op']).toBeUndefined();
    expect(state['fresh-op']).toBeDefined();
  });

  test('returns empty object on malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'logs', 'local-llm-circuit.json'), '{ bad json }');
    const state = loadCircuitState(tmpDir);
    expect(state).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// saveCircuitState
// ---------------------------------------------------------------------------
describe('saveCircuitState', () => {
  test('writes state to disk', () => {
    const now = Date.now();
    saveCircuitState(tmpDir, { 'my-op': { failures: 1, disabled: false, last_failure: now } });
    const statePath = path.join(tmpDir, 'logs', 'local-llm-circuit.json');
    expect(fs.existsSync(statePath)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(loaded['my-op'].failures).toBe(1);
  });

  test('creates logs dir if missing', () => {
    const dirWithoutLogs = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-no-logs-'));
    try {
      saveCircuitState(dirWithoutLogs, { 'op': { failures: 1, disabled: false, last_failure: Date.now() } });
      expect(fs.existsSync(path.join(dirWithoutLogs, 'logs', 'local-llm-circuit.json'))).toBe(true);
    } finally {
      fs.rmSync(dirWithoutLogs, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// isDisabledPersistent
// ---------------------------------------------------------------------------
describe('isDisabledPersistent', () => {
  test('returns false when no state exists', () => {
    expect(isDisabledPersistent(tmpDir, 'new-op', 3)).toBe(false);
  });

  test('returns false when failures are below threshold', () => {
    recordFailurePersistent(tmpDir, 'op-x', 3);
    expect(isDisabledPersistent(tmpDir, 'op-x', 3)).toBe(false);
  });

  test('returns true when disabled flag is set', () => {
    recordFailurePersistent(tmpDir, 'op-y', 1);
    expect(isDisabledPersistent(tmpDir, 'op-y', 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// recordFailurePersistent
// ---------------------------------------------------------------------------
describe('recordFailurePersistent', () => {
  test('increments failure count', () => {
    recordFailurePersistent(tmpDir, 'cnt-op', 5);
    recordFailurePersistent(tmpDir, 'cnt-op', 5);
    const state = loadCircuitState(tmpDir);
    expect(state['cnt-op'].failures).toBe(2);
  });

  test('marks disabled when maxFailures reached', () => {
    recordFailurePersistent(tmpDir, 'dis-op', 2);
    recordFailurePersistent(tmpDir, 'dis-op', 2);
    const state = loadCircuitState(tmpDir);
    expect(state['dis-op'].disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resetCircuitPersistent
// ---------------------------------------------------------------------------
describe('resetCircuitPersistent', () => {
  test('clears the entry for an operation type', () => {
    recordFailurePersistent(tmpDir, 'reset-op', 3);
    resetCircuitPersistent(tmpDir, 'reset-op');
    expect(isDisabledPersistent(tmpDir, 'reset-op', 3)).toBe(false);
    const state = loadCircuitState(tmpDir);
    expect(state['reset-op']).toBeUndefined();
  });

  test('does not affect other operation types', () => {
    recordFailurePersistent(tmpDir, 'keep-op', 1);
    recordFailurePersistent(tmpDir, 'del-op', 1);
    resetCircuitPersistent(tmpDir, 'del-op');
    const state = loadCircuitState(tmpDir);
    expect(state['keep-op']).toBeDefined();
    expect(state['del-op']).toBeUndefined();
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  HOOK_EVENT_MAP,
  DEFAULT_PORT,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
} = require('../plugins/pbr/scripts/hook-server-client');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-hsc-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('circuit breaker', () => {
  test('isCircuitOpen returns false with no planningDir', async () => {
    expect(isCircuitOpen(null)).toBe(false);
  });

  test('isCircuitOpen returns false when no circuit file exists', async () => {
    expect(isCircuitOpen(planningDir)).toBe(false);
  });

  test('isCircuitOpen returns false when failures below threshold', async () => {
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    fs.writeFileSync(circuitPath, JSON.stringify({ failures: 2, openedAt: 0 }));
    expect(isCircuitOpen(planningDir)).toBe(false);
  });

  test('isCircuitOpen returns true when failures at threshold and within cooldown', async () => {
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    fs.writeFileSync(circuitPath, JSON.stringify({
      failures: CIRCUIT_FAILURE_THRESHOLD,
      openedAt: Date.now()
    }));
    expect(isCircuitOpen(planningDir)).toBe(true);
  });

  test('isCircuitOpen returns false after cooldown expires (half-open)', async () => {
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    fs.writeFileSync(circuitPath, JSON.stringify({
      failures: CIRCUIT_FAILURE_THRESHOLD,
      openedAt: Date.now() - CIRCUIT_COOLDOWN_MS - 1000
    }));
    expect(isCircuitOpen(planningDir)).toBe(false);
  });

  test('isCircuitOpen handles corrupt circuit file', async () => {
    fs.writeFileSync(path.join(planningDir, '.hook-server-circuit.json'), 'not json');
    expect(isCircuitOpen(planningDir)).toBe(false);
  });
});

describe('recordFailure', () => {
  test('does nothing with null planningDir', async () => {
    expect(() => recordFailure(null)).not.toThrow();
  });

  test('creates circuit file on first failure', async () => {
    recordFailure(planningDir);
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    expect(fs.existsSync(circuitPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
    expect(data.failures).toBe(1);
  });

  test('increments failure count', async () => {
    recordFailure(planningDir);
    recordFailure(planningDir);
    recordFailure(planningDir);
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    const data = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
    expect(data.failures).toBe(3);
  });

  test('sets openedAt when reaching threshold', async () => {
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i++) {
      recordFailure(planningDir);
    }
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    const data = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
    expect(data.failures).toBe(CIRCUIT_FAILURE_THRESHOLD);
    expect(data.openedAt).toBeGreaterThan(0);
  });
});

describe('recordSuccess', () => {
  test('does nothing with null planningDir', async () => {
    expect(() => recordSuccess(null)).not.toThrow();
  });

  test('removes circuit file on success', async () => {
    recordFailure(planningDir);
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    expect(fs.existsSync(circuitPath)).toBe(true);
    recordSuccess(planningDir);
    expect(fs.existsSync(circuitPath)).toBe(false);
  });

  test('handles missing circuit file gracefully', async () => {
    expect(() => recordSuccess(planningDir)).not.toThrow();
  });
});

describe('exports', () => {
  test('HOOK_EVENT_MAP has expected entries', async () => {
    expect(HOOK_EVENT_MAP).toBeDefined();
    expect(HOOK_EVENT_MAP['track-context-budget']).toBeDefined();
    expect(HOOK_EVENT_MAP['post-write-dispatch']).toBeDefined();
    expect(HOOK_EVENT_MAP['check-subagent-output']).toBeDefined();
  });

  test('DEFAULT_PORT is defined', async () => {
    expect(DEFAULT_PORT).toBe(19836);
  });

  test('CIRCUIT constants are defined', async () => {
    expect(CIRCUIT_FAILURE_THRESHOLD).toBe(5);
    expect(CIRCUIT_COOLDOWN_MS).toBe(30000);
  });
});

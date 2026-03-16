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
} = require('../hooks/hook-server-client');

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
  test('isCircuitOpen returns false with no planningDir', () => {
    expect(isCircuitOpen(null)).toBe(false);
  });

  test('isCircuitOpen returns false when no circuit file exists', () => {
    expect(isCircuitOpen(planningDir)).toBe(false);
  });

  test('isCircuitOpen returns false when failures below threshold', () => {
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    fs.writeFileSync(circuitPath, JSON.stringify({ failures: 2, openedAt: 0 }));
    expect(isCircuitOpen(planningDir)).toBe(false);
  });

  test('isCircuitOpen returns true when failures at threshold and within cooldown', () => {
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    fs.writeFileSync(circuitPath, JSON.stringify({
      failures: CIRCUIT_FAILURE_THRESHOLD,
      openedAt: Date.now()
    }));
    expect(isCircuitOpen(planningDir)).toBe(true);
  });

  test('isCircuitOpen returns false after cooldown expires (half-open)', () => {
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    fs.writeFileSync(circuitPath, JSON.stringify({
      failures: CIRCUIT_FAILURE_THRESHOLD,
      openedAt: Date.now() - CIRCUIT_COOLDOWN_MS - 1000
    }));
    expect(isCircuitOpen(planningDir)).toBe(false);
  });

  test('isCircuitOpen handles corrupt circuit file', () => {
    fs.writeFileSync(path.join(planningDir, '.hook-server-circuit.json'), 'not json');
    expect(isCircuitOpen(planningDir)).toBe(false);
  });
});

describe('recordFailure', () => {
  test('does nothing with null planningDir', () => {
    expect(() => recordFailure(null)).not.toThrow();
  });

  test('creates circuit file on first failure', () => {
    recordFailure(planningDir);
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    expect(fs.existsSync(circuitPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
    expect(data.failures).toBe(1);
  });

  test('increments failure count', () => {
    recordFailure(planningDir);
    recordFailure(planningDir);
    recordFailure(planningDir);
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    const data = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
    expect(data.failures).toBe(3);
  });

  test('sets openedAt when reaching threshold', () => {
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
  test('does nothing with null planningDir', () => {
    expect(() => recordSuccess(null)).not.toThrow();
  });

  test('removes circuit file on success', () => {
    recordFailure(planningDir);
    const circuitPath = path.join(planningDir, '.hook-server-circuit.json');
    expect(fs.existsSync(circuitPath)).toBe(true);
    recordSuccess(planningDir);
    expect(fs.existsSync(circuitPath)).toBe(false);
  });

  test('handles missing circuit file gracefully', () => {
    expect(() => recordSuccess(planningDir)).not.toThrow();
  });
});

describe('exports', () => {
  test('HOOK_EVENT_MAP has expected entries', () => {
    expect(HOOK_EVENT_MAP).toBeDefined();
    expect(HOOK_EVENT_MAP['track-context-budget']).toBeDefined();
    expect(HOOK_EVENT_MAP['post-write-dispatch']).toBeDefined();
    expect(HOOK_EVENT_MAP['check-subagent-output']).toBeDefined();
  });

  test('DEFAULT_PORT is defined', () => {
    expect(DEFAULT_PORT).toBe(19836);
  });

  test('CIRCUIT constants are defined', () => {
    expect(CIRCUIT_FAILURE_THRESHOLD).toBe(5);
    expect(CIRCUIT_COOLDOWN_MS).toBe(30000);
  });
});

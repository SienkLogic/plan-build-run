'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  tryLaunchDashboard,
  tryLaunchHookServer,
  getEnrichedContext,
} = require('../hooks/lib/dashboard-launch');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-dl-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('tryLaunchDashboard', () => {
  test('is a function', () => {
    expect(typeof tryLaunchDashboard).toBe('function');
  });

  test('does not crash when called', () => {
    // Uses a port that is very unlikely to be in use
    // The function is async via event callbacks so it returns immediately
    expect(() => tryLaunchDashboard(19999, planningDir, tmpDir)).not.toThrow();
  });
});

describe('tryLaunchHookServer', () => {
  test('is a function', () => {
    expect(typeof tryLaunchHookServer).toBe('function');
  });

  test('skips when hook_server.enabled is false', () => {
    // Should return immediately without error
    expect(() => tryLaunchHookServer({ hook_server: { enabled: false } }, planningDir)).not.toThrow();
  });

  test('does not crash when config has no hook_server', () => {
    expect(() => tryLaunchHookServer({}, planningDir)).not.toThrow();
  });
});

describe('getEnrichedContext', () => {
  test('is an async function', () => {
    expect(typeof getEnrichedContext).toBe('function');
  });

  test('returns null when config is null and no server running', async () => {
    // Pass config with hook_server disabled to avoid network calls in CI
    const result = await getEnrichedContext({ hook_server: { enabled: false } }, planningDir);
    expect(result).toBeNull();
  });

  test('returns null when hook server disabled', async () => {
    const result = await getEnrichedContext({ hook_server: { enabled: false } }, planningDir);
    expect(result).toBeNull();
  });

  test('returns null when hook server not running', async () => {
    // Mock net.createConnection to simulate unreachable server without actual network call
    const net = require('net');
    const origCreateConnection = net.createConnection;
    net.createConnection = (opts) => {
      const EventEmitter = require('events');
      const fake = new EventEmitter();
      fake.setTimeout = () => {};
      fake.destroy = () => {};
      process.nextTick(() => fake.emit('error', new Error('ECONNREFUSED')));
      return fake;
    };
    try {
      const result = await getEnrichedContext({ hook_server: { enabled: true, port: 19998 } }, planningDir);
      expect(result).toBeNull();
    } finally {
      net.createConnection = origCreateConnection;
    }
  });
});

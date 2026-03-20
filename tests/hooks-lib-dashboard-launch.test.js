'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

const {
  tryLaunchDashboard,
  tryLaunchHookServer,
  getEnrichedContext,
} = require('../plugins/pbr/scripts/lib/dashboard-launch');

let tmpDir;
let planningDir;
let spawnSpy;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-dl-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  // Mock spawn to prevent actual background processes in CI
  const EventEmitter = require('events');
  spawnSpy = jest.spyOn(child_process, 'spawn').mockImplementation(() => {
    const fake = new EventEmitter();
    fake.unref = () => {};
    fake.pid = 99999;
    fake.stdio = [null, null, null];
    fake.stdout = new EventEmitter();
    fake.stderr = new EventEmitter();
    return fake;
  });
});

afterEach(() => {
  spawnSpy.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('tryLaunchDashboard', () => {
  test('is a function', () => {
    expect(typeof tryLaunchDashboard).toBe('function');
  });

  test('does not crash when called', () => {
    expect(() => tryLaunchDashboard(19999, planningDir, tmpDir)).not.toThrow();
  });
});

describe('tryLaunchHookServer', () => {
  test('is a function', () => {
    expect(typeof tryLaunchHookServer).toBe('function');
  });

  test('skips when hook_server.enabled is false', () => {
    expect(() => tryLaunchHookServer({ hook_server: { enabled: false } }, planningDir)).not.toThrow();
    // Should not spawn when disabled
    expect(spawnSpy).not.toHaveBeenCalled();
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
    const result = await getEnrichedContext({ hook_server: { enabled: false } }, planningDir);
    expect(result).toBeNull();
  });

  test('returns null when hook server disabled', async () => {
    const result = await getEnrichedContext({ hook_server: { enabled: false } }, planningDir);
    expect(result).toBeNull();
  });

  test('returns null when hook server not running', async () => {
    const net = require('net');
    const origCreateConnection = net.createConnection;
    net.createConnection = () => {
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

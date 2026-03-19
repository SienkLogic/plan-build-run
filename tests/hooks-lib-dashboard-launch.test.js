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

  test('returns null or object when config is null', async () => {
    // When config is null, getEnrichedContext tries the default port (19836).
    // If a hook server happens to be running, it returns data; otherwise null.
    const result = await getEnrichedContext(null, planningDir);
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('returns null when hook server disabled', async () => {
    const result = await getEnrichedContext({ hook_server: { enabled: false } }, planningDir);
    expect(result).toBeNull();
  });

  test('returns null when hook server not running', async () => {
    // Use a port where nothing is listening
    const result = await getEnrichedContext({ hook_server: { enabled: true, port: 19998 } }, planningDir);
    expect(result).toBeNull();
  });
});

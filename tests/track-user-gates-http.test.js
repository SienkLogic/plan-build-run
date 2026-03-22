'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../plugins/pbr/scripts/hook-logger', () => ({ logHook: jest.fn() }));

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-gate-http-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('track-user-gates handleHttp', () => {
  test('exports handleHttp function', () => {
    const { handleHttp } = require('../plugins/pbr/scripts/track-user-gates');
    expect(typeof handleHttp).toBe('function');
  });

  test('writes .user-gate-passed signal file', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'health', 'utf8');
    const { handleHttp } = require('../plugins/pbr/scripts/track-user-gates');
    const result = await handleHttp({ planningDir });
    expect(result).toBeNull();
    const signalPath = path.join(planningDir, '.user-gate-passed');
    expect(fs.existsSync(signalPath)).toBe(true);
    const signal = JSON.parse(fs.readFileSync(signalPath, 'utf8'));
    expect(signal.skill).toBe('health');
    expect(signal.tool).toBe('AskUserQuestion');
  });

  test('uses unknown skill when .active-skill missing', async () => {
    const { handleHttp } = require('../plugins/pbr/scripts/track-user-gates');
    const result = await handleHttp({ planningDir });
    expect(result).toBeNull();
    const signal = JSON.parse(fs.readFileSync(path.join(planningDir, '.user-gate-passed'), 'utf8'));
    expect(signal.skill).toBe('unknown');
  });

  test('returns null when planningDir does not exist', async () => {
    const { handleHttp } = require('../plugins/pbr/scripts/track-user-gates');
    const result = await handleHttp({ planningDir: path.join(tmpDir, 'nonexistent') });
    expect(result).toBeNull();
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { resetTracker, incrementTracker, loadTracker, TRACKER_FILE } = require('../plugins/pbr/scripts/session-tracker');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-st-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resetTracker', () => {
  test('creates tracker file', async () => {
    resetTracker(planningDir);
    const data = JSON.parse(fs.readFileSync(path.join(planningDir, TRACKER_FILE), 'utf8'));
    expect(data.phases_completed).toBe(0);
    expect(data.session_start).toBeDefined();
    expect(data.last_phase_completed).toBeNull();
  });

  test('creates tracker with sessionId (session-scoped path)', async () => {
    const sessDir = path.join(planningDir, '.sessions', 'test-sess');
    fs.mkdirSync(sessDir, { recursive: true });
    resetTracker(planningDir, 'test-sess');
    const trackerPath = path.join(sessDir, TRACKER_FILE);
    expect(fs.existsSync(trackerPath)).toBe(true);
  });
});

describe('incrementTracker', () => {
  test('increments existing tracker', async () => {
    resetTracker(planningDir);
    const count = incrementTracker(planningDir);
    expect(count).toBe(1);
  });

  test('auto-creates tracker when missing', async () => {
    const count = incrementTracker(planningDir);
    expect(count).toBe(1);
  });

  test('increments multiple times', async () => {
    resetTracker(planningDir);
    incrementTracker(planningDir);
    const count = incrementTracker(planningDir);
    expect(count).toBe(2);
  });

  test('increments with sessionId', async () => {
    const sessDir = path.join(planningDir, '.sessions', 'test-sess');
    fs.mkdirSync(sessDir, { recursive: true });
    resetTracker(planningDir, 'test-sess');
    const count = incrementTracker(planningDir, 'test-sess');
    expect(count).toBe(1);
  });
});

describe('loadTracker', () => {
  test('loads existing tracker', async () => {
    resetTracker(planningDir);
    incrementTracker(planningDir);
    const data = loadTracker(planningDir);
    expect(data).not.toBeNull();
    expect(data.phases_completed).toBe(1);
  });

  test('returns null when tracker missing', async () => {
    expect(loadTracker(planningDir)).toBeNull();
  });

  test('returns null for corrupt tracker', async () => {
    fs.writeFileSync(path.join(planningDir, TRACKER_FILE), 'not json');
    expect(loadTracker(planningDir)).toBeNull();
  });

  test('loads with sessionId', async () => {
    const sessDir = path.join(planningDir, '.sessions', 'test-sess');
    fs.mkdirSync(sessDir, { recursive: true });
    resetTracker(planningDir, 'test-sess');
    const data = loadTracker(planningDir, 'test-sess');
    expect(data).not.toBeNull();
    expect(data.phases_completed).toBe(0);
  });
});

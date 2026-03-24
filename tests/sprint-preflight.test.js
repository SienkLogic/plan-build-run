'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { shouldRunPreflight } = require('../plugins/pbr/scripts/lib/gates/sprint-preflight');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sprint-preflight-test-'));
}

function writeConfig(planningDir, config) {
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config, null, 2));
}

describe('sprint-preflight gate', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns true when features.sprint_contracts is true', () => {
    writeConfig(tmpDir, { features: { sprint_contracts: true } });
    expect(shouldRunPreflight(tmpDir)).toBe(true);
  });

  test('returns false when features.sprint_contracts is false', () => {
    writeConfig(tmpDir, { features: { sprint_contracts: false } });
    expect(shouldRunPreflight(tmpDir)).toBe(false);
  });

  test('returns true when sprint_contracts key is missing (standard harness profile default)', () => {
    // With harness-profile-aware resolution, standard profile enables sprint_contracts
    writeConfig(tmpDir, { features: { some_other_flag: true } });
    expect(shouldRunPreflight(tmpDir)).toBe(true);
  });

  test('returns true when features object is missing (standard harness profile default)', () => {
    // With harness-profile-aware resolution, standard profile enables sprint_contracts
    writeConfig(tmpDir, { version: 2 });
    expect(shouldRunPreflight(tmpDir)).toBe(true);
  });

  test('returns false when sprint_contracts missing and harness_profile is lean', () => {
    writeConfig(tmpDir, { version: 2, harness_profile: 'lean' });
    expect(shouldRunPreflight(tmpDir)).toBe(false);
  });

  test('returns false when config.json is missing (fail closed)', () => {
    // tmpDir exists but has no config.json
    expect(shouldRunPreflight(tmpDir)).toBe(false);
  });

  test('returns false when config.json is malformed', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{ invalid json !!!');
    expect(shouldRunPreflight(tmpDir)).toBe(false);
  });

  test('returns false when planningDir does not exist', () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    expect(shouldRunPreflight(nonExistent)).toBe(false);
  });

  test('returns false when sprint_contracts is a truthy string (strict check)', () => {
    writeConfig(tmpDir, { features: { sprint_contracts: 'true' } });
    expect(shouldRunPreflight(tmpDir)).toBe(false);
  });
});

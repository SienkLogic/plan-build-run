'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  configLoad: _configLoad,
  configClearCache,
  configValidate,
  DEPTH_PROFILE_DEFAULTS,
} = require('../plugins/pbr/scripts/lib/config');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-p05-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  configClearCache();
});

afterEach(() => {
  configClearCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Phase 05 feature toggles — schema validation', () => {
  test('features.decision_journal: true is valid', () => {
    const config = { features: { decision_journal: true } };
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
    const result = configValidate(planningDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('features.decision_journal: "yes" is rejected (wrong type)', () => {
    const config = { features: { decision_journal: 'yes' } };
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
    const result = configValidate(planningDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('decision_journal'))).toBe(true);
  });

  test('features.negative_knowledge: false is valid', () => {
    const config = { features: { negative_knowledge: false } };
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
    const result = configValidate(planningDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('features.living_requirements: true is valid', () => {
    const config = { features: { living_requirements: true } };
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
    const result = configValidate(planningDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('Phase 05 feature toggles — depth profile presets', () => {
  test('quick (budget) profile has decision_journal: false', () => {
    expect(DEPTH_PROFILE_DEFAULTS.quick['features.decision_journal']).toBe(false);
  });

  test('quick (budget) profile has negative_knowledge: false', () => {
    expect(DEPTH_PROFILE_DEFAULTS.quick['features.negative_knowledge']).toBe(false);
  });

  test('quick (budget) profile has living_requirements: false', () => {
    expect(DEPTH_PROFILE_DEFAULTS.quick['features.living_requirements']).toBe(false);
  });

  test('standard profile has decision_journal: true', () => {
    expect(DEPTH_PROFILE_DEFAULTS.standard['features.decision_journal']).toBe(true);
  });

  test('standard profile has negative_knowledge: true', () => {
    expect(DEPTH_PROFILE_DEFAULTS.standard['features.negative_knowledge']).toBe(true);
  });

  test('standard profile has living_requirements: true', () => {
    expect(DEPTH_PROFILE_DEFAULTS.standard['features.living_requirements']).toBe(true);
  });

  test('comprehensive (quality) profile has decision_journal: true', () => {
    expect(DEPTH_PROFILE_DEFAULTS.comprehensive['features.decision_journal']).toBe(true);
  });

  test('comprehensive (quality) profile has negative_knowledge: true', () => {
    expect(DEPTH_PROFILE_DEFAULTS.comprehensive['features.negative_knowledge']).toBe(true);
  });

  test('comprehensive (quality) profile has living_requirements: true', () => {
    expect(DEPTH_PROFILE_DEFAULTS.comprehensive['features.living_requirements']).toBe(true);
  });
});

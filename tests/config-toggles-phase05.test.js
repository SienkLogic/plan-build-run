'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  configLoad,
  configClearCache,
  configValidate,
  DEPTH_PROFILE_DEFAULTS,
} = require('../plan-build-run/bin/lib/config.cjs');

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

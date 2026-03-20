const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-health-zf-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Clear module cache between tests to get fresh requires
afterEach(() => {
  const healthPath = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'lib', 'health.js');
  delete require.cache[require.resolve(healthPath)];
});

const healthPath = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'lib', 'health.js');

describe('health-zero-friction', () => {
  describe('checkZeroFrictionHealth', () => {
    test('reports zero_friction_quick as healthy when enabled in config', () => {
      const { checkZeroFrictionHealth } = require(healthPath);
      const config = { features: { zero_friction_quick: true } };
      const result = checkZeroFrictionHealth(config);
      expect(result.feature).toBe('zero_friction_quick');
      expect(result.status).toBe('healthy');
    });

    test('reports zero_friction_quick as disabled when toggled off', () => {
      const { checkZeroFrictionHealth } = require(healthPath);
      const config = { features: { zero_friction_quick: false } };
      const result = checkZeroFrictionHealth(config);
      expect(result.feature).toBe('zero_friction_quick');
      expect(result.status).toBe('disabled');
    });

    test('reports healthy when feature flag is undefined (default true)', () => {
      const { checkZeroFrictionHealth } = require(healthPath);
      const config = { features: {} };
      const result = checkZeroFrictionHealth(config);
      expect(result.feature).toBe('zero_friction_quick');
      expect(result.status).toBe('healthy');
    });
  });

  describe('checkPostHocHealth', () => {
    test('reports post_hoc_artifacts as healthy when post-hoc.cjs module loads', () => {
      const { checkPostHocHealth } = require(healthPath);
      const config = { features: { post_hoc_artifacts: true } };
      const result = checkPostHocHealth(config);
      expect(result.feature).toBe('post_hoc_artifacts');
      expect(result.status).toBe('healthy');
    });

    test('reports post_hoc_artifacts as disabled when toggled off', () => {
      const { checkPostHocHealth } = require(healthPath);
      const config = { features: { post_hoc_artifacts: false } };
      const result = checkPostHocHealth(config);
      expect(result.feature).toBe('post_hoc_artifacts');
      expect(result.status).toBe('disabled');
    });

    test('returns detail string describing status', () => {
      const { checkPostHocHealth } = require(healthPath);
      const config = { features: { post_hoc_artifacts: true } };
      const result = checkPostHocHealth(config);
      expect(result).toHaveProperty('detail');
      expect(typeof result.detail).toBe('string');
      expect(result.detail.length).toBeGreaterThan(0);
    });
  });

  describe('getZeroFrictionHealthReport', () => {
    test('returns array with both feature checks', () => {
      const { getZeroFrictionHealthReport } = require(healthPath);
      const config = { features: { zero_friction_quick: true, post_hoc_artifacts: true } };
      const report = getZeroFrictionHealthReport(config);
      expect(Array.isArray(report)).toBe(true);
      expect(report).toHaveLength(2);
      expect(report.map(r => r.feature)).toContain('zero_friction_quick');
      expect(report.map(r => r.feature)).toContain('post_hoc_artifacts');
    });
  });
});

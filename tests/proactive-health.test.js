/**
 * tests/proactive-health.test.js — Tests for Phase 9 feature health checks.
 *
 * Validates that each Phase 9 feature reports healthy/disabled/degraded
 * based on config toggles and module availability.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let checkFeatureHealth;

beforeAll(() => {
  checkFeatureHealth = require('../plugins/pbr/scripts/lib/health').checkFeatureHealth;
});

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-health-'));
}

describe('checkFeatureHealth', () => {
  const PHASE9_FEATURES = [
    'smart_next_task',
    'dependency_break_detection',
    'pre_research',
    'pattern_routing',
    'tech_debt_surfacing'
  ];

  test('all 5 Phase 9 features have health entries', async () => {
    // Each feature should produce a result when checked
    const config = { features: {} };
    // All features enabled by default (true when absent)
    const results = PHASE9_FEATURES.map(name =>
      checkFeatureHealth(name, config, __dirname)
    );

    expect(results.length).toBe(5);
    for (const result of results) {
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('status');
      expect(['healthy', 'degraded', 'disabled']).toContain(result.status);
    }
  });

  test('reports healthy when feature enabled and module loadable', async () => {
    // tech_debt_surfacing should be healthy because the module exists in this repo
    const config = { features: { tech_debt_surfacing: true } };
    const scriptsDir = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts');
    const result = checkFeatureHealth('tech_debt_surfacing', config, scriptsDir);

    expect(result.name).toBe('tech_debt_surfacing');
    expect(result.status).toBe('healthy');
  });

  test('reports degraded when feature enabled but module missing', async () => {
    const tmp = makeTmpDir();
    try {
      // Point to a dir where no modules exist
      const config = { features: { smart_next_task: true } };
      const result = checkFeatureHealth('smart_next_task', config, tmp);

      expect(result.name).toBe('smart_next_task');
      expect(result.status).toBe('degraded');
      expect(result.reason).toMatch(/not found|cannot find/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('reports disabled when feature is toggled off', async () => {
    const config = { features: { pattern_routing: false } };
    const result = checkFeatureHealth('pattern_routing', config, __dirname);

    expect(result.name).toBe('pattern_routing');
    expect(result.status).toBe('disabled');
  });

  test('treats missing feature config as enabled (default true)', async () => {
    // Feature not in config.features at all -> defaults to enabled
    const config = { features: {} };
    const scriptsDir = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts');
    const result = checkFeatureHealth('tech_debt_surfacing', config, scriptsDir);

    expect(result.status).toBe('healthy');
  });

  test('health output includes feature name and status string', async () => {
    const config = { features: { pre_research: false } };
    const result = checkFeatureHealth('pre_research', config, __dirname);

    expect(typeof result.name).toBe('string');
    expect(typeof result.status).toBe('string');
    expect(result.name).toBe('pre_research');
  });
});

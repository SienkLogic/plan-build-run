/**
 * Tests for Phase 4 health checks: NL routing and adaptive ceremony features.
 * Plan 04-06-T1.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Dynamically resolve verify.cjs path
const verifyPath = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'lib', 'verify.js');

function makeTmpDir(configOverrides, _options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-hc4-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  if (configOverrides !== undefined) {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify(configOverrides, null, 2)
    );
  }

  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// The plugin root where scripts/intent-router.cjs and scripts/risk-classifier.cjs live
const pluginRoot = path.join(__dirname, '..', 'plugins', 'pbr');

describe('natural_language_routing health', () => {
  let checkNLRoutingHealth;

  beforeAll(() => {
    const verify = require(verifyPath);
    checkNLRoutingHealth = verify.checkNLRoutingHealth;
  });

  test('when feature enabled and intent-router.cjs loadable -> status: healthy', async () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
    const result = checkNLRoutingHealth(planningDir, pluginRoot);
    expect(result.feature).toBe('natural_language_routing');
    expect(result.status).toBe('healthy');
    cleanup(tmpDir);
  });

  test('when feature disabled -> status: disabled', async () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: false } });
    const result = checkNLRoutingHealth(planningDir, pluginRoot);
    expect(result.feature).toBe('natural_language_routing');
    expect(result.status).toBe('disabled');
    cleanup(tmpDir);
  });

  test('when feature enabled but intent-router.cjs missing -> status: degraded', async () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
    // Use a nonexistent plugin root so the module can't be found
    const result = checkNLRoutingHealth(planningDir, path.join(tmpDir, 'nonexistent'));
    expect(result.feature).toBe('natural_language_routing');
    expect(result.status).toBe('degraded');
    expect(result.details).toBeDefined();
    cleanup(tmpDir);
  });
});

describe('adaptive_ceremony health', () => {
  let checkAdaptiveCeremonyHealth;

  beforeAll(() => {
    const verify = require(verifyPath);
    checkAdaptiveCeremonyHealth = verify.checkAdaptiveCeremonyHealth;
  });

  test('when feature enabled and risk-classifier.cjs loadable -> status: healthy', async () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { adaptive_ceremony: true } });
    const result = checkAdaptiveCeremonyHealth(planningDir, pluginRoot);
    expect(result.feature).toBe('adaptive_ceremony');
    expect(result.status).toBe('healthy');
    cleanup(tmpDir);
  });

  test('when feature disabled -> status: disabled', async () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { adaptive_ceremony: false } });
    const result = checkAdaptiveCeremonyHealth(planningDir, pluginRoot);
    expect(result.feature).toBe('adaptive_ceremony');
    expect(result.status).toBe('disabled');
    cleanup(tmpDir);
  });

  test('when feature enabled but risk-classifier.cjs missing -> status: degraded', async () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { adaptive_ceremony: true } });
    const result = checkAdaptiveCeremonyHealth(planningDir, path.join(tmpDir, 'nonexistent'));
    expect(result.feature).toBe('adaptive_ceremony');
    expect(result.status).toBe('degraded');
    expect(result.details).toBeDefined();
    cleanup(tmpDir);
  });
});

describe('return shape', () => {
  let checkNLRoutingHealth, checkAdaptiveCeremonyHealth;

  beforeAll(() => {
    const verify = require(verifyPath);
    checkNLRoutingHealth = verify.checkNLRoutingHealth;
    checkAdaptiveCeremonyHealth = verify.checkAdaptiveCeremonyHealth;
  });

  test('NL routing health check returns { feature, status, details }', () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
    const result = checkNLRoutingHealth(planningDir, pluginRoot);
    expect(result).toHaveProperty('feature');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('details');
    cleanup(tmpDir);
  });

  test('adaptive ceremony health check returns { feature, status, details }', () => {
    const { tmpDir, planningDir } = makeTmpDir({ features: { adaptive_ceremony: true } });
    const result = checkAdaptiveCeremonyHealth(planningDir, pluginRoot);
    expect(result).toHaveProperty('feature');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('details');
    cleanup(tmpDir);
  });
});

/**
 * Tests for trust tracking health checks in pbr-tools.cjs validate health.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pbrTools = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pbr-tools.js');

function makeTempProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-health-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  // Minimal required files for validate health to not error on E001-E004
  fs.writeFileSync(path.join(planningDir, 'PROJECT.md'), '## What This Is\nTest\n## Core Value\nTest\n## Requirements\nTest\n');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n');
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ model_profile: 'balanced' }));
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  return tmp;
}

function runHealth(projectDir) {
  const result = execFileSync('node', [pbrTools, 'validate', 'health', '--raw'], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
  });
  return JSON.parse(result.trim());
}

describe('trust tracking health check', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('validate health returns phase10 array (trust/confidence checks removed with legacy lib)', () => {
    const result = runHealth(tmpDir);
    // After legacy bin/lib/ deletion, validate health only returns phase10 checks
    expect(result.phase10).toBeDefined();
    expect(Array.isArray(result.phase10)).toBe(true);
    expect(result.timestamp).toBeDefined();
  });

  test.skip('trust_tracking info codes removed — were in legacy bin/lib/', () => {
    // I-TRUST-DISABLED, I-TRUST-HEALTHY, I-TRUST-DEGRADED codes
    // were removed with plan-build-run/bin/lib/ deletion
  });
});

describe('confidence_calibration health check', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test.skip('confidence_calibration info codes removed — were in legacy bin/lib/', () => {
    // I-CONFIDENCE-DISABLED, I-CONFIDENCE-HEALTHY, I-CONFIDENCE-DEGRADED codes
    // were removed with plan-build-run/bin/lib/ deletion
  });
});

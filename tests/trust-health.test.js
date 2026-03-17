/**
 * Tests for trust tracking health checks in pbr-tools.cjs validate health.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pbrTools = path.join(__dirname, '..', 'plan-build-run', 'bin', 'pbr-tools.cjs');

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

  test('returns trust_tracking disabled when config toggle is false', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.features = { trust_tracking: false };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = runHealth(tmpDir);
    const trustInfo = result.info.find(i => i.code === 'I-TRUST-DISABLED');
    expect(trustInfo).toBeDefined();
    expect(trustInfo.message).toMatch(/trust_tracking.*disabled/i);
  });

  test('returns trust_tracking healthy when agent-scores.json has data', () => {
    const trustDir = path.join(tmpDir, '.planning', 'trust');
    fs.mkdirSync(trustDir, { recursive: true });
    const scores = {
      executor: { build: { pass: 5, fail: 1, rate: 0.833 } },
      verifier: { lint: { pass: 3, fail: 0, rate: 1.0 } }
    };
    fs.writeFileSync(path.join(trustDir, 'agent-scores.json'), JSON.stringify(scores));

    const result = runHealth(tmpDir);
    const trustInfo = result.info.find(i => i.code === 'I-TRUST-HEALTHY');
    expect(trustInfo).toBeDefined();
    expect(trustInfo.message).toMatch(/healthy/i);
    expect(trustInfo.message).toMatch(/2 agents/i);
    expect(trustInfo.message).toMatch(/9 outcomes/i);
  });

  test('returns trust_tracking degraded when agent-scores.json is missing but feature enabled', () => {
    // feature enabled by default (no features key or features.trust_tracking not false)
    const result = runHealth(tmpDir);
    const trustInfo = result.info.find(i => i.code === 'I-TRUST-DEGRADED');
    expect(trustInfo).toBeDefined();
    expect(trustInfo.message).toMatch(/degraded/i);
    expect(trustInfo.message).toMatch(/agent-scores\.json missing/i);
  });

  test('returns trust_tracking degraded when agent-scores.json is malformed', () => {
    const trustDir = path.join(tmpDir, '.planning', 'trust');
    fs.mkdirSync(trustDir, { recursive: true });
    fs.writeFileSync(path.join(trustDir, 'agent-scores.json'), 'not valid json{{{');

    const result = runHealth(tmpDir);
    const trustInfo = result.info.find(i => i.code === 'I-TRUST-DEGRADED');
    expect(trustInfo).toBeDefined();
    expect(trustInfo.message).toMatch(/malformed/i);
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

  test('returns confidence_calibration disabled when config toggle is false', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.features = { confidence_calibration: false };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = runHealth(tmpDir);
    const confInfo = result.info.find(i => i.code === 'I-CONFIDENCE-DISABLED');
    expect(confInfo).toBeDefined();
    expect(confInfo.message).toMatch(/confidence_calibration.*disabled/i);
  });

  test('returns confidence_calibration healthy when trust data exists', () => {
    const trustDir = path.join(tmpDir, '.planning', 'trust');
    fs.mkdirSync(trustDir, { recursive: true });
    fs.writeFileSync(path.join(trustDir, 'agent-scores.json'), JSON.stringify({
      executor: { build: { pass: 2, fail: 0, rate: 1.0 } }
    }));

    const result = runHealth(tmpDir);
    const confInfo = result.info.find(i => i.code === 'I-CONFIDENCE-HEALTHY');
    expect(confInfo).toBeDefined();
    expect(confInfo.message).toMatch(/healthy/i);
  });

  test('returns confidence_calibration degraded when no trust data', () => {
    const result = runHealth(tmpDir);
    const confInfo = result.info.find(i => i.code === 'I-CONFIDENCE-DEGRADED');
    expect(confInfo).toBeDefined();
    expect(confInfo.message).toMatch(/degraded/i);
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// Import the validator function and map
const { checkUserGateCompliance, SKILLS_REQUIRING_GATES } = require('../plugins/pbr/scripts/lib/subagent-validators');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-gate-test-'));
}

describe('track-user-gates.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes signal file when .planning/ exists', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'health', 'utf8');

    const scriptPath = path.resolve(__dirname, '..', 'plugins', 'pbr', 'scripts', 'track-user-gates.js');

    execFileSync('node', [scriptPath], {
      cwd: tmpDir,
      input: '{}',
      env: { ...process.env, PBR_PROJECT_ROOT: tmpDir, PBR_LOG_DIR: path.join(tmpDir, 'logs') },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const signalPath = path.join(planningDir, '.user-gate-passed');
    expect(fs.existsSync(signalPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(signalPath, 'utf8'));
    expect(data.skill).toBe('health');
    expect(data.tool).toBe('AskUserQuestion');
    expect(data.timestamp).toBeDefined();
  });

  test('exits cleanly when .planning/ does not exist', () => {
    const scriptPath = path.resolve(__dirname, '..', 'plugins', 'pbr', 'scripts', 'track-user-gates.js');

    // Should not throw
    expect(() => {
      execFileSync('node', [scriptPath], {
        cwd: tmpDir,
        input: '{}',
        env: { ...process.env, PBR_PROJECT_ROOT: tmpDir, PBR_LOG_DIR: path.join(tmpDir, 'logs') },
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }).not.toThrow();

    // No signal file should exist
    const signalPath = path.join(tmpDir, '.planning', '.user-gate-passed');
    expect(fs.existsSync(signalPath)).toBe(false);
  });
});

describe('checkUserGateCompliance', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns warning for gate-requiring skill without signal', () => {
    const result = checkUserGateCompliance(planningDir, 'health');
    expect(result).not.toBeNull();
    expect(result).toContain("Skill 'health'");
    expect(result).toContain('without any AskUserQuestion calls');
  });

  test('returns null for skill with matching signal present', () => {
    const signalPath = path.join(planningDir, '.user-gate-passed');
    fs.writeFileSync(signalPath, JSON.stringify({
      skill: 'health',
      timestamp: new Date().toISOString(),
      tool: 'AskUserQuestion'
    }), 'utf8');

    const result = checkUserGateCompliance(planningDir, 'health');
    expect(result).toBeNull();

    // Signal file should be cleaned up
    expect(fs.existsSync(signalPath)).toBe(false);
  });

  test('returns null for non-gate skill', () => {
    const result = checkUserGateCompliance(planningDir, 'status');
    expect(result).toBeNull();
  });

  test('returns null for empty/undefined skill name', () => {
    expect(checkUserGateCompliance(planningDir, '')).toBeNull();
    expect(checkUserGateCompliance(planningDir, undefined)).toBeNull();
  });

  test('returns warning when signal has different skill name', () => {
    const signalPath = path.join(planningDir, '.user-gate-passed');
    fs.writeFileSync(signalPath, JSON.stringify({
      skill: 'discuss',
      timestamp: new Date().toISOString(),
      tool: 'AskUserQuestion'
    }), 'utf8');

    const result = checkUserGateCompliance(planningDir, 'health');
    expect(result).not.toBeNull();
    expect(result).toContain("Skill 'health'");
  });

  test('SKILLS_REQUIRING_GATES includes expected skills', () => {
    expect(SKILLS_REQUIRING_GATES).toHaveProperty('health');
    expect(SKILLS_REQUIRING_GATES).toHaveProperty('milestone');
    expect(SKILLS_REQUIRING_GATES).toHaveProperty('import');
    expect(SKILLS_REQUIRING_GATES).toHaveProperty('review');
    expect(SKILLS_REQUIRING_GATES).toHaveProperty('discuss');
    expect(SKILLS_REQUIRING_GATES).toHaveProperty('build');
  });
});

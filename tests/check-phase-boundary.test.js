const { getEnforceSetting } = require('../plugins/pbr/scripts/check-phase-boundary');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-phase-boundary.js');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-cpb-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runScript(tmpDir, toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('check-phase-boundary.js', () => {
  describe('getEnforceSetting', () => {
    test('returns false when no config', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(getEnforceSetting(planningDir)).toBe(false);
      cleanup(tmpDir);
    });

    test('returns false when safety not configured', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{"depth": "standard"}');
      expect(getEnforceSetting(planningDir)).toBe(false);
      cleanup(tmpDir);
    });

    test('returns true when enforce_phase_boundaries is true', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
      expect(getEnforceSetting(planningDir)).toBe(true);
      cleanup(tmpDir);
    });

    test('returns false when enforce_phase_boundaries is false', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ safety: { enforce_phase_boundaries: false } }));
      expect(getEnforceSetting(planningDir)).toBe(false);
      cleanup(tmpDir);
    });
  });

  describe('hook execution', () => {
    test('exits 0 for non-phase files', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'src', 'index.ts') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('exits 0 for same-phase writes', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const filePath = path.join(phasesDir, '02-auth', 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });

    test('warns on cross-phase write (default config)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const filePath = path.join(phasesDir, '04-dashboard', 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      if (result.output) {
        const parsed = JSON.parse(result.output);
        expect(parsed.additionalContext).toContain('phase 4');
        expect(parsed.additionalContext).toContain('current phase is 2');
      }
      cleanup(tmpDir);
    });

    test('blocks cross-phase write when enforcement is on', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const filePath = path.join(phasesDir, '04-dashboard', 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('phase 4');
      cleanup(tmpDir);
    });

    test('exits 0 when no STATE.md', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const filePath = path.join(phasesDir, '04-dashboard', 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      cleanup(tmpDir);
    });
  });
});

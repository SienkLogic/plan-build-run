const { getEnforceSetting } = require('../plugins/pbr/scripts/check-phase-boundary');
const { createRunner, createTmpPlanning, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-phase-boundary.js');
const _run = createRunner(SCRIPT);
const runScript = (cwd, toolInput) => _run({ tool_input: toolInput }, { cwd });

describe('check-phase-boundary.js', () => {
  describe('getEnforceSetting', () => {
    test('returns false when no config', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      expect(getEnforceSetting(planningDir)).toBe(false);
      cleanupTmp(tmpDir);
    });

    test('returns false when safety not configured', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{"depth": "standard"}');
      expect(getEnforceSetting(planningDir)).toBe(false);
      cleanupTmp(tmpDir);
    });

    test('returns true when enforce_phase_boundaries is true', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
      expect(getEnforceSetting(planningDir)).toBe(true);
      cleanupTmp(tmpDir);
    });

    test('returns false when enforce_phase_boundaries is false', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ safety: { enforce_phase_boundaries: false } }));
      expect(getEnforceSetting(planningDir)).toBe(false);
      cleanupTmp(tmpDir);
    });
  });

  describe('hook execution', () => {
    test('exits 0 for non-phase files', () => {
      const { tmpDir } = createTmpPlanning();
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'src', 'index.ts') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('exits 0 for same-phase writes', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const filePath = path.join(phasesDir, '02-auth', 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('warns on cross-phase write (default config)', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
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
      cleanupTmp(tmpDir);
    });

    test('blocks cross-phase write when enforcement is on', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
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
      cleanupTmp(tmpDir);
    });

    test('exits 0 when no STATE.md', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const phasesDir = path.join(planningDir, 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      const filePath = path.join(phasesDir, '04-dashboard', 'PLAN.md');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });
});

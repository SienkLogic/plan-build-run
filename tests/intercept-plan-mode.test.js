'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'intercept-plan-mode.js');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-ipm-'));
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runScript(tmpDir, stdinData = '') {
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: stdinData,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: result, stderr: '' };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

describe('intercept-plan-mode.js', () => {
  describe('non-PBR project (no .planning directory)', () => {
    test('exits 0 when .planning dir does not exist', () => {
      const tmpDir = makeTmpDir();
      try {
        const result = runScript(tmpDir);
        expect(result.exitCode).toBe(0);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('produces no JSON output for non-PBR project', () => {
      const tmpDir = makeTmpDir();
      try {
        const result = runScript(tmpDir);
        expect(result.stdout).toBe('');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('handles empty stdin in non-PBR project without crashing', () => {
      const tmpDir = makeTmpDir();
      try {
        const result = runScript(tmpDir, '');
        expect(result.exitCode).toBe(0);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('PBR project (has .planning directory)', () => {
    test('exits 2 when .planning dir exists', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir);
        expect(result.exitCode).toBe(2);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('outputs decision:block JSON for PBR project', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.decision).toBe('block');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('block reason mentions /pbr:plan alternative', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.reason).toContain('/pbr:plan');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('block reason mentions Plan-Build-Run project context', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.reason).toContain('Plan-Build-Run');
      } finally {
        cleanup(tmpDir);
      }
    });

    test('handles empty stdin in PBR project without crashing', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir, '');
        expect(result.exitCode).toBe(2);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('handles arbitrary stdin data without crashing', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir, JSON.stringify({ tool_name: 'EnterPlanMode', tool_input: {} }));
        expect(result.exitCode).toBe(2);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.decision).toBe('block');
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('output format validation', () => {
    test('stdout is valid JSON for PBR project', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      } finally {
        cleanup(tmpDir);
      }
    });

    test('JSON output has both decision and reason fields', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed).toHaveProperty('decision');
        expect(parsed).toHaveProperty('reason');
      } finally {
        cleanup(tmpDir);
      }
    });
  });
});

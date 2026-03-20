'use strict';

const { createRunner, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'intercept-plan-mode.js');
const _run = createRunner(SCRIPT);

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-ipm-'));
}

function runScript(tmpDir, stdinData = '') {
  const { exitCode, output } = _run(stdinData || undefined, { cwd: tmpDir });
  return { exitCode, stdout: output, stderr: '' };
}

describe('intercept-plan-mode.js', () => {
  describe('non-PBR project (no .planning directory)', () => {
    test('exits 0 when .planning dir does not exist', () => {
      const tmpDir = makeTmpDir();
      try {
        const result = runScript(tmpDir);
        expect(result.exitCode).toBe(0);
      } finally {
        cleanupTmp(tmpDir);
      }
    });

    test('produces no JSON output for non-PBR project', () => {
      const tmpDir = makeTmpDir();
      try {
        const result = runScript(tmpDir);
        expect(result.stdout).toBe('');
      } finally {
        cleanupTmp(tmpDir);
      }
    });

    test('handles empty stdin in non-PBR project without crashing', () => {
      const tmpDir = makeTmpDir();
      try {
        const result = runScript(tmpDir, '');
        expect(result.exitCode).toBe(0);
      } finally {
        cleanupTmp(tmpDir);
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
        cleanupTmp(tmpDir);
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
        cleanupTmp(tmpDir);
      }
    });

    test('block reason mentions /pbr:plan-phase alternative', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.reason).toContain('/pbr:plan-phase');
      } finally {
        cleanupTmp(tmpDir);
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
        cleanupTmp(tmpDir);
      }
    });

    test('handles empty stdin in PBR project without crashing', () => {
      const tmpDir = makeTmpDir();
      try {
        fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
        const result = runScript(tmpDir, '');
        expect(result.exitCode).toBe(2);
      } finally {
        cleanupTmp(tmpDir);
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
        cleanupTmp(tmpDir);
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
        cleanupTmp(tmpDir);
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
        cleanupTmp(tmpDir);
      }
    });
  });
});

const { checkCompaction, loadCounter, saveCounter, getThreshold, resetCounter, DEFAULT_THRESHOLD, REMINDER_INTERVAL } = require('../plugins/dev/scripts/suggest-compact');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'suggest-compact.js');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-sc-'));
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
      input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('suggest-compact.js', () => {
  describe('loadCounter', () => {
    test('returns zeroed counter when file does not exist', () => {
      const counter = loadCounter('/nonexistent/.compact-counter');
      expect(counter.count).toBe(0);
      expect(counter.lastSuggested).toBe(0);
    });

    test('loads existing counter', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, JSON.stringify({ count: 42, lastSuggested: 0 }));
      const counter = loadCounter(counterPath);
      expect(counter.count).toBe(42);
      expect(counter.lastSuggested).toBe(0);
      cleanup(tmpDir);
    });

    test('handles malformed JSON gracefully', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, 'not json');
      const counter = loadCounter(counterPath);
      expect(counter.count).toBe(0);
      cleanup(tmpDir);
    });
  });

  describe('saveCounter', () => {
    test('writes counter to file', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: 10, lastSuggested: 0 });
      const data = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
      expect(data.count).toBe(10);
      cleanup(tmpDir);
    });
  });

  describe('getThreshold', () => {
    test('returns default when no config.json', () => {
      const { tmpDir } = makeTmpDir();
      expect(getThreshold(tmpDir)).toBe(DEFAULT_THRESHOLD);
      cleanup(tmpDir);
    });

    test('returns default when no hooks.compactThreshold in config', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{"depth": "standard"}');
      expect(getThreshold(tmpDir)).toBe(DEFAULT_THRESHOLD);
      cleanup(tmpDir);
    });

    test('returns configured threshold', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { compactThreshold: 30 } }));
      expect(getThreshold(tmpDir)).toBe(30);
      cleanup(tmpDir);
    });
  });

  describe('resetCounter', () => {
    test('deletes counter file', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, JSON.stringify({ count: 99, lastSuggested: 50 }));
      resetCounter(planningDir);
      expect(fs.existsSync(counterPath)).toBe(false);
      cleanup(tmpDir);
    });

    test('does not throw when file does not exist', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(() => resetCounter(planningDir)).not.toThrow();
      cleanup(tmpDir);
    });
  });

  describe('checkCompaction', () => {
    test('returns null below threshold', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = checkCompaction(planningDir, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('increments counter each call', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      checkCompaction(planningDir, tmpDir);
      checkCompaction(planningDir, tmpDir);
      checkCompaction(planningDir, tmpDir);
      const counter = loadCounter(path.join(planningDir, '.compact-counter'));
      expect(counter.count).toBe(3);
      cleanup(tmpDir);
    });

    test('suggests at threshold', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // Pre-seed counter just below threshold
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget]');
      expect(result.additionalContext).toContain(`${DEFAULT_THRESHOLD}`);
      expect(result.additionalContext).toContain('/compact');
      cleanup(tmpDir);
    });

    test('does not re-suggest immediately after first suggestion', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const counterPath = path.join(planningDir, '.compact-counter');
      // Set counter at threshold with lastSuggested already set
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD, lastSuggested: DEFAULT_THRESHOLD });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('re-suggests after reminder interval', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const counterPath = path.join(planningDir, '.compact-counter');
      // Set counter at threshold + REMINDER_INTERVAL - 1 (one call away from re-suggestion)
      const count = DEFAULT_THRESHOLD + REMINDER_INTERVAL - 1;
      saveCounter(counterPath, { count, lastSuggested: DEFAULT_THRESHOLD });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget]');
      cleanup(tmpDir);
    });

    test('uses configured threshold', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // Set low threshold
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { compactThreshold: 5 } }));
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: 4, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('5 tool calls');
      expect(result.additionalContext).toContain('threshold: 5');
      cleanup(tmpDir);
    });
  });

  describe('hook execution', () => {
    test('exits 0 silently below threshold', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'app.js') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('exits 0 when not a Towline project', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-sc-noplan-'));
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'app.js') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('outputs suggestion at threshold', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'app.js') });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.output);
      expect(parsed.additionalContext).toContain('[Context Budget]');
      expect(parsed.additionalContext).toContain('/compact');
      cleanup(tmpDir);
    });

    test('handles malformed JSON input gracefully', () => {
      const { tmpDir } = makeTmpDir();
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: 'not json',
          encoding: 'utf8',
          timeout: 5000,
          cwd: tmpDir,
        });
        expect(result).toBeDefined();
      } catch (e) {
        expect(e.status).toBe(0);
      }
      cleanup(tmpDir);
    });
  });
});

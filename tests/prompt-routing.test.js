const { createRunner, createTmpPlanning, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { analyzePrompt, handleHttp, INTENT_PATTERNS } = require('../hooks/prompt-routing');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'prompt-routing.js');
const _run = createRunner(SCRIPT);
const runScript = (cwd, data) => _run(data, { cwd });

function makeTmpDir() {
  const { tmpDir, planningDir } = createTmpPlanning();
  // analyzePrompt requires STATE.md to exist
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nstatus: executing\n---\n');
  return { tmpDir, planningDir };
}

describe('prompt-routing.js', () => {
  describe('INTENT_PATTERNS', () => {
    test('exports an array of intent patterns', () => {
      expect(Array.isArray(INTENT_PATTERNS)).toBe(true);
      expect(INTENT_PATTERNS.length).toBeGreaterThan(0);
    });

    test('each pattern has pattern, command, and hint', () => {
      for (const intent of INTENT_PATTERNS) {
        expect(intent.pattern).toBeInstanceOf(RegExp);
        expect(typeof intent.command).toBe('string');
        expect(typeof intent.hint).toBe('string');
      }
    });
  });

  describe('analyzePrompt', () => {
    test('returns null for null/undefined/empty prompt', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt(null, planningDir)).toBeNull();
      expect(analyzePrompt(undefined, planningDir)).toBeNull();
      expect(analyzePrompt('', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null for non-string prompt', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt(123, planningDir)).toBeNull();
      expect(analyzePrompt({}, planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null for slash commands', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt('/pbr:do something here', planningDir)).toBeNull();
      expect(analyzePrompt('/help me with this task', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null for short prompts (< 15 chars)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt('yes', planningDir)).toBeNull();
      expect(analyzePrompt('ok do it', planningDir)).toBeNull();
      expect(analyzePrompt('3', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null when .planning dir does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pr-noplan-'));
      const planningDir = path.join(tmpDir, '.planning');
      expect(analyzePrompt('There is a bug in the authentication module', planningDir)).toBeNull();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns null when STATE.md does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pr-nostate-'));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      // No STATE.md
      expect(analyzePrompt('There is a bug in the authentication module', planningDir)).toBeNull();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('detects bug/error intent and suggests /pbr:debug', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('There is a bug in the authentication module', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      cleanupTmp(tmpDir);
    });

    test('detects error keywords', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const keywords = ['there is an error in the login flow', 'the app has a crash on every startup', 'got an exception from the API call', 'this feature is broken badly'];
      for (const prompt of keywords) {
        const result = analyzePrompt(prompt, planningDir);
        expect(result).not.toBeNull();
        expect(result.command).toBe('/pbr:debug');
      }
      cleanupTmp(tmpDir);
    });

    test('detects status/progress intent and suggests /pbr:progress', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('what is the current status of the project', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:progress');
      cleanupTmp(tmpDir);
    });

    test('detects exploration intent and suggests /pbr:explore', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('how should we handle the caching layer', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:explore');
      cleanupTmp(tmpDir);
    });

    test('detects refactor/architecture intent and suggests /pbr:plan-phase add', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('we need to refactor the entire database layer', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:plan-phase add');
      cleanupTmp(tmpDir);
    });

    test('detects generic task intent and suggests /pbr:do', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('add a new endpoint for user preferences', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:do');
      cleanupTmp(tmpDir);
    });

    test('returns null for prompts that match no pattern', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('the sky is blue and water is wet today', planningDir);
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('first matching pattern wins (bug beats generic task)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // "fix" matches generic task but "broken" matches bug — bug is first
      const result = analyzePrompt('the build is broken and we need to fix it now', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      cleanupTmp(tmpDir);
    });
  });

  describe('handleHttp', () => {
    test('returns suggestion for matching prompt', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = handleHttp({
        data: { prompt: 'there is a bug in the payment module right now' },
        planningDir
      });
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('/pbr:debug');
      expect(result.additionalContext).toContain('[pbr]');
      cleanupTmp(tmpDir);
    });

    test('returns null for non-matching prompt', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = handleHttp({
        data: { prompt: 'the sky is blue and water is wet today' },
        planningDir
      });
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('handles missing data gracefully', () => {
      const result = handleHttp({});
      expect(result).toBeNull();
    });

    test('uses user_prompt fallback field', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = handleHttp({
        data: { user_prompt: 'there is a crash in the application right now' },
        planningDir
      });
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('/pbr:debug');
      cleanupTmp(tmpDir);
    });
  });

  describe('hook execution', () => {
    test('exits 0 with matching prompt', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, {
        prompt: 'there is a bug in the login flow right now'
      });
      expect(result.exitCode).toBe(0);
      if (result.output) {
        const parsed = JSON.parse(result.output);
        expect(parsed.additionalContext).toContain('/pbr:debug');
      }
      cleanupTmp(tmpDir);
    });

    test('exits 0 with non-matching prompt', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, {
        prompt: 'the sky is blue and water is wet today'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('exits 0 with empty input', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, {});
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('exits 0 when not a PBR project', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pr-noplan-'));
      const result = runScript(tmpDir, { prompt: 'there is a bug here right now' });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('exits 0 with malformed JSON input', () => {
      const { tmpDir } = makeTmpDir();
      const result = _run('not json', { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });
});

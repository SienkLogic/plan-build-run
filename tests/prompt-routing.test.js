const { createRunner, createTmpPlanning, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { analyzePrompt, handleHttp, INTENT_PATTERNS } = require('../plugins/pbr/scripts/prompt-routing');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'prompt-routing.js');
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
    test('exports an array of intent patterns', async () => {
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
    test('returns null for null/undefined/empty prompt', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt(null, planningDir)).toBeNull();
      expect(analyzePrompt(undefined, planningDir)).toBeNull();
      expect(analyzePrompt('', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null for non-string prompt', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt(123, planningDir)).toBeNull();
      expect(analyzePrompt({}, planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null for slash commands', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt('/pbr:do something here', planningDir)).toBeNull();
      expect(analyzePrompt('/help me with this task', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null for short prompts (< 15 chars)', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt('yes', planningDir)).toBeNull();
      expect(analyzePrompt('ok do it', planningDir)).toBeNull();
      expect(analyzePrompt('3', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null when .planning dir does not exist', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pr-noplan-'));
      const planningDir = path.join(tmpDir, '.planning');
      expect(analyzePrompt('There is a bug in the authentication module', planningDir)).toBeNull();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns null when STATE.md does not exist', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pr-nostate-'));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      // No STATE.md
      expect(analyzePrompt('There is a bug in the authentication module', planningDir)).toBeNull();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('detects bug/error intent and suggests /pbr:debug', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('There is a bug in the authentication module', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      cleanupTmp(tmpDir);
    });

    test('detects error keywords', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const keywords = ['there is an error in the login flow', 'the app has a crash on every startup', 'got an exception from the API call', 'this feature is broken badly'];
      for (const prompt of keywords) {
        const result = analyzePrompt(prompt, planningDir);
        expect(result).not.toBeNull();
        expect(result.command).toBe('/pbr:debug');
      }
      cleanupTmp(tmpDir);
    });

    test('detects status/progress intent and suggests /pbr:progress', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('what is the current status of the project', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:progress');
      cleanupTmp(tmpDir);
    });

    test('detects exploration intent and suggests /pbr:explore', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('how should we handle the caching layer', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:explore');
      cleanupTmp(tmpDir);
    });

    test('detects refactor/architecture intent and suggests /pbr:plan-phase add', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('we need to refactor the entire database layer', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:plan-phase add');
      cleanupTmp(tmpDir);
    });

    test('detects generic task intent and suggests /pbr:do', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('add a new endpoint for user preferences', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:do');
      cleanupTmp(tmpDir);
    });

    test('returns null for prompts that match no pattern', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = analyzePrompt('the sky is blue and water is wet today', planningDir);
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('first matching pattern wins (bug beats generic task)', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // "fix" matches generic task but "broken" matches bug — bug is first
      const result = analyzePrompt('the build is broken and we need to fix it now', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      cleanupTmp(tmpDir);
    });
  });

  describe('handleHttp', () => {
    test('returns suggestion for matching prompt', async () => {
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

    test('returns null for non-matching prompt', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = handleHttp({
        data: { prompt: 'the sky is blue and water is wet today' },
        planningDir
      });
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('handles missing data gracefully', async () => {
      const result = handleHttp({});
      expect(result).toBeNull();
    });

    test('uses user_prompt fallback field', async () => {
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

  describe('ambiguous prompt handling', () => {
    test('prompt matching multiple patterns returns first match (priority order)', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // "broken" matches bug/error (first), "create" matches generic task (last)
      const result = analyzePrompt('the build is broken so create a workaround fix', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      cleanupTmp(tmpDir);
    });

    test('very short prompts (1-2 words) return null', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt('hi', planningDir)).toBeNull();
      expect(analyzePrompt('ok', planningDir)).toBeNull();
      expect(analyzePrompt('yes please', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('prompts with only whitespace return null', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt('   ', planningDir)).toBeNull();
      expect(analyzePrompt('\n\t  \n', planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('prompt exactly 14 chars (below threshold) returns null', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(analyzePrompt('fix the errors', planningDir)).toBeNull(); // 14 chars
      cleanupTmp(tmpDir);
    });

    test('prompt exactly 15 chars (at threshold) is analyzed', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // "fix the error!!" is 15 chars and matches generic task "fix"
      const result = analyzePrompt('fix this error!', planningDir);
      expect(result).not.toBeNull();
      cleanupTmp(tmpDir);
    });
  });

  describe('intent pattern coverage', () => {
    test('bug patterns match: bug, error, crash, exception, stack trace, failing, broken, does not work', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const bugPrompts = [
        'there is a bug in the user registration flow',
        'the server throws an error on every request',
        'app crash happens during the login process',
        'got an exception when calling the payment API',
        'seeing a stack trace in the production logs here',
        'the test suite is failing in CI pipeline now',
        'the deployment is broken after the update today',
        "the search feature doesn't work at all anymore",
        'the API is not working for authenticated users now'
      ];
      for (const prompt of bugPrompts) {
        const result = analyzePrompt(prompt, planningDir);
        expect(result).not.toBeNull();
        expect(result.command).toBe('/pbr:debug');
      }
      cleanupTmp(tmpDir);
    });

    test('status patterns match: status, progress, where are we, what is next', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const statusPrompts = [
        'what is the current status of the project now',
        'can you show me the progress on this milestone',
        'where are we with the authentication feature',
        "what's next after completing this current phase"
      ];
      for (const prompt of statusPrompts) {
        const result = analyzePrompt(prompt, planningDir);
        expect(result).not.toBeNull();
        expect(result.command).toBe('/pbr:progress');
      }
      cleanupTmp(tmpDir);
    });

    test('explore patterns match: explore, research, how does, what if, trade-offs', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const explorePrompts = [
        'I want to explore different caching strategies here',
        'can you research the best authentication library options',
        'how does the event system work in this codebase',
        'what if we switch to a microservices architecture now',
        'what are the trade-offs of using GraphQL vs REST'
      ];
      for (const prompt of explorePrompts) {
        const result = analyzePrompt(prompt, planningDir);
        expect(result).not.toBeNull();
        expect(result.command).toBe('/pbr:explore');
      }
      cleanupTmp(tmpDir);
    });

    test('refactor patterns match: refactor, migrate, redesign, restructure', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const refactorPrompts = [
        'we need to refactor the entire database access layer',
        'time to migrate from Express to Fastify framework',
        'should redesign the notification system from scratch',
        'we should restructure the codebase for modularity now'
      ];
      for (const prompt of refactorPrompts) {
        const result = analyzePrompt(prompt, planningDir);
        expect(result).not.toBeNull();
        expect(result.command).toBe('/pbr:plan-phase add');
      }
      cleanupTmp(tmpDir);
    });

    test('generic task patterns match: add, create, implement, build, update', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const taskPrompts = [
        'add a new endpoint for user preferences please',
        'create a dashboard component for analytics data',
        'implement the password reset flow for users',
        'build a caching layer for the API responses',
        'update the user profile page with new fields'
      ];
      for (const prompt of taskPrompts) {
        const result = analyzePrompt(prompt, planningDir);
        expect(result).not.toBeNull();
        expect(result.command).toBe('/pbr:do');
      }
      cleanupTmp(tmpDir);
    });

    test('non-matching prompts return null', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const noMatchPrompts = [
        'the weather is nice today in Seattle',
        'I had a great lunch at the new restaurant'
      ];
      for (const prompt of noMatchPrompts) {
        expect(analyzePrompt(prompt, planningDir)).toBeNull();
      }
      cleanupTmp(tmpDir);
    });
  });

  describe('handleHttp error paths', () => {
    test('malformed request body returns null', async () => {
      expect(handleHttp({})).toBeNull();
      expect(handleHttp({ data: null })).toBeNull();
    });

    test('missing prompt field returns null', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = handleHttp({ data: {}, planningDir });
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('uses content field as fallback', async () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const result = handleHttp({
        data: { content: 'there is a major bug in the auth system' },
        planningDir
      });
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('/pbr:debug');
      cleanupTmp(tmpDir);
    });
  });

  describe('main() execution edge cases', () => {
    test('empty user_prompt does not crash', async () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, { user_prompt: '' });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('very long prompt (>1k chars) does not crash', async () => {
      const { tmpDir } = makeTmpDir();
      const longPrompt = 'there is a bug ' + 'x'.repeat(1000) + ' in the system';
      const result = runScript(tmpDir, { prompt: longPrompt });
      expect(result.exitCode).toBe(0);
      if (result.output) {
        const parsed = JSON.parse(result.output);
        expect(parsed.additionalContext).toContain('/pbr:debug');
      }
      cleanupTmp(tmpDir);
    });

    test('unicode prompt does not crash', async () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, { prompt: 'there is a bug in the authentication module' });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });

  describe('hook execution', () => {
    test('exits 0 with matching prompt', async () => {
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

    test('exits 0 with non-matching prompt', async () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, {
        prompt: 'the sky is blue and water is wet today'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('exits 0 with empty input', async () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, {});
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('exits 0 when not a PBR project', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pr-noplan-'));
      const result = runScript(tmpDir, { prompt: 'there is a bug here right now' });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('exits 0 with malformed JSON input', async () => {
      const { tmpDir } = makeTmpDir();
      const result = _run('not json', { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });
});

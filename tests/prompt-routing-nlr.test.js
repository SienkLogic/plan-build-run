/**
 * Tests for prompt-routing.js NL routing integration (Plan 04-05).
 *
 * Tests that the hook uses classifyIntent() from intent-router.cjs
 * when features.natural_language_routing is enabled, providing enhanced
 * routing with confidence scores and /pbr:do suggestions.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { analyzePrompt, handleHttp } = require('../hooks/prompt-routing');

function makeTmpDir(configOverrides) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-nlr-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nstatus: executing\n---\n');

  if (configOverrides !== undefined) {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify(configOverrides, null, 2)
    );
  }
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('prompt-routing NL routing integration', () => {
  describe('routing suggestion with classifyIntent', () => {
    test('input with debug keywords suggests debug via NL route when enabled', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      const result = analyzePrompt('fix the auth bug in the login page', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      // When NL routing is enabled, result should have nlRoute metadata
      expect(result.nlRoute).toBeDefined();
      expect(result.nlRoute.route).toBe('debug');
      expect(typeof result.nlRoute.confidence).toBe('number');
      cleanup(tmpDir);
    });

    test('input "add a login button" includes NL route with quick suggestion', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      const result = analyzePrompt('add a login button to the header component', planningDir);
      expect(result).not.toBeNull();
      expect(result.nlRoute).toBeDefined();
      expect(typeof result.nlRoute.confidence).toBe('number');
      cleanup(tmpDir);
    });

    test('NL routing hint mentions /pbr:do for auto-routing', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      const result = analyzePrompt('fix the auth bug in the login page', planningDir);
      expect(result).not.toBeNull();
      expect(result.hint).toContain('/pbr:do');
      cleanup(tmpDir);
    });
  });

  describe('skip conditions', () => {
    test('input starting with /pbr: returns null', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      expect(analyzePrompt('/pbr:do something here', planningDir)).toBeNull();
      cleanup(tmpDir);
    });

    test('input starting with / (any slash command) returns null', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      expect(analyzePrompt('/help me with this task', planningDir)).toBeNull();
      cleanup(tmpDir);
    });

    test('empty input returns null', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      expect(analyzePrompt('', planningDir)).toBeNull();
      cleanup(tmpDir);
    });

    test('very short input (< 5 chars) returns null', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      expect(analyzePrompt('ok', planningDir)).toBeNull();
      cleanup(tmpDir);
    });
  });

  describe('feature toggle', () => {
    test('when config has natural_language_routing: false, result has no nlRoute', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: false } });
      const result = analyzePrompt('there is a bug in the authentication module', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      // Pattern matching still works, but no NL metadata
      expect(result.nlRoute).toBeUndefined();
      cleanup(tmpDir);
    });

    test('when no config file exists, NL routing fires (default: true)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // No config.json -> defaults apply -> NL routing enabled
      const result = analyzePrompt('there is a bug in the authentication module', planningDir);
      expect(result).not.toBeNull();
      expect(result.command).toBe('/pbr:debug');
      // Default enabled = NL metadata present
      expect(result.nlRoute).toBeDefined();
      cleanup(tmpDir);
    });
  });

  describe('non-blocking', () => {
    test('hook never returns decision: block', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      const result = analyzePrompt('fix the critical auth bug right now', planningDir);
      if (result) {
        expect(result).not.toHaveProperty('decision');
      }
      cleanup(tmpDir);
    });

    test('handleHttp includes NL route info in additionalContext when enabled', () => {
      const { tmpDir, planningDir } = makeTmpDir({ features: { natural_language_routing: true } });
      const result = handleHttp({
        data: { prompt: 'there is a bug in the payment module right now' },
        planningDir
      });
      expect(result).not.toBeNull();
      expect(result.additionalContext).toBeDefined();
      expect(result.additionalContext).toContain('/pbr:');
      expect(result).not.toHaveProperty('decision');
      cleanup(tmpDir);
    });
  });
});

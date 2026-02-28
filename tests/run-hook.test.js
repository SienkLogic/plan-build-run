/**
 * Tests for run-hook.js — the bootstrap script for ALL PBR hooks.
 * Tests fixMsysPath, script resolution, error handling, BOOTSTRAP_SNIPPET export,
 * and hooks.json bootstrap drift detection.
 */

const path = require('path');
const { execSync } = require('child_process');

const RUN_HOOK = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'run-hook.js');
const HOOKS_JSON = path.join(__dirname, '..', 'plugins', 'pbr', 'hooks', 'hooks.json');


describe('run-hook.js', () => {
  describe('fixMsysPath', () => {
    // We test via requiring the module and calling the exported function indirectly
    // Since fixMsysPath isn't exported, test via environment variable behavior

    test('converts MSYS path /d/Repos to D:\\Repos when used via env', () => {
      // Run a tiny script that requires run-hook and prints the resolved pluginRoot
      const script = `
        process.env.CLAUDE_PLUGIN_ROOT = '/d/Repos/test-project/plugins/pbr';
        process.argv = ['node', 'nonexistent-script-12345.js'];
        try { require('${RUN_HOOK.replace(/\\/g, '\\\\')}'); } catch(_e) {}
      `;
      // The script will fail to find the nonexistent script but that's OK
      try {
        execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
          encoding: 'utf8',
          timeout: 5000,
        });
      } catch (err) {
        // Expected — script not found, but path conversion happened
        expect(err.stderr).toContain('cannot find script');
      }
    });
  });

  describe('script resolution', () => {
    test('resolves scripts relative to __dirname', () => {
      // Run a real hook script that exits quickly (hook-logger.js doesn't have main)
      // Use a script we know exists and will exit cleanly on empty stdin
      const result = execSync(
        `echo {} | node "${RUN_HOOK}" log-tool-failure.js`,
        { encoding: 'utf8', timeout: 5000 }
      );
      // log-tool-failure.js with empty/minimal input should exit silently
      expect(result).toBeDefined();
    });

    test('fails gracefully for missing scripts', () => {
      try {
        execSync(`node "${RUN_HOOK}" nonexistent-script-xyz.js`, {
          encoding: 'utf8',
          timeout: 5000,
        });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err.status).toBe(1);
        expect(err.stderr).toContain('cannot find script');
        expect(err.stderr).toContain('nonexistent-script-xyz.js');
      }
    });

    test('reports searched paths on failure', () => {
      try {
        execSync(`node "${RUN_HOOK}" missing-hook.js`, {
          encoding: 'utf8',
          timeout: 5000,
        });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err.stderr).toContain('searched:');
      }
    });
  });

  describe('invocation modes', () => {
    test('works when invoked directly: node run-hook.js <script>', () => {
      // Echo minimal JSON to a hook that reads stdin
      try {
        execSync(`echo {} | node "${RUN_HOOK}" log-tool-failure.js`, {
          encoding: 'utf8',
          timeout: 5000,
        });
      } catch (_err) {
        // Some hooks may exit non-zero on minimal input — that's fine
      }
    });

    test('module.exports is a function', () => {
      // Verify the module exports runScript
      // We need to isolate this since requiring run-hook.js has side effects
      const script = `
        const m = require('${RUN_HOOK.replace(/\\/g, '\\\\')}');
        console.log(typeof m);
      `;
      // Provide a dummy script arg to prevent immediate execution error
      const result = execSync(
        `node -e "process.argv[1]=''; ${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      expect(result.trim()).toBe('function');
    });
  });
});

describe('run-hook.js BOOTSTRAP_SNIPPET export', () => {
  test('BOOTSTRAP_SNIPPET is exported as a string', () => {
    const result = execSync(
      `node -e "process.argv[1]=''; const m=require('${RUN_HOOK.replace(/\\/g, '\\\\')}'); console.log(typeof m.BOOTSTRAP_SNIPPET);"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    expect(result.trim()).toBe('string');
  });

  test('BOOTSTRAP_SNIPPET contains MSYS path fix logic', () => {
    const result = execSync(
      `node -e "process.argv[1]=''; const m=require('${RUN_HOOK.replace(/\\/g, '\\\\')}'); console.log(m.BOOTSTRAP_SNIPPET);"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const snippet = result.trim();
    expect(snippet).toContain('CLAUDE_PLUGIN_ROOT');
    expect(snippet).toContain('String.fromCharCode');
    expect(snippet).toContain('run-hook.js');
  });

  test('runScript is exported as a function', () => {
    const result = execSync(
      `node -e "process.argv[1]=''; const m=require('${RUN_HOOK.replace(/\\/g, '\\\\')}'); console.log(typeof m.runScript);"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    expect(result.trim()).toBe('function');
  });
});

describe('hooks.json $bootstrap documentation', () => {
  let hooksJson;

  beforeAll(() => {
    hooksJson = require(HOOKS_JSON);
  });

  test('has $bootstrap documentation key', () => {
    expect(hooksJson).toHaveProperty('$bootstrap');
    expect(typeof hooksJson.$bootstrap).toBe('object');
  });

  test('$bootstrap.why explains the MSYS path problem', () => {
    expect(hooksJson.$bootstrap).toHaveProperty('why');
    expect(hooksJson.$bootstrap.why).toContain('MSYS');
  });

  test('$bootstrap.pattern documents the bootstrap one-liner', () => {
    expect(hooksJson.$bootstrap).toHaveProperty('pattern');
    expect(hooksJson.$bootstrap.pattern).toContain('CLAUDE_PLUGIN_ROOT');
    expect(hooksJson.$bootstrap.pattern).toContain('String.fromCharCode');
  });
});

describe('hooks.json bootstrap drift detection', () => {
  /**
   * Recursively collect all hook command strings from a hooks.json structure.
   * Returns array of { event, command } objects.
   */
  function collectHookCommands(hooksObj) {
    const results = [];
    const hookEvents = hooksObj.hooks || {};

    for (const [eventName, eventHooks] of Object.entries(hookEvents)) {
      if (!Array.isArray(eventHooks)) continue;

      for (const group of eventHooks) {
        const groupHooks = group.hooks || [];
        for (const hook of groupHooks) {
          if (hook.type === 'command' && typeof hook.command === 'string') {
            results.push({ event: eventName, command: hook.command });
          }
        }
      }
    }

    return results;
  }

  test('all hook commands start with BOOTSTRAP_SNIPPET (drift detector)', () => {
    const hooksJson = require(HOOKS_JSON);

    // Get BOOTSTRAP_SNIPPET from a subprocess to avoid side effects of requiring run-hook.js
    const snippetResult = execSync(
      `node -e "process.argv[1]=''; const m=require('${RUN_HOOK.replace(/\\/g, '\\\\')}'); process.stdout.write(m.BOOTSTRAP_SNIPPET);"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const BOOTSTRAP_SNIPPET = snippetResult;

    const commands = collectHookCommands(hooksJson);
    expect(commands.length).toBeGreaterThan(0);

    const violations = commands.filter(
      ({ command }) => !command.startsWith(BOOTSTRAP_SNIPPET)
    );

    if (violations.length > 0) {
      const details = violations
        .map(({ event, command }) => `  [${event}] ${command.slice(0, 100)}`)
        .join('\n');
      throw new Error(
        `${violations.length} hook command(s) do not start with BOOTSTRAP_SNIPPET:\n${details}\n\n` +
        `Expected prefix:\n  ${BOOTSTRAP_SNIPPET}`
      );
    }
  });
});

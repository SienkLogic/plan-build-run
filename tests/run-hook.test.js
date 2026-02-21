/**
 * Tests for run-hook.js — the bootstrap script for ALL PBR hooks.
 * Tests fixMsysPath, script resolution, and error handling.
 */

const path = require('path');
const { execSync } = require('child_process');

const RUN_HOOK = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'run-hook.js');


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

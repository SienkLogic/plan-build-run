const { execSync } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'check-dangerous-commands.js');

function runScript(command) {
  const input = JSON.stringify({ tool_input: { command } });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input,
      encoding: 'utf8',
      timeout: 5000,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('check-dangerous-commands.js', () => {
  describe('blocked commands', () => {
    test('blocks rm -rf .planning', () => {
      const result = runScript('rm -rf .planning');
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('block');
      expect(result.output).toContain('.planning');
    });

    test('blocks rm -rf .planning/', () => {
      const result = runScript('rm -rf .planning/');
      expect(result.exitCode).toBe(2);
    });

    test('blocks rm -rf targeting .planning subdirectory', () => {
      const result = runScript('rm -rf .planning/phases/01-setup');
      expect(result.exitCode).toBe(2);
    });

    test('blocks rm -fr (reversed flags) .planning', () => {
      const result = runScript('rm -fr .planning');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git reset --hard', () => {
      const result = runScript('git reset --hard');
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('block');
    });

    test('blocks git reset --hard HEAD~3', () => {
      const result = runScript('git reset --hard HEAD~3');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git push --force to main', () => {
      const result = runScript('git push --force origin main');
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('main');
    });

    test('blocks git push -f to master', () => {
      const result = runScript('git push -f origin master');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git push origin main --force (flag after branch)', () => {
      const result = runScript('git push origin main --force');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git clean -fd', () => {
      const result = runScript('git clean -fd');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git clean -fxd', () => {
      const result = runScript('git clean -fxd');
      expect(result.exitCode).toBe(2);
    });
  });

  describe('allowed commands', () => {
    test('allows normal git commit', () => {
      const result = runScript('git commit -m "feat(01-01): add auth"');
      expect(result.exitCode).toBe(0);
    });

    test('allows git push without force', () => {
      const result = runScript('git push origin feature-branch');
      expect(result.exitCode).toBe(0);
    });

    test('allows rm of specific files', () => {
      const result = runScript('rm src/old-file.ts');
      expect(result.exitCode).toBe(0);
    });

    test('allows rm -rf of non-.planning directories', () => {
      const result = runScript('rm -rf node_modules');
      expect(result.exitCode).toBe(0);
    });

    test('allows git reset --soft', () => {
      const result = runScript('git reset --soft HEAD~1');
      expect(result.exitCode).toBe(0);
    });

    test('allows npm commands', () => {
      const result = runScript('npm install express');
      expect(result.exitCode).toBe(0);
    });

    test('allows empty command', () => {
      const result = runScript('');
      expect(result.exitCode).toBe(0);
    });

    test('allows git push --force to feature branches', () => {
      const result = runScript('git push --force origin feature/my-branch');
      // This is a warn, not a block — exit 0
      expect(result.exitCode).toBe(0);
    });
  });

  describe('warned commands', () => {
    test('warns on git checkout -- .', () => {
      const result = runScript('git checkout -- .');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('unstaged');
    });

    test('warns on git push --force to non-main branches', () => {
      const result = runScript('git push --force origin feature-branch');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
    });
  });

  describe('error handling', () => {
    test('allows on malformed JSON input', () => {
      try {
        execSync(`echo "not json" | node "${SCRIPT}"`, {
          encoding: 'utf8',
          timeout: 5000,
        });
        // Should exit 0 (allow) — reaching here means no error thrown
        expect(true).toBe(true);
      } catch (e) {
        // If it threw, it should still be exit 0
        expect(e.status).toBeNull();
      }
    });
  });
});

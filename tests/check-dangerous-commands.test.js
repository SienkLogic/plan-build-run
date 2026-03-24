const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRunner } = require('./helpers');
const { checkDangerous } = require('../plugins/pbr/scripts/check-dangerous-commands');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-dangerous-commands.js');
const _run = createRunner(SCRIPT);
const run = (cmd) => _run({ tool_input: { command: cmd } });

describe('check-dangerous-commands.js', () => {
  describe('blocked commands', () => {
    test('blocks rm -rf .planning', async () => {
      const result = run('rm -rf .planning');
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('block');
      expect(result.output).toContain('.planning');
    });

    test('blocks rm -rf .planning/', async () => {
      const result = run('rm -rf .planning/');
      expect(result.exitCode).toBe(2);
    });

    test('blocks rm -rf targeting .planning subdirectory', async () => {
      const result = run('rm -rf .planning/phases/01-setup');
      expect(result.exitCode).toBe(2);
    });

    test('blocks rm -fr (reversed flags) .planning', async () => {
      const result = run('rm -fr .planning');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git reset --hard', async () => {
      const result = run('git reset --hard');
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('block');
    });

    test('blocks git reset --hard HEAD~3', async () => {
      const result = run('git reset --hard HEAD~3');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git push --force to main', async () => {
      const result = run('git push --force origin main');
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('main');
    });

    test('blocks git push -f to master', async () => {
      const result = run('git push -f origin master');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git push origin main --force (flag after branch)', async () => {
      const result = run('git push origin main --force');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git clean -fd', async () => {
      const result = run('git clean -fd');
      expect(result.exitCode).toBe(2);
    });

    test('blocks git clean -fxd', async () => {
      const result = run('git clean -fxd');
      expect(result.exitCode).toBe(2);
    });
  });

  describe('allowed commands', () => {
    test('allows normal git commit', async () => {
      const result = run('git commit -m "feat(01-01): add auth"');
      expect(result.exitCode).toBe(0);
    });

    test('allows git push without force', async () => {
      const result = run('git push origin feature-branch');
      expect(result.exitCode).toBe(0);
    });

    test('allows rm of specific files', async () => {
      const result = run('rm src/old-file.ts');
      expect(result.exitCode).toBe(0);
    });

    test('allows rm -rf of non-.planning directories', async () => {
      const result = run('rm -rf node_modules');
      expect(result.exitCode).toBe(0);
    });

    test('allows git reset --soft', async () => {
      const result = run('git reset --soft HEAD~1');
      expect(result.exitCode).toBe(0);
    });

    test('allows npm commands', async () => {
      const result = run('npm install express');
      expect(result.exitCode).toBe(0);
    });

    test('allows empty command', async () => {
      const result = run('');
      expect(result.exitCode).toBe(0);
    });

    test('allows git push --force to feature branches', async () => {
      const result = run('git push --force origin feature/my-branch');
      // This is a warn, not a block — exit 0
      expect(result.exitCode).toBe(0);
    });
  });

  describe('warned commands', () => {
    test('warns on git checkout -- .', async () => {
      const result = run('git checkout -- .');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
      expect(result.output).toContain('unstaged');
    });

    test('warns on git push --force to non-main branches', async () => {
      const result = run('git push --force origin feature-branch');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Warning');
    });
  });

  describe('statusline JSON safety guard', () => {
    let tmpDir;
    let originalCwd;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-dc-'));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      originalCwd = process.cwd();
      process.chdir(tmpDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('blocks sed on JSON files when active skill is statusline', async () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'statusline');
      const result = checkDangerous({ tool_input: { command: "sed -i 's/foo/bar/' settings.json" } });
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      expect(result.output.decision).toBe('block');
    });

    test('blocks awk on JSON files when active skill is statusline', async () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'statusline');
      const result = checkDangerous({ tool_input: { command: "awk '{print}' config.json > tmp.json" } });
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
    });

    test('blocks echo redirect to JSON when active skill is statusline', async () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'statusline');
      const result = checkDangerous({ tool_input: { command: 'echo "test" > settings.json' } });
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
    });

    test('passes sed on non-JSON files during statusline', async () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'statusline');
      const result = checkDangerous({ tool_input: { command: "sed -i 's/foo/bar/' config.txt" } });
      expect(result).toBeNull();
    });

    test('passes sed on JSON files when NOT in statusline skill', async () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'build');
      const result = checkDangerous({ tool_input: { command: "sed -i 's/foo/bar/' settings.json" } });
      expect(result).toBeNull();
    });

    test('passes normal bash commands during statusline skill', async () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'statusline');
      const result = checkDangerous({ tool_input: { command: 'npm install' } });
      expect(result).toBeNull();
    });

    test('passes when no .active-skill file exists', async () => {
      const result = checkDangerous({ tool_input: { command: "sed -i 's/foo/bar/' settings.json" } });
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    test('allows on malformed JSON input', async () => {
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

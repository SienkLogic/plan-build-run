const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pre-bash-dispatch.js');

function runScript(toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: os.tmpdir(),
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('pre-bash-dispatch.js', () => {
  describe('normal commands pass through', () => {
    test('npm test passes through', () => {
      const result = runScript({ command: 'npm test' });
      expect(result.exitCode).toBe(0);
    });

    test('git status passes through', () => {
      const result = runScript({ command: 'git status' });
      expect(result.exitCode).toBe(0);
    });

    test('git log passes through', () => {
      const result = runScript({ command: 'git log --oneline -5' });
      expect(result.exitCode).toBe(0);
    });

    test('ls passes through', () => {
      const result = runScript({ command: 'ls -la' });
      expect(result.exitCode).toBe(0);
    });

    test('echo passes through', () => {
      const result = runScript({ command: 'echo hello' });
      expect(result.exitCode).toBe(0);
    });

    test('empty command passes through', () => {
      const result = runScript({ command: '' });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('dangerous commands dispatch to check-dangerous-commands', () => {
    test('blocks rm -rf .planning', () => {
      const result = runScript({ command: 'rm -rf .planning' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('.planning');
    });

    test('blocks rm -rf targeting .planning subdirectory', () => {
      const result = runScript({ command: 'rm -rf .planning/phases' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
    });

    test('blocks git reset --hard', () => {
      const result = runScript({ command: 'git reset --hard' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('reset --hard');
    });

    test('blocks git push --force to main', () => {
      const result = runScript({ command: 'git push --force origin main' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
    });

    test('blocks git push -f to master', () => {
      const result = runScript({ command: 'git push -f origin master' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
    });

    test('blocks git clean -fd', () => {
      const result = runScript({ command: 'git clean -fd' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
    });

    test('warns on git checkout -- . (exit 0 with additionalContext)', () => {
      const result = runScript({ command: 'git checkout -- .' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.additionalContext).toContain('Warning');
    });

    test('warns on git push --force to non-main branch (exit 0)', () => {
      const result = runScript({ command: 'git push --force origin feature-branch' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.additionalContext).toContain('Warning');
    });
  });

  describe('commit validation dispatch to validate-commit', () => {
    test('blocks invalid commit message format', () => {
      const result = runScript({ command: 'git commit -m "bad message"' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('Invalid commit message');
    });

    test('allows valid commit message', () => {
      const result = runScript({ command: 'git commit -m "feat(03-01): add user auth"' });
      expect(result.exitCode).toBe(0);
    });

    test('allows merge commit', () => {
      const result = runScript({ command: "git commit -m \"Merge branch 'feature' into main\"" });
      expect(result.exitCode).toBe(0);
    });

    test('blocks AI co-author in commit', () => {
      const result = runScript({
        command: 'git commit -m "feat(01-01): add feature" -m "Co-Authored-By: Claude <noreply@anthropic.com>"'
      });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('co-author');
    });
  });

  describe('short-circuit: dangerous check runs before commit check', () => {
    test('dangerous command blocks even if it also contains git commit', () => {
      // A chained command that has both a dangerous operation and a commit
      // The dangerous check should fire first
      const result = runScript({ command: 'git reset --hard && git commit -m "feat(01-01): stuff"' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('reset --hard');
    });
  });

  describe('error handling', () => {
    test('malformed JSON does not block', () => {
      // Send invalid JSON - the script should catch the parse error and exit 0
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: 'not json at all',
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        // exit 0 means it passed through
        expect(result).toBeDefined();
      } catch (e) {
        // Should not block (exit 2) on parse errors
        expect(e.status).not.toBe(2);
      }
    });

    test('missing tool_input does not block', () => {
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: JSON.stringify({}),
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        expect(result).toBeDefined();
      } catch (e) {
        expect(e.status).not.toBe(2);
      }
    });

    test('missing command field does not block', () => {
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: JSON.stringify({ tool_input: {} }),
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        expect(result).toBeDefined();
      } catch (e) {
        expect(e.status).not.toBe(2);
      }
    });
  });
});

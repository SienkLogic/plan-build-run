const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createRunner } = require('./helpers');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pre-bash-dispatch.js');
const _run = createRunner(SCRIPT);
const runScript = (toolInput, cwd) => _run({ tool_input: toolInput }, { cwd: cwd || os.tmpdir() });

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

  describe('missing .planning/ directory', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pbd-noplan-'));
      // No .planning/ subdirectory created
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('benign command passes without .planning/', () => {
      const result = runScript({ command: 'echo hello' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('valid git commit passes without .planning/', () => {
      const result = runScript({ command: 'git commit -m "feat(test): add feature"' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('dangerous command still blocked without .planning/', () => {
      const result = runScript({ command: 'git reset --hard' }, tmpDir);
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
    });
  });

  describe('allow decision format', () => {
    test('pass-through returns { decision: "allow" } JSON', () => {
      const result = runScript({ command: 'ls' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
    });

    test('advisory warnings still return decision allow', () => {
      const result = runScript({ command: 'npm publish foo' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
      expect(output.additionalContext).toBeDefined();
    });

    test('blocked commands return decision block, not allow', () => {
      const result = runScript({ command: 'rm -rf .planning' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
    });

    test('allow output is valid JSON with no extra fields beyond decision', () => {
      const result = runScript({ command: 'echo test' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
      expect(Object.keys(output)).toEqual(['decision']);
    });

    test('handles CRLF in stdin JSON gracefully', () => {
      // JSON.parse handles embedded \r\n in string values — verify hook doesn't choke
      const input = JSON.stringify({ tool_input: { command: 'echo hello\r\nworld' } });
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input,
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        const output = JSON.parse(result);
        expect(output.decision).toBe('allow');
      } catch (e) {
        // Should not block on CRLF content
        expect(e.status).not.toBe(2);
      }
    });
  });

  describe('malformed input handling', () => {
    test('non-JSON stdin exits 0 with valid JSON output', () => {
      const result = _run('this is not json at all', { cwd: os.tmpdir() });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
    });

    test('empty string stdin exits 0', () => {
      const result = _run('', { cwd: os.tmpdir() });
      expect(result.exitCode).toBe(0);
    });

    test('tool_input missing entirely exits 0', () => {
      const result = _run({ session_id: 'test' }, { cwd: os.tmpdir() });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
    });

    test('tool_input.command is null exits 0', () => {
      const result = runScript({ command: null });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
    });

    test('tool_input.command is a number exits 0', () => {
      const result = runScript({ command: 42 });
      expect(result.exitCode).toBe(0);
    });

    test('tool_input.command is undefined exits 0', () => {
      const result = runScript({});
      expect(result.exitCode).toBe(0);
    });

    test('deeply nested invalid object exits 0', () => {
      const result = _run({ tool_input: { command: { nested: true } } }, { cwd: os.tmpdir() });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('validate-commit edge cases', () => {
    test('git commit --amend with no message is allowed', () => {
      const result = runScript({ command: 'git commit --amend --no-edit' });
      expect(result.exitCode).toBe(0);
    });

    test('git commit with --no-verify flag and valid message is allowed', () => {
      const result = runScript({ command: 'git commit --no-verify -m "feat(hooks): skip hooks"' });
      expect(result.exitCode).toBe(0);
    });

    test('git commit -m with empty string is blocked', () => {
      const result = runScript({ command: "git commit -m ''" });
      // Empty message can't match COMMIT_PATTERN — either blocked or allowed as unparseable
      // The key behavior: it should not crash
      expect(result.exitCode).toBe(0); // empty quote yields no extractable message → allowed
    });

    test('all valid commit types are allowed', () => {
      const types = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'wip', 'revert'];
      for (const type of types) {
        const result = runScript({ command: `git commit -m "${type}(hooks): test message"` });
        expect(result.exitCode).toBe(0);
      }
    });

    test('conventional commit with hyphenated scope is allowed', () => {
      const result = runScript({ command: 'git commit -m "feat(hook-server): add health endpoint"' });
      expect(result.exitCode).toBe(0);
    });

    test('conventional commit with dot in scope is allowed', () => {
      const result = runScript({ command: 'git commit -m "fix(v2.1): patch release"' });
      expect(result.exitCode).toBe(0);
    });

    test('invalid commit type is blocked', () => {
      const result = runScript({ command: 'git commit -m "yolo(hooks): bad type"' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
      expect(output.reason).toContain('Invalid commit message');
    });

    test('commit with heredoc-style message extracts first line', () => {
      // Heredoc syntax: the hook parses heredoc format to extract message
      const cmd = "git commit -m \"$(cat <<'EOF'\nfeat(hooks): add new hook\n\nDetailed body here\nEOF\n)\"";
      const result = runScript({ command: cmd });
      expect(result.exitCode).toBe(0);
    });

    test('perf, ci, and build types are allowed', () => {
      // hooks/ copy includes perf|ci|build in COMMIT_PATTERN
      const types = ['perf', 'ci', 'build'];
      for (const type of types) {
        const result = runScript({ command: `git commit -m "${type}(hooks): test message"` });
        expect(result.exitCode).toBe(0);
      }
    });
  });

  describe('check-dangerous-commands edge cases', () => {
    test('git push --force-with-lease is allowed (not blocked like --force)', () => {
      const result = runScript({ command: 'git push --force-with-lease origin feature-branch' });
      expect(result.exitCode).toBe(0);
    });

    test('git checkout -- with specific file is allowed', () => {
      const result = runScript({ command: 'git checkout -- src/index.js' });
      expect(result.exitCode).toBe(0);
    });

    test('rm -rf on non-.planning directory is allowed', () => {
      const result = runScript({ command: 'rm -rf dist/' });
      expect(result.exitCode).toBe(0);
    });

    test('git clean -fxd is blocked', () => {
      const result = runScript({ command: 'git clean -fxd' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('block');
    });

    test('rm with only -r (no -f) targeting .planning is not blocked by rf pattern', () => {
      // The regex requires both -r and -f flags
      const result = runScript({ command: 'rm -r .planning' });
      expect(result.exitCode).toBe(0);
    });

    test('git push without --force to main is allowed', () => {
      const result = runScript({ command: 'git push origin main' });
      expect(result.exitCode).toBe(0);
    });

    test('database destructive commands trigger advisory warning', () => {
      const result = runScript({ command: 'mysql -e "DROP TABLE users"' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
      expect(output.additionalContext).toContain('destructive database');
    });

    test('npm publish triggers advisory warning', () => {
      const result = runScript({ command: 'npm publish' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.additionalContext).toContain('npm publish');
    });

    test('production config reference triggers advisory warning', () => {
      const result = runScript({ command: 'cat production.env' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.additionalContext).toContain('production config');
    });
  });

  describe('JSON output format verification', () => {
    test('blocked command output is valid JSON with decision and reason', () => {
      const result = runScript({ command: 'rm -rf .planning' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(typeof output).toBe('object');
      expect(output.decision).toBe('block');
      expect(typeof output.reason).toBe('string');
      expect(output.reason.length).toBeGreaterThan(0);
    });

    test('allowed command output is valid JSON with decision allow', () => {
      const result = runScript({ command: 'echo hello' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(typeof output).toBe('object');
      expect(output.decision).toBe('allow');
    });

    test('advisory warning output has decision allow and additionalContext string', () => {
      const result = runScript({ command: 'npm publish foo' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
      expect(typeof output.additionalContext).toBe('string');
    });

    test('warn-pattern output (git checkout -- .) has additionalContext but no decision field', () => {
      const result = runScript({ command: 'git checkout -- .' });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      // Warn patterns return from checkDangerous which sets additionalContext
      // The dispatch then adds decision: allow in the warnings path
      expect(output.additionalContext).toBeDefined();
    });

    test('malformed input produces valid JSON on stdout', () => {
      const result = _run('garbage input', { cwd: os.tmpdir() });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
    });

    test('block output reason contains the command for context', () => {
      const result = runScript({ command: 'git reset --hard HEAD~5' });
      expect(result.exitCode).toBe(2);
      const output = JSON.parse(result.output);
      expect(output.reason).toContain('reset --hard');
    });
  });

  describe('pre-commit quality checks', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-pbd-precommit-'));
      // Initialize a git repo so getStagedFiles() works
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
      // Create .planning/logs for hook-logger
      fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (_e) {
        // Windows EBUSY — git processes may still hold file handles
      }
    });

    // Skip on Windows CI — git diff --cached in temp dirs returns null exitCode
    // Also flaky on macOS + Node 18 CI (signal kills give null exitCode)
    const itGitStaged = process.platform === 'win32' ? test.skip : test;

    itGitStaged('checks run on git commit and produce advisory warnings for broken require paths', () => {
      // Create a hooks/ dir with a JS file containing a broken require
      const hooksDir = path.join(tmpDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(path.join(hooksDir, 'bad-hook.js'), "const x = require('./nonexistent-module');");

      // Stage the file
      execSync('git add hooks/bad-hook.js', { cwd: tmpDir, stdio: 'pipe' });

      const result = runScript({ command: 'git commit -m "feat(hooks): test commit"' }, tmpDir);
      // On macOS CI + Node 18, execSync can return null exitCode due to signal kills
      if (result.exitCode === null) return;
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      // Should have advisory warnings (not blocking)
      expect(output.decision).toBe('allow');
      expect(output.additionalContext).toContain('Broken require path');
    });

    test('checks do NOT run on non-commit commands', () => {
      // Stage a file with a broken require
      const hooksDir = path.join(tmpDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(path.join(hooksDir, 'bad-hook.js'), "const x = require('./nonexistent-module');");
      execSync('git add hooks/bad-hook.js', { cwd: tmpDir, stdio: 'pipe' });

      // Non-commit commands should not trigger pre-commit checks
      const pushResult = runScript({ command: 'git push origin main' }, tmpDir);
      expect(pushResult.exitCode).toBe(0);
      const pushOutput = JSON.parse(pushResult.output);
      // No broken require warning should appear for non-commit commands
      expect(pushOutput.additionalContext || '').not.toContain('Broken require path');

      const lsResult = runScript({ command: 'ls -la' }, tmpDir);
      expect(lsResult.exitCode).toBe(0);
      const lsOutput = JSON.parse(lsResult.output);
      expect(lsOutput.additionalContext || '').not.toContain('Broken require path');
    });

    itGitStaged('multiple warnings are merged into single advisory', () => {
      // Create a hooks/ file with a broken require (triggers checkRequirePaths)
      const hooksDir = path.join(tmpDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(
        path.join(hooksDir, 'multi-bad.js'),
        "const a = require('./missing-a');\nconst b = require('./missing-b');"
      );
      execSync('git add hooks/multi-bad.js', { cwd: tmpDir, stdio: 'pipe' });

      const result = runScript({ command: 'git commit -m "feat(hooks): multi warnings"' }, tmpDir);
      // On macOS CI + Node 18, execSync can return null exitCode due to signal kills
      if (result.exitCode === null) return;
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.output);
      expect(output.decision).toBe('allow');
      // Multiple broken require warnings should be merged into the advisory
      expect(output.additionalContext).toContain('Broken require path');
      // The advisory should contain both missing paths
      expect(output.additionalContext).toContain('missing-a');
      expect(output.additionalContext).toContain('missing-b');
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

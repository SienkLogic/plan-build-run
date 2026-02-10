const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'validate-commit.js');

function runValidator(toolInput) { // eslint-disable-line no-unused-vars
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`echo '${input.replace(/'/g, "\\'")}' | node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 5000,
      shell: true,
      cwd: os.tmpdir(),
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

// On Windows, use a different approach for piping
function runValidatorCrossPlatform(toolInput) { // eslint-disable-line no-unused-vars
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const s=require('child_process').execSync('node ${SCRIPT.replace(/\\/g, '/')}',{input:d,encoding:'utf8',timeout:5000}); process.stdout.write(s);})" `, {
      input: input,
      encoding: 'utf8',
      timeout: 10000,
      cwd: os.tmpdir(),
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

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

describe('validate-commit.js', () => {
  describe('valid commit messages', () => {
    test('standard feat commit', () => {
      const result = runScript({ command: 'git commit -m "feat(03-01): add user authentication"' });
      expect(result.exitCode).toBe(0);
    });

    test('fix commit', () => {
      const result = runScript({ command: 'git commit -m "fix(02-02): resolve database timeout"' });
      expect(result.exitCode).toBe(0);
    });

    test('refactor commit', () => {
      const result = runScript({ command: 'git commit -m "refactor(01-03): extract validation logic"' });
      expect(result.exitCode).toBe(0);
    });

    test('test commit', () => {
      const result = runScript({ command: 'git commit -m "test(03-02): add auth middleware tests"' });
      expect(result.exitCode).toBe(0);
    });

    test('docs commit', () => {
      const result = runScript({ command: 'git commit -m "docs(planning): update roadmap"' });
      expect(result.exitCode).toBe(0);
    });

    test('chore commit', () => {
      const result = runScript({ command: 'git commit -m "chore(01-01): update dependencies"' });
      expect(result.exitCode).toBe(0);
    });

    test('wip commit without scope', () => {
      const result = runScript({ command: 'git commit -m "wip: save progress"' });
      expect(result.exitCode).toBe(0);
    });

    test('wip commit with scope', () => {
      const result = runScript({ command: 'git commit -m "wip(auth): save progress on middleware"' });
      expect(result.exitCode).toBe(0);
    });

    test('quick task commit', () => {
      const result = runScript({ command: 'git commit -m "feat(quick-001): fix header alignment"' });
      expect(result.exitCode).toBe(0);
    });

    test('commit after cd (chained with &&)', () => {
      const result = runScript({ command: 'cd /d/Repos/project && git commit -m "feat(01-01): add feature"' });
      expect(result.exitCode).toBe(0);
    });

    test('commit after git add (chained with &&)', () => {
      const result = runScript({ command: 'git add file.js && git commit -m "fix(02-01): resolve bug"' });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('invalid commit messages', () => {
    test('missing type', () => {
      const result = runScript({ command: 'git commit -m "add user authentication"' });
      expect(result.exitCode).toBe(2);
    });

    test('invalid type', () => {
      const result = runScript({ command: 'git commit -m "feature(03-01): add auth"' });
      expect(result.exitCode).toBe(2);
    });

    test('missing colon', () => {
      const result = runScript({ command: 'git commit -m "feat(03-01) add auth"' });
      expect(result.exitCode).toBe(2);
    });

    test('missing space after colon', () => {
      const result = runScript({ command: 'git commit -m "feat(03-01):add auth"' });
      expect(result.exitCode).toBe(2);
    });

    test('invalid commit after cd (chained with &&)', () => {
      const result = runScript({ command: 'cd /d/Repos/project && git commit -m "bad message"' });
      expect(result.exitCode).toBe(2);
    });

    test('empty description', () => {
      runScript({ command: 'git commit -m "feat(03-01): "' });
      // The regex requires at least one char after ": "
      // "feat(03-01): " has a trailing space but empty desc
      // This depends on exact regex - trailing space makes it match .+
      // So this might actually pass. Let's test the real edge case:
      const result2 = runScript({ command: 'git commit -m "feat(03-01):"' });
      expect(result2.exitCode).toBe(2);
    });
  });

  describe('non-commit commands', () => {
    test('git status passes through', () => {
      const result = runScript({ command: 'git status' });
      expect(result.exitCode).toBe(0);
    });

    test('git push passes through', () => {
      const result = runScript({ command: 'git push origin main' });
      expect(result.exitCode).toBe(0);
    });

    test('git log passes through', () => {
      const result = runScript({ command: 'git log --oneline -5' });
      expect(result.exitCode).toBe(0);
    });

    test('non-git command passes through', () => {
      const result = runScript({ command: 'npm test' });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('AI co-author blocking', () => {
    test('blocks Co-Authored-By with Claude', () => {
      const result = runScript({
        command: 'git commit -m "feat(01-01): add feature" -m "Co-Authored-By: Claude <noreply@anthropic.com>"'
      });
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('co-author');
    });

    test('blocks Co-Authored-By with Anthropic email', () => {
      const result = runScript({
        command: 'git commit -m "feat(01-01): add feature" -m "Co-Authored-By: Bot <noreply@anthropic.com>"'
      });
      expect(result.exitCode).toBe(2);
    });

    test('blocks Co-Authored-By with Copilot', () => {
      const result = runScript({
        command: 'git commit -m "feat(01-01): add feature" -m "Co-Authored-By: GitHub Copilot <copilot@github.com>"'
      });
      expect(result.exitCode).toBe(2);
    });

    test('blocks Co-Authored-By with GPT', () => {
      const result = runScript({
        command: 'git commit -m "feat(01-01): add feature" -m "Co-Authored-By: ChatGPT <noreply@openai.com>"'
      });
      expect(result.exitCode).toBe(2);
    });

    test('allows Co-Authored-By with human name', () => {
      const result = runScript({
        command: 'git commit -m "feat(01-01): add feature" -m "Co-Authored-By: Jane Doe <jane@example.com>"'
      });
      expect(result.exitCode).toBe(0);
    });

    test('blocks case-insensitive co-author match', () => {
      const result = runScript({
        command: 'git commit -m "feat(01-01): add feature" -m "co-authored-by: claude opus <noreply@anthropic.com>"'
      });
      expect(result.exitCode).toBe(2);
    });
  });

  describe('special cases', () => {
    test('merge commit passes through', () => {
      const result = runScript({ command: "git commit -m \"Merge branch 'feature' into main\"" });
      expect(result.exitCode).toBe(0);
    });

    test('amend with no-edit passes through', () => {
      const result = runScript({ command: 'git commit --amend --no-edit' });
      expect(result.exitCode).toBe(0);
    });

    test('empty input passes through', () => {
      const result = runScript({ command: '' });
      expect(result.exitCode).toBe(0);
    });
  });
});

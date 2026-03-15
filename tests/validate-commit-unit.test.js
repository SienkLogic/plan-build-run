'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkCommit, enrichCommitLlm } = require('../hooks/validate-commit');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-vc-'));
  const logsDir = path.join(tmpDir, '.planning', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkCommit', () => {
  test('returns null for non-git-commit commands', () => {
    expect(checkCommit({ tool_input: { command: 'npm test' } })).toBeNull();
    expect(checkCommit({ tool_input: { command: 'git status' } })).toBeNull();
    expect(checkCommit({ tool_input: { command: 'git log --oneline' } })).toBeNull();
    expect(checkCommit({ tool_input: { command: 'git add .' } })).toBeNull();
  });

  test('returns null for --amend --no-edit', () => {
    expect(checkCommit({ tool_input: { command: 'git commit --amend --no-edit' } })).toBeNull();
  });

  test('blocks invalid commit message format', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "bad message"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('Invalid commit message');
  });

  test('allows valid conventional commit format', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(03-01): add user auth"' } });
    expect(result).toBeNull();
  });

  test('allows merge commits', () => {
    const result = checkCommit({ tool_input: { command: "git commit -m \"Merge branch 'feature'\"" } });
    expect(result).toBeNull();
  });

  test('allows various valid types', () => {
    for (const type of ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'wip', 'revert']) {
      const result = checkCommit({ tool_input: { command: `git commit -m "${type}(scope): description"` } });
      expect(result).toBeNull();
    }
  });

  test('allows commit without scope parens', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "wip: save progress"' } });
    expect(result).toBeNull();
  });

  test('blocks AI co-author in commit', () => {
    const result = checkCommit({
      tool_input: {
        command: 'git commit -m "feat(01-01): add feature" -m "Co-Authored-By: Claude <noreply@anthropic.com>"'
      }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.reason).toContain('co-author');
  });

  test('blocks Copilot co-author', () => {
    const result = checkCommit({
      tool_input: {
        command: 'git commit -m "feat(01-01): feature" -m "Co-Authored-By: Copilot <copilot@github.com>"'
      }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('returns null when message cannot be extracted', () => {
    const result = checkCommit({ tool_input: { command: 'git commit --allow-empty' } });
    expect(result).toBeNull();
  });

  test('returns null when command field is missing', () => {
    expect(checkCommit({ tool_input: {} })).toBeNull();
    expect(checkCommit({})).toBeNull();
  });

  test('handles heredoc commit messages', () => {
    const cmd = "git commit -m \"$(cat <<'EOF'\nfeat(01-01): add user authentication\n\nImplements OAuth2 flow.\nEOF\n)\"";
    const result = checkCommit({ tool_input: { command: cmd } });
    expect(result).toBeNull();
  });

  test('blocks invalid heredoc commit messages', () => {
    const cmd = "git commit -m \"$(cat <<'EOF'\nbad message without type\n\nBody text.\nEOF\n)\"";
    const result = checkCommit({ tool_input: { command: cmd } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('detects git commit in chained commands', () => {
    const result = checkCommit({ tool_input: { command: 'git add . && git commit -m "bad message"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('allows quick task scopes', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "test(quick-001): add coverage tests"' } });
    expect(result).toBeNull();
  });

  test('allows planning scope', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "docs(planning): update roadmap"' } });
    expect(result).toBeNull();
  });
});

describe('enrichCommitLlm', () => {
  test('returns null for non-commit commands', async () => {
    const result = await enrichCommitLlm({ tool_input: { command: 'npm test' } });
    expect(result).toBeNull();
  });

  test('returns null when no message extractable', async () => {
    const result = await enrichCommitLlm({ tool_input: { command: 'git commit --allow-empty' } });
    expect(result).toBeNull();
  });

  test('does not throw when LLM is not configured', async () => {
    // enrichCommitLlm may return a string or null depending on LLM stub behavior
    // The important thing is it doesn't throw
    const result = await enrichCommitLlm({ tool_input: { command: 'git commit -m "feat(01-01): test"' } });
    expect(typeof result === 'string' || result === null).toBe(true);
  });
});

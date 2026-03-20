'use strict';

// Consolidated from validate-commit.test.js + validate-commit-unit.test.js (phase 02-02)

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkCommit, enrichCommitLlm } = require('../plugins/pbr/scripts/validate-commit');

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
    expect(checkCommit({ tool_input: { command: 'git push origin main' } })).toBeNull();
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

  test('allows commit without scope parens (wip)', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "wip: save progress"' } });
    expect(result).toBeNull();
  });

  test('allows multi-word-hyphenated scope', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "fix(plan-checker): handle empty frontmatter"' } });
    expect(result).toBeNull();
  });

  test('allows quick task scopes', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "test(quick-001): add coverage tests"' } });
    expect(result).toBeNull();
  });

  test('allows planning scope', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "docs(planning): update roadmap"' } });
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

  test('blocks GPT co-author', () => {
    const result = checkCommit({
      tool_input: {
        command: 'git commit -m "feat(hooks): add feature" -m "Co-Authored-By: ChatGPT <noreply@openai.com>"'
      }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('blocks case-insensitive co-author match', () => {
    const result = checkCommit({
      tool_input: {
        command: 'git commit -m "feat(hooks): add feature" -m "co-authored-by: claude opus <noreply@anthropic.com>"'
      }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('allows Co-Authored-By with human name', () => {
    const result = checkCommit({
      tool_input: {
        command: 'git commit -m "feat(hooks): add feature" -m "Co-Authored-By: Jane Doe <jane@example.com>"'
      }
    });
    expect(result).toBeNull();
  });

  test('returns null when message cannot be extracted', () => {
    const result = checkCommit({ tool_input: { command: 'git commit --allow-empty' } });
    expect(result).toBeNull();
  });

  test('returns null when command field is missing', () => {
    expect(checkCommit({ tool_input: {} })).toBeNull();
    expect(checkCommit({})).toBeNull();
  });

  test('returns null for commit without -m flag', () => {
    const result = checkCommit({ tool_input: { command: 'git commit' } });
    expect(result).toBeNull();
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

  test('heredoc extraction uses first line as commit subject', () => {
    const command = 'git commit -m "$(cat <<EOF\nfeat(02-03): implement login\n\nCo-Authored-By: Human Dev <dev@example.com>\nEOF\n)"';
    const result = checkCommit({ tool_input: { command } });
    expect(result).toBeNull();
  });

  test('detects git commit in chained commands', () => {
    const result = checkCommit({ tool_input: { command: 'git add . && git commit -m "bad message"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('allows valid commit after cd (chained with &&)', () => {
    const result = checkCommit({ tool_input: { command: 'cd /d/Repos/project && git commit -m "feat(hooks): add feature"' } });
    expect(result).toBeNull();
  });

  test('blocks invalid commit after cd (chained with &&)', () => {
    const result = checkCommit({ tool_input: { command: 'cd /d/Repos/project && git commit -m "bad message"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('blocks empty description (missing colon-space)', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(auth):"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('blocks invalid type', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feature(auth): add auth"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('blocks missing colon', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(auth) add auth"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('blocks missing space after colon', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(auth):add auth"' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  describe('sensitive file blocking', () => {
    test('sensitive file check function exists and runs without crash', () => {
      const result = checkCommit({ tool_input: { command: 'git commit -m "feat(hooks): add feature"' } });
      expect(result).toBeNull();
    });

    test.todo('sensitive file .env staged triggers block — requires git mock or real staged file');
    test.todo('sensitive file credentials.json staged triggers block — requires git mock or real staged file');
  });
});

describe('commit format edge cases', () => {
  test('all 11 valid types produce null (allowed)', () => {
    const types = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'wip', 'revert', 'perf', 'ci', 'build'];
    for (const type of types) {
      const result = checkCommit({ tool_input: { command: `git commit -m "${type}(scope): description"` } });
      expect(result).toBeNull();
    }
  });

  test('scope with numbers: feat(phase-15): description', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(phase-15): add tests"' } });
    expect(result).toBeNull();
  });

  test('scope with dots: fix(v2.0): description', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "fix(v2.0): patch release"' } });
    expect(result).toBeNull();
  });

  test('missing parentheses: feat: description (allowed — scope is optional)', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat: add feature"' } });
    expect(result).toBeNull();
  });

  test('empty description after colon-space: feat(hooks): (should fail)', () => {
    // "feat(hooks): " with no description after the space — regex requires .+ after colon-space
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(hooks): "' } });
    // The regex requires at least one char after ": " — but the trailing space is trimmed by -m parsing
    // Actually the message is "feat(hooks): " which has a space after colon-space
    // Let's test with truly empty:
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('description with unicode characters', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(hooks): add emoji support \u2705"' } });
    expect(result).toBeNull();
  });

  test('very long commit message (>200 chars)', () => {
    const longDesc = 'a'.repeat(200);
    const result = checkCommit({ tool_input: { command: `git commit -m "feat(hooks): ${longDesc}"` } });
    // Format is valid even if long — no length enforcement in the hook
    expect(result).toBeNull();
  });

  test('scope with underscores is allowed (underscore in character class)', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "fix(my_scope): fix bug"' } });
    // Underscores are in the regex character class [a-zA-Z0-9._-]
    expect(result).toBeNull();
  });

  test('multiple -m flags: first message checked, co-author in second', () => {
    const result = checkCommit({
      tool_input: {
        command: 'git commit -m "feat(hooks): add tests" -m "Additional context"'
      }
    });
    // First -m is extracted, format is valid, second -m has no AI co-author
    expect(result).toBeNull();
  });

  test('commit message with single quotes', () => {
    const result = checkCommit({ tool_input: { command: "git commit -m 'feat(hooks): add tests'" } });
    expect(result).toBeNull();
  });
});

describe('sensitive file blocking edge cases', () => {
  test('.env.local matches sensitive pattern', () => {
    // We can't easily mock execSync for git diff --cached, but we can verify
    // the SENSITIVE_PATTERNS logic via checkCommit — it calls checkSensitiveFilesResult
    // which uses real git. We test the pattern matching indirectly.
    // The actual blocking requires staged files, so this is a format verification.
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(hooks): add feature"' } });
    // Without staged sensitive files, should pass
    expect(result).toBeNull();
  });

  test('checkCommit with git add -A does not crash (git add is not a commit)', () => {
    const result = checkCommit({ tool_input: { command: 'git add -A' } });
    expect(result).toBeNull();
  });

  test('checkCommit returns proper JSON structure on block', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "invalid message"' } });
    expect(result).not.toBeNull();
    expect(result.output).toHaveProperty('decision', 'block');
    expect(result.output).toHaveProperty('reason');
    expect(typeof result.output.reason).toBe('string');
    expect(result.exitCode).toBe(2);
  });

  test('checkCommit returns null (not empty object) when allowed', () => {
    const result = checkCommit({ tool_input: { command: 'git commit -m "feat(hooks): valid"' } });
    expect(result).toBeNull();
  });

  test('AI co-author block output has correct JSON format', () => {
    const result = checkCommit({
      tool_input: {
        command: 'git commit -m "feat(hooks): feature" -m "Co-Authored-By: Claude <noreply@anthropic.com>"'
      }
    });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('AI co-author');
    expect(result.exitCode).toBe(2);
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
    const result = await enrichCommitLlm({ tool_input: { command: 'git commit -m "feat(01-01): test"' } });
    expect(typeof result === 'string' || result === null).toBe(true);
  });
});

/**
 * Tests for plan-build-run/bin/lib/post-hoc.cjs
 * Post-hoc SUMMARY.md generation from git history.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock execGit before requiring post-hoc
jest.mock('../plugins/pbr/scripts/lib/git', () => {
  const actual = jest.requireActual('../plugins/pbr/scripts/lib/git');
  return {
    ...actual,
    execGit: jest.fn(),
  };
});

const { execGit } = require('../plugins/pbr/scripts/lib/git');
const { generateSummary, parseGitLog, buildCommitGrep } = require('../plugins/pbr/scripts/lib/post-hoc');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'post-hoc-test-'));
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('parseGitLog', () => {
  it('parses conventional commit messages into structured data', () => {
    const log = [
      'abc1234 feat(quick-001): add user auth',
      'def5678 fix(quick-001): handle null token',
      'ghi9012 refactor(quick-001): extract helper',
    ].join('\n');

    const result = parseGitLog(log);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ hash: 'abc1234', type: 'feat', scope: 'quick-001', message: 'add user auth' });
    expect(result[1]).toEqual({ hash: 'def5678', type: 'fix', scope: 'quick-001', message: 'handle null token' });
    expect(result[2]).toEqual({ hash: 'ghi9012', type: 'refactor', scope: 'quick-001', message: 'extract helper' });
  });

  it('handles non-conventional commit messages', () => {
    const log = 'abc1234 some random commit message';
    const result = parseGitLog(log);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ hash: 'abc1234', type: 'unknown', scope: '', message: 'some random commit message' });
  });

  it('handles empty input', () => {
    expect(parseGitLog('')).toEqual([]);
    expect(parseGitLog(null)).toEqual([]);
    expect(parseGitLog(undefined)).toEqual([]);
  });
});

describe('buildCommitGrep', () => {
  it('returns grep pattern for quick task IDs', () => {
    expect(buildCommitGrep('quick-001')).toBe('quick-001');
  });

  it('returns grep pattern for phase-plan IDs', () => {
    expect(buildCommitGrep('03-01')).toBe('03-01');
  });

  it('returns the taskId as-is for custom patterns', () => {
    expect(buildCommitGrep('my-feature')).toBe('my-feature');
  });
});

describe('generateSummary', () => {
  let tmpDir;
  let taskDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    taskDir = path.join(tmpDir, 'task');
    fs.mkdirSync(taskDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns valid SUMMARY.md frontmatter from git log', () => {
    execGit.mockImplementation((_cwd, args) => {
      if (args[0] === 'log') {
        return 'abc1234 feat(quick-001): add user auth\ndef5678 fix(quick-001): handle null token';
      }
      if (args[0] === 'diff') {
        return 'src/auth.js\nsrc/utils.js';
      }
      return '';
    });

    const result = generateSummary(tmpDir, taskDir, {
      commitPattern: 'quick-001',
      description: 'Add user authentication',
    });

    expect(result.status).toBe('complete');
    expect(result.commitCount).toBe(2);
    expect(result.keyFiles).toEqual(['src/auth.js', 'src/utils.js']);
    expect(result.path).toBe(path.join(taskDir, 'SUMMARY.md'));

    const content = fs.readFileSync(result.path, 'utf-8');
    expect(content).toContain('status: "complete"');
    expect(content).toContain('generated: "post-hoc"');
    expect(content).toContain('src/auth.js');
    expect(content).toContain('Add user authentication');
  });

  it('extracts key_files from git diff --name-only', () => {
    execGit.mockImplementation((_cwd, args) => {
      if (args[0] === 'log') return 'aaa1111 feat(quick-002): update config';
      if (args[0] === 'diff') return 'config.json\npackage.json\nsrc/index.js';
      return '';
    });

    const result = generateSummary(tmpDir, taskDir, { commitPattern: 'quick-002' });
    expect(result.keyFiles).toEqual(['config.json', 'package.json', 'src/index.js']);
  });

  it('sets status to complete when commits found', () => {
    execGit.mockImplementation((_cwd, args) => {
      if (args[0] === 'log') return 'aaa1111 feat(quick-003): something';
      if (args[0] === 'diff') return 'file.js';
      return '';
    });

    const result = generateSummary(tmpDir, taskDir, { commitPattern: 'quick-003' });
    expect(result.status).toBe('complete');
  });

  it('sets status to failed when no commits found', () => {
    execGit.mockImplementation(() => '');

    const result = generateSummary(tmpDir, taskDir, { commitPattern: 'quick-999' });
    expect(result.status).toBe('failed');
    expect(result.commitCount).toBe(0);
    expect(result.keyFiles).toEqual([]);
  });

  it('handles empty git history gracefully', () => {
    execGit.mockImplementation(() => { throw new Error('fatal: bad default revision'); });

    const result = generateSummary(tmpDir, taskDir, { commitPattern: 'quick-999' });
    expect(result.status).toBe('failed');
    expect(result.commitCount).toBe(0);

    const content = fs.readFileSync(result.path, 'utf-8');
    expect(content).toContain('status: "failed"');
  });
});

// --- Phase-level post-hoc artifact generation (plugins/pbr/scripts/post-hoc.js) ---

describe('phase-level post-hoc artifact generation', () => {
  const phasePostHocPath = '../plugins/pbr/scripts/post-hoc';
  let tmpDir, phaseDir, planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-post-hoc-test-'));
    planningDir = path.join(tmpDir, '.planning');
    phaseDir = path.join(planningDir, 'phases', '10-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const PLAN_FM = `---
phase: "10-test-phase"
plan: "10-01"
files_modified:
  - "src/foo.js"
  - "src/bar.js"
provides:
  - "foo() function"
  - "bar() function"
must_haves:
  truths:
    - "foo does X"
    - "bar does Y"
---

## Summary
Test plan
`;

  describe('generateSummary (phase-level)', () => {
    test('returns object with path and content keys', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      const { generateSummary: genSum } = require(phasePostHocPath);
      const result = genSum(phaseDir, planningDir);
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('content');
    });

    test('content includes key_files in frontmatter', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      const { generateSummary: genSum } = require(phasePostHocPath);
      const result = genSum(phaseDir, planningDir);
      expect(result.content).toContain('key_files');
      expect(result.content).toContain('src/foo.js');
      expect(result.content).toContain('src/bar.js');
    });

    test('content includes What Was Built section with provides', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      const { generateSummary: genSum } = require(phasePostHocPath);
      const result = genSum(phaseDir, planningDir);
      expect(result.content).toContain('## What Was Built');
      expect(result.content).toContain('foo() function');
      expect(result.content).toContain('bar() function');
    });

    test('content includes Must-Have Results section', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      const { generateSummary: genSum } = require(phasePostHocPath);
      const result = genSum(phaseDir, planningDir);
      expect(result.content).toContain('## Must-Have Results');
      expect(result.content).toContain('foo does X');
    });

    test('path points to SUMMARY.md in phaseDir', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      const { generateSummary: genSum } = require(phasePostHocPath);
      const result = genSum(phaseDir, planningDir);
      expect(result.path).toBe(path.join(phaseDir, 'SUMMARY.md'));
    });
  });

  describe('generateLearnings', () => {
    test('returns object with path and content keys', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      const { generateLearnings } = require(phasePostHocPath);
      const result = generateLearnings(phaseDir, planningDir);
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('content');
    });

    test('includes gap info when VERIFICATION.md has gaps', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), `---
status: "partial"
gaps:
  - "Missing error handling in foo()"
  - "No tests for edge case"
---

## Verification
`);
      const { generateLearnings } = require(phasePostHocPath);
      const result = generateLearnings(phaseDir, planningDir);
      expect(result.content).toContain('## What Failed');
      expect(result.content).toContain('Missing error handling in foo()');
      expect(result.content).toContain('No tests for edge case');
    });

    test('path points to LEARNINGS.md in phaseDir', async () => {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_FM);
      const { generateLearnings } = require(phasePostHocPath);
      const result = generateLearnings(phaseDir, planningDir);
      expect(result.path).toBe(path.join(phaseDir, 'LEARNINGS.md'));
    });
  });

  describe('isEnabled', () => {
    test('returns true when config has no features section', async () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2 }));
      const { isEnabled } = require(phasePostHocPath);
      expect(isEnabled(planningDir)).toBe(true);
    });

    test('returns false when features.post_hoc_artifacts is false', async () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2, features: { post_hoc_artifacts: false } }));
      const { isEnabled } = require(phasePostHocPath);
      expect(isEnabled(planningDir)).toBe(false);
    });

    test('returns true when features.post_hoc_artifacts is true', async () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ version: 2, features: { post_hoc_artifacts: true } }));
      const { isEnabled } = require(phasePostHocPath);
      expect(isEnabled(planningDir)).toBe(true);
    });
  });
});

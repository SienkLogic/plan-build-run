const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'track-context-budget.js');

describe('track-context-budget.js', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(toolInput = {}, toolOutput = '') {
    const input = JSON.stringify({ tool_input: toolInput, tool_output: toolOutput });
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  function readTracker() {
    const trackerPath = path.join(planningDir, '.context-tracker');
    if (!fs.existsSync(trackerPath)) return null;
    return JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
  }

  test('exits silently when no .planning directory', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const output = run({ file_path: '/some/file.js' });
    expect(output).toBe('');
  });

  test('exits silently when no file_path in input', () => {
    const output = run({});
    expect(output).toBe('');
  });

  test('creates tracker file on first read', () => {
    run({ file_path: '/some/file.js' }, 'file content here');

    const tracker = readTracker();
    expect(tracker).not.toBeNull();
    expect(tracker.reads).toBe(1);
    expect(tracker.files).toContain('/some/file.js');
  });

  test('increments read count on subsequent reads', () => {
    run({ file_path: '/a.js' }, 'content a');
    run({ file_path: '/b.js' }, 'content b');
    run({ file_path: '/c.js' }, 'content c');

    const tracker = readTracker();
    expect(tracker.reads).toBe(3);
    expect(tracker.files).toHaveLength(3);
  });

  test('tracks total chars from tool output', () => {
    const content = 'x'.repeat(500);
    run({ file_path: '/file.js' }, content);

    const tracker = readTracker();
    expect(tracker.total_chars).toBe(500);
  });

  test('does not duplicate file paths', () => {
    run({ file_path: '/same.js' }, 'a');
    run({ file_path: '/same.js' }, 'b');

    const tracker = readTracker();
    expect(tracker.reads).toBe(2);
    expect(tracker.files).toHaveLength(1);
  });

  test('warns when read count exceeds threshold', () => {
    // Pre-seed tracker at threshold - 1
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 14, total_chars: 1000, files: []
    }));

    const output = run({ file_path: '/final.js' }, 'content');

    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Context Budget Warning');
    expect(parsed.additionalContext).toContain('15 file reads');
  });

  test('warns when char count exceeds threshold', () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 1, total_chars: 29500, files: []
    }));

    const bigContent = 'x'.repeat(600);
    const output = run({ file_path: '/big.js' }, bigContent);

    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Context Budget Warning');
    expect(parsed.additionalContext).toContain('chars read');
  });

  test('no warning when below thresholds', () => {
    const output = run({ file_path: '/small.js' }, 'tiny');
    expect(output).toBe('');
  });

  test('resets tracker when active skill changes', () => {
    const skillPath = path.join(planningDir, '.active-skill');
    fs.writeFileSync(skillPath, 'build');

    // Pre-seed tracker with different skill
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: 'plan', reads: 10, total_chars: 25000, files: ['/old.js']
    }));

    run({ file_path: '/new.js' }, 'content');

    const tracker = readTracker();
    expect(tracker.skill).toBe('build');
    expect(tracker.reads).toBe(1);
    expect(tracker.files).toEqual(['/new.js']);
  });

  test('does not reset when skill is the same', () => {
    const skillPath = path.join(planningDir, '.active-skill');
    fs.writeFileSync(skillPath, 'build');

    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: 'build', reads: 5, total_chars: 10000, files: ['/a.js']
    }));

    run({ file_path: '/b.js' }, 'content');

    const tracker = readTracker();
    expect(tracker.reads).toBe(6);
    expect(tracker.files).toContain('/a.js');
    expect(tracker.files).toContain('/b.js');
  });
});

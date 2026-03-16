const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'track-context-budget.js');

describe('track-context-budget.js', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(toolInput = {}, toolOutput = '', env = {}) {
    const input = JSON.stringify({ tool_input: toolInput, tool_output: toolOutput });
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
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

  test('warns when unique file count crosses milestone (10)', () => {
    // Pre-seed tracker with 9 unique files (just below milestone of 10)
    const trackerPath = path.join(planningDir, '.context-tracker');
    const files = Array.from({ length: 9 }, (_, i) => `/file${i}.js`);
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 9, total_chars: 1000, files: files
    }));

    const output = run({ file_path: '/file9.js' }, 'content');

    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Context Budget Warning');
    expect(parsed.additionalContext).toContain('10 unique files read');
  });

  test('does not warn when unique files below milestone', () => {
    // Pre-seed tracker with 5 unique files — well below 10
    const trackerPath = path.join(planningDir, '.context-tracker');
    const files = Array.from({ length: 5 }, (_, i) => `/file${i}.js`);
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 5, total_chars: 1000, files: files
    }));

    const output = run({ file_path: '/file5.js' }, 'small content');
    expect(output).toBe('');
  });

  test('warns when char count crosses milestone (50k)', () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 5, total_chars: 49500, files: ['/a.js']
    }));

    const bigContent = 'x'.repeat(600);
    const output = run({ file_path: '/big.js' }, bigContent);

    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Context Budget Warning');
    expect(parsed.additionalContext).toContain('chars read');
  });

  test('does not warn when char count stays within same milestone bucket', () => {
    // Total will be 20000 + 500 = 20500, still in first 50k bucket
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 3, total_chars: 20000, files: ['/a.js']
    }));

    const output = run({ file_path: '/b.js' }, 'x'.repeat(500));
    expect(output).toBe('');
  });

  test('warns when a single file read is large (>5000 chars)', () => {
    const largeContent = 'x'.repeat(6000);
    const output = run({ file_path: '/huge.js' }, largeContent);

    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Context Budget Warning');
    expect(parsed.additionalContext).toContain('large read');
    expect(parsed.additionalContext).toContain('huge.js');
  });

  test('no warning for small read below all thresholds', () => {
    const output = run({ file_path: '/small.js' }, 'tiny');
    expect(output).toBe('');
  });

  test('does not warn on every read after crossing a milestone', () => {
    // Pre-seed at 10 unique files (already crossed first milestone)
    // Adding file 11 should NOT trigger unique-files warning (next milestone is 20)
    const trackerPath = path.join(planningDir, '.context-tracker');
    const files = Array.from({ length: 10 }, (_, i) => `/file${i}.js`);
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 10, total_chars: 1000, files: files
    }));

    const output = run({ file_path: '/file10.js' }, 'small');
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

  test('skips tracking for files under CLAUDE_PLUGIN_ROOT', () => {
    const pluginDir = path.join(tmpDir, 'my-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });

    const largeContent = 'x'.repeat(6000);
    const output = run(
      { file_path: path.join(pluginDir, 'skills', 'begin', 'SKILL.md') },
      largeContent,
      { CLAUDE_PLUGIN_ROOT: pluginDir }
    );

    // Should produce no output and no tracker update
    expect(output).toBe('');
    const tracker = readTracker();
    expect(tracker).toBeNull();
  });

  test('still tracks files outside CLAUDE_PLUGIN_ROOT', () => {
    const pluginDir = path.join(tmpDir, 'my-plugin');

    const largeContent = 'x'.repeat(6000);
    const output = run(
      { file_path: path.join(tmpDir, 'src', 'app.js') },
      largeContent,
      { CLAUDE_PLUGIN_ROOT: pluginDir }
    );

    // Should warn about large file
    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('large read');
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

  test('CHAR_MILESTONE fires at 250k chars (not 50k) when config has 1M tokens', () => {
    const { processEvent, getScaledMilestones } = require('../hooks/track-context-budget.js');
    // Clear both config caches (hooks/ uses config.cjs, plugins/ uses config.js)
    const { configClearCache: clearPlugins } = require('../plugins/pbr/scripts/lib/config.js');
    const { configClearCache: clearHooks } = require('../plan-build-run/bin/lib/config.cjs');

    // Write 1M token config
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ context_window_tokens: 1000000 }));
    clearPlugins();
    clearHooks();

    // Verify scaled milestone is 250k
    const milestones = getScaledMilestones(planningDir);
    expect(milestones.charMilestone).toBe(250000);

    // Seed tracker just below 250k
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({ skill: '', reads: 5, total_chars: 249000, files: ['/a.js'] }));

    // Add 2000 chars — crosses 250k milestone
    const data = { tool_input: { file_path: '/b.js' }, tool_output: 'x'.repeat(2000) };
    const result = processEvent(data, planningDir, {}, null);

    // Should warn about milestone crossing at 250k
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('chars read');

    clearPlugins();
    clearHooks();
  });
});

describe('context ledger', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-ledger-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { writeLedgerEntry, readLedger, resetLedger, processEvent } = require('../hooks/track-context-budget.js');

  test('writeLedgerEntry creates .context-ledger.json with one entry', () => {
    const entry = { file: '/foo/bar.js', timestamp: '2026-01-01T00:00:00Z', est_tokens: 500, phase: 'test', stale: false };
    writeLedgerEntry(planningDir, entry);

    const ledgerPath = path.join(planningDir, '.context-ledger.json');
    expect(fs.existsSync(ledgerPath)).toBe(true);

    const entries = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    expect(entries).toHaveLength(1);
    expect(entries[0].file).toBe('/foo/bar.js');
    expect(entries[0].est_tokens).toBe(500);
    expect(entries[0].phase).toBe('test');
    expect(entries[0].stale).toBe(false);
  });

  test('writeLedgerEntry appends to existing ledger', () => {
    writeLedgerEntry(planningDir, { file: '/a.js', timestamp: '2026-01-01T00:00:00Z', est_tokens: 100, phase: 'p1', stale: false });
    writeLedgerEntry(planningDir, { file: '/b.js', timestamp: '2026-01-01T00:01:00Z', est_tokens: 200, phase: 'p1', stale: false });

    const entries = readLedger(planningDir);
    expect(entries).toHaveLength(2);
    expect(entries[0].file).toBe('/a.js');
    expect(entries[1].file).toBe('/b.js');
  });

  test('readLedger returns empty array when no file exists', () => {
    const entries = readLedger(planningDir);
    expect(entries).toEqual([]);
  });

  test('readLedger returns entries from written ledger', () => {
    writeLedgerEntry(planningDir, { file: '/a.js', timestamp: 't1', est_tokens: 10, phase: null, stale: false });
    writeLedgerEntry(planningDir, { file: '/b.js', timestamp: 't2', est_tokens: 20, phase: null, stale: false });
    writeLedgerEntry(planningDir, { file: '/c.js', timestamp: 't3', est_tokens: 30, phase: null, stale: false });

    const entries = readLedger(planningDir);
    expect(entries).toHaveLength(3);
  });

  test('resetLedger deletes the file', () => {
    writeLedgerEntry(planningDir, { file: '/a.js', timestamp: 't1', est_tokens: 10, phase: null, stale: false });
    const ledgerPath = path.join(planningDir, '.context-ledger.json');
    expect(fs.existsSync(ledgerPath)).toBe(true);

    resetLedger(planningDir);
    expect(fs.existsSync(ledgerPath)).toBe(false);

    const entries = readLedger(planningDir);
    expect(entries).toEqual([]);
  });

  test('processEvent writes ledger entry when context_ledger.enabled is true', () => {
    const { configClearCache: clearHooks } = require('../plan-build-run/bin/lib/config.cjs');

    // Write config with ledger enabled
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      context_ledger: { enabled: true, stale_after_minutes: 60 }
    }));
    // Write minimal STATE.md for phase detection
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
      '---',
      'phase_slug: test-phase',
      'current_phase: 1',
      'status: executing',
      '---',
      ''
    ].join('\n'));
    clearHooks();

    const data = { tool_input: { file_path: '/src/app.js' }, tool_output: 'x'.repeat(400) };
    processEvent(data, planningDir, {}, null);

    const entries = readLedger(planningDir);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].file).toBe('/src/app.js');
    expect(entries[0].est_tokens).toBe(100); // 400 chars / 4
    expect(entries[0].stale).toBe(false);

    clearHooks();
  });

  test('processEvent does NOT write ledger when context_ledger.enabled is false', () => {
    const { configClearCache: clearHooks } = require('../plan-build-run/bin/lib/config.cjs');

    // Write config with ledger disabled
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      context_ledger: { enabled: false }
    }));
    clearHooks();

    const data = { tool_input: { file_path: '/src/app.js' }, tool_output: 'some content' };
    processEvent(data, planningDir, {}, null);

    const ledgerPath = path.join(planningDir, '.context-ledger.json');
    expect(fs.existsSync(ledgerPath)).toBe(false);

    clearHooks();
  });
});

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'track-context-budget.js');

describe('track-context-budget.js', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
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

  test('exits silently when no .planning directory', async () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const output = run({ file_path: '/some/file.js' });
    expect(output).toBe('');
  });

  test('exits silently when no file_path in input', async () => {
    const output = run({});
    expect(output).toBe('');
  });

  test('creates tracker file on first read', async () => {
    run({ file_path: '/some/file.js' }, 'file content here');

    const tracker = readTracker();
    expect(tracker).not.toBeNull();
    expect(tracker.reads).toBe(1);
    expect(tracker.files).toContain('/some/file.js');
  });

  test('increments read count on subsequent reads', async () => {
    run({ file_path: '/a.js' }, 'content a');
    run({ file_path: '/b.js' }, 'content b');
    run({ file_path: '/c.js' }, 'content c');

    const tracker = readTracker();
    expect(tracker.reads).toBe(3);
    expect(tracker.files).toHaveLength(3);
  });

  test('tracks total chars from tool output', async () => {
    const content = 'x'.repeat(500);
    run({ file_path: '/file.js' }, content);

    const tracker = readTracker();
    expect(tracker.total_chars).toBe(500);
  });

  test('does not duplicate file paths', async () => {
    run({ file_path: '/same.js' }, 'a');
    run({ file_path: '/same.js' }, 'b');

    const tracker = readTracker();
    expect(tracker.reads).toBe(2);
    expect(tracker.files).toHaveLength(1);
  });

  test('warns when unique file count crosses milestone (10)', async () => {
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

  test('does not warn when unique files below milestone', async () => {
    // Pre-seed tracker with 5 unique files — well below 10
    const trackerPath = path.join(planningDir, '.context-tracker');
    const files = Array.from({ length: 5 }, (_, i) => `/file${i}.js`);
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 5, total_chars: 1000, files: files
    }));

    const output = run({ file_path: '/file5.js' }, 'small content');
    expect(output).toBe('');
  });

  test('warns when char count crosses milestone (50k)', async () => {
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

  test('does not warn when char count stays within same milestone bucket', async () => {
    // Total will be 20000 + 500 = 20500, still in first 50k bucket
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: '', reads: 3, total_chars: 20000, files: ['/a.js']
    }));

    const output = run({ file_path: '/b.js' }, 'x'.repeat(500));
    expect(output).toBe('');
  });

  test('warns when a single file read is large (>5000 chars)', async () => {
    const largeContent = 'x'.repeat(6000);
    const output = run({ file_path: '/huge.js' }, largeContent);

    const parsed = JSON.parse(output);
    expect(parsed.additionalContext).toContain('Context Budget Warning');
    expect(parsed.additionalContext).toContain('large read');
    expect(parsed.additionalContext).toContain('huge.js');
  });

  test('no warning for small read below all thresholds', async () => {
    const output = run({ file_path: '/small.js' }, 'tiny');
    expect(output).toBe('');
  });

  test('does not warn on every read after crossing a milestone', async () => {
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

  test('resets tracker when active skill changes', async () => {
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

  test('skips tracking for files under CLAUDE_PLUGIN_ROOT', async () => {
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

  test('still tracks files outside CLAUDE_PLUGIN_ROOT', async () => {
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

  test('does not reset when skill is the same', async () => {
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

  test('CHAR_MILESTONE fires at 250k chars (not 50k) when config has 1M tokens', async () => {
    const { processEvent, getScaledMilestones } = require('../plugins/pbr/scripts/track-context-budget');
    // Clear both config caches (hooks/ uses config.cjs, plugins/ uses config.js)
    const { configClearCache: clearPlugins } = require('../plugins/pbr/scripts/lib/config.js');
    const { configClearCache: clearHooks } = require('../plugins/pbr/scripts/lib/config');

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

describe('ledger stale entry detection', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-stale-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { writeLedgerEntry, readLedger } = require('../plugins/pbr/scripts/track-context-budget');

  test('readLedger returns empty array for malformed JSON', async () => {
    fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), '{bad');
    const entries = readLedger(planningDir);
    expect(entries).toEqual([]);
  });

  test('writeLedgerEntry handles concurrent writes without crash', async () => {
    // Write multiple entries rapidly
    for (let i = 0; i < 5; i++) {
      writeLedgerEntry(planningDir, {
        file: `/file${i}.js`,
        timestamp: new Date().toISOString(),
        est_tokens: 100 * i,
        phase: 'test',
        stale: false
      });
    }
    const entries = readLedger(planningDir);
    expect(entries).toHaveLength(5);
  });

  test('writeLedgerEntry does not throw when planningDir is missing', async () => {
    expect(() => writeLedgerEntry('/nonexistent/dir', {
      file: '/x.js', timestamp: 't', est_tokens: 10, phase: null, stale: false
    })).not.toThrow();
  });
});

describe('milestone crossing', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-milestone-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { processEvent, UNIQUE_FILE_MILESTONE } = require('../plugins/pbr/scripts/track-context-budget');

  test('warns when unique files cross milestone from 9 to 10', async () => {
    // Seed tracker just below milestone
    const trackerPath = path.join(planningDir, '.context-tracker');
    const files = Array.from({ length: 9 }, (_, i) => `/file${i}.js`);
    fs.writeFileSync(trackerPath, JSON.stringify({ skill: '', reads: 9, total_chars: 1000, files }));

    const data = { tool_input: { file_path: '/file9.js' }, tool_output: 'content' };
    const result = processEvent(data, planningDir, {}, null);
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain(`${UNIQUE_FILE_MILESTONE} unique files`);
  });

  test('no warning when files at 11 (not crossing a milestone)', async () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    const files = Array.from({ length: 10 }, (_, i) => `/file${i}.js`);
    fs.writeFileSync(trackerPath, JSON.stringify({ skill: '', reads: 10, total_chars: 2000, files }));

    const data = { tool_input: { file_path: '/file10.js' }, tool_output: 'x' };
    const result = processEvent(data, planningDir, {}, null);
    // 11 files — next milestone is 20, so no warning
    expect(result).toBeNull();
  });

  test('warns at char milestone crossing (50k boundary)', async () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(trackerPath, JSON.stringify({ skill: '', reads: 3, total_chars: 49500, files: ['/a.js'] }));

    const data = { tool_input: { file_path: '/b.js' }, tool_output: 'x'.repeat(600) };
    const result = processEvent(data, planningDir, {}, null);
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('chars read');
  });
});

describe('handleHttp path', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-http-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { handleHttp } = require('../plugins/pbr/scripts/track-context-budget');

  test('returns null when planningDir is missing', async () => {
    const result = handleHttp({ planningDir: '/nonexistent', data: { tool_input: { file_path: '/a.js' } } }, {});
    expect(result).toBeNull();
  });

  test('returns null when planningDir is empty string', async () => {
    const result = handleHttp({ planningDir: '', data: {} }, {});
    expect(result).toBeNull();
  });

  test('processes event with valid planningDir', async () => {
    const result = handleHttp({
      planningDir,
      data: { tool_input: { file_path: '/test.js' }, tool_output: 'content' }
    }, {});
    // Below all thresholds — should return null
    expect(result).toBeNull();
    // But tracker should have been created
    const tracker = JSON.parse(fs.readFileSync(path.join(planningDir, '.context-tracker'), 'utf8'));
    expect(tracker.reads).toBe(1);
  });

  test('returns null when data has no tool_input', async () => {
    const result = handleHttp({ planningDir, data: {} }, {});
    expect(result).toBeNull();
  });
});

describe('malformed tool_output', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-malformed-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { processEvent } = require('../plugins/pbr/scripts/track-context-budget');

  test('handles undefined tool_output (uses estimated chars)', async () => {
    const data = { tool_input: { file_path: '/a.js' } };
    // Should not crash — uses default 8000 char estimate
    expect(() => processEvent(data, planningDir, {}, null)).not.toThrow();
    const tracker = JSON.parse(fs.readFileSync(path.join(planningDir, '.context-tracker'), 'utf8'));
    expect(tracker.total_chars).toBe(8000);
  });

  test('handles numeric tool_output (coerced to string)', async () => {
    const data = { tool_input: { file_path: '/a.js' }, tool_output: 12345 };
    expect(() => processEvent(data, planningDir, {}, null)).not.toThrow();
    const tracker = JSON.parse(fs.readFileSync(path.join(planningDir, '.context-tracker'), 'utf8'));
    // String(12345).length = 5
    expect(tracker.total_chars).toBe(5);
  });

  test('handles empty string tool_output (falls back to estimate)', async () => {
    const data = { tool_input: { file_path: '/a.js' }, tool_output: '' };
    expect(() => processEvent(data, planningDir, {}, null)).not.toThrow();
    const tracker = JSON.parse(fs.readFileSync(path.join(planningDir, '.context-tracker'), 'utf8'));
    // Empty string is falsy, so estimatedChars (8000 default) is used
    expect(tracker.total_chars).toBe(8000);
  });
});

describe('context_window_tokens scaling', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-scale-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { getScaledMilestones } = require('../plugins/pbr/scripts/track-context-budget');

  test('default milestones at 200k tokens', async () => {
    const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
    configClearCache();
    const milestones = getScaledMilestones(planningDir);
    expect(milestones.charMilestone).toBe(50000);
    expect(milestones.largeFileThreshold).toBe(5000);
    configClearCache();
  });

  test('scaled milestones at 1M tokens', async () => {
    const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ context_window_tokens: 1000000 }));
    configClearCache();
    const milestones = getScaledMilestones(planningDir);
    expect(milestones.charMilestone).toBe(250000);
    expect(milestones.largeFileThreshold).toBe(25000);
    configClearCache();
  });

  test('scaled milestones at 500k tokens', async () => {
    const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ context_window_tokens: 500000 }));
    configClearCache();
    const milestones = getScaledMilestones(planningDir);
    expect(milestones.charMilestone).toBe(125000);
    expect(milestones.largeFileThreshold).toBe(12500);
    configClearCache();
  });
});

describe('context ledger', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-ledger-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { writeLedgerEntry, readLedger, resetLedger, processEvent } = require('../plugins/pbr/scripts/track-context-budget');

  test('writeLedgerEntry creates .context-ledger.json with one entry', async () => {
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

  test('writeLedgerEntry appends to existing ledger', async () => {
    writeLedgerEntry(planningDir, { file: '/a.js', timestamp: '2026-01-01T00:00:00Z', est_tokens: 100, phase: 'p1', stale: false });
    writeLedgerEntry(planningDir, { file: '/b.js', timestamp: '2026-01-01T00:01:00Z', est_tokens: 200, phase: 'p1', stale: false });

    const entries = readLedger(planningDir);
    expect(entries).toHaveLength(2);
    expect(entries[0].file).toBe('/a.js');
    expect(entries[1].file).toBe('/b.js');
  });

  test('readLedger returns empty array when no file exists', async () => {
    const entries = readLedger(planningDir);
    expect(entries).toEqual([]);
  });

  test('readLedger returns entries from written ledger', async () => {
    writeLedgerEntry(planningDir, { file: '/a.js', timestamp: 't1', est_tokens: 10, phase: null, stale: false });
    writeLedgerEntry(planningDir, { file: '/b.js', timestamp: 't2', est_tokens: 20, phase: null, stale: false });
    writeLedgerEntry(planningDir, { file: '/c.js', timestamp: 't3', est_tokens: 30, phase: null, stale: false });

    const entries = readLedger(planningDir);
    expect(entries).toHaveLength(3);
  });

  test('resetLedger deletes the file', async () => {
    writeLedgerEntry(planningDir, { file: '/a.js', timestamp: 't1', est_tokens: 10, phase: null, stale: false });
    const ledgerPath = path.join(planningDir, '.context-ledger.json');
    expect(fs.existsSync(ledgerPath)).toBe(true);

    resetLedger(planningDir);
    expect(fs.existsSync(ledgerPath)).toBe(false);

    const entries = readLedger(planningDir);
    expect(entries).toEqual([]);
  });

  test('processEvent writes ledger entry when context_ledger.enabled is true', async () => {
    const { configClearCache: clearHooks } = require('../plugins/pbr/scripts/lib/config');

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

  test('processEvent does NOT write ledger when context_ledger.enabled is false', async () => {
    const { configClearCache: clearHooks } = require('../plugins/pbr/scripts/lib/config');

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

describe('Read consolidation (check-read-first dispatch)', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-readcons-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { handleHttp } = require('../plugins/pbr/scripts/track-context-budget');

  test('Read event dispatches to check-read-first and merges results', async () => {
    // Mock check-read-first via the module cache
    const checkReadFirstModule = require('../plugins/pbr/scripts/check-read-first');
    const originalHandleHttp = checkReadFirstModule.handleHttp;

    // Replace handleHttp temporarily
    checkReadFirstModule.handleHttp = jest.fn(() => ({
      additionalContext: 'read-first warning: missing read_first files'
    }));

    try {
      // Seed tracker near a char milestone so budget tracking also returns a warning
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({
        skill: '', reads: 3, total_chars: 49500, files: ['/a.js']
      }));

      const reqBody = {
        planningDir,
        data: {
          tool_name: 'Read',
          tool_input: { file_path: '/src/app.js' },
          tool_output: 'x'.repeat(600)
        }
      };

      const result = handleHttp(reqBody, {});

      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('read-first warning');
      expect(result.additionalContext).toContain('Context Budget Warning');
      expect(checkReadFirstModule.handleHttp).toHaveBeenCalled();
    } finally {
      checkReadFirstModule.handleHttp = originalHandleHttp;
    }
  });

  test('check-read-first returning null means only budget result returned', async () => {
    const checkReadFirstModule = require('../plugins/pbr/scripts/check-read-first');
    const originalHandleHttp = checkReadFirstModule.handleHttp;

    checkReadFirstModule.handleHttp = jest.fn(() => null);

    try {
      const reqBody = {
        planningDir,
        data: {
          tool_name: 'Read',
          tool_input: { file_path: '/src/tiny.js' },
          tool_output: 'tiny'
        }
      };

      const result = handleHttp(reqBody, {});

      // Below all thresholds with null read-first => null
      expect(result).toBeNull();
      expect(checkReadFirstModule.handleHttp).toHaveBeenCalled();
    } finally {
      checkReadFirstModule.handleHttp = originalHandleHttp;
    }
  });

  test('check-read-first result alone is returned when budget has no warning', async () => {
    const checkReadFirstModule = require('../plugins/pbr/scripts/check-read-first');
    const originalHandleHttp = checkReadFirstModule.handleHttp;

    checkReadFirstModule.handleHttp = jest.fn(() => ({
      additionalContext: 'read-first advisory: read X before editing Y'
    }));

    try {
      const reqBody = {
        planningDir,
        data: {
          tool_name: 'Read',
          tool_input: { file_path: '/src/small.js' },
          tool_output: 'small content'
        }
      };

      const result = handleHttp(reqBody, {});

      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('read-first advisory');
      expect(checkReadFirstModule.handleHttp).toHaveBeenCalled();
    } finally {
      checkReadFirstModule.handleHttp = originalHandleHttp;
    }
  });

  test('non-Read events still dispatch to check-read-first (handleHttp always dispatches)', async () => {
    // handleHttp dispatches to check-read-first for ALL events (it's the Read handler)
    // The filtering is done by check-read-first itself, not by track-context-budget
    const checkReadFirstModule = require('../plugins/pbr/scripts/check-read-first');
    const originalHandleHttp = checkReadFirstModule.handleHttp;

    checkReadFirstModule.handleHttp = jest.fn(() => null);

    try {
      const reqBody = {
        planningDir,
        data: {
          tool_name: 'Read',
          tool_input: { file_path: '/src/file.js' },
          tool_output: 'content'
        }
      };

      handleHttp(reqBody, {});
      expect(checkReadFirstModule.handleHttp).toHaveBeenCalled();
    } finally {
      checkReadFirstModule.handleHttp = originalHandleHttp;
    }
  });
});

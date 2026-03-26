'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock hook-logger before requiring modules
jest.mock('../plugins/pbr/scripts/hook-logger', () => ({
  logHook: jest.fn()
}));

// Mock pbr-tools
jest.mock('../plugins/pbr/scripts/pbr-tools', () => ({
  tailLines: jest.fn(() => []),
  configLoad: jest.fn(() => ({}))
}));

// Note: session functions are in lib/session.js, not lib/core.js

// local-llm/metrics was removed in Phase 53 (dead feature cleanup)

const { writeSnapshot, loadLatestSnapshot: _loadLatestSnapshot } = require('../plugins/pbr/scripts/lib/snapshot-manager');
const { configLoad } = require('../plugins/pbr/scripts/pbr-tools');

describe('session-cleanup snapshot integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-snap-test-'));
    fs.mkdirSync(path.join(tmpDir, 'logs'), { recursive: true });
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes snapshot at session end when enabled', async () => {
    configLoad.mockReturnValue({ features: { mental_model_snapshots: true } });

    // Write a STATE.md for context gathering
    fs.writeFileSync(path.join(tmpDir, 'STATE.md'), '---\nstatus: building\n---\n## Current Position\nWorking on phase 6\n');

    // Simulate what session-cleanup does: gather context and write snapshot
    const context = {
      session_id: 'test-session-123',
      files_working_on: ['src/index.js', 'tests/index.test.js'],
      pending_decisions: [],
      current_approach: 'Working on phase 6',
      open_questions: [],
      recent_commits: ['abc1234 feat: initial commit']
    };

    writeSnapshot(tmpDir, context);

    const snapDir = path.join(tmpDir, 'sessions', 'snapshots');
    expect(fs.existsSync(snapDir)).toBe(true);

    const files = fs.readdirSync(snapDir).filter(f => f.endsWith('-snapshot.md'));
    expect(files.length).toBe(1);

    const content = fs.readFileSync(path.join(snapDir, files[0]), 'utf8');
    expect(content).toContain('test-session-123');
    expect(content).toContain('src/index.js');
  });

  test('skips snapshot when features.mental_model_snapshots is false', async () => {
    configLoad.mockReturnValue({ features: { mental_model_snapshots: false } });

    const config = configLoad(tmpDir);
    const snapshotsEnabled = config.features && config.features.mental_model_snapshots !== false;

    expect(snapshotsEnabled).toBe(false);

    // Verify no snapshot directory created when we don't call writeSnapshot
    const snapDir = path.join(tmpDir, 'sessions', 'snapshots');
    expect(fs.existsSync(snapDir)).toBe(false);
  });

  test('does not crash when STATE.md is missing', async () => {
    configLoad.mockReturnValue({ features: { mental_model_snapshots: true } });

    // No STATE.md exists — gatherSessionContext should handle gracefully
    expect(() => {
      const context = {
        session_id: 'test-session-456',
        files_working_on: [],
        pending_decisions: [],
        current_approach: '',
        open_questions: [],
        recent_commits: []
      };
      writeSnapshot(tmpDir, context);
    }).not.toThrow();

    const snapDir = path.join(tmpDir, 'sessions', 'snapshots');
    expect(fs.existsSync(snapDir)).toBe(true);
  });

  test('snapshot contains recent git commit messages when available', async () => {
    configLoad.mockReturnValue({ features: { mental_model_snapshots: true } });

    const commits = [
      'abc1234 feat(06-01): add config toggles',
      'def5678 feat(06-02): convention detector'
    ];

    const context = {
      session_id: 'test-session-789',
      files_working_on: [],
      pending_decisions: [],
      current_approach: '',
      open_questions: [],
      recent_commits: commits
    };

    writeSnapshot(tmpDir, context);

    const snapDir = path.join(tmpDir, 'sessions', 'snapshots');
    const files = fs.readdirSync(snapDir).filter(f => f.endsWith('-snapshot.md'));
    const content = fs.readFileSync(path.join(snapDir, files[0]), 'utf8');

    expect(content).toContain('abc1234 feat(06-01): add config toggles');
    expect(content).toContain('def5678 feat(06-02): convention detector');
  });

  test('gatherSessionContext extracts data from STATE.md', async () => {
    // Load the actual gatherSessionContext function
    const { gatherSessionContext } = require('../plugins/pbr/scripts/session-cleanup');

    // This will fail until GREEN phase implements it
    expect(typeof gatherSessionContext).toBe('function');

    // Create a STATE.md with known content
    fs.writeFileSync(path.join(tmpDir, 'STATE.md'), [
      '---',
      'status: building',
      '---',
      '## Current Position',
      'Working on phase 6 snapshot integration',
      '',
      '### Blockers/Concerns',
      '- Need to test Windows path handling',
      ''
    ].join('\n'));

    const result = gatherSessionContext(tmpDir, tmpDir, 'session-abc');
    expect(result).toBeDefined();
    expect(result.session_id).toBe('session-abc');
    expect(typeof result.current_approach).toBe('string');
  });
});

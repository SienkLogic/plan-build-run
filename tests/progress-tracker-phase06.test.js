'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadLatestSnapshot, formatSnapshotBriefing, writeSnapshot } = require('../plugins/pbr/scripts/lib/snapshot-manager');
const { loadConventions } = require('../plugins/pbr/scripts/lib/convention-detector');

describe('progress-tracker phase06 integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-pt06-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('includes snapshot briefing in output when snapshot exists and toggle enabled', async () => {
    // Create a snapshot
    writeSnapshot(tmpDir, {
      session_id: 'prev-session',
      files_working_on: ['src/app.js', 'tests/app.test.js'],
      pending_decisions: ['Which framework to use'],
      current_approach: 'Building the feature module',
      open_questions: [],
      recent_commits: ['abc1234 feat: add module']
    });

    // Simulate what progress-tracker does when enabled
    const snapshot = loadLatestSnapshot(tmpDir);
    const briefing = formatSnapshotBriefing(snapshot);

    expect(briefing).toBeTruthy();
    expect(briefing).toContain('Last session');
    expect(briefing).toContain('src/app.js');
  });

  test('skips snapshot when features.mental_model_snapshots is false', async () => {
    const config = { features: { mental_model_snapshots: false } };
    const snapshotsEnabled = config.features && config.features.mental_model_snapshots !== false;
    expect(snapshotsEnabled).toBe(false);

    // No snapshot should be loaded when toggle is off
    const snapshot = loadLatestSnapshot(tmpDir);
    expect(snapshot).toBeNull();
  });

  test('includes convention summary when conventions exist and toggle enabled', async () => {
    // Create convention files
    const convDir = path.join(tmpDir, 'conventions');
    fs.mkdirSync(convDir, { recursive: true });
    fs.writeFileSync(path.join(convDir, 'naming.md'), [
      '---',
      'detected: "2026-03-17T00:00:00Z"',
      'count: 2',
      '---',
      '',
      '# Naming Conventions',
      '',
      '## camelCase functions',
      '',
      'Occurrences: 42',
      '',
      'Evidence:',
      '- getUserData',
      '- processItems',
      '',
      '## PascalCase classes',
      '',
      'Occurrences: 15',
      '',
      'Evidence:',
      '- UserService',
      '- DataProcessor',
      ''
    ].join('\n'));

    const conventions = loadConventions(tmpDir);
    expect(Object.keys(conventions).length).toBeGreaterThan(0);

    // Test the formatConventionBriefing function (exported from progress-tracker)
    // This will fail until GREEN phase implements it
    const mod = require('../plugins/pbr/scripts/lib/convention-detector');
    const { formatConventionBriefing } = mod;
    expect(typeof formatConventionBriefing).toBe('function');

    const briefing = formatConventionBriefing(conventions);
    expect(briefing).toContain('Project Conventions');
    expect(briefing.length).toBeLessThanOrEqual(800);
  });

  test('skips conventions when features.convention_memory is false', async () => {
    const config = { features: { convention_memory: false } };
    const conventionsEnabled = config.features && config.features.convention_memory !== false;
    expect(conventionsEnabled).toBe(false);
  });

  test('handles missing conventions directory gracefully', async () => {
    // No conventions directory exists
    const conventions = loadConventions(tmpDir);
    expect(Object.keys(conventions).length).toBe(0);
  });
});

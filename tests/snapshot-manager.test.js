'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeSnapshot, loadLatestSnapshot, formatSnapshotBriefing } = require('../plugins/pbr/scripts/lib/snapshot-manager');

describe('snapshot-manager', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeContext = (overrides = {}) => ({
    session_id: 'test-session-001',
    files_working_on: ['src/index.js', 'tests/index.test.js'],
    pending_decisions: ['Whether to use Redis or in-memory cache'],
    current_approach: 'Implementing the cache layer first, then adding persistence',
    open_questions: ['What is the expected TTL for cache entries?'],
    recent_commits: ['abc1234 feat: add cache module'],
    ...overrides,
  });

  describe('writeSnapshot', () => {
    test('creates timestamped file in sessions/snapshots/', () => {
      writeSnapshot(planningDir, makeContext());
      const snapDir = path.join(planningDir, 'sessions', 'snapshots');
      expect(fs.existsSync(snapDir)).toBe(true);
      const files = fs.readdirSync(snapDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-snapshot\.md$/);
    });

    test('includes YAML frontmatter with timestamp and session_id', () => {
      writeSnapshot(planningDir, makeContext());
      const snapDir = path.join(planningDir, 'sessions', 'snapshots');
      const files = fs.readdirSync(snapDir);
      const content = fs.readFileSync(path.join(snapDir, files[0]), 'utf8');
      expect(content).toMatch(/^---/);
      expect(content).toMatch(/timestamp:/);
      expect(content).toMatch(/session_id:\s*"test-session-001"/);
      expect(content).toMatch(/files_count:\s*2/);
    });
  });

  describe('loadLatestSnapshot', () => {
    test('returns the most recent snapshot', () => {
      // Write two snapshots with different data
      writeSnapshot(planningDir, makeContext({ session_id: 'first' }));

      // Rename the file to an earlier timestamp to ensure ordering
      const snapDir = path.join(planningDir, 'sessions', 'snapshots');
      const firstFile = fs.readdirSync(snapDir)[0];
      fs.renameSync(
        path.join(snapDir, firstFile),
        path.join(snapDir, '2020-01-01T00-00-00-snapshot.md')
      );

      writeSnapshot(planningDir, makeContext({ session_id: 'second' }));

      const latest = loadLatestSnapshot(planningDir);
      expect(latest).not.toBeNull();
      expect(latest.session_id).toBe('second');
    });

    test('returns null when no snapshots exist', () => {
      const result = loadLatestSnapshot(planningDir);
      expect(result).toBeNull();
    });

    test('returns null when snapshot exceeds maxAgeHours', () => {
      const snapDir = path.join(planningDir, 'sessions', 'snapshots');
      fs.mkdirSync(snapDir, { recursive: true });
      const oldTimestamp = new Date(Date.now() - 72 * 3600000).toISOString();
      const fileTs = oldTimestamp.replace(/:/g, '-').replace(/\.\d+Z$/, '');
      fs.writeFileSync(
        path.join(snapDir, `${fileTs}-snapshot.md`),
        `---\ntimestamp: "${oldTimestamp}"\nsession_id: "old-session"\nfiles_count: 1\n---\n\n## Working Set\n- src/old.js\n`
      );
      const result = loadLatestSnapshot(planningDir, { maxAgeHours: 48 });
      expect(result).toBeNull();
    });

    test('returns snapshot when within maxAgeHours', () => {
      const snapDir = path.join(planningDir, 'sessions', 'snapshots');
      fs.mkdirSync(snapDir, { recursive: true });
      const recentTimestamp = new Date(Date.now() - 1 * 3600000).toISOString();
      const fileTs = recentTimestamp.replace(/:/g, '-').replace(/\.\d+Z$/, '');
      fs.writeFileSync(
        path.join(snapDir, `${fileTs}-snapshot.md`),
        `---\ntimestamp: "${recentTimestamp}"\nsession_id: "recent-session"\nfiles_count: 1\n---\n\n## Working Set\n- src/recent.js\n`
      );
      const result = loadLatestSnapshot(planningDir, { maxAgeHours: 48 });
      expect(result).not.toBeNull();
      expect(result.session_id).toBe('recent-session');
    });

    test('returns snapshot when maxAgeHours is not set (backward compat)', () => {
      const snapDir = path.join(planningDir, 'sessions', 'snapshots');
      fs.mkdirSync(snapDir, { recursive: true });
      const oldTimestamp = new Date(Date.now() - 72 * 3600000).toISOString();
      const fileTs = oldTimestamp.replace(/:/g, '-').replace(/\.\d+Z$/, '');
      fs.writeFileSync(
        path.join(snapDir, `${fileTs}-snapshot.md`),
        `---\ntimestamp: "${oldTimestamp}"\nsession_id: "old-no-limit"\nfiles_count: 1\n---\n\n## Working Set\n- src/old.js\n`
      );
      const result = loadLatestSnapshot(planningDir);
      expect(result).not.toBeNull();
      expect(result.session_id).toBe('old-no-limit');
    });
  });

  describe('formatSnapshotBriefing', () => {
    test('produces concise text under 1200 chars', () => {
      writeSnapshot(planningDir, makeContext());
      const snapshot = loadLatestSnapshot(planningDir);
      const briefing = formatSnapshotBriefing(snapshot);

      expect(typeof briefing).toBe('string');
      expect(briefing.length).toBeLessThan(1200);
      expect(briefing).toMatch(/Working on/i);
      expect(briefing).toMatch(/src\/index\.js/);
    });

    test('returns empty string for null snapshot', () => {
      expect(formatSnapshotBriefing(null)).toBe('');
    });
  });

  describe('pruning', () => {
    test('caps snapshots directory at 10 files (removes oldest)', () => {
      const snapDir = path.join(planningDir, 'sessions', 'snapshots');
      fs.mkdirSync(snapDir, { recursive: true });

      // Create 12 pre-existing snapshot files with ascending timestamps
      for (let i = 0; i < 12; i++) {
        const ts = `2020-01-${String(i + 1).padStart(2, '0')}T00-00-00`;
        fs.writeFileSync(
          path.join(snapDir, `${ts}-snapshot.md`),
          `---\ntimestamp: "2020-01-${String(i + 1).padStart(2, '0')}"\nsession_id: "s${i}"\nfiles_count: 0\n---\n\nEmpty snapshot.`
        );
      }

      // Write one more (triggers prune)
      writeSnapshot(planningDir, makeContext());

      const remaining = fs.readdirSync(snapDir);
      expect(remaining.length).toBeLessThanOrEqual(10);
    });
  });
});

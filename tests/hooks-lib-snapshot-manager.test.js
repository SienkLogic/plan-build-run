/**
 * Tests for hooks/lib/snapshot-manager.js — Session snapshot management.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  writeSnapshot,
  loadLatestSnapshot,
  formatSnapshotBriefing
} = require('../hooks/lib/snapshot-manager');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-snap-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- writeSnapshot ---

describe('writeSnapshot', () => {
  it('creates snapshot file in sessions/snapshots/', () => {
    writeSnapshot(planningDir, {
      session_id: 'test-session',
      files_working_on: ['hooks/lib/context.js'],
      current_approach: 'Testing the module',
      pending_decisions: [],
      open_questions: [],
      recent_commits: []
    });

    const snapDir = path.join(planningDir, 'sessions', 'snapshots');
    expect(fs.existsSync(snapDir)).toBe(true);

    const files = fs.readdirSync(snapDir).filter(f => f.endsWith('-snapshot.md'));
    expect(files.length).toBe(1);
  });

  it('writes correct frontmatter and sections', () => {
    writeSnapshot(planningDir, {
      session_id: 'sess-123',
      files_working_on: ['a.js', 'b.js'],
      current_approach: 'Refactoring the API',
      pending_decisions: ['Choose framework'],
      open_questions: ['Which DB?'],
      recent_commits: ['abc1234 feat: init']
    });

    const snapDir = path.join(planningDir, 'sessions', 'snapshots');
    const files = fs.readdirSync(snapDir);
    const content = fs.readFileSync(path.join(snapDir, files[0]), 'utf8');

    expect(content).toContain('session_id: "sess-123"');
    expect(content).toContain('## Working Set');
    expect(content).toContain('- a.js');
    expect(content).toContain('- b.js');
    expect(content).toContain('## Current Approach');
    expect(content).toContain('Refactoring the API');
    expect(content).toContain('## Pending Decisions');
    expect(content).toContain('- Choose framework');
    expect(content).toContain('## Open Questions');
    expect(content).toContain('- Which DB?');
    expect(content).toContain('## Recent Commits');
    expect(content).toContain('- abc1234 feat: init');
  });

  it('handles empty context gracefully', () => {
    writeSnapshot(planningDir, {});
    const snapDir = path.join(planningDir, 'sessions', 'snapshots');
    const files = fs.readdirSync(snapDir).filter(f => f.endsWith('-snapshot.md'));
    expect(files.length).toBe(1);
  });
});

// --- loadLatestSnapshot ---

describe('loadLatestSnapshot', () => {
  it('returns null when snapshots directory does not exist', () => {
    expect(loadLatestSnapshot(planningDir)).toBeNull();
  });

  it('returns null when snapshots directory is empty', () => {
    fs.mkdirSync(path.join(planningDir, 'sessions', 'snapshots'), { recursive: true });
    expect(loadLatestSnapshot(planningDir)).toBeNull();
  });

  it('loads the most recent snapshot', () => {
    // Write two snapshots
    writeSnapshot(planningDir, {
      session_id: 'old-session',
      files_working_on: ['old.js'],
      current_approach: 'old approach'
    });

    // Force a different timestamp by writing manually
    const snapDir = path.join(planningDir, 'sessions', 'snapshots');
    fs.writeFileSync(
      path.join(snapDir, '2099-12-31T23-59-59-snapshot.md'),
      '---\ntimestamp: "2099-12-31T23:59:59Z"\nsession_id: "newest"\nfiles_count: 1\n---\n\n## Working Set\n- newest.js\n\n## Current Approach\nnewest approach\n\n## Pending Decisions\nNone\n\n## Open Questions\nNone\n\n## Recent Commits\nNone\n'
    );

    const result = loadLatestSnapshot(planningDir);
    expect(result).not.toBeNull();
    expect(result.session_id).toBe('newest');
  });

  it('round-trip: write then load returns same data', () => {
    writeSnapshot(planningDir, {
      session_id: 'rt-session',
      files_working_on: ['x.js', 'y.js'],
      current_approach: 'round trip test',
      pending_decisions: ['decision A'],
      open_questions: ['question B'],
      recent_commits: ['def456 fix: bug']
    });

    const loaded = loadLatestSnapshot(planningDir);
    expect(loaded).not.toBeNull();
    expect(loaded.session_id).toBe('rt-session');
    expect(loaded.files_working_on).toEqual(['x.js', 'y.js']);
    expect(loaded.current_approach).toContain('round trip test');
    expect(loaded.pending_decisions).toContain('decision A');
    expect(loaded.open_questions).toContain('question B');
    expect(loaded.recent_commits).toContain('def456 fix: bug');
  });
});

// --- formatSnapshotBriefing ---

describe('formatSnapshotBriefing', () => {
  it('returns empty string for null snapshot', () => {
    expect(formatSnapshotBriefing(null)).toBe('');
  });

  it('formats basic snapshot info', () => {
    const result = formatSnapshotBriefing({
      timestamp: new Date().toISOString(),
      files_working_on: ['a.js', 'b.js'],
      current_approach: 'Testing approach',
      pending_decisions: ['decision 1'],
      open_questions: []
    });

    expect(result).toContain('Last session');
    expect(result).toContain('Working on: a.js, b.js');
    expect(result).toContain('Approach: Testing approach');
    expect(result).toContain('1 decisions, 0 open questions');
  });

  it('shows file count and truncates when more than 3 files', () => {
    const result = formatSnapshotBriefing({
      timestamp: new Date().toISOString(),
      files_working_on: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'],
      current_approach: '',
      pending_decisions: [],
      open_questions: []
    });

    expect(result).toContain('+2 more');
    expect(result).toContain('5 files');
  });

  it('truncates long approaches', () => {
    const longApproach = 'A'.repeat(200);
    const result = formatSnapshotBriefing({
      timestamp: new Date().toISOString(),
      files_working_on: [],
      current_approach: longApproach,
      pending_decisions: [],
      open_questions: []
    });

    expect(result).toContain('...');
    // The approach line should be truncated to 100 chars + ellipsis
    expect(result.length).toBeLessThan(300);
  });

  it('caps total output at 1200 chars', () => {
    const result = formatSnapshotBriefing({
      timestamp: new Date().toISOString(),
      files_working_on: Array.from({ length: 100 }, (_, i) => `file-${i}.js`),
      current_approach: 'X'.repeat(500),
      pending_decisions: Array.from({ length: 50 }, (_, i) => `decision-${i}`),
      open_questions: Array.from({ length: 50 }, (_, i) => `question-${i}`)
    });

    expect(result.length).toBeLessThanOrEqual(1200);
  });

  it('includes relative time', () => {
    // Use a timestamp from 30 minutes ago
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = formatSnapshotBriefing({
      timestamp: thirtyMinAgo,
      files_working_on: [],
      current_approach: '',
      pending_decisions: [],
      open_questions: []
    });

    expect(result).toContain('30m ago');
  });
});

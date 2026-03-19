/**
 * Tests for auto-cleanup library.
 *
 * - Unit tests: matchScore signal detection
 * - Mutation tests: autoCloseTodos, autoArchiveNotes in temp directories
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  matchScore,
  autoCloseTodos,
  autoArchiveNotes
} = require('../plugins/pbr/scripts/lib/auto-cleanup');

// ---------------------------------------------------------------------------
// matchScore
// ---------------------------------------------------------------------------
describe('matchScore', () => {
  const baseContext = {
    phaseName: 'auto cleanup completion',
    phaseNum: 38,
    keyFiles: ['plugins/pbr/scripts/lib/auto-cleanup.js'],
    commitMessages: ['add auto-cleanup library with matching logic'],
    summaryDescriptions: ['Create auto-cleanup functions for phase completion']
  };

  test('score 0: completely unrelated item', () => {
    const result = matchScore(
      { title: 'Fix database connection pooling', body: 'MongoDB timeout issues in production' },
      baseContext
    );
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
  });

  test('score 1 (partial): title keyword overlap but no other signals', () => {
    const result = matchScore(
      { title: 'Review cleanup procedures', body: 'General code review needed' },
      { phaseName: 'cleanup review procedures', phaseNum: 5, keyFiles: [], commitMessages: [], summaryDescriptions: [] }
    );
    expect(result.score).toBe(1);
    expect(result.signals).toContain('title-keyword');
  });

  test('score 2: title keywords AND file path match', () => {
    const result = matchScore(
      {
        title: 'Implement auto cleanup logic',
        body: 'Need to create plugins/pbr/scripts/lib/auto-cleanup.js with matching'
      },
      baseContext
    );
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.signals).toContain('title-keyword');
    expect(result.signals).toContain('file-path');
  });

  test('score 3+: multiple signals fire', () => {
    const result = matchScore(
      {
        title: 'Implement auto cleanup completion logic',
        body: 'Modify plugins/pbr/scripts/lib/auto-cleanup.js. add auto-cleanup library with matching logic'
      },
      baseContext
    );
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.signals.length).toBeGreaterThanOrEqual(3);
  });

  test('file path match is case insensitive', () => {
    const result = matchScore(
      { title: 'unrelated title words here now', body: 'See Plugins/PBR/Scripts/Lib/Auto-Cleanup.js for details' },
      baseContext
    );
    expect(result.signals).toContain('file-path');
  });

  test('commit message match fires when substring found', () => {
    const result = matchScore(
      { title: 'something else entirely different', body: 'Related to: add auto-cleanup library with matching logic' },
      baseContext
    );
    expect(result.signals).toContain('commit-message');
  });

  test('summary description match fires when substring found', () => {
    const result = matchScore(
      { title: 'something else entirely different', body: 'Create auto-cleanup functions for phase completion' },
      baseContext
    );
    expect(result.signals).toContain('summary-description');
  });

  test('handles missing/empty context fields gracefully', () => {
    const result = matchScore(
      { title: 'test', body: 'test' },
      { phaseName: '', phaseNum: 1 }
    );
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
  });

  test('handles null item fields gracefully', () => {
    const result = matchScore(
      { title: null, body: null },
      baseContext
    );
    expect(result.score).toBe(0);
  });

  test('short commit messages (<= 5 chars) are ignored', () => {
    const result = matchScore(
      { title: 'fix something', body: 'fix' },
      { phaseName: 'fix', phaseNum: 1, keyFiles: [], commitMessages: ['fix'], summaryDescriptions: [] }
    );
    expect(result.signals).not.toContain('commit-message');
  });
});

// ---------------------------------------------------------------------------
// autoCloseTodos
// ---------------------------------------------------------------------------
describe('autoCloseTodos', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cleanup-'));
    const pendingDir = path.join(tmpDir, 'todos', 'pending');
    const doneDir = path.join(tmpDir, 'todos', 'done');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.mkdirSync(doneDir, { recursive: true });

    // Todo 1: matches context (2+ signals) — title keywords + file path
    fs.writeFileSync(path.join(pendingDir, '001-auto-cleanup-completion.md'), [
      '---',
      'title: "Implement auto cleanup completion"',
      'status: pending',
      'priority: P2',
      'source: cli',
      'created: 2026-03-19',
      'theme: general',
      '---',
      '',
      '## Goal',
      '',
      'Create plugins/pbr/scripts/lib/auto-cleanup.js'
    ].join('\n'));

    // Todo 2: partial match (1 signal) — file path match only, no title keyword overlap
    fs.writeFileSync(path.join(pendingDir, '002-cleanup-old-logs.md'), [
      '---',
      'title: "Review old log rotation"',
      'status: pending',
      'priority: P2',
      'source: cli',
      'created: 2026-03-19',
      'theme: general',
      '---',
      '',
      '## Goal',
      '',
      'Check plugins/pbr/scripts/lib/auto-cleanup.js for log handling'
    ].join('\n'));

    // Todo 3: no match at all
    fs.writeFileSync(path.join(pendingDir, '003-fix-database.md'), [
      '---',
      'title: "Fix database connection pooling"',
      'status: pending',
      'priority: P1',
      'source: cli',
      'created: 2026-03-19',
      'theme: backend',
      '---',
      '',
      '## Goal',
      '',
      'Fix MongoDB timeout issues'
    ].join('\n'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('closes matching todo, reports partial, skips unrelated', () => {
    const context = {
      phaseName: 'auto cleanup completion',
      phaseNum: 38,
      keyFiles: ['plugins/pbr/scripts/lib/auto-cleanup.js'],
      commitMessages: [],
      summaryDescriptions: []
    };

    const result = autoCloseTodos(tmpDir, context);

    // One todo should be closed (2+ signals)
    expect(result.closed.length).toBe(1);
    expect(result.closed[0].number).toBe(1);
    expect(result.closed[0].signals.length).toBeGreaterThanOrEqual(2);

    // Verify moved to done/
    const doneFiles = fs.readdirSync(path.join(tmpDir, 'todos', 'done'));
    expect(doneFiles.some(f => f.startsWith('001-'))).toBe(true);

    // Verify removed from pending/
    const pendingFiles = fs.readdirSync(path.join(tmpDir, 'todos', 'pending'));
    expect(pendingFiles.some(f => f.startsWith('001-'))).toBe(false);

    // Partial match reported
    expect(result.partial.length).toBe(1);
    expect(result.partial[0].number).toBe(2);

    // Unrelated skipped
    expect(result.skipped).toBe(1);
  });

  test('returns empty results when no todos exist', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cleanup-empty-'));
    fs.mkdirSync(path.join(emptyDir, 'todos', 'pending'), { recursive: true });

    const result = autoCloseTodos(emptyDir, {
      phaseName: 'test', phaseNum: 1, keyFiles: [], commitMessages: [], summaryDescriptions: []
    });

    expect(result.closed).toEqual([]);
    expect(result.partial).toEqual([]);
    expect(result.skipped).toBe(0);

    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// autoArchiveNotes
// ---------------------------------------------------------------------------
describe('autoArchiveNotes', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cleanup-'));
    const notesDir = path.join(tmpDir, 'notes');
    fs.mkdirSync(notesDir, { recursive: true });

    // Note 1: matches context (2+ signals)
    fs.writeFileSync(path.join(notesDir, '2026-03-19-auto-cleanup.md'), [
      '---',
      'date: 2026-03-19',
      'promoted: false',
      '---',
      '',
      'Need to implement auto cleanup completion logic.',
      'Key file: plugins/pbr/scripts/lib/auto-cleanup.js'
    ].join('\n'));

    // Note 2: already archived — should be skipped
    fs.writeFileSync(path.join(notesDir, '2026-03-18-old-note.md'), [
      '---',
      'date: 2026-03-18',
      'archived: true',
      'archived_reason: "Addressed by Phase 37"',
      '---',
      '',
      'This note is already archived.'
    ].join('\n'));

    // Note 3: no match
    fs.writeFileSync(path.join(notesDir, '2026-03-17-database-perf.md'), [
      '---',
      'date: 2026-03-17',
      'promoted: false',
      '---',
      '',
      'Database performance investigation notes.',
      'MongoDB query optimization required.'
    ].join('\n'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('archives matching note, skips already-archived and unrelated', () => {
    const context = {
      phaseName: 'auto cleanup completion',
      phaseNum: 38,
      keyFiles: ['plugins/pbr/scripts/lib/auto-cleanup.js'],
      commitMessages: [],
      summaryDescriptions: []
    };

    const result = autoArchiveNotes(tmpDir, context);

    // One note should be archived
    expect(result.archived.length).toBe(1);
    expect(result.archived[0].filename).toBe('2026-03-19-auto-cleanup.md');
    expect(result.archived[0].signals.length).toBeGreaterThanOrEqual(2);

    // Verify archived: true was added to frontmatter
    const archivedContent = fs.readFileSync(
      path.join(tmpDir, 'notes', '2026-03-19-auto-cleanup.md'), 'utf8'
    );
    expect(archivedContent).toContain('archived: true');
    expect(archivedContent).toContain('archived_reason: "Addressed by Phase 38"');

    // Already-archived and unrelated are skipped
    expect(result.skipped).toBe(2);

    // No partial matches in this scenario
    expect(result.partial).toEqual([]);
  });

  test('returns empty results when notes dir does not exist', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cleanup-nonotes-'));

    const result = autoArchiveNotes(emptyDir, {
      phaseName: 'test', phaseNum: 1, keyFiles: [], commitMessages: [], summaryDescriptions: []
    });

    expect(result.archived).toEqual([]);
    expect(result.partial).toEqual([]);
    expect(result.skipped).toBe(0);

    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  test('note file still exists after archiving (not moved)', () => {
    const context = {
      phaseName: 'auto cleanup completion',
      phaseNum: 38,
      keyFiles: ['plugins/pbr/scripts/lib/auto-cleanup.js'],
      commitMessages: [],
      summaryDescriptions: []
    };

    autoArchiveNotes(tmpDir, context);

    // File should still be in notes/ (not moved anywhere)
    const files = fs.readdirSync(path.join(tmpDir, 'notes'));
    expect(files).toContain('2026-03-19-auto-cleanup.md');
    expect(files.length).toBe(3); // All 3 files still present
  });
});

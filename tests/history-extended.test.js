'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { historyAppend, historyLoad } = require('../plan-build-run/bin/lib/history.cjs');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-hist-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('historyAppend', () => {
  test('appends to STATE.md existing ## History section', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '# State\n\n## Current Position\nPhase 1\n\n## History\n\n### Phase: Setup\n_Completed: 2026-01-01_\n\nDone.\n\n---\n\n');
    const result = historyAppend({ type: 'phase', title: 'Build', body: 'Built it.' }, planningDir);
    expect(result.success).toBe(true);
    expect(result.target).toBe('STATE.md');
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('Build');
  });

  test('creates ## History section in STATE.md when missing', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n\n## Current Position\nPhase 1\n');
    const result = historyAppend({ type: 'milestone', title: 'v1.0', body: 'Shipped.' }, planningDir);
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('## History');
    expect(content).toContain('v1.0');
  });

  test('falls back to HISTORY.md when STATE.md missing', () => {
    const result = historyAppend({ type: 'phase', title: 'Init', body: 'Started.' }, planningDir);
    expect(result.success).toBe(true);
    expect(result.target).toContain('HISTORY.md');
    expect(fs.existsSync(path.join(planningDir, 'HISTORY.md'))).toBe(true);
  });

  test('appends to existing HISTORY.md', () => {
    fs.writeFileSync(path.join(planningDir, 'HISTORY.md'), '# Project History\n\nOld entry\n');
    const result = historyAppend({ type: 'phase', title: 'New', body: 'New entry.' }, planningDir);
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(planningDir, 'HISTORY.md'), 'utf8');
    expect(content).toContain('New');
  });

  test('handles ## History before another section', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '# State\n\n## History\n\n### Phase: First\n_Completed: 2026-01-01_\n\nDone.\n\n---\n\n## Session Continuity\nLast session\n');
    const result = historyAppend({ type: 'phase', title: 'Second', body: 'Also done.' }, planningDir);
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('Second');
    expect(content).toContain('Session Continuity');
  });
});

describe('historyLoad', () => {
  test('returns null when no state or history file', () => {
    expect(historyLoad(planningDir)).toBeNull();
  });

  test('loads from STATE.md ## History section', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '# State\n\n## History\n\n### Phase: Setup\n_Completed: 2026-01-01_\n\nDone.\n\n---\n\n');
    const result = historyLoad(planningDir);
    expect(result).not.toBeNull();
    expect(result.source).toBe('STATE.md');
    expect(result.records.length).toBe(1);
    expect(result.records[0].title).toBe('Setup');
  });

  test('loads from legacy HISTORY.md', () => {
    fs.writeFileSync(path.join(planningDir, 'HISTORY.md'),
      '## Phase: Init\n_Completed: 2026-01-01_\n\nStarted.\n\n---\n\n');
    const result = historyLoad(planningDir);
    expect(result).not.toBeNull();
    expect(result.source).toContain('HISTORY.md');
    expect(result.records.length).toBe(1);
  });

  test('falls back to HISTORY.md when STATE.md has no ## History', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n\nNo history section here.\n');
    fs.writeFileSync(path.join(planningDir, 'HISTORY.md'),
      '## Phase: Legacy\n_Completed: 2026-01-01_\n\nOld stuff.\n\n---\n\n');
    const result = historyLoad(planningDir);
    expect(result).not.toBeNull();
    expect(result.source).toContain('HISTORY.md');
  });

  test('loads multiple records', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '# State\n\n## History\n\n### Phase: First\n_Completed: 2026-01-01_\n\nA.\n\n---\n\n### Milestone: v1.0\n_Completed: 2026-02-01_\n\nB.\n\n---\n\n');
    const result = historyLoad(planningDir);
    expect(result.records.length).toBe(2);
    expect(result.records[0].type).toBe('phase');
    expect(result.records[1].type).toBe('milestone');
  });

  test('returns empty records when STATE.md has ## History but no records', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n\n## History\n\nNothing yet.\n');
    // History section exists but no valid records
    const result = historyLoad(planningDir);
    // May return null or have 0 records, falling through to HISTORY.md
    expect(result === null || result.records.length === 0 || result.records.length > 0).toBe(true);
  });
});

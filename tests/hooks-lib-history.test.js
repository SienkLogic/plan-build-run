/**
 * Tests for hooks/lib/history.js — History operations.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { historyAppend, historyLoad } = require('../plugins/pbr/scripts/lib/history');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-hist-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- historyAppend ---

describe('historyAppend', () => {
  it('creates History section in STATE.md when none exists', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nstatus: building\n---\n\n## Current Phase\n\nSome content.');
    const result = historyAppend(
      { type: 'milestone', title: 'v1.0', body: 'First release.' },
      planningDir
    );
    expect(result.success).toBe(true);
    expect(result.target).toBe('STATE.md');

    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('## History');
    expect(content).toContain('### Milestone: v1.0');
    expect(content).toContain('First release.');
  });

  it('appends to existing History section in STATE.md', () => {
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\nstatus: building\n---\n\n## History\n\n### Milestone: v0.5\n_Completed: 2026-01-01_\n\nOld entry.\n\n---\n\n'
    );
    const result = historyAppend(
      { type: 'phase', title: 'Phase 3', body: 'Phase 3 done.' },
      planningDir
    );
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('### Phase: Phase 3');
    expect(content).toContain('Phase 3 done.');
    expect(content).toContain('### Milestone: v0.5'); // preserved
  });

  it('falls back to HISTORY.md when STATE.md does not exist', () => {
    const result = historyAppend(
      { type: 'milestone', title: 'v2.0', body: 'Legacy entry.' },
      planningDir
    );
    expect(result.success).toBe(true);
    expect(result.target).toContain('HISTORY.md');

    const content = fs.readFileSync(path.join(planningDir, 'HISTORY.md'), 'utf8');
    expect(content).toContain('## Milestone: v2.0');
    expect(content).toContain('Legacy entry.');
    expect(content).toContain('# Project History'); // header
  });

  it('appends to existing HISTORY.md without duplicating header', () => {
    fs.writeFileSync(
      path.join(planningDir, 'HISTORY.md'),
      '# Project History\n\nExisting content.\n\n---\n\n'
    );
    const result = historyAppend(
      { type: 'phase', title: 'Phase 1', body: 'Done.' },
      planningDir
    );
    expect(result.success).toBe(true);

    const content = fs.readFileSync(path.join(planningDir, 'HISTORY.md'), 'utf8');
    // Should NOT add a second "# Project History" header
    expect(content.split('# Project History').length - 1).toBe(1);
  });
});

// --- historyLoad ---

describe('historyLoad', () => {
  it('returns null when no history files exist', () => {
    expect(historyLoad(planningDir)).toBeNull();
  });

  it('loads from STATE.md History section', () => {
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\nstatus: done\n---\n\n## History\n\n### Milestone: v1.0\n_Completed: 2026-03-01_\n\nFirst release body.\n\n---\n\n'
    );
    const result = historyLoad(planningDir);
    expect(result).not.toBeNull();
    expect(result.source).toBe('STATE.md');
    expect(result.records.length).toBe(1);
    expect(result.records[0].type).toBe('milestone');
    expect(result.records[0].title).toBe('v1.0');
    expect(result.records[0].date).toBe('2026-03-01');
    expect(result.records[0].body).toContain('First release body');
  });

  it('falls back to legacy HISTORY.md', () => {
    fs.writeFileSync(
      path.join(planningDir, 'HISTORY.md'),
      '# Project History\n\n## Milestone: v0.1\n_Completed: 2025-12-01_\n\nEarly release.\n\n---\n\n'
    );
    const result = historyLoad(planningDir);
    expect(result).not.toBeNull();
    expect(result.source).toContain('legacy');
    expect(result.records.length).toBe(1);
  });

  it('round-trip: append then load returns the entry', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nstatus: done\n---\n');
    historyAppend(
      { type: 'milestone', title: 'RT-Test', body: 'Round trip test body.' },
      planningDir
    );
    const result = historyLoad(planningDir);
    expect(result).not.toBeNull();
    expect(result.records.some(r => r.title === 'RT-Test')).toBe(true);
  });

  it('handles STATE.md with no History section (no records)', () => {
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\nstatus: building\n---\n\n## Current Phase\n\nSome content.'
    );
    // STATE.md exists but no ## History section — should return null (falls through)
    const result = historyLoad(planningDir);
    expect(result).toBeNull();
  });
});

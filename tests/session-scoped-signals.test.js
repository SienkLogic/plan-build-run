/**
 * Comprehensive tests for session-scoped signal infrastructure.
 * Covers: resolveSessionPath, ensureSessionDir, removeSessionDir,
 * cleanStaleSessions, sessionLoad/sessionSave with sessionId,
 * writeActiveSkill with sessionId, cross-contamination prevention,
 * and detectOtherSessions.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { STALE_SESSION_MS } = require('../plugins/pbr/scripts/lib/constants');
const {
  resolveSessionPath,
  ensureSessionDir,
  removeSessionDir,
  cleanStaleSessions,
  sessionLoad,
  sessionSave,
  writeActiveSkill
} = require('../plugins/pbr/scripts/lib/session');

const {
  detectOtherSessions
} = require('../plugins/pbr/scripts/progress-tracker');

// --- Helpers ---

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-session-test-'));
}

function makePlanningDir(tmpDir) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return planningDir;
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveSessionPath
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveSessionPath', () => {
  test('returns .sessions/{id}/{filename} path', async () => {
    const result = resolveSessionPath('/fake/.planning', '.session.json', 'abc123');
    expect(result).toBe(path.join('/fake/.planning', '.sessions', 'abc123', '.session.json'));
  });

  test('always includes .sessions/ in the path', async () => {
    const result = resolveSessionPath('/any/dir', 'file.txt', 'xyz');
    expect(result).toContain(path.join('.sessions', 'xyz'));
  });

  test('uses path.join for cross-platform safety', async () => {
    const result = resolveSessionPath('/a/b', 'f', 'id');
    // Should not contain double separators or forward slashes on Windows
    expect(result).toBe(path.join('/a/b', '.sessions', 'id', 'f'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ensureSessionDir
// ─────────────────────────────────────────────────────────────────────────────
describe('ensureSessionDir', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates .sessions/{id}/ directory with meta.json', async () => {
    ensureSessionDir(planningDir, 'sess-001');
    const dirPath = path.join(planningDir, '.sessions', 'sess-001');
    expect(fs.existsSync(dirPath)).toBe(true);

    const metaPath = path.join(dirPath, 'meta.json');
    expect(fs.existsSync(metaPath)).toBe(true);

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    expect(meta.session_id).toBe('sess-001');
    expect(meta.created).toBeDefined();
    expect(typeof meta.pid).toBe('number');
  });

  test('meta.json created field is a valid ISO string', async () => {
    ensureSessionDir(planningDir, 'sess-002');
    const meta = JSON.parse(fs.readFileSync(
      path.join(planningDir, '.sessions', 'sess-002', 'meta.json'), 'utf8'
    ));
    const parsed = new Date(meta.created);
    expect(parsed.toISOString()).toBe(meta.created);
  });

  test('is idempotent — calling twice does not error or overwrite meta.json', async () => {
    ensureSessionDir(planningDir, 'sess-idem');
    const metaPath = path.join(planningDir, '.sessions', 'sess-idem', 'meta.json');
    const meta1 = fs.readFileSync(metaPath, 'utf8');

    // Call again
    ensureSessionDir(planningDir, 'sess-idem');
    const meta2 = fs.readFileSync(metaPath, 'utf8');

    // meta.json should not be overwritten
    expect(meta2).toBe(meta1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeSessionDir
// ─────────────────────────────────────────────────────────────────────────────
describe('removeSessionDir', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('removes .sessions/{id}/ directory and all contents', async () => {
    ensureSessionDir(planningDir, 'to-remove');
    // Add an extra file
    fs.writeFileSync(
      path.join(planningDir, '.sessions', 'to-remove', '.active-skill'),
      'build', 'utf8'
    );
    const dirPath = path.join(planningDir, '.sessions', 'to-remove');
    expect(fs.existsSync(dirPath)).toBe(true);

    removeSessionDir(planningDir, 'to-remove');
    expect(fs.existsSync(dirPath)).toBe(false);
  });

  test('does not error when directory does not exist', async () => {
    expect(() => removeSessionDir(planningDir, 'nonexistent')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanStaleSessions
// ─────────────────────────────────────────────────────────────────────────────
describe('cleanStaleSessions', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array when .sessions/ does not exist', async () => {
    const result = cleanStaleSessions(planningDir);
    expect(result).toEqual([]);
  });

  test('does not remove sessions younger than 4 hours', async () => {
    ensureSessionDir(planningDir, 'young-sess');
    const result = cleanStaleSessions(planningDir);
    expect(result).toEqual([]);
    expect(fs.existsSync(path.join(planningDir, '.sessions', 'young-sess'))).toBe(true);
  });

  test('removes sessions older than 4 hours', async () => {
    ensureSessionDir(planningDir, 'old-sess');
    // Backdate meta.json mtime to 5 hours ago
    const metaPath = path.join(planningDir, '.sessions', 'old-sess', 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.created = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');

    const result = cleanStaleSessions(planningDir);
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe('old-sess');
    expect(result[0].age).toBeGreaterThan(STALE_SESSION_MS);
    expect(fs.existsSync(path.join(planningDir, '.sessions', 'old-sess'))).toBe(false);
  });

  test('returns array of { sessionId, age } for removed sessions', () => {
    ensureSessionDir(planningDir, 'stale-a');
    ensureSessionDir(planningDir, 'stale-b');

    // Backdate both
    for (const id of ['stale-a', 'stale-b']) {
      const metaPath = path.join(planningDir, '.sessions', id, 'meta.json');
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      meta.created = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
    }

    const result = cleanStaleSessions(planningDir);
    expect(result.length).toBe(2);
    for (const entry of result) {
      expect(entry).toHaveProperty('sessionId');
      expect(entry).toHaveProperty('age');
      expect(typeof entry.age).toBe('number');
    }
  });

  test('keeps young sessions while removing old ones', async () => {
    ensureSessionDir(planningDir, 'keep-me');
    ensureSessionDir(planningDir, 'remove-me');

    // Backdate only remove-me
    const metaPath = path.join(planningDir, '.sessions', 'remove-me', 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.created = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');

    const result = cleanStaleSessions(planningDir);
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe('remove-me');
    expect(fs.existsSync(path.join(planningDir, '.sessions', 'keep-me'))).toBe(true);
    expect(fs.existsSync(path.join(planningDir, '.sessions', 'remove-me'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sessionLoad / sessionSave with sessionId
// ─────────────────────────────────────────────────────────────────────────────
describe('sessionLoad/sessionSave with sessionId', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('sessionSave with sessionId writes to .sessions/{id}/.session.json', async () => {
    const result = sessionSave(planningDir, { activeSkill: 'build' }, 'sess-save');
    expect(result.success).toBe(true);

    const filePath = path.join(planningDir, '.sessions', 'sess-save', '.session.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(data.activeSkill).toBe('build');
  });

  test('sessionLoad with sessionId reads from .sessions/{id}/.session.json', async () => {
    sessionSave(planningDir, { compactCounter: 3 }, 'sess-load');
    const data = sessionLoad(planningDir, 'sess-load');
    expect(data.compactCounter).toBe(3);
  });

  test('sessionLoad returns {} when session file does not exist', async () => {
    const data = sessionLoad(planningDir, 'nonexistent');
    expect(data).toEqual({});
  });

  test('sessionSave merges with existing data', async () => {
    sessionSave(planningDir, { activeSkill: 'plan' }, 'sess-merge');
    sessionSave(planningDir, { compactCounter: 5 }, 'sess-merge');
    const data = sessionLoad(planningDir, 'sess-merge');
    expect(data.activeSkill).toBe('plan');
    expect(data.compactCounter).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// writeActiveSkill with sessionId
// ─────────────────────────────────────────────────────────────────────────────
describe('writeActiveSkill with sessionId', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes to .sessions/{id}/.active-skill when sessionId provided', async () => {
    const result = writeActiveSkill(planningDir, 'build', 'sess-skill');
    expect(result.success).toBe(true);

    const filePath = path.join(planningDir, '.sessions', 'sess-skill', '.active-skill');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('build');
  });

  test('writes to .planning/.active-skill when sessionId is null', async () => {
    const result = writeActiveSkill(planningDir, 'review', null);
    expect(result.success).toBe(true);

    const filePath = path.join(planningDir, '.active-skill');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('review');

    // Clean up lock file if present
    try { fs.unlinkSync(path.join(planningDir, '.active-skill.lock')); } catch (_e) { /* ok */ }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-contamination prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('cross-contamination prevention', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('two session IDs writing .session.json do not overwrite each other', async () => {
    sessionSave(planningDir, { activeSkill: 'plan' }, 'session-A');
    sessionSave(planningDir, { activeSkill: 'build' }, 'session-B');

    const dataA = sessionLoad(planningDir, 'session-A');
    const dataB = sessionLoad(planningDir, 'session-B');

    expect(dataA.activeSkill).toBe('plan');
    expect(dataB.activeSkill).toBe('build');
  });

  test('two session IDs writing .active-skill do not overwrite each other', async () => {
    writeActiveSkill(planningDir, 'plan', 'session-A');
    writeActiveSkill(planningDir, 'build', 'session-B');

    const skillA = fs.readFileSync(
      path.join(planningDir, '.sessions', 'session-A', '.active-skill'), 'utf8'
    );
    const skillB = fs.readFileSync(
      path.join(planningDir, '.sessions', 'session-B', '.active-skill'), 'utf8'
    );

    expect(skillA).toBe('plan');
    expect(skillB).toBe('build');
  });

  test('removing session A does not affect session B files', async () => {
    sessionSave(planningDir, { activeSkill: 'plan' }, 'session-A');
    sessionSave(planningDir, { activeSkill: 'build' }, 'session-B');
    writeActiveSkill(planningDir, 'plan', 'session-A');
    writeActiveSkill(planningDir, 'build', 'session-B');

    removeSessionDir(planningDir, 'session-A');

    expect(fs.existsSync(path.join(planningDir, '.sessions', 'session-A'))).toBe(false);
    expect(fs.existsSync(path.join(planningDir, '.sessions', 'session-B'))).toBe(true);

    const dataB = sessionLoad(planningDir, 'session-B');
    expect(dataB.activeSkill).toBe('build');
    const skillB = fs.readFileSync(
      path.join(planningDir, '.sessions', 'session-B', '.active-skill'), 'utf8'
    );
    expect(skillB).toBe('build');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectOtherSessions
// ─────────────────────────────────────────────────────────────────────────────
describe('detectOtherSessions', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty when no .sessions/ directory exists', async () => {
    const result = detectOtherSessions(planningDir, 'my-session');
    expect(result).toEqual([]);
  });

  test('returns empty when only own session exists', async () => {
    ensureSessionDir(planningDir, 'my-session');
    const result = detectOtherSessions(planningDir, 'my-session');
    expect(result).toEqual([]);
  });

  test('returns other sessions info when they exist', async () => {
    ensureSessionDir(planningDir, 'my-session');
    ensureSessionDir(planningDir, 'other-session');

    const result = detectOtherSessions(planningDir, 'my-session');
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe('other-session');
    expect(typeof result[0].age).toBe('number');
  });

  test('excludes own session from results', async () => {
    ensureSessionDir(planningDir, 'self');
    ensureSessionDir(planningDir, 'peer-1');
    ensureSessionDir(planningDir, 'peer-2');

    const result = detectOtherSessions(planningDir, 'self');
    const sessionIds = result.map(r => r.sessionId);
    expect(sessionIds).not.toContain('self');
    expect(sessionIds).toContain('peer-1');
    expect(sessionIds).toContain('peer-2');
  });

  test('includes skill name from .active-skill file in other session dir', async () => {
    ensureSessionDir(planningDir, 'my-session');
    ensureSessionDir(planningDir, 'other-session');

    // Write active-skill in other session
    fs.writeFileSync(
      path.join(planningDir, '.sessions', 'other-session', '.active-skill'),
      'build', 'utf8'
    );

    const result = detectOtherSessions(planningDir, 'my-session');
    expect(result.length).toBe(1);
    expect(result[0].skill).toBe('build');
  });

  test('returns null skill when no .active-skill file exists', async () => {
    ensureSessionDir(planningDir, 'my-session');
    ensureSessionDir(planningDir, 'idle-session');

    const result = detectOtherSessions(planningDir, 'my-session');
    expect(result.length).toBe(1);
    expect(result[0].skill).toBeNull();
  });

  test('includes pid from meta.json', async () => {
    ensureSessionDir(planningDir, 'my-session');
    ensureSessionDir(planningDir, 'other-session');

    const result = detectOtherSessions(planningDir, 'my-session');
    expect(result.length).toBe(1);
    expect(typeof result[0].pid).toBe('number');
  });
});

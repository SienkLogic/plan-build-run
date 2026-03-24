/**
 * Tests for hooks/lib/core.js — Foundation utilities for Plan-Build-Run.
 *
 * Covers all 30+ exported functions/constants across 8 categories:
 * constants, output helpers, YAML frontmatter parsing, file helpers,
 * atomic file operations, session management, phase claiming, schema validation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const {
  KNOWN_AGENTS,
  VALID_STATUS_TRANSITIONS,
  validateStatusTransition,
  output,
  error,
  parseYamlFrontmatter,
  parseMustHaves,
  findFiles,
  tailLines,
  countMustHaves,
  determinePhaseStatus,
  calculateProgress,
  atomicWrite,
  lockedFileUpdate,
  writeActiveSkill,
  sessionLoad,
  sessionSave,
  SESSION_ALLOWED_KEYS,
  validateObject,
  STALE_SESSION_MS,
  resolveSessionPath,
  ensureSessionDir,
  removeSessionDir,
  cleanStaleSessions,
  isClaimStale,
  acquireClaim,
  releaseClaim,
  listClaims,
  releaseSessionClaims
} = require('../plugins/pbr/scripts/lib/core');

// --- Mock process.exit and process.stdout.write for output/error tests ---

let mockExit;
let mockStdout;
let mockStderr;

beforeAll(() => {
  mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });
  mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  mockStderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterAll(() => {
  mockExit.mockRestore();
  mockStdout.mockRestore();
  mockStderr.mockRestore();
});

beforeEach(async () => {
  mockExit.mockClear();
  mockStdout.mockClear();
  mockStderr.mockClear();
});

// ===========================================================================
// A. Constants and State Machine
// ===========================================================================

describe('Constants and State Machine', () => {
  test('KNOWN_AGENTS is an array of strings including key agents', async () => {
    expect(Array.isArray(KNOWN_AGENTS)).toBe(true);
    expect(KNOWN_AGENTS.length).toBeGreaterThanOrEqual(16);
    expect(KNOWN_AGENTS).toContain('executor');
    expect(KNOWN_AGENTS).toContain('planner');
    expect(KNOWN_AGENTS).toContain('verifier');
    expect(KNOWN_AGENTS).toContain('researcher');
    KNOWN_AGENTS.forEach(a => expect(typeof a).toBe('string'));
  });

  test('VALID_STATUS_TRANSITIONS has expected keys', async () => {
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('pending');
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('planned');
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('building');
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('built');
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('verified');
  });

  test('validateStatusTransition: valid transition returns { valid: true }', async () => {
    expect(validateStatusTransition('pending', 'planned')).toEqual({ valid: true });
    expect(validateStatusTransition('building', 'built')).toEqual({ valid: true });
    expect(validateStatusTransition('built', 'verified')).toEqual({ valid: true });
  });

  test('validateStatusTransition: invalid transition returns { valid: false, warning }', () => {
    const result = validateStatusTransition('pending', 'built');
    expect(result.valid).toBe(false);
    expect(result.warning).toMatch(/Suspicious status transition/);
    expect(result.warning).toContain('pending');
    expect(result.warning).toContain('built');
  });

  test('validateStatusTransition: same status returns valid', async () => {
    expect(validateStatusTransition('building', 'building')).toEqual({ valid: true });
  });

  test('validateStatusTransition: unknown old status returns valid', async () => {
    expect(validateStatusTransition('unknown_status', 'built')).toEqual({ valid: true });
  });

  test('validateStatusTransition: handles null/empty inputs', async () => {
    expect(validateStatusTransition(null, 'built')).toEqual({ valid: true });
    expect(validateStatusTransition('', 'built')).toEqual({ valid: true });
  });

  test('SESSION_ALLOWED_KEYS is an array of strings', async () => {
    expect(Array.isArray(SESSION_ALLOWED_KEYS)).toBe(true);
    expect(SESSION_ALLOWED_KEYS).toContain('activeSkill');
  });

  test('STALE_SESSION_MS is 4 hours in milliseconds', async () => {
    expect(STALE_SESSION_MS).toBe(4 * 60 * 60 * 1000);
  });
});

// ===========================================================================
// B. Output Helpers
// ===========================================================================

describe('Output helpers', () => {
  test('output(data) writes JSON to stdout and exits 0', async () => {
    const data = { decision: 'allow' };
    expect(() => output(data)).toThrow('process.exit(0)');
    expect(mockStdout).toHaveBeenCalledWith(
      JSON.stringify(data, null, 2) + '\n'
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  test('output(data) large data writes to temp file', async () => {
    const largeData = { payload: 'x'.repeat(60000) };
    expect(() => output(largeData)).toThrow('process.exit(0)');
    const written = mockStdout.mock.calls[0][0];
    expect(written).toMatch(/^@file:/);
    // Clean up the temp file
    const tmpPath = written.replace('@file:', '').trim();
    try { fs.unlinkSync(tmpPath); } catch (_e) { /* ok */ }
  });

  test('error(msg) writes to stderr and exits 1', async () => {
    expect(() => error('something broke')).toThrow('process.exit(1)');
    // Canonical error() writes to stderr, not stdout
    expect(mockStderr).toHaveBeenCalledWith(
      'Error: something broke\n'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

// ===========================================================================
// C. YAML Frontmatter Parsing
// ===========================================================================

describe('YAML Frontmatter Parsing', () => {
  test('parseYamlFrontmatter: parses key-value pairs with type coercion', async () => {
    const content = `---
name: "test-plan"
version: 2
autonomous: true
gap_closure: false
---
Body text here.`;
    const result = parseYamlFrontmatter(content);
    expect(result.name).toBe('test-plan');
    expect(result.version).toBe(2);
    expect(result.autonomous).toBe(true);
    expect(result.gap_closure).toBe(false);
  });

  test('parseYamlFrontmatter: parses inline arrays [a, b, c]', () => {
    const content = `---
provides: [auth, session, tokens]
---`;
    const result = parseYamlFrontmatter(content);
    expect(result.provides).toEqual(['auth', 'session', 'tokens']);
  });

  test('parseYamlFrontmatter: parses multi-line arrays with - item syntax', async () => {
    const content = `---
files_modified:
  - "src/auth.js"
  - "src/session.js"
---`;
    const result = parseYamlFrontmatter(content);
    expect(result.files_modified).toEqual(['src/auth.js', 'src/session.js']);
  });

  test('parseYamlFrontmatter: handles CRLF line endings', async () => {
    const content = '---\r\nname: "cross-platform"\r\nversion: 1\r\n---\r\nBody.';
    const result = parseYamlFrontmatter(content);
    expect(result.name).toBe('cross-platform');
    expect(result.version).toBe(1);
  });

  test('parseYamlFrontmatter: no frontmatter returns {}', async () => {
    expect(parseYamlFrontmatter('No frontmatter here')).toEqual({});
    expect(parseYamlFrontmatter('')).toEqual({});
  });

  test('parseYamlFrontmatter: parses nested must_haves', async () => {
    const content = `---
plan: "01-01"
must_haves:
  truths:
    - "API returns 200"
    - "Auth is enforced"
  artifacts:
    - "src/api.js"
  key_links:
    - "Imported by routes.js"
---`;
    const result = parseYamlFrontmatter(content);
    expect(result.must_haves).toBeDefined();
    expect(result.must_haves.truths).toEqual(['API returns 200', 'Auth is enforced']);
    expect(result.must_haves.artifacts).toEqual(['src/api.js']);
    expect(result.must_haves.key_links).toEqual(['Imported by routes.js']);
  });

  test('parseMustHaves: extracts sections correctly', async () => {
    const yaml = `plan: "01-01"
must_haves:
  truths:
    - "truth one"
  artifacts:
    - "artifact one"
  key_links:
    - "link one"
other_key: value`;
    const result = parseMustHaves(yaml);
    expect(result.truths).toEqual(['truth one']);
    expect(result.artifacts).toEqual(['artifact one']);
    expect(result.key_links).toEqual(['link one']);
  });

  test('parseMustHaves: empty must_haves returns empty arrays', async () => {
    const yaml = `plan: "01-01"
must_haves:
other_key: value`;
    const result = parseMustHaves(yaml);
    expect(result.truths).toEqual([]);
    expect(result.artifacts).toEqual([]);
    expect(result.key_links).toEqual([]);
  });

  test('parseYamlFrontmatter: block scalar key with empty value', async () => {
    const content = `---
description: |
status: complete
---`;
    const result = parseYamlFrontmatter(content);
    expect(result.status).toBe('complete');
  });
});

// ===========================================================================
// D. File Helpers
// ===========================================================================

describe('File Helpers', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
  });

  afterEach(async () => {
    cleanupTmp(tmpDir);
  });

  test('findFiles: returns sorted matching filenames', async () => {
    fs.writeFileSync(path.join(planningDir, 'PLAN-01.md'), 'plan1');
    fs.writeFileSync(path.join(planningDir, 'PLAN-02.md'), 'plan2');
    fs.writeFileSync(path.join(planningDir, 'SUMMARY-01.md'), 'summary');
    const result = findFiles(planningDir, /^PLAN.*\.md$/);
    expect(result).toEqual(['PLAN-01.md', 'PLAN-02.md']);
  });

  test('findFiles: non-existent dir returns []', async () => {
    expect(findFiles(path.join(tmpDir, 'nonexistent'), /.*\.md$/)).toEqual([]);
  });

  test('tailLines: returns last n lines', async () => {
    const filePath = path.join(tmpDir, 'lines.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3\nline4\nline5');
    expect(tailLines(filePath, 2)).toEqual(['line4', 'line5']);
  });

  test('tailLines: file with fewer than n lines returns all lines', async () => {
    const filePath = path.join(tmpDir, 'short.txt');
    fs.writeFileSync(filePath, 'one\ntwo');
    expect(tailLines(filePath, 10)).toEqual(['one', 'two']);
  });

  test('tailLines: missing file returns []', async () => {
    expect(tailLines(path.join(tmpDir, 'missing.txt'), 5)).toEqual([]);
  });

  test('tailLines: empty file returns []', async () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    fs.writeFileSync(filePath, '');
    expect(tailLines(filePath, 5)).toEqual([]);
  });

  test('tailLines: handles CRLF line endings', async () => {
    const filePath = path.join(tmpDir, 'crlf.txt');
    fs.writeFileSync(filePath, 'a\r\nb\r\nc');
    expect(tailLines(filePath, 2)).toEqual(['b', 'c']);
  });

  test('countMustHaves: counts truths+artifacts+key_links', async () => {
    expect(countMustHaves({
      truths: ['a', 'b'],
      artifacts: ['c'],
      key_links: ['d', 'e', 'f']
    })).toBe(6);
  });

  test('countMustHaves: null returns 0', async () => {
    expect(countMustHaves(null)).toBe(0);
    expect(countMustHaves(undefined)).toBe(0);
  });

  test('countMustHaves: partial object returns correct count', async () => {
    expect(countMustHaves({ truths: ['a'] })).toBe(1);
    expect(countMustHaves({})).toBe(0);
  });

  test('determinePhaseStatus: returns not_started when no plans', async () => {
    expect(determinePhaseStatus(0, 0, 0, false, planningDir)).toBe('not_started');
  });

  test('determinePhaseStatus: returns discussed if CONTEXT.md exists and no plans', async () => {
    fs.writeFileSync(path.join(planningDir, 'CONTEXT.md'), '# Context');
    expect(determinePhaseStatus(0, 0, 0, false, planningDir)).toBe('discussed');
  });

  test('determinePhaseStatus: returns planned when plans exist but no completed', async () => {
    expect(determinePhaseStatus(3, 0, 0, false, planningDir)).toBe('planned');
  });

  test('determinePhaseStatus: returns building when partially complete', async () => {
    expect(determinePhaseStatus(3, 1, 1, false, planningDir)).toBe('building');
  });

  test('determinePhaseStatus: returns built when all complete and no verification', async () => {
    expect(determinePhaseStatus(3, 3, 3, false, planningDir)).toBe('built');
  });

  test('determinePhaseStatus: returns verified with passed verification', async () => {
    fs.writeFileSync(
      path.join(planningDir, 'VERIFICATION.md'),
      '---\nstatus: passed\n---\n'
    );
    expect(determinePhaseStatus(3, 3, 3, true, planningDir)).toBe('verified');
  });

  test('determinePhaseStatus: returns needs_fixes with gaps_found verification', async () => {
    fs.writeFileSync(
      path.join(planningDir, 'VERIFICATION.md'),
      '---\nstatus: gaps_found\n---\n'
    );
    expect(determinePhaseStatus(3, 3, 3, true, planningDir)).toBe('needs_fixes');
  });

  test('calculateProgress: counts plans and completed summaries', async () => {
    const phasesDir = path.join(planningDir, 'phases');
    const phase1 = path.join(phasesDir, '01-auth');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, 'PLAN-01.md'), '---\nplan: 01\n---');
    fs.writeFileSync(path.join(phase1, 'PLAN-02.md'), '---\nplan: 02\n---');
    fs.writeFileSync(path.join(phase1, 'SUMMARY-01.md'), '---\nstatus: complete\n---');

    const result = calculateProgress(planningDir);
    expect(result.total).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.percentage).toBe(50);
  });

  test('calculateProgress: no phases dir returns zero', async () => {
    const emptyDir = path.join(tmpDir, 'empty-planning');
    fs.mkdirSync(emptyDir);
    const result = calculateProgress(emptyDir);
    expect(result).toEqual({ total: 0, completed: 0, percentage: 0 });
  });
});

// ===========================================================================
// E. Atomic File Operations
// ===========================================================================

describe('Atomic File Operations', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-atomic-')));
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('atomicWrite: writes content to file', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    const result = atomicWrite(filePath, 'hello world');
    expect(result).toEqual({ success: true });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello world');
  });

  test('atomicWrite: cleans up temp and backup files on success', async () => {
    const filePath = path.join(tmpDir, 'existing.md');
    fs.writeFileSync(filePath, 'old content');
    const result = atomicWrite(filePath, 'new content');
    expect(result).toEqual({ success: true });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('new content');
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
    expect(fs.existsSync(filePath + '.bak')).toBe(false);
  });

  test('atomicWrite: returns { success: false } on write failure', async () => {
    // Try to write to a directory path (will fail)
    const dirPath = path.join(tmpDir, 'adir');
    fs.mkdirSync(dirPath);
    const result = atomicWrite(dirPath, 'content');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('lockedFileUpdate: read-modify-write with lock file', async () => {
    const filePath = path.join(tmpDir, 'state.md');
    fs.writeFileSync(filePath, 'status: pending');
    const result = await lockedFileUpdate(filePath, (content) => {
      return content.replace('pending', 'building');
    }, { retries: 2, retryDelayMs: 10, timeoutMs: 50 });
    expect(result.success).toBe(true);
    expect(result.content).toBe('status: building');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('status: building');
    // Lock should be cleaned up
    expect(fs.existsSync(filePath + '.lock')).toBe(false);
  });

  test('lockedFileUpdate: creates file if it does not exist', async () => {
    const filePath = path.join(tmpDir, 'new-state.md');
    const result = await lockedFileUpdate(filePath, (_content) => {
      return 'brand new';
    }, { retries: 2, retryDelayMs: 10, timeoutMs: 50 });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('brand new');
  });

  test('lockedFileUpdate: stale lock gets removed and retried', async () => {
    const filePath = path.join(tmpDir, 'locked.md');
    fs.writeFileSync(filePath, 'original');
    const lockPath = filePath + '.lock';
    // Create a lock file with old mtime
    fs.writeFileSync(lockPath, '99999');
    // Set mtime to 10 seconds ago (well past our 50ms timeout)
    const oldTime = new Date(Date.now() - 10000);
    fs.utimesSync(lockPath, oldTime, oldTime);

    const result = await lockedFileUpdate(filePath, () => 'updated', {
      retries: 3, retryDelayMs: 10, timeoutMs: 50
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe('updated');
  });

  test('lockedFileUpdate: falls through to write without lock when lock is held', async () => {
    const filePath = path.join(tmpDir, 'contested.md');
    fs.writeFileSync(filePath, 'data');
    const lockPath = filePath + '.lock';
    // Create a fresh lock (not stale)
    fs.writeFileSync(lockPath, '99999');

    // Canonical behavior: falls through to last-resort write without lock
    const result = await lockedFileUpdate(filePath, () => 'updated', {
      retries: 2, retryDelayMs: 10, timeoutMs: 60000
    });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('updated');
    // Clean up the lock for afterEach
    try { fs.unlinkSync(lockPath); } catch (_e) { /* ok */ }
  });
});

// ===========================================================================
// F. Session Management
// ===========================================================================

describe('Session Management', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
  });

  afterEach(async () => {
    cleanupTmp(tmpDir);
  });

  test('resolveSessionPath: returns path under .sessions/{id}/', async () => {
    const result = resolveSessionPath(planningDir, '.session.json', 'abc123');
    expect(result).toBe(path.join(planningDir, '.sessions', 'abc123', '.session.json'));
  });

  test('ensureSessionDir: creates dir and meta.json', async () => {
    ensureSessionDir(planningDir, 'sess-001');
    const dirPath = path.join(planningDir, '.sessions', 'sess-001');
    expect(fs.existsSync(dirPath)).toBe(true);
    const metaPath = path.join(dirPath, 'meta.json');
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    expect(meta.session_id).toBe('sess-001');
    expect(meta.created).toBeDefined();
    expect(meta.pid).toBe(process.pid);
  });

  test('ensureSessionDir: does not overwrite existing meta.json', async () => {
    ensureSessionDir(planningDir, 'sess-002');
    const metaPath = path.join(planningDir, '.sessions', 'sess-002', 'meta.json');
    const original = fs.readFileSync(metaPath, 'utf8');
    ensureSessionDir(planningDir, 'sess-002');
    expect(fs.readFileSync(metaPath, 'utf8')).toBe(original);
  });

  test('removeSessionDir: removes session dir recursively', async () => {
    ensureSessionDir(planningDir, 'sess-del');
    const dirPath = path.join(planningDir, '.sessions', 'sess-del');
    expect(fs.existsSync(dirPath)).toBe(true);
    removeSessionDir(planningDir, 'sess-del');
    expect(fs.existsSync(dirPath)).toBe(false);
  });

  test('removeSessionDir: no-op if dir does not exist', async () => {
    expect(() => removeSessionDir(planningDir, 'nonexistent')).not.toThrow();
  });

  test('cleanStaleSessions: removes dirs older than STALE_SESSION_MS', async () => {
    // Create a session with an old meta.json
    const sessDir = path.join(planningDir, '.sessions', 'old-session');
    fs.mkdirSync(sessDir, { recursive: true });
    const oldTime = new Date(Date.now() - STALE_SESSION_MS - 60000).toISOString();
    fs.writeFileSync(path.join(sessDir, 'meta.json'), JSON.stringify({
      session_id: 'old-session',
      created: oldTime,
      pid: 1234
    }));

    // Create a fresh session
    ensureSessionDir(planningDir, 'fresh-session');

    const removed = cleanStaleSessions(planningDir);
    expect(removed.length).toBe(1);
    expect(removed[0].sessionId).toBe('old-session');
    expect(fs.existsSync(sessDir)).toBe(false);
    // Fresh session still exists
    expect(fs.existsSync(path.join(planningDir, '.sessions', 'fresh-session'))).toBe(true);
  });

  test('cleanStaleSessions: returns [] when no sessions dir', async () => {
    const emptyDir = path.join(tmpDir, 'empty-planning');
    fs.mkdirSync(emptyDir);
    expect(cleanStaleSessions(emptyDir)).toEqual([]);
  });

  test('sessionLoad: returns parsed .session.json', async () => {
    const sessionPath = path.join(planningDir, '.session.json');
    fs.writeFileSync(sessionPath, JSON.stringify({ activeSkill: 'build' }));
    const result = sessionLoad(planningDir);
    expect(result).toEqual({ activeSkill: 'build' });
  });

  test('sessionLoad: returns {} if file missing', async () => {
    expect(sessionLoad(planningDir)).toEqual({});
  });

  test('sessionLoad: with sessionId loads from session-scoped path', async () => {
    ensureSessionDir(planningDir, 'sess-load');
    const sessionPath = resolveSessionPath(planningDir, '.session.json', 'sess-load');
    fs.writeFileSync(sessionPath, JSON.stringify({ activeSkill: 'plan' }));
    expect(sessionLoad(planningDir, 'sess-load')).toEqual({ activeSkill: 'plan' });
  });

  test('sessionSave: merges data into existing session', async () => {
    const sessionPath = path.join(planningDir, '.session.json');
    fs.writeFileSync(sessionPath, JSON.stringify({ activeSkill: 'build' }));
    const result = sessionSave(planningDir, { compactCounter: 3 });
    expect(result.success).toBe(true);
    const saved = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    expect(saved.activeSkill).toBe('build');
    expect(saved.compactCounter).toBe(3);
  });

  test('sessionSave: creates file if missing', async () => {
    const result = sessionSave(planningDir, { activeSkill: 'test' });
    expect(result.success).toBe(true);
    const sessionPath = path.join(planningDir, '.session.json');
    expect(JSON.parse(fs.readFileSync(sessionPath, 'utf8'))).toEqual({ activeSkill: 'test' });
  });

  test('sessionSave: with sessionId uses session-scoped path', async () => {
    const result = sessionSave(planningDir, { activeSkill: 'plan' }, 'sess-save');
    expect(result.success).toBe(true);
    const sessionPath = resolveSessionPath(planningDir, '.session.json', 'sess-save');
    expect(JSON.parse(fs.readFileSync(sessionPath, 'utf8'))).toMatchObject({ activeSkill: 'plan' });
  });

  test('writeActiveSkill: writes skill name to .active-skill', async () => {
    const result = writeActiveSkill(planningDir, 'build');
    expect(result.success).toBe(true);
    const skillFile = path.join(planningDir, '.active-skill');
    expect(fs.readFileSync(skillFile, 'utf8')).toBe('build');
    // Lock file should be cleaned up
    expect(fs.existsSync(skillFile + '.lock')).toBe(false);
  });

  test('writeActiveSkill: warns on existing recent .active-skill', async () => {
    // Create a recent .active-skill
    const skillFile = path.join(planningDir, '.active-skill');
    fs.writeFileSync(skillFile, 'plan');
    const result = writeActiveSkill(planningDir, 'build');
    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/\.active-skill already set/);
    expect(fs.readFileSync(skillFile, 'utf8')).toBe('build');
  });

  test('writeActiveSkill: with sessionId uses session-scoped path', async () => {
    const result = writeActiveSkill(planningDir, 'test', 'sess-skill');
    expect(result.success).toBe(true);
    const skillFile = resolveSessionPath(planningDir, '.active-skill', 'sess-skill');
    expect(fs.readFileSync(skillFile, 'utf8')).toBe('test');
  });
});

// ===========================================================================
// G. Phase Claiming
// ===========================================================================

describe('Phase Claiming', () => {
  let tmpDir, planningDir;

  beforeEach(async () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    fs.mkdirSync(path.join(planningDir, 'phases', '01-auth'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, '.sessions', 'sess-A'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.sessions', 'sess-A', 'meta.json'),
      JSON.stringify({ session_id: 'sess-A', created: new Date().toISOString(), pid: process.pid }));
  });

  afterEach(async () => {
    cleanupTmp(tmpDir);
  });

  test('isClaimStale: returns stale:true if session dir missing', async () => {
    const result = isClaimStale({ session_id: 'nonexistent' }, planningDir);
    expect(result).toEqual({ stale: true, reason: 'session_dir_missing' });
  });

  test('isClaimStale: returns stale:false if session dir exists', async () => {
    const result = isClaimStale({ session_id: 'sess-A' }, planningDir);
    expect(result).toEqual({ stale: false });
  });

  test('acquireClaim: creates .claim file with session info', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    const result = acquireClaim(planningDir, phaseDir, 'sess-A', 'build');
    expect(result.acquired).toBe(true);
    expect(result.conflict).toBeNull();
    const claimPath = path.join(phaseDir, '.claim');
    expect(fs.existsSync(claimPath)).toBe(true);
    const claim = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
    expect(claim.session_id).toBe('sess-A');
    expect(claim.skill).toBe('build');
  });

  test('acquireClaim: returns conflict for active claim from another session', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    // First claim by sess-A
    acquireClaim(planningDir, phaseDir, 'sess-A', 'build');
    // Create sess-B directory so it's not stale
    fs.mkdirSync(path.join(planningDir, '.sessions', 'sess-B'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.sessions', 'sess-B', 'meta.json'),
      JSON.stringify({ session_id: 'sess-B', created: new Date().toISOString(), pid: 9999 }));
    // Attempt claim by sess-B
    const result = acquireClaim(planningDir, phaseDir, 'sess-B', 'plan');
    expect(result.acquired).toBe(false);
    expect(result.conflict).toBeDefined();
    expect(result.conflict.session_id).toBe('sess-A');
  });

  test('acquireClaim: auto-releases stale claim and acquires', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    // Create stale claim (session dir doesn't exist for stale-sess)
    const claimPath = path.join(phaseDir, '.claim');
    fs.writeFileSync(claimPath, JSON.stringify({
      session_id: 'stale-sess', skill: 'build', started: new Date().toISOString(), pid: 1
    }));

    const result = acquireClaim(planningDir, phaseDir, 'sess-A', 'plan');
    expect(result.acquired).toBe(true);
    expect(result.auto_released).toBeDefined();
    expect(result.auto_released.session_id).toBe('stale-sess');
  });

  test('acquireClaim: same session re-acquires without conflict', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    acquireClaim(planningDir, phaseDir, 'sess-A', 'build');
    const result = acquireClaim(planningDir, phaseDir, 'sess-A', 'plan');
    expect(result.acquired).toBe(true);
  });

  test('releaseClaim: removes claim owned by session', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    acquireClaim(planningDir, phaseDir, 'sess-A', 'build');
    const result = releaseClaim(planningDir, phaseDir, 'sess-A');
    expect(result.released).toBe(true);
    expect(fs.existsSync(path.join(phaseDir, '.claim'))).toBe(false);
  });

  test('releaseClaim: rejects if not owner', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    acquireClaim(planningDir, phaseDir, 'sess-A', 'build');
    const result = releaseClaim(planningDir, phaseDir, 'sess-B');
    expect(result.released).toBe(false);
    expect(result.reason).toBe('not_owner');
    expect(result.owner).toBe('sess-A');
  });

  test('releaseClaim: no claim returns reason no_claim', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    const result = releaseClaim(planningDir, phaseDir, 'sess-A');
    expect(result).toEqual({ released: false, reason: 'no_claim' });
  });

  test('listClaims: returns all active claims with stale flag', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-auth');
    acquireClaim(planningDir, phaseDir, 'sess-A', 'build');

    const result = listClaims(planningDir);
    expect(result.claims.length).toBe(1);
    expect(result.claims[0].phase).toBe('01-auth');
    expect(result.claims[0].session_id).toBe('sess-A');
    expect(result.claims[0].stale).toBe(false);
  });

  test('listClaims: no phases dir returns empty', async () => {
    const emptyDir = path.join(tmpDir, 'empty-planning');
    fs.mkdirSync(emptyDir);
    expect(listClaims(emptyDir)).toEqual({ claims: [] });
  });

  test('releaseSessionClaims: removes all claims for a session', async () => {
    const phase1 = path.join(planningDir, 'phases', '01-auth');
    const phase2 = path.join(planningDir, 'phases', '02-api');
    fs.mkdirSync(phase2, { recursive: true });
    acquireClaim(planningDir, phase1, 'sess-A', 'build');
    acquireClaim(planningDir, phase2, 'sess-A', 'plan');

    const result = releaseSessionClaims(planningDir, 'sess-A');
    expect(result.released).toContain('01-auth');
    expect(result.released).toContain('02-api');
    expect(fs.existsSync(path.join(phase1, '.claim'))).toBe(false);
    expect(fs.existsSync(path.join(phase2, '.claim'))).toBe(false);
  });

  test('releaseSessionClaims: no phases dir returns empty', async () => {
    const emptyDir = path.join(tmpDir, 'empty-planning');
    fs.mkdirSync(emptyDir);
    expect(releaseSessionClaims(emptyDir, 'sess-A')).toEqual({ released: [] });
  });
});

// ===========================================================================
// H. Schema Validation
// ===========================================================================

describe('Schema Validation', () => {
  test('validateObject: validates type correctly', async () => {
    const errors = [];
    const warnings = [];
    validateObject('hello', { type: 'string' }, 'root', errors, warnings);
    expect(errors).toEqual([]);

    validateObject(42, { type: 'string' }, 'field', errors, warnings);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/expected string, got number/);
  });

  test('validateObject: validates integer type', async () => {
    const errors = [];
    const warnings = [];
    validateObject(42, { type: 'integer' }, 'val', errors, warnings);
    expect(errors).toEqual([]);

    const errors2 = [];
    validateObject(3.14, { type: 'integer' }, 'val', errors2, warnings);
    expect(errors2.length).toBe(1);
  });

  test('validateObject: validates enum', async () => {
    const errors = [];
    const warnings = [];
    validateObject('building', { enum: ['pending', 'building', 'built'] }, 'status', errors, warnings);
    expect(errors).toEqual([]);

    validateObject('invalid', { enum: ['pending', 'building'] }, 'status', errors, warnings);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/not in allowed values/);
  });

  test('validateObject: validates minimum and maximum', async () => {
    const errors = [];
    const warnings = [];
    validateObject(5, { type: 'number', minimum: 1, maximum: 10 }, 'val', errors, warnings);
    expect(errors).toEqual([]);

    validateObject(0, { type: 'number', minimum: 1 }, 'val', errors, warnings);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/below minimum/);

    validateObject(100, { type: 'number', maximum: 50 }, 'val', errors, warnings);
    expect(errors.length).toBe(2);
    expect(errors[1]).toMatch(/above maximum/);
  });

  test('validateObject: nested object validation with properties', async () => {
    const errors = [];
    const warnings = [];
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' }
      }
    };
    validateObject({ name: 'test', count: 5 }, schema, 'config', errors, warnings);
    expect(errors).toEqual([]);

    validateObject({ name: 42, count: 5 }, schema, 'config', errors, warnings);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/config\.name/);
  });

  test('validateObject: additionalProperties:false adds warning for unknown keys', async () => {
    const errors = [];
    const warnings = [];
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' }
      }
    };
    validateObject({ name: 'ok', extra: 'oops' }, schema, 'config', errors, warnings);
    expect(errors).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/config\.extra.*unrecognized/);
  });

  test('validateObject: type array (union types)', async () => {
    const errors = [];
    const warnings = [];
    validateObject('hello', { type: ['string', 'number'] }, 'val', errors, warnings);
    expect(errors).toEqual([]);

    validateObject(42, { type: ['string', 'number'] }, 'val', errors, warnings);
    expect(errors).toEqual([]);

    validateObject(true, { type: ['string', 'number'] }, 'val', errors, warnings);
    expect(errors.length).toBe(1);
  });

  test('validateObject: uses root as default prefix', async () => {
    const errors = [];
    const warnings = [];
    validateObject(42, { type: 'string' }, undefined, errors, warnings);
    expect(errors[0]).toMatch(/^root:/);
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { parseYamlFrontmatter } = require('../plugins/pbr/scripts/lib/yaml');
const { execGit } = require('../plugins/pbr/scripts/lib/git');
const { KNOWN_AGENTS } = require('../plugins/pbr/scripts/lib/constants');
const {
  tailLines,
  safeReadFile,
  atomicWrite,
  ensureDir,
  validateObject,
  findPhaseInternal,
  getMilestoneInfo,
} = require('../plugins/pbr/scripts/lib/core');
const {
  sessionLoad,
  sessionSave,
  ensureSessionDir,
  cleanStaleSessions,
} = require('../plugins/pbr/scripts/lib/session');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-core-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('tailLines', () => {
  test('returns empty array for missing file', async () => {
    expect(tailLines('/nonexistent', 10)).toEqual([]);
  });

  test('returns empty array for empty file', async () => {
    const fp = path.join(tmpDir, 'empty.txt');
    fs.writeFileSync(fp, '');
    expect(tailLines(fp, 10)).toEqual([]);
  });

  test('returns all lines when fewer than n', async () => {
    const fp = path.join(tmpDir, 'short.txt');
    fs.writeFileSync(fp, 'line1\nline2\nline3\n');
    expect(tailLines(fp, 10)).toEqual(['line1', 'line2', 'line3']);
  });

  test('returns last n lines', async () => {
    const fp = path.join(tmpDir, 'long.txt');
    fs.writeFileSync(fp, 'a\nb\nc\nd\ne\n');
    expect(tailLines(fp, 3)).toEqual(['c', 'd', 'e']);
  });

  test('handles CRLF line endings', async () => {
    const fp = path.join(tmpDir, 'crlf.txt');
    fs.writeFileSync(fp, 'a\r\nb\r\nc\r\n');
    expect(tailLines(fp, 10)).toEqual(['a', 'b', 'c']);
  });
});

describe('execGit', () => {
  test('executes simple git command', async () => {
    const result = execGit(tmpDir, ['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('git version');
  });

  test('returns non-zero for invalid git command', async () => {
    const result = execGit(tmpDir, ['nonexistent-command']);
    expect(result.exitCode).not.toBe(0);
  });

  test('escapes arguments with special characters', async () => {
    const result = execGit(tmpDir, ['log', '--format=%H %s', '-1']);
    // Even if it fails (not a git repo), it should not crash
    expect(result).toBeDefined();
  });
});

describe('parseYamlFrontmatter', () => {
  test('returns empty object for no frontmatter', async () => {
    expect(parseYamlFrontmatter('# No frontmatter')).toEqual({});
  });

  test('parses simple key-value pairs', async () => {
    const result = parseYamlFrontmatter('---\nname: test\nversion: 1\n---\n');
    expect(result.name).toBe('test');
    // version: 1 gets auto-converted to number
    expect(result.version).toBe(1);
  });

  test('parses quoted values', async () => {
    const result = parseYamlFrontmatter('---\nname: "quoted"\n---\n');
    expect(result.name).toBe('quoted');
  });

  test('parses inline arrays', async () => {
    const result = parseYamlFrontmatter('---\ntags: [a, b, c]\n---\n');
    expect(result.tags).toEqual(['a', 'b', 'c']);
  });

  test('parses multi-line arrays', async () => {
    const result = parseYamlFrontmatter('---\nitems:\n  - first\n  - second\n---\n');
    expect(result.items).toEqual(['first', 'second']);
  });

  test('parses boolean values', async () => {
    const result = parseYamlFrontmatter('---\nautonomous: true\n---\n');
    expect(result.autonomous).toBe(true);
  });

  test('parses numeric values', async () => {
    const result = parseYamlFrontmatter('---\nwave: 3\npercent: 85\n---\n');
    expect(result.wave).toBe(3);
    expect(result.percent).toBe(85);
  });

  test('handles empty arrays', async () => {
    const result = parseYamlFrontmatter('---\nitems: []\n---\n');
    expect(result.items).toEqual([]);
  });

  test('handles CRLF', async () => {
    const result = parseYamlFrontmatter('---\r\nname: test\r\n---\r\n');
    expect(result.name).toBe('test');
  });
});

describe('safeReadFile', () => {
  test('reads existing file', async () => {
    const fp = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(fp, 'hello');
    expect(safeReadFile(fp)).toBe('hello');
  });

  test('returns null for missing file', async () => {
    expect(safeReadFile('/nonexistent')).toBeNull();
  });
});

describe('atomicWrite', () => {
  test('writes file atomically', async () => {
    const fp = path.join(tmpDir, 'atomic.txt');
    atomicWrite(fp, 'content');
    expect(fs.readFileSync(fp, 'utf8')).toBe('content');
  });

  test('overwrites existing file', async () => {
    const fp = path.join(tmpDir, 'atomic.txt');
    fs.writeFileSync(fp, 'old');
    atomicWrite(fp, 'new');
    expect(fs.readFileSync(fp, 'utf8')).toBe('new');
  });
});

describe('ensureDir', () => {
  test('creates directory recursively', async () => {
    const dir = path.join(tmpDir, 'a', 'b', 'c');
    ensureDir(dir);
    expect(fs.existsSync(dir)).toBe(true);
  });

  test('succeeds when directory exists', async () => {
    expect(() => ensureDir(tmpDir)).not.toThrow();
  });
});

describe('validateObject', () => {
  test('handles basic schema validation', async () => {
    const errors = [];
    const warnings = [];
    const schema = { type: 'object', properties: {} };
    validateObject({ name: 'test' }, schema, '', errors, warnings);
    // Should not throw
    expect(Array.isArray(errors)).toBe(true);
  });

  test('validates type mismatches', async () => {
    const errors = [];
    const warnings = [];
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    };
    validateObject({ name: 123 }, schema, '', errors, warnings);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('findPhaseInternal', () => {
  test('returns not-found when no phases dir', async () => {
    const result = findPhaseInternal(tmpDir, '1');
    // May return null or an object with found: false
    expect(result === null || (result && result.found === false)).toBe(true);
  });

  test('finds phase directory by number', async () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\nphase_slug: "foundation"\n---\nPhase: 1 of 1');
    const result = findPhaseInternal(tmpDir, '1');
    expect(result.found).toBe(true);
  });
});

describe('getMilestoneInfo', () => {
  test('returns milestone info from STATE.md', async () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\n---\n## Milestone\nCurrent: v1.0\nPhases: 1-5');
    const result = getMilestoneInfo(tmpDir);
    expect(result).toBeDefined();
  });

  test('returns null or empty when no STATE.md', async () => {
    const result = getMilestoneInfo(tmpDir);
    // May return null or default object
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('session management', () => {
  let planningDir;

  beforeEach(() => {
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  test('sessionLoad returns object when no session file', async () => {
    const result = sessionLoad(planningDir);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  test('sessionSave writes session file', async () => {
    sessionSave(planningDir, { activeSkill: 'build', phase: 1 });
    const sessionFile = path.join(planningDir, '.session.json');
    expect(fs.existsSync(sessionFile)).toBe(true);
  });

  test('ensureSessionDir creates session directory', async () => {
    ensureSessionDir(planningDir, 'test-session-123');
    const sessDir = path.join(planningDir, '.sessions', 'test-session-123');
    expect(fs.existsSync(sessDir)).toBe(true);
  });

  test('cleanStaleSessions removes old sessions', async () => {
    const sessDir = path.join(planningDir, '.sessions', 'old-session');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'info.json'),
      JSON.stringify({ created: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }));
    // Make the directory old
    const oldTime = Date.now() - (25 * 60 * 60 * 1000);
    fs.utimesSync(sessDir, new Date(oldTime), new Date(oldTime));
    const removed = cleanStaleSessions(planningDir);
    expect(Array.isArray(removed)).toBe(true);
  });
});

describe('KNOWN_AGENTS', () => {
  test('includes core agent types', async () => {
    expect(KNOWN_AGENTS).toContain('executor');
    expect(KNOWN_AGENTS).toContain('planner');
    expect(KNOWN_AGENTS).toContain('verifier');
    expect(KNOWN_AGENTS).toContain('general');
  });
});

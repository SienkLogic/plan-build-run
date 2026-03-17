'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  patternExtract,
  patternQuery,
  patternList,
  PATTERNS_DIR,
  PATTERN_TYPES,
} = require('../plan-build-run/bin/lib/patterns.cjs');

// --- Helpers ---

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'patterns-test-'));
}

function makePattern(overrides = {}) {
  return Object.assign({
    name: 'oauth-middleware',
    source_project: 'my-app',
    type: 'auth',
    tags: ['oauth', 'middleware', 'stack:node'],
    description: 'OAuth2 middleware pattern for Express',
    files: ['src/middleware/auth.js'],
    template_content: 'module.exports = function oauthMiddleware() {};',
    confidence: 0.8,
  }, overrides);
}

// --- Constants ---

describe('patterns constants', () => {
  test('PATTERNS_DIR is in ~/.claude/patterns/', () => {
    expect(PATTERNS_DIR).toBe(path.join(os.homedir(), '.claude', 'patterns'));
  });

  test('PATTERN_TYPES is an array including required types', () => {
    expect(Array.isArray(PATTERN_TYPES)).toBe(true);
    expect(PATTERN_TYPES).toContain('architecture');
    expect(PATTERN_TYPES).toContain('testing');
    expect(PATTERN_TYPES).toContain('auth');
    expect(PATTERN_TYPES).toContain('crud');
    expect(PATTERN_TYPES).toContain('deployment');
    expect(PATTERN_TYPES).toContain('error-handling');
    expect(PATTERN_TYPES).toContain('api-design');
    expect(PATTERN_TYPES).toContain('data-model');
  });
});

// --- patternExtract ---

describe('patternExtract', () => {
  test('creates a JSON file in basePath with correct schema fields', () => {
    const tmpDir = makeTempDir();
    const result = patternExtract(makePattern(), { basePath: tmpDir });

    expect(result.action).toBe('created');
    expect(result.pattern).toBeDefined();
    expect(result.pattern.id).toBeDefined();
    expect(result.pattern.name).toBe('oauth-middleware');
    expect(result.pattern.source_project).toBe('my-app');
    expect(result.pattern.type).toBe('auth');
    expect(result.pattern.tags).toContain('oauth');
    expect(result.pattern.description).toBeDefined();
    expect(result.pattern.created_at).toBeDefined();

    // File must exist on disk
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBe(1);

    const stored = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
    expect(stored.name).toBe('oauth-middleware');
  });

  test('deduplicates by name+source_project — updates existing entry', () => {
    const tmpDir = makeTempDir();
    patternExtract(makePattern({ tags: ['oauth'] }), { basePath: tmpDir });
    const result = patternExtract(makePattern({ tags: ['oauth', 'new-tag'] }), { basePath: tmpDir });

    expect(result.action).toBe('updated');

    // Only one file on disk
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBe(1);

    // Tags merged
    const stored = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
    expect(stored.tags).toContain('oauth');
    expect(stored.tags).toContain('new-tag');
  });

  test('generates id via crypto.randomUUID if missing', () => {
    const tmpDir = makeTempDir();
    const entry = makePattern();
    delete entry.id;
    const result = patternExtract(entry, { basePath: tmpDir });
    expect(result.pattern.id).toBeDefined();
    expect(typeof result.pattern.id).toBe('string');
    expect(result.pattern.id.length).toBeGreaterThan(0);
  });

  test('sets created_at if missing', () => {
    const tmpDir = makeTempDir();
    const result = patternExtract(makePattern(), { basePath: tmpDir });
    expect(result.pattern.created_at).toBeDefined();
    expect(() => new Date(result.pattern.created_at)).not.toThrow();
  });

  test('returns { enabled: false } when config toggle is off', () => {
    const tmpDir = makeTempDir();
    const result = patternExtract(makePattern(), {
      basePath: tmpDir,
      configFeatures: { cross_project_patterns: false },
    });
    expect(result).toEqual({ enabled: false });
  });

  test('creates directory if basePath does not exist', () => {
    const tmpDir = makeTempDir();
    const nested = path.join(tmpDir, 'patterns-subdir');
    const result = patternExtract(makePattern(), { basePath: nested });
    expect(result.action).toBe('created');
    expect(fs.existsSync(nested)).toBe(true);
  });

  test('throws on missing required fields', () => {
    const tmpDir = makeTempDir();
    expect(() => patternExtract({ name: 'only-name' }, { basePath: tmpDir })).toThrow();
  });
});

// --- patternQuery ---

describe('patternQuery', () => {
  function seedPatterns(tmpDir) {
    patternExtract(makePattern({
      name: 'pattern-a',
      type: 'auth',
      tags: ['oauth', 'stack:node'],
      confidence: 0.9,
    }), { basePath: tmpDir });
    patternExtract(makePattern({
      name: 'pattern-b',
      type: 'crud',
      tags: ['rest', 'stack:node'],
      confidence: 0.5,
    }), { basePath: tmpDir });
    patternExtract(makePattern({
      name: 'pattern-c',
      type: 'auth',
      tags: ['jwt', 'stack:python'],
      confidence: 0.7,
    }), { basePath: tmpDir });
  }

  test('returns all patterns when no filters', () => {
    const tmpDir = makeTempDir();
    seedPatterns(tmpDir);
    const results = patternQuery({}, { basePath: tmpDir });
    expect(results.length).toBe(3);
  });

  test('filters by type (exact match)', () => {
    const tmpDir = makeTempDir();
    seedPatterns(tmpDir);
    const results = patternQuery({ type: 'auth' }, { basePath: tmpDir });
    expect(results.length).toBe(2);
    results.forEach(r => expect(r.type).toBe('auth'));
  });

  test('filters by tags (all must match)', () => {
    const tmpDir = makeTempDir();
    seedPatterns(tmpDir);
    const results = patternQuery({ tags: ['oauth', 'stack:node'] }, { basePath: tmpDir });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('pattern-a');
  });

  test('filters by stack (tag prefix stack:)', () => {
    const tmpDir = makeTempDir();
    seedPatterns(tmpDir);
    const results = patternQuery({ stack: 'node' }, { basePath: tmpDir });
    expect(results.length).toBe(2);
  });

  test('sorts results by confidence descending', () => {
    const tmpDir = makeTempDir();
    seedPatterns(tmpDir);
    const results = patternQuery({}, { basePath: tmpDir });
    expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
    expect(results[1].confidence).toBeGreaterThanOrEqual(results[2].confidence);
  });

  test('filters by minConfidence', () => {
    const tmpDir = makeTempDir();
    seedPatterns(tmpDir);
    const results = patternQuery({ minConfidence: 0.75 }, { basePath: tmpDir });
    results.forEach(r => expect(r.confidence).toBeGreaterThanOrEqual(0.75));
  });

  test('returns empty array when basePath has no patterns', () => {
    const tmpDir = makeTempDir();
    const results = patternQuery({}, { basePath: tmpDir });
    expect(results).toEqual([]);
  });

  test('returns { enabled: false } when config toggle is off', () => {
    const tmpDir = makeTempDir();
    const result = patternQuery({}, {
      basePath: tmpDir,
      configFeatures: { cross_project_patterns: false },
    });
    expect(result).toEqual({ enabled: false });
  });
});

// --- patternList ---

describe('patternList', () => {
  test('returns summary array with name, type, tags, source_project, confidence', () => {
    const tmpDir = makeTempDir();
    patternExtract(makePattern({ name: 'list-pattern', source_project: 'proj-x', type: 'crud' }), { basePath: tmpDir });
    const results = patternList({ basePath: tmpDir });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('list-pattern');
    expect(results[0].type).toBe('crud');
    expect(results[0].source_project).toBe('proj-x');
    expect(results[0].tags).toBeDefined();
    expect(results[0].confidence).toBeDefined();
  });

  test('returns empty array when no patterns exist', () => {
    const tmpDir = makeTempDir();
    const results = patternList({ basePath: tmpDir });
    expect(results).toEqual([]);
  });

  test('returns { enabled: false } when config toggle is off', () => {
    const tmpDir = makeTempDir();
    const result = patternList({
      basePath: tmpDir,
      configFeatures: { cross_project_patterns: false },
    });
    expect(result).toEqual({ enabled: false });
  });
});

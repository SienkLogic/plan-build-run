'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  computeConfidence,
  validateEntry,
  loadAll,
  learningsIngest,
  learningsQuery,
  checkDeferralThresholds,
  GLOBAL_LEARNINGS_PATH,
  LEARNING_TYPES
} = require('../plugins/pbr/scripts/lib/learnings');

// --- Shared entry factory ---

function makeEntry(overrides = {}) {
  return Object.assign({
    id: 'test-id-001',
    source_project: 'test-project',
    type: 'tech-pattern',
    tags: ['react', 'frontend'],
    confidence: 'low',
    occurrences: 1,
    summary: 'React hooks work well for state management',
    detail: 'Used useState and useEffect throughout the project'
  }, overrides);
}

// --- Tests ---

describe('computeConfidence', () => {
  test('occurrences=1 returns low', () => {
    expect(computeConfidence(1)).toBe('low');
  });

  test('occurrences=2 returns medium', () => {
    expect(computeConfidence(2)).toBe('medium');
  });

  test('occurrences=3 returns high', () => {
    expect(computeConfidence(3)).toBe('high');
  });

  test('occurrences=5 returns high', () => {
    expect(computeConfidence(5)).toBe('high');
  });
});

describe('validateEntry', () => {
  test('valid entry returns { valid: true, errors: [] }', () => {
    const result = validateEntry(makeEntry());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('missing required field returns { valid: false, errors: [...] }', () => {
    const entry = makeEntry();
    delete entry.summary;
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/summary/);
  });

  test('invalid type returns { valid: false } with errors mentioning bad type', () => {
    const entry = makeEntry({ type: 'not-a-valid-type' });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not-a-valid-type'))).toBe(true);
  });

  test('invalid confidence value returns { valid: false }', () => {
    const entry = makeEntry({ confidence: 'ultra-high' });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ultra-high'))).toBe(true);
  });

  test('tags must be non-empty array', () => {
    const entry = makeEntry({ tags: [] });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non-empty'))).toBe(true);
  });

  test('tags must be an array, not a string', () => {
    const entry = makeEntry({ tags: 'react' });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tags must be an array'))).toBe(true);
  });
});

describe('learningsIngest + loadAll', () => {
  let tmpDir, tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-test-'));
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('ingest creates file if not exists', () => {
    expect(fs.existsSync(tmpFile)).toBe(false);
    learningsIngest(makeEntry(), { filePath: tmpFile });
    expect(fs.existsSync(tmpFile)).toBe(true);
  });

  test('ingest returns { action: "created", entry }', () => {
    const result = learningsIngest(makeEntry(), { filePath: tmpFile });
    expect(result.action).toBe('created');
    expect(result.entry).toBeDefined();
    expect(result.entry.summary).toBe('React hooks work well for state management');
  });

  test('ingest second entry with same source_project+type+summary deduplicates (action: updated, occurrences: 2)', () => {
    learningsIngest(makeEntry(), { filePath: tmpFile });
    const result = learningsIngest(makeEntry(), { filePath: tmpFile });
    expect(result.action).toBe('updated');
    expect(result.entry.occurrences).toBe(2);
  });

  test('dedup updates confidence from low to medium on second occurrence', () => {
    learningsIngest(makeEntry(), { filePath: tmpFile });
    const result = learningsIngest(makeEntry(), { filePath: tmpFile });
    expect(result.entry.confidence).toBe('medium');
  });

  test('dedup updates confidence to high at 3 occurrences', () => {
    learningsIngest(makeEntry(), { filePath: tmpFile });
    learningsIngest(makeEntry(), { filePath: tmpFile });
    const result = learningsIngest(makeEntry(), { filePath: tmpFile });
    expect(result.entry.confidence).toBe('high');
    expect(result.entry.occurrences).toBe(3);
  });

  test('ingest generates id if missing', () => {
    const entry = makeEntry();
    delete entry.id;
    const result = learningsIngest(entry, { filePath: tmpFile });
    expect(result.entry.id).toBeTruthy();
  });

  test('ingest sets created_at if missing', () => {
    const entry = makeEntry();
    delete entry.created_at;
    const result = learningsIngest(entry, { filePath: tmpFile });
    expect(result.entry.created_at).toBeTruthy();
    expect(() => new Date(result.entry.created_at)).not.toThrow();
  });

  test('ingest throws on invalid entry (missing required field)', () => {
    const entry = makeEntry();
    delete entry.source_project;
    expect(() => learningsIngest(entry, { filePath: tmpFile })).toThrow(/Invalid learning entry/);
  });

  test('loadAll returns [] when file does not exist', () => {
    const result = loadAll(tmpFile);
    expect(result).toEqual([]);
  });

  test('loadAll skips malformed lines gracefully', () => {
    fs.writeFileSync(tmpFile, 'not-json\n{"id":"ok","source_project":"p","type":"tech-pattern","tags":["x"],"confidence":"low","occurrences":1,"summary":"ok"}\nbad{json\n', 'utf8');
    const result = loadAll(tmpFile);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('ok');
  });
});

describe('learningsQuery', () => {
  let tmpDir, tmpFile;

  const reactEntry = makeEntry({
    id: 'q-001',
    source_project: 'project-a',
    type: 'tech-pattern',
    tags: ['react', 'frontend', 'stack:react'],
    confidence: 'high',
    occurrences: 3,
    summary: 'React hooks work well'
  });

  const nodeEntry = makeEntry({
    id: 'q-002',
    source_project: 'project-b',
    type: 'anti-pattern',
    tags: ['node', 'backend'],
    confidence: 'medium',
    occurrences: 2,
    summary: 'Avoid callback hell'
  });

  const estimationEntry = makeEntry({
    id: 'q-003',
    source_project: 'project-c',
    type: 'estimation-metric',
    tags: ['estimation', 'planning'],
    confidence: 'low',
    occurrences: 1,
    summary: 'Auth takes about 3 phases'
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-query-'));
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
    learningsIngest(reactEntry, { filePath: tmpFile });
    learningsIngest(nodeEntry, { filePath: tmpFile });
    learningsIngest(estimationEntry, { filePath: tmpFile });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('no filters returns all entries', () => {
    const result = learningsQuery({}, { filePath: tmpFile });
    expect(result.length).toBe(3);
  });

  test('--tags [react] returns only entries containing react tag', () => {
    const result = learningsQuery({ tags: ['react'] }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('q-001');
  });

  test('--min-confidence medium returns medium + high entries only', () => {
    const result = learningsQuery({ minConfidence: 'medium' }, { filePath: tmpFile });
    expect(result.length).toBe(2);
    const ids = result.map(e => e.id);
    expect(ids).toContain('q-001');
    expect(ids).toContain('q-002');
    expect(ids).not.toContain('q-003');
  });

  test('--min-confidence high returns only high confidence entries', () => {
    const result = learningsQuery({ minConfidence: 'high' }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('q-001');
  });

  test('--stack react matches entries with stack:react tag', () => {
    const result = learningsQuery({ stack: 'react' }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('q-001');
  });

  test('--type tech-pattern returns only tech-pattern entries', () => {
    const result = learningsQuery({ type: 'tech-pattern' }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('tech-pattern');
  });

  test('combined filters (tags + minConfidence) apply as AND', () => {
    // react tag + medium confidence — reactEntry is high, so it qualifies
    const result = learningsQuery({ tags: ['react'], minConfidence: 'medium' }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('q-001');
  });

  test('results sorted by occurrences descending', () => {
    const result = learningsQuery({}, { filePath: tmpFile });
    expect(result[0].occurrences).toBeGreaterThanOrEqual(result[1].occurrences);
    expect(result[1].occurrences).toBeGreaterThanOrEqual(result[2].occurrences);
  });
});

describe('checkDeferralThresholds', () => {
  let tmpDir, tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-thresh-'));
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns [] when count < 51', () => {
    // Ingest 5 entries
    for (let i = 0; i < 5; i++) {
      learningsIngest(makeEntry({ id: `t-${i}`, summary: `pattern ${i}` }), { filePath: tmpFile });
    }
    const result = checkDeferralThresholds({ filePath: tmpFile });
    expect(Array.isArray(result)).toBe(true);
    // organic-taxonomy threshold needs > 50, so should not be triggered
    const orgTax = result.find(r => r.key === 'organic-taxonomy');
    expect(orgTax).toBeUndefined();
  });

  test('returns triggered threshold when count > 50', () => {
    // Ingest 51 unique entries
    for (let i = 0; i < 51; i++) {
      learningsIngest(makeEntry({ id: `bulk-${i}`, summary: `unique pattern ${i}` }), { filePath: tmpFile });
    }
    const result = checkDeferralThresholds({ filePath: tmpFile });
    const orgTax = result.find(r => r.key === 'organic-taxonomy');
    expect(orgTax).toBeDefined();
    expect(orgTax.trigger).toBe('count > 50');
    expect(orgTax.message).toMatch(/organic-taxonomy/);
  });

  test('GLOBAL_LEARNINGS_PATH contains .claude and ends with learnings.jsonl', () => {
    expect(GLOBAL_LEARNINGS_PATH).toMatch(/\.claude/);
    expect(GLOBAL_LEARNINGS_PATH.endsWith('learnings.jsonl')).toBe(true);
  });
});

describe('LEARNING_TYPES', () => {
  test('is a non-empty array of strings', () => {
    expect(Array.isArray(LEARNING_TYPES)).toBe(true);
    expect(LEARNING_TYPES.length).toBeGreaterThan(0);
    LEARNING_TYPES.forEach(t => expect(typeof t).toBe('string'));
  });

  test('includes tech-pattern and anti-pattern', () => {
    expect(LEARNING_TYPES).toContain('tech-pattern');
    expect(LEARNING_TYPES).toContain('anti-pattern');
  });
});

// --- Additional branch coverage tests ---

describe('validateEntry - uncovered branches', () => {
  test('null entry returns invalid with specific message', () => {
    const result = validateEntry(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('entry is null or undefined');
  });

  test('undefined entry returns invalid with specific message', () => {
    const result = validateEntry(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('entry is null or undefined');
  });

  test('non-integer occurrences (float) returns error', () => {
    const entry = makeEntry({ occurrences: 1.5 });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('positive integer'))).toBe(true);
  });

  test('zero occurrences returns error', () => {
    const entry = makeEntry({ occurrences: 0 });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('positive integer'))).toBe(true);
  });

  test('negative occurrences returns error', () => {
    const entry = makeEntry({ occurrences: -2 });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('positive integer'))).toBe(true);
  });

  test('tags with non-string elements returns error', () => {
    const entry = makeEntry({ tags: ['valid', 42, true] });
    const result = validateEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non-string value'))).toBe(true);
  });

  test('tags with all non-string elements counts them correctly', () => {
    const entry = makeEntry({ tags: [1, 2, 3] });
    const result = validateEntry(entry);
    expect(result.errors.some(e => e.includes('3 non-string'))).toBe(true);
  });

  test('undefined occurrences skips occurrences validation', () => {
    const entry = makeEntry();
    delete entry.occurrences;
    const result = validateEntry(entry);
    // Should have missing required field error but NOT the positive integer error
    expect(result.errors.some(e => e.includes('missing required field: occurrences'))).toBe(true);
    expect(result.errors.some(e => e.includes('positive integer'))).toBe(false);
  });

  test('undefined tags skips tags validation', () => {
    const entry = makeEntry();
    delete entry.tags;
    const result = validateEntry(entry);
    expect(result.errors.some(e => e.includes('missing required field: tags'))).toBe(true);
    expect(result.errors.some(e => e.includes('tags must be an array'))).toBe(false);
    expect(result.errors.some(e => e.includes('non-empty'))).toBe(false);
  });

  test('valid tags with all strings passes', () => {
    const entry = makeEntry({ tags: ['a', 'b', 'c'] });
    const result = validateEntry(entry);
    expect(result.errors.some(e => e.includes('non-string'))).toBe(false);
  });
});

describe('learningsIngest - crypto.randomUUID fallback', () => {
  let tmpDir, tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-uuid-'));
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to Date+Math id when crypto.randomUUID throws', () => {
    const crypto = require('crypto');
    const origRandomUUID = crypto.randomUUID;
    crypto.randomUUID = () => { throw new Error('not available'); };
    try {
      const entry = makeEntry();
      delete entry.id;
      const result = learningsIngest(entry, { filePath: tmpFile });
      expect(result.entry.id).toBeTruthy();
      expect(typeof result.entry.id).toBe('string');
      // Should be a base36 timestamp + random string
      expect(result.entry.id.length).toBeGreaterThan(5);
    } finally {
      crypto.randomUUID = origRandomUUID;
    }
  });
});

describe('learningsQuery - additional branch coverage', () => {
  let tmpDir, tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-qbranch-'));
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('minConfidence low skips filtering (returns all)', () => {
    learningsIngest(makeEntry({ id: 'a', summary: 'a', confidence: 'low', occurrences: 1 }), { filePath: tmpFile });
    learningsIngest(makeEntry({ id: 'b', summary: 'b', confidence: 'high', occurrences: 3 }), { filePath: tmpFile });
    const result = learningsQuery({ minConfidence: 'low' }, { filePath: tmpFile });
    expect(result.length).toBe(2);
  });

  test('stack filter matches stack_tags array', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    saveAll([
      makeEntry({ id: 's1', summary: 's1', tags: ['backend'], stack_tags: ['express'] })
    ], tmpFile);
    const result = learningsQuery({ stack: 'express' }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('s1');
  });

  test('entries missing tags are excluded by tag filter', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    saveAll([
      makeEntry({ id: 'notags', summary: 'notags' }),
      { id: 'notagsfield', summary: 'no tags field', occurrences: 1 }
    ], tmpFile);
    const result = learningsQuery({ tags: ['react'] }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('notags');
  });

  test('entries missing tags/stack_tags are excluded by stack filter', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    saveAll([
      { id: 'bare', summary: 'bare entry', occurrences: 1 }
    ], tmpFile);
    const result = learningsQuery({ stack: 'anything' }, { filePath: tmpFile });
    expect(result.length).toBe(0);
  });

  test('entries without occurrences sort as 1', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    saveAll([
      { id: 'noocc', summary: 'no occurrences' },
      makeEntry({ id: 'has3', summary: 'has3', occurrences: 3 })
    ], tmpFile);
    const result = learningsQuery({}, { filePath: tmpFile });
    expect(result[0].id).toBe('has3');
  });

  test('entries without confidence are filtered out by minConfidence medium', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    saveAll([
      { id: 'noconf', summary: 'no confidence field', occurrences: 1 },
      makeEntry({ id: 'med', summary: 'med', confidence: 'medium', occurrences: 2 })
    ], tmpFile);
    const result = learningsQuery({ minConfidence: 'medium' }, { filePath: tmpFile });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('med');
  });

  test('unknown minConfidence value skips confidence filtering', () => {
    learningsIngest(makeEntry({ id: 'x', summary: 'x' }), { filePath: tmpFile });
    const result = learningsQuery({ minConfidence: 'super-ultra' }, { filePath: tmpFile });
    expect(result.length).toBe(1);
  });

  test('empty tags array does not filter', () => {
    learningsIngest(makeEntry({ id: 'et', summary: 'et' }), { filePath: tmpFile });
    const result = learningsQuery({ tags: [] }, { filePath: tmpFile });
    expect(result.length).toBe(1);
  });
});

describe('checkDeferralThresholds - additional branches', () => {
  let tmpDir, tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-thresh2-'));
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('statistical-confidence triggers when single tag has high occurrence sum', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    const entries = [];
    for (let i = 0; i < 4; i++) {
      entries.push(makeEntry({ id: `sc-${i}`, summary: `sc ${i}`, tags: ['hot'], occurrences: 6 }));
    }
    saveAll(entries, tmpFile);
    const result = checkDeferralThresholds({ filePath: tmpFile });
    const stat = result.find(r => r.key === 'statistical-confidence');
    expect(stat).toBeDefined();
    expect(stat.trigger).toBe('any_tag >= 20');
  });

  test('audit-integration triggers when planning-failure + process-failure > 10', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    const entries = [];
    for (let i = 0; i < 6; i++) {
      entries.push(makeEntry({ id: `pf-${i}`, summary: `pf ${i}`, type: 'planning-failure', tags: ['a'] }));
    }
    for (let i = 0; i < 6; i++) {
      entries.push(makeEntry({ id: `prfail-${i}`, summary: `prfail ${i}`, type: 'process-failure', tags: ['a'] }));
    }
    saveAll(entries, tmpFile);
    const result = checkDeferralThresholds({ filePath: tmpFile });
    const audit = result.find(r => r.key === 'audit-integration');
    expect(audit).toBeDefined();
  });

  test('entries without tags do not crash tag counting', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    saveAll([{ id: 'nt', summary: 'no tags' }], tmpFile);
    const result = checkDeferralThresholds({ filePath: tmpFile });
    expect(Array.isArray(result)).toBe(true);
  });

  test('entries without occurrences default to 1 in tag counting', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    saveAll([{ id: 'no', summary: 'no occ', tags: ['x'] }], tmpFile);
    // Should not crash; tag 'x' gets count 1
    const result = checkDeferralThresholds({ filePath: tmpFile });
    expect(Array.isArray(result)).toBe(true);
  });

  test('empty file returns empty thresholds', () => {
    const result = checkDeferralThresholds({ filePath: path.join(tmpDir, 'nonexistent.jsonl') });
    expect(result).toEqual([]);
  });
});

describe('saveAll', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-save-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('creates nested directories', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    const filePath = path.join(tmpDir, 'deep', 'nested', 'learnings.jsonl');
    saveAll([{ id: '1' }], filePath);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('empty entries produces empty file content', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    const filePath = path.join(tmpDir, 'empty.jsonl');
    saveAll([], filePath);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('');
  });
});

describe('loadAll - edge cases', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-load-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('empty file returns empty array', () => {
    const filePath = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(filePath, '');
    expect(loadAll(filePath)).toEqual([]);
  });

  test('file with only whitespace returns empty array', () => {
    const filePath = path.join(tmpDir, 'ws.jsonl');
    fs.writeFileSync(filePath, '   \n  \n\n');
    expect(loadAll(filePath)).toEqual([]);
  });
});

describe('learningsIngest - does not mutate input', () => {
  let tmpDir, tmpFile;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-mutate-'));
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('original rawEntry is not mutated', () => {
    const raw = makeEntry();
    delete raw.id;
    delete raw.created_at;
    learningsIngest(raw, { filePath: tmpFile });
    expect(raw.id).toBeUndefined();
    expect(raw.created_at).toBeUndefined();
  });

  test('preserves existing created_at when provided', () => {
    const entry = makeEntry({ created_at: '2020-01-01T00:00:00Z' });
    const result = learningsIngest(entry, { filePath: tmpFile });
    expect(result.entry.created_at).toBe('2020-01-01T00:00:00Z');
  });

  test('preserves existing id when provided', () => {
    const entry = makeEntry({ id: 'custom-id-999' });
    const result = learningsIngest(entry, { filePath: tmpFile });
    expect(result.entry.id).toBe('custom-id-999');
  });

  test('dedup handles existing entry with no occurrences field', () => {
    const { saveAll } = require('../plugins/pbr/scripts/lib/learnings');
    // Manually write an entry missing occurrences field
    saveAll([{
      id: 'dup-no-occ',
      source_project: 'test-project',
      type: 'tech-pattern',
      tags: ['react', 'frontend'],
      confidence: 'low',
      summary: 'React hooks work well for state management'
    }], tmpFile);
    // Ingest same entry to trigger dedup
    const result = learningsIngest(makeEntry(), { filePath: tmpFile });
    expect(result.action).toBe('updated');
    // (undefined || 1) + 1 = 2
    expect(result.entry.occurrences).toBe(2);
  });
});

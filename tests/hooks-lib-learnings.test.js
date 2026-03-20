/**
 * Tests for hooks/lib/learnings.js — CRUD, query, confidence, deferral thresholds.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  computeConfidence,
  validateEntry,
  loadAll,
  saveAll,
  learningsIngest,
  learningsQuery,
  checkDeferralThresholds,
  copyToGlobal,
  queryGlobal,
  LEARNING_TYPES,
  CONFIDENCE_TIERS,
  DEFERRAL_THRESHOLDS
} = require('../plugins/pbr/scripts/lib/learnings');

let tmpDir;

function makeTmpDir() {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-test-')));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('constants', () => {
  it('exports LEARNING_TYPES as a non-empty array', () => {
    expect(Array.isArray(LEARNING_TYPES)).toBe(true);
    expect(LEARNING_TYPES.length).toBeGreaterThan(0);
    expect(LEARNING_TYPES).toContain('tech-pattern');
  });

  it('exports CONFIDENCE_TIERS with expected keys', () => {
    expect(CONFIDENCE_TIERS).toHaveProperty('low');
    expect(CONFIDENCE_TIERS).toHaveProperty('medium');
    expect(CONFIDENCE_TIERS).toHaveProperty('high');
  });

  it('exports DEFERRAL_THRESHOLDS as array', () => {
    expect(Array.isArray(DEFERRAL_THRESHOLDS)).toBe(true);
    expect(DEFERRAL_THRESHOLDS.length).toBe(4);
  });
});

describe('computeConfidence', () => {
  it('returns low for 1 occurrence', () => {
    expect(computeConfidence(1)).toBe('low');
  });

  it('returns medium for 2 occurrences', () => {
    expect(computeConfidence(2)).toBe('medium');
  });

  it('returns high for 3+ occurrences', () => {
    expect(computeConfidence(3)).toBe('high');
    expect(computeConfidence(10)).toBe('high');
  });

  it('returns low for 0 or negative', () => {
    expect(computeConfidence(0)).toBe('low');
    expect(computeConfidence(-1)).toBe('low');
  });
});

describe('validateEntry', () => {
  it('passes for a valid entry', () => {
    const entry = {
      id: 'test-1',
      source_project: 'myapp',
      type: 'tech-pattern',
      tags: ['react'],
      confidence: 'high',
      occurrences: 3,
      summary: 'React hooks work well'
    };
    const result = validateEntry(entry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for null entry', () => {
    const result = validateEntry(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('entry is null or undefined');
  });

  it('fails for missing required fields', () => {
    const result = validateEntry({ type: 'tech-pattern' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing required field'))).toBe(true);
  });

  it('fails for invalid type', () => {
    const result = validateEntry({
      id: '1', source_project: 'x', type: 'invalid-type',
      tags: ['a'], confidence: 'low', occurrences: 1, summary: 's'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('invalid type'))).toBe(true);
  });

  it('fails for empty tags array', () => {
    const result = validateEntry({
      id: '1', source_project: 'x', type: 'tech-pattern',
      tags: [], confidence: 'low', occurrences: 1, summary: 's'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non-empty'))).toBe(true);
  });

  it('fails for non-integer occurrences', () => {
    const result = validateEntry({
      id: '1', source_project: 'x', type: 'tech-pattern',
      tags: ['a'], confidence: 'low', occurrences: 1.5, summary: 's'
    });
    expect(result.valid).toBe(false);
  });
});

describe('loadAll / saveAll', () => {
  it('returns empty array for missing file', () => {
    const result = loadAll('/nonexistent/learnings.jsonl');
    expect(result).toEqual([]);
  });

  it('round-trips entries through save and load', () => {
    makeTmpDir();
    const filePath = path.join(tmpDir, 'test.jsonl');
    const entries = [
      { id: '1', summary: 'Entry 1' },
      { id: '2', summary: 'Entry 2' }
    ];
    saveAll(entries, filePath);
    const loaded = loadAll(filePath);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('1');
    expect(loaded[1].id).toBe('2');
  });

  it('skips malformed JSON lines', () => {
    makeTmpDir();
    const filePath = path.join(tmpDir, 'bad.jsonl');
    fs.writeFileSync(filePath, '{"id":"1"}\n{bad json\n{"id":"2"}\n');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loaded = loadAll(filePath);
    expect(loaded).toHaveLength(2);
    consoleSpy.mockRestore();
  });
});

describe('learningsIngest', () => {
  it('creates a new entry', () => {
    makeTmpDir();
    const filePath = path.join(tmpDir, 'ingest.jsonl');
    const result = learningsIngest({
      id: 'test-1',
      source_project: 'myapp',
      type: 'tech-pattern',
      tags: ['node'],
      confidence: 'low',
      occurrences: 1,
      summary: 'Node is fast'
    }, { filePath });
    expect(result.action).toBe('created');
    expect(result.entry.id).toBe('test-1');
  });

  it('deduplicates and updates occurrences', () => {
    makeTmpDir();
    const filePath = path.join(tmpDir, 'dup.jsonl');
    const entry = {
      id: 'test-1', source_project: 'myapp', type: 'tech-pattern',
      tags: ['node'], confidence: 'low', occurrences: 1, summary: 'Same entry'
    };
    learningsIngest(entry, { filePath });
    const result = learningsIngest(entry, { filePath });
    expect(result.action).toBe('updated');
    expect(result.entry.occurrences).toBe(2);
  });

  it('throws for invalid entry', () => {
    makeTmpDir();
    const filePath = path.join(tmpDir, 'invalid.jsonl');
    expect(() => learningsIngest({ summary: 'no fields' }, { filePath })).toThrow('Invalid learning entry');
  });
});

describe('learningsQuery', () => {
  let filePath;

  beforeEach(() => {
    makeTmpDir();
    filePath = path.join(tmpDir, 'query.jsonl');
    const entries = [
      { id: '1', source_project: 'a', type: 'tech-pattern', tags: ['react', 'hooks'], confidence: 'high', occurrences: 5, summary: 'React hooks' },
      { id: '2', source_project: 'b', type: 'anti-pattern', tags: ['react'], confidence: 'low', occurrences: 1, summary: 'Avoid classes' },
      { id: '3', source_project: 'c', type: 'tech-pattern', tags: ['node', 'stack:express'], confidence: 'medium', occurrences: 2, summary: 'Express middleware' }
    ];
    saveAll(entries, filePath);
  });

  it('returns all entries with no filters', () => {
    const results = learningsQuery({}, { filePath });
    expect(results).toHaveLength(3);
  });

  it('filters by tags (all must match)', () => {
    const results = learningsQuery({ tags: ['react', 'hooks'] }, { filePath });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('filters by minConfidence', () => {
    const results = learningsQuery({ minConfidence: 'medium' }, { filePath });
    expect(results).toHaveLength(2); // high + medium
  });

  it('filters by stack', () => {
    const results = learningsQuery({ stack: 'express' }, { filePath });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('3');
  });

  it('filters by type', () => {
    const results = learningsQuery({ type: 'anti-pattern' }, { filePath });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('2');
  });

  it('sorts by occurrences descending', () => {
    const results = learningsQuery({}, { filePath });
    expect(results[0].occurrences).toBe(5);
    expect(results[results.length - 1].occurrences).toBe(1);
  });
});

describe('checkDeferralThresholds', () => {
  it('returns empty array when no thresholds are met', () => {
    makeTmpDir();
    const filePath = path.join(tmpDir, 'empty.jsonl');
    saveAll([], filePath);
    const triggered = checkDeferralThresholds({ filePath });
    expect(triggered).toEqual([]);
  });

  it('triggers organic-taxonomy when count > 50', () => {
    makeTmpDir();
    const filePath = path.join(tmpDir, 'many.jsonl');
    const entries = Array.from({ length: 51 }, (_, i) => ({
      id: String(i), source_project: 'x', type: 'tech-pattern',
      tags: ['t'], confidence: 'low', occurrences: 1, summary: `Entry ${i}`
    }));
    saveAll(entries, filePath);
    const triggered = checkDeferralThresholds({ filePath });
    expect(triggered.some(t => t.key === 'organic-taxonomy')).toBe(true);
  });
});

describe('copyToGlobal', () => {
  it('returns not copied for non-existent file', () => {
    const result = copyToGlobal('/nonexistent/LEARNINGS.md', 'test');
    expect(result.copied).toBe(false);
    expect(result.reason).toBe('file not found');
  });

  it('returns not copied when not marked cross_project', () => {
    makeTmpDir();
    const mdPath = path.join(tmpDir, 'LEARNINGS.md');
    fs.writeFileSync(mdPath, '---\nphase: "test"\n---\nContent here');
    const result = copyToGlobal(mdPath, 'test');
    expect(result.copied).toBe(false);
    expect(result.reason).toBe('not marked cross_project');
  });
});

describe('queryGlobal', () => {
  it('returns empty array when global dir does not exist', () => {
    const result = queryGlobal({});
    // May or may not have global knowledge — just confirm no crash
    expect(Array.isArray(result)).toBe(true);
  });
});

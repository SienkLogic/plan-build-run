'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  parseMustHavesBlock,
  FRONTMATTER_SCHEMAS,
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
} = require('../plugins/pbr/scripts/lib/frontmatter');

describe('extractFrontmatter', () => {
  test('returns empty object for content without frontmatter', () => {
    expect(extractFrontmatter('# No frontmatter')).toEqual({});
  });

  test('parses simple key-value pairs', () => {
    const content = '---\nname: test\nversion: 1\n---\n# Body';
    const fm = extractFrontmatter(content);
    expect(fm.name).toBe('test');
    expect(fm.version).toBe('1');
  });

  test('parses quoted values (strips quotes)', () => {
    const content = '---\nname: "my-project"\nslug: \'slug-val\'\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.name).toBe('my-project');
    expect(fm.slug).toBe('slug-val');
  });

  test('parses inline arrays', () => {
    const content = '---\ntags: [a, b, c]\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.tags).toEqual(['a', 'b', 'c']);
  });

  test('parses inline arrays with quoted items', () => {
    const content = '---\ntags: ["tag:one", "tag:two"]\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.tags).toEqual(['tag:one', 'tag:two']);
  });

  test('parses multi-line arrays', () => {
    const content = '---\nitems:\n  - first\n  - second\n  - third\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.items).toEqual(['first', 'second', 'third']);
  });

  test('parses nested objects', () => {
    const content = '---\nmetrics:\n  duration: 5\n  status: pass\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.metrics).toBeDefined();
    expect(fm.metrics.duration).toBe('5');
    expect(fm.metrics.status).toBe('pass');
  });

  test('parses bracket-opened arrays', () => {
    const content = '---\nlist: [\n---\n';
    const fm = extractFrontmatter(content);
    expect(Array.isArray(fm.list)).toBe(true);
  });

  test('skips empty lines', () => {
    const content = '---\nname: test\n\nversion: 2\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.name).toBe('test');
    expect(fm.version).toBe('2');
  });

  test('handles empty key value (nested object)', () => {
    const content = '---\nouter:\n  inner: value\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.outer).toBeDefined();
    expect(fm.outer.inner).toBe('value');
  });
});

describe('reconstructFrontmatter', () => {
  test('serializes simple key-value pairs', () => {
    const result = reconstructFrontmatter({ name: 'test', version: '1' });
    expect(result).toContain('name: test');
    expect(result).toContain('version: 1');
  });

  test('serializes empty arrays', () => {
    const result = reconstructFrontmatter({ tags: [] });
    expect(result).toContain('tags: []');
  });

  test('serializes short inline arrays', () => {
    const result = reconstructFrontmatter({ tags: ['a', 'b'] });
    expect(result).toContain('tags: [a, b]');
  });

  test('serializes long arrays as multi-line', () => {
    const longItems = ['item-one', 'item-two', 'item-three', 'item-four'];
    const result = reconstructFrontmatter({ items: longItems });
    expect(result).toContain('items:');
    expect(result).toContain('  - item-one');
  });

  test('quotes strings containing colons', () => {
    const result = reconstructFrontmatter({ url: 'http://example.com' });
    expect(result).toContain('"http://example.com"');
  });

  test('quotes strings containing hash', () => {
    const result = reconstructFrontmatter({ ref: '#42' });
    expect(result).toContain('"#42"');
  });

  test('quotes strings starting with bracket or brace', () => {
    const result = reconstructFrontmatter({ val: '[test]' });
    expect(result).toContain('"[test]"');
  });

  test('skips null and undefined values', () => {
    const result = reconstructFrontmatter({ name: 'test', empty: null, undef: undefined });
    expect(result).toContain('name: test');
    expect(result).not.toContain('empty');
    expect(result).not.toContain('undef');
  });

  test('serializes nested objects', () => {
    const result = reconstructFrontmatter({
      metrics: { duration: '5', status: 'pass' }
    });
    expect(result).toContain('metrics:');
    expect(result).toContain('  duration: 5');
    expect(result).toContain('  status: pass');
  });

  test('serializes nested objects with arrays', () => {
    const result = reconstructFrontmatter({
      must_haves: { truths: ['truth-1', 'truth-2'] }
    });
    expect(result).toContain('must_haves:');
    expect(result).toContain('  truths: [truth-1, truth-2]');
  });

  test('serializes deeply nested objects', () => {
    const result = reconstructFrontmatter({
      outer: { inner: { key: 'value' } }
    });
    expect(result).toContain('outer:');
    expect(result).toContain('  inner:');
    expect(result).toContain('    key: value');
  });

  test('serializes nested empty arrays', () => {
    const result = reconstructFrontmatter({
      outer: { items: [] }
    });
    expect(result).toContain('  items: []');
  });

  test('serializes nested long arrays as multi-line', () => {
    const result = reconstructFrontmatter({
      outer: { items: ['a', 'b', 'c', 'd'] }
    });
    expect(result).toContain('  items:');
    expect(result).toContain('    - a');
  });

  test('skips null subvalues in nested objects', () => {
    const result = reconstructFrontmatter({
      outer: { valid: 'yes', empty: null }
    });
    expect(result).toContain('valid: yes');
    expect(result).not.toContain('empty');
  });

  test('quotes nested string values containing colons', () => {
    const result = reconstructFrontmatter({
      outer: { url: 'http://example.com' }
    });
    expect(result).toContain('"http://example.com"');
  });

  test('handles deeply nested arrays', () => {
    const result = reconstructFrontmatter({
      outer: { inner: { items: ['a', 'b'] } }
    });
    expect(result).toContain('    items:');
    expect(result).toContain('      - a');
  });

  test('handles deeply nested empty arrays', () => {
    const result = reconstructFrontmatter({
      outer: { inner: { items: [] } }
    });
    expect(result).toContain('    items: []');
  });

  test('handles deeply nested scalar values', () => {
    const result = reconstructFrontmatter({
      outer: { inner: { key: 'val' } }
    });
    expect(result).toContain('    key: val');
  });

  test('skips null in deeply nested objects', () => {
    const result = reconstructFrontmatter({
      outer: { inner: { key: null } }
    });
    expect(result).not.toContain('key');
  });

  test('handles arrays with colon-containing strings at nested level (long array)', () => {
    const result = reconstructFrontmatter({
      outer: { items: ['key: value', 'another: item', 'third: item', 'fourth: item'] }
    });
    expect(result).toContain('"key: value"');
  });
});

describe('spliceFrontmatter', () => {
  test('replaces existing frontmatter', () => {
    const content = '---\nold: value\n---\n# Body';
    const result = spliceFrontmatter(content, { new_key: 'new_value' });
    expect(result).toContain('new_key: new_value');
    expect(result).toContain('# Body');
    expect(result).not.toContain('old: value');
  });

  test('adds frontmatter when none exists', () => {
    const content = '# Just a body';
    const result = spliceFrontmatter(content, { key: 'value' });
    expect(result).toContain('---\nkey: value\n---');
    expect(result).toContain('# Just a body');
  });
});

describe('parseMustHavesBlock', () => {
  test('returns empty array when no frontmatter', () => {
    expect(parseMustHavesBlock('# No fm', 'truths')).toEqual([]);
  });

  test('returns empty array when block not found', () => {
    const content = '---\nmust_haves:\n    truths:\n      - "truth 1"\n---\n';
    expect(parseMustHavesBlock(content, 'artifacts')).toEqual([]);
  });

  test('parses simple string items', () => {
    const content = '---\nmust_haves:\n    truths:\n      - "truth one"\n      - "truth two"\n---\n';
    const result = parseMustHavesBlock(content, 'truths');
    expect(result).toEqual(['truth one', 'truth two']);
  });

  test('parses key-value items', () => {
    const content = '---\nmust_haves:\n    artifacts:\n      - path: /src/app.js\n        provides: feature\n---\n';
    const result = parseMustHavesBlock(content, 'artifacts');
    expect(result.length).toBe(1);
    expect(result[0].path).toBe('/src/app.js');
    expect(result[0].provides).toBe('feature');
  });

  test('handles numeric values in key-value items', () => {
    const content = '---\nmust_haves:\n    artifacts:\n      - path: test\n        count: 42\n---\n';
    const result = parseMustHavesBlock(content, 'artifacts');
    expect(result[0].count).toBe(42);
  });
});

describe('FRONTMATTER_SCHEMAS', () => {
  test('has plan schema with required fields', () => {
    expect(FRONTMATTER_SCHEMAS.plan.required).toContain('phase');
    expect(FRONTMATTER_SCHEMAS.plan.required).toContain('plan');
  });

  test('has summary schema', () => {
    expect(FRONTMATTER_SCHEMAS.summary.required).toContain('phase');
  });

  test('has verification schema', () => {
    expect(FRONTMATTER_SCHEMAS.verification.required).toContain('status');
  });
});

describe('frontmatter CRUD commands', () => {
  let tmpDir;
  let mockExit;
  let mockStdout;
  let mockStderr;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-fm-'));
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
    mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockStderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockStdout.mockRestore();
    mockStderr.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('cmdFrontmatterGet reads a field', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nname: test\n---\n# Body');
    try { cmdFrontmatterGet(tmpDir, 'test.md', 'name', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('test'));
  });

  test('cmdFrontmatterGet reads all fields when no field specified', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nname: test\nver: 1\n---\n');
    try { cmdFrontmatterGet(tmpDir, 'test.md', null, true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });

  test('cmdFrontmatterGet handles missing field', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nname: test\n---\n');
    try { cmdFrontmatterGet(tmpDir, 'test.md', 'missing', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });

  test('cmdFrontmatterGet handles missing file', () => {
    try { cmdFrontmatterGet(tmpDir, 'nonexistent.md', 'name', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });

  test('cmdFrontmatterSet updates a field', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nname: old\n---\n# Body');
    try { cmdFrontmatterSet(tmpDir, 'test.md', 'name', '"new"', true); } catch (_e) { /* exit mock */ }
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('name: new');
  });

  test('cmdFrontmatterSet handles non-JSON values', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nname: old\n---\n# Body');
    try { cmdFrontmatterSet(tmpDir, 'test.md', 'name', 'plain-string', true); } catch (_e) { /* exit mock */ }
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('name: plain-string');
  });

  test('cmdFrontmatterSet handles missing file', () => {
    try { cmdFrontmatterSet(tmpDir, 'nonexistent.md', 'name', 'val', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });

  test('cmdFrontmatterMerge merges data', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nname: test\n---\n# Body');
    try { cmdFrontmatterMerge(tmpDir, 'test.md', '{"version":"2"}', true); } catch (_e) { /* exit mock */ }
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('version: 2');
    expect(content).toContain('name: test');
  });

  test('cmdFrontmatterMerge handles missing file', () => {
    try { cmdFrontmatterMerge(tmpDir, 'nonexistent.md', '{"k":"v"}', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });

  test('cmdFrontmatterValidate validates against plan schema', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nphase: 1\nplan: 1\ntype: auto\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n---\n');
    try { cmdFrontmatterValidate(tmpDir, 'test.md', 'plan', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });

  test('cmdFrontmatterValidate detects missing fields', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, '---\nphase: 1\n---\n');
    try { cmdFrontmatterValidate(tmpDir, 'test.md', 'plan', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });

  test('cmdFrontmatterValidate handles missing file', () => {
    try { cmdFrontmatterValidate(tmpDir, 'nonexistent.md', 'plan', true); } catch (_e) { /* exit mock */ }
    expect(mockStdout).toHaveBeenCalled();
  });
});

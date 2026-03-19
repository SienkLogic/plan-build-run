/**
 * Tests for plugins/pbr/scripts/lib/wiring-check.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Use the module under test
const { checkKeyFilesImported, shouldSkip, escapeRegex } = require('../plugins/pbr/scripts/lib/wiring-check');

let tmpDir;

function createTmpDir() {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-check-test-')));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('shouldSkip', () => {
  it('skips test files', () => {
    expect(shouldSkip('foo.test.js')).toBe(true);
    expect(shouldSkip('bar.spec.ts')).toBe(true);
    expect(shouldSkip('baz.test.cjs')).toBe(true);
  });

  it('skips .md files', () => {
    expect(shouldSkip('README.md')).toBe(true);
    expect(shouldSkip('docs/guide.md')).toBe(true);
  });

  it('skips config files', () => {
    expect(shouldSkip('config.json')).toBe(true);
    expect(shouldSkip('.env')).toBe(true);
    expect(shouldSkip('package.json')).toBe(true);
    expect(shouldSkip('jest.config.cjs')).toBe(true);
  });

  it('does not skip regular JS files', () => {
    expect(shouldSkip('wiring-check.js')).toBe(false);
    expect(shouldSkip('src/utils.ts')).toBe(false);
    expect(shouldSkip('lib/core.cjs')).toBe(false);
  });
});

describe('escapeRegex', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegex('file.name')).toBe('file\\.name');
    expect(escapeRegex('a+b')).toBe('a\\+b');
  });
});

describe('checkKeyFilesImported', () => {
  it('returns imported: true for empty summary files array', () => {
    const result = checkKeyFilesImported([], '/tmp');
    expect(result.imported).toBe(true);
    expect(result.orphaned).toEqual([]);
  });

  it('returns imported: true for null/undefined input', () => {
    const result = checkKeyFilesImported(null, '/tmp');
    expect(result.imported).toBe(true);
    expect(result.orphaned).toEqual([]);
  });

  it('returns imported: true when key_files is empty', () => {
    const dir = createTmpDir();
    const summaryPath = path.join(dir, 'SUMMARY-01-01.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'plan: "01-01"',
      'status: complete',
      'key_files: []',
      '---',
      '',
      '## Results'
    ].join('\n'));

    const result = checkKeyFilesImported([summaryPath], dir);
    expect(result.imported).toBe(true);
    expect(result.orphaned).toEqual([]);
  });

  it('returns imported: true when key file IS imported by another file', () => {
    const dir = createTmpDir();

    // Create the key file
    fs.writeFileSync(path.join(dir, 'utils.js'), 'module.exports = { helper: () => {} };');

    // Create a file that imports it
    fs.writeFileSync(path.join(dir, 'main.js'), "const utils = require('./utils');");

    // Create summary referencing the key file
    const summaryPath = path.join(dir, 'SUMMARY-01-01.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'plan: "01-01"',
      'status: complete',
      'key_files:',
      '  - "utils.js"',
      '---',
      '',
      '## Results'
    ].join('\n'));

    const result = checkKeyFilesImported([summaryPath], dir);
    expect(result.imported).toBe(true);
    expect(result.orphaned).toEqual([]);
  });

  it('returns imported: false with orphaned list when key file is NOT imported', () => {
    const dir = createTmpDir();

    // Create the key file but nothing imports it
    fs.writeFileSync(path.join(dir, 'orphan.js'), 'module.exports = { lonely: true };');

    // Create an unrelated file
    fs.writeFileSync(path.join(dir, 'other.js'), "const x = require('./something-else');");

    // Create summary referencing the orphan
    const summaryPath = path.join(dir, 'SUMMARY-01-01.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'plan: "01-01"',
      'status: complete',
      'key_files:',
      '  - "orphan.js"',
      '---',
      '',
      '## Results'
    ].join('\n'));

    const result = checkKeyFilesImported([summaryPath], dir);
    expect(result.imported).toBe(false);
    expect(result.orphaned).toContain('orphan.js');
  });

  it('excludes test files from wiring check', () => {
    const dir = createTmpDir();

    // Create a test file that is never imported (expected)
    fs.writeFileSync(path.join(dir, 'utils.test.js'), 'test("works", () => {});');

    const summaryPath = path.join(dir, 'SUMMARY-01-01.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'plan: "01-01"',
      'status: complete',
      'key_files:',
      '  - "utils.test.js"',
      '---',
      '',
      '## Results'
    ].join('\n'));

    const result = checkKeyFilesImported([summaryPath], dir);
    expect(result.imported).toBe(true);
    expect(result.orphaned).toEqual([]);
  });

  it('excludes .md files from wiring check', () => {
    const dir = createTmpDir();

    fs.writeFileSync(path.join(dir, 'README.md'), '# Readme');

    const summaryPath = path.join(dir, 'SUMMARY-01-01.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'plan: "01-01"',
      'status: complete',
      'key_files:',
      '  - "README.md"',
      '---',
      '',
      '## Results'
    ].join('\n'));

    const result = checkKeyFilesImported([summaryPath], dir);
    expect(result.imported).toBe(true);
    expect(result.orphaned).toEqual([]);
  });

  it('handles key_files with "path: description" format', () => {
    const dir = createTmpDir();

    // Create a key file that IS imported
    fs.writeFileSync(path.join(dir, 'api.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(dir, 'server.js'), "const api = require('./api');");

    const summaryPath = path.join(dir, 'SUMMARY-01-01.md');
    fs.writeFileSync(summaryPath, [
      '---',
      'plan: "01-01"',
      'status: complete',
      'key_files:',
      '  - "api.js: API endpoint handlers"',
      '---',
      '',
      '## Results'
    ].join('\n'));

    const result = checkKeyFilesImported([summaryPath], dir);
    expect(result.imported).toBe(true);
    expect(result.orphaned).toEqual([]);
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { collectFiles, scanFile, checkFileName } = require('../hooks/branding-audit');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ba-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('collectFiles', () => {
  test('collects .js, .md, .tmpl, .json files', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'template.tmpl'), '');
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '');
    fs.writeFileSync(path.join(tmpDir, 'image.png'), '');
    const files = collectFiles(tmpDir, '');
    expect(files.length).toBe(4);
  });

  test('skips node_modules and .git dirs', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'test.js'), '');
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.writeFileSync(path.join(tmpDir, '.git', 'config'), '');
    const files = collectFiles(tmpDir, '');
    expect(files.length).toBe(0);
  });

  test('skips self file', () => {
    const selfPath = path.join(tmpDir, 'self.js');
    fs.writeFileSync(selfPath, '');
    const files = collectFiles(tmpDir, path.resolve(selfPath));
    expect(files.length).toBe(0);
  });

  test('recurses into subdirectories', () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'test.js'), '');
    const files = collectFiles(tmpDir, '');
    expect(files.length).toBe(1);
  });

  test('returns empty for non-existent directory', () => {
    const files = collectFiles(path.join(tmpDir, 'nonexistent'), '');
    expect(files).toEqual([]);
  });
});

describe('checkFileName', () => {
  test('detects gsd in filename', () => {
    const result = checkFileName('/path/to/gsd-tools.js');
    expect(result).not.toBeNull();
    expect(result.pattern).toContain('gsd');
  });

  test('returns null for clean filename', () => {
    const result = checkFileName('/path/to/pbr-tools.js');
    expect(result).toBeNull();
  });

  test('case insensitive detection', () => {
    const result = checkFileName('/path/to/GSD-config.json');
    expect(result).not.toBeNull();
  });
});

describe('scanFile', () => {
  test('detects string pattern matches', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, 'This uses get-shit-done framework\n');
    const { stringMatches } = scanFile(filePath);
    expect(stringMatches.length).toBeGreaterThan(0);
    expect(stringMatches[0].pattern).toContain('get-shit-done');
  });

  test('detects gsd standalone word', () => {
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, 'const gsd = require("framework");\n');
    const { stringMatches } = scanFile(filePath);
    expect(stringMatches.some(m => m.pattern.includes('gsd'))).toBe(true);
  });

  test('detects structural patterns (import)', () => {
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, 'const x = require("gsd-tools");\n');
    const { structuralMatches, stringMatches } = scanFile(filePath);
    const allMatches = [...structuralMatches, ...stringMatches];
    expect(allMatches.length).toBeGreaterThan(0);
  });

  test('returns empty for clean file', () => {
    const filePath = path.join(tmpDir, 'clean.js');
    fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\n');
    const { stringMatches, structuralMatches } = scanFile(filePath);
    expect(stringMatches.length).toBe(0);
    expect(structuralMatches.length).toBe(0);
  });

  test('returns empty for unreadable file', () => {
    const { stringMatches, structuralMatches } = scanFile('/nonexistent/file.js');
    expect(stringMatches.length).toBe(0);
    expect(structuralMatches.length).toBe(0);
  });

  test('detects slash-command pattern', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, 'Use /gsd:plan-phase for planning\n');
    const { stringMatches } = scanFile(filePath);
    expect(stringMatches.some(m => m.pattern.includes('/gsd:'))).toBe(true);
  });

  test('detects gsd_ template variables', () => {
    const filePath = path.join(tmpDir, 'test.tmpl');
    fs.writeFileSync(filePath, 'Template: gsd_project_name\n');
    const { structuralMatches } = scanFile(filePath);
    expect(structuralMatches.some(m => m.pattern.includes('template variable'))).toBe(true);
  });
});

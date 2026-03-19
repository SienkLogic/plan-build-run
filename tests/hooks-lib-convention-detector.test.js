/**
 * Tests for hooks/lib/convention-detector.js — detect, write, load, format, scan.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTmpPlanning, cleanupTmp } = require('./helpers');
const {
  detectConventions,
  writeConventions,
  loadConventions,
  formatConventionBriefing,
  scanFiles
} = require('../hooks/lib/convention-detector');

let tmpDir, planningDir;

afterEach(() => {
  if (tmpDir) cleanupTmp(tmpDir);
  tmpDir = null;
});

describe('scanFiles', () => {
  it('returns empty array for nonexistent roots', () => {
    const result = scanFiles('/nonexistent', ['src'], 10);
    expect(result).toEqual([]);
  });

  it('finds .js files in specified roots', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'app.js'), 'const x = 1;');
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'const y = 2;');
    fs.writeFileSync(path.join(srcDir, 'data.txt'), 'not code');

    const result = scanFiles(tmpDir, ['src'], 50);
    expect(result.length).toBe(2); // .js and .ts, not .txt
    expect(result.every(f => /\.(js|ts)$/.test(f))).toBe(true);
  });

  it('respects maxFiles limit', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(srcDir, `file${i}.js`), `const x${i} = ${i};`);
    }

    const result = scanFiles(tmpDir, ['src'], 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('skips node_modules and .git directories', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const nmDir = path.join(tmpDir, 'src', 'node_modules');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'lib.js'), 'module.exports = {}');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const x = 1;');

    const result = scanFiles(tmpDir, ['src'], 50);
    expect(result.every(f => !f.includes('node_modules'))).toBe(true);
  });
});

describe('detectConventions', () => {
  it('returns object with expected category keys', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const result = detectConventions(tmpDir);
    expect(result).toHaveProperty('naming');
    expect(result).toHaveProperty('testing');
    expect(result).toHaveProperty('imports');
    expect(result).toHaveProperty('error_handling');
    expect(result).toHaveProperty('exports');
  });

  it('detects camelCase naming patterns', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Write enough camelCase functions to cross MIN_OCCURRENCES threshold (3)
    const code = [
      'function fetchData() {}',
      'function processItems() {}',
      'function handleError() {}',
      'function validateInput() {}',
    ].join('\n');
    fs.writeFileSync(path.join(srcDir, 'handlers.js'), code);

    const result = detectConventions(tmpDir);
    expect(result.naming.some(p => p.pattern === 'camelCase functions')).toBe(true);
  });

  it('detects CommonJS require patterns', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const code = [
      "const fs = require('fs');",
      "const path = require('path');",
      "const os = require('os');",
    ].join('\n');
    fs.writeFileSync(path.join(srcDir, 'index.js'), code);

    const result = detectConventions(tmpDir);
    expect(result.imports.some(p => p.pattern === 'CommonJS require')).toBe(true);
  });
});

describe('writeConventions / loadConventions', () => {
  it('round-trips conventions through write and load', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const conventions = {
      naming: [{ pattern: 'camelCase functions', evidence: ['fetchData', 'processItems'], count: 10 }],
      testing: [],
      imports: [],
      error_handling: [],
      exports: []
    };

    writeConventions(planningDir, conventions);
    const loaded = loadConventions(planningDir);

    expect(Object.keys(loaded)).toContain('naming');
    expect(loaded.naming.body).toContain('camelCase functions');
  });

  it('loadConventions returns empty object when no conventions dir exists', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const result = loadConventions(planningDir);
    expect(result).toEqual({});
  });
});

describe('formatConventionBriefing', () => {
  it('returns empty string for null input', () => {
    expect(formatConventionBriefing(null)).toBe('');
  });

  it('returns empty string for empty conventions', () => {
    expect(formatConventionBriefing({})).toBe('');
  });

  it('returns formatted briefing with pattern names', () => {
    const conventions = {
      naming: {
        frontmatter: { detected: '2026-01-01', count: '1' },
        body: '## camelCase functions\n\nOccurrences: 10'
      }
    };
    const result = formatConventionBriefing(conventions);
    expect(result).toContain('Project Conventions');
    expect(result).toContain('camelCase functions');
  });

  it('caps output at 800 characters', () => {
    const conventions = {};
    for (let i = 0; i < 50; i++) {
      conventions[`cat${i}`] = {
        frontmatter: {},
        body: `## ${'A'.repeat(30)} Pattern ${i}\n\nLong description here.`
      };
    }
    const result = formatConventionBriefing(conventions);
    expect(result.length).toBeLessThanOrEqual(800);
  });
});

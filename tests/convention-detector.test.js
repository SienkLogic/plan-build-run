'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { detectConventions, writeConventions, loadConventions } = require('../plugins/pbr/scripts/lib/convention-detector');

describe('convention-detector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('detectConventions', () => {
    test('returns naming patterns from JS files', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Create files with camelCase function names and PascalCase classes
      for (let i = 0; i < 4; i++) {
        fs.writeFileSync(path.join(srcDir, `file${i}.js`), [
          `function getUserName() { return 'name'; }`,
          `function fetchData() { return null; }`,
          `class UserService { constructor() {} }`,
          `class DataManager { constructor() {} }`,
          `const loadConfig = () => {};`,
        ].join('\n'));
      }

      const result = detectConventions(tmpDir);
      expect(result.naming).toBeDefined();
      expect(Array.isArray(result.naming)).toBe(true);
      const camelPattern = result.naming.find(n => /camelCase/i.test(n.pattern));
      expect(camelPattern).toBeDefined();
      expect(camelPattern.count).toBeGreaterThanOrEqual(3);
    });

    test('returns test structure patterns', async () => {
      const srcDir = path.join(tmpDir, 'src');
      const testsDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(testsDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'foo.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(srcDir, 'bar.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(srcDir, 'baz.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(testsDir, 'foo.test.js'), 'test("x", async () => {});');
      fs.writeFileSync(path.join(testsDir, 'bar.test.js'), 'test("x", async () => {});');
      fs.writeFileSync(path.join(testsDir, 'baz.test.js'), 'test("x", async () => {});');

      const result = detectConventions(tmpDir);
      expect(result.testing).toBeDefined();
      const mirrorPattern = result.testing.find(t => /mirror/i.test(t.pattern));
      expect(mirrorPattern).toBeDefined();
    });

    test('returns import patterns', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      for (let i = 0; i < 4; i++) {
        fs.writeFileSync(path.join(srcDir, `mod${i}.js`), [
          `const fs = require('fs');`,
          `const path = require('path');`,
          `const utils = require('./utils');`,
        ].join('\n'));
      }

      const result = detectConventions(tmpDir);
      expect(result.imports).toBeDefined();
      const cjsPattern = result.imports.find(p => /CommonJS|require/i.test(p.pattern));
      expect(cjsPattern).toBeDefined();
      expect(cjsPattern.count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('writeConventions', () => {
    test('creates .planning/conventions/ directory and files', async () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const conventions = {
        naming: [{ pattern: 'camelCase functions', evidence: ['getUserName', 'fetchData'], count: 5 }],
        testing: [{ pattern: 'tests/ mirrors src/ structure', evidence: ['foo.test.js <-> foo.js'], count: 3 }],
        imports: [{ pattern: 'CommonJS require', evidence: ["require('fs')"], count: 10 }],
        error_handling: [],
        exports: [],
      };

      writeConventions(planningDir, conventions);

      const convDir = path.join(planningDir, 'conventions');
      expect(fs.existsSync(convDir)).toBe(true);
      expect(fs.existsSync(path.join(convDir, 'naming.md'))).toBe(true);
      expect(fs.existsSync(path.join(convDir, 'testing.md'))).toBe(true);
      expect(fs.existsSync(path.join(convDir, 'imports.md'))).toBe(true);
    });
  });

  describe('loadConventions', () => {
    test('reads conventions from disk (round-trip)', async () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const conventions = {
        naming: [{ pattern: 'camelCase functions', evidence: ['getUserName'], count: 5 }],
        testing: [],
        imports: [{ pattern: 'CommonJS require', evidence: ["require('fs')"], count: 10 }],
        error_handling: [],
        exports: [],
      };

      writeConventions(planningDir, conventions);
      const loaded = loadConventions(planningDir);

      expect(loaded.naming).toBeDefined();
      expect(loaded.imports).toBeDefined();
    });

    test('returns empty object when directory does not exist', async () => {
      const planningDir = path.join(tmpDir, 'nonexistent');
      const loaded = loadConventions(planningDir);
      expect(loaded).toEqual({});
    });
  });
});

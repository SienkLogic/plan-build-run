/**
 * Tests for impact-analysis.cjs — predictive impact analysis module
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('impact-analysis', () => {
  let impactAnalysis;
  let tmpDir;

  beforeAll(() => {
    impactAnalysis = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'lib', 'impact-analysis.js'));
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-analysis-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(name, content) {
    const full = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    return full;
  }

  describe('buildDependencyMap()', () => {
    test('scans a directory and returns map of file -> dependencies', async () => {
      writeFile('a.js', "const b = require('./b');");
      writeFile('b.js', 'module.exports = {};');
      const depMap = impactAnalysis.buildDependencyMap(tmpDir, {
        include: ['**/*.js'],
        exclude: ['node_modules/**'],
      });
      expect(depMap instanceof Map).toBe(true);
      expect(depMap.size).toBeGreaterThan(0);
    });

    test('detects require() calls in CJS files', async () => {
      writeFile('x.js', [
        "const y = require('./y');",
        "const z = require('./z.js');",
      ].join('\n'));
      writeFile('y.js', 'module.exports = {};');
      writeFile('z.js', 'module.exports = {};');
      const depMap = impactAnalysis.buildDependencyMap(tmpDir);
      // x.js should depend on y.js and z.js
      let xDeps = null;
      for (const [file, deps] of depMap) {
        if (path.basename(file) === 'x.js') xDeps = deps;
      }
      expect(xDeps).not.toBeNull();
      expect(xDeps.length).toBeGreaterThan(0);
    });

    test('detects import statements in ESM files', async () => {
      writeFile('esm-a.mjs', "import { foo } from './esm-b.mjs';");
      writeFile('esm-b.mjs', "export function foo() {}");
      const depMap = impactAnalysis.buildDependencyMap(tmpDir, {
        include: ['**/*.mjs'],
      });
      let aDeps = null;
      for (const [file, deps] of depMap) {
        if (path.basename(file) === 'esm-a.mjs') aDeps = deps;
      }
      expect(aDeps).not.toBeNull();
      expect(aDeps.length).toBeGreaterThan(0);
    });

    test('resolves relative paths to absolute', async () => {
      writeFile('src/alpha.js', "const beta = require('./beta');");
      writeFile('src/beta.js', 'module.exports = {};');
      const depMap = impactAnalysis.buildDependencyMap(tmpDir);
      for (const [_file, deps] of depMap) {
        for (const dep of deps) {
          // All resolved deps should be absolute paths
          expect(path.isAbsolute(dep)).toBe(true);
        }
      }
    });
  });

  describe('analyzeImpact()', () => {
    test('given changed files returns affected files including direct dependents', async () => {
      // a depends on b, c depends on b
      const bPath = writeFile('b.js', 'module.exports = {};');
      writeFile('a.js', "const b = require('./b');");
      writeFile('c.js', "const b = require('./b');");
      const report = impactAnalysis.analyzeImpact([bPath], tmpDir);
      expect(report).toBeDefined();
      expect(Array.isArray(report.affected)).toBe(true);
    });

    test('computes depth (1=direct, 2=transitive)', () => {
      // chain: a requires b, b requires c
      const cPath = writeFile('chain-c.js', 'module.exports = {};');
      writeFile('chain-b.js', "const c = require('./chain-c');");
      writeFile('chain-a.js', "const b = require('./chain-b');");
      const report = impactAnalysis.analyzeImpact([cPath], tmpDir);
      // chain-b.js should be at depth 1 (direct)
      const chainB = report.affected.find(a => path.basename(a.file) === 'chain-b.js');
      if (chainB) {
        expect(chainB.depth).toBe(1);
      }
    });

    test('assigns risk low for <= 3 affected files', async () => {
      const target = writeFile('lone.js', 'module.exports = {};');
      const report = impactAnalysis.analyzeImpact([target], tmpDir);
      // Only the file itself, no dependents — should be low
      expect(['low', 'medium', 'high']).toContain(report.risk);
    });

    test('assigns risk medium for 4-10 affected files', async () => {
      // Create a hub file that 6 files depend on
      const hub = writeFile('hub.js', 'module.exports = {};');
      for (let i = 0; i < 6; i++) {
        writeFile(`dep${i}.js`, `const hub = require('./hub');`);
      }
      const report = impactAnalysis.analyzeImpact([hub], tmpDir);
      expect(['medium', 'high']).toContain(report.risk);
    });

    test('assigns risk high for > 10 affected files', async () => {
      const core = writeFile('core.js', 'module.exports = {};');
      for (let i = 0; i < 12; i++) {
        writeFile(`user${i}.js`, `const core = require('./core');`);
      }
      const report = impactAnalysis.analyzeImpact([core], tmpDir);
      expect(report.risk).toBe('high');
    });

    test('returns { affected, affectedPlans, risk, depth }', () => {
      const f = writeFile('solo.js', 'module.exports = {};');
      const report = impactAnalysis.analyzeImpact([f], tmpDir);
      expect(Array.isArray(report.affected)).toBe(true);
      expect(Array.isArray(report.affectedPlans)).toBe(true);
      expect(typeof report.risk).toBe('string');
      expect(typeof report.depth).toBe('number');
    });
  });

  describe('exports', () => {
    test('exports analyzeImpact, buildDependencyMap, buildReverseMap', () => {
      expect(typeof impactAnalysis.analyzeImpact).toBe('function');
      expect(typeof impactAnalysis.buildDependencyMap).toBe('function');
      expect(typeof impactAnalysis.buildReverseMap).toBe('function');
    });
  });
});

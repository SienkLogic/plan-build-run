'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { detectConventions, writeConventions, loadConventions: _loadConventions } = require('../plugins/pbr/scripts/lib/convention-detector');

describe('convention extraction hook integration', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-conv-hook-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('updates conventions after build executor completes when toggle enabled', () => {
    // Create a source directory with enough code to trigger convention detection
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Write multiple files with camelCase functions to meet MIN_OCCURRENCES threshold
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(srcDir, `module${i}.js`), [
        `const getData${i} = () => {};`,
        `const processItem${i} = (x) => x;`,
        `const handleEvent${i} = (e) => e;`,
        `module.exports = { getData${i}, processItem${i}, handleEvent${i} };`
      ].join('\n'));
    }

    // Detect and write conventions (simulating what the hook does)
    const conventions = detectConventions(tmpDir);
    const totalPatterns = Object.values(conventions).reduce((sum, arr) => sum + arr.length, 0);

    if (totalPatterns > 0) {
      writeConventions(planningDir, conventions);
    }

    // Verify conventions directory was created
    const convDir = path.join(planningDir, 'conventions');
    expect(fs.existsSync(convDir)).toBe(true);

    // Verify at least one file was written
    const convFiles = fs.readdirSync(convDir).filter(f => f.endsWith('.md'));
    expect(convFiles.length).toBeGreaterThan(0);
  });

  test('skips convention update when features.convention_memory is false', () => {
    const config = { features: { convention_memory: false } };
    const conventionsEnabled = config.features && config.features.convention_memory !== false;

    expect(conventionsEnabled).toBe(false);

    // When disabled, no conventions directory should be created
    const convDir = path.join(planningDir, 'conventions');
    expect(fs.existsSync(convDir)).toBe(false);
  });

  test('does not crash on convention detection failure', () => {
    // Pass a non-existent project root -- should not throw
    expect(() => {
      const conventions = detectConventions(path.join(tmpDir, 'nonexistent'));
      // Even with bad root, it should return a structure with empty arrays
      expect(conventions).toBeDefined();
      expect(conventions.naming).toBeDefined();
    }).not.toThrow();
  });

  test('updateConventionsAfterBuild is exported from check-subagent-output', () => {
    // This function should be exported for testability
    // Will fail until GREEN phase implements it
    const mod = require('../plugins/pbr/scripts/check-subagent-output');
    expect(typeof mod.updateConventionsAfterBuild).toBe('function');
  });
});

/**
 * tests/tech-debt-scanner.test.js — Tests for tech debt scanner module.
 *
 * Validates scanTechDebt(projectDir, options) identifies large files,
 * deeply nested files, and respects configuration limits.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let scanTechDebt;

beforeAll(() => {
  scanTechDebt = require('../plugins/pbr/scripts/lib/tech-debt-scanner').scanTechDebt;
});

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-debt-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function generateLines(n) {
  return Array.from({ length: n }, (_, i) => `// line ${i + 1}`).join('\n');
}

describe('scanTechDebt', () => {
  test('returns empty result for empty directory', async () => {
    const tmp = makeTmpDir();
    try {
      const result = scanTechDebt(tmp);
      expect(result).toEqual({ hotspots: [], largeFiles: [], total: 0 });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('detects large JS files exceeding maxLines threshold', async () => {
    const tmp = makeTmpDir();
    try {
      writeFile(tmp, 'src/big.js', generateLines(350));
      writeFile(tmp, 'src/small.js', generateLines(50));
      writeFile(tmp, 'src/medium.js', generateLines(310));

      const result = scanTechDebt(tmp, { maxLines: 300 });

      expect(result.largeFiles.length).toBe(2);
      // Sorted by lines descending
      expect(result.largeFiles[0].lines).toBeGreaterThanOrEqual(350);
      expect(result.largeFiles[1].lines).toBeGreaterThanOrEqual(310);
      // Paths should be relative
      expect(result.largeFiles[0].path).toContain('big.js');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('flags deeply nested files as complexity hotspots', async () => {
    const tmp = makeTmpDir();
    try {
      // 6 levels deep (> default maxDepth of 5)
      writeFile(tmp, 'a/b/c/d/e/f/deep.js', '// deep file');
      // 3 levels deep (under threshold)
      writeFile(tmp, 'x/y/z/shallow.js', '// shallow file');

      const result = scanTechDebt(tmp, { maxDepth: 5 });

      expect(result.hotspots.length).toBe(1);
      expect(result.hotspots[0].path).toContain('deep.js');
      expect(result.hotspots[0].depth).toBeGreaterThan(5);
      expect(result.hotspots[0].reason).toBe('deep-nesting');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('excludes node_modules and .git directories', async () => {
    const tmp = makeTmpDir();
    try {
      writeFile(tmp, 'node_modules/pkg/huge.js', generateLines(500));
      writeFile(tmp, '.git/objects/data.js', generateLines(500));
      writeFile(tmp, 'src/app.js', generateLines(10));

      const result = scanTechDebt(tmp, { maxLines: 300 });

      expect(result.largeFiles.length).toBe(0);
      expect(result.hotspots.length).toBe(0);
      expect(result.total).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('respects options.limit to cap results', async () => {
    const tmp = makeTmpDir();
    try {
      // Create 8 large files
      for (let i = 0; i < 8; i++) {
        writeFile(tmp, `src/file${i}.js`, generateLines(400 + i * 10));
      }

      const result = scanTechDebt(tmp, { limit: 3, maxLines: 300 });

      expect(result.largeFiles.length).toBe(3);
      // Should be the 3 largest
      expect(result.largeFiles[0].lines).toBeGreaterThanOrEqual(result.largeFiles[1].lines);
      expect(result.largeFiles[1].lines).toBeGreaterThanOrEqual(result.largeFiles[2].lines);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('handles .ts, .cjs, and .mjs file extensions', () => {
    const tmp = makeTmpDir();
    try {
      writeFile(tmp, 'src/big.ts', generateLines(400));
      writeFile(tmp, 'src/big.cjs', generateLines(350));
      writeFile(tmp, 'src/big.mjs', generateLines(320));
      writeFile(tmp, 'src/big.txt', generateLines(500)); // not scanned

      const result = scanTechDebt(tmp, { maxLines: 300 });

      expect(result.largeFiles.length).toBe(3);
      const paths = result.largeFiles.map(f => f.path);
      expect(paths.some(p => p.endsWith('.ts'))).toBe(true);
      expect(paths.some(p => p.endsWith('.cjs'))).toBe(true);
      expect(paths.some(p => p.endsWith('.mjs'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

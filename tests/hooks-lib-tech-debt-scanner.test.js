/**
 * Tests for hooks/lib/tech-debt-scanner.js — Lightweight tech debt scanner.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { scanTechDebt } = require('../plugins/pbr/scripts/lib/tech-debt-scanner');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tech-debt-test-')));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath, lines) {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const content = Array.isArray(lines)
    ? lines.join('\n')
    : '\n'.repeat(lines); // number = line count
  fs.writeFileSync(full, content);
}

describe('scanTechDebt', () => {
  test('empty directory returns empty results', async () => {
    const result = scanTechDebt(tmpDir);
    expect(result.hotspots).toEqual([]);
    expect(result.largeFiles).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('identifies large files exceeding maxLines', async () => {
    // Create a file with 350 lines (> default 300)
    writeFile('big.js', 350);
    // Create a small file
    writeFile('small.js', 10);

    const result = scanTechDebt(tmpDir);
    expect(result.largeFiles.length).toBe(1);
    expect(result.largeFiles[0].path).toBe('big.js');
    expect(result.largeFiles[0].lines).toBeGreaterThan(300);
  });

  test('identifies deeply nested files as hotspots', async () => {
    // Create a file nested 7 levels deep (> default maxDepth 5)
    writeFile('a/b/c/d/e/f/g/deep.js', 10);

    const result = scanTechDebt(tmpDir);
    expect(result.hotspots.length).toBe(1);
    expect(result.hotspots[0].reason).toBe('deep-nesting');
  });

  test('respects custom options', async () => {
    writeFile('medium.js', 200); // Between 150 and 300

    const result = scanTechDebt(tmpDir, { maxLines: 150 });
    expect(result.largeFiles.length).toBe(1);
  });

  test('skips node_modules and .git directories', async () => {
    writeFile('node_modules/pkg/big.js', 500);
    writeFile('.git/objects/big.js', 500);
    writeFile('src/ok.js', 10);

    const result = scanTechDebt(tmpDir);
    expect(result.largeFiles.length).toBe(0);
  });

  test('only scans supported extensions', async () => {
    writeFile('readme.md', 500);
    writeFile('data.json', 500);
    writeFile('src/code.ts', 500);

    const result = scanTechDebt(tmpDir);
    // Only .ts should be detected
    expect(result.largeFiles.length).toBe(1);
    expect(result.largeFiles[0].path).toContain('code.ts');
  });

  test('respects limit option', async () => {
    for (let i = 0; i < 10; i++) {
      writeFile(`big${i}.js`, 400);
    }

    const result = scanTechDebt(tmpDir, { limit: 3 });
    expect(result.largeFiles.length).toBe(3);
  });

  test('handles nonexistent directory gracefully', async () => {
    const result = scanTechDebt(path.join(tmpDir, 'nonexistent'));
    expect(result.hotspots).toEqual([]);
    expect(result.largeFiles).toEqual([]);
  });
});

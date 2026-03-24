'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  checkQuality,
  loadHooksConfig,
  findLocalBin,
  detectConsoleLogs,
} = require('../plugins/pbr/scripts/post-write-quality');

let tmpDir;
let origCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-pwq-'));
  origCwd = process.cwd;
  process.cwd = jest.fn().mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd = origCwd;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkQuality', () => {
  test('returns null for no file_path', async () => {
    expect(checkQuality({ tool_input: {} })).toBeNull();
  });

  test('returns null for non-JS/TS files', async () => {
    expect(checkQuality({ tool_input: { file_path: '/some/file.md' } })).toBeNull();
    expect(checkQuality({ tool_input: { file_path: '/some/file.json' } })).toBeNull();
    expect(checkQuality({ tool_input: { file_path: '/some/file.py' } })).toBeNull();
  });

  test('returns null when no quality hooks are enabled', async () => {
    const result = checkQuality({ tool_input: { file_path: '/some/file.js' } });
    expect(result).toBeNull();
  });

  test('detects console.log when detectConsoleLogs is enabled', async () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ hooks: { detectConsoleLogs: true } }));

    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\n');

    const result = checkQuality({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('Console.log');
  });

  test('uses path field as fallback', async () => {
    const result = checkQuality({ tool_input: { path: '/some/file.js' } });
    expect(result).toBeNull();
  });

  test('handles .tsx, .mjs, .cjs extensions', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    // No config = no hooks enabled
    for (const ext of ['.tsx', '.mjs', '.cjs', '.jsx']) {
      const result = checkQuality({ tool_input: { file_path: `/file${ext}` } });
      expect(result).toBeNull(); // no hooks enabled but extension is valid
    }
  });
});

describe('loadHooksConfig', () => {
  test('returns empty object when config.json missing', async () => {
    expect(loadHooksConfig(tmpDir)).toEqual({});
  });

  test('returns empty object when config.json is invalid', async () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'bad json');
    expect(loadHooksConfig(tmpDir)).toEqual({});
  });

  test('returns empty object when no hooks section', async () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({}));
    expect(loadHooksConfig(tmpDir)).toEqual({});
  });

  test('returns hooks config when present', async () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ hooks: { autoFormat: true, detectConsoleLogs: true } }));
    const result = loadHooksConfig(tmpDir);
    expect(result.autoFormat).toBe(true);
    expect(result.detectConsoleLogs).toBe(true);
  });
});

describe('findLocalBin', () => {
  test('returns null when binary not found', async () => {
    expect(findLocalBin(tmpDir, 'nonexistent-tool')).toBeNull();
  });

  test('finds binary in node_modules/.bin/', async () => {
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const binName = process.platform === 'win32' ? 'test-tool.cmd' : 'test-tool';
    fs.writeFileSync(path.join(binDir, binName), '#!/bin/sh\necho test');
    const result = findLocalBin(tmpDir, 'test-tool');
    expect(result).not.toBeNull();
    expect(result).toContain('test-tool');
  });
});

describe('detectConsoleLogs', () => {
  test('returns null for non-existent file', async () => {
    expect(detectConsoleLogs('/nonexistent/file.js')).toBeNull();
  });

  test('returns null when no console.log found', async () => {
    const filePath = path.join(tmpDir, 'clean.js');
    fs.writeFileSync(filePath, 'const x = 1;\nreturn x;\n');
    expect(detectConsoleLogs(filePath)).toBeNull();
  });

  test('detects console.log', async () => {
    const filePath = path.join(tmpDir, 'messy.js');
    fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\n');
    const result = detectConsoleLogs(filePath);
    expect(result).toContain('Console.log');
    expect(result).toContain('1 console.log');
  });

  test('skips commented console.log', async () => {
    const filePath = path.join(tmpDir, 'commented.js');
    fs.writeFileSync(filePath, '// console.log("debug")\nconst x = 1;\n');
    expect(detectConsoleLogs(filePath)).toBeNull();
  });

  test('reports multiple console.log with truncation', async () => {
    const filePath = path.join(tmpDir, 'many.js');
    const lines = [];
    for (let i = 0; i < 5; i++) {
      lines.push(`console.log("line ${i}")`);
    }
    fs.writeFileSync(filePath, lines.join('\n'));
    const result = detectConsoleLogs(filePath);
    expect(result).toContain('5 console.log');
    expect(result).toContain('...and 2 more');
  });

  test('shows line numbers in output', async () => {
    const filePath = path.join(tmpDir, 'numbered.js');
    fs.writeFileSync(filePath, 'const a = 1;\nconsole.log(a);\nconst b = 2;\n');
    const result = detectConsoleLogs(filePath);
    expect(result).toContain('L2');
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkQuality, loadHooksConfig, findLocalBin, runPrettier, runTypeCheck, detectConsoleLogs } = require('../plugins/pbr/scripts/post-write-quality');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-pwqu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkQuality direct calls', () => {
  test('returns null for missing file_path', () => {
    expect(checkQuality({ tool_input: {} })).toBeNull();
  });

  test('returns null for empty file_path', () => {
    expect(checkQuality({ tool_input: { file_path: '' } })).toBeNull();
  });

  test('returns null for .md files', () => {
    expect(checkQuality({ tool_input: { file_path: '/tmp/readme.md' } })).toBeNull();
  });

  test('returns null for .py files', () => {
    expect(checkQuality({ tool_input: { file_path: '/tmp/app.py' } })).toBeNull();
  });

  test('returns null when no hooks enabled', () => {
    expect(checkQuality({ tool_input: { file_path: '/tmp/app.ts' } })).toBeNull();
  });

  test('returns detectConsoleLogs result when enabled', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ hooks: { detectConsoleLogs: true } }));
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, 'console.log("test");\n');
    const result = checkQuality({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('[Console.log]');
  });

  test('returns null when detectConsoleLogs enabled but file is clean', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ hooks: { detectConsoleLogs: true } }));
    const filePath = path.join(tmpDir, 'clean.js');
    fs.writeFileSync(filePath, 'const x = 1;\n');
    expect(checkQuality({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('handles all JS/TS extensions', () => {
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
    for (const ext of extensions) {
      // Without config, returns null — but exercises the extension check
      const result = checkQuality({ tool_input: { file_path: `/tmp/file${ext}` } });
      expect(result).toBeNull();
    }
  });

  test('autoFormat with no prettier installed returns null', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ hooks: { autoFormat: true } }));
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, 'const x = 1;');
    expect(checkQuality({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('typeCheck with no tsc installed returns null for .ts files', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ hooks: { typeCheck: true } }));
    const filePath = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(filePath, 'const x: number = 1;');
    expect(checkQuality({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('typeCheck skipped for .js files even when enabled', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ hooks: { typeCheck: true } }));
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, 'const x = 1;');
    expect(checkQuality({ tool_input: { file_path: filePath } })).toBeNull();
  });
});

describe('loadHooksConfig edge cases', () => {
  test('returns {} for invalid JSON config', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    expect(loadHooksConfig(tmpDir)).toEqual({});
  });
});

describe('findLocalBin edge cases', () => {
  test('returns null for nonexistent tool', () => {
    expect(findLocalBin(tmpDir, 'nonexistent-tool')).toBeNull();
  });

  test('finds .cmd variant on Windows', () => {
    if (process.platform !== 'win32') return; // Skip on non-Windows
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'prettier.cmd'), '@echo ok');
    expect(findLocalBin(tmpDir, 'prettier')).toBeTruthy();
  });
});

describe('runPrettier', () => {
  test('returns null when prettier not installed', () => {
    expect(runPrettier('/tmp/file.js', tmpDir)).toBeNull();
  });
});

describe('runTypeCheck', () => {
  test('returns null when tsc not installed', () => {
    expect(runTypeCheck('/tmp/file.ts', tmpDir)).toBeNull();
  });

  test('returns null when tsconfig.json missing', () => {
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const binName = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
    fs.writeFileSync(path.join(binDir, binName), '#!/bin/sh\necho ok');
    expect(runTypeCheck('/tmp/file.ts', tmpDir)).toBeNull();
  });
});

describe('detectConsoleLogs edge cases', () => {
  test('returns null for nonexistent file', () => {
    expect(detectConsoleLogs('/nonexistent/path.js')).toBeNull();
  });

  test('detects multiple console.logs with proper line numbers', () => {
    const filePath = path.join(tmpDir, 'multi.js');
    fs.writeFileSync(filePath, 'const a = 1;\nconsole.log(a);\nconst b = 2;\nconsole.log(b);');
    const result = detectConsoleLogs(filePath);
    expect(result).toContain('2 console.log');
    expect(result).toContain('L2');
    expect(result).toContain('L4');
  });

  test('truncates at 3 entries with ...and N more', () => {
    const filePath = path.join(tmpDir, 'many.js');
    const lines = Array.from({ length: 6 }, (_, i) => `console.log("line ${i}")`);
    fs.writeFileSync(filePath, lines.join('\n'));
    const result = detectConsoleLogs(filePath);
    expect(result).toContain('6 console.log');
    expect(result).toContain('...and 3 more');
  });

  test('ignores single-line comments', () => {
    const filePath = path.join(tmpDir, 'commented.js');
    fs.writeFileSync(filePath, '// console.log("debug")\nconst x = 1;');
    expect(detectConsoleLogs(filePath)).toBeNull();
  });

  test('detects console.log with leading whitespace', () => {
    const filePath = path.join(tmpDir, 'indented.js');
    fs.writeFileSync(filePath, '  console.log("test");\n');
    const result = detectConsoleLogs(filePath);
    expect(result).toContain('1 console.log');
  });
});

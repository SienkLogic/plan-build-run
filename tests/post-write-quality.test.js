const { checkQuality, loadHooksConfig, findLocalBin, detectConsoleLogs } = require('../plugins/pbr/scripts/post-write-quality');
const { createRunner, createTmpPlanning, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'post-write-quality.js');
const _run = createRunner(SCRIPT);
const runScript = (cwd, toolInput) => _run({ tool_input: toolInput }, { cwd });

describe('post-write-quality.js', () => {
  describe('loadHooksConfig', () => {
    test('returns empty object when no config.json', async () => {
      const { tmpDir } = createTmpPlanning();
      const result = loadHooksConfig(tmpDir);
      expect(result).toEqual({});
      cleanupTmp(tmpDir);
    });

    test('returns empty object when no hooks section', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{"depth": "standard"}');
      const result = loadHooksConfig(tmpDir);
      expect(result).toEqual({});
      cleanupTmp(tmpDir);
    });

    test('returns hooks section when present', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { autoFormat: true, detectConsoleLogs: true } }));
      const result = loadHooksConfig(tmpDir);
      expect(result.autoFormat).toBe(true);
      expect(result.detectConsoleLogs).toBe(true);
      cleanupTmp(tmpDir);
    });
  });

  describe('findLocalBin', () => {
    test('returns null when node_modules does not exist', async () => {
      const { tmpDir } = createTmpPlanning();
      expect(findLocalBin(tmpDir, 'prettier')).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('finds binary when it exists', async () => {
      const { tmpDir } = createTmpPlanning();
      const binDir = path.join(tmpDir, 'node_modules', '.bin');
      fs.mkdirSync(binDir, { recursive: true });
      const binName = process.platform === 'win32' ? 'prettier.cmd' : 'prettier';
      fs.writeFileSync(path.join(binDir, binName), '#!/bin/sh\necho ok');
      expect(findLocalBin(tmpDir, 'prettier')).toBeTruthy();
      cleanupTmp(tmpDir);
    });
  });

  describe('detectConsoleLogs', () => {
    test('returns null for file without console.log', async () => {
      const { tmpDir } = createTmpPlanning();
      const filePath = path.join(tmpDir, 'clean.js');
      fs.writeFileSync(filePath, 'const x = 1;\nmodule.exports = x;');
      expect(detectConsoleLogs(filePath)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('detects console.log statements', async () => {
      const { tmpDir } = createTmpPlanning();
      const filePath = path.join(tmpDir, 'messy.js');
      fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\nmodule.exports = x;');
      const result = detectConsoleLogs(filePath);
      expect(result).toContain('[Console.log]');
      expect(result).toContain('1 console.log');
      expect(result).toContain('L2');
      cleanupTmp(tmpDir);
    });

    test('ignores commented console.log', async () => {
      const { tmpDir } = createTmpPlanning();
      const filePath = path.join(tmpDir, 'commented.js');
      fs.writeFileSync(filePath, '// console.log("debug")\nconst x = 1;');
      expect(detectConsoleLogs(filePath)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('detects multiple console.logs with truncation', async () => {
      const { tmpDir } = createTmpPlanning();
      const filePath = path.join(tmpDir, 'multi.js');
      const lines = Array.from({ length: 5 }, (_, i) => `console.log("line ${i}")`);
      fs.writeFileSync(filePath, lines.join('\n'));
      const result = detectConsoleLogs(filePath);
      expect(result).toContain('5 console.log');
      expect(result).toContain('...and 2 more');
      cleanupTmp(tmpDir);
    });

    test('returns null for nonexistent file', async () => {
      expect(detectConsoleLogs('/nonexistent/file.js')).toBeNull();
    });
  });

  describe('checkQuality (unit)', () => {
    test('returns null for non-JS/TS files', async () => {
      const result = checkQuality({ tool_input: { file_path: '/tmp/readme.md' } });
      expect(result).toBeNull();
    });

    test('returns null for empty tool_input', async () => {
      const result = checkQuality({ tool_input: {} });
      expect(result).toBeNull();
    });

    test('returns null when no hooks enabled', async () => {
      // checkQuality reads config from cwd — without config, all hooks are off
      const result = checkQuality({ tool_input: { file_path: '/tmp/app.ts' } });
      expect(result).toBeNull();
    });
  });

  describe('hook execution', () => {
    test('exits 0 silently for non-JS files', async () => {
      const { tmpDir } = createTmpPlanning();
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'readme.md') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('exits 0 silently when no hooks enabled', async () => {
      const { tmpDir } = createTmpPlanning();
      const filePath = path.join(tmpDir, 'app.ts');
      fs.writeFileSync(filePath, 'console.log("test")');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('detects console.log when detectConsoleLogs is enabled', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { detectConsoleLogs: true } }));
      const filePath = path.join(tmpDir, 'app.js');
      fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\nmodule.exports = x;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.output);
      expect(parsed.additionalContext).toContain('[Console.log]');
      expect(parsed.additionalContext).toContain('1 console.log');
      cleanupTmp(tmpDir);
    });

    test('no output when detectConsoleLogs enabled but file is clean', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { detectConsoleLogs: true } }));
      const filePath = path.join(tmpDir, 'clean.ts');
      fs.writeFileSync(filePath, 'export const x: number = 1;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('skips autoFormat when prettier not installed locally', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { autoFormat: true } }));
      const filePath = path.join(tmpDir, 'app.js');
      fs.writeFileSync(filePath, 'const x=1;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      // No prettier installed, so no output
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('skips typeCheck when tsc not installed locally', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { typeCheck: true } }));
      const filePath = path.join(tmpDir, 'app.ts');
      fs.writeFileSync(filePath, 'const x: number = "oops";');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('skips typeCheck for .js files even when enabled', async () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { typeCheck: true } }));
      const filePath = path.join(tmpDir, 'app.js');
      fs.writeFileSync(filePath, 'const x = 1;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('handles malformed JSON gracefully', async () => {
      const { tmpDir } = createTmpPlanning();
      const result = _run('not json', { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });
});

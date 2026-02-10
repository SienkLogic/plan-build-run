const { checkQuality, loadHooksConfig, findLocalBin, detectConsoleLogs } = require('../plugins/dev/scripts/post-write-quality');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'post-write-quality.js');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-pwq-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runScript(tmpDir, toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('post-write-quality.js', () => {
  describe('loadHooksConfig', () => {
    test('returns empty object when no config.json', () => {
      const { tmpDir } = makeTmpDir();
      const result = loadHooksConfig(tmpDir);
      expect(result).toEqual({});
      cleanup(tmpDir);
    });

    test('returns empty object when no hooks section', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{"depth": "standard"}');
      const result = loadHooksConfig(tmpDir);
      expect(result).toEqual({});
      cleanup(tmpDir);
    });

    test('returns hooks section when present', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { autoFormat: true, detectConsoleLogs: true } }));
      const result = loadHooksConfig(tmpDir);
      expect(result.autoFormat).toBe(true);
      expect(result.detectConsoleLogs).toBe(true);
      cleanup(tmpDir);
    });
  });

  describe('findLocalBin', () => {
    test('returns null when node_modules does not exist', () => {
      const { tmpDir } = makeTmpDir();
      expect(findLocalBin(tmpDir, 'prettier')).toBeNull();
      cleanup(tmpDir);
    });

    test('finds binary when it exists', () => {
      const { tmpDir } = makeTmpDir();
      const binDir = path.join(tmpDir, 'node_modules', '.bin');
      fs.mkdirSync(binDir, { recursive: true });
      const binName = process.platform === 'win32' ? 'prettier.cmd' : 'prettier';
      fs.writeFileSync(path.join(binDir, binName), '#!/bin/sh\necho ok');
      expect(findLocalBin(tmpDir, 'prettier')).toBeTruthy();
      cleanup(tmpDir);
    });
  });

  describe('detectConsoleLogs', () => {
    test('returns null for file without console.log', () => {
      const { tmpDir } = makeTmpDir();
      const filePath = path.join(tmpDir, 'clean.js');
      fs.writeFileSync(filePath, 'const x = 1;\nmodule.exports = x;');
      expect(detectConsoleLogs(filePath)).toBeNull();
      cleanup(tmpDir);
    });

    test('detects console.log statements', () => {
      const { tmpDir } = makeTmpDir();
      const filePath = path.join(tmpDir, 'messy.js');
      fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\nmodule.exports = x;');
      const result = detectConsoleLogs(filePath);
      expect(result).toContain('[Console.log]');
      expect(result).toContain('1 console.log');
      expect(result).toContain('L2');
      cleanup(tmpDir);
    });

    test('ignores commented console.log', () => {
      const { tmpDir } = makeTmpDir();
      const filePath = path.join(tmpDir, 'commented.js');
      fs.writeFileSync(filePath, '// console.log("debug")\nconst x = 1;');
      expect(detectConsoleLogs(filePath)).toBeNull();
      cleanup(tmpDir);
    });

    test('detects multiple console.logs with truncation', () => {
      const { tmpDir } = makeTmpDir();
      const filePath = path.join(tmpDir, 'multi.js');
      const lines = Array.from({ length: 5 }, (_, i) => `console.log("line ${i}")`);
      fs.writeFileSync(filePath, lines.join('\n'));
      const result = detectConsoleLogs(filePath);
      expect(result).toContain('5 console.log');
      expect(result).toContain('...and 2 more');
      cleanup(tmpDir);
    });

    test('returns null for nonexistent file', () => {
      expect(detectConsoleLogs('/nonexistent/file.js')).toBeNull();
    });
  });

  describe('checkQuality (unit)', () => {
    test('returns null for non-JS/TS files', () => {
      const result = checkQuality({ tool_input: { file_path: '/tmp/readme.md' } });
      expect(result).toBeNull();
    });

    test('returns null for empty tool_input', () => {
      const result = checkQuality({ tool_input: {} });
      expect(result).toBeNull();
    });

    test('returns null when no hooks enabled', () => {
      // checkQuality reads config from cwd — without config, all hooks are off
      const result = checkQuality({ tool_input: { file_path: '/tmp/app.ts' } });
      expect(result).toBeNull();
    });
  });

  describe('hook execution', () => {
    test('exits 0 silently for non-JS files', () => {
      const { tmpDir } = makeTmpDir();
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'readme.md') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('exits 0 silently when no hooks enabled', () => {
      const { tmpDir } = makeTmpDir();
      const filePath = path.join(tmpDir, 'app.ts');
      fs.writeFileSync(filePath, 'console.log("test")');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('detects console.log when detectConsoleLogs is enabled', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { detectConsoleLogs: true } }));
      const filePath = path.join(tmpDir, 'app.js');
      fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\nmodule.exports = x;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.output);
      expect(parsed.additionalContext).toContain('[Console.log]');
      expect(parsed.additionalContext).toContain('1 console.log');
      cleanup(tmpDir);
    });

    test('no output when detectConsoleLogs enabled but file is clean', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { detectConsoleLogs: true } }));
      const filePath = path.join(tmpDir, 'clean.ts');
      fs.writeFileSync(filePath, 'export const x: number = 1;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('skips autoFormat when prettier not installed locally', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { autoFormat: true } }));
      const filePath = path.join(tmpDir, 'app.js');
      fs.writeFileSync(filePath, 'const x=1;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      // No prettier installed, so no output
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('skips typeCheck when tsc not installed locally', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { typeCheck: true } }));
      const filePath = path.join(tmpDir, 'app.ts');
      fs.writeFileSync(filePath, 'const x: number = "oops";');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('skips typeCheck for .js files even when enabled', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { typeCheck: true } }));
      const filePath = path.join(tmpDir, 'app.js');
      fs.writeFileSync(filePath, 'const x = 1;');
      const result = runScript(tmpDir, { file_path: filePath });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanup(tmpDir);
    });

    test('handles malformed JSON gracefully', () => {
      const { tmpDir } = makeTmpDir();
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: 'not json',
          encoding: 'utf8',
          timeout: 5000,
          cwd: tmpDir,
        });
        expect(result).toBeDefined();
      } catch (e) {
        expect(e.status).toBe(0);
      }
      cleanup(tmpDir);
    });
  });
});

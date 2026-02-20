'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkDangerous } = require('../plugins/pbr/scripts/check-dangerous-commands');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cdcu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkDangerous (direct calls)', () => {
  test('returns null for safe commands', () => {
    expect(checkDangerous({ tool_input: { command: 'npm test' } })).toBeNull();
  });

  test('returns null for empty command', () => {
    expect(checkDangerous({ tool_input: { command: '' } })).toBeNull();
  });

  test('returns null for whitespace command', () => {
    expect(checkDangerous({ tool_input: { command: '   ' } })).toBeNull();
  });

  test('blocks rm -rf .planning', () => {
    const result = checkDangerous({ tool_input: { command: 'rm -rf .planning' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
  });

  test('blocks git reset --hard', () => {
    const result = checkDangerous({ tool_input: { command: 'git reset --hard' } });
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
  });

  test('blocks git push --force main', () => {
    const result = checkDangerous({ tool_input: { command: 'git push --force origin main' } });
    expect(result.exitCode).toBe(2);
  });

  test('blocks git push main --force (reversed order)', () => {
    const result = checkDangerous({ tool_input: { command: 'git push origin main --force' } });
    expect(result.exitCode).toBe(2);
  });

  test('blocks git clean -fd', () => {
    const result = checkDangerous({ tool_input: { command: 'git clean -fd' } });
    expect(result.exitCode).toBe(2);
  });

  test('warns on git checkout -- .', () => {
    const result = checkDangerous({ tool_input: { command: 'git checkout -- .' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('Warning');
  });

  test('warns on git push --force (non-main)', () => {
    const result = checkDangerous({ tool_input: { command: 'git push --force origin feature-branch' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('Warning');
  });

  test('blocks rm -rf .planning/phases/', () => {
    const result = checkDangerous({ tool_input: { command: 'rm -rf .planning/phases/' } });
    expect(result.exitCode).toBe(2);
  });

  test('returns null for missing tool_input', () => {
    expect(checkDangerous({ tool_input: {} })).toBeNull();
  });
});

describe('skill-specific bash checks', () => {
  test('blocks sed on .json when statusline skill active', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'statusline');
    const result = checkDangerous({ tool_input: { command: 'sed -i "s/old/new/" config.json' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('JSON');
  });

  test('blocks awk on .json when statusline skill active', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'statusline');
    const result = checkDangerous({ tool_input: { command: 'awk "{print}" settings.json' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('blocks echo redirect to .json when statusline skill active', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'statusline');
    const result = checkDangerous({ tool_input: { command: 'echo "test" > settings.json' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('allows sed on .json when non-statusline skill active', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = checkDangerous({ tool_input: { command: 'sed -i "s/old/new/" config.json' } });
    expect(result).toBeNull();
  });

  test('allows normal commands when statusline skill active', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'statusline');
    const result = checkDangerous({ tool_input: { command: 'npm test' } });
    expect(result).toBeNull();
  });

  test('allows when no .active-skill file', () => {
    const result = checkDangerous({ tool_input: { command: 'sed -i "s/old/new/" config.json' } });
    expect(result).toBeNull();
  });
});

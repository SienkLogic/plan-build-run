'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkBoundary, getEnforceSetting } = require('../plugins/pbr/scripts/check-phase-boundary');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cpbu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkBoundary', () => {
  test('returns null when no file_path', () => {
    expect(checkBoundary({ tool_input: {} })).toBeNull();
  });

  test('returns null when file_path is empty string', () => {
    expect(checkBoundary({ tool_input: { file_path: '' } })).toBeNull();
  });

  test('returns null for non-phase files', () => {
    expect(checkBoundary({ tool_input: { file_path: path.join(tmpDir, 'src', 'index.ts') } })).toBeNull();
  });

  test('returns null when no STATE.md', () => {
    const filePath = path.join(planningDir, 'phases', '03-api', 'PLAN.md');
    expect(checkBoundary({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns null when STATE.md has no phase match', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase info');
    const filePath = path.join(planningDir, 'phases', '03-api', 'PLAN.md');
    expect(checkBoundary({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns null for same-phase writes', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    const filePath = path.join(planningDir, 'phases', '02-auth', 'PLAN.md');
    expect(checkBoundary({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns warning for cross-phase writes (default config)', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    const filePath = path.join(planningDir, 'phases', '04-dashboard', 'PLAN.md');
    const result = checkBoundary({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('phase 4');
    expect(result.output.additionalContext).toContain('current phase is 2');
  });

  test('returns block for cross-phase writes when enforcement is on', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
    const filePath = path.join(planningDir, 'phases', '04-dashboard', 'PLAN.md');
    const result = checkBoundary({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('phase 4');
  });

  test('handles backslash paths (Windows)', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const filePath = tmpDir + '\\.planning\\phases\\03-api\\PLAN.md';
    const result = checkBoundary({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
  });

  test('returns null for phase path without numeric prefix', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const filePath = path.join(planningDir, 'phases', 'no-number', 'PLAN.md');
    expect(checkBoundary({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('uses path field when file_path is absent', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const filePath = path.join(planningDir, 'phases', '03-api', 'PLAN.md');
    const result = checkBoundary({ tool_input: { path: filePath } });
    expect(result).not.toBeNull();
  });
});

describe('getEnforceSetting (additional)', () => {
  test('returns false for invalid JSON config', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    expect(getEnforceSetting(planningDir)).toBe(false);
  });

  test('returns false when safety exists but no enforce_phase_boundaries', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ safety: { other_setting: true } }));
    expect(getEnforceSetting(planningDir)).toBe(false);
  });
});

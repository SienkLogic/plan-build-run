'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkBoundary, getEnforceSetting } = require('../plugins/pbr/scripts/check-phase-boundary');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cpb-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkBoundary unit tests', () => {
  test('returns null when no file_path', () => {
    expect(checkBoundary({ tool_input: {} })).toBeNull();
  });

  test('returns null for files not under .planning/phases/', () => {
    expect(checkBoundary({ tool_input: { file_path: '/some/src/app.js' } })).toBeNull();
  });

  test('returns null when no phase number in path', () => {
    expect(checkBoundary({ tool_input: { file_path: '/proj/.planning/phases/readme.md' } })).toBeNull();
  });

  test('returns null when STATE.md does not exist', () => {
    const filePath = path.join(planningDir, 'phases', '02-auth', 'PLAN.md');
    expect(checkBoundary({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns null when STATE.md has no phase match', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase info');
    const filePath = path.join(planningDir, 'phases', '02-auth', 'PLAN.md');
    expect(checkBoundary({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns null when file phase matches current phase', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5');
    const filePath = path.join(planningDir, 'phases', '02-auth', 'PLAN.md');
    expect(checkBoundary({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns advisory (exit 0) for cross-phase write without enforcement', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
    const filePath = path.join(planningDir, 'phases', '03-dashboard', 'PLAN.md');
    const result = checkBoundary({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('phase 3');
    expect(result.output.additionalContext).toContain('current phase is 1');
  });

  test('returns block (exit 2) for cross-phase write with enforcement', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
    const filePath = path.join(planningDir, 'phases', '03-dashboard', 'PLAN.md');
    const result = checkBoundary({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
  });

  test('handles backslash paths (Windows)', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
    const filePath = `${tmpDir}\\.planning\\phases\\02-auth\\PLAN.md`;
    const result = checkBoundary({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
  });

  test('uses path field as fallback', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 5');
    const filePath = path.join(planningDir, 'phases', '02-auth', 'PLAN.md');
    const result = checkBoundary({ tool_input: { path: filePath } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
  });
});

describe('getEnforceSetting', () => {
  test('returns false when config.json missing', () => {
    expect(getEnforceSetting(planningDir)).toBe(false);
  });

  test('returns false when config.json is invalid JSON', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'bad json');
    expect(getEnforceSetting(planningDir)).toBe(false);
  });

  test('returns false when safety section missing', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({}));
    expect(getEnforceSetting(planningDir)).toBe(false);
  });

  test('returns false when enforce_phase_boundaries is false', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ safety: { enforce_phase_boundaries: false } }));
    expect(getEnforceSetting(planningDir)).toBe(false);
  });

  test('returns true when enforce_phase_boundaries is true', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ safety: { enforce_phase_boundaries: true } }));
    expect(getEnforceSetting(planningDir)).toBe(true);
  });
});

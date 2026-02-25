'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test — may not exist until T1 completes.
// Tests are written against the API spec in PLAN.md task 008-01-T1.
let loadEnforcementConfig, checkUnmanagedSourceWrite, checkNonPbrAgent, checkUnmanagedCommit;

beforeAll(() => {
  try {
    const m = require('../plugins/pbr/scripts/enforce-pbr-workflow');
    loadEnforcementConfig = m.loadEnforcementConfig;
    checkUnmanagedSourceWrite = m.checkUnmanagedSourceWrite;
    checkNonPbrAgent = m.checkNonPbrAgent;
    checkUnmanagedCommit = m.checkUnmanagedCommit;
  } catch (_err) {
    // Module not yet built — tests will fail with clear "not a function" messages
    // rather than a confusing module-not-found error at the top level.
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-enforce-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function writeConfig(planningDir, config) {
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
}

function writeActiveSkill(planningDir, skill = 'quick') {
  fs.writeFileSync(path.join(planningDir, '.active-skill'), skill);
}

function writeNativeMode(planningDir) {
  fs.writeFileSync(path.join(planningDir, '.native-mode'), '');
}

// ─── loadEnforcementConfig ───────────────────────────────────────────────────

describe('loadEnforcementConfig', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    ({ tmpDir, planningDir } = makeTmpDir());
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns { level: "advisory" } when no config exists (default)', () => {
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'advisory' });
  });

  test('returns { level: "block" } when config has workflow.enforce_pbr_skills: "block"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'block' } });
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'block' });
  });

  test('returns { level: "off" } when config has workflow.enforce_pbr_skills: "off"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'off' } });
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'off' });
  });

  test('returns { level: "advisory" } when config has workflow.enforce_pbr_skills: "advisory"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'advisory' } });
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'advisory' });
  });

  test('returns { level: "off" } when .native-mode file exists, overriding config', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'block' } });
    writeNativeMode(planningDir);
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'off' });
  });

  test('returns { level: "off" } when .native-mode exists and no config', () => {
    writeNativeMode(planningDir);
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'off' });
  });

  test('returns { level: "advisory" } when config exists but has no workflow key', () => {
    writeConfig(planningDir, { someOtherKey: true });
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'advisory' });
  });

  test('returns { level: "advisory" } when config has workflow but no enforce_pbr_skills', () => {
    writeConfig(planningDir, { workflow: {} });
    const result = loadEnforcementConfig(planningDir);
    expect(result).toEqual({ level: 'advisory' });
  });
});

// ─── checkUnmanagedSourceWrite ───────────────────────────────────────────────

describe('checkUnmanagedSourceWrite', () => {
  let tmpDir, planningDir;
  let cwdSpy;

  beforeEach(() => {
    ({ tmpDir, planningDir } = makeTmpDir());
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    cleanup(tmpDir);
  });

  test('returns advisory result when .planning/ exists, no .active-skill, writing source file', () => {
    const filePath = path.join(tmpDir, 'src', 'index.js');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output).toHaveProperty('additionalContext');
    expect(result.output.additionalContext).toMatch(/pbr/i);
  });

  test('advisory message mentions /pbr:quick', () => {
    const filePath = path.join(tmpDir, 'app.ts');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('/pbr:quick');
  });

  test('advisory message mentions /pbr:build', () => {
    const filePath = path.join(tmpDir, 'lib', 'util.ts');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('/pbr:build');
  });

  test('returns block result when config level is "block"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'block' } });
    const filePath = path.join(tmpDir, 'src', 'main.py');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output).toHaveProperty('decision', 'block');
    expect(result.output).toHaveProperty('reason');
    expect(result.output.reason).toMatch(/pbr/i);
  });

  test('returns null when .active-skill file exists (PBR skill is active)', () => {
    writeActiveSkill(planningDir, 'quick');
    const filePath = path.join(tmpDir, 'src', 'index.js');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).toBeNull();
  });

  test('returns null when .active-skill exists with build skill', () => {
    writeActiveSkill(planningDir, 'build');
    const filePath = path.join(tmpDir, 'src', 'feature.ts');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).toBeNull();
  });

  test('returns null when target file is inside .planning/ directory', () => {
    const filePath = path.join(planningDir, 'STATE.md');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).toBeNull();
  });

  test('returns null when target file is deeply inside .planning/', () => {
    const filePath = path.join(planningDir, 'phases', '01-init', 'PLAN.md');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).toBeNull();
  });

  test('returns null when no .planning/ dir exists (not a PBR project)', () => {
    // Use a completely fresh temp dir with no .planning/
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-bare-'));
    cwdSpy.mockReturnValue(bareDir);
    try {
      const filePath = path.join(bareDir, 'src', 'index.js');
      const data = { tool_input: { file_path: filePath } };
      const result = checkUnmanagedSourceWrite(data);
      expect(result).toBeNull();
    } finally {
      cleanup(bareDir);
    }
  });

  test('returns null when .native-mode bypass file exists', () => {
    writeNativeMode(planningDir);
    const filePath = path.join(tmpDir, 'src', 'index.js');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).toBeNull();
  });

  test('returns null when config level is "off"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'off' } });
    const filePath = path.join(tmpDir, 'src', 'index.js');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).toBeNull();
  });

  test('advisory result has additionalContext (not decision/reason)', () => {
    const filePath = path.join(tmpDir, 'app.js');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).not.toBeNull();
    expect(result.output).not.toHaveProperty('decision');
    expect(result.output).toHaveProperty('additionalContext');
  });

  test('block result has decision:"block" and reason (not additionalContext)', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'block' } });
    const filePath = path.join(tmpDir, 'app.js');
    const data = { tool_input: { file_path: filePath } };
    const result = checkUnmanagedSourceWrite(data);
    expect(result).not.toBeNull();
    expect(result.output).not.toHaveProperty('additionalContext');
    expect(result.output).toHaveProperty('decision', 'block');
    expect(result.output).toHaveProperty('reason');
  });

  test('handles Edit tool data with file_path', () => {
    const filePath = path.join(tmpDir, 'README.md');
    const data = { tool_input: { file_path: filePath, old_string: 'foo', new_string: 'bar' } };
    // README.md is outside .planning/ — should produce advisory
    const result = checkUnmanagedSourceWrite(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
  });
});

// ─── checkNonPbrAgent ────────────────────────────────────────────────────────

describe('checkNonPbrAgent', () => {
  let tmpDir, planningDir;
  let cwdSpy;

  beforeEach(() => {
    ({ tmpDir, planningDir } = makeTmpDir());
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    cleanup(tmpDir);
  });

  test('returns advisory for subagent_type "Explore" with PBR agent suggestion', () => {
    const data = { tool_input: { subagent_type: 'Explore' } };
    const result = checkNonPbrAgent(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output).toHaveProperty('additionalContext');
    // Should mention PBR alternative for Explore
    expect(result.output.additionalContext).toMatch(/pbr:researcher|pbr:codebase-mapper/i);
  });

  test('returns advisory for "general-purpose" suggesting pbr:general', () => {
    const data = { tool_input: { subagent_type: 'general-purpose' } };
    const result = checkNonPbrAgent(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('pbr:general');
  });

  test('returns advisory for "Plan" agent type', () => {
    const data = { tool_input: { subagent_type: 'Plan' } };
    const result = checkNonPbrAgent(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('pbr:planner');
  });

  test('returns advisory for "Bash" agent type', () => {
    const data = { tool_input: { subagent_type: 'Bash' } };
    const result = checkNonPbrAgent(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('pbr:executor');
  });

  test('returns null for subagent_type "pbr:researcher" (already PBR)', () => {
    const data = { tool_input: { subagent_type: 'pbr:researcher' } };
    const result = checkNonPbrAgent(data);
    expect(result).toBeNull();
  });

  test('returns null for subagent_type "pbr:executor" (already PBR)', () => {
    const data = { tool_input: { subagent_type: 'pbr:executor' } };
    const result = checkNonPbrAgent(data);
    expect(result).toBeNull();
  });

  test('returns null for any subagent_type starting with "pbr:"', () => {
    const pbrTypes = ['pbr:general', 'pbr:planner', 'pbr:verifier', 'pbr:debugger', 'pbr:synthesizer'];
    for (const subagent_type of pbrTypes) {
      const data = { tool_input: { subagent_type } };
      const result = checkNonPbrAgent(data);
      expect(result).toBeNull();
    }
  });

  test('returns null when subagent_type is missing from tool_input', () => {
    const data = { tool_input: {} };
    const result = checkNonPbrAgent(data);
    expect(result).toBeNull();
  });

  test('returns null when no .planning/ dir exists (not a PBR project)', () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-bare-'));
    cwdSpy.mockReturnValue(bareDir);
    try {
      const data = { tool_input: { subagent_type: 'Explore' } };
      const result = checkNonPbrAgent(data);
      expect(result).toBeNull();
    } finally {
      cleanup(bareDir);
    }
  });

  test('returns null when .native-mode bypass file exists', () => {
    writeNativeMode(planningDir);
    const data = { tool_input: { subagent_type: 'Explore' } };
    const result = checkNonPbrAgent(data);
    expect(result).toBeNull();
  });

  test('returns null when config level is "off"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'off' } });
    const data = { tool_input: { subagent_type: 'Explore' } };
    const result = checkNonPbrAgent(data);
    expect(result).toBeNull();
  });

  test('returns exitCode 2 (block) when config level is "block"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'block' } });
    const nonPbrTypes = ['Explore', 'general-purpose', 'Plan', 'Bash'];
    for (const subagent_type of nonPbrTypes) {
      const data = { tool_input: { subagent_type } };
      const result = checkNonPbrAgent(data);
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      expect(result.output).toHaveProperty('decision', 'block');
    }
  });

  test('block result includes PBR agent suggestion and reason', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'block' } });
    const data = { tool_input: { subagent_type: 'Explore' } };
    const result = checkNonPbrAgent(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output).toHaveProperty('decision', 'block');
    expect(result.output).toHaveProperty('reason');
    expect(result.output.reason).toMatch(/pbr:researcher|pbr:codebase-mapper/);
    expect(result.output).not.toHaveProperty('additionalContext');
  });
});

// ─── checkUnmanagedCommit ────────────────────────────────────────────────────

describe('checkUnmanagedCommit', () => {
  let tmpDir, planningDir;
  let cwdSpy;

  beforeEach(() => {
    ({ tmpDir, planningDir } = makeTmpDir());
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    cleanup(tmpDir);
  });

  test('returns advisory for "git commit -m ..." without .active-skill', () => {
    const data = { tool_input: { command: 'git commit -m "feat(01-01): add feature"' } };
    const result = checkUnmanagedCommit(data);
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output).toHaveProperty('additionalContext');
    expect(result.output.additionalContext).toContain('/pbr:quick');
  });

  test('advisory message mentions PBR tracking', () => {
    const data = { tool_input: { command: 'git commit -m "fix: something"' } };
    const result = checkUnmanagedCommit(data);
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toMatch(/pbr|track/i);
  });

  test('returns null when .active-skill exists', () => {
    writeActiveSkill(planningDir, 'build');
    const data = { tool_input: { command: 'git commit -m "feat(01-01): add feature"' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('returns null when .active-skill is "quick"', () => {
    writeActiveSkill(planningDir, 'quick');
    const data = { tool_input: { command: 'git commit -m "feat(quick-001): fix"' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('returns null for non-commit bash commands (git status)', () => {
    const data = { tool_input: { command: 'git status' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('returns null for non-commit bash commands (git push)', () => {
    const data = { tool_input: { command: 'git push origin main' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('returns null for non-commit bash commands (npm test)', () => {
    const data = { tool_input: { command: 'npm test' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('returns null for non-commit bash commands (git log)', () => {
    const data = { tool_input: { command: 'git log --oneline -5' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('returns null when no .planning/ dir exists', () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-bare-'));
    cwdSpy.mockReturnValue(bareDir);
    try {
      const data = { tool_input: { command: 'git commit -m "feat: add something"' } };
      const result = checkUnmanagedCommit(data);
      expect(result).toBeNull();
    } finally {
      cleanup(bareDir);
    }
  });

  test('returns null when .native-mode bypass file exists', () => {
    writeNativeMode(planningDir);
    const data = { tool_input: { command: 'git commit -m "feat: add something"' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('returns null when config level is "off"', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'off' } });
    const data = { tool_input: { command: 'git commit -m "feat: add something"' } };
    const result = checkUnmanagedCommit(data);
    expect(result).toBeNull();
  });

  test('detects git commit in chained command (git add && git commit)', () => {
    const data = { tool_input: { command: 'git add . && git commit -m "feat(01-01): add"' } };
    const result = checkUnmanagedCommit(data);
    // Chained commit without active-skill should also be caught
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
  });

  test('commit advisory is always advisory (never block, even with config block)', () => {
    writeConfig(planningDir, { workflow: { enforce_pbr_skills: 'block' } });
    const data = { tool_input: { command: 'git commit -m "feat: add feature"' } };
    const result = checkUnmanagedCommit(data);
    // Commit advisory is advisory regardless of config (spec says advisory only)
    if (result !== null) {
      expect(result.output).toHaveProperty('additionalContext');
    }
  });

  test('returns advisory result shape: { exitCode: 0, output: { additionalContext } }', () => {
    const data = { tool_input: { command: 'git commit -m "feat: add something"' } };
    const result = checkUnmanagedCommit(data);
    expect(result).not.toBeNull();
    expect(typeof result.exitCode).toBe('number');
    expect(typeof result.output).toBe('object');
    expect(typeof result.output.additionalContext).toBe('string');
  });
});

// ─── Module exports ──────────────────────────────────────────────────────────

describe('enforce-pbr-workflow module exports', () => {
  test('exports loadEnforcementConfig', () => {
    expect(typeof loadEnforcementConfig).toBe('function');
  });

  test('exports checkUnmanagedSourceWrite', () => {
    expect(typeof checkUnmanagedSourceWrite).toBe('function');
  });

  test('exports checkNonPbrAgent', () => {
    expect(typeof checkNonPbrAgent).toBe('function');
  });

  test('exports checkUnmanagedCommit', () => {
    expect(typeof checkUnmanagedCommit).toBe('function');
  });
});

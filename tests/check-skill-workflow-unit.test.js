'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  readActiveSkill, checkSkillRules, hasPlanFile, checkWorkflow,
  checkStatuslineContent
} = require('../plugins/pbr/scripts/check-skill-workflow');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cswu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkSkillRules', () => {
  test('returns null for unknown skill', () => {
    expect(checkSkillRules('unknown', '/tmp/test.js', planningDir)).toBeNull();
  });

  test('quick allows writes to .planning/', () => {
    const file = path.join(planningDir, 'STATE.md');
    expect(checkSkillRules('quick', file, planningDir)).toBeNull();
  });

  test('quick blocks source writes without PLAN.md', () => {
    const result = checkSkillRules('quick', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('quick-requires-plan');
  });

  test('quick allows source writes when PLAN.md exists', () => {
    const quickDir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.writeFileSync(path.join(quickDir, 'PLAN.md'), 'plan');
    expect(checkSkillRules('quick', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build blocks when no phases dir', () => {
    const result = checkSkillRules('build', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('build-requires-plan');
  });

  test('build allows .planning writes', () => {
    const file = path.join(planningDir, 'STATE.md');
    expect(checkSkillRules('build', file, planningDir)).toBeNull();
  });

  test('build blocks when current phase has no PLAN.md', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = checkSkillRules('build', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('build-requires-plan');
  });

  test('build allows when PLAN.md exists in phase', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'plan');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build returns null when no STATE.md', () => {
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build returns null when STATE.md has no phase match', () => {
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase line');
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build returns null when no dir matches current phase', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '02-other'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('review blocks writes outside .planning', () => {
    const result = checkSkillRules('review', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('review-readonly');
  });

  test('plan blocks writes outside .planning', () => {
    const result = checkSkillRules('plan', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('plan-readonly');
  });

  test('blocks orchestrator SUMMARY.md write without active agent', () => {
    const file = path.join(planningDir, 'phases', '01-setup', 'SUMMARY.md');
    const result = checkSkillRules('build', file, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('orchestrator-artifact-write');
  });

  test('allows SUMMARY.md write when active agent exists', () => {
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
    const file = path.join(planningDir, 'phases', '01-setup', 'SUMMARY.md');
    expect(checkSkillRules('build', file, planningDir)).toBeNull();
  });

  test('blocks orchestrator VERIFICATION.md write', () => {
    const file = path.join(planningDir, 'phases', '01-setup', 'VERIFICATION.md');
    const result = checkSkillRules('build', file, planningDir);
    expect(result).not.toBeNull();
    expect(result.message).toContain('VERIFICATION.md');
  });

  test('statusline returns null for non-settings files', () => {
    expect(checkSkillRules('statusline', '/tmp/test.js', planningDir)).toBeNull();
  });
});

describe('checkStatuslineContent', () => {
  test('returns null for non-settings files', () => {
    expect(checkStatuslineContent({ tool_input: { file_path: '/tmp/test.js' } })).toBeNull();
  });

  test('warns on hardcoded home path in content', () => {
    const result = checkStatuslineContent({
      tool_input: {
        file_path: '/home/user/.config/settings.json',
        content: '{"path": "/home/user/.claude/plugins"}'
      }
    });
    expect(result).not.toBeNull();
    expect(result.rule).toBe('statusline-hardcoded-path');
  });

  test('warns on Windows hardcoded path', () => {
    const result = checkStatuslineContent({
      tool_input: {
        file_path: 'C:\\Users\\test\\.config\\settings.json',
        new_string: '"C:\\Users\\test\\.claude\\config"'
      }
    });
    expect(result).not.toBeNull();
  });

  test('returns null when no hardcoded paths', () => {
    const result = checkStatuslineContent({
      tool_input: {
        file_path: '/home/user/settings.json',
        content: '{"key": "value"}'
      }
    });
    expect(result).toBeNull();
  });
});

describe('hasPlanFile', () => {
  test('returns false for nonexistent dir', () => {
    expect(hasPlanFile('/nonexistent')).toBe(false);
  });

  test('finds PLAN.md at root level', () => {
    const dir = path.join(tmpDir, 'test-dir');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'PLAN-01.md'), 'plan');
    expect(hasPlanFile(dir)).toBe(true);
  });

  test('finds PLAN.md in subdirectory', () => {
    const dir = path.join(tmpDir, 'test-dir');
    const subDir = path.join(dir, '001-task');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'PLAN.md'), 'plan');
    expect(hasPlanFile(dir)).toBe(true);
  });

  test('returns false when no PLAN.md files', () => {
    const dir = path.join(tmpDir, 'test-dir');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), 'readme');
    expect(hasPlanFile(dir)).toBe(false);
  });
});

describe('checkWorkflow', () => {
  test('returns null when no file_path', () => {
    expect(checkWorkflow({ tool_input: {} })).toBeNull();
  });

  test('returns null when no active skill', () => {
    expect(checkWorkflow({ tool_input: { file_path: '/tmp/test.js' } })).toBeNull();
  });

  test('returns block when skill rule violated', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const result = checkWorkflow({ tool_input: { file_path: '/tmp/src/app.js' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
  });

  test('returns statusline content warning', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'statusline');
    const result = checkWorkflow({
      tool_input: {
        file_path: '/home/user/settings.json',
        content: '{"path": "/home/user/.claude/plugins"}'
      }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.output.additionalContext).toContain('hardcoded');
  });

  test('returns null for statusline non-settings write', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'statusline');
    expect(checkWorkflow({ tool_input: { file_path: '/tmp/test.js' } })).toBeNull();
  });
});

describe('readActiveSkill', () => {
  test('returns null when no .active-skill', () => {
    expect(readActiveSkill(planningDir)).toBeNull();
  });

  test('reads active skill', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(readActiveSkill(planningDir)).toBe('build');
  });

  test('returns null for empty file', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), '');
    expect(readActiveSkill(planningDir)).toBeNull();
  });
});

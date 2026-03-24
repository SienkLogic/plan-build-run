// Consolidated from check-skill-workflow.test.js + check-skill-workflow-unit.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const {
  readActiveSkill, checkSkillRules, hasPlanFile, checkWorkflow,
  checkStatuslineContent
} = require('../plugins/pbr/scripts/check-skill-workflow');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-cswu-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  cleanupTmp(tmpDir);
});

describe('checkSkillRules', () => {
  test('returns null for unknown skill', async () => {
    expect(checkSkillRules('unknown', '/tmp/test.js', planningDir)).toBeNull();
  });

  test('quick allows writes to .planning/', async () => {
    const file = path.join(planningDir, 'STATE.md');
    expect(checkSkillRules('quick', file, planningDir)).toBeNull();
  });

  test('quick blocks source writes without PLAN.md', async () => {
    const result = checkSkillRules('quick', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('quick-requires-plan');
  });

  test('quick allows source writes when PLAN.md exists', async () => {
    const quickDir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.writeFileSync(path.join(quickDir, 'PLAN.md'), 'plan');
    expect(checkSkillRules('quick', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build blocks when no phases dir', async () => {
    const result = checkSkillRules('build', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('build-requires-plan');
  });

  test('build allows .planning writes', async () => {
    const file = path.join(planningDir, 'STATE.md');
    expect(checkSkillRules('build', file, planningDir)).toBeNull();
  });

  test('build blocks when current phase has no PLAN.md', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = checkSkillRules('build', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('build-requires-plan');
  });

  test('build allows when PLAN.md exists in phase', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'plan');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build returns null when no STATE.md', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build returns null when STATE.md has no phase match', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase line');
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('build returns null when no dir matches current phase', async () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '02-other'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(checkSkillRules('build', '/tmp/src/app.js', planningDir)).toBeNull();
  });

  test('review blocks writes outside .planning', async () => {
    const result = checkSkillRules('review', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('review-readonly');
  });

  test('plan blocks writes outside .planning', async () => {
    const result = checkSkillRules('plan', '/tmp/src/app.js', planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('plan-readonly');
  });

  test('blocks orchestrator SUMMARY.md write without active agent', async () => {
    const file = path.join(planningDir, 'phases', '01-setup', 'SUMMARY.md');
    const result = checkSkillRules('build', file, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('orchestrator-artifact-write');
  });

  test('allows SUMMARY.md write when active agent exists', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
    const file = path.join(planningDir, 'phases', '01-setup', 'SUMMARY.md');
    expect(checkSkillRules('build', file, planningDir)).toBeNull();
  });

  test('blocks orchestrator VERIFICATION.md write', async () => {
    const file = path.join(planningDir, 'phases', '01-setup', 'VERIFICATION.md');
    const result = checkSkillRules('build', file, planningDir);
    expect(result).not.toBeNull();
    expect(result.message).toContain('VERIFICATION.md');
  });

  test('statusline returns null for non-settings files', async () => {
    expect(checkSkillRules('statusline', '/tmp/test.js', planningDir)).toBeNull();
  });

  test('statusline passes for settings.json without content check', async () => {
    const filePath = path.join(tmpDir, '.claude', 'settings.json');
    expect(checkSkillRules('statusline', filePath, planningDir)).toBeNull();
  });

  test('review allows writes to .planning/', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'verifier');
    const filePath = path.join(planningDir, 'VERIFICATION.md');
    expect(checkSkillRules('review', filePath, planningDir)).toBeNull();
  });

  test('discuss allows writes to .planning/', async () => {
    const filePath = path.join(planningDir, 'notes.md');
    expect(checkSkillRules('discuss', filePath, planningDir)).toBeNull();
  });

  test('discuss blocks source code writes', async () => {
    const filePath = path.join(tmpDir, 'src', 'app.js');
    const result = checkSkillRules('discuss', filePath, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('discuss-readonly');
  });

  test('begin allows writes to .planning/', async () => {
    const filePath = path.join(planningDir, 'STATE.md');
    expect(checkSkillRules('begin', filePath, planningDir)).toBeNull();
  });

  test('begin blocks source code writes', async () => {
    const filePath = path.join(tmpDir, 'src', 'main.py');
    const result = checkSkillRules('begin', filePath, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('begin-readonly');
  });

  test('milestone allows writes to .planning/', async () => {
    const filePath = path.join(planningDir, 'ROADMAP.md');
    expect(checkSkillRules('milestone', filePath, planningDir)).toBeNull();
  });

  test('milestone blocks writes outside .planning/', async () => {
    const filePath = path.join(tmpDir, 'src', 'index.ts');
    const result = checkSkillRules('milestone', filePath, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('milestone-readonly');
  });

  test('explore allows writes to .planning/', async () => {
    const filePath = path.join(planningDir, 'ROADMAP.md');
    expect(checkSkillRules('explore', filePath, planningDir)).toBeNull();
  });

  test('explore blocks writes outside .planning/', async () => {
    const filePath = path.join(tmpDir, 'src', 'index.ts');
    const result = checkSkillRules('explore', filePath, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('explore-readonly');
  });

  test('import allows writes to .planning/', async () => {
    const filePath = path.join(planningDir, 'ROADMAP.md');
    expect(checkSkillRules('import', filePath, planningDir)).toBeNull();
  });

  test('import blocks writes outside .planning/', async () => {
    const filePath = path.join(tmpDir, 'src', 'index.ts');
    const result = checkSkillRules('import', filePath, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('import-readonly');
  });

  test('scan allows writes to .planning/', async () => {
    const filePath = path.join(planningDir, 'ROADMAP.md');
    expect(checkSkillRules('scan', filePath, planningDir)).toBeNull();
  });

  test('scan blocks writes outside .planning/', async () => {
    const filePath = path.join(tmpDir, 'src', 'index.ts');
    const result = checkSkillRules('scan', filePath, planningDir);
    expect(result).not.toBeNull();
    expect(result.rule).toBe('scan-readonly');
  });

  describe('newly registered skills', () => {
    const readOnlySkills = ['note', 'todo', 'health', 'help', 'config', 'continue', 'resume', 'pause', 'status', 'dashboard'];

    readOnlySkills.forEach(skill => {
      test(`${skill} skill allows writes to .planning/`, async () => {
        const filePath = path.join(planningDir, 'notes.md');
        expect(checkSkillRules(skill, filePath, planningDir)).toBeNull();
      });

      test(`${skill} skill blocks writes outside .planning/`, async () => {
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules(skill, filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe(`${skill}-readonly`);
      });
    });

    test('do skill shares quick rules - blocks without PLAN.md', async () => {
      const filePath = path.join(tmpDir, 'src', 'index.ts');
      const result = checkSkillRules('do', filePath, planningDir);
      expect(result).not.toBeNull();
      expect(result.rule).toBe('quick-requires-plan');
    });

    test('do skill shares quick rules - allows with PLAN.md', async () => {
      const quickDir = path.join(planningDir, 'quick', '001-fix');
      fs.mkdirSync(quickDir, { recursive: true });
      fs.writeFileSync(path.join(quickDir, 'PLAN.md'), 'content');
      const filePath = path.join(tmpDir, 'src', 'index.ts');
      expect(checkSkillRules('do', filePath, planningDir)).toBeNull();
    });

    test('debug skill returns null (intentionally unrestricted)', async () => {
      const filePath = path.join(tmpDir, 'src', 'index.ts');
      expect(checkSkillRules('debug', filePath, planningDir)).toBeNull();
    });

    test('setup skill returns null (intentionally unrestricted)', async () => {
      const filePath = path.join(tmpDir, 'src', 'index.ts');
      expect(checkSkillRules('setup', filePath, planningDir)).toBeNull();
    });
  });
});

describe('checkStatuslineContent', () => {
  test('returns null for non-settings files', async () => {
    expect(checkStatuslineContent({ tool_input: { file_path: '/tmp/test.js' } })).toBeNull();
  });

  test('warns on hardcoded home path in content', async () => {
    const result = checkStatuslineContent({
      tool_input: {
        file_path: '/home/user/.config/settings.json',
        content: '{"path": "/home/user/.claude/plugins"}'
      }
    });
    expect(result).not.toBeNull();
    expect(result.rule).toBe('statusline-hardcoded-path');
  });

  test('warns on Windows hardcoded path', async () => {
    const result = checkStatuslineContent({
      tool_input: {
        file_path: 'C:\\Users\\test\\.config\\settings.json',
        new_string: '"C:\\Users\\test\\.claude\\config"'
      }
    });
    expect(result).not.toBeNull();
  });

  test('returns null when no hardcoded paths', async () => {
    const result = checkStatuslineContent({
      tool_input: {
        file_path: '/home/user/settings.json',
        content: '{"key": "value"}'
      }
    });
    expect(result).toBeNull();
  });

  test('warns on macOS /Users/ path', async () => {
    const result = checkStatuslineContent({
      tool_input: {
        file_path: '/Users/dave/.claude/settings.json',
        content: '"/Users/dave/.claude/plugins/pbr"'
      }
    });
    expect(result).not.toBeNull();
    expect(result.rule).toBe('statusline-hardcoded-path');
  });
});

describe('hasPlanFile', () => {
  test('returns false for nonexistent dir', async () => {
    expect(hasPlanFile('/nonexistent')).toBe(false);
  });

  test('returns false for empty directory', async () => {
    const dir = path.join(tmpDir, 'empty-dir');
    fs.mkdirSync(dir, { recursive: true });
    expect(hasPlanFile(dir)).toBe(false);
  });

  test('finds PLAN.md at root level', async () => {
    const dir = path.join(tmpDir, 'test-dir');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'PLAN-01.md'), 'plan');
    expect(hasPlanFile(dir)).toBe(true);
  });

  test('finds PLAN.md in subdirectory', async () => {
    const dir = path.join(tmpDir, 'test-dir');
    const subDir = path.join(dir, '001-task');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'PLAN.md'), 'plan');
    expect(hasPlanFile(dir)).toBe(true);
  });

  test('returns false when no PLAN.md files', async () => {
    const dir = path.join(tmpDir, 'test-dir');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), 'readme');
    expect(hasPlanFile(dir)).toBe(false);
  });
});

describe('checkWorkflow', () => {
  test('returns null when no file_path', async () => {
    expect(checkWorkflow({ tool_input: {} })).toBeNull();
  });

  test('returns null when no active skill', async () => {
    expect(checkWorkflow({ tool_input: { file_path: '/tmp/test.js' } })).toBeNull();
  });

  test('returns block when skill rule violated', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const result = checkWorkflow({ tool_input: { file_path: '/tmp/src/app.js' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
  });

  test('returns statusline content warning', async () => {
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

  test('returns null for statusline non-settings write', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'statusline');
    expect(checkWorkflow({ tool_input: { file_path: '/tmp/test.js' } })).toBeNull();
  });
});

describe('checkWorkflow — STATE.md write path', () => {
  test('STATE.md write inside .planning/ passes through when build skill active', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const phaseDir = path.join(planningDir, 'phases', '01-init');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), 'content');
    const stateMdPath = path.join(planningDir, 'STATE.md');
    const result = checkSkillRules('build', stateMdPath, planningDir);
    expect(result).toBeNull();
  });

  test('STATE.md write inside .planning/ passes through for read-only skills', async () => {
    const stateMdPath = path.join(planningDir, 'STATE.md');
    const readOnlySkills = ['plan', 'review', 'discuss', 'begin', 'milestone', 'note', 'todo', 'health'];
    for (const skill of readOnlySkills) {
      expect(checkSkillRules(skill, stateMdPath, planningDir)).toBeNull();
    }
  });

  test('STATE.md path edge case: normalized Windows backslash path is still inside .planning/', async () => {
    const windowsStylePath = planningDir.replace(/\//g, '\\') + '\\STATE.md';
    expect(checkSkillRules('plan', windowsStylePath, planningDir)).toBeNull();
  });
});

describe('readActiveSkill', () => {
  test('returns null when no .active-skill', async () => {
    expect(readActiveSkill(planningDir)).toBeNull();
  });

  test('reads active skill', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(readActiveSkill(planningDir)).toBe('build');
  });

  test('returns null for empty file', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), '');
    expect(readActiveSkill(planningDir)).toBeNull();
  });
});

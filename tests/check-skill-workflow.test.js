const { readActiveSkill, checkSkillRules, hasPlanFile, checkStatuslineContent, checkReadOnlySkillRules } = require('../plugins/pbr/scripts/check-skill-workflow');
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-csw-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('check-skill-workflow.js', () => {
  describe('readActiveSkill', () => {
    test('returns null when no .active-skill file', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      expect(readActiveSkill(planningDir)).toBeNull();
      cleanup(tmpDir);
    });

    test('returns skill name when file exists', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
      expect(readActiveSkill(planningDir)).toBe('quick');
      cleanup(tmpDir);
    });

    test('returns null for empty file', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, '.active-skill'), '');
      expect(readActiveSkill(planningDir)).toBeNull();
      cleanup(tmpDir);
    });
  });

  describe('hasPlanFile', () => {
    test('returns false for non-existent directory', () => {
      expect(hasPlanFile('/nonexistent/dir')).toBe(false);
    });

    test('returns false for empty directory', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const dir = path.join(planningDir, 'empty');
      fs.mkdirSync(dir);
      expect(hasPlanFile(dir)).toBe(false);
      cleanup(tmpDir);
    });

    test('returns true when PLAN.md exists in directory', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const dir = path.join(planningDir, 'test');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'PLAN.md'), 'content');
      expect(hasPlanFile(dir)).toBe(true);
      cleanup(tmpDir);
    });

    test('returns true when PLAN.md exists in subdirectory', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const dir = path.join(planningDir, 'quick');
      const subdir = path.join(dir, '001-fix-header');
      fs.mkdirSync(subdir, { recursive: true });
      fs.writeFileSync(path.join(subdir, 'PLAN.md'), 'content');
      expect(hasPlanFile(dir)).toBe(true);
      cleanup(tmpDir);
    });
  });

  describe('checkSkillRules', () => {
    describe('quick skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'quick', '001', 'PLAN.md');
        const result = checkSkillRules('quick', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks source code writes when no PLAN.md exists', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('quick', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('quick-requires-plan');
        cleanup(tmpDir);
      });

      test('allows source code writes when PLAN.md exists', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const quickDir = path.join(planningDir, 'quick', '001-fix');
        fs.mkdirSync(quickDir, { recursive: true });
        fs.writeFileSync(path.join(quickDir, 'PLAN.md'), 'content');
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('quick', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });
    });

    describe('build skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'STATE.md');
        const result = checkSkillRules('build', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks source code writes when no phases directory', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('build', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('build-requires-plan');
        cleanup(tmpDir);
      });

      test('allows source code writes when PLAN.md exists in current phase', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        // Set up STATE.md
        fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5\nStatus: built');
        // Set up phase directory with PLAN.md
        const phaseDir = path.join(planningDir, 'phases', '02-auth');
        fs.mkdirSync(phaseDir, { recursive: true });
        fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), 'content');
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('build', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });
    });

    describe('unknown skill', () => {
      test('returns null (no rules)', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('status', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });
    });

    describe('statusline skill', () => {
      test('passes for non-settings.json files', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('statusline', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('passes for settings.json without content check', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, '.claude', 'settings.json');
        const result = checkSkillRules('statusline', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });
    });

    describe('review skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        fs.writeFileSync(path.join(planningDir, '.active-agent'), 'verifier');
        const filePath = path.join(planningDir, 'VERIFICATION.md');
        const result = checkSkillRules('review', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks source code writes', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('review', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('review-readonly');
        cleanup(tmpDir);
      });
    });

    describe('discuss skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'notes.md');
        const result = checkSkillRules('discuss', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks source code writes', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'app.js');
        const result = checkSkillRules('discuss', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('discuss-readonly');
        cleanup(tmpDir);
      });
    });

    describe('begin skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'STATE.md');
        const result = checkSkillRules('begin', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks source code writes', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'main.py');
        const result = checkSkillRules('begin', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('begin-readonly');
        cleanup(tmpDir);
      });
    });
  });

  describe('checkStatuslineContent', () => {
    test('warns when settings.json write contains hardcoded home path', () => {
      const data = {
        tool_input: {
          file_path: '/home/user/.claude/settings.json',
          content: '{"plugins":["/home/user/.claude/plugins/plan-build-run"]}'
        }
      };
      const result = checkStatuslineContent(data);
      expect(result).not.toBeNull();
      expect(result.rule).toBe('statusline-hardcoded-path');
    });

    test('warns when Edit new_string contains hardcoded Windows path', () => {
      const data = {
        tool_input: {
          file_path: 'C:\\Users\\dave\\.claude\\settings.json',
          new_string: '"C:\\Users\\dave\\.claude\\plugins\\pbr"'
        }
      };
      const result = checkStatuslineContent(data);
      expect(result).not.toBeNull();
      expect(result.rule).toBe('statusline-hardcoded-path');
    });

    test('passes when settings.json write has properly resolved path', () => {
      const data = {
        tool_input: {
          file_path: '/home/user/.claude/settings.json',
          content: '{"plugins":["plan-build-run"]}'
        }
      };
      const result = checkStatuslineContent(data);
      expect(result).toBeNull();
    });

    test('passes for non-settings.json files', () => {
      const data = {
        tool_input: {
          file_path: '/home/user/project/config.json',
          content: '/home/user/.claude/plugins/foo'
        }
      };
      const result = checkStatuslineContent(data);
      expect(result).toBeNull();
    });

    test('warns on macOS /Users/ path', () => {
      const data = {
        tool_input: {
          file_path: '/Users/dave/.claude/settings.json',
          content: '"/Users/dave/.claude/plugins/pbr"'
        }
      };
      const result = checkStatuslineContent(data);
      expect(result).not.toBeNull();
      expect(result.rule).toBe('statusline-hardcoded-path');
    });
  });
});

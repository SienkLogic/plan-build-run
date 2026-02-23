const { readActiveSkill, checkSkillRules, hasPlanFile, checkStatuslineContent } = require('../plugins/pbr/scripts/check-skill-workflow');
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
        const result = checkSkillRules('some-unknown-skill', filePath, planningDir);
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

    describe('plan skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'STATE.md');
        const result = checkSkillRules('plan', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks source code writes', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'main.py');
        const result = checkSkillRules('plan', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('plan-readonly');
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

    describe('milestone skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'ROADMAP.md');
        const result = checkSkillRules('milestone', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks writes outside .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('milestone', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('milestone-readonly');
        cleanup(tmpDir);
      });
    });

    describe('explore skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'ROADMAP.md');
        const result = checkSkillRules('explore', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks writes outside .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('explore', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('explore-readonly');
        cleanup(tmpDir);
      });
    });

    describe('import skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'ROADMAP.md');
        const result = checkSkillRules('import', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks writes outside .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('import', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('import-readonly');
        cleanup(tmpDir);
      });
    });

    describe('scan skill', () => {
      test('allows writes to .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(planningDir, 'ROADMAP.md');
        const result = checkSkillRules('scan', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('blocks writes outside .planning/', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('scan', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('scan-readonly');
        cleanup(tmpDir);
      });
    });

    describe('newly registered skills', () => {
      const readOnlySkills = ['note', 'todo', 'health', 'help', 'config', 'continue', 'resume', 'pause', 'status', 'dashboard'];

      readOnlySkills.forEach(skill => {
        test(`${skill} skill allows writes to .planning/`, () => {
          const { tmpDir, planningDir } = makeTmpDir();
          const filePath = path.join(planningDir, 'notes.md');
          const result = checkSkillRules(skill, filePath, planningDir);
          expect(result).toBeNull();
          cleanup(tmpDir);
        });

        test(`${skill} skill blocks writes outside .planning/`, () => {
          const { tmpDir, planningDir } = makeTmpDir();
          const filePath = path.join(tmpDir, 'src', 'index.ts');
          const result = checkSkillRules(skill, filePath, planningDir);
          expect(result).not.toBeNull();
          expect(result.rule).toBe(`${skill}-readonly`);
          cleanup(tmpDir);
        });
      });

      test('do skill shares quick rules - blocks without PLAN.md', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('do', filePath, planningDir);
        expect(result).not.toBeNull();
        expect(result.rule).toBe('quick-requires-plan');
        cleanup(tmpDir);
      });

      test('do skill shares quick rules - allows with PLAN.md', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const quickDir = path.join(planningDir, 'quick', '001-fix');
        fs.mkdirSync(quickDir, { recursive: true });
        fs.writeFileSync(path.join(quickDir, 'PLAN.md'), 'content');
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('do', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('debug skill returns null (intentionally unrestricted)', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('debug', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });

      test('setup skill returns null (intentionally unrestricted)', () => {
        const { tmpDir, planningDir } = makeTmpDir();
        const filePath = path.join(tmpDir, 'src', 'index.ts');
        const result = checkSkillRules('setup', filePath, planningDir);
        expect(result).toBeNull();
        cleanup(tmpDir);
      });
    });
  });

  describe('checkWorkflow — STATE.md write path', () => {
    test('STATE.md write inside .planning/ passes through (not blocked) when build skill active', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // Simulate build skill active
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      // Set up phases dir with a PLAN.md so build skill won't block for other reasons
      const phaseDir = path.join(planningDir, 'phases', '01-init');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), 'content');

      // STATE.md path is inside .planning/ — should never be blocked by check-skill-workflow
      const stateMdPath = path.join(planningDir, 'STATE.md');

      // checkWorkflow reads .active-skill from process.cwd(), so we need to test
      // via checkSkillRules directly (checkWorkflow uses process.cwd() not planningDir arg)
      const result = checkSkillRules('build', stateMdPath, planningDir);
      // STATE.md is inside .planning/ — build skill allows all .planning/ writes
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('STATE.md write inside .planning/ passes through for read-only skills', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      const stateMdPath = path.join(planningDir, 'STATE.md');

      // All read-only skills allow writes inside .planning/
      const readOnlySkills = ['plan', 'review', 'discuss', 'begin', 'milestone', 'note', 'todo', 'health'];
      for (const skill of readOnlySkills) {
        const result = checkSkillRules(skill, stateMdPath, planningDir);
        expect(result).toBeNull();
      }
      cleanup(tmpDir);
    });

    test('STATE.md path edge case: normalized Windows backslash path is still inside .planning/', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      // Simulate Windows-style path with backslashes
      const windowsStylePath = planningDir.replace(/\//g, '\\') + '\\STATE.md';
      const result = checkSkillRules('plan', windowsStylePath, planningDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
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

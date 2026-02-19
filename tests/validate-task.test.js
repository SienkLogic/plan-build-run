const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'validate-task.js');

function runScript(toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: os.tmpdir(),
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('validate-task.js', () => {
  describe('valid Task calls', () => {
    test('valid call with description and pbr subagent_type passes silently', () => {
      const result = runScript({
        description: 'Run planner agent',
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });

    test('valid call with short description passes silently', () => {
      const result = runScript({
        description: 'Execute tests',
        subagent_type: 'pbr:executor'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });

    test('all known pbr agent types pass', () => {
      const knownAgents = [
        'researcher', 'planner', 'plan-checker', 'executor', 'verifier',
        'integration-checker', 'debugger', 'codebase-mapper', 'synthesizer', 'general'
      ];
      for (const agent of knownAgents) {
        const result = runScript({
          description: 'Test agent',
          subagent_type: `pbr:${agent}`
        });
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe('');
      }
    });
  });

  describe('missing description', () => {
    test('warns when description is missing', () => {
      const result = runScript({
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('without a description');
    });

    test('warns when description is empty string', () => {
      const result = runScript({
        description: '',
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('without a description');
    });

    test('warns when description is whitespace only', () => {
      const result = runScript({
        description: '   ',
        subagent_type: 'pbr:planner'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('without a description');
    });
  });

  describe('overly long description', () => {
    test('warns when description exceeds 100 chars', () => {
      const longDesc = 'a'.repeat(101);
      const result = runScript({
        description: longDesc,
        subagent_type: 'pbr:executor'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('101 chars');
      expect(result.output).toContain('3-5 words');
    });

    test('does not warn at exactly 100 chars', () => {
      const exactDesc = 'a'.repeat(100);
      const result = runScript({
        description: exactDesc,
        subagent_type: 'pbr:executor'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });

  describe('invalid pbr subagent_type', () => {
    test('warns on unknown pbr agent type', () => {
      const result = runScript({
        description: 'Test agent',
        subagent_type: 'pbr:unknown-agent'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Unknown pbr agent type');
      expect(result.output).toContain('pbr:unknown-agent');
    });

    test('warns on pbr: with typo in agent name', () => {
      const result = runScript({
        description: 'Test agent',
        subagent_type: 'pbr:plannerr'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Unknown pbr agent type');
    });
  });

  describe('non-pbr subagent_type', () => {
    test('non-pbr subagent_type passes without pbr-specific validation', () => {
      const result = runScript({
        description: 'Run custom agent',
        subagent_type: 'custom:my-agent'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });

    test('no subagent_type passes when description has no pbr mention', () => {
      const result = runScript({
        description: 'Run a task'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });

  describe('pbr: in description without subagent_type', () => {
    test('warns when description mentions pbr: but no subagent_type set', () => {
      const result = runScript({
        description: 'Spawn pbr:planner for phase 1'
      });
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('subagent_type');
    });
  });

  describe('quick executor gate', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function makeQuickEnv({ activeSkill, quickDirs } = {}) {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      if (activeSkill) {
        fs.writeFileSync(path.join(planningDir, '.active-skill'), activeSkill);
      }

      if (quickDirs) {
        const quickDir = path.join(planningDir, 'quick');
        fs.mkdirSync(quickDir, { recursive: true });
        for (const [dirName, hasPlan] of Object.entries(quickDirs)) {
          const taskDir = path.join(quickDir, dirName);
          fs.mkdirSync(taskDir, { recursive: true });
          if (hasPlan) {
            fs.writeFileSync(path.join(taskDir, 'PLAN.md'), '# Plan\n<task name="test" type="auto">\ndo stuff\n</task>');
          }
        }
      }
    }

    function runInDir(toolInput, cwd) {
      const input = JSON.stringify({ tool_input: toolInput });
      try {
        const output = execSync(`node "${SCRIPT}"`, { input, encoding: 'utf8', timeout: 5000, cwd });
        return { exitCode: 0, output };
      } catch (e) {
        return { exitCode: e.status, output: e.stdout || '' };
      }
    }

    test('non-executor agents pass even in quick context', () => {
      makeQuickEnv({ activeSkill: 'quick' });
      const result = runInDir({ description: 'Plan task', subagent_type: 'pbr:planner' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('executor passes when no .active-skill file exists', () => {
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('executor passes when active skill is not quick', () => {
      makeQuickEnv({ activeSkill: 'build' });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('blocks executor when active skill is quick but no quick/ dir', () => {
      makeQuickEnv({ activeSkill: 'quick' });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('does not exist');
    });

    test('blocks executor when quick/ dir exists but no PLAN.md', () => {
      makeQuickEnv({ activeSkill: 'quick', quickDirs: { '001-test-task': false } });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('no PLAN.md found');
    });

    test('executor passes when quick task has PLAN.md', () => {
      makeQuickEnv({ activeSkill: 'quick', quickDirs: { '001-test-task': true } });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('executor passes with no .planning dir at all', () => {
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('build executor gate', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-build-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function makeBuildEnv({ activeSkill, phaseDir, hasPlan, stateContent } = {}) {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      if (activeSkill) {
        fs.writeFileSync(path.join(planningDir, '.active-skill'), activeSkill);
      }

      if (stateContent) {
        fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);
      }

      if (phaseDir) {
        const pDir = path.join(planningDir, 'phases', phaseDir);
        fs.mkdirSync(pDir, { recursive: true });
        if (hasPlan) {
          fs.writeFileSync(path.join(pDir, 'PLAN-01.md'), '---\nplan: 01\n---\n<task name="test" type="auto">\ndo stuff\n</task>');
        }
      }
    }

    function runInDir(toolInput, cwd) {
      const input = JSON.stringify({ tool_input: toolInput });
      try {
        const output = execSync(`node "${SCRIPT}"`, { input, encoding: 'utf8', timeout: 5000, cwd });
        return { exitCode: 0, output };
      } catch (e) {
        return { exitCode: e.status, output: e.stdout || '' };
      }
    }

    test('blocks executor when active skill is build but no PLAN.md in phase dir', () => {
      makeBuildEnv({
        activeSkill: 'build',
        phaseDir: '01-setup',
        hasPlan: false,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: building'
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('no PLAN.md found');
    });

    test('passes executor when active skill is build and PLAN.md exists', () => {
      makeBuildEnv({
        activeSkill: 'build',
        phaseDir: '01-setup',
        hasPlan: true,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: building'
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('passes when active skill is not build', () => {
      makeBuildEnv({
        activeSkill: 'review',
        phaseDir: '01-setup',
        hasPlan: false,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: building'
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('passes non-executor agents even in build context', () => {
      makeBuildEnv({
        activeSkill: 'build',
        phaseDir: '01-setup',
        hasPlan: false,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: building'
      });
      const result = runInDir({ description: 'Run planner', subagent_type: 'pbr:planner' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('passes when no .active-skill file exists', () => {
      makeBuildEnv({
        phaseDir: '01-setup',
        hasPlan: false,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: building'
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('plan executor gate', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-plan-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function runInDir(toolInput, cwd) {
      const input = JSON.stringify({ tool_input: toolInput });
      try {
        const output = execSync(`node "${SCRIPT}"`, { input, encoding: 'utf8', timeout: 5000, cwd });
        return { exitCode: 0, output };
      } catch (e) {
        return { exitCode: e.status, output: e.stdout || '' };
      }
    }

    test('blocks executor when active skill is plan', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('Plan skill should not spawn executors');
    });

    test('passes planner when active skill is plan', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
      const result = runInDir({ description: 'Run planner', subagent_type: 'pbr:planner' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('passes researcher when active skill is plan', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
      const result = runInDir({ description: 'Run researcher', subagent_type: 'pbr:researcher' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('error handling', () => {
    test('handles missing TOOL_INPUT gracefully', () => {
      const input = JSON.stringify({});
      try {
        const result = execSync(`node "${SCRIPT}"`, {
          input: input,
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        // Should exit 0 with warning about missing description
        expect(result).toContain('without a description');
      } catch (e) {
        // Should not throw — exit code should be 0
        expect(e.status).toBeNull();
      }
    });

    test('handles malformed JSON gracefully', () => {
      try {
        execSync(`node "${SCRIPT}"`, {
          input: 'not json at all',
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        // Exit 0 — no error thrown
        expect(true).toBe(true);
      } catch (e) {
        expect(e.status).toBeNull();
      }
    });

    test('handles empty input gracefully', () => {
      try {
        execSync(`node "${SCRIPT}"`, {
          input: '',
          encoding: 'utf8',
          timeout: 5000,
          cwd: os.tmpdir(),
        });
        expect(true).toBe(true);
      } catch (e) {
        expect(e.status).toBeNull();
      }
    });
  });
});

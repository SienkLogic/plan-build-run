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

  describe('review planner gate', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-review-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function makeReviewEnv({ activeSkill, phaseDir, hasVerification, stateContent } = {}) {
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
        if (hasVerification) {
          fs.writeFileSync(path.join(pDir, 'VERIFICATION.md'), '# Verification\nAll checks passed.');
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

    test('blocks planner when active-skill is review and no VERIFICATION.md', () => {
      makeReviewEnv({
        activeSkill: 'review',
        phaseDir: '01-setup',
        hasVerification: false,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: built'
      });
      const result = runInDir({ description: 'Run planner', subagent_type: 'pbr:planner' }, tmpDir);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('Review planner gate');
      expect(result.output).toContain('VERIFICATION.md');
    });

    test('allows planner when VERIFICATION.md exists', () => {
      makeReviewEnv({
        activeSkill: 'review',
        phaseDir: '01-setup',
        hasVerification: true,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: built'
      });
      const result = runInDir({ description: 'Run planner', subagent_type: 'pbr:planner' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('returns null when active-skill is not review', () => {
      makeReviewEnv({
        activeSkill: 'build',
        phaseDir: '01-setup',
        hasVerification: false,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: built'
      });
      const result = runInDir({ description: 'Run planner', subagent_type: 'pbr:planner' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });

    test('returns null when subagent_type is not pbr:planner', () => {
      makeReviewEnv({
        activeSkill: 'review',
        phaseDir: '01-setup',
        hasVerification: false,
        stateContent: '# State\nPhase: 1 of 3 (Setup)\nStatus: built'
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' }, tmpDir);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('review verifier gate', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-rv-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    function makeEnv(opts) {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      if (opts.activeSkill) fs.writeFileSync(path.join(planningDir, '.active-skill'), opts.activeSkill);
      if (opts.stateContent) fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.stateContent);
      if (opts.phaseDir) {
        const pDir = path.join(planningDir, 'phases', opts.phaseDir);
        fs.mkdirSync(pDir, { recursive: true });
        if (opts.summaryFiles) {
          for (const f of opts.summaryFiles) {
            fs.writeFileSync(path.join(pDir, f), '# Summary\nstatus: complete');
          }
        }
      }
    }

    function runInDir(toolInput) {
      const input = JSON.stringify({ tool_input: toolInput });
      try {
        const output = execSync(`node "${SCRIPT}"`, { input, encoding: 'utf8', timeout: 5000, cwd: tmpDir });
        return { exitCode: 0, output };
      } catch (e) {
        return { exitCode: e.status, output: e.stdout || '' };
      }
    }

    test('blocks verifier when no SUMMARY.md', () => {
      makeEnv({
        activeSkill: 'review',
        phaseDir: '01-test',
        stateContent: '# State\nPhase: 1 of 3 (Test)\nStatus: built'
      });
      const result = runInDir({ description: 'Run verifier', subagent_type: 'pbr:verifier' });
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('SUMMARY');
    });

    test('allows verifier when SUMMARY.md exists', () => {
      makeEnv({
        activeSkill: 'review',
        phaseDir: '01-test',
        summaryFiles: ['SUMMARY.md'],
        stateContent: '# State\nPhase: 1 of 3 (Test)\nStatus: built'
      });
      const result = runInDir({ description: 'Run verifier', subagent_type: 'pbr:verifier' });
      expect(result.exitCode).toBe(0);
    });

    test('allows verifier when SUMMARY-01-01.md exists', () => {
      makeEnv({
        activeSkill: 'review',
        phaseDir: '01-test',
        summaryFiles: ['SUMMARY-01-01.md'],
        stateContent: '# State\nPhase: 1 of 3 (Test)\nStatus: built'
      });
      const result = runInDir({ description: 'Run verifier', subagent_type: 'pbr:verifier' });
      expect(result.exitCode).toBe(0);
    });

    test('allows non-verifier agents in review', () => {
      makeEnv({
        activeSkill: 'review',
        phaseDir: '01-test',
        stateContent: '# State\nPhase: 1 of 3 (Test)\nStatus: built'
      });
      const result = runInDir({ description: 'Run researcher', subagent_type: 'pbr:researcher' });
      expect(result.exitCode).toBe(0);
    });

    test('allows verifier when skill is not review', () => {
      makeEnv({
        activeSkill: 'build',
        phaseDir: '01-test',
        stateContent: '# State\nPhase: 1 of 3 (Test)\nStatus: built'
      });
      const result = runInDir({ description: 'Run verifier', subagent_type: 'pbr:verifier' });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('milestone complete gate', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-ms-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    const ROADMAP_CONTENT = `# Roadmap

## Milestone: Test Milestone

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1 | First | 01-01 | Verified |
| 2 | Second | 02-01 | Built |

### Phase 1: First
**Goal:** Test

### Phase 2: Second
**Goal:** Test
**Depends on:** Phase 1
`;

    const STATE_CONTENT = `---
version: 2
current_phase: 2
total_phases: 2
phase_slug: "second"
---
# State

Phase: 2 of 2 (Second)
Status: built
`;

    function makeEnv(opts) {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      if (opts.activeSkill) fs.writeFileSync(path.join(planningDir, '.active-skill'), opts.activeSkill);
      if (opts.stateContent) fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.stateContent);
      if (opts.roadmapContent) fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), opts.roadmapContent);
      if (opts.phaseDirs) {
        const phasesDir = path.join(planningDir, 'phases');
        fs.mkdirSync(phasesDir, { recursive: true });
        for (const pd of opts.phaseDirs) {
          const pDir = path.join(phasesDir, pd.name);
          fs.mkdirSync(pDir, { recursive: true });
          if (pd.hasVerification) {
            fs.writeFileSync(path.join(pDir, 'VERIFICATION.md'), '# Verification\nAll checks passed.');
          }
        }
      }
    }

    function runInDir(toolInput) {
      const input = JSON.stringify({ tool_input: toolInput });
      try {
        const output = execSync(`node "${SCRIPT}"`, { input, encoding: 'utf8', timeout: 5000, cwd: tmpDir });
        return { exitCode: 0, output };
      } catch (e) {
        return { exitCode: e.status, output: e.stdout || '' };
      }
    }

    test('blocks when a phase lacks VERIFICATION.md', () => {
      makeEnv({
        activeSkill: 'milestone',
        stateContent: STATE_CONTENT,
        roadmapContent: ROADMAP_CONTENT,
        phaseDirs: [
          { name: '01-first', hasVerification: true },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Complete milestone', subagent_type: 'pbr:general' });
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('Milestone complete gate');
      expect(result.output).toContain('VERIFICATION.md');
    });

    test('allows when all phases have VERIFICATION.md', () => {
      makeEnv({
        activeSkill: 'milestone',
        stateContent: STATE_CONTENT,
        roadmapContent: ROADMAP_CONTENT,
        phaseDirs: [
          { name: '01-first', hasVerification: true },
          { name: '02-second', hasVerification: true }
        ]
      });
      const result = runInDir({ description: 'Complete milestone', subagent_type: 'pbr:general' });
      expect(result.exitCode).toBe(0);
    });

    test('allows non-milestone skill', () => {
      makeEnv({
        activeSkill: 'build',
        stateContent: STATE_CONTENT,
        roadmapContent: ROADMAP_CONTENT,
        phaseDirs: [
          { name: '01-first', hasVerification: true },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Complete milestone', subagent_type: 'pbr:general' });
      expect(result.exitCode).toBe(0);
    });

    test('allows non-general/planner agents', () => {
      makeEnv({
        activeSkill: 'milestone',
        stateContent: STATE_CONTENT,
        roadmapContent: ROADMAP_CONTENT,
        phaseDirs: [
          { name: '01-first', hasVerification: true },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Complete milestone', subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(0);
    });

    test('allows non-complete operations', () => {
      makeEnv({
        activeSkill: 'milestone',
        stateContent: STATE_CONTENT,
        roadmapContent: ROADMAP_CONTENT,
        phaseDirs: [
          { name: '01-first', hasVerification: true },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Create new milestone', subagent_type: 'pbr:general' });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('build dependency gate', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-dep-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    function makeEnv(opts) {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      if (opts.activeSkill) fs.writeFileSync(path.join(planningDir, '.active-skill'), opts.activeSkill);
      if (opts.stateContent) fs.writeFileSync(path.join(planningDir, 'STATE.md'), opts.stateContent);
      if (opts.roadmapContent) fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), opts.roadmapContent);
      if (opts.phaseDirs) {
        const phasesDir = path.join(planningDir, 'phases');
        fs.mkdirSync(phasesDir, { recursive: true });
        for (const pd of opts.phaseDirs) {
          const pDir = path.join(phasesDir, pd.name);
          fs.mkdirSync(pDir, { recursive: true });
          if (pd.hasVerification) {
            fs.writeFileSync(path.join(pDir, 'VERIFICATION.md'), '# Verification\nAll checks passed.');
          }
          // Always add a PLAN.md so the build executor gate doesn't block first
          fs.writeFileSync(path.join(pDir, 'PLAN-01.md'), '# Plan\n<task name="test" type="auto">\ndo stuff\n</task>');
        }
      }
    }

    function runInDir(toolInput) {
      const input = JSON.stringify({ tool_input: toolInput });
      try {
        const output = execSync(`node "${SCRIPT}"`, { input, encoding: 'utf8', timeout: 5000, cwd: tmpDir });
        return { exitCode: 0, output };
      } catch (e) {
        return { exitCode: e.status, output: e.stdout || '' };
      }
    }

    const ROADMAP_WITH_DEPS = `# Roadmap

## Milestone: Test

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1 | First | 01-01 | Verified |
| 2 | Second | 02-01 | Building |

### Phase 1: First
**Goal:** Test

### Phase 2: Second
**Goal:** Test
**Depends on:** Phase 1
`;

    const ROADMAP_NO_DEPS = `# Roadmap

## Milestone: Test

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1 | First | 01-01 | Verified |
| 2 | Second | 02-01 | Building |

### Phase 1: First
**Goal:** Test

### Phase 2: Second
**Goal:** Test
**Depends on:** None
`;

    const ROADMAP_ABSENT_DEPS = `# Roadmap

## Milestone: Test

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1 | First | 01-01 | Verified |
| 2 | Second | 02-01 | Building |

### Phase 1: First
**Goal:** Test

### Phase 2: Second
**Goal:** Test
`;

    const STATE_PHASE_2 = '# State\nPhase: 2 of 2 (Second)\nStatus: building';

    test('blocks executor when dependent phase lacks VERIFICATION.md', () => {
      makeEnv({
        activeSkill: 'build',
        stateContent: STATE_PHASE_2,
        roadmapContent: ROADMAP_WITH_DEPS,
        phaseDirs: [
          { name: '01-first', hasVerification: false },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('Build dependency gate');
      expect(result.output).toContain('VERIFICATION.md');
    });

    test('allows executor when dependent phase has VERIFICATION.md', () => {
      makeEnv({
        activeSkill: 'build',
        stateContent: STATE_PHASE_2,
        roadmapContent: ROADMAP_WITH_DEPS,
        phaseDirs: [
          { name: '01-first', hasVerification: true },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(0);
    });

    test('allows when no dependencies', () => {
      makeEnv({
        activeSkill: 'build',
        stateContent: STATE_PHASE_2,
        roadmapContent: ROADMAP_NO_DEPS,
        phaseDirs: [
          { name: '01-first', hasVerification: false },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(0);
    });

    test('allows when depends-on line absent', () => {
      makeEnv({
        activeSkill: 'build',
        stateContent: STATE_PHASE_2,
        roadmapContent: ROADMAP_ABSENT_DEPS,
        phaseDirs: [
          { name: '01-first', hasVerification: false },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(0);
    });

    test('allows non-build skill', () => {
      makeEnv({
        activeSkill: 'review',
        stateContent: STATE_PHASE_2,
        roadmapContent: ROADMAP_WITH_DEPS,
        phaseDirs: [
          { name: '01-first', hasVerification: false },
          { name: '02-second', hasVerification: false }
        ]
      });
      const result = runInDir({ description: 'Run executor', subagent_type: 'pbr:executor' });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('checkpoint manifest advisory', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-cm-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    const { checkCheckpointManifest } = require('../plugins/pbr/scripts/validate-task');

    test('warns when build executor spawns without manifest', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(path.join(planningDir, 'phases', '01-test'), { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: 1 of 3 (Test)\n');
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result).toContain('checkpoint-manifest');
      process.cwd.mockRestore();
    });

    test('no warning when manifest exists', () => {
      const planningDir = path.join(tmpDir, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '01-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: 1 of 3 (Test)\n');
      fs.writeFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), '{}');
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });

    test('no warning for non-build skill', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });

    test('no warning for non-executor agent', () => {
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:planner' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });
  });

  describe('active-skill integrity', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-as-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    const { checkActiveSkillIntegrity } = require('../plugins/pbr/scripts/validate-task');

    test('warns when pbr agent spawns without .active-skill', () => {
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result).toContain('active-skill');
      process.cwd.mockRestore();
    });

    test('no warning when .active-skill exists', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });

    test('no warning for non-pbr agents', () => {
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'custom:agent' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });

    test('no warning when no .planning dir', () => {
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:planner' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });
  });

  describe('checkDebuggerAdvisory', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-dbg-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    const { checkDebuggerAdvisory } = require('../plugins/pbr/scripts/validate-task');

    test('returns null when subagent_type is not pbr:debugger', () => {
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:executor' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });

    test('returns null when .active-skill is not debug', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:debugger' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });

    test('returns null when .active-skill is debug and .planning/debug/ exists', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(path.join(planningDir, 'debug'), { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'debug');
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:debugger' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });

    test('returns advisory when .active-skill is debug and .planning/debug/ missing', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'debug');
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:debugger' } });
      expect(result).toContain('Debugger advisory');
      expect(result).toContain('.planning/debug/');
      process.cwd.mockRestore();
    });

    test('returns null when .active-skill file does not exist', () => {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      // No .active-skill file
      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:debugger' } });
      expect(result).toBeNull();
      process.cwd.mockRestore();
    });
  });

  describe('milestone gate status check', () => {
    let tmpDir;
    beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-task-mss-')); });
    afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    const ROADMAP_CONTENT = `# Roadmap

## Milestone: Test Milestone

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1 | First | 01-01 | Verified |

### Phase 1: First
**Goal:** Test
`;

    const STATE_CONTENT = `---
version: 2
current_phase: 1
total_phases: 1
phase_slug: "first"
---
# State

Phase: 1 of 1 (First)
Status: built
`;

    function makeEnv(opts) {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'milestone');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), STATE_CONTENT);
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP_CONTENT);
      const pDir = path.join(planningDir, 'phases', '01-first');
      fs.mkdirSync(pDir, { recursive: true });
      if (opts.verificationContent) {
        fs.writeFileSync(path.join(pDir, 'VERIFICATION.md'), opts.verificationContent);
      }
    }

    function runInDir(toolInput) {
      const input = JSON.stringify({ tool_input: toolInput });
      try {
        const output = execSync(`node "${SCRIPT}"`, { input, encoding: 'utf8', timeout: 5000, cwd: tmpDir });
        return { exitCode: 0, output };
      } catch (e) {
        return { exitCode: e.status, output: e.stdout || '' };
      }
    }

    test('VERIFICATION.md with status: passed allows milestone completion', () => {
      makeEnv({ verificationContent: '---\nstatus: passed\n---\n# Verification\nAll good.' });
      const result = runInDir({ description: 'Complete milestone', subagent_type: 'pbr:general' });
      expect(result.exitCode).toBe(0);
    });

    test('VERIFICATION.md with status: gaps_found blocks milestone completion', () => {
      makeEnv({ verificationContent: '---\nstatus: gaps_found\n---\n# Verification\nGaps exist.' });
      const result = runInDir({ description: 'Complete milestone', subagent_type: 'pbr:general' });
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('gaps_found');
    });

    test('VERIFICATION.md without frontmatter (unknown status) allows completion', () => {
      makeEnv({ verificationContent: '# Verification\nNo frontmatter here.' });
      const result = runInDir({ description: 'Complete milestone', subagent_type: 'pbr:general' });
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

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  checkTask,
  checkQuickExecutorGate,
  checkBuildExecutorGate,
  checkPlanExecutorGate,
  checkReviewPlannerGate,
  checkReviewVerifierGate,
  checkMilestoneCompleteGate,
  checkBuildDependencyGate,
  checkCheckpointManifest,
  checkActiveSkillIntegrity,
  KNOWN_AGENTS
} = require('../plugins/pbr/scripts/validate-task');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-vtu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkTask', () => {
  test('no warnings for valid task', () => {
    expect(checkTask({ tool_input: { description: 'Run tests', subagent_type: 'pbr:executor' } })).toEqual([]);
  });

  test('warns on missing description', () => {
    const w = checkTask({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(w.some(s => s.includes('without a description'))).toBe(true);
  });

  test('warns on empty description', () => {
    const w = checkTask({ tool_input: { description: '', subagent_type: 'pbr:executor' } });
    expect(w.some(s => s.includes('without a description'))).toBe(true);
  });

  test('warns on whitespace-only description', () => {
    const w = checkTask({ tool_input: { description: '   ', subagent_type: 'pbr:executor' } });
    expect(w.some(s => s.includes('without a description'))).toBe(true);
  });

  test('warns on long description', () => {
    const w = checkTask({ tool_input: { description: 'x'.repeat(101), subagent_type: 'pbr:executor' } });
    expect(w.some(s => s.includes('101 chars'))).toBe(true);
  });

  test('no warning at exactly 100 chars', () => {
    const w = checkTask({ tool_input: { description: 'x'.repeat(100), subagent_type: 'pbr:executor' } });
    expect(w).toEqual([]);
  });

  test('warns when description mentions pbr: but no subagent_type', () => {
    const w = checkTask({ tool_input: { description: 'Spawn pbr:planner for phase' } });
    expect(w.some(s => s.includes('subagent_type'))).toBe(true);
  });

  test('warns on unknown pbr agent type', () => {
    const w = checkTask({ tool_input: { description: 'Test', subagent_type: 'pbr:fake' } });
    expect(w.some(s => s.includes('Unknown pbr agent type'))).toBe(true);
  });

  test('no warning for non-pbr agent type', () => {
    const w = checkTask({ tool_input: { description: 'Test', subagent_type: 'custom:agent' } });
    expect(w).toEqual([]);
  });

  test('all known agents pass validation', () => {
    for (const agent of KNOWN_AGENTS) {
      const w = checkTask({ tool_input: { description: 'Test', subagent_type: `pbr:${agent}` } });
      expect(w).toEqual([]);
    }
  });

  test('handles missing tool_input', () => {
    const w = checkTask({});
    expect(w.some(s => s.includes('without a description'))).toBe(true);
  });
});

describe('checkQuickExecutorGate', () => {
  test('returns null for non-executor', () => {
    expect(checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('returns null when no .active-skill', () => {
    expect(checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when active skill is not quick', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('blocks when quick dir missing', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const result = checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('does not exist');
  });

  test('blocks when quick dir has no PLAN.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    fs.mkdirSync(path.join(planningDir, 'quick', '001-task'), { recursive: true });
    const result = checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('no PLAN.md');
  });

  test('passes when quick task has PLAN.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const taskDir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'PLAN.md'), 'plan content');
    expect(checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('blocks when PLAN.md is empty', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const taskDir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'PLAN.md'), '');
    const result = checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
  });
});

describe('checkBuildExecutorGate', () => {
  test('returns null for non-executor', () => {
    expect(checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('returns null when active skill is not build', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    expect(checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when no .active-skill', () => {
    expect(checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('blocks when no phases dir', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const result = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('phases');
  });

  test('blocks when no phase dir for current phase', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    fs.mkdirSync(path.join(planningDir, 'phases', '02-other'), { recursive: true });
    const result = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('phase 01');
  });

  test('blocks when phase dir has no PLAN.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    const result = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('no PLAN.md');
  });

  test('passes when PLAN.md exists', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), 'plan');
    expect(checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when STATE.md has no phase match', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase info');
    expect(checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });
});

describe('checkPlanExecutorGate', () => {
  test('returns null for non-executor', () => {
    expect(checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('returns null when active skill is not plan', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('blocks executor when active skill is plan', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
    const result = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('Plan skill cannot spawn executors');
  });

  test('returns null when no .active-skill file', () => {
    expect(checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });
});

describe('checkReviewPlannerGate', () => {
  test('returns null for non-planner', () => {
    expect(checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when active skill is not review', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('blocks planner when no VERIFICATION.md in phase dir', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    const result = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('VERIFICATION.md');
  });

  test('passes when VERIFICATION.md exists', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), 'verified');
    expect(checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('returns null when no phases dir', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('returns null when no phase match in STATE.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase info');
    expect(checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });
});

describe('checkReviewVerifierGate', () => {
  test('returns null for non-verifier', () => {
    expect(checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when active skill is not review', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } })).toBeNull();
  });

  test('blocks verifier when no SUMMARY in phase dir', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    fs.mkdirSync(path.join(planningDir, 'phases', '01-test'), { recursive: true });
    const result = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('SUMMARY');
  });

  test('passes when SUMMARY.md exists', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), 'summary');
    expect(checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } })).toBeNull();
  });

  test('passes when SUMMARY-01-01.md exists', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), 'summary');
    expect(checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } })).toBeNull();
  });

  test('blocks when SUMMARY exists but is empty', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), '');
    const result = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(result.block).toBe(true);
  });

  test('returns null when no .active-skill', () => {
    expect(checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } })).toBeNull();
  });

  test('returns null when no phases dir', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3');
    expect(checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } })).toBeNull();
  });
});

describe('checkMilestoneCompleteGate', () => {
  const ROADMAP = `# Roadmap

## Milestone: Test

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1 | First | 01-01 | Verified |
| 2 | Second | 02-01 | Built |

### Phase 1: First
**Goal:** Test

### Phase 2: Second
**Goal:** Test
`;

  const STATE = `---
version: 2
current_phase: 2
total_phases: 2
phase_slug: "second"
---
# State
Phase: 2 of 2
`;

  test('returns null for non-milestone skill', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:general', description: 'Complete milestone' } })).toBeNull();
  });

  test('returns null for non-general/planner agent', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'milestone');
    expect(checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:executor', description: 'Complete milestone' } })).toBeNull();
  });

  test('returns null for non-complete operations', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'milestone');
    expect(checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:general', description: 'Create new milestone' } })).toBeNull();
  });

  test('blocks when phase lacks VERIFICATION.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'milestone');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), STATE);
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP);
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'phases', '01-first', 'VERIFICATION.md'), 'ok');
    const result = checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:general', description: 'Complete milestone' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('VERIFICATION.md');
  });

  test('passes when all phases have VERIFICATION.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'milestone');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), STATE);
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP);
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'phases', '01-first', 'VERIFICATION.md'), 'ok');
    fs.writeFileSync(path.join(planningDir, 'phases', '02-second', 'VERIFICATION.md'), 'ok');
    expect(checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:general', description: 'Complete milestone' } })).toBeNull();
  });

  test('blocks when phase dir is missing', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'milestone');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), STATE);
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP);
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    const result = checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:general', description: 'Complete milestone' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('directory not found');
  });

  test('returns null when no .active-skill', () => {
    expect(checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:general', description: 'Complete milestone' } })).toBeNull();
  });

  test('works with pbr:planner agent type', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'milestone');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), STATE);
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP);
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'phases', '01-first', 'VERIFICATION.md'), 'ok');
    fs.writeFileSync(path.join(planningDir, 'phases', '02-second', 'VERIFICATION.md'), 'ok');
    expect(checkMilestoneCompleteGate({ tool_input: { subagent_type: 'pbr:planner', description: 'Complete milestone' } })).toBeNull();
  });
});

describe('checkBuildDependencyGate', () => {
  const ROADMAP_WITH_DEPS = `# Roadmap

## Milestone: Test

### Phase 1: First
**Goal:** Test

### Phase 2: Second
**Goal:** Test
**Depends on:** Phase 1
`;

  test('returns null for non-executor', () => {
    expect(checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('returns null when active skill is not build', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    expect(checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('blocks when dependent phase lacks VERIFICATION.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 2');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP_WITH_DEPS);
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'), { recursive: true });
    // Phase 01 has no VERIFICATION.md
    const result = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
    expect(result.reason).toContain('Build dependency gate');
  });

  test('passes when dependent phase has VERIFICATION.md', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 2');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP_WITH_DEPS);
    fs.mkdirSync(path.join(planningDir, 'phases', '01-first'), { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '02-second'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'phases', '01-first', 'VERIFICATION.md'), 'ok');
    expect(checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when no depends-on line', () => {
    const roadmap = '# Roadmap\n\n### Phase 1: First\n**Goal:** Test\n';
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 1');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);
    expect(checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when depends-on is "None"', () => {
    const roadmap = '# Roadmap\n\n### Phase 1: First\n**Goal:** Test\n**Depends on:** None\n';
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 1');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);
    expect(checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('blocks when dep phase dir is missing entirely', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 2');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP_WITH_DEPS);
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    const result = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result.block).toBe(true);
  });
});

describe('checkCheckpointManifest', () => {
  test('warns when manifest missing in build executor context', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3 (Test)\n');
    fs.mkdirSync(path.join(planningDir, 'phases', '01-test'), { recursive: true });
    const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toContain('checkpoint-manifest');
  });

  test('no warning when manifest exists', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3 (Test)\n');
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), '{}');
    expect(checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null for non-executor', () => {
    expect(checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });

  test('returns null for non-build skill', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    expect(checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when no .active-skill', () => {
    expect(checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when STATE.md has no phase match', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase info');
    expect(checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when phases dir missing', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3 (Test)\n');
    expect(checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null when no dir for current phase', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 1 of 3 (Test)\n');
    fs.mkdirSync(path.join(planningDir, 'phases', '02-other'), { recursive: true });
    expect(checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });
});

describe('checkActiveSkillIntegrity', () => {
  test('warns when pbr agent spawns without .active-skill', () => {
    const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toContain('active-skill');
  });

  test('no warning when .active-skill exists', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    expect(checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:executor' } })).toBeNull();
  });

  test('returns null for non-pbr agents', () => {
    expect(checkActiveSkillIntegrity({ tool_input: { subagent_type: 'custom:agent' } })).toBeNull();
  });

  test('returns null for empty subagent_type', () => {
    expect(checkActiveSkillIntegrity({ tool_input: { subagent_type: '' } })).toBeNull();
  });

  test('returns null for non-string subagent_type', () => {
    expect(checkActiveSkillIntegrity({ tool_input: { subagent_type: 123 } })).toBeNull();
  });

  test('returns null when no .planning dir', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    expect(checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:planner' } })).toBeNull();
  });
});

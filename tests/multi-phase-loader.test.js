'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadMultiPhasePlans } = require('../plugins/pbr/scripts/lib/gates/multi-phase-loader.js');

function createTempPhases() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-phase-'));
  const planningDir = path.join(tmpDir, '.planning');
  const phasesDir = path.join(planningDir, 'phases');

  // Create 3 phase directories with plan files
  const phases = [
    { dir: '01-foundation', plans: ['PLAN-01.md'] },
    { dir: '02-features', plans: ['PLAN-01.md', 'PLAN-02.md'] },
    { dir: '03-polish', plans: ['PLAN-01.md'] },
  ];

  for (const phase of phases) {
    const phaseDir = path.join(phasesDir, phase.dir);
    fs.mkdirSync(phaseDir, { recursive: true });
    for (const plan of phase.plans) {
      fs.writeFileSync(path.join(phaseDir, plan), [
        '---',
        `phase: "${phase.dir}"`,
        `plan: "${plan.replace('.md', '')}"`,
        '---',
        '',
        `# Plan for ${phase.dir}/${plan}`,
        '',
        'Task details here.',
      ].join('\n'));
    }
  }

  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('loadMultiPhasePlans', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    ({ tmpDir, planningDir } = createTempPhases());
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('loads all 3 phases when multi_phase_awareness=true and currentPhase=2, max=3', () => {
    const config = {
      features: { multi_phase_awareness: true },
      workflow: { max_phases_in_context: 3 },
    };
    const result = loadMultiPhasePlans(planningDir, 2, config);
    expect(result.phasesLoaded).toBe(3);
    expect(result.phases).toHaveLength(3);
    expect(result.totalPlans).toBe(4); // 1 + 2 + 1
  });

  test('loads only current phase when multi_phase_awareness=false', () => {
    const config = {
      features: { multi_phase_awareness: false },
      workflow: { max_phases_in_context: 3 },
    };
    const result = loadMultiPhasePlans(planningDir, 2, config);
    expect(result.phasesLoaded).toBe(1);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].phaseNum).toBe(2);
    expect(result.totalPlans).toBe(2); // phase 02 has 2 plans
  });

  test('loads only current phase when max_phases_in_context=1', () => {
    const config = {
      features: { multi_phase_awareness: true },
      workflow: { max_phases_in_context: 1 },
    };
    const result = loadMultiPhasePlans(planningDir, 2, config);
    expect(result.phasesLoaded).toBe(1);
    expect(result.phases[0].phaseNum).toBe(2);
  });

  test('handles currentPhase=1 (no previous phase) without error', () => {
    const config = {
      features: { multi_phase_awareness: true },
      workflow: { max_phases_in_context: 3 },
    };
    const result = loadMultiPhasePlans(planningDir, 1, config);
    expect(result.phasesLoaded).toBeLessThanOrEqual(3);
    expect(result.phases.some(p => p.phaseNum === 1)).toBe(true);
    expect(result.phases.some(p => p.phaseNum === 2)).toBe(true);
    // Should not error even though there's no phase 0
  });

  test('returns plan content with frontmatter and body', () => {
    const config = {
      features: { multi_phase_awareness: true },
      workflow: { max_phases_in_context: 1 },
    };
    const result = loadMultiPhasePlans(planningDir, 1, config);
    expect(result.phases[0].plans[0].content).toContain('phase: "01-foundation"');
    expect(result.phases[0].plans[0].content).toContain('Task details here.');
  });

  test('skips phase directories with no PLAN files', () => {
    // Create an empty phase directory
    const emptyPhase = path.join(planningDir, 'phases', '04-empty');
    fs.mkdirSync(emptyPhase, { recursive: true });

    const config = {
      features: { multi_phase_awareness: true },
      workflow: { max_phases_in_context: 5 },
    };
    const result = loadMultiPhasePlans(planningDir, 2, config);
    // Phase 04 has no plans so should be skipped
    expect(result.phases.every(p => p.plans.length > 0)).toBe(true);
  });

  test('defaults max_phases_in_context to 3 when not specified', () => {
    const config = {
      features: { multi_phase_awareness: true },
      workflow: {},
    };
    const result = loadMultiPhasePlans(planningDir, 2, config);
    expect(result.phasesLoaded).toBe(3);
  });

  test('defaults to enabled when multi_phase_awareness is undefined', () => {
    const config = { features: {}, workflow: {} };
    const result = loadMultiPhasePlans(planningDir, 2, config);
    expect(result.phasesLoaded).toBeGreaterThan(1);
  });
});

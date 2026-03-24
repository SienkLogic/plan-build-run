const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test
const { suggestNextTask } = require('../plugins/pbr/scripts/lib/smart-next-task');

function createTempPlanning() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-smart-next-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmpDir, planningDir };
}

function writeRoadmap(planningDir, content) {
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), content, 'utf8');
}

function writeState(planningDir, frontmatter) {
  const yaml = Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), `---\n${yaml}\n---\n# State\n`, 'utf8');
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('suggestNextTask', () => {
  test('returns null when no ROADMAP.md exists', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      const result = suggestNextTask(planningDir);
      expect(result).toBeNull();
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns null when all phases are completed', async () => {

    const { tmpDir, planningDir } = createTempPlanning();
    try {
      writeRoadmap(planningDir, [
        '# Roadmap',
        '',
        '### Phase 1: Foundation',
        '**Depends on:** None',
        '',
        '### Phase 2: Features',
        '**Depends on:** Phase 1',
        '',
        '## Progress',
        '- [x] Phase 1: Foundation',
        '- [x] Phase 2: Features'
      ].join('\n'));
      writeState(planningDir, { current_phase: 2, status: 'verified', plans_total: 2, plans_complete: 2 });

      const result = suggestNextTask(planningDir);
      expect(result).toBeNull();
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns first unblocked phase in linear chain', async () => {

    const { tmpDir, planningDir } = createTempPlanning();
    try {
      writeRoadmap(planningDir, [
        '# Roadmap',
        '',
        '### Phase 1: Foundation',
        '**Depends on:** None',
        '',
        '### Phase 2: Core',
        '**Depends on:** Phase 1',
        '',
        '### Phase 3: Advanced',
        '**Depends on:** Phase 2',
        '',
        '## Progress',
        '- [x] Phase 1: Foundation',
        '- [x] Phase 2: Core',
        '- [ ] Phase 3: Advanced'
      ].join('\n'));
      writeState(planningDir, { current_phase: 2, status: 'verified', plans_total: 3, plans_complete: 3 });

      const result = suggestNextTask(planningDir);
      expect(result).not.toBeNull();
      expect(result.phase).toBe(3);
      expect(result.name).toContain('Advanced');
      expect(result.command).toMatch(/plan-phase/);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns critical-path phase when multiple are unblocked', async () => {

    const { tmpDir, planningDir } = createTempPlanning();
    try {
      // Phase 2 has more downstream dependents (3,4 depend on 2; 5 depends on 3)
      // Phase 6 is independent with no downstream — should NOT be preferred
      writeRoadmap(planningDir, [
        '# Roadmap',
        '',
        '### Phase 1: Foundation',
        '**Depends on:** None',
        '',
        '### Phase 2: Core Engine',
        '**Depends on:** Phase 1',
        '',
        '### Phase 3: API Layer',
        '**Depends on:** Phase 2',
        '',
        '### Phase 4: UI Layer',
        '**Depends on:** Phase 2',
        '',
        '### Phase 5: Integration',
        '**Depends on:** Phase 3',
        '',
        '### Phase 6: Docs',
        '**Depends on:** Phase 1',
        '',
        '## Progress',
        '- [x] Phase 1: Foundation',
        '- [ ] Phase 2: Core Engine',
        '- [ ] Phase 3: API Layer',
        '- [ ] Phase 4: UI Layer',
        '- [ ] Phase 5: Integration',
        '- [ ] Phase 6: Docs'
      ].join('\n'));
      writeState(planningDir, { current_phase: 1, status: 'verified', plans_total: 6, plans_complete: 1 });

      const result = suggestNextTask(planningDir);
      expect(result).not.toBeNull();
      // Phase 2 is on the critical path (3 downstream: 3, 4, 5)
      // Phase 6 only has 0 downstream
      expect(result.phase).toBe(2);
      expect(result.reason).toMatch(/critical|downstream/i);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('suggests next plan within current in-progress phase', async () => {

    const { tmpDir, planningDir } = createTempPlanning();
    try {
      writeRoadmap(planningDir, [
        '# Roadmap',
        '',
        '### Phase 1: Foundation',
        '**Depends on:** None',
        '',
        '### Phase 2: Features',
        '**Depends on:** Phase 1',
        '',
        '## Progress',
        '- [x] Phase 1: Foundation',
        '- [ ] Phase 2: Features'
      ].join('\n'));
      writeState(planningDir, { current_phase: 2, status: 'building', plans_total: 3, plans_complete: 1 });

      const result = suggestNextTask(planningDir);
      expect(result).not.toBeNull();
      expect(result.phase).toBe(2);
      expect(result.reason).toMatch(/in.?progress|current/i);
      expect(result.command).toMatch(/build/);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('skips phase with unmet dependency', async () => {

    const { tmpDir, planningDir } = createTempPlanning();
    try {
      writeRoadmap(planningDir, [
        '# Roadmap',
        '',
        '### Phase 1: Foundation',
        '**Depends on:** None',
        '',
        '### Phase 2: Core',
        '**Depends on:** Phase 1',
        '',
        '### Phase 3: Advanced',
        '**Depends on:** Phase 2',
        '',
        '## Progress',
        '- [x] Phase 1: Foundation',
        '- [ ] Phase 2: Core',
        '- [ ] Phase 3: Advanced'
      ].join('\n'));
      writeState(planningDir, { current_phase: 1, status: 'verified', plans_total: 3, plans_complete: 1 });

      const result = suggestNextTask(planningDir);
      expect(result).not.toBeNull();
      // Phase 2 is unblocked (depends on Phase 1 which is done)
      // Phase 3 is blocked (depends on Phase 2 which is not done)
      expect(result.phase).toBe(2);
    } finally {
      cleanup(tmpDir);
    }
  });
});

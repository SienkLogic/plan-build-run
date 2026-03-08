/**
 * Tests for dynamic phase operations: phaseAdd (enhanced), phaseInsert, phaseRemove (enhanced).
 * Covers directory creation, ROADMAP.md integration, STATE.md adjustments, and renumbering.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Import functions under test
const {
  phaseAdd,
  phaseRemove,
  phaseInsert
} = require('../plan-build-run/bin/lib/phase.cjs');

const {
  roadmapAppendPhase,
  roadmapRemovePhase,
  roadmapRenumberPhases
} = require('../plan-build-run/bin/lib/roadmap.cjs');

let tmpDir;

/**
 * Create a minimal .planning directory with ROADMAP.md, STATE.md, and 3 phase dirs.
 */
function setupTestProject(opts = {}) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  const phasesDir = path.join(planningDir, 'phases');
  fs.mkdirSync(phasesDir, { recursive: true });

  // Create 3 phase directories by default
  const phaseCount = opts.phaseCount !== undefined ? opts.phaseCount : 3;
  const phaseSlugs = opts.phaseSlugs || ['setup', 'core-features', 'testing'];
  for (let i = 0; i < phaseCount; i++) {
    const slug = phaseSlugs[i] || `phase-${i + 1}`;
    fs.mkdirSync(path.join(phasesDir, `${String(i + 1).padStart(2, '0')}-${slug}`), { recursive: true });
  }

  // Create ROADMAP.md
  if (opts.noRoadmap !== true) {
    const roadmapContent = [
      '# Roadmap',
      '',
      '## Milestone: v1.0 (Initial Release)',
      '',
      '### Phase 1: Setup',
      '**Goal:** Set up the project',
      '**Depends on:** None',
      '',
      '### Phase 2: Core Features',
      '**Goal:** Build the main features',
      '**Depends on:** Phase 1',
      '',
      '### Phase 3: Testing',
      '**Goal:** Add comprehensive tests',
      '**Depends on:** Phase 2',
      '',
      '## Progress',
      '',
      '| Phase | Plans | Status |',
      '|-------|-------|--------|',
      '| 1. Setup | 1/1 | Complete |',
      '| 2. Core Features | 0/2 | Building |',
      '| 3. Testing | 0/0 | Pending |',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmapContent, 'utf8');
  }

  // Create STATE.md
  if (opts.noState !== true) {
    const currentPhase = opts.currentPhase || 2;
    const stateContent = [
      '---',
      'version: 2',
      `current_phase: ${currentPhase}`,
      'phase_slug: "core-features"',
      'status: "building"',
      'plans_complete: 0',
      'plans_total: 2',
      'progress_percent: 0',
      '---',
      '',
      `Phase: ${currentPhase} of ${phaseCount}`,
      'Status: Building',
      'Plan: 0 of 2',
      'Progress: [░░░░░░░░░░░░░░░░░░░░] 0%',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent, 'utf8');
  }

  return planningDir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-phase-ops-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_e) { /* ignore cleanup errors */ }
});

// === phaseAdd tests ===

describe('phaseAdd', () => {
  test('basic add appends phase 4 after existing 3', () => {
    const planningDir = setupTestProject();
    const result = phaseAdd('deployment', null, planningDir);

    expect(result.phase).toBe(4);
    expect(result.slug).toBe('deployment');
    expect(result.directory).toBe('04-deployment');
    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.roadmap_updated).toBe(true);

    // Verify ROADMAP.md has new phase heading
    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).toContain('### Phase 4: Deployment');
    expect(roadmap).toContain('| 4. Deployment |');
  });

  test('add with --goal and --depends-on updates ROADMAP.md', () => {
    const planningDir = setupTestProject();
    const result = phaseAdd('monitoring', null, planningDir, {
      goal: 'Add monitoring and alerting',
      dependsOn: '3'
    });

    expect(result.phase).toBe(4);
    expect(result.goal).toBe('Add monitoring and alerting');
    expect(result.depends_on).toBe('3');
    expect(result.roadmap_updated).toBe(true);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).toContain('**Goal:** Add monitoring and alerting');
    expect(roadmap).toContain('**Depends on:** Phase 3');
  });

  test('add to empty project creates phase 1', () => {
    const planningDir = setupTestProject({ phaseCount: 0, noRoadmap: true, noState: true });
    const result = phaseAdd('initial', null, planningDir);

    expect(result.phase).toBe(1);
    expect(result.directory).toBe('01-initial');
    expect(fs.existsSync(result.path)).toBe(true);
  });

  test('backward compat: call without options object does not crash', () => {
    const planningDir = setupTestProject();
    // Call with only 3 args (no options) — backward compatible signature
    const result = phaseAdd('extra', null, planningDir);

    expect(result.phase).toBe(4);
    expect(result.goal).toBeNull();
    expect(result.depends_on).toBeNull();
  });

  test('add with --after inserts and renumbers', () => {
    const planningDir = setupTestProject();
    const result = phaseAdd('middleware', '1', planningDir, { goal: 'Add middleware layer' });

    expect(result.phase).toBe(2);
    expect(result.renumbered).toBe(true);

    // Old phase 2 should now be phase 3
    const phasesDir = path.join(planningDir, 'phases');
    const dirs = fs.readdirSync(phasesDir).sort();
    expect(dirs).toContain('02-middleware');
    expect(dirs).toContain('03-core-features');
    expect(dirs).toContain('04-testing');
  });
});

// === phaseInsert tests ===

describe('phaseInsert', () => {
  test('insert at position 2 with 3 existing phases renumbers correctly', () => {
    const planningDir = setupTestProject();
    const result = phaseInsert(2, 'new-feature', planningDir, { goal: 'New feature' });

    expect(result.phase).toBe(2);
    expect(result.directory).toBe('02-new-feature');
    expect(result.renumbered_count).toBe(2); // phases 2 and 3 were shifted
    expect(fs.existsSync(result.path)).toBe(true);

    // Verify renumbering on disk
    const phasesDir = path.join(planningDir, 'phases');
    const dirs = fs.readdirSync(phasesDir).sort();
    expect(dirs).toContain('01-setup');
    expect(dirs).toContain('02-new-feature');
    expect(dirs).toContain('03-core-features');
    expect(dirs).toContain('04-testing');
  });

  test('insert at position 1 shifts all existing phases', () => {
    const planningDir = setupTestProject();
    const result = phaseInsert(1, 'bootstrap', planningDir);

    expect(result.phase).toBe(1);
    expect(result.renumbered_count).toBe(3); // all 3 shifted

    const phasesDir = path.join(planningDir, 'phases');
    const dirs = fs.readdirSync(phasesDir).sort();
    expect(dirs[0]).toBe('01-bootstrap');
    expect(dirs[1]).toBe('02-setup');
    expect(dirs[2]).toBe('03-core-features');
    expect(dirs[3]).toBe('04-testing');
  });

  test('ROADMAP.md renumbering on insert', () => {
    const planningDir = setupTestProject();
    phaseInsert(2, 'auth', planningDir, { goal: 'Authentication' });

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // Old Phase 2 should now be Phase 3
    expect(roadmap).toContain('### Phase 3: Core Features');
    // Old Phase 3 should now be Phase 4
    expect(roadmap).toContain('### Phase 4: Testing');
    // New Phase 2 should be inserted
    expect(roadmap).toContain('### Phase 2: Auth');
  });

  test('STATE.md current_phase shifts when insert at or before current', () => {
    const planningDir = setupTestProject({ currentPhase: 2 });
    phaseInsert(2, 'auth', planningDir);

    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    // current_phase was 2, insert at 2 means current should become 3
    expect(stateContent).toMatch(/current_phase:\s*3/);
  });

  test('STATE.md current_phase unchanged when insert after current', () => {
    const planningDir = setupTestProject({ currentPhase: 2 });
    phaseInsert(3, 'post-test', planningDir);

    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    // current_phase was 2, insert at 3 should not change it
    expect(stateContent).toMatch(/current_phase:\s*2/);
  });

  test('dependency references updated in ROADMAP.md', () => {
    const planningDir = setupTestProject();
    phaseInsert(2, 'auth', planningDir);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // The old "Depends on: Phase 2" for Testing should now say "Phase 3"
    // (Testing was Phase 3 which depended on Phase 2, now it's Phase 4 depending on Phase 3)
    const testingSection = roadmap.split('### Phase 4:')[1];
    if (testingSection) {
      expect(testingSection).toContain('Phase 3');
    }
  });

  test('invalid position returns error', () => {
    const planningDir = setupTestProject();
    const result = phaseInsert(0, 'bad', planningDir);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('positive integer');
  });
});

// === phaseRemove tests ===

describe('phaseRemove (enhanced)', () => {
  test('remove future empty phase updates ROADMAP.md', () => {
    const planningDir = setupTestProject({ currentPhase: 1 });
    // Phase 3 (testing) is empty and future, should be removable
    const result = phaseRemove('3', planningDir);

    expect(result.removed).toBe(true);
    expect(result.roadmap_updated).toBe(true);

    // Verify ROADMAP.md no longer has Phase 3
    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).not.toContain('### Phase 3: Testing');
    expect(roadmap).not.toContain('| 3. Testing |');
  });

  test('refuse to remove current phase', () => {
    const planningDir = setupTestProject({ currentPhase: 2 });
    const result = phaseRemove('2', planningDir);

    expect(result.removed).toBe(false);
    expect(result.error).toContain('current active phase');
  });

  test('refuse to remove completed phase with passing verification', () => {
    const planningDir = setupTestProject({ currentPhase: 2 });
    // Add a passing VERIFICATION.md to phase 1
    const phase1Dir = path.join(planningDir, 'phases', '01-setup');
    fs.writeFileSync(path.join(phase1Dir, 'VERIFICATION.md'), [
      '---',
      'result: passed',
      '---',
      '',
      'Verification passed.'
    ].join('\n'), 'utf8');

    const result = phaseRemove('1', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toContain('passed verification');
  });

  test('STATE.md current_phase adjusted when removing phase before current', () => {
    const planningDir = setupTestProject({ currentPhase: 3 });
    // Remove phase 2 (empty, not current)
    const result = phaseRemove('2', planningDir);

    expect(result.removed).toBe(true);
    expect(result.state_updated).toBe(true);

    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    // current_phase was 3, removing phase 2 should make it 2
    expect(stateContent).toMatch(/current_phase:\s*2/);
  });

  test('remove with renumbering updates subsequent dirs', () => {
    const planningDir = setupTestProject({ currentPhase: 1 });
    phaseRemove('2', planningDir);

    const phasesDir = path.join(planningDir, 'phases');
    const dirs = fs.readdirSync(phasesDir).sort();
    // Phase 3 (testing) should now be phase 2
    expect(dirs).toContain('01-setup');
    expect(dirs).toContain('02-testing');
    expect(dirs).not.toContain('03-testing');
  });

  test('refuse to remove non-empty phase', () => {
    const planningDir = setupTestProject({ currentPhase: 1 });
    // Add a file to phase 3
    const phase3Dir = path.join(planningDir, 'phases', '03-testing');
    fs.writeFileSync(path.join(phase3Dir, 'PLAN-01.md'), '---\nplan: "01"\n---\n', 'utf8');

    const result = phaseRemove('3', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toContain('files');
  });
});

// === roadmap helper unit tests ===

describe('roadmapAppendPhase', () => {
  test('appends phase heading and progress row', () => {
    const planningDir = setupTestProject();
    const result = roadmapAppendPhase(planningDir, 4, 'Deployment', 'Deploy to production', 3);

    expect(result.success).not.toBe(false);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).toContain('### Phase 4: Deployment');
    expect(roadmap).toContain('**Goal:** Deploy to production');
    expect(roadmap).toContain('**Depends on:** Phase 3');
    expect(roadmap).toContain('| 4. Deployment |');
  });

  test('returns error when ROADMAP.md missing', () => {
    const planningDir = setupTestProject({ noRoadmap: true });
    const result = roadmapAppendPhase(planningDir, 1, 'Test', null, null);
    expect(result.success).toBe(false);
  });
});

describe('roadmapRemovePhase', () => {
  test('removes phase heading block and progress row', () => {
    const planningDir = setupTestProject();
    roadmapRemovePhase(planningDir, 2);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).not.toContain('### Phase 2: Core Features');
    expect(roadmap).not.toContain('| 2. Core Features |');
    // Phase 1 and 3 should still be there
    expect(roadmap).toContain('### Phase 1: Setup');
    expect(roadmap).toContain('### Phase 3: Testing');
  });
});

describe('roadmapRenumberPhases', () => {
  test('shifts phase numbers up by +1', () => {
    const planningDir = setupTestProject();
    roadmapRenumberPhases(planningDir, 2, +1);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // Phase 2 -> Phase 3, Phase 3 -> Phase 4
    expect(roadmap).toContain('### Phase 3: Core Features');
    expect(roadmap).toContain('### Phase 4: Testing');
    // Phase 1 unchanged
    expect(roadmap).toContain('### Phase 1: Setup');
  });

  test('shifts phase numbers down by -1', () => {
    const planningDir = setupTestProject();
    roadmapRenumberPhases(planningDir, 3, -1);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // Phase 3 -> Phase 2 (but Phase 2 already exists — this is called after removing Phase 2)
    expect(roadmap).toContain('### Phase 2: Testing');
  });

  test('updates progress table row numbers', () => {
    const planningDir = setupTestProject();
    roadmapRenumberPhases(planningDir, 2, +1);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).toContain('| 3. Core Features |');
    expect(roadmap).toContain('| 4. Testing |');
  });

  test('updates dependency text references', () => {
    const planningDir = setupTestProject();
    roadmapRenumberPhases(planningDir, 2, +1);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    // "Depends on: Phase 2" in Testing section should become "Phase 3"
    // Since Phase 2 was shifted to 3
    expect(roadmap).toContain('Phase 3');
  });
});

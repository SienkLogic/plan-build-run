'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { detectDrift, initExecutePhase, initPlanPhase, initQuick, initVerifyWork, initResume, initProgress } = require('../plan-build-run/bin/lib/init.cjs');
const { statePatch, stateAdvancePlan, stateRecordMetric } = require('../plan-build-run/bin/lib/state.cjs');
const { configClearCache } = require('../plan-build-run/bin/lib/config.cjs');

const STATE_FM = [
  '---', 'version: 2', 'current_phase: 3',
  'phase_slug: auth', 'status: executing', 'progress_percent: 40',
  'plans_total: 2', 'plans_complete: 1', 'last_activity: 2026-02-20',
  'last_command: /pbr:execute-phase 3', 'blockers: []', '---',
  '# Project State', '', '## Current Position',
  'Phase: 3 of 5 -- Auth', 'Plan: 1 of 2 in current phase',
  'Status: executing', 'Progress: 40%',
].join(String.fromCharCode(10));

const ROADMAP_MD = [
  '# Roadmap', '', '## Phase Overview',
  '| Phase | Name | Goal | Plans | Wave | Status |',
  '|-------|------|------|-------|------|--------|',
  '| 01 | Setup | Bootstrap project | 1 | 1 | verified |',
  '| 02 | Data  | Data models       | 2 | 1 | built    |',
  '| 03 | Auth  | Authentication    | 2 | 1 | building |',
  '| 04 | API   | REST endpoints    | 2 | 2 | pending  |',
  '| 05 | UI    | Frontend          | 1 | 2 | pending  |',
].join(String.fromCharCode(10));

const CONFIG_JSON = JSON.stringify({
  version: 1, depth: 'standard', mode: 'interactive',
  models: { executor: 'sonnet', verifier: 'sonnet', planner: 'sonnet', researcher: 'sonnet' },
  features: {}, planning: {}, gates: {}, parallelization: { enabled: false },
});

const PLAN_01_MD = [
  '---', 'plan: 01', 'wave: 1', 'autonomous: false',
  'type: implementation', 'depends_on: []', 'must_haves:',
  '  truths:', '    - Users can log in',
  '  artifacts:', '    - src/auth.ts', '  key_links: []',
  '---', '# Plan 01',
].join(String.fromCharCode(10));

function buildFixture(tmpDir) {
  var planningDir = path.join(tmpDir, '.planning');
  var phaseDir = path.join(planningDir, 'phases', '03-auth');
  var quickDir = path.join(planningDir, 'quick');
  var logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.mkdirSync(quickDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), STATE_FM);
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), ROADMAP_MD);
  fs.writeFileSync(path.join(planningDir, 'config.json'), CONFIG_JSON);
  fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), PLAN_01_MD);
}
describe('pbr-tools compound init commands', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-init-test-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initExecutePhase', () => {
    test('returns expected top-level keys', () => {
      var result = initExecutePhase('3');
      expect(result).toHaveProperty('executor_model');
      expect(result).toHaveProperty('verifier_model');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('plans');
      expect(result).toHaveProperty('waves');
    });

    test('reads model from config', () => {
      var result = initExecutePhase('3');
      expect(result.executor_model).toBe('sonnet');
      expect(result.verifier_model).toBe('sonnet');
    });

    test('phase object includes plan count', () => {
      var result = initExecutePhase('3');
      expect(result.phase.num).toBe('3');
      expect(result.phase.plan_count).toBe(1);
    });

    test('plans array has one entry matching 01-PLAN.md', () => {
      var result = initExecutePhase('3');
      expect(Array.isArray(result.plans)).toBe(true);
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0].wave).toBe(1);
    });

    test('returns error for nonexistent phase', () => {
      var result = initExecutePhase('99');
      expect(result.error).toMatch(/phase/i);
    });

    test('returns error when no .planning dir', () => {
      fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true });
      var result = initExecutePhase('3');
      expect(result.error).toBeDefined();
    });

    test('initExecutePhase respects overrideModel when provided', () => {
      var result = initExecutePhase('3', path.join(tmpDir, '.planning'), 'opus');
      expect(result.executor_model).toBe('opus');
      expect(result.verifier_model).toBe('opus');
    });

    test('initExecutePhase falls back to config model when overrideModel is undefined', () => {
      var result = initExecutePhase('3', path.join(tmpDir, '.planning'));
      expect(result.executor_model).toBe('sonnet');
      expect(result.verifier_model).toBe('sonnet');
    });
  });

  describe('initPlanPhase', () => {
    test('returns expected top-level keys', () => {
      var result = initPlanPhase('3');
      expect(result).toHaveProperty('researcher_model');
      expect(result).toHaveProperty('planner_model');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('existing_artifacts');
      expect(result).toHaveProperty('workflow');
    });

    test('existing_artifacts lists markdown files in phase dir', () => {
      var result = initPlanPhase('3');
      expect(Array.isArray(result.existing_artifacts)).toBe(true);
      expect(result.existing_artifacts).toContain('01-PLAN.md');
    });

    test('phase goal comes from ROADMAP.md', () => {
      var result = initPlanPhase('3');
      expect(result.phase.goal).toBe('Authentication');
    });

    test('workflow reflects feature flags', () => {
      var result = initPlanPhase('3');
      expect(result.workflow).toHaveProperty('research_phase');
      expect(result.workflow).toHaveProperty('plan_checking');
    });

    test('returns error when no .planning dir', () => {
      fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true });
      var result = initPlanPhase('3');
      expect(result.error).toBeDefined();
    });

    test('initPlanPhase respects overrideModel when provided', () => {
      var result = initPlanPhase('3', path.join(tmpDir, '.planning'), 'haiku');
      expect(result.researcher_model).toBe('haiku');
      expect(result.planner_model).toBe('haiku');
      expect(result.checker_model).toBe('haiku');
    });

    test('initPlanPhase falls back to config model when overrideModel is undefined', () => {
      var result = initPlanPhase('3', path.join(tmpDir, '.planning'));
      expect(result.researcher_model).toBe('sonnet');
      expect(result.planner_model).toBe('sonnet');
    });
  });
  describe('initQuick', () => {
    test('returns expected fields', () => {
      var result = initQuick('fix login bug');
      expect(result).toHaveProperty('next_task_number');
      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('dir');
      expect(result).toHaveProperty('dir_name');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('config');
    });

    test('next_task_number is 001 when quick/ is empty', () => {
      var result = initQuick('first task');
      expect(result.next_task_number).toBe('001');
    });

    test('slug is derived from description', () => {
      var result = initQuick('Fix Login Bug');
      expect(result.slug).toBe('fix-login-bug');
    });

    test('dir uses relative .planning/quick/ path', () => {
      var result = initQuick('my task');
      expect(result.dir).toContain('.planning');
      expect(result.dir).toContain('quick');
    });

    test('increments task number when existing dirs present', () => {
      var quickDir = path.join(tmpDir, '.planning', 'quick');
      fs.mkdirSync(path.join(quickDir, '001-prior-task'));
      var result = initQuick('next task');
      expect(result.next_task_number).toBe('002');
    });

    test('timestamp is a valid ISO string', () => {
      var result = initQuick('task');
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).getFullYear()).toBeGreaterThan(2020);
    });
  });

  describe('initVerifyWork', () => {
    test('returns expected fields', () => {
      var result = initVerifyWork('3');
      expect(result).toHaveProperty('verifier_model');
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('has_verification');
      expect(result).toHaveProperty('prior_attempts');
      expect(result).toHaveProperty('summaries');
    });

    test('has_verification is false with no VERIFICATION.md', () => {
      var result = initVerifyWork('3');
      expect(result.has_verification).toBe(false);
      expect(result.prior_attempts).toBe(0);
    });

    test('has_verification is true when VERIFICATION.md exists', () => {
      var verPath = path.join(tmpDir, '.planning', 'phases', '03-auth', 'VERIFICATION.md');
      fs.writeFileSync(verPath, '---\nattempt: 2\nstatus: partial\n---\n');
      var result = initVerifyWork('3');
      expect(result.has_verification).toBe(true);
      expect(result.prior_attempts).toBe(2);
    });

    test('returns error for missing phase', () => {
      var result = initVerifyWork('99');
      expect(result.error).toBeDefined();
    });

    test('initVerifyWork respects overrideModel when provided', () => {
      var result = initVerifyWork('3', path.join(tmpDir, '.planning'), 'inherit');
      expect(result.verifier_model).toBe('inherit');
    });

    test('initVerifyWork falls back to config model when overrideModel is undefined', () => {
      var result = initVerifyWork('3', path.join(tmpDir, '.planning'));
      expect(result.verifier_model).toBe('sonnet');
    });
  });

  describe('initResume', () => {
    test('returns expected fields', () => {
      var result = initResume();
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('auto_next');
      expect(result).toHaveProperty('continue_here');
      expect(result).toHaveProperty('active_skill');
      expect(result).toHaveProperty('current_phase');
      expect(result).toHaveProperty('progress');
    });

    test('auto_next is null when .auto-next file absent', () => {
      var result = initResume();
      expect(result.auto_next).toBeNull();
    });

    test('reads .auto-next file when present', () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.auto-next'), '/pbr:execute-phase 4');
      var result = initResume();
      expect(result.auto_next).toBe('/pbr:execute-phase 4');
    });

    test('reads .active-skill file when present', () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'build');
      var result = initResume();
      expect(result.active_skill).toBe('build');
    });

    test('current_phase reflects STATE.md value', () => {
      var result = initResume();
      expect(result.current_phase).toBe(3);
    });

    test('returns error when no .planning dir', () => {
      fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true });
      var result = initResume();
      expect(result.error).toBeDefined();
    });
  });

  describe('initProgress', () => {
    test('returns expected fields', () => {
      var result = initProgress();
      expect(result).toHaveProperty('current_phase');
      expect(result).toHaveProperty('total_phases'); // derived from ROADMAP.md phase_count, not STATE.md frontmatter
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('phases');
      expect(result).toHaveProperty('total_plans');
    });

    test('current_phase matches STATE.md', () => {
      var result = initProgress();
      expect(result.current_phase).toBe(3);
    });

    test('phases is an array', () => {
      var result = initProgress();
      expect(Array.isArray(result.phases)).toBe(true);
    });

    test('returns error when no .planning dir', () => {
      fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true });
      var result = initProgress();
      expect(result.error).toBeDefined();
    });
  });
  describe('statePatch', () => {
    test('updates status field', () => {
      var result = statePatch(JSON.stringify({ status: 'building' }));
      expect(result.success).toBe(true);
      expect(result.updated).toContain('status');
      var state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
      expect(state).toContain('building');
    });

    test('updates multiple fields', () => {
      var result = statePatch(JSON.stringify({ status: 'built', progress_percent: 80 }));
      expect(result.success).toBe(true);
      expect(result.updated).toContain('status');
      expect(result.updated).toContain('progress_percent');
    });

    test('returns error for unknown field', () => {
      var result = statePatch(JSON.stringify({ nonexistent_field: 'value' }));
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0]).toMatch(/Unknown field/);
    });

    test('returns error for invalid JSON', () => {
      var result = statePatch('not-json');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid JSON/);
    });

    test('returns error when STATE.md missing', () => {
      fs.rmSync(path.join(tmpDir, '.planning', 'STATE.md'));
      var result = statePatch(JSON.stringify({ status: 'built' }));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/STATE.md not found/);
    });
  });

  describe('stateAdvancePlan', () => {
    test('returns error when STATE.md missing', () => {
      fs.rmSync(path.join(tmpDir, '.planning', 'STATE.md'));
      var result = stateAdvancePlan();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/STATE.md not found/);
    });

    test('returns error when no Plan: N of M line found', () => {
      fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\nStatus: building\n');
      var result = stateAdvancePlan();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Plan:/);
    });

    test('advances plan counter in legacy STATE.md', () => {
      var legacy = ['# State', 'Phase: 3 of 5 -- Auth', 'Plan: 1 of 3', 'Status: building', 'Progress: 20%'].join(String.fromCharCode(10));
      fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), legacy);
      var result = stateAdvancePlan();
      expect(result.success).toBe(true);
      expect(result.previous_plan).toBe(1);
      expect(result.current_plan).toBe(2);
      expect(result.total_plans).toBe(3);
    });
  });

  describe('stateRecordMetric', () => {
    test('records duration metric', () => {
      var result = stateRecordMetric(['--duration', '45m']);
      expect(result.success).toBe(true);
      expect(result.duration_minutes).toBe(45);
    });

    test('records plans_completed metric', () => {
      var result = stateRecordMetric(['--plans-completed', '3']);
      expect(result.success).toBe(true);
      expect(result.plans_completed).toBe(3);
    });

    test('records both duration and plans_completed', () => {
      var result = stateRecordMetric(['--duration', '30m', '--plans-completed', '2']);
      expect(result.success).toBe(true);
      expect(result.duration_minutes).toBe(30);
      expect(result.plans_completed).toBe(2);
    });

    test('handles hour duration unit', () => {
      var result = stateRecordMetric(['--duration', '2h']);
      expect(result.success).toBe(true);
      expect(result.duration_minutes).toBe(120);
    });

    test('succeeds with no args (no-op metric)', () => {
      var result = stateRecordMetric([]);
      expect(result.success).toBe(true);
      expect(result.duration_minutes).toBeNull();
      expect(result.plans_completed).toBeNull();
    });
  });

  describe('detectDrift', () => {
    test('returns drift_detected: false when STATE.md matches filesystem', () => {
      // Default fixture: STATE.md says plans_complete: 1, filesystem has 0 complete summaries
      // Update STATE.md to say 0 complete to match filesystem (no complete summaries)
      var planningDir = path.join(tmpDir, '.planning');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
        '---', 'version: 2', 'current_phase: 3',
        'phase_slug: auth', 'status: executing', 'progress_percent: 0',
        'plans_total: 1', 'plans_complete: 0', 'last_activity: 2026-02-20',
        '---', '# Project State', '', 'Phase: 3 of 5',
        'Plan: 0 of 1', 'Status: executing', 'Progress: 0%',
      ].join('\n'));
      var result = detectDrift(planningDir);
      expect(result.drift_detected).toBe(false);
      expect(result.stale_fields).toEqual([]);
    });

    test('returns drift_detected: true when STATE.md plans_complete differs', () => {
      // STATE.md says 0 complete, but add a complete summary to filesystem
      var planningDir = path.join(tmpDir, '.planning');
      var phaseDir = path.join(planningDir, 'phases', '03-auth');
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
        '---', 'version: 2', 'current_phase: 3',
        'phase_slug: auth', 'status: executing', 'progress_percent: 0',
        'plans_total: 1', 'plans_complete: 0', 'last_activity: 2026-02-20',
        '---', '# Project State', '', 'Phase: 3 of 5',
        'Plan: 0 of 1', 'Status: executing', 'Progress: 0%',
      ].join('\n'));
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), [
        '---', 'status: complete', '---', '# Summary'
      ].join('\n'));
      var result = detectDrift(planningDir);
      expect(result.drift_detected).toBe(true);
      expect(result.stale_fields).toContain('plans_complete');
    });

    test('initExecutePhase includes drift field', () => {
      var result = initExecutePhase('3');
      expect(result).toHaveProperty('drift');
      expect(typeof result.drift.drift_detected).toBe('boolean');
      expect(Array.isArray(result.drift.stale_fields)).toBe(true);
    });

    test('initPlanPhase includes drift field', () => {
      var result = initPlanPhase('3');
      expect(result).toHaveProperty('drift');
      expect(typeof result.drift.drift_detected).toBe('boolean');
    });

    test('initProgress includes drift field', () => {
      var result = initProgress();
      expect(result).toHaveProperty('drift');
      expect(typeof result.drift.drift_detected).toBe('boolean');
    });
  });
});

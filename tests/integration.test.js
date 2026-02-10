/**
 * Integration tests for Towline tooling.
 *
 * Uses a fake-project fixture under tests/fixtures/fake-project/.planning/
 * to exercise towline-tools, check-roadmap-sync, check-plan-format,
 * event-logger, status-line, and log-subagent against realistic data.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'fake-project');
const SCRIPTS_DIR = path.join(__dirname, '..', 'plugins', 'dev', 'scripts');

let originalCwd;

beforeAll(() => {
  originalCwd = process.cwd();
  process.chdir(FIXTURE_DIR);
});

afterAll(() => {
  process.chdir(originalCwd);
  // Clean up any logs created during tests
  const logsDir = path.join(FIXTURE_DIR, '.planning', 'logs');
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Group 1: stateLoad
// ---------------------------------------------------------------------------
describe('stateLoad', () => {
  let stateLoad;

  beforeAll(() => {
    jest.resetModules();
    stateLoad = require('../plugins/dev/scripts/towline-tools').stateLoad;
  });

  test('returns exists: true for fixture project', () => {
    const result = stateLoad();
    expect(result.exists).toBe(true);
  });

  test('returns phase_count: 6', () => {
    const result = stateLoad();
    expect(result.phase_count).toBe(6);
  });

  test('returns current_phase: 2', () => {
    const result = stateLoad();
    expect(result.current_phase).toBe(2);
  });

  test('returns config with projectName', () => {
    const result = stateLoad();
    expect(result.config).toBeDefined();
    expect(result.config.projectName).toBe('fake-project');
  });

  test('returns roadmap with 6 phases', () => {
    const result = stateLoad();
    expect(result.roadmap).toBeDefined();
    expect(result.roadmap.phases).toHaveLength(6);
  });

  test('returns progress object', () => {
    const result = stateLoad();
    expect(result.progress).toBeDefined();
    expect(typeof result.progress.total).toBe('number');
    expect(typeof result.progress.completed).toBe('number');
    expect(typeof result.progress.percentage).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Group 2: stateCheckProgress (6 statuses)
// ---------------------------------------------------------------------------
describe('stateCheckProgress', () => {
  let stateCheckProgress;

  beforeAll(() => {
    jest.resetModules();
    stateCheckProgress = require('../plugins/dev/scripts/towline-tools').stateCheckProgress;
  });

  test('detects 6 phases', () => {
    const result = stateCheckProgress();
    expect(result.phases).toHaveLength(6);
  });

  test('phase 01-setup is verified', () => {
    const result = stateCheckProgress();
    const phase = result.phases.find(p => p.directory === '01-setup');
    expect(phase).toBeDefined();
    expect(phase.status).toBe('verified');
  });

  test('phase 02-auth is building', () => {
    const result = stateCheckProgress();
    const phase = result.phases.find(p => p.directory === '02-auth');
    expect(phase).toBeDefined();
    expect(phase.status).toBe('building');
  });

  test('phase 03-api is discussed', () => {
    const result = stateCheckProgress();
    const phase = result.phases.find(p => p.directory === '03-api');
    expect(phase).toBeDefined();
    expect(phase.status).toBe('discussed');
  });

  test('phase 04-frontend is planned', () => {
    const result = stateCheckProgress();
    const phase = result.phases.find(p => p.directory === '04-frontend');
    expect(phase).toBeDefined();
    expect(phase.status).toBe('planned');
  });

  test('phase 05-deploy is built', () => {
    const result = stateCheckProgress();
    const phase = result.phases.find(p => p.directory === '05-deploy');
    expect(phase).toBeDefined();
    expect(phase.status).toBe('built');
  });

  test('phase 06-monitoring is needs_fixes', () => {
    const result = stateCheckProgress();
    const phase = result.phases.find(p => p.directory === '06-monitoring');
    expect(phase).toBeDefined();
    expect(phase.status).toBe('needs_fixes');
  });
});

// ---------------------------------------------------------------------------
// Group 3: planIndex
// ---------------------------------------------------------------------------
describe('planIndex', () => {
  let planIndex;

  beforeAll(() => {
    jest.resetModules();
    planIndex = require('../plugins/dev/scripts/towline-tools').planIndex;
  });

  test('returns 2 plans for phase 2', () => {
    const result = planIndex('2');
    expect(result.total_plans).toBe(2);
  });

  test('organizes plans into wave_1 and wave_2', () => {
    const result = planIndex('2');
    expect(result.waves.wave_1).toBeDefined();
    expect(result.waves.wave_2).toBeDefined();
    expect(result.waves.wave_1).toContain('auth-02');
    expect(result.waves.wave_2).toContain('auth-02b');
  });

  test('detects depends_on for auth-02', () => {
    const result = planIndex('2');
    const plan = result.plans.find(p => p.plan_id === 'auth-02');
    expect(plan).toBeDefined();
    expect(plan.depends_on).toContain('setup-01');
  });

  test('detects gap_closure for auth-02b', () => {
    const result = planIndex('2');
    const plan = result.plans.find(p => p.plan_id === 'auth-02b');
    expect(plan).toBeDefined();
    expect(plan.gap_closure).toBe(true);
  });

  test('detects has_summary for auth-02 (true) and auth-02b (false)', () => {
    const result = planIndex('2');
    const plan02 = result.plans.find(p => p.plan_id === 'auth-02');
    const plan02b = result.plans.find(p => p.plan_id === 'auth-02b');
    expect(plan02.has_summary).toBe(true);
    expect(plan02b.has_summary).toBe(false);
  });

  test('counts must_haves correctly', () => {
    const result = planIndex('2');
    const plan02 = result.plans.find(p => p.plan_id === 'auth-02');
    // auth-02 has 1 truth + 1 artifact + 0 key_links = 2
    expect(plan02.must_haves_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Group 4: roadmap sync
// ---------------------------------------------------------------------------
describe('roadmap sync', () => {
  let parseState, getRoadmapPhaseStatus;

  beforeAll(() => {
    jest.resetModules();
    ({ parseState, getRoadmapPhaseStatus } = require('../plugins/dev/scripts/check-roadmap-sync'));
  });

  test('detects mismatch: STATE says built, ROADMAP says planned for phase 2', () => {
    const stateContent = fs.readFileSync(
      path.join(FIXTURE_DIR, '.planning', 'STATE.md'), 'utf8'
    );
    const roadmapContent = fs.readFileSync(
      path.join(FIXTURE_DIR, '.planning', 'ROADMAP.md'), 'utf8'
    );
    const stateInfo = parseState(stateContent);
    const roadmapStatus = getRoadmapPhaseStatus(roadmapContent, stateInfo.phase);
    expect(stateInfo.status).toBe('built');
    expect(roadmapStatus.toLowerCase()).toBe('planned');
    expect(stateInfo.status).not.toBe(roadmapStatus.toLowerCase());
  });

  test('detects match for phase 1', () => {
    const roadmapContent = fs.readFileSync(
      path.join(FIXTURE_DIR, '.planning', 'ROADMAP.md'), 'utf8'
    );
    const status = getRoadmapPhaseStatus(roadmapContent, '1');
    expect(status.toLowerCase()).toBe('verified');
  });
});

// ---------------------------------------------------------------------------
// Group 5: plan format validation
// ---------------------------------------------------------------------------
describe('plan format validation', () => {
  let validatePlan, validateSummary;

  beforeAll(() => {
    jest.resetModules();
    ({ validatePlan, validateSummary } = require('../plugins/dev/scripts/check-plan-format'));
  });

  test('valid plan passes with no issues', () => {
    const planPath = path.join(
      FIXTURE_DIR, '.planning', 'phases', '01-setup', 'setup-01-PLAN.md'
    );
    const content = fs.readFileSync(planPath, 'utf8');
    const result = validatePlan(content, planPath);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('valid summary passes (except key_files not found on disk)', () => {
    const summaryPath = path.join(
      FIXTURE_DIR, '.planning', 'phases', '01-setup', 'SUMMARY-setup-01.md'
    );
    const content = fs.readFileSync(summaryPath, 'utf8');
    const result = validateSummary(content, summaryPath);
    expect(result.errors).toHaveLength(0);
    // key_files paths won't exist on disk, so warnings are expected
  });
});

// ---------------------------------------------------------------------------
// Group 6: CLI commands
// ---------------------------------------------------------------------------
describe('CLI commands', () => {
  test('towline-tools.js state load exits 0 with valid JSON', () => {
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" state load`,
      { cwd: FIXTURE_DIR, encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.exists).toBe(true);
  });

  test('towline-tools.js bad-command exits non-zero', () => {
    expect(() => {
      execSync(
        `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" bad-command`,
        { cwd: FIXTURE_DIR, encoding: 'utf8' }
      );
    }).toThrow();
  });

  test('status-line.js with piped stdin', () => {
    const stdinData = JSON.stringify({ context_usage_fraction: 0.45 });
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'status-line.js')}"`,
      { cwd: FIXTURE_DIR, encoding: 'utf8', input: stdinData }
    );
    const parsed = JSON.parse(result);
    expect(parsed.statusLine).toContain('Towline:');
    expect(parsed.statusLine).toContain('ctx:45%');
  });

  test('log-subagent.js with piped JSON', () => {
    const stdinData = JSON.stringify({ agent_id: 'test-123', agent_type: 'researcher' });
    // Should exit 0 without error
    execSync(
      `node "${path.join(SCRIPTS_DIR, 'log-subagent.js')}" start`,
      { cwd: FIXTURE_DIR, encoding: 'utf8', input: stdinData }
    );
  });
});

// ---------------------------------------------------------------------------
// Group 7: Event logger integration
// ---------------------------------------------------------------------------
describe('event logger integration', () => {
  test('logEvent writes to .planning/logs/events.jsonl', () => {
    jest.resetModules();
    const { logEvent } = require('../plugins/dev/scripts/event-logger');
    logEvent('workflow', 'test-event', { phase: 1 });
    const logPath = path.join(FIXTURE_DIR, '.planning', 'logs', 'events.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.cat).toBe('workflow');
    expect(entry.event).toBe('test-event');
  });

  test('towline-tools.js event CLI writes event', () => {
    const detailsJson = JSON.stringify({ phase: 99 });
    execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" event workflow cli-test "${detailsJson}"`,
      { cwd: FIXTURE_DIR, encoding: 'utf8' }
    );
    const logPath = path.join(FIXTURE_DIR, '.planning', 'logs', 'events.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    expect(lastEntry.cat).toBe('workflow');
    expect(lastEntry.event).toBe('cli-test');
  });
});

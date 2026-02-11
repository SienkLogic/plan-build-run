/**
 * Integration tests for Towline tooling.
 *
 * Uses a fake-project fixture under tests/fixtures/fake-project/.planning/
 * to exercise towline-tools, check-roadmap-sync, check-plan-format,
 * event-logger, status-line, and log-subagent against realistic data.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
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
// Group 6: CLI commands (existing)
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
    // Status line outputs plain text with ANSI color codes
    expect(result).toContain('Towline');
    expect(result).toContain('45%');
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
// Group 8: frontmatter (read-only CLI + function)
// ---------------------------------------------------------------------------
describe('frontmatter', () => {
  let frontmatter;

  beforeAll(() => {
    jest.resetModules();
    frontmatter = require('../plugins/dev/scripts/towline-tools').frontmatter;
  });

  test('parses plan file frontmatter via function', () => {
    const planPath = path.join(FIXTURE_DIR, '.planning', 'phases', '02-auth', 'auth-02-PLAN.md');
    const result = frontmatter(planPath);
    expect(result.plan).toBe('auth-02');
    expect(result.phase).toBe(2);
    expect(result.wave).toBe(1);
    expect(result.type).toBe('feature');
    expect(result.must_haves).toBeDefined();
    expect(result.must_haves.truths).toContain('JWT tokens are validated');
  });

  test('returns error for nonexistent file', () => {
    const result = frontmatter('/nonexistent/file.md');
    expect(result.error).toBeDefined();
  });

  test('returns empty object for file without frontmatter', () => {
    const contextPath = path.join(FIXTURE_DIR, '.planning', 'phases', '03-api', 'CONTEXT.md');
    const result = frontmatter(contextPath);
    // CONTEXT.md may or may not have frontmatter; check it returns an object
    expect(typeof result).toBe('object');
  });

  test('CLI: frontmatter returns valid JSON', () => {
    const planPath = path.join(FIXTURE_DIR, '.planning', 'phases', '02-auth', 'auth-02-PLAN.md');
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" frontmatter "${planPath}"`,
      { cwd: FIXTURE_DIR, encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.plan).toBe('auth-02');
    expect(parsed.must_haves).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Group 9: must-haves (read-only CLI + function)
// ---------------------------------------------------------------------------
describe('mustHavesCollect', () => {
  let mustHavesCollect;

  beforeAll(() => {
    jest.resetModules();
    mustHavesCollect = require('../plugins/dev/scripts/towline-tools').mustHavesCollect;
  });

  test('collects must-haves from phase 2 (2 plans)', () => {
    const result = mustHavesCollect('2');
    expect(result.phase).toBe('02-auth');
    expect(result.plans['auth-02']).toBeDefined();
    expect(result.plans['auth-02b']).toBeDefined();
  });

  test('deduplicates across plans in all list', () => {
    const result = mustHavesCollect('2');
    expect(result.all.truths).toContain('JWT tokens are validated');
    expect(result.all.truths).toContain('Token refresh works');
    expect(result.total).toBe(3); // 2 truths + 1 artifact from auth-02
  });

  test('returns error for nonexistent phase', () => {
    const result = mustHavesCollect('99');
    expect(result.error).toBeDefined();
  });

  test('returns per-plan must_haves', () => {
    const result = mustHavesCollect('2');
    expect(result.plans['auth-02'].truths).toContain('JWT tokens are validated');
    expect(result.plans['auth-02'].artifacts).toContain('Auth middleware exists');
    expect(result.plans['auth-02b'].truths).toContain('Token refresh works');
  });

  test('CLI: must-haves returns valid JSON', () => {
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" must-haves 2`,
      { cwd: FIXTURE_DIR, encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.phase).toBe('02-auth');
    expect(parsed.total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Group 10: phase-info (read-only CLI + function)
// ---------------------------------------------------------------------------
describe('phaseInfo', () => {
  let phaseInfo;

  beforeAll(() => {
    jest.resetModules();
    phaseInfo = require('../plugins/dev/scripts/towline-tools').phaseInfo;
  });

  test('returns comprehensive info for phase 2', () => {
    const result = phaseInfo('2');
    expect(result.phase).toBe('02-auth');
    expect(result.name).toBe('Auth');
    expect(result.goal).toBe('Authentication system');
    expect(result.roadmap_status).toBe('planned');
    expect(result.filesystem_status).toBe('building');
    expect(result.plan_count).toBe(2);
  });

  test('includes summaries with status', () => {
    const result = phaseInfo('2');
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].status).toBe('complete');
  });

  test('detects verification for phase 1', () => {
    const result = phaseInfo('1');
    expect(result.verification).toBeDefined();
    expect(result.verification.status).toBe('passed');
    expect(result.filesystem_status).toBe('verified');
  });

  test('detects CONTEXT.md for phase 3', () => {
    const result = phaseInfo('3');
    expect(result.has_context).toBe(true);
  });

  test('returns error for nonexistent phase', () => {
    const result = phaseInfo('99');
    expect(result.error).toBeDefined();
  });

  test('CLI: phase-info returns valid JSON', () => {
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" phase-info 2`,
      { cwd: FIXTURE_DIR, encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.phase).toBe('02-auth');
    expect(parsed.plan_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Group 11: state update (mutation — uses temp copies)
// ---------------------------------------------------------------------------
describe('state update', () => {
  let tmpDir;

  beforeAll(() => {
    // Create temp dir with .planning/STATE.md
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-state-'));
    const planDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURE_DIR, '.planning', 'STATE.md'),
      path.join(planDir, 'STATE.md')
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset STATE.md before each test
    fs.copyFileSync(
      path.join(FIXTURE_DIR, '.planning', 'STATE.md'),
      path.join(tmpDir, '.planning', 'STATE.md')
    );
  });

  test('updates status field via function', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
    const { stateUpdate: su } = require('../plugins/dev/scripts/towline-tools');
    const result = su('status', 'building');
    process.chdir(origCwd);
    expect(result.success).toBe(true);
    expect(result.field).toBe('status');
    expect(result.value).toBe('building');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('Status: building');
  });

  test('updates current_phase field', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
    const { stateUpdate: su } = require('../plugins/dev/scripts/towline-tools');
    const result = su('current_phase', '3');
    process.chdir(origCwd);
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('Phase: 3 of 6');
  });

  test('rejects invalid field', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
    const { stateUpdate: su } = require('../plugins/dev/scripts/towline-tools');
    const result = su('invalid_field', 'value');
    process.chdir(origCwd);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid field');
  });

  test('CLI: state update status building', () => {
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" state update status building`,
      { cwd: tmpDir, encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('Status: building');
  });
});

// ---------------------------------------------------------------------------
// Group 12: roadmap update-status (mutation — uses temp copies)
// ---------------------------------------------------------------------------
describe('roadmap update-status', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-roadmap-'));
    const planDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.copyFileSync(
      path.join(FIXTURE_DIR, '.planning', 'ROADMAP.md'),
      path.join(tmpDir, '.planning', 'ROADMAP.md')
    );
  });

  test('updates phase 2 status via function', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
    const { roadmapUpdateStatus } = require('../plugins/dev/scripts/towline-tools');
    const result = roadmapUpdateStatus('2', 'building');
    process.chdir(origCwd);
    expect(result.success).toBe(true);
    expect(result.old_status).toBe('planned');
    expect(result.new_status).toBe('building');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf8');
    const row = content.split('\n').find(l => l.includes('| 02 |'));
    expect(row).toContain('building');
  });

  test('returns error for nonexistent phase', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
    const { roadmapUpdateStatus } = require('../plugins/dev/scripts/towline-tools');
    const result = roadmapUpdateStatus('99', 'building');
    process.chdir(origCwd);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('CLI: roadmap update-status 2 building', () => {
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" roadmap update-status 2 building`,
      { cwd: tmpDir, encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.old_status).toBe('planned');
    expect(parsed.new_status).toBe('building');
  });
});

// ---------------------------------------------------------------------------
// Group 13: roadmap update-plans (mutation — uses temp copies)
// ---------------------------------------------------------------------------
describe('roadmap update-plans', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-roadmap-p-'));
    const planDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.copyFileSync(
      path.join(FIXTURE_DIR, '.planning', 'ROADMAP.md'),
      path.join(tmpDir, '.planning', 'ROADMAP.md')
    );
  });

  test('updates phase 2 plans via function', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
    const { roadmapUpdatePlans } = require('../plugins/dev/scripts/towline-tools');
    const result = roadmapUpdatePlans('2', '1', '2');
    process.chdir(origCwd);
    expect(result.success).toBe(true);
    expect(result.old_plans).toBe('2');
    expect(result.new_plans).toBe('1/2');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf8');
    const row = content.split('\n').find(l => l.includes('| 02 |'));
    expect(row).toContain('1/2');
  });

  test('returns error for nonexistent phase', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
    const { roadmapUpdatePlans } = require('../plugins/dev/scripts/towline-tools');
    const result = roadmapUpdatePlans('99', '1', '2');
    process.chdir(origCwd);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('CLI: roadmap update-plans 2 1 2', () => {
    const result = execSync(
      `node "${path.join(SCRIPTS_DIR, 'towline-tools.js')}" roadmap update-plans 2 1 2`,
      { cwd: tmpDir, encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.new_plans).toBe('1/2');
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

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  checkSkillArgs,
  suggestSkill,
  validatePhaseExists,
  PLAN_VALID_PATTERN,
  ROUTE_PATTERNS,
  PHASE_SKILLS
} = require('../plugins/pbr/scripts/validate-skill-args');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-vsa-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  process.env.PBR_PROJECT_ROOT = tmpDir;
});

afterEach(() => {
  delete process.env.PBR_PROJECT_ROOT;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PLAN_VALID_PATTERN', () => {
  test('matches empty string', async () => {
    expect(PLAN_VALID_PATTERN.test('')).toBe(true);
  });

  test('matches phase number', async () => {
    expect(PLAN_VALID_PATTERN.test('3')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('03')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('3.1')).toBe(true);
  });

  test('matches phase number with flags', async () => {
    expect(PLAN_VALID_PATTERN.test('3 --skip-research')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('3 --assumptions')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('3 --gaps')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('3 --teams')).toBe(true);
  });

  test('matches subcommands', async () => {
    expect(PLAN_VALID_PATTERN.test('add')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('check')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('insert 3')).toBe(true);
    expect(PLAN_VALID_PATTERN.test('remove 5')).toBe(true);
  });

  test('does not match freeform text', async () => {
    expect(PLAN_VALID_PATTERN.test('fix the login bug')).toBe(false);
    expect(PLAN_VALID_PATTERN.test('add user authentication')).toBe(false);
  });
});

describe('suggestSkill', () => {
  test('suggests /pbr:debug for bug-related text', async () => {
    expect(suggestSkill('fix the login bug').skill).toBe('/pbr:debug');
    expect(suggestSkill('debug the crash').skill).toBe('/pbr:debug');
    expect(suggestSkill('diagnose failing tests').skill).toBe('/pbr:debug');
    expect(suggestSkill('investigate error in auth').skill).toBe('/pbr:debug');
    expect(suggestSkill('stack trace analysis').skill).toBe('/pbr:debug');
    expect(suggestSkill('regression in signup').skill).toBe('/pbr:debug');
  });

  test('suggests /pbr:explore for research-related text', async () => {
    expect(suggestSkill('explore the codebase').skill).toBe('/pbr:explore');
    expect(suggestSkill('research authentication options').skill).toBe('/pbr:explore');
    expect(suggestSkill('how does the auth middleware work').skill).toBe('/pbr:explore');
    expect(suggestSkill('analyse trade-offs between approaches').skill).toBe('/pbr:explore');
    expect(suggestSkill('evaluate different approaches').skill).toBe('/pbr:explore');
    expect(suggestSkill('compare pros and cons').skill).toBe('/pbr:explore');
  });

  test('suggests /pbr:plan-phase add for complex tasks', async () => {
    expect(suggestSkill('refactor the entire auth system').skill).toBe('/pbr:plan-phase add');
    expect(suggestSkill('migrate database to PostgreSQL').skill).toBe('/pbr:plan-phase add');
    expect(suggestSkill('redesign the API architecture').skill).toBe('/pbr:plan-phase add');
  });

  test('suggests /pbr:quick for simple actionable text', async () => {
    expect(suggestSkill('add a button to the form').skill).toBe('/pbr:quick');
    expect(suggestSkill('update the README').skill).toBe('/pbr:quick');
  });
});

describe('validatePhaseExists', () => {
  test('returns null when no ROADMAP.md', async () => {
    expect(validatePhaseExists(1)).toBeNull();
  });

  test('returns null when phase exists in roadmap', async () => {
    const roadmap = '| 01 | Foundation | 01-01 | Planned |\n| 02 | Auth | 02-01 | Planned |';
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    expect(validatePhaseExists(1)).toBeNull();
    expect(validatePhaseExists(2)).toBeNull();
  });

  test('returns warning when phase not found', async () => {
    const roadmap = '| 01 | Foundation | 01-01 | Planned |\n| 02 | Auth | 02-01 | Planned |';
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const result = validatePhaseExists(5);
    expect(result).toContain('Phase 5 not found');
    expect(result).toContain('Valid phases');
  });

  test('matches phase heading format', async () => {
    const roadmap = '## Phase 3 - Dashboard';
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    expect(validatePhaseExists(3)).toBeNull();
  });

  test('matches slug format (NN-name)', async () => {
    const roadmap = 'See 03-dashboard for details';
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    expect(validatePhaseExists(3)).toBeNull();
  });
});

describe('checkSkillArgs', () => {
  test('returns null for non-plan skills', async () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:build', args: 'anything' } })).toBeNull();
  });

  test('returns null for valid plan args', async () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: '3' } })).toBeNull();
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: '' } })).toBeNull();
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'add' } })).toBeNull();
  });

  test('blocks freeform text for plan skill', async () => {
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'fix the login bug' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('/pbr:plan-phase');
  });

  test('includes skill suggestion in block reason', async () => {
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'debug the crash in auth' } });
    expect(result.output.reason).toContain('/pbr:debug');
  });

  test('truncates long args in block reason', async () => {
    const longArgs = 'x'.repeat(200);
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: longArgs } });
    expect(result.output.reason).toContain('...');
  });

  test('blocks invalid phase number for phase skills', async () => {
    const roadmap = '| 01 | Foundation | 01-01 | Planned |';
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:execute-phase', args: '99' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.reason).toContain('Phase 99 not found');
  });

  test('passes valid phase number for phase skills', async () => {
    const roadmap = '| 01 | Foundation | 01-01 | Planned |';
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:execute-phase', args: '1' } });
    expect(result).toBeNull();
  });

  test('handles skill name without pbr: prefix', async () => {
    const roadmap = '| 01 | Foundation | 01-01 | Planned |';
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const result = checkSkillArgs({ tool_input: { skill: 'plan-phase', args: '99' } });
    expect(result).not.toBeNull();
  });

  test('all PHASE_SKILLS are recognized', async () => {
    expect(PHASE_SKILLS.size).toBeGreaterThan(0);
    expect(PHASE_SKILLS.has('pbr:plan-phase')).toBe(true);
    expect(PHASE_SKILLS.has('pbr:execute-phase')).toBe(true);
    expect(PHASE_SKILLS.has('pbr:discuss-phase')).toBe(true);
  });
});

describe('ROUTE_PATTERNS', () => {
  test('has at least 4 patterns', async () => {
    expect(ROUTE_PATTERNS.length).toBeGreaterThanOrEqual(4);
  });

  test('last pattern is catch-all', async () => {
    const last = ROUTE_PATTERNS[ROUTE_PATTERNS.length - 1];
    expect(last.pattern.test('anything')).toBe(true);
    expect(last.skill).toBe('/pbr:quick');
  });
});

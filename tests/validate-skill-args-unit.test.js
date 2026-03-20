// Consolidated from validate-skill-args.test.js + validate-skill-args-unit.test.js
'use strict';

const { checkSkillArgs, suggestSkill, PLAN_VALID_PATTERN } = require('../plugins/pbr/scripts/validate-skill-args');

describe('checkSkillArgs branch coverage', () => {
  test('returns null for non-plan skills', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:build', args: 'anything' } })).toBeNull();
  });

  test('returns null for empty args', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: '' } })).toBeNull();
  });

  test('returns null for phase number', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: '3' } })).toBeNull();
  });

  test('returns null for phase number with flag', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: '3 --skip-research' } })).toBeNull();
  });

  test('returns null for subcommand add', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'add' } })).toBeNull();
  });

  test('returns null for insert subcommand', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'insert 3' } })).toBeNull();
  });

  test('returns null for remove subcommand', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'remove 2' } })).toBeNull();
  });

  test('blocks freeform text', () => {
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'fix the login bug' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.reason).toContain('BLOCKED');
  });

  test('truncates long args in output', () => {
    const longArgs = 'a'.repeat(100);
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: longArgs } });
    expect(result.output.reason).toContain('...');
  });

  test('handles missing tool_input', () => {
    expect(checkSkillArgs({ tool_input: {} })).toBeNull();
  });

  test('handles missing args field', () => {
    expect(checkSkillArgs({ tool_input: { skill: 'pbr:plan' } })).toBeNull();
  });

  test('includes skill suggestion in block message', () => {
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: 'fix the bug in login' } });
    expect(result.output.reason).toContain('/pbr:debug');
    expect(result.output.reason).toContain('/pbr:do');
  });

  test('blocks freeform text with phase-like prefix', () => {
    const result = checkSkillArgs({ tool_input: { skill: 'pbr:plan', args: '3 some extra text here' } });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });
});

describe('suggestSkill routing', () => {
  test('routes bug-related text to debug', () => {
    const r = suggestSkill('fix the login bug');
    expect(r.skill).toBe('/pbr:debug');
  });

  test('routes explore-related text to explore', () => {
    const r = suggestSkill('how does the auth system work');
    expect(r.skill).toBe('/pbr:explore');
  });

  test('routes complex task to plan add', () => {
    const r = suggestSkill('refactor the entire database layer');
    expect(r.skill).toBe('/pbr:plan-phase add');
  });

  test('routes generic text to quick', () => {
    const r = suggestSkill('add a button to the navbar');
    expect(r.skill).toBe('/pbr:quick');
  });

  test('routes crash text to debug', () => {
    expect(suggestSkill('app crashes on startup').skill).toBe('/pbr:debug');
  });

  test('routes research text to explore', () => {
    expect(suggestSkill('evaluate different approaches').skill).toBe('/pbr:explore');
  });

  test('routes migrate text to plan add', () => {
    expect(suggestSkill('migrate to new infrastructure').skill).toBe('/pbr:plan-phase add');
  });

  test('returns a reason with every suggestion', () => {
    const result = suggestSkill('fix the bug');
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });

  test.each([
    ['there is an error in the login flow', '/pbr:debug'],
    ['investigate the failing test', '/pbr:debug'],
    ['debug the stack trace', '/pbr:debug'],
  ])('routes additional debug text: "%s" -> %s', (text, expected) => {
    expect(suggestSkill(text).skill).toBe(expected);
  });

  test.each([
    ['research caching strategies', '/pbr:explore'],
    ['what is the best approach for this', '/pbr:explore'],
    ['compare React vs Vue for the frontend', '/pbr:explore'],
  ])('routes additional explore text: "%s" -> %s', (text, expected) => {
    expect(suggestSkill(text).skill).toBe(expected);
  });

  test.each([
    ['migrate the database to PostgreSQL', '/pbr:plan-phase add'],
    ['redesign the API architecture', '/pbr:plan-phase add'],
    ['restructure the project layout', '/pbr:plan-phase add'],
  ])('routes additional complex text: "%s" -> %s', (text, expected) => {
    expect(suggestSkill(text).skill).toBe(expected);
  });

  test.each([
    ['update the readme', '/pbr:quick'],
    ['write a test for the parser', '/pbr:quick'],
    ['change the background color to blue', '/pbr:quick'],
  ])('routes additional simple text: "%s" -> %s', (text, expected) => {
    expect(suggestSkill(text).skill).toBe(expected);
  });
});

describe('PLAN_VALID_PATTERN', () => {
  const valid = [
    '', '  ', '3', '03', '3.1',
    '3 --skip-research', '3 --assumptions', '3 --gaps', '3 --teams',
    '3 --skip-research --gaps',
    'add', 'check', 'insert 3', 'insert 3.1', 'remove 3', 'remove 03',
  ];

  test.each(valid)('accepts valid pattern: "%s"', (input) => {
    expect(PLAN_VALID_PATTERN.test(input)).toBe(true);
  });

  const invalid = [
    'Two things. 1. We should update the dashboard',
    'Add a login page',
    'fix the bug in checkout',
    'hello world',
    '3 some extra text',
    'plan phase 3',
    'delete 3',
  ];

  test.each(invalid)('rejects freeform text: "%s"', (input) => {
    expect(PLAN_VALID_PATTERN.test(input)).toBe(false);
  });

  test('matches multiple flags', () => {
    expect(PLAN_VALID_PATTERN.test('3 --assumptions --gaps')).toBe(true);
  });
});

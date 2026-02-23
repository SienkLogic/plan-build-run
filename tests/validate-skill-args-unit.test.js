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
    expect(r.skill).toBe('/pbr:plan add');
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
    expect(suggestSkill('migrate to new infrastructure').skill).toBe('/pbr:plan add');
  });
});

describe('PLAN_VALID_PATTERN edge cases', () => {
  test('matches check subcommand', () => {
    expect(PLAN_VALID_PATTERN.test('check')).toBe(true);
  });

  test('matches phase with decimal', () => {
    expect(PLAN_VALID_PATTERN.test('3.1')).toBe(true);
  });

  test('matches multiple flags', () => {
    expect(PLAN_VALID_PATTERN.test('3 --assumptions --gaps')).toBe(true);
  });

  test('rejects invalid subcommand', () => {
    expect(PLAN_VALID_PATTERN.test('delete 3')).toBe(false);
  });
});

'use strict';

const { checkSkillArgs, suggestSkill, PLAN_VALID_PATTERN } = require('../plugins/pbr/scripts/validate-skill-args');

describe('validate-skill-args', () => {
  describe('PLAN_VALID_PATTERN', () => {
    const valid = [
      '',
      '  ',
      '3',
      '03',
      '3.1',
      '3 --skip-research',
      '3 --assumptions',
      '3 --gaps',
      '3 --teams',
      '3 --skip-research --gaps',
      'add',
      'check',
      'insert 3',
      'insert 3.1',
      'remove 3',
      'remove 03',
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
    ];

    test.each(invalid)('rejects freeform text: "%s"', (input) => {
      expect(PLAN_VALID_PATTERN.test(input)).toBe(false);
    });
  });

  describe('suggestSkill', () => {
    test.each([
      ['fix the bug in checkout', '/pbr:debug'],
      ['there is an error in the login flow', '/pbr:debug'],
      ['the app crashes on startup', '/pbr:debug'],
      ['investigate the failing test', '/pbr:debug'],
      ['debug the stack trace', '/pbr:debug'],
    ])('routes debug text: "%s" → %s', (text, expected) => {
      expect(suggestSkill(text).skill).toBe(expected);
    });

    test.each([
      ['explore how the auth system works', '/pbr:explore'],
      ['research caching strategies', '/pbr:explore'],
      ['what is the best approach for this', '/pbr:explore'],
      ['compare React vs Vue for the frontend', '/pbr:explore'],
    ])('routes explore text: "%s" → %s', (text, expected) => {
      expect(suggestSkill(text).skill).toBe(expected);
    });

    test.each([
      ['refactor the entire auth module', '/pbr:plan add'],
      ['migrate the database to PostgreSQL', '/pbr:plan add'],
      ['redesign the API architecture', '/pbr:plan add'],
      ['restructure the project layout', '/pbr:plan add'],
    ])('routes complex text: "%s" → %s', (text, expected) => {
      expect(suggestSkill(text).skill).toBe(expected);
    });

    test.each([
      ['add a logout button', '/pbr:quick'],
      ['update the readme', '/pbr:quick'],
      ['write a test for the parser', '/pbr:quick'],
      ['change the background color to blue', '/pbr:quick'],
    ])('routes simple text: "%s" → %s', (text, expected) => {
      expect(suggestSkill(text).skill).toBe(expected);
    });

    test('returns a reason with every suggestion', () => {
      const result = suggestSkill('fix the bug');
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });
  });

  describe('checkSkillArgs', () => {
    test('returns null for non-plan skills', () => {
      const data = { tool_input: { skill: 'pbr:build', args: 'anything here' } };
      expect(checkSkillArgs(data)).toBeNull();
    });

    test('returns null for valid plan args', () => {
      const data = { tool_input: { skill: 'pbr:plan', args: '3' } };
      expect(checkSkillArgs(data)).toBeNull();
    });

    test('returns null for empty plan args', () => {
      const data = { tool_input: { skill: 'pbr:plan', args: '' } };
      expect(checkSkillArgs(data)).toBeNull();
    });

    test('returns null when args is missing', () => {
      const data = { tool_input: { skill: 'pbr:plan' } };
      expect(checkSkillArgs(data)).toBeNull();
    });

    test('blocks freeform text with exit code 2', () => {
      const data = { tool_input: { skill: 'pbr:plan', args: 'Two things we should do' } };
      const result = checkSkillArgs(data);
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      expect(result.output.reason).toContain('BLOCKED');
    });

    test('includes skill suggestion in block message', () => {
      const data = { tool_input: { skill: 'pbr:plan', args: 'fix the bug in login' } };
      const result = checkSkillArgs(data);
      expect(result.output.reason).toContain('/pbr:debug');
      expect(result.output.reason).toContain('/pbr:do');
    });

    test('blocks freeform text with phase-like prefix', () => {
      const data = { tool_input: { skill: 'pbr:plan', args: '3 some extra text here' } };
      const result = checkSkillArgs(data);
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
    });

    test('truncates long args in block message', () => {
      const longArgs = 'a'.repeat(120);
      const data = { tool_input: { skill: 'pbr:plan', args: longArgs } };
      const result = checkSkillArgs(data);
      expect(result.output.reason).toContain('...');
    });
  });
});

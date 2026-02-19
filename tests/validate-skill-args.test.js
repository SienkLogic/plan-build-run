'use strict';

const { checkSkillArgs, PLAN_VALID_PATTERN } = require('../plugins/pbr/scripts/validate-skill-args');

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
      expect(result.output.additionalContext).toContain('BLOCKED');
      expect(result.output.additionalContext).toContain('/pbr:quick');
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
      expect(result.output.additionalContext).toContain('...');
    });
  });
});

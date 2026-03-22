'use strict';

// Mock modules BEFORE requiring the dispatch script
jest.mock('../plugins/pbr/scripts/enforce-context-budget', () => ({
  checkBudget: jest.fn(() => null)
}));

jest.mock('../plugins/pbr/scripts/hook-logger', () => ({
  logHook: jest.fn()
}));

jest.mock('../plugins/pbr/scripts/validate-skill-args', () => ({
  checkSkillArgs: jest.fn(() => null)
}));

const { processEvent, handleHttp } = require('../plugins/pbr/scripts/pre-skill-dispatch');
const { checkBudget } = require('../plugins/pbr/scripts/enforce-context-budget');
const { checkSkillArgs } = require('../plugins/pbr/scripts/validate-skill-args');
const { logHook } = require('../plugins/pbr/scripts/hook-logger');

describe('pre-skill-dispatch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    checkBudget.mockReturnValue(null);
    checkSkillArgs.mockReturnValue(null);
  });

  const baseData = {
    cwd: '/tmp/test-project',
    tool_input: { skill: 'pbr:build', args: '3' }
  };

  describe('processEvent', () => {
    test('budget block short-circuits before checkSkillArgs', async () => {
      const blockResult = { decision: 'block', reason: 'budget exceeded' };
      checkBudget.mockReturnValue(blockResult);

      const result = await processEvent(baseData);

      expect(result).toEqual(blockResult);
      expect(checkSkillArgs).not.toHaveBeenCalled();
      expect(logHook).toHaveBeenCalledWith(
        'pre-skill-dispatch', 'PreToolUse', 'blocked',
        expect.objectContaining({ handler: 'enforce-context-budget' })
      );
    });

    test('budget allows, skill args block', async () => {
      checkBudget.mockReturnValue(null);
      checkSkillArgs.mockReturnValue({
        exitCode: 2,
        output: { decision: 'block', reason: 'BLOCKED: freeform text' }
      });

      const result = await processEvent(baseData);

      expect(result).toEqual({ decision: 'block', reason: 'BLOCKED: freeform text' });
      expect(logHook).toHaveBeenCalledWith(
        'pre-skill-dispatch', 'PreToolUse', 'blocked',
        expect.objectContaining({ handler: 'validate-skill-args' })
      );
    });

    test('all pass returns allow', async () => {
      const result = await processEvent(baseData);

      expect(result).toEqual({ decision: 'allow' });
      expect(logHook).toHaveBeenCalledWith(
        'pre-skill-dispatch', 'PreToolUse', 'allow', {}
      );
    });

    test('advisory from skill args propagates', async () => {
      checkSkillArgs.mockReturnValue({
        exitCode: 0,
        output: { decision: 'allow', additionalContext: 'Phase 99 not found in ROADMAP.md' }
      });

      const result = await processEvent(baseData);

      expect(result.decision).toBe('allow');
      expect(result.additionalContext).toBe('Phase 99 not found in ROADMAP.md');
      expect(logHook).toHaveBeenCalledWith(
        'pre-skill-dispatch', 'PreToolUse', 'warn',
        expect.objectContaining({ handler: 'validate-skill-args' })
      );
    });

    test('skill args with output but no exitCode 2 is advisory', async () => {
      checkSkillArgs.mockReturnValue({
        exitCode: 0,
        output: { additionalContext: 'some advisory' }
      });

      const result = await processEvent(baseData);

      expect(result).toEqual({ additionalContext: 'some advisory' });
    });
  });

  describe('handleHttp', () => {
    test('wraps processEvent correctly', async () => {
      const result = await handleHttp({ data: baseData }, {});

      expect(result).toEqual({ decision: 'allow' });
    });

    test('returns null on thrown error', async () => {
      checkBudget.mockImplementation(() => { throw new Error('boom'); });

      const result = await handleHttp({ data: baseData }, {});

      expect(result).toBeNull();
    });

    test('handles missing data in reqBody', async () => {
      const result = await handleHttp({}, {});

      expect(result).toBeTruthy();
      expect(result.decision).toBeDefined();
    });
  });
});

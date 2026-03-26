'use strict';

// Mock modules BEFORE requiring the dispatch script
jest.mock('../plugins/pbr/scripts/enforce-context-budget', () => ({
  checkBudget: jest.fn(() => null)
}));

jest.mock('../plugins/pbr/scripts/hook-logger', () => ({
  logHook: jest.fn()
}));

// Mock all gate modules
jest.mock('../plugins/pbr/scripts/lib/gates/quick-executor', () => ({
  checkQuickExecutorGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/build-executor', () => ({
  checkBuildExecutorGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/plan-executor', () => ({
  checkPlanExecutorGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/review-planner', () => ({
  checkReviewPlannerGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/review-verifier', () => ({
  checkReviewVerifierGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/milestone-complete', () => ({
  checkMilestoneCompleteGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/milestone-summary', () => ({
  checkMilestoneSummaryGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/build-dependency', () => ({
  checkBuildDependencyGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/plan-validation', () => ({
  checkPlanValidationGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/advisories', () => ({
  checkDebuggerAdvisory: jest.fn(() => null),
  checkCheckpointManifest: jest.fn(() => null),
  checkActiveSkillIntegrity: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/doc-existence', () => ({
  checkDocExistence: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/lib/gates/user-confirmation', () => ({
  checkUserConfirmationGate: jest.fn(() => null)
}));
jest.mock('../plugins/pbr/scripts/enforce-pbr-workflow', () => ({
  checkNonPbrAgent: jest.fn(() => null)
}));


const { processEvent, handleHttp } = require('../plugins/pbr/scripts/pre-task-dispatch');
const { checkBudget } = require('../plugins/pbr/scripts/enforce-context-budget');
const { checkQuickExecutorGate } = require('../plugins/pbr/scripts/lib/gates/quick-executor');
const { checkBuildExecutorGate } = require('../plugins/pbr/scripts/lib/gates/build-executor');
const { checkDebuggerAdvisory, checkCheckpointManifest, checkActiveSkillIntegrity } = require('../plugins/pbr/scripts/lib/gates/advisories');
const { logHook } = require('../plugins/pbr/scripts/hook-logger');

describe('pre-task-dispatch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Restore default return values after reset
    checkBudget.mockReturnValue(null);
    checkQuickExecutorGate.mockReturnValue(null);
    checkBuildExecutorGate.mockReturnValue(null);
    checkCheckpointManifest.mockReturnValue(null);
    checkDebuggerAdvisory.mockReturnValue(null);
    checkActiveSkillIntegrity.mockReturnValue(null);
  });

  const baseData = {
    cwd: '/tmp/test-project',
    tool_input: { description: 'Test task', subagent_type: 'pbr:executor' }
  };

  describe('processEvent', () => {
    test('budget block short-circuits before gate checks', async () => {
      const blockResult = { decision: 'block', reason: 'budget exceeded' };
      checkBudget.mockReturnValue(blockResult);

      const result = await processEvent(baseData);

      expect(result).toEqual(blockResult);
      // Gates should NOT have been called
      expect(checkQuickExecutorGate).not.toHaveBeenCalled();
      expect(checkBuildExecutorGate).not.toHaveBeenCalled();
      expect(logHook).toHaveBeenCalledWith(
        'pre-task-dispatch', 'PreToolUse', 'blocked',
        expect.objectContaining({ handler: 'enforce-context-budget' })
      );
    });

    test('budget allows, gate blocks', async () => {
      checkBudget.mockReturnValue(null);
      checkQuickExecutorGate.mockReturnValue({ block: true, reason: 'not a quick executor' });

      const result = await processEvent(baseData);

      expect(result).toEqual({ decision: 'block', reason: 'not a quick executor' });
      expect(logHook).toHaveBeenCalledWith(
        'pre-task-dispatch', 'PreToolUse', 'blocked',
        expect.objectContaining({ handler: 'quick-executor' })
      );
    });

    test('all checks pass returns allow', async () => {
      checkBudget.mockReturnValue(null);

      const result = await processEvent(baseData);

      expect(result).toEqual({ decision: 'allow' });
      expect(logHook).toHaveBeenCalledWith(
        'pre-task-dispatch', 'PreToolUse', 'allow', {}
      );
    });

    test('advisory warnings collected in additionalContext', async () => {
      checkBudget.mockReturnValue(null);
      checkCheckpointManifest.mockReturnValue('checkpoint manifest warning');
      checkDebuggerAdvisory.mockReturnValue('debugger advisory note');

      const result = await processEvent(baseData);

      expect(result.decision).toBe('allow');
      expect(result.additionalContext).toContain('checkpoint manifest warning');
      expect(result.additionalContext).toContain('debugger advisory note');
      expect(logHook).toHaveBeenCalledWith(
        'pre-task-dispatch', 'PreToolUse', 'warn',
        expect.objectContaining({ warning: expect.any(String) })
      );
    });

    test('build executor gate block returns block result', async () => {
      checkBudget.mockReturnValue(null);
      checkBuildExecutorGate.mockReturnValue({ block: true, reason: 'plan mismatch' });

      const result = await processEvent(baseData);

      expect(result).toEqual({ decision: 'block', reason: 'plan mismatch' });
    });

    test('active skill integrity warning is collected', async () => {
      checkBudget.mockReturnValue(null);
      checkActiveSkillIntegrity.mockReturnValue('skill integrity issue');

      const result = await processEvent(baseData);

      expect(result.decision).toBe('allow');
      expect(result.additionalContext).toContain('skill integrity issue');
    });
  });

  describe('handleHttp', () => {
    test('wraps processEvent with reqBody.data', async () => {
      checkBudget.mockReturnValue(null);

      const result = await handleHttp({ data: baseData }, {});

      expect(result).toEqual({ decision: 'allow' });
    });

    test('returns null on thrown error', async () => {
      checkBudget.mockImplementation(() => { throw new Error('boom'); });

      const result = await handleHttp({ data: baseData }, {});

      expect(result).toBeNull();
    });

    test('handles missing data gracefully', async () => {
      checkBudget.mockReturnValue(null);

      const result = await handleHttp({}, {});

      // Should still work with empty data
      expect(result).toBeTruthy();
      expect(result.decision).toBeDefined();
    });
  });
});

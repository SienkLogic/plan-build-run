/**
 * tests/hypothesis-runner.test.js — Tests for HypothesisRunner competing approaches module.
 */

describe('HypothesisRunner', () => {
  let HypothesisRunner;

  beforeAll(() => {
    HypothesisRunner = require('../plan-build-run/bin/lib/hypothesis-runner.cjs').HypothesisRunner;
  });

  test('runHypotheses returns early when features.competing_hypotheses is false', () => {
    const hr = new HypothesisRunner({
      config: { features: { competing_hypotheses: false } }
    });
    const result = hr.runHypotheses({
      hypotheses: [{ name: 'a', prompt: 'test' }],
      planId: '13-02',
      baseAgent: 'executor'
    });
    expect(result).toEqual({ skipped: true, reason: 'competing_hypotheses disabled' });
  });

  test('runHypotheses creates task definitions for each hypothesis', () => {
    const hr = new HypothesisRunner({
      config: { features: { competing_hypotheses: true, agent_teams: true } }
    });
    const result = hr.runHypotheses({
      hypotheses: [
        { name: 'approach-a', prompt: 'Use pattern A' },
        { name: 'approach-b', prompt: 'Use pattern B' }
      ],
      planId: '13-02',
      baseAgent: 'executor'
    });
    expect(result.skipped).toBe(false);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]).toMatchObject({
      agentType: 'executor',
      isolation: 'worktree',
      hypothesisName: 'approach-a',
      context: 'Use pattern A'
    });
    expect(result.tasks[1]).toMatchObject({
      agentType: 'executor',
      isolation: 'worktree',
      hypothesisName: 'approach-b',
      context: 'Use pattern B'
    });
  });

  test('runHypotheses caps at 3 hypotheses', () => {
    const hr = new HypothesisRunner({
      config: { features: { competing_hypotheses: true, agent_teams: true } }
    });
    const result = hr.runHypotheses({
      hypotheses: [
        { name: 'a', prompt: '1' },
        { name: 'b', prompt: '2' },
        { name: 'c', prompt: '3' },
        { name: 'd', prompt: '4' },
        { name: 'e', prompt: '5' }
      ],
      planId: '13-02',
      baseAgent: 'executor'
    });
    expect(result.tasks).toHaveLength(3);
    expect(result.warning).toMatch(/Capped to 3 hypotheses/);
  });

  test('compareResults selects hypothesis with highest score', () => {
    const hr = new HypothesisRunner({
      config: { features: { competing_hypotheses: true } }
    });
    const result = hr.compareResults([
      { name: 'approach-a', testsPassed: 3, testsTotal: 5, filesModified: ['a.js', 'b.js'], status: 'success' },
      { name: 'approach-b', testsPassed: 5, testsTotal: 5, filesModified: ['c.js'], status: 'success' }
    ]);
    expect(result.winner.name).toBe('approach-b');
  });

  test('compareResults handles tie by preferring fewer files modified', () => {
    const hr = new HypothesisRunner({
      config: { features: { competing_hypotheses: true } }
    });
    const result = hr.compareResults([
      { name: 'approach-a', testsPassed: 5, testsTotal: 5, filesModified: ['a.js', 'b.js', 'c.js'], status: 'success' },
      { name: 'approach-b', testsPassed: 5, testsTotal: 5, filesModified: ['d.js'], status: 'success' }
    ]);
    expect(result.winner.name).toBe('approach-b');
  });
});

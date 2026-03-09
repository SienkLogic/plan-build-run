'use strict';

/**
 * Local LLM router stub tests.
 *
 * The full router implementation (scoreComplexity, extractConfidence, route)
 * is deferred to v3 (ADV-01). These tests verify that the stub module
 * structure is loadable and that operation stubs can be called without
 * crashing, simulating the router's role as a pass-through.
 *
 * In the full implementation, the router would:
 * - Score prompt complexity
 * - Route to local vs. frontier LLM based on strategy
 * - Extract confidence from logprobs
 *
 * In the stub, operations just return default responses.
 */

const { classifyArtifact } = require('../plan-build-run/bin/lib/local-llm/operations/classify-artifact.cjs');
const { validateTask } = require('../plan-build-run/bin/lib/local-llm/operations/validate-task.cjs');
const { classifyError } = require('../plan-build-run/bin/lib/local-llm/operations/classify-error.cjs');

describe('Operations through stub router path', () => {
  const disabledConfig = {
    enabled: false,
    features: { artifact_classification: true, task_validation: true },
    advanced: { disable_after_failures: 3 }
  };

  test('classifyArtifact returns stub response', async () => {
    const result = await classifyArtifact(disabledConfig, '/tmp', 'plan content', 'PLAN');
    expect(result).toBeDefined();
    expect(result.classification).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  test('validateTask returns stub response', async () => {
    const result = await validateTask(disabledConfig, '/tmp', {
      description: 'test task',
      subagent_type: 'pbr:executor'
    });
    expect(result).toBeDefined();
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0);
  });

  test('classifyError returns stub response', async () => {
    const result = await classifyError(disabledConfig, '/tmp', 'ECONNREFUSED error');
    expect(result).toBeDefined();
    expect(result.category).toBe('unknown');
    expect(result.confidence).toBe(0);
  });
});

describe('Stub module structure', () => {
  test('all operation modules are loadable', () => {
    expect(() => require('../plan-build-run/bin/lib/local-llm/operations/classify-artifact.cjs')).not.toThrow();
    expect(() => require('../plan-build-run/bin/lib/local-llm/operations/classify-commit.cjs')).not.toThrow();
    expect(() => require('../plan-build-run/bin/lib/local-llm/operations/classify-error.cjs')).not.toThrow();
    expect(() => require('../plan-build-run/bin/lib/local-llm/operations/classify-file-intent.cjs')).not.toThrow();
    expect(() => require('../plan-build-run/bin/lib/local-llm/operations/triage-test-output.cjs')).not.toThrow();
    expect(() => require('../plan-build-run/bin/lib/local-llm/operations/validate-task.cjs')).not.toThrow();
  });

  test('health module is loadable and exports resolveConfig', () => {
    const health = require('../plan-build-run/bin/lib/local-llm/health.cjs');
    expect(typeof health.resolveConfig).toBe('function');
  });

  test('metrics module is loadable and exports expected functions', () => {
    const metrics = require('../plan-build-run/bin/lib/local-llm/metrics.cjs');
    expect(typeof metrics.computeLifetimeMetrics).toBe('function');
    expect(typeof metrics.readSessionMetrics).toBe('function');
    expect(typeof metrics.summarizeMetrics).toBe('function');
  });

  test('index module is loadable and exports all LLM functions', () => {
    const index = require('../plan-build-run/bin/lib/local-llm/index.cjs');
    expect(typeof index.llmHealth).toBe('function');
    expect(typeof index.llmStatus).toBe('function');
    expect(typeof index.llmClassify).toBe('function');
    expect(typeof index.llmScoreSource).toBe('function');
    expect(typeof index.llmClassifyError).toBe('function');
    expect(typeof index.llmSummarize).toBe('function');
    expect(typeof index.llmMetrics).toBe('function');
    expect(typeof index.llmAdjustThresholds).toBe('function');
  });
});

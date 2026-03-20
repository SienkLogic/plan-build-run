'use strict';

/**
 * Local LLM shadow mode stub tests.
 *
 * The full shadow mode implementation (runShadow, computeThresholdAdjustments)
 * is deferred to v3 (ADV-01). These tests verify that the stub operation
 * modules can be used in a shadow-like pattern without crashing.
 *
 * In the full implementation, shadow mode would:
 * - Run local LLM in parallel with frontier
 * - Compare results and log agreement/disagreement
 * - Use threshold tuner to adjust confidence thresholds
 *
 * In the stub, all operations return default stub responses.
 */

const { classifyArtifact } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-artifact');
const { validateTask } = require('../plugins/pbr/scripts/lib/local-llm/operations/validate-task');
const { resolveConfig } = require('../plugins/pbr/scripts/lib/local-llm/health');

describe('Shadow mode stub behavior', () => {
  test('stub classifyArtifact returns immediately (no async wait needed)', async () => {
    const frontier = { classification: 'complete' };
    const localResult = await classifyArtifact();

    // In stub, local always returns default; frontier would be authoritative
    expect(localResult.classification).toBe('unknown');
    expect(frontier.classification).toBe('complete');
  });

  test('stub validateTask returns immediately', async () => {
    const frontier = { coherent: true, confidence: 0.9 };
    const localResult = await validateTask();

    expect(localResult.valid).toBe(true);
    expect(localResult.confidence).toBe(0);
    // Frontier would be authoritative in shadow mode
    expect(frontier.coherent).toBe(true);
  });

  test('resolveConfig returns disabled config', () => {
    const config = resolveConfig(undefined);
    expect(config.enabled).toBe(false);
    // Shadow mode would check config.advanced.shadow_mode
    // In stub, this field doesn't exist
  });

  test('resolveConfig with shadow_mode set preserves the field', () => {
    const config = resolveConfig({ advanced: { shadow_mode: true } });
    expect(config.advanced.shadow_mode).toBe(true);
    // But enabled is still false by default
    expect(config.enabled).toBe(false);
  });

  test('stub operations do not throw when called rapidly (simulates shadow contention)', async () => {
    const calls = Array.from({ length: 10 }, () => classifyArtifact());
    const results = await Promise.all(calls);

    expect(results).toHaveLength(10);
    for (const result of results) {
      expect(result.classification).toBe('unknown');
      expect(result.confidence).toBe(0);
    }
  });
});

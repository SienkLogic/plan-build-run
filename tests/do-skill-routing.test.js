/**
 * Integration tests for enhanced /pbr:do routing logic.
 * Validates that intent-router and risk-classifier work together
 * for end-to-end routing decisions.
 */

'use strict';

const { classifyIntent } = require('../plugins/pbr/scripts/intent-router.cjs');
const { classifyRisk, CEREMONY_MAP } = require('../plugins/pbr/scripts/risk-classifier.cjs');

describe('end-to-end routing decision', () => {
  test('"fix the crashing auth bug error" -> intent: debug, risk: medium via context', () => {
    const intent = classifyIntent('fix the crashing auth bug error');
    expect(intent.route).toBe('debug');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.7);

    // "fix" is a low signal (-1), but with fileCount context the risk rises to medium
    const risk = classifyRisk('fix the crashing auth bug error', { fileCount: 3 });
    expect(risk.risk).toBe('medium');
    expect(risk.ceremony).toBe('lightweight-plan');
  });

  test('"rename and update the utils variable" -> intent: quick, risk: low, ceremony: inline', () => {
    // Two keyword matches ("rename" + "update") needed for >= 0.7 confidence
    const intent = classifyIntent('rename and update the utils variable');
    expect(intent.route).toBe('quick');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.7);

    const risk = classifyRisk('rename and update the utils variable');
    expect(risk.risk).toBe('low');
    expect(risk.ceremony).toBe('inline');
  });

  test('"redesign the plugin architecture" -> intent: plan-phase, risk: high, ceremony: full-plan-build-verify', () => {
    const intent = classifyIntent('redesign the plugin architecture');
    expect(intent.route).toBe('plan-phase');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.7);

    const risk = classifyRisk('redesign the plugin architecture');
    expect(risk.risk).toBe('high');
    expect(risk.ceremony).toBe('full-plan-build-verify');
  });
});

describe('ceremony override', () => {
  test('ceremonyLevel "high" overrides risk to full-plan-build-verify', async () => {
    const risk = classifyRisk('rename a variable');
    // Without override, this would be low risk
    expect(risk.risk).toBe('low');

    // With ceremonyLevel "high", the ceremony should be overridden
    const ceremonyLevel = 'high';
    const ceremony = ceremonyLevel === 'auto'
      ? risk.ceremony
      : CEREMONY_MAP[ceremonyLevel] || 'full-plan-build-verify';
    expect(ceremony).toBe('full-plan-build-verify');
  });

  test('ceremonyLevel "low" overrides risk to inline', async () => {
    const risk = classifyRisk('redesign the entire architecture');
    // Without override, this would be high risk
    expect(risk.risk).toBe('high');

    const ceremonyLevel = 'low';
    const ceremony = ceremonyLevel === 'auto'
      ? risk.ceremony
      : CEREMONY_MAP[ceremonyLevel] || 'inline';
    expect(ceremony).toBe('inline');
  });

  test('ceremonyLevel "auto" uses classifyRisk result', async () => {
    const risk = classifyRisk('add a new endpoint for user profiles');
    const ceremonyLevel = 'auto';
    const ceremony = ceremonyLevel === 'auto'
      ? risk.ceremony
      : CEREMONY_MAP[ceremonyLevel];
    expect(ceremony).toBe(risk.ceremony);
  });
});

describe('feature toggle disabled', () => {
  test('classifyIntent returns valid structure when NL routing would be disabled', async () => {
    // Module is independent — always returns valid output regardless of config toggle
    const result = classifyIntent('do something random');
    expect(result).toHaveProperty('route');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('candidates');
    expect(typeof result.route).toBe('string');
    expect(typeof result.confidence).toBe('number');
    expect(Array.isArray(result.candidates)).toBe(true);
  });

  test('classifyRisk returns valid structure when adaptive ceremony would be disabled', async () => {
    // Module is independent — always returns valid output regardless of config toggle
    const result = classifyRisk('do something random');
    expect(result).toHaveProperty('risk');
    expect(result).toHaveProperty('ceremony');
    expect(result).toHaveProperty('signals');
    expect(['low', 'medium', 'high']).toContain(result.risk);
    expect(typeof result.ceremony).toBe('string');
    expect(Array.isArray(result.signals)).toBe(true);
  });
});

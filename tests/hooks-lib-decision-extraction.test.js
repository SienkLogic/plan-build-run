'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const { DECISION_PATTERNS, extractDecisions, handleDecisionExtraction } = require('../plugins/pbr/scripts/lib/decision-extraction');

let tmpDir;
let planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-decision-'));
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

describe('DECISION_PATTERNS', () => {
  test('has 4 pattern entries', async () => {
    expect(DECISION_PATTERNS).toHaveLength(4);
  });

  test('each pattern has name, regex, and extract', () => {
    for (const p of DECISION_PATTERNS) {
      expect(p.name).toBeDefined();
      expect(p.regex).toBeInstanceOf(RegExp);
      expect(typeof p.extract).toBe('function');
    }
  });

  test('pattern names are explicit, chose-over, selected-instead, deviation', () => {
    const names = DECISION_PATTERNS.map(p => p.name);
    expect(names).toEqual(['explicit', 'chose-over', 'selected-instead', 'deviation']);
  });
});

describe('extractDecisions', () => {
  test('returns empty array for null input', async () => {
    expect(extractDecisions(null, 'executor')).toEqual([]);
  });

  test('returns empty array for empty string', async () => {
    expect(extractDecisions('', 'executor')).toEqual([]);
  });

  test('returns empty array for non-string input', async () => {
    expect(extractDecisions(123, 'executor')).toEqual([]);
  });

  test('extracts explicit DECISION: pattern', async () => {
    const text = 'DECISION: Use Redis for caching because it supports TTL natively';
    const results = extractDecisions(text, 'planner');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Use Redis for caching');
    expect(results[0].rationale).toContain('TTL');
    expect(results[0].agent).toBe('planner');
  });

  test('extracts Locked Decision pattern', async () => {
    const text = 'Locked Decision: Monorepo structure because shared types';
    const results = extractDecisions(text, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Monorepo structure');
  });

  test('extracts chose-over pattern', async () => {
    const text = 'We chose PostgreSQL over MySQL because of JSON support.';
    const results = extractDecisions(text, 'researcher');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('chose PostgreSQL over MySQL');
    expect(results[0].rationale).toContain('JSON support');
    expect(results[0].alternatives).toContain('MySQL');
  });

  test('extracts selected-instead pattern', async () => {
    const text = 'We selected Vite instead of Webpack because of faster builds.';
    const results = extractDecisions(text, 'planner');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('selected Vite instead of Webpack');
    expect(results[0].rationale).toContain('faster builds');
    expect(results[0].alternatives).toContain('Webpack');
  });

  test('extracts Deviation pattern', async () => {
    const text = 'Deviation: Skipped migration because schema unchanged';
    const results = extractDecisions(text, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Skipped migration');
  });

  test('returns empty for text with no decision patterns', async () => {
    const text = 'Just a normal line of text with no decisions.';
    const results = extractDecisions(text, 'executor');
    expect(results).toEqual([]);
  });

  test('truncates decision to 80 chars', async () => {
    const longDecision = 'A'.repeat(100);
    const text = `DECISION: ${longDecision}`;
    const results = extractDecisions(text, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision.length).toBeLessThanOrEqual(80);
  });
});

describe('handleDecisionExtraction', () => {
  test('returns early when config.json is missing', async () => {
    // Should not throw
    handleDecisionExtraction(planningDir, 'DECISION: test', 'executor');
  });

  test('returns early when decision_journal feature is disabled', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: {} }));
    handleDecisionExtraction(planningDir, 'DECISION: test', 'executor');
  });

  test('returns early when no decisions found in output', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { decision_journal: true } }));
    handleDecisionExtraction(planningDir, 'No decisions here', 'executor');
  });
});


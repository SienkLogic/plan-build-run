'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const { DECISION_PATTERNS, extractDecisions, handleDecisionExtraction, extractNegativeKnowledge } = require('../plugins/pbr/scripts/lib/decision-extraction');

let tmpDir;
let planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-decision-'));
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

describe('DECISION_PATTERNS', () => {
  test('has 4 pattern entries', () => {
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
  test('returns empty array for null input', () => {
    expect(extractDecisions(null, 'executor')).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(extractDecisions('', 'executor')).toEqual([]);
  });

  test('returns empty array for non-string input', () => {
    expect(extractDecisions(123, 'executor')).toEqual([]);
  });

  test('extracts explicit DECISION: pattern', () => {
    const text = 'DECISION: Use Redis for caching because it supports TTL natively';
    const results = extractDecisions(text, 'planner');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Use Redis for caching');
    expect(results[0].rationale).toContain('TTL');
    expect(results[0].agent).toBe('planner');
  });

  test('extracts Locked Decision pattern', () => {
    const text = 'Locked Decision: Monorepo structure because shared types';
    const results = extractDecisions(text, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Monorepo structure');
  });

  test('extracts chose-over pattern', () => {
    const text = 'We chose PostgreSQL over MySQL because of JSON support.';
    const results = extractDecisions(text, 'researcher');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('chose PostgreSQL over MySQL');
    expect(results[0].rationale).toContain('JSON support');
    expect(results[0].alternatives).toContain('MySQL');
  });

  test('extracts selected-instead pattern', () => {
    const text = 'We selected Vite instead of Webpack because of faster builds.';
    const results = extractDecisions(text, 'planner');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('selected Vite instead of Webpack');
    expect(results[0].rationale).toContain('faster builds');
    expect(results[0].alternatives).toContain('Webpack');
  });

  test('extracts Deviation pattern', () => {
    const text = 'Deviation: Skipped migration because schema unchanged';
    const results = extractDecisions(text, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Skipped migration');
  });

  test('returns empty for text with no decision patterns', () => {
    const text = 'Just a normal line of text with no decisions.';
    const results = extractDecisions(text, 'executor');
    expect(results).toEqual([]);
  });

  test('truncates decision to 80 chars', () => {
    const longDecision = 'A'.repeat(100);
    const text = `DECISION: ${longDecision}`;
    const results = extractDecisions(text, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision.length).toBeLessThanOrEqual(80);
  });
});

describe('handleDecisionExtraction', () => {
  test('returns early when config.json is missing', () => {
    // Should not throw
    handleDecisionExtraction(planningDir, 'DECISION: test', 'executor');
  });

  test('returns early when decision_journal feature is disabled', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: {} }));
    handleDecisionExtraction(planningDir, 'DECISION: test', 'executor');
  });

  test('returns early when no decisions found in output', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { decision_journal: true } }));
    handleDecisionExtraction(planningDir, 'No decisions here', 'executor');
  });
});

describe('extractNegativeKnowledge', () => {
  test('returns early when negative_knowledge feature is disabled', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    // Should not throw
    extractNegativeKnowledge(planningDir, phaseDir, { features: {} });
  });

  test('returns early when VERIFICATION.md is missing', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    extractNegativeKnowledge(planningDir, phaseDir, { features: { negative_knowledge: true } });
  });

  test('returns early when config is null', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    extractNegativeKnowledge(planningDir, phaseDir, null);
  });

  test('parses section-format gaps from VERIFICATION.md', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    const verificationContent = `---
status: failed
gaps:
  - Missing tests
---

### Gap: Missing unit tests
Files: src/index.js, src/utils.js
No test coverage for core modules

## Summary
`;
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), verificationContent);

    // Will try to load negative-knowledge.cjs — may fail in test env, but should not throw
    extractNegativeKnowledge(planningDir, phaseDir, { features: { negative_knowledge: true } });
  });

  test('parses table-format gaps from VERIFICATION.md', () => {
    const phaseDir = path.join(planningDir, 'phases', '02-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    const verificationContent = `---
status: failed
gaps:
  - Missing validation
---

| Gap | Files | Evidence |
| Missing input validation | src/api.js | No sanitization |
`;
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), verificationContent);

    extractNegativeKnowledge(planningDir, phaseDir, { features: { negative_knowledge: true } });
  });

  test('returns early when frontmatter has no gaps and status is not failed', () => {
    const phaseDir = path.join(planningDir, 'phases', '03-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    const verificationContent = `---
status: passed
---

All good
`;
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), verificationContent);

    extractNegativeKnowledge(planningDir, phaseDir, { features: { negative_knowledge: true } });
  });
});

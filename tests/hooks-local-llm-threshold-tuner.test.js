'use strict';

/**
 * Tests for hooks/local-llm/threshold-tuner.js — computeThresholdAdjustments.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeThresholdAdjustments } = require('../plugins/pbr/scripts/lib/local-llm/threshold-tuner');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threshold-tuner-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeShadowLog(entries) {
  const logsDir = path.join(tmpDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(path.join(logsDir, 'local-llm-shadow.jsonl'), lines, 'utf8');
}

function makeEntries(operation, total, agreeCount) {
  const entries = [];
  for (let i = 0; i < total; i++) {
    entries.push({ operation, agrees: i < agreeCount });
  }
  return entries;
}

describe('computeThresholdAdjustments', () => {
  test('returns empty array when no shadow log file exists', () => {
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    expect(result).toEqual([]);
  });

  test('returns empty array when shadow log has fewer than 20 entries per operation', () => {
    writeShadowLog(makeEntries('test-op', 10, 8));
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    expect(result).toEqual([]);
  });

  test('suggests raising threshold when >20% failure rate', () => {
    // 20 entries, only 14 agree => 30% failure => high failure
    writeShadowLog(makeEntries('test-op', 20, 14));
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    expect(result).toHaveLength(1);
    expect(result[0].operation).toBe('test-op');
    expect(result[0].suggested).toBeCloseTo(0.95, 2);
    expect(result[0].current).toBe(0.9);
  });

  test('suggests lowering threshold when <5% failure rate', () => {
    // 20 entries, 20 agree => 0% failure => very reliable
    writeShadowLog(makeEntries('test-op', 20, 20));
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    expect(result).toHaveLength(1);
    expect(result[0].suggested).toBeCloseTo(0.85, 2);
  });

  test('suggests no change when 5-20% failure rate', () => {
    // 20 entries, 17 agree => 15% failure => in range
    writeShadowLog(makeEntries('test-op', 20, 17));
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    expect(result).toHaveLength(1);
    expect(result[0].suggested).toBe(result[0].current);
  });

  test('clamps suggested threshold to max 0.99', () => {
    // High failure rate with current at 0.97 => 0.97 + 0.05 = 1.02, clamp to 0.99
    writeShadowLog(makeEntries('test-op', 20, 14));
    const result = computeThresholdAdjustments(tmpDir, 0.97);
    expect(result[0].suggested).toBe(0.99);
  });

  test('clamps suggested threshold to min 0.5', () => {
    // Low failure rate with current at 0.52 => 0.52 - 0.05 = 0.47, clamp to 0.5
    writeShadowLog(makeEntries('test-op', 20, 20));
    const result = computeThresholdAdjustments(tmpDir, 0.52);
    expect(result[0].suggested).toBeCloseTo(0.5, 2);
  });

  test('multiple operations each get their own suggestion', () => {
    const entries = [
      ...makeEntries('op-a', 20, 20),  // reliable => lower
      ...makeEntries('op-b', 20, 14)   // unreliable => raise
    ];
    writeShadowLog(entries);
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    expect(result).toHaveLength(2);
    const opA = result.find(r => r.operation === 'op-a');
    const opB = result.find(r => r.operation === 'op-b');
    expect(opA.suggested).toBeCloseTo(0.85, 2);
    expect(opB.suggested).toBeCloseTo(0.95, 2);
  });

  test('skips malformed JSONL lines without crashing', () => {
    const logsDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const lines = [
      'not valid json',
      '{"operation":"test-op","agrees":true}',
      '{broken',
      ...Array(19).fill(null).map(() => JSON.stringify({ operation: 'test-op', agrees: true }))
    ];
    fs.writeFileSync(path.join(logsDir, 'local-llm-shadow.jsonl'), lines.join('\n') + '\n', 'utf8');
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    // 20 valid entries for test-op, all agree
    expect(result).toHaveLength(1);
    expect(result[0].suggested).toBeCloseTo(0.85, 2);
  });

  test('entries without operation field are ignored', () => {
    const entries = [
      ...makeEntries('test-op', 19, 19),
      { agrees: true } // no operation field
    ];
    writeShadowLog(entries);
    const result = computeThresholdAdjustments(tmpDir, 0.9);
    // Only 19 entries for test-op, below MIN_SAMPLES of 20
    expect(result).toEqual([]);
  });
});

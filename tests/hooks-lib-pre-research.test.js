/**
 * Tests for hooks/lib/pre-research.js — Pre-research trigger module.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { checkPreResearch } = require('../hooks/lib/pre-research');

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

function writeState(phase, progress, status = 'building') {
  writePlanningFile(planningDir, 'STATE.md', [
    '---',
    `current_phase: ${phase}`,
    `progress_percent: ${progress}`,
    `status: ${status}`,
    '---',
    ''
  ].join('\n'));
}

function writeRoadmap(phases) {
  const lines = phases.map(p => `- [ ] Phase ${p.num}: ${p.name}`);
  writePlanningFile(planningDir, 'ROADMAP.md', lines.join('\n') + '\n');
}

test('triggers when progress >= 70% and next phase exists', () => {
  writeState(1, 80);
  writeRoadmap([{ num: 1, name: 'First' }, { num: 2, name: 'Second Phase' }]);

  const result = checkPreResearch(planningDir, {});
  expect(result).not.toBeNull();
  expect(result.nextPhase).toBe(2);
  expect(result.name).toBe('Second Phase');
  expect(result.command).toBe('/pbr:explore 2');
});

test('does not trigger when progress < 70%', () => {
  writeState(1, 50);
  writeRoadmap([{ num: 1, name: 'First' }, { num: 2, name: 'Second' }]);

  const result = checkPreResearch(planningDir, {});
  expect(result).toBeNull();
});

test('does not trigger when feature disabled', () => {
  writeState(1, 90);
  writeRoadmap([{ num: 1, name: 'First' }, { num: 2, name: 'Second' }]);

  const result = checkPreResearch(planningDir, { features: { pre_research: false } });
  expect(result).toBeNull();
});

test('does not trigger when status is verified', () => {
  writeState(1, 90, 'verified');
  writeRoadmap([{ num: 1, name: 'First' }, { num: 2, name: 'Second' }]);

  const result = checkPreResearch(planningDir, {});
  expect(result).toBeNull();
});

test('does not trigger when status is complete', () => {
  writeState(1, 90, 'complete');
  writeRoadmap([{ num: 1, name: 'First' }, { num: 2, name: 'Second' }]);

  const result = checkPreResearch(planningDir, {});
  expect(result).toBeNull();
});

test('returns null when STATE.md is missing', () => {
  const result = checkPreResearch(planningDir, {});
  expect(result).toBeNull();
});

test('returns null when ROADMAP.md is missing', () => {
  writeState(1, 80);
  const result = checkPreResearch(planningDir, {});
  expect(result).toBeNull();
});

test('returns null when next phase does not exist in roadmap', () => {
  writeState(5, 80);
  writeRoadmap([{ num: 1, name: 'First' }]);

  const result = checkPreResearch(planningDir, {});
  expect(result).toBeNull();
});

test('idempotency: second call returns null due to signal file', () => {
  writeState(1, 80);
  writeRoadmap([{ num: 1, name: 'First' }, { num: 2, name: 'Second' }]);

  const first = checkPreResearch(planningDir, {});
  expect(first).not.toBeNull();

  const second = checkPreResearch(planningDir, {});
  expect(second).toBeNull();
});

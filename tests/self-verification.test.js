/**
 * Tests for self-verification validation in check-subagent-output.js.
 *
 * Validates that the executor SUMMARY.md self_check field is detected
 * and appropriate warnings are emitted when missing or showing failures.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { validateSelfCheck } = require('../plugins/pbr/scripts/check-subagent-output');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-self-verify-'));
}

function writeSummary(dir, content) {
  const phasesDir = path.join(dir, 'phases', '08-test-phase');
  fs.mkdirSync(phasesDir, { recursive: true });
  const summaryPath = path.join(phasesDir, 'SUMMARY-08-01.md');
  fs.writeFileSync(summaryPath, content, 'utf8');
  return summaryPath;
}

describe('validateSelfCheck', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('warns when executor SUMMARY.md lacks self_check field and self_verification enabled', () => {
    const summaryPath = writeSummary(tmpDir, `---
phase: "08-test-phase"
plan: "08-01"
status: complete
commits: ["abc1234"]
provides: []
requires: []
key_files: []
deferred: []
must_haves: []
---

## Task Results

| Task | Status | Notes |
|------|--------|-------|
| T1   | done   | ...   |
`);

    const config = { features: { self_verification: true } };
    const warnings = validateSelfCheck(summaryPath, config);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/self_check/i);
  });

  test('no warning when self_check field present in SUMMARY.md', () => {
    const summaryPath = writeSummary(tmpDir, `---
phase: "08-test-phase"
plan: "08-01"
status: complete
commits: ["abc1234"]
provides: []
requires: []
key_files: []
deferred: []
must_haves: []
self_check:
  passed: 5
  failed: 0
  retries: 0
---

## Task Results

| Task | Status | Notes |
|------|--------|-------|
| T1   | done   | ...   |
`);

    const config = { features: { self_verification: true } };
    const warnings = validateSelfCheck(summaryPath, config);
    expect(warnings.length).toBe(0);
  });

  test('no warning when self_verification feature is disabled', () => {
    const summaryPath = writeSummary(tmpDir, `---
phase: "08-test-phase"
plan: "08-01"
status: complete
commits: ["abc1234"]
---

## Task Results
`);

    const config = { features: { self_verification: false } };
    const warnings = validateSelfCheck(summaryPath, config);
    expect(warnings.length).toBe(0);
  });

  test('warns when self_check.failed > 0 even after retries', () => {
    const summaryPath = writeSummary(tmpDir, `---
phase: "08-test-phase"
plan: "08-01"
status: complete
commits: ["abc1234"]
provides: []
requires: []
key_files: []
deferred: []
must_haves: []
self_check:
  passed: 3
  failed: 2
  retries: 2
---

## Task Results
`);

    const config = { features: { self_verification: true } };
    const warnings = validateSelfCheck(summaryPath, config);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/failed/i);
    expect(warnings[0]).toMatch(/retries/i);
  });

  test('returns empty array when config is null', () => {
    const summaryPath = writeSummary(tmpDir, `---
status: complete
---
`);
    const warnings = validateSelfCheck(summaryPath, null);
    expect(warnings).toEqual([]);
  });

  test('returns empty array when config has no features', () => {
    const summaryPath = writeSummary(tmpDir, `---
status: complete
---
`);
    const warnings = validateSelfCheck(summaryPath, {});
    expect(warnings).toEqual([]);
  });
});

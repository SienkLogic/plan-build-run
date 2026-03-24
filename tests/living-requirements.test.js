/**
 * Tests for living requirements status updater (plan-build-run/bin/lib/requirements.cjs)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { updateRequirementStatus, getRequirementStatus, markPhaseRequirements } = require('../plugins/pbr/scripts/lib/requirements');

function makeTmpDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-req-'));
  return tmp;
}

function writeReqFile(dir, content) {
  fs.writeFileSync(path.join(dir, 'REQUIREMENTS.md'), content, 'utf-8');
}

function readReqFile(dir) {
  return fs.readFileSync(path.join(dir, 'REQUIREMENTS.md'), 'utf-8');
}

const SAMPLE_REQUIREMENTS = `---
milestone: v3.0
---

## Functional Requirements

- [ ] **REQ-F05-001**: Decision journal captures locked decisions
- [ ] **REQ-F05-002**: Negative knowledge recorded on failed approaches
- [x] **REQ-F05-003**: Already completed requirement
- [ ] **REQ-F05-004**: Convention memory snapshots
- [ ] **REQ-F05-005**: Living requirements auto-update
- [ ] **REQ-F05-006**: Requirements status CLI

## Non-Functional Requirements

- [ ] **REQ-NF-001**: Performance target met
`;

describe('updateRequirementStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeReqFile(tmpDir, SAMPLE_REQUIREMENTS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('marks unchecked requirements as done', async () => {
    const result = updateRequirementStatus(tmpDir, ['REQ-F05-001'], 'done');
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [x] **REQ-F05-001**');
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.notFound).toEqual([]);
  });

  test('skips already-checked requirements', async () => {
    const result = updateRequirementStatus(tmpDir, ['REQ-F05-003'], 'done');
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [x] **REQ-F05-003**');
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.notFound).toEqual([]);
  });

  test('does not modify requirements not in the provided list', async () => {
    updateRequirementStatus(tmpDir, ['REQ-F05-001'], 'done');
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [ ] **REQ-F05-002**');
    expect(content).toContain('- [ ] **REQ-F05-004**');
    expect(content).toContain('- [ ] **REQ-NF-001**');
  });

  test('reports notFound for IDs not in the file', async () => {
    const result = updateRequirementStatus(tmpDir, ['REQ-DOES-NOT-EXIST'], 'done');
    expect(result.notFound).toEqual(['REQ-DOES-NOT-EXIST']);
    expect(result.updated).toBe(0);
  });

  test('handles multiple IDs in a single call', async () => {
    const result = updateRequirementStatus(tmpDir, ['REQ-F05-001', 'REQ-F05-005', 'REQ-F05-006'], 'done');
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [x] **REQ-F05-001**');
    expect(content).toContain('- [x] **REQ-F05-005**');
    expect(content).toContain('- [x] **REQ-F05-006**');
    expect(result.updated).toBe(3);
  });

  test('reset status unchecks a checked requirement', async () => {
    const result = updateRequirementStatus(tmpDir, ['REQ-F05-003'], 'reset');
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [ ] **REQ-F05-003**');
    expect(result.updated).toBe(1);
  });

  test('is idempotent - calling twice with same IDs produces same result', async () => {
    updateRequirementStatus(tmpDir, ['REQ-F05-001'], 'done');
    const first = readReqFile(tmpDir);
    const result2 = updateRequirementStatus(tmpDir, ['REQ-F05-001'], 'done');
    const second = readReqFile(tmpDir);
    expect(first).toBe(second);
    expect(result2.updated).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  test('handles bold format with trailing colon and text', async () => {
    writeReqFile(tmpDir, '- [ ] **REQ-T01**: Some description here\n');
    const result = updateRequirementStatus(tmpDir, ['REQ-T01'], 'done');
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [x] **REQ-T01**');
    expect(result.updated).toBe(1);
  });
});

describe('getRequirementStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeReqFile(tmpDir, SAMPLE_REQUIREMENTS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns map of REQ-ID to {checked, text}', () => {
    const status = getRequirementStatus(tmpDir);
    expect(status instanceof Map).toBe(true);
    expect(status.get('REQ-F05-001')).toEqual({ checked: false, text: 'Decision journal captures locked decisions' });
    expect(status.get('REQ-F05-003')).toEqual({ checked: true, text: 'Already completed requirement' });
  });

  test('includes all requirements from file', async () => {
    const status = getRequirementStatus(tmpDir);
    expect(status.size).toBe(7);
  });

  test('returns empty map if file missing', async () => {
    const emptyDir = makeTmpDir();
    const status = getRequirementStatus(emptyDir);
    expect(status.size).toBe(0);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe('markPhaseRequirements', () => {
  let tmpDir;
  let phaseDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    phaseDir = path.join(tmpDir, 'phases', '05-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    writeReqFile(tmpDir, SAMPLE_REQUIREMENTS);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('marks requirements from passed verification', async () => {
    // Write a PLAN with implements field
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'implements:',
      '  - "REQ-F05-001"',
      '  - "REQ-F05-002"',
      '---',
      '',
      'Plan content',
    ].join('\n'));

    // Write a passing VERIFICATION.md
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), [
      '---',
      'status: passed',
      '---',
      '',
      'Verification passed.',
    ].join('\n'));

    const result = markPhaseRequirements(tmpDir, phaseDir);
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [x] **REQ-F05-001**');
    expect(content).toContain('- [x] **REQ-F05-002**');
    expect(result.updated).toBe(2);
  });

  test('skips when verification not passed', async () => {
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'implements:',
      '  - "REQ-F05-004"',
      '---',
    ].join('\n'));

    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), [
      '---',
      'status: failed',
      '---',
    ].join('\n'));

    const result = markPhaseRequirements(tmpDir, phaseDir);
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [ ] **REQ-F05-004**');
    expect(result.skipped_reason).toBe('verification not passed');
  });

  test('collects implements from multiple PLAN files', async () => {
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'implements:',
      '  - "REQ-F05-001"',
      '---',
    ].join('\n'));

    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), [
      '---',
      'implements:',
      '  - "REQ-F05-005"',
      '---',
    ].join('\n'));

    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), [
      '---',
      'status: passed',
      '---',
    ].join('\n'));

    const result = markPhaseRequirements(tmpDir, phaseDir);
    expect(result.updated).toBe(2);
    const content = readReqFile(tmpDir);
    expect(content).toContain('- [x] **REQ-F05-001**');
    expect(content).toContain('- [x] **REQ-F05-005**');
  });

  test('returns empty result if no VERIFICATION.md', async () => {
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'implements:',
      '  - "REQ-F05-001"',
      '---',
    ].join('\n'));

    const result = markPhaseRequirements(tmpDir, phaseDir);
    expect(result.skipped_reason).toBe('no verification file');
  });
});

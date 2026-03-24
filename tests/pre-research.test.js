/**
 * Tests for pre-research trigger module.
 *
 * Validates checkPreResearch(planningDir, config) returns correct
 * advisory when phase progress hits 70%+ threshold.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkPreResearch } = require('../plugins/pbr/scripts/lib/pre-research');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pre-research-test-'));
}

function writeState(planningDir, { current_phase = 1, total_phases = 3, progress_percent = 50, status = 'executing' } = {}) {
  const stateContent = `---
current_phase: ${current_phase}
total_phases: ${total_phases}
progress_percent: ${progress_percent}
status: "${status}"
---

## Current Position
Phase ${current_phase} of ${total_phases}
`;
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent, 'utf8');
}

function writeRoadmap(planningDir, phases) {
  const lines = ['# Roadmap', ''];
  for (const p of phases) {
    const check = p.completed ? 'x' : ' ';
    lines.push(`- [${check}] Phase ${p.num}: ${p.name}`);
  }
  lines.push('');
  for (const p of phases) {
    lines.push(`### Phase ${p.num}: ${p.name}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), lines.join('\n'), 'utf8');
}

describe('checkPreResearch', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns null when progress < 70%', async () => {
    writeState(tmpDir, { current_phase: 1, total_phases: 3, progress_percent: 50 });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: false },
      { num: 2, name: 'Features', completed: false },
      { num: 3, name: 'Polish', completed: false },
    ]);
    const result = checkPreResearch(tmpDir, { features: {} });
    expect(result).toBeNull();
  });

  test('returns advisory when progress >= 70% and next phase exists', async () => {
    writeState(tmpDir, { current_phase: 2, total_phases: 4, progress_percent: 75 });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: true },
      { num: 2, name: 'Features', completed: false },
      { num: 3, name: 'Integration', completed: false },
      { num: 4, name: 'Polish', completed: false },
    ]);
    const result = checkPreResearch(tmpDir, { features: {} });
    expect(result).not.toBeNull();
    expect(result.nextPhase).toBe(3);
    expect(result.name).toBe('Integration');
    expect(result.command).toBe('/pbr:explore 3');
  });

  test('returns null when signal file already exists (idempotent)', async () => {
    writeState(tmpDir, { current_phase: 2, total_phases: 4, progress_percent: 80 });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: true },
      { num: 2, name: 'Features', completed: false },
      { num: 3, name: 'Integration', completed: false },
      { num: 4, name: 'Polish', completed: false },
    ]);
    // Write signal file for phase 3
    fs.writeFileSync(path.join(tmpDir, '.pre-research-03'), new Date().toISOString(), 'utf8');
    const result = checkPreResearch(tmpDir, { features: {} });
    expect(result).toBeNull();
  });

  test('returns null when no next phase exists (last phase)', async () => {
    writeState(tmpDir, { current_phase: 3, total_phases: 3, progress_percent: 90 });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: true },
      { num: 2, name: 'Features', completed: true },
      { num: 3, name: 'Polish', completed: false },
    ]);
    const result = checkPreResearch(tmpDir, { features: {} });
    expect(result).toBeNull();
  });

  test('returns null when feature disabled in config', async () => {
    writeState(tmpDir, { current_phase: 1, total_phases: 3, progress_percent: 80 });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: false },
      { num: 2, name: 'Features', completed: false },
      { num: 3, name: 'Polish', completed: false },
    ]);
    const result = checkPreResearch(tmpDir, { features: { pre_research: false } });
    expect(result).toBeNull();
  });

  test('returns null when status is verified (phase done)', async () => {
    writeState(tmpDir, { current_phase: 2, total_phases: 3, progress_percent: 100, status: 'verified' });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: true },
      { num: 2, name: 'Features', completed: false },
      { num: 3, name: 'Polish', completed: false },
    ]);
    const result = checkPreResearch(tmpDir, { features: {} });
    expect(result).toBeNull();
  });

  test('writes signal file on successful trigger', async () => {
    writeState(tmpDir, { current_phase: 1, total_phases: 3, progress_percent: 70 });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: false },
      { num: 2, name: 'Features', completed: false },
      { num: 3, name: 'Polish', completed: false },
    ]);
    const result = checkPreResearch(tmpDir, { features: {} });
    expect(result).not.toBeNull();
    expect(result.nextPhase).toBe(2);
    // Signal file should now exist
    const signalPath = path.join(tmpDir, '.pre-research-02');
    expect(fs.existsSync(signalPath)).toBe(true);
  });

  test('returns null when progress is exactly 100% and status is verified', async () => {
    writeState(tmpDir, { current_phase: 1, total_phases: 2, progress_percent: 100, status: 'verified' });
    writeRoadmap(tmpDir, [
      { num: 1, name: 'Foundation', completed: true },
      { num: 2, name: 'Features', completed: false },
    ]);
    const result = checkPreResearch(tmpDir, { features: {} });
    expect(result).toBeNull();
  });
});

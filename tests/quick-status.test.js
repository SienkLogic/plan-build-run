/**
 * Tests for plugins/pbr/scripts/quick-status.js
 *
 * Covers: structured output, missing STATE.md, missing ROADMAP.md,
 * file-read scope, and 10-line output format.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { quickStatus } = require('../plugins/pbr/scripts/quick-status');

let tmpDir;
let planningDir;

function createTmpDir() {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-qs-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
  planningDir = null;
});

describe('quickStatus', () => {
  test('returns structured output with text and data', async () => {
    createTmpDir();

    // Write minimal STATE.md
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
      '---',
      'current_phase: 5',
      'phase_slug: "auth"',
      'status: "planned"',
      'plans_total: 3',
      'plans_complete: 1',
      'progress_percent: 33',
      'last_activity: "2026-01-01 test"',
      '---',
      '# State'
    ].join('\n'));

    // Write minimal ROADMAP.md with one active milestone
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), [
      '# Roadmap',
      '',
      '## Milestone: Test Project (v1.0)',
      '',
      '### Phase 1: Setup',
      '### Phase 2: Build'
    ].join('\n'));

    const result = quickStatus(planningDir);

    // Check text contains expected fields
    expect(result.text).toContain('Phase: 5');
    expect(result.text).toContain('Status: planned');
    expect(result.text).toContain('Progress: 1/3');
    expect(result.text).toContain('Milestone:');
    expect(result.text).toContain('PBR Quick Status');

    // Check data object
    expect(result.data.current_phase).toBe(5);
    expect(result.data.status).toBe('planned');
    expect(result.data.plans_total).toBe(3);
    expect(result.data.plans_complete).toBe(1);
    expect(result.data.progress_percent).toBe(33);
    expect(result.data.phases_in_milestone).toBe(2);
  });

  test('handles missing STATE.md gracefully', async () => {
    createTmpDir();

    // Only write ROADMAP.md
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), [
      '# Roadmap',
      '## Milestone: Test (v1.0)',
      '### Phase 1: Alpha'
    ].join('\n'));

    const result = quickStatus(planningDir);

    expect(result.data.current_phase).toBe('unknown');
    expect(result.data.status).toBe('unknown');
    expect(result.text).toContain('Phase: unknown');
  });

  test('handles missing ROADMAP.md gracefully', async () => {
    createTmpDir();

    // Only write STATE.md
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
      '---',
      'current_phase: 2',
      'status: "building"',
      'plans_total: 1',
      'plans_complete: 0',
      'progress_percent: 0',
      '---'
    ].join('\n'));

    const result = quickStatus(planningDir);

    expect(result.data.milestone_name).toBe('none');
    expect(result.text).toContain('Milestone: none');
  });

  test('does not read config.json or phases directory', async () => {
    createTmpDir();

    // Write STATE.md and ROADMAP.md
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
      '---',
      'current_phase: 1',
      'status: "planned"',
      'plans_total: 1',
      'plans_complete: 0',
      'progress_percent: 0',
      '---'
    ].join('\n'));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');

    // Spy on readFileSync to check what files are read
    const originalReadFileSync = fs.readFileSync;
    const readPaths = [];
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(function (filePath, ...args) {
      readPaths.push(String(filePath));
      return originalReadFileSync.call(fs, filePath, ...args);
    });

    quickStatus(planningDir);

    spy.mockRestore();

    // Should only read STATE.md and ROADMAP.md
    const relevantReads = readPaths.filter(p => p.startsWith(planningDir));
    for (const readPath of relevantReads) {
      const basename = path.basename(readPath);
      expect(['STATE.md', 'ROADMAP.md']).toContain(basename);
    }
    // Should NOT read config.json or PROJECT.md
    expect(relevantReads.some(p => p.includes('config.json'))).toBe(false);
    expect(relevantReads.some(p => p.includes('PROJECT.md'))).toBe(false);
  });

  test('output is exactly 10 lines', async () => {
    createTmpDir();

    fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
      '---',
      'current_phase: 1',
      'status: "planned"',
      'plans_total: 2',
      'plans_complete: 1',
      'progress_percent: 50',
      'phase_slug: "init"',
      'last_activity: "test"',
      '---'
    ].join('\n'));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), [
      '# Roadmap',
      '## Milestone: Demo (v1.0)',
      '### Phase 1: Init'
    ].join('\n'));

    const result = quickStatus(planningDir);
    const lines = result.text.trim().split('\n');
    expect(lines.length).toBe(10);
  });
});

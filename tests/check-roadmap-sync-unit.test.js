'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseState, getRoadmapPhaseStatus, checkSync, parseRoadmapPhases
} = require('../plugins/pbr/scripts/check-roadmap-sync');

let tmpDir;
let planningDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-crsu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getRoadmapPhaseStatus', () => {
  const roadmapTable = `## Progress
| Phase | Name | Plans | Status |
|---|---|---|---|
| 1 | Setup | 1 | complete |
| 2 | API | 0 | building |
| 3 | UI | 0 | pending |
`;

  test('finds status for existing phase', () => {
    expect(getRoadmapPhaseStatus(roadmapTable, '1')).toBe('complete');
    expect(getRoadmapPhaseStatus(roadmapTable, '2')).toBe('building');
  });

  test('returns null for nonexistent phase', () => {
    expect(getRoadmapPhaseStatus(roadmapTable, '9')).toBeNull();
  });

  test('returns null when no table found', () => {
    expect(getRoadmapPhaseStatus('# Roadmap\nNo table', '1')).toBeNull();
  });

  test('handles zero-padded phase numbers', () => {
    const table = `## Progress
| Phase | Name | Plans | Status |
|---|---|---|---|
| 01 | Setup | 1 | complete |
`;
    expect(getRoadmapPhaseStatus(table, '1')).toBe('complete');
  });

  test('stops at non-table line', () => {
    const table = `## Progress
| Phase | Name | Plans | Status |
|---|---|---|---|
| 1 | Setup | 1 | complete |
Some non-table text
| 2 | API | 0 | building |
`;
    expect(getRoadmapPhaseStatus(table, '2')).toBeNull();
  });
});

describe('parseState', () => {
  test('parses phase and status', () => {
    const result = parseState('Phase: 2 of 5\nStatus: building');
    expect(result.phase).toBe('2');
    expect(result.status).toBe('building');
  });

  test('returns null when no phase', () => {
    expect(parseState('No phase info')).toBeNull();
  });

  test('returns null when no status line', () => {
    expect(parseState('Phase: 1 of 3')).toBeNull();
  });
});

describe('checkSync', () => {
  test('returns null for non-STATE.md files', () => {
    expect(checkSync({ tool_input: { file_path: '/tmp/other.md' } })).toBeNull();
  });

  test('returns null when STATE.md does not exist on disk', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    expect(checkSync({ tool_input: { file_path: statePath } })).toBeNull();
  });

  test('returns null when ROADMAP.md does not exist', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, 'Phase: 1 of 3\nStatus: building');
    expect(checkSync({ tool_input: { file_path: statePath } })).toBeNull();
  });

  test('returns advisory warning when STATE.md has no parseable phase', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, 'No phase info');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('Could not parse');
  });

  test('returns null when status is not a lifecycle status', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, 'Phase: 1 of 3\nStatus: custom-status');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');
    expect(checkSync({ tool_input: { file_path: statePath } })).toBeNull();
  });

  test('warns when phase not in ROADMAP', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, 'Phase: 5 of 5\nStatus: planned');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| 1 | Setup | 1 | complete |\n');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('CRITICAL');
  });

  test('warns when roadmap status mismatches STATE.md status', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, 'Phase: 2 of 5\nStatus: planned');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| 2 | API | 1 | built |\n');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('out of sync');
  });

  test('returns null when phase status matches', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, 'Phase: 2 of 5\nStatus: planned');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n## Progress\n| Phase | Name | Plans | Status |\n|---|---|---|---|\n| 2 | API | 1 | planned |\n');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).toBeNull();
  });
});

describe('parseRoadmapPhases', () => {
  test('parses NN-slug patterns from roadmap', () => {
    const content = `## Phases
| 01-setup | Setup Phase |
| 02-api | API Phase |
`;
    const phases = parseRoadmapPhases(content);
    expect(phases.length).toBe(2);
    expect(phases).toContain('01-setup');
    expect(phases).toContain('02-api');
  });

  test('returns empty for no NN-slug patterns', () => {
    expect(parseRoadmapPhases('# Empty roadmap\nNo patterns')).toEqual([]);
  });

  test('deduplicates phase references', () => {
    const content = '01-setup mentioned here\n01-setup mentioned again';
    const phases = parseRoadmapPhases(content);
    expect(phases.length).toBe(1);
  });
});

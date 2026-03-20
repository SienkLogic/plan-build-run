'use strict';

// Consolidated from check-roadmap-sync.test.js + check-roadmap-sync-unit.test.js (phase 02-02)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createRunner } = require('./helpers');
const {
  parseState, getRoadmapPhaseStatus, checkSync, parseRoadmapPhases,
  checkFilesystemDrift, isHighRisk, validatePostMilestone
} = require('../plugins/pbr/scripts/check-roadmap-sync');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-roadmap-sync.js');
const _run = createRunner(SCRIPT);
const runScript = (input, cwd) => _run(input, { cwd });

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

describe('parseState', () => {
  test('parses phase and status', () => {
    const result = parseState('Phase: 2 of 5\nStatus: building');
    expect(result.phase).toBe('2');
    expect(result.status).toBe('building');
  });

  test('parses bold Phase format', () => {
    const content = '**Phase**: 03 - auth-system\n**Status**: planned';
    const result = parseState(content);
    expect(result.phase).toBe('3');
    expect(result.status).toBe('planned');
  });

  test('parses plain Phase format', () => {
    const content = 'Phase: 3\nStatus: building';
    const result = parseState(content);
    expect(result.phase).toBe('3');
    expect(result.status).toBe('building');
  });

  test('parses "Current phase" format', () => {
    const content = 'Current Phase: 03-slug-name\nPhase Status: built';
    const result = parseState(content);
    expect(result.phase).toBe('3');
    expect(result.status).toBe('built');
  });

  test('parses bold status', () => {
    const content = '**Phase**: 05\n**Status**: verified';
    const result = parseState(content);
    expect(result.phase).toBe('5');
    expect(result.status).toBe('verified');
  });

  test('parses quoted status', () => {
    const content = 'Phase: 2\nStatus: "planned"';
    const result = parseState(content);
    expect(result.status).toBe('planned');
  });

  test('returns null when no phase', () => {
    expect(parseState('No phase info')).toBeNull();
  });

  test('returns null when no status line', () => {
    expect(parseState('Phase: 1 of 3')).toBeNull();
  });

  test('returns null for missing status', () => {
    const content = 'Phase: 3\nSome other content';
    const result = parseState(content);
    expect(result).toBeNull();
  });

  test('returns null for empty content', () => {
    expect(parseState('')).toBeNull();
  });

  test('normalizes leading zeros', () => {
    const content = '**Phase**: 01\n**Status**: planned';
    const result = parseState(content);
    expect(result.phase).toBe('1');
  });

  test('handles decimal phase numbers', () => {
    const content = 'Phase: 3.1\nStatus: planned';
    const result = parseState(content);
    expect(result.phase).toBe('3.1');
  });
});

describe('getRoadmapPhaseStatus', () => {
  const standardTable = `# Roadmap

## Phase Overview
| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init project | 2 | 1 | planned |
| 02 | Auth | Add login | 3 | 1 | built |
| 03 | API | REST endpoints | 4 | 2 | pending |
`;

  const compactTable = `## Progress
| Phase | Name | Plans | Status |
|---|---|---|---|
| 1 | Setup | 1 | complete |
| 2 | API | 0 | building |
| 3 | UI | 0 | pending |
`;

  test('finds status for a matching phase', () => {
    expect(getRoadmapPhaseStatus(standardTable, '1')).toBe('planned');
    expect(getRoadmapPhaseStatus(standardTable, '2')).toBe('built');
    expect(getRoadmapPhaseStatus(standardTable, '3')).toBe('pending');
  });

  test('finds status in compact table', () => {
    expect(getRoadmapPhaseStatus(compactTable, '1')).toBe('complete');
    expect(getRoadmapPhaseStatus(compactTable, '2')).toBe('building');
  });

  test('normalizes phase numbers (03 matches 3)', () => {
    expect(getRoadmapPhaseStatus(standardTable, '1')).toBe('planned');
  });

  test('handles zero-padded phase numbers', () => {
    const table = `## Progress
| Phase | Name | Plans | Status |
|---|---|---|---|
| 01 | Setup | 1 | complete |
`;
    expect(getRoadmapPhaseStatus(table, '1')).toBe('complete');
  });

  test('returns null for missing phase', () => {
    expect(getRoadmapPhaseStatus(standardTable, '99')).toBeNull();
  });

  test('returns null for nonexistent phase', () => {
    expect(getRoadmapPhaseStatus(compactTable, '9')).toBeNull();
  });

  test('returns null for empty content', () => {
    expect(getRoadmapPhaseStatus('', '1')).toBeNull();
  });

  test('returns null for content without table', () => {
    expect(getRoadmapPhaseStatus('# Roadmap\nNo table here', '1')).toBeNull();
  });

  test('returns null when no table found', () => {
    expect(getRoadmapPhaseStatus('# Roadmap\nNo table', '1')).toBeNull();
  });

  test('handles varying column counts', () => {
    const table = `| Phase | Name | Status |
|-------|------|--------|
| 01 | Setup | done |
`;
    expect(getRoadmapPhaseStatus(table, '1')).toBe('done');
  });

  test('handles case-insensitive column headers', () => {
    const table = `| phase | name | goal | plans | wave | status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init | 2 | 1 | verified |
`;
    expect(getRoadmapPhaseStatus(table, '1')).toBe('verified');
  });

  test('handles table not under Phase Overview heading', () => {
    const table = `# Something Else
| Phase | Name | Status |
|-------|------|--------|
| 05 | Deploy | complete |
`;
    expect(getRoadmapPhaseStatus(table, '5')).toBe('complete');
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

describe('parseRoadmapPhases', () => {
  test('extracts NN-slug patterns from ROADMAP.md content', () => {
    const content = `# Roadmap

## Phase Overview
| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01-setup | Setup | Init project | 2 | 1 | planned |
| 02-auth | Auth | Add login | 3 | 1 | built |
| 03-api | API | REST endpoints | 4 | 2 | pending |
`;
    const phases = parseRoadmapPhases(content);
    expect(phases).toContain('01-setup');
    expect(phases).toContain('02-auth');
    expect(phases).toContain('03-api');
    expect(phases).toHaveLength(3);
  });

  test('extracts phases from heading references', () => {
    const content = `## Phase 01-setup
Some description
## Phase 02-auth
More description`;
    const phases = parseRoadmapPhases(content);
    expect(phases).toContain('01-setup');
    expect(phases).toContain('02-auth');
  });

  test('deduplicates repeated phase references', () => {
    const content = `01-setup is referenced here
and 01-setup is referenced again`;
    const phases = parseRoadmapPhases(content);
    expect(phases.filter(p => p === '01-setup')).toHaveLength(1);
  });

  test('returns empty array for content without phase patterns', () => {
    const content = '# Roadmap\nNo phase directories here';
    expect(parseRoadmapPhases(content)).toEqual([]);
  });

  test('ignores single-digit prefixes without proper slug', () => {
    const content = 'Phase 1 is active\nphase 2 next';
    expect(parseRoadmapPhases(content)).toEqual([]);
  });

  test('handles multi-word slugs with hyphens', () => {
    const content = '| 01-user-auth-system | Setup |';
    const phases = parseRoadmapPhases(content);
    expect(phases).toContain('01-user-auth-system');
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

  test('regression mismatch returns blocking decision', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 01\n**Status**: built');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '| Phase | Name | Status |\n|---|---|---|\n| 01 | Setup | planned |');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('regression');
    expect(result.output.reason).toContain('Phase 1');
  });

  test('missing phase in ROADMAP triggers CRITICAL warning', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 05\n**Status**: built');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '| Phase | Name | Status |\n|---|---|---|\n| 01 | Setup | planned |');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toMatch(/^CRITICAL:/);
    expect(result.output.additionalContext).toContain('Phase 5');
    expect(result.output.additionalContext).toContain('not listed in ROADMAP.md');
  });

  test('returns blocking decision for status regression', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 03\n**Status**: verified');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '| Phase | Status |\n|---|---|\n| 03 | planned |');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('regression');
  });

  test('returns advisory for non-regression mismatch', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 01\n**Status**: planned');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '| Phase | Status |\n|---|---|\n| 01 | built |');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toBeDefined();
    expect(result.output.decision).toBeUndefined();
  });
});

describe('checkFilesystemDrift', () => {
  test('returns empty warnings when all phases match', () => {
    const phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '01-setup'));
    fs.mkdirSync(path.join(phasesDir, '02-auth'));

    const roadmap = `| 01-setup | Setup | planned |
| 02-auth | Auth | built |`;

    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toEqual([]);
  });

  test('warns about missing phase directories', () => {
    const phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '01-setup'));

    const roadmap = `| 01-setup | Setup | planned |
| 02-auth | Auth | built |`;

    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Phase directory missing');
    expect(warnings[0]).toContain('02-auth');
    expect(warnings[0]).toContain('referenced in ROADMAP.md');
  });

  test('warns about orphaned phase directories', () => {
    const phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '01-setup'));
    fs.mkdirSync(path.join(phasesDir, '99-orphan'));

    const roadmap = `| 01-setup | Setup | planned |`;

    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Orphaned phase directory');
    expect(warnings[0]).toContain('99-orphan');
    expect(warnings[0]).toContain('not referenced in ROADMAP.md');
  });

  test('detects both missing and orphaned simultaneously', () => {
    const phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '03-extra'));

    const roadmap = `| 01-setup | Setup | planned |`;

    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toHaveLength(2);
    const missing = warnings.find(w => w.includes('missing'));
    const orphaned = warnings.find(w => w.includes('Orphaned'));
    expect(missing).toContain('01-setup');
    expect(orphaned).toContain('03-extra');
  });

  test('returns empty when phases directory does not exist', () => {
    const phasesDir = path.join(tmpDir, 'nonexistent');
    const roadmap = `| 01-setup | Setup | planned |`;
    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toEqual([]);
  });

  test('ignores non-directory entries in phases folder', () => {
    const phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '01-setup'));
    fs.writeFileSync(path.join(phasesDir, '02-notes.txt'), 'just a file');

    const roadmap = `| 01-setup | Setup | planned |`;

    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toEqual([]);
  });

  test('ignores directories that do not match NN-slug pattern', () => {
    const phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '01-setup'));
    fs.mkdirSync(path.join(phasesDir, 'temp'));
    fs.mkdirSync(path.join(phasesDir, '.hidden'));

    const roadmap = `| 01-setup | Setup | planned |`;

    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toEqual([]);
  });
});

describe('isHighRisk', () => {
  test('returns true when verified phase regresses to planned in ROADMAP', () => {
    const state = '**Phase**: 03\n**Status**: verified';
    const roadmap = '| Phase | Status |\n|---|---|\n| 03 | planned |';
    expect(isHighRisk(state, roadmap)).toBe(true);
  });

  test('returns true when verified phase regresses to built', () => {
    const state = '**Phase**: 02\n**Status**: verified';
    const roadmap = '| Phase | Status |\n|---|---|\n| 02 | built |';
    expect(isHighRisk(state, roadmap)).toBe(true);
  });

  test('returns true when built phase regresses to planned', () => {
    const state = '**Phase**: 01\n**Status**: built';
    const roadmap = '| Phase | Status |\n|---|---|\n| 01 | planned |';
    expect(isHighRisk(state, roadmap)).toBe(true);
  });

  test('returns false when status advances (planned -> built)', () => {
    const state = '**Phase**: 01\n**Status**: planned';
    const roadmap = '| Phase | Status |\n|---|---|\n| 01 | built |';
    expect(isHighRisk(state, roadmap)).toBe(false);
  });

  test('returns false when statuses match', () => {
    const state = '**Phase**: 01\n**Status**: built';
    const roadmap = '| Phase | Status |\n|---|---|\n| 01 | built |';
    expect(isHighRisk(state, roadmap)).toBe(false);
  });

  test('returns false when state cannot be parsed', () => {
    expect(isHighRisk('no phase here', '| Phase | Status |\n|---|---|\n| 01 | built |')).toBe(false);
  });

  test('returns true when phase ordering skips a number', () => {
    const state = '**Phase**: 01\n**Status**: planned';
    const roadmap = '| Phase | Status |\n|---|---|\n| 01 | planned |\n| 03 | planned |';
    expect(isHighRisk(state, roadmap)).toBe(true);
  });

  test('returns false for consecutive phase ordering', () => {
    const state = '**Phase**: 01\n**Status**: planned';
    const roadmap = '| Phase | Status |\n|---|---|\n| 01 | planned |\n| 02 | planned |';
    expect(isHighRisk(state, roadmap)).toBe(false);
  });
});

describe('getRoadmapPhaseStatus with <details> wrapped milestones', () => {
  test('finds phase status inside <details> block', () => {
    const content = `# Roadmap

<details>
<summary>

## Milestone v1.0 -- COMPLETED

</summary>

| Phase | Name | Status |
|---|---|---|
| 01 | Setup | Verified |
| 02 | Auth | Verified |

</details>
`;
    expect(getRoadmapPhaseStatus(content, '1')).toBe('Verified');
    expect(getRoadmapPhaseStatus(content, '2')).toBe('Verified');
  });

  test('parseRoadmapPhases finds phases inside <details> blocks', () => {
    const content = `# Roadmap

<details>
<summary>

## Milestone v1.0

</summary>

| 01-setup | Setup | Verified |
| 02-auth | Auth | Verified |

</details>

| 03-api | API | building |
`;
    const phases = parseRoadmapPhases(content);
    expect(phases).toContain('01-setup');
    expect(phases).toContain('02-auth');
    expect(phases).toContain('03-api');
  });
});

describe('validatePostMilestone', () => {
  test('passes when all phases in milestone are verified', () => {
    const roadmap = `| Phase | Name | Status |
|---|---|---|
| 01 | Setup | Verified |
| 02 | Auth | Verified |`;
    const result = validatePostMilestone(roadmap, 'v1.0');
    expect(result).toBeNull();
  });

  test('passes when all phases are archived', () => {
    const roadmap = `| Phase | Name | Status |
|---|---|---|
| 01 | Setup | Archived |
| 02 | Auth | Verified |`;
    const result = validatePostMilestone(roadmap, 'v1.0');
    expect(result).toBeNull();
  });

  test('blocks when a phase is not verified', () => {
    const roadmap = `| Phase | Name | Status |
|---|---|---|
| 01 | Setup | Verified |
| 02 | Auth | Built |`;
    const result = validatePostMilestone(roadmap, 'v1.0');
    expect(result).not.toBeNull();
    expect(result.decision).toBe('block');
    expect(result.reason).toContain('Phase 2');
  });

  test('blocks when a phase is still planned', () => {
    const roadmap = `| Phase | Name | Status |
|---|---|---|
| 01 | Setup | Planned |`;
    const result = validatePostMilestone(roadmap, 'v1.0');
    expect(result).not.toBeNull();
    expect(result.decision).toBe('block');
  });

  test('passes with collapsed/COMPLETED milestone section', () => {
    const roadmap = `## Milestone v1.0 — COMPLETED
See archive.`;
    const result = validatePostMilestone(roadmap, 'v1.0');
    expect(result).toBeNull();
  });
});

describe('collapsed milestone parsing', () => {
  test('parsing phases from inside single <details> block works', () => {
    const content = `# Roadmap

<details>
<summary>

## Milestone v1.0 -- SHIPPED

</summary>

| Phase | Name | Status |
|---|---|---|
| 01 | Setup | Verified |
| 02 | Auth | Verified |
| 03 | API | building |
| 04 | UI | planned |

</details>
`;
    expect(getRoadmapPhaseStatus(content, '1')).toBe('Verified');
    expect(getRoadmapPhaseStatus(content, '3')).toBe('building');
    expect(getRoadmapPhaseStatus(content, '4')).toBe('planned');
  });

  test('phases in separate <details> blocks — only first table found', () => {
    // getRoadmapPhaseStatus reads the first Phase|Status table it finds,
    // so phases in a second table after non-table content are not found
    const content = `<details><summary>v1.0</summary>
| Phase | Name | Status |
|---|---|---|
| 01 | Setup | Verified |
</details>

<details><summary>v2.0</summary>
| Phase | Name | Status |
|---|---|---|
| 03 | API | building |
</details>`;
    expect(getRoadmapPhaseStatus(content, '1')).toBe('Verified');
    // Phase 3 is in a second table block — returns null
    expect(getRoadmapPhaseStatus(content, '3')).toBeNull();
  });

  test('SHIPPED milestone phases still return their status', () => {
    const content = `<details><summary>## Milestone v1.0 -- SHIPPED</summary>
| Phase | Status |
|---|---|
| 01 | Verified |
</details>`;
    expect(getRoadmapPhaseStatus(content, '1')).toBe('Verified');
  });

  test('parseRoadmapPhases finds phase slugs inside nested <details>', () => {
    const content = `<details>
<summary>v1.0</summary>
| 01-setup | Setup |
| 02-auth | Auth |
</details>
<details>
<summary>v2.0</summary>
| 03-api-endpoints | API |
</details>`;
    const phases = parseRoadmapPhases(content);
    expect(phases).toContain('01-setup');
    expect(phases).toContain('02-auth');
    expect(phases).toContain('03-api-endpoints');
  });
});

describe('phase status conflicts', () => {
  test('STATE says building but ROADMAP says planned triggers warning', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 02\n**Status**: built');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '| Phase | Status |\n|---|---|\n| 02 | planned |');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    // built > planned = regression = block
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('regression');
  });

  test('STATE says verified but ROADMAP says building triggers block', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 03\n**Status**: verified');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '| Phase | Status |\n|---|---|\n| 03 | built |');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
  });

  test('STATE says planned but ROADMAP says built is advisory not block', () => {
    const statePath = path.join(planningDir, 'STATE.md');
    fs.writeFileSync(statePath, '**Phase**: 01\n**Status**: planned');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '| Phase | Status |\n|---|---|\n| 01 | built |');
    const result = checkSync({ tool_input: { file_path: statePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('out of sync');
    expect(result.output.decision).toBeUndefined();
  });
});

describe('filesystem drift with extra phase dirs', () => {
  test('phase dir 99-extra exists but not in ROADMAP warns about orphan', () => {
    const phasesDir = path.join(tmpDir, 'drift-phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '01-setup'));
    fs.mkdirSync(path.join(phasesDir, '99-extra'));

    const roadmap = '| 01-setup | Setup | planned |';
    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings.some(w => w.includes('Orphaned') && w.includes('99-extra'))).toBe(true);
  });

  test('multiple orphaned dirs all reported', () => {
    const phasesDir = path.join(tmpDir, 'drift-multi');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '50-alpha'));
    fs.mkdirSync(path.join(phasesDir, '51-beta'));

    const roadmap = '# No phase slugs here';
    const warnings = checkFilesystemDrift(roadmap, phasesDir);
    expect(warnings).toHaveLength(2);
  });
});

describe('malformed ROADMAP', () => {
  test('missing milestones table returns null for phase lookup', () => {
    const content = '# Roadmap\n\nJust some text, no tables at all.\n';
    expect(getRoadmapPhaseStatus(content, '1')).toBeNull();
  });

  test('missing progress table returns empty phase list', () => {
    const content = '# Roadmap\n\nNo table whatsoever.\n';
    expect(parseRoadmapPhases(content)).toEqual([]);
  });

  test('truncated frontmatter does not crash parseState', () => {
    const content = '---\nphase: 3';
    // No closing --- and no status line
    expect(parseState(content)).toBeNull();
  });

  test('table with malformed rows is handled', () => {
    const content = '| Phase | Status |\n|---|---|\n| | |\n| not-a-number | built |\n';
    expect(getRoadmapPhaseStatus(content, '1')).toBeNull();
  });

  test('empty ROADMAP content returns null', () => {
    expect(getRoadmapPhaseStatus('', '1')).toBeNull();
    expect(parseRoadmapPhases('')).toEqual([]);
  });
});

describe('main() parse-failure catch block', () => {
  test('malformed stdin emits additionalContext and exits 0', () => {
    const result = runScript('{ not valid json !!!', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('additionalContext');
  });

  test('valid STATE.md path but file points to non-STATE.md exits 0 silently', () => {
    const input = JSON.stringify({
      tool_input: { file_path: path.join(tmpDir, '.planning', 'PLAN.md') }
    });
    const result = runScript(input, tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('');
  });
});

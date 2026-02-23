const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { parseState, getRoadmapPhaseStatus, checkSync, parseRoadmapPhases, checkFilesystemDrift } = require('../plugins/pbr/scripts/check-roadmap-sync');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-roadmap-sync.js');

function runScript(input, cwd) {
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 5000,
      cwd: cwd || process.cwd(),
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status || 1, output: e.stdout || '' };
  }
}

describe('check-roadmap-sync.js', () => {
  describe('parseState', () => {
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

    test('returns null for missing phase', () => {
      const content = 'Status: planned';
      const result = parseState(content);
      expect(result).toBeNull();
    });

    test('returns null for missing status', () => {
      const content = 'Phase: 3\nSome other content';
      const result = parseState(content);
      expect(result).toBeNull();
    });

    test('returns null for empty content', () => {
      const result = parseState('');
      expect(result).toBeNull();
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

    test('finds status for a matching phase', () => {
      expect(getRoadmapPhaseStatus(standardTable, '1')).toBe('planned');
      expect(getRoadmapPhaseStatus(standardTable, '2')).toBe('built');
      expect(getRoadmapPhaseStatus(standardTable, '3')).toBe('pending');
    });

    test('normalizes phase numbers (03 matches 3)', () => {
      // The table has "01" but we query with "1"
      expect(getRoadmapPhaseStatus(standardTable, '1')).toBe('planned');
    });

    test('returns null for missing phase', () => {
      expect(getRoadmapPhaseStatus(standardTable, '99')).toBeNull();
    });

    test('returns null for empty content', () => {
      expect(getRoadmapPhaseStatus('', '1')).toBeNull();
    });

    test('returns null for content without table', () => {
      expect(getRoadmapPhaseStatus('# Roadmap\nNo table here', '1')).toBeNull();
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
      // getRoadmapPhaseStatus looks for any table with Phase/Status columns
      const table = `# Something Else
| Phase | Name | Status |
|-------|------|--------|
| 05 | Deploy | complete |
`;
      expect(getRoadmapPhaseStatus(table, '5')).toBe('complete');
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

  describe('checkSync CRITICAL warnings', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sync-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupFiles(stateContent, roadmapContent) {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      const statePath = path.join(planningDir, 'STATE.md');
      fs.writeFileSync(statePath, stateContent);
      if (roadmapContent !== undefined) {
        fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmapContent);
      }
      return statePath;
    }

    test('mismatch warning includes CRITICAL prefix', () => {
      const statePath = setupFiles(
        '**Phase**: 01\n**Status**: built',
        '| Phase | Name | Status |\n|---|---|---|\n| 01 | Setup | planned |'
      );
      const origCwd = process.cwd();
      try {
        process.chdir(tmpDir);
        const result = checkSync({ tool_input: { file_path: statePath } });
        expect(result).not.toBeNull();
        expect(result.output.additionalContext).toMatch(/^CRITICAL:/);
        expect(result.output.additionalContext).toContain('Phase 1');
        expect(result.output.additionalContext).toContain('"planned"');
        expect(result.output.additionalContext).toContain('"built"');
        expect(result.output.additionalContext).toContain('Update the ROADMAP.md Progress table NOW');
      } finally {
        process.chdir(origCwd);
      }
    });

    test('missing phase in ROADMAP triggers CRITICAL warning', () => {
      const statePath = setupFiles(
        '**Phase**: 05\n**Status**: built',
        '| Phase | Name | Status |\n|---|---|---|\n| 01 | Setup | planned |'
      );
      const origCwd = process.cwd();
      try {
        process.chdir(tmpDir);
        const result = checkSync({ tool_input: { file_path: statePath } });
        expect(result).not.toBeNull();
        expect(result.output.additionalContext).toMatch(/^CRITICAL:/);
        expect(result.output.additionalContext).toContain('Phase 5');
        expect(result.output.additionalContext).toContain('not listed in ROADMAP.md');
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('checkFilesystemDrift', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-drift-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

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
      // 02-auth is NOT created on disk

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
      // 01-setup referenced in ROADMAP but missing on disk

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

  describe('main() parse-failure catch block', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-rsync-main-'));
      fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('malformed stdin emits additionalContext and exits 0', () => {
      // Passing invalid JSON triggers the catch block in main()
      const result = runScript('{ not valid json !!!', tmpDir);
      expect(result.exitCode).toBe(0);
      // Parse failure emits an additionalContext warning
      expect(result.output).toContain('additionalContext');
    });

    test('valid STATE.md path but file points to non-STATE.md exits 0 silently', () => {
      // The main() exits 0 when filePath doesn't end in STATE.md
      const input = JSON.stringify({
        tool_input: { file_path: path.join(tmpDir, '.planning', 'PLAN.md') }
      });
      const result = runScript(input, tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
    });
  });
});

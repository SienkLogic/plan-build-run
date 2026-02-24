import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs BEFORE importing the module under test
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock node:child_process for git calls
vi.mock('node:child_process', () => ({
  execFile: vi.fn()
}));

// Import AFTER mock is set up
const {
  parseStateFile,
  parseRoadmapFile,
  getDashboardData,
  getRecentActivity,
  deriveQuickActions,
  _clearActivityCache
} = await import('../../src/services/dashboard.service.js');
const { execFile } = await import('node:child_process');

/** Helper: mock execFile to return empty git output (no activity) */
function mockNoGitOutput() {
  execFile.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(null, { stdout: '', stderr: '' });
  });
}

const VALID_STATE_MD = `# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-07)
**Core value:** Visual insight into Plan-Build-Run project progress
**Current focus:** Phase 3 - UI Shell

## Current Position
Phase: 3 of 12 (UI Shell)
Plan: 2 of 2 complete
Status: Built and verified
Last activity: 2026-02-08 -- Phase 3 built (2 plans, 5 tasks, 5 commits)
Progress: [█████░░░░░░░░░░░░░░░] 25%
`;

const VALID_ROADMAP_MD = `# Roadmap: Plan-Build-Run Dashboard

## Phases

- [x] Phase 01: Project Scaffolding -- Node.js project structure
- [x] Phase 02: Core Parsing Layer -- Markdown/YAML repository
- [x] Phase 03: UI Shell -- EJS layout system
- [ ] Phase 04: Dashboard Landing Page -- Project overview page
- [ ] Phase 05: Phase Detail View -- Phase detail page
`;

describe('DashboardService', () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    _clearActivityCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
    _clearActivityCache();
  });

  describe('parseStateFile', () => {
    it('should extract all fields from valid STATE.md', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': VALID_STATE_MD
      });

      const result = await parseStateFile('/project');

      expect(result.projectName).toContain('Phase 3 - UI Shell');
      expect(result.currentPhase.id).toBe(3);
      expect(result.currentPhase.total).toBe(12);
      expect(result.currentPhase.name).toBe('UI Shell');
      expect(result.currentPhase.planStatus).toContain('2 of 2 complete');
      expect(result.lastActivity.date).toBe('2026-02-08');
      expect(result.lastActivity.description).toContain('Phase 3 built');
      expect(result.progress).toBe(25);
    });

    it('should return fallback when STATE.md does not exist', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await parseStateFile('/project');

      expect(result.projectName).toBe('Unknown Project');
      expect(result.currentPhase.id).toBe(0);
      expect(result.currentPhase.name).toBe('Not Started');
      expect(result.lastActivity.description).toBe('No activity recorded');
      expect(result.progress).toBe(0);
    });

    it('should return fallback when .planning/ directory does not exist', async () => {
      vol.fromJSON({
        '/project/README.md': '# Root readme'
      });

      const result = await parseStateFile('/project');

      expect(result.projectName).toBe('Unknown Project');
      expect(result.currentPhase.id).toBe(0);
      expect(result.currentPhase.name).toBe('Not Started');
      expect(result.lastActivity.description).toBe('No activity recorded');
      expect(result.progress).toBe(0);
    });

    it('should handle STATE.md with missing sections gracefully', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': '# Project State\n\nSome text but no sections'
      });

      const result = await parseStateFile('/project');

      expect(result.projectName).toBe('Project State');
      expect(result.currentPhase.id).toBe(0);
      expect(result.progress).toBe(0);
    });

    it('should handle UTF-8 BOM in STATE.md', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': '\uFEFF' + VALID_STATE_MD
      });

      const result = await parseStateFile('/project');

      expect(result.currentPhase.id).toBe(3);
    });
  });

  describe('parseRoadmapFile', () => {
    it('should extract phases with mixed checkbox states', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await parseRoadmapFile('/project');

      expect(result.phases.length).toBe(5);
      expect(result.phases[0].id).toBe(1);
      expect(result.phases[0].name).toBe('Project Scaffolding');
      expect(result.phases[0].status).toBe('complete');
      expect(result.phases[3].id).toBe(4);
      expect(result.phases[3].status).toBe('not-started');
      expect(result.progress).toBe(60);
    });

    it('should handle all phases complete', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': `# Roadmap

## Phases

- [x] Phase 01: Setup -- Initial setup
- [x] Phase 02: Build -- Build phase
`
      });

      const result = await parseRoadmapFile('/project');

      expect(result.progress).toBe(100);
    });

    it('should handle all phases incomplete', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': `# Roadmap

## Phases

- [ ] Phase 01: Setup -- Initial setup
- [ ] Phase 02: Build -- Build phase
- [ ] Phase 03: Deploy -- Deploy phase
`
      });

      const result = await parseRoadmapFile('/project');

      expect(result.progress).toBe(0);
    });

    it('should handle empty phases section', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': '# Roadmap\n\n## Phases\n\nNo phases yet.'
      });

      const result = await parseRoadmapFile('/project');

      expect(result.phases.length).toBe(0);
      expect(result.progress).toBe(0);
    });

    it('should return fallback when ROADMAP.md does not exist', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': VALID_STATE_MD
      });

      const result = await parseRoadmapFile('/project');

      expect(result.phases).toEqual([]);
      expect(result.progress).toBe(0);
    });

    it('should handle uppercase X in checkboxes', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': '- [X] Phase 01: Setup -- description'
      });

      const result = await parseRoadmapFile('/project');

      expect(result.phases[0].status).toBe('complete');
    });

    it('should handle UTF-8 BOM in ROADMAP.md', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': '\uFEFF' + VALID_ROADMAP_MD
      });

      const result = await parseRoadmapFile('/project');

      expect(result.phases.length).toBe(5);
      expect(result.phases[0].status).toBe('complete');
    });
  });

  describe('getDashboardData', () => {
    it('should combine state and roadmap data', async () => {
      mockNoGitOutput();
      vol.fromJSON({
        '/project/.planning/STATE.md': VALID_STATE_MD,
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await getDashboardData('/project');

      expect(result.projectName).toContain('Phase 3');
      expect(result.phases.length).toBe(5);
      expect(result.progress).toBe(60);
    });

    it('should mark current phase as in-progress', async () => {
      mockNoGitOutput();
      // Use a ROADMAP where Phase 03 is NOT complete ([ ]) so it can be marked in-progress
      const roadmapWithPhase3Incomplete = `# Roadmap: Plan-Build-Run Dashboard

## Phases

- [x] Phase 01: Project Scaffolding -- Node.js project structure
- [x] Phase 02: Core Parsing Layer -- Markdown/YAML repository
- [ ] Phase 03: UI Shell -- EJS layout system
- [ ] Phase 04: Dashboard Landing Page -- Project overview page
- [ ] Phase 05: Phase Detail View -- Phase detail page
`;

      vol.fromJSON({
        '/project/.planning/STATE.md': VALID_STATE_MD,
        '/project/.planning/ROADMAP.md': roadmapWithPhase3Incomplete
      });

      const result = await getDashboardData('/project');

      // Phase 3 is current (from STATE.md) and not complete ([ ] in ROADMAP.md)
      expect(result.phases[2].status).toBe('in-progress');
      // Other incomplete phases remain not-started
      expect(result.phases[3].status).toBe('not-started');
      expect(result.phases[4].status).toBe('not-started');
    });

    it('should not override complete status with in-progress', async () => {
      mockNoGitOutput();
      const stateWithPhase2 = `# Project State

**Current focus:** Phase 2 - Core Parsing Layer

## Current Position
Phase: 2 of 12 (Core Parsing Layer)
Plan: 1 of 1 complete
Last activity: 2026-02-07 -- Phase 2 built
Progress: [██░░░░░░░░░░░░░░░░░░] 17%
`;

      vol.fromJSON({
        '/project/.planning/STATE.md': stateWithPhase2,
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await getDashboardData('/project');

      // Phase 2 is current but already [x] in ROADMAP, should stay complete
      expect(result.phases[1].status).toBe('complete');
    });

    it('should handle both files missing', async () => {
      mockNoGitOutput();
      vol.fromJSON({
        '/project/package.json': '{}'
      });

      const result = await getDashboardData('/project');

      expect(result.projectName).toBe('Unknown Project');
      expect(result.phases).toEqual([]);
      expect(result.progress).toBe(0);
    });

    it('should handle STATE.md missing but ROADMAP.md present', async () => {
      mockNoGitOutput();
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await getDashboardData('/project');

      expect(result.projectName).toBe('Unknown Project');
      expect(result.phases.length).toBe(5);
      expect(result.progress).toBe(60);
    });

    it('should include recentActivity and quickActions in returned object', async () => {
      mockNoGitOutput();
      vol.fromJSON({
        '/project/.planning/STATE.md': VALID_STATE_MD,
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await getDashboardData('/project');

      expect(result).toHaveProperty('recentActivity');
      expect(result).toHaveProperty('quickActions');
      expect(Array.isArray(result.recentActivity)).toBe(true);
      expect(Array.isArray(result.quickActions)).toBe(true);
    });
  });

  describe('getRecentActivity', () => {
    it('should return empty array when git output is empty', async () => {
      execFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(null, { stdout: '', stderr: '' });
      });

      const result = await getRecentActivity('/project');

      expect(result).toEqual([]);
    });

    it('should parse git log output into activity entries', async () => {
      const gitOutput = `COMMIT:2026-02-24T10:00:00+00:00

.planning/STATE.md
.planning/ROADMAP.md
COMMIT:2026-02-23T09:00:00+00:00

.planning/phases/36-test/PLAN-01.md
.planning/STATE.md
`;

      execFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(null, { stdout: gitOutput, stderr: '' });
      });

      const result = await getRecentActivity('/project');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('path');
      expect(result[0]).toHaveProperty('timestamp');
      expect(result[0]).toHaveProperty('type', 'commit');
    });

    it('should de-duplicate paths keeping most recent occurrence', async () => {
      const gitOutput = `COMMIT:2026-02-24T10:00:00+00:00

.planning/STATE.md
COMMIT:2026-02-23T09:00:00+00:00

.planning/STATE.md
.planning/ROADMAP.md
`;

      execFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(null, { stdout: gitOutput, stderr: '' });
      });

      const result = await getRecentActivity('/project');

      // STATE.md should appear only once (most recent: 2026-02-24)
      const statePaths = result.filter(e => e.path === '.planning/STATE.md');
      expect(statePaths.length).toBe(1);
      expect(statePaths[0].timestamp).toContain('2026-02-24');
    });

    it('should limit results to 10 entries', async () => {
      // Generate 20 unique files across commits
      const lines = [];
      for (let i = 0; i < 20; i++) {
        lines.push(`COMMIT:2026-02-${String(i + 1).padStart(2, '0')}T10:00:00+00:00`);
        lines.push('');
        lines.push(`.planning/file-${i}.md`);
      }
      const gitOutput = lines.join('\n');

      execFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(null, { stdout: gitOutput, stderr: '' });
      });

      const result = await getRecentActivity('/project');

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should return empty array on git failure', async () => {
      execFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(new Error('git not found'), null);
      });

      const result = await getRecentActivity('/project-failure');

      expect(result).toEqual([]);
    });
  });

  describe('deriveQuickActions', () => {
    it('should return building actions for building status', () => {
      const result = deriveQuickActions({ status: 'building', id: 5 });

      expect(result.length).toBeGreaterThan(0);
      expect(result.some(a => a.primary === true)).toBe(true);
      expect(result[0].label).toBe('Continue Building');
      expect(result[0].href).toBe('/phases/05');
      expect(result[0].primary).toBe(true);
    });

    it('should return building actions for in-progress status', () => {
      const result = deriveQuickActions({ status: 'in-progress', id: 3 });

      expect(result[0].label).toBe('Continue Building');
      expect(result[0].href).toBe('/phases/03');
    });

    it('should return planning actions for planning status', () => {
      const result = deriveQuickActions({ status: 'planning', id: 2 });

      expect(result[0].label).toBe('View Plans');
      expect(result[0].href).toBe('/phases/02');
      expect(result[0].primary).toBe(true);
    });

    it('should return planning actions for planned status', () => {
      const result = deriveQuickActions({ status: 'planned', id: 4 });

      expect(result[0].label).toBe('View Plans');
      expect(result[0].href).toBe('/phases/04');
    });

    it('should return phase/roadmap actions for complete status', () => {
      const result = deriveQuickActions({ status: 'complete', id: 10 });

      const phaseAction = result.find(a => a.label === 'View Phase');
      const roadmapAction = result.find(a => a.label === 'Roadmap');
      expect(phaseAction).toBeDefined();
      expect(phaseAction.primary).toBe(false);
      expect(roadmapAction).toBeDefined();
      expect(roadmapAction.primary).toBe(true);
    });

    it('should return phase/roadmap actions for verified status', () => {
      const result = deriveQuickActions({ status: 'verified', id: 7 });

      const phaseAction = result.find(a => a.label === 'View Phase');
      expect(phaseAction).toBeDefined();
      expect(phaseAction.href).toBe('/phases/07');
    });

    it('should return default action for unknown status', () => {
      const result = deriveQuickActions({ status: 'unknown', id: 1 });

      expect(result.length).toBe(1);
      expect(result[0].label).toBe('Get Started');
      expect(result[0].href).toBe('/roadmap');
      expect(result[0].primary).toBe(true);
    });

    it('should pad phase id to 2 digits', () => {
      const result = deriveQuickActions({ status: 'building', id: 1 });

      expect(result[0].href).toBe('/phases/01');
    });
  });
});

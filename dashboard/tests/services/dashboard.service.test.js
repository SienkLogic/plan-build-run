import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs BEFORE importing the module under test
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { parseStateFile, parseRoadmapFile, getDashboardData } = await import(
  '../../src/services/dashboard.service.js'
);

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
      vol.fromJSON({
        '/project/package.json': '{}'
      });

      const result = await getDashboardData('/project');

      expect(result.projectName).toBe('Unknown Project');
      expect(result.phases).toEqual([]);
      expect(result.progress).toBe(0);
    });

    it('should handle STATE.md missing but ROADMAP.md present', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await getDashboardData('/project');

      expect(result.projectName).toBe('Unknown Project');
      expect(result.phases.length).toBe(5);
      expect(result.progress).toBe(60);
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs BEFORE importing the module under test
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { getRoadmapData } = await import(
  '../../src/services/roadmap.service.js'
);

const VALID_ROADMAP_MD = `# Roadmap: Test Project

## Phases

- [x] Phase 01: Project Scaffolding -- Node.js project structure
- [x] Phase 02: Core Parsing -- Markdown repository
- [ ] Phase 03: UI Shell -- EJS layout system
- [ ] Phase 04: Dashboard -- Project overview page
- [ ] Phase 05: Detail View -- Phase detail page

## Phase Details

### Phase 01: Project Scaffolding
**Goal**: Express server starts
**Depends on**: None (starting phase)
**Plans**: 2 plans

### Phase 02: Core Parsing
**Goal**: Repository layer works
**Depends on**: Phase 01
**Plans**: 2 plans

### Phase 03: UI Shell
**Goal**: Layout system renders
**Depends on**: Phase 01
**Plans**: 2 plans

### Phase 04: Dashboard
**Goal**: Landing page displays data
**Depends on**: Phase 02, Phase 03
**Plans**: 2 plans

### Phase 05: Detail View
**Goal**: Phase detail page works
**Depends on**: Phase 04
**Plans**: 2 plans
`;

describe('RoadmapService', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('getRoadmapData', () => {
    it('should return phases with plan counts and dependencies', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD,
        '/project/.planning/phases/01-project-scaffolding/01-01-PLAN.md': '# Plan',
        '/project/.planning/phases/01-project-scaffolding/01-02-PLAN.md': '# Plan',
        '/project/.planning/phases/02-core-parsing/02-01-PLAN.md': '# Plan',
        '/project/.planning/phases/04-dashboard/04-01-PLAN.md': '# Plan',
        '/project/.planning/phases/04-dashboard/04-02-PLAN.md': '# Plan'
      });

      const result = await getRoadmapData('/project');

      expect(result.phases.length).toBe(5);

      // Phase 01: 2 plans, no dependencies
      expect(result.phases[0].id).toBe(1);
      expect(result.phases[0].name).toBe('Project Scaffolding');
      expect(result.phases[0].status).toBe('complete');
      expect(result.phases[0].planCount).toBe(2);
      expect(result.phases[0].dependencies).toEqual([]);

      // Phase 02: 1 plan, depends on Phase 01
      expect(result.phases[1].planCount).toBe(1);
      expect(result.phases[1].dependencies).toEqual([1]);

      // Phase 03: 0 plans (no directory), depends on Phase 01
      expect(result.phases[2].planCount).toBe(0);
      expect(result.phases[2].dependencies).toEqual([1]);

      // Phase 04: 2 plans, depends on Phase 02 and Phase 03
      expect(result.phases[3].planCount).toBe(2);
      expect(result.phases[3].dependencies).toEqual([2, 3]);

      // Phase 05: 0 plans (no directory), depends on Phase 04
      expect(result.phases[4].planCount).toBe(0);
      expect(result.phases[4].dependencies).toEqual([4]);
    });

    it('should return empty phases array when ROADMAP.md does not exist', async () => {
      vol.fromJSON({
        '/project/package.json': '{}'
      });

      const result = await getRoadmapData('/project');

      expect(result.phases).toEqual([]);
    });

    it('should return 0 plan count when phase directory has no PLAN.md files', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': `# Roadmap

## Phases

- [x] Phase 01: Setup -- desc

## Phase Details

### Phase 01: Setup
**Depends on**: None
`,
        '/project/.planning/phases/01-setup/RESEARCH.md': '# Research'
      });

      const result = await getRoadmapData('/project');

      expect(result.phases[0].planCount).toBe(0);
      expect(result.phases[0].dependencies).toEqual([]);
    });

    it('should return 0 plan count when .planning/phases directory does not exist', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': `# Roadmap

## Phases

- [x] Phase 01: Setup -- desc

## Phase Details

### Phase 01: Setup
**Depends on**: None
`
      });

      const result = await getRoadmapData('/project');

      expect(result.phases[0].planCount).toBe(0);
    });

    it('should return empty dependencies for phases not in Phase Details section', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': `# Roadmap

## Phases

- [x] Phase 01: Setup -- desc
- [ ] Phase 02: Build -- desc
`
      });

      const result = await getRoadmapData('/project');

      expect(result.phases[0].dependencies).toEqual([]);
      expect(result.phases[1].dependencies).toEqual([]);
    });

    it('should handle UTF-8 BOM in ROADMAP.md', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': '\uFEFF' + VALID_ROADMAP_MD
      });

      const result = await getRoadmapData('/project');

      expect(result.phases.length).toBe(5);
    });

    it('should only count files matching NN-NN-PLAN.md pattern', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': `# Roadmap

## Phases

- [x] Phase 01: Setup -- desc

## Phase Details

### Phase 01: Setup
**Depends on**: None
`,
        '/project/.planning/phases/01-setup/01-01-PLAN.md': '# Plan',
        '/project/.planning/phases/01-setup/RESEARCH.md': '# Research',
        '/project/.planning/phases/01-setup/SUMMARY-01-01.md': '# Summary',
        '/project/.planning/phases/01-setup/NOTES.md': '# Notes'
      });

      const result = await getRoadmapData('/project');

      expect(result.phases[0].planCount).toBe(1);
    });

    it('should handle phase with multiple dependencies', async () => {
      vol.fromJSON({
        '/project/.planning/ROADMAP.md': VALID_ROADMAP_MD
      });

      const result = await getRoadmapData('/project');

      // Phase 04 depends on Phase 02 and Phase 03
      expect(result.phases[3].dependencies).toEqual([2, 3]);
      expect(result.phases[3].dependencies.length).toBe(2);
    });
  });
});

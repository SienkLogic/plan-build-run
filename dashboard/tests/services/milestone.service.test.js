import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs BEFORE importing the module under test
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock roadmap service to avoid complex dependency chain
vi.mock('../../src/services/roadmap.service.js', () => ({
  getRoadmapData: vi.fn().mockResolvedValue({ phases: [], milestones: [] })
}));

const { listArchivedMilestones, getAllMilestones, getMilestoneDetail } = await import(
  '../../src/services/milestone.service.js'
);
const { getRoadmapData } = await import('../../src/services/roadmap.service.js');

describe('milestone.service', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('listArchivedMilestones', () => {
    it('returns empty array when milestones dir does not exist', async () => {
      vol.fromJSON({ '/project/.planning/STATE.md': '' });
      const result = await listArchivedMilestones('/project');
      expect(result).toEqual([]);
    });

    it('groups files by version and parses STATS frontmatter', async () => {
      vol.fromJSON({
        '/project/.planning/milestones/v1.0-ROADMAP.md': '# Roadmap\nContent',
        '/project/.planning/milestones/v1.0-STATS.md': '---\nmilestone: "MVP Release"\ncompleted: "2026-01-15"\nduration: "2 weeks"\n---\n\nStats content',
        '/project/.planning/milestones/v1.0-REQUIREMENTS.md': '# Requirements\nContent',
        '/project/.planning/milestones/v2.0-ROADMAP.md': '# Roadmap v2\nContent',
      });

      const result = await listArchivedMilestones('/project');
      expect(result).toHaveLength(2);

      // Newest first
      expect(result[0].version).toBe('2.0');
      expect(result[0].name).toBe('v2.0');
      expect(result[0].files).toHaveLength(1);

      expect(result[1].version).toBe('1.0');
      expect(result[1].name).toBe('MVP Release');
      expect(result[1].date).toBe('2026-01-15');
      expect(result[1].duration).toBe('2 weeks');
      expect(result[1].files).toHaveLength(3);
    });

    it('ignores non-matching files', async () => {
      vol.fromJSON({
        '/project/.planning/milestones/README.md': '# Info',
        '/project/.planning/milestones/v1.0-ROADMAP.md': '# Roadmap',
      });

      const result = await listArchivedMilestones('/project');
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe('1.0');
    });

    it('detects directory-format milestones', async () => {
      vol.fromJSON({
        '/project/.planning/milestones/v2.0/ROADMAP.md': '# Roadmap v2',
        '/project/.planning/milestones/v2.0/STATS.md': '---\nmilestone: "Beta Release"\ncompleted: "2026-02-01"\nduration: "3 weeks"\n---\n\nStats',
        '/project/.planning/milestones/v2.0/REQUIREMENTS.md': '# Reqs',
      });

      const result = await listArchivedMilestones('/project');
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe('2.0');
      expect(result[0].name).toBe('Beta Release');
      expect(result[0].date).toBe('2026-02-01');
      expect(result[0].files).toHaveLength(3);
      expect(result[0].files).toContain('STATS.md');
    });

    it('handles mixed formats with directory taking precedence', async () => {
      vol.fromJSON({
        // v1.0 in flat format
        '/project/.planning/milestones/v1.0-ROADMAP.md': '# Roadmap v1',
        '/project/.planning/milestones/v1.0-STATS.md': '---\nmilestone: "MVP"\n---\n\nStats',
        // v2.0 in directory format
        '/project/.planning/milestones/v2.0/ROADMAP.md': '# Roadmap v2',
        '/project/.planning/milestones/v2.0/STATS.md': '---\nmilestone: "Beta"\n---\n\nStats',
      });

      const result = await listArchivedMilestones('/project');
      expect(result).toHaveLength(2);
      // Newest first
      expect(result[0].version).toBe('2.0');
      expect(result[0].name).toBe('Beta');
      expect(result[1].version).toBe('1.0');
      expect(result[1].name).toBe('MVP');
    });

    it('directory format takes precedence over flat files for same version', async () => {
      vol.fromJSON({
        // Both formats for v1.0 — directory should win
        '/project/.planning/milestones/v1.0/ROADMAP.md': '# Dir format',
        '/project/.planning/milestones/v1.0/STATS.md': '---\nmilestone: "From Dir"\n---\n\nStats',
        '/project/.planning/milestones/v1.0-ROADMAP.md': '# Flat format',
        '/project/.planning/milestones/v1.0-STATS.md': '---\nmilestone: "From Flat"\n---\n\nStats',
      });

      const result = await listArchivedMilestones('/project');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('From Dir');
      // files should be from directory format (no version prefix)
      expect(result[0].files).toContain('ROADMAP.md');
      expect(result[0].files).not.toContain('v1.0-ROADMAP.md');
    });
  });

  describe('getAllMilestones', () => {
    it('combines active and archived milestones', async () => {
      getRoadmapData.mockResolvedValueOnce({
        phases: [],
        milestones: [{ name: 'Active M', startPhase: 1, endPhase: 3 }]
      });

      vol.fromJSON({
        '/project/.planning/milestones/v1.0-ROADMAP.md': '# Old roadmap',
      });

      const result = await getAllMilestones('/project');
      expect(result.active).toHaveLength(1);
      expect(result.active[0].name).toBe('Active M');
      expect(result.archived).toHaveLength(1);
      expect(result.archived[0].version).toBe('1.0');
    });
  });

  describe('getMilestoneDetail', () => {
    it('reads available files for a version', async () => {
      vol.fromJSON({
        '/project/.planning/milestones/v1.0-ROADMAP.md': '---\ntitle: Roadmap\n---\n\n# Phase Overview\n\nContent here',
        '/project/.planning/milestones/v1.0-STATS.md': '---\nmilestone: MVP\n---\n\nStat data',
      });

      const result = await getMilestoneDetail('/project', '1.0');
      expect(result.version).toBe('1.0');
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].type).toBe('ROADMAP');
      expect(result.sections[0].html).toContain('Phase Overview');
      expect(result.sections[1].type).toBe('STATS');
    });

    it('reads from directory format', async () => {
      vol.fromJSON({
        '/project/.planning/milestones/v2.0/ROADMAP.md': '---\ntitle: Roadmap\n---\n\n# Phase Overview v2\n\nContent here',
        '/project/.planning/milestones/v2.0/STATS.md': '---\nmilestone: Beta\n---\n\nStat data',
      });

      const result = await getMilestoneDetail('/project', '2.0');
      expect(result.version).toBe('2.0');
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].type).toBe('ROADMAP');
      expect(result.sections[0].html).toContain('Phase Overview v2');
      expect(result.sections[1].type).toBe('STATS');
    });

    it('falls back to flat file when directory does not exist', async () => {
      vol.fromJSON({
        '/project/.planning/milestones/v1.0-ROADMAP.md': '---\ntitle: Roadmap\n---\n\n# Old Format\n\nContent',
      });

      const result = await getMilestoneDetail('/project', '1.0');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].type).toBe('ROADMAP');
      expect(result.sections[0].html).toContain('Old Format');
    });

    it('returns empty sections for nonexistent version', async () => {
      vol.fromJSON({
        '/project/.planning/milestones/v1.0-ROADMAP.md': '# Roadmap',
      });

      const result = await getMilestoneDetail('/project', '9.9');
      expect(result.sections).toHaveLength(0);
    });
  });
});

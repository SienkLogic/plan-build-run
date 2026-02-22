import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock node:child_process so git calls return empty
vi.mock('node:child_process', () => ({
  execFile: (_cmd, _args, _opts, cb) => {
    if (cb) cb(null, { stdout: '', stderr: '' });
  }
}));

// Import after mocks
const { getProjectAnalytics, cache } = await import(
  '../../src/services/analytics.service.js'
);

beforeEach(() => {
  vol.reset();
  cache.invalidateAll();
});

describe('getProjectAnalytics', () => {
  it('returns phase counts and summary for a project with phases', async () => {
    vol.fromJSON({
      '/project/.planning/phases/01-setup/PLAN-01.md': '---\nplan_id: "01-01"\n---\n# Plan',
      '/project/.planning/phases/02-build/PLAN-01.md': '---\nplan_id: "02-01"\n---\n# Plan',
      '/project/.planning/phases/02-build/PLAN-02.md': '---\nplan_id: "02-02"\n---\n# Plan',
    });

    const result = await getProjectAnalytics('/project');

    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].phaseId).toBe('01');
    expect(result.phases[0].phaseName).toBe('Setup');
    expect(result.phases[0].planCount).toBe(1);
    expect(result.phases[1].phaseId).toBe('02');
    expect(result.phases[1].planCount).toBe(2);
    expect(result.summary.totalPhases).toBe(2);
  });

  it('returns sensible defaults when .planning/ is empty', async () => {
    vol.fromJSON({
      '/project/.planning/phases/.gitkeep': '',
    });

    const result = await getProjectAnalytics('/project');

    expect(result.phases).toEqual([]);
    expect(result.summary.totalCommits).toBe(0);
    expect(result.summary.totalPhases).toBe(0);
    expect(result.summary.avgDuration).toBe('N/A');
    expect(result.summary.totalLinesChanged).toBe(0);
  });

  it('handles missing phases directory gracefully', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await getProjectAnalytics('/project');

    expect(result.phases).toEqual([]);
    expect(result.warning).toContain('No .planning/phases/');
  });

  it('returns cached result on second call', async () => {
    vol.fromJSON({
      '/project/.planning/phases/01-setup/PLAN-01.md': '---\n---\n# Plan',
    });

    const result1 = await getProjectAnalytics('/project');
    // Modify filesystem - should not affect cached result
    vol.fromJSON({
      '/project/.planning/phases/01-setup/PLAN-01.md': '---\n---\n# Plan',
      '/project/.planning/phases/02-new/PLAN-01.md': '---\n---\n# Plan',
    });
    const result2 = await getProjectAnalytics('/project');

    expect(result2).toBe(result1); // same reference = cached
  });

  it('ignores directories not matching NN- pattern', async () => {
    vol.fromJSON({
      '/project/.planning/phases/01-setup/PLAN-01.md': '---\n---\n',
      '/project/.planning/phases/temp/notes.md': 'ignored',
      '/project/.planning/phases/.hidden/stuff.md': 'ignored',
    });

    const result = await getProjectAnalytics('/project');

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].phaseId).toBe('01');
  });

  it('includes commitCount and linesChanged as numbers', async () => {
    vol.fromJSON({
      '/project/.planning/phases/01-setup/PLAN-01.md': '---\n---\n',
    });

    const result = await getProjectAnalytics('/project');

    expect(typeof result.phases[0].commitCount).toBe('number');
    expect(typeof result.phases[0].linesChanged).toBe('number');
  });
});

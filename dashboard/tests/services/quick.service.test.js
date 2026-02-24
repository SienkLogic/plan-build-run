import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs (used by quick.service.js AND planning.repository.js)
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { listQuickTasks, getQuickTask } = await import(
  '../../src/services/quick.service.js'
);

beforeEach(() => {
  vol.reset();
});

describe('listQuickTasks', () => {
  it('returns empty array when quick dir missing', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await listQuickTasks('/project');

    expect(result).toEqual([]);
  });

  it('returns tasks sorted by id', async () => {
    vol.fromJSON({
      '/project/.planning/quick/002-bar/PLAN.md': '# Bar\n\nBar task.',
      '/project/.planning/quick/001-foo/PLAN.md': '# Foo\n\nFoo task.',
    });

    const result = await listQuickTasks('/project');

    expect(result.length).toBe(2);
    expect(result[0].id).toBe('001');
    expect(result[0].slug).toBe('foo');
    expect(result[1].id).toBe('002');
    expect(result[1].slug).toBe('bar');
  });

  it('reads SUMMARY.md status from frontmatter if present', async () => {
    vol.fromJSON({
      '/project/.planning/quick/001-my-task/PLAN.md': '# My Task\n\nSome plan.',
      '/project/.planning/quick/001-my-task/SUMMARY.md': '---\nstatus: complete\n---\n\n# Summary\n',
    });

    const result = await listQuickTasks('/project');

    expect(result.length).toBe(1);
    expect(result[0].status).toBe('complete');
  });

  it('defaults to in-progress status when no SUMMARY.md', async () => {
    vol.fromJSON({
      '/project/.planning/quick/001-pending-task/PLAN.md': '# Pending\n\nPending task.',
    });

    const result = await listQuickTasks('/project');

    expect(result[0].status).toBe('in-progress');
  });

  it('capitalizes title from slug', async () => {
    vol.fromJSON({
      '/project/.planning/quick/001-add-feature-flag/PLAN.md': '# Plan',
    });

    const result = await listQuickTasks('/project');

    expect(result[0].title).toBe('Add Feature Flag');
  });
});

describe('getQuickTask', () => {
  it('returns plan and summary html for a valid task id', async () => {
    vol.fromJSON({
      '/project/.planning/quick/001-my-feature/PLAN.md': '# My Feature\n\nPlan content here.',
      '/project/.planning/quick/001-my-feature/SUMMARY.md': '---\nstatus: complete\n---\n\n# Summary\n\nSummary content here.',
    });

    const result = await getQuickTask('/project', '001');

    expect(result).not.toBeNull();
    expect(result.id).toBe('001');
    expect(result.slug).toBe('my-feature');
    expect(result.planHtml).toContain('Plan content here');
    expect(result.summaryHtml).toContain('Summary content here');
    expect(result.status).toBe('complete');
  });

  it('returns null for missing task directory', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await getQuickTask('/project', '999');

    expect(result).toBeNull();
  });

  it('returns task with null summaryHtml when no SUMMARY.md', async () => {
    vol.fromJSON({
      '/project/.planning/quick/001-no-summary/PLAN.md': '# Plan\n\nContent.',
    });

    const result = await getQuickTask('/project', '001');

    expect(result).not.toBeNull();
    expect(result.planHtml).toBeTruthy();
    expect(result.summaryHtml).toBeNull();
    expect(result.status).toBe('in-progress');
  });
});

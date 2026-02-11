import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs (used by todo.service.js AND planning.repository.js)
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { listPendingTodos, getTodoDetail, createTodo, completeTodo } = await import(
  '../../src/services/todo.service.js'
);

const TODO_P0 = `---
id: "003"
title: "Critical bug fix"
priority: P0
phase: "02"
status: pending
created: 2026-02-06
---

# Critical bug fix

This is a critical issue that needs immediate attention.
`;

const TODO_P1 = `---
id: "001"
title: "Add audit logging to hook scripts"
priority: P1
phase: general
status: pending
created: 2026-02-07
---

# Add audit logging

Hook scripts currently have no audit trail.
`;

const TODO_P2 = `---
id: "005"
title: "Implement continuation handoff"
priority: P2
phase: general
status: pending
created: 2026-02-07
---

# Continuation handoff

When context limits are reached, implement a handoff strategy.
`;

const TODO_PX = `---
id: "002"
title: "Nice to have feature"
priority: PX
phase: "03"
status: pending
created: 2026-02-08
---

# Nice to have

Low priority improvement.
`;

const TODO_NO_TITLE = `---
id: "004"
priority: P1
status: pending
---

# Missing title in frontmatter
`;

const TODO_NO_PRIORITY = `---
id: "006"
title: "Has title but no priority"
status: pending
---

# No priority field
`;

beforeEach(() => {
  vol.reset();
});

describe('listPendingTodos', () => {
  it('should return todos sorted by priority then title', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/003-critical-bug.md': TODO_P0,
      '/project/.planning/todos/pending/001-audit-logging.md': TODO_P1,
      '/project/.planning/todos/pending/005-continuation.md': TODO_P2,
      '/project/.planning/todos/pending/002-nice-feature.md': TODO_PX,
    });

    const result = await listPendingTodos('/project');

    expect(result.length).toBe(4);
    expect(result[0].priority).toBe('P0');
    expect(result[0].title).toBe('Critical bug fix');
    expect(result[1].priority).toBe('P1');
    expect(result[1].title).toBe('Add audit logging to hook scripts');
    expect(result[2].priority).toBe('P2');
    expect(result[2].title).toBe('Implement continuation handoff');
    expect(result[3].priority).toBe('PX');
    expect(result[3].title).toBe('Nice to have feature');
  });

  it('should sort alphabetically within same priority level', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/010-zebra.md': `---
title: "Zebra task"
priority: P1
---
# Zebra
`,
      '/project/.planning/todos/pending/011-alpha.md': `---
title: "Alpha task"
priority: P1
---
# Alpha
`,
    });

    const result = await listPendingTodos('/project');

    expect(result[0].title).toBe('Alpha task');
    expect(result[1].title).toBe('Zebra task');
  });

  it('should return empty array when pending directory does not exist', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await listPendingTodos('/project');

    expect(result).toEqual([]);
  });

  it('should return empty array when pending directory is empty', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    const result = await listPendingTodos('/project');

    expect(result).toEqual([]);
  });

  it('should skip todos missing required frontmatter fields', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-audit-logging.md': TODO_P1,
      '/project/.planning/todos/pending/004-no-title.md': TODO_NO_TITLE,
      '/project/.planning/todos/pending/006-no-priority.md': TODO_NO_PRIORITY,
    });

    const result = await listPendingTodos('/project');

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('001');
  });

  it('should skip files not matching NNN-*.md filename pattern', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-valid.md': TODO_P1,
      '/project/.planning/todos/pending/README.md': '# Readme',
      '/project/.planning/todos/pending/notes.txt': 'some notes',
    });

    const result = await listPendingTodos('/project');

    expect(result.length).toBe(1);
  });

  it('should use filename ID as fallback when frontmatter has no id field', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/099-no-id.md': `---
title: "No ID field"
priority: P2
---
# Content
`,
    });

    const result = await listPendingTodos('/project');

    expect(result[0].id).toBe('099');
  });

  it('should coerce created date to string', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-audit-logging.md': TODO_P1,
    });

    const result = await listPendingTodos('/project');

    expect(typeof result[0].created).toBe('string');
  });

  it('should handle unknown priority values by sorting them last', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-known.md': `---
title: "Known priority"
priority: P1
---
# Known
`,
      '/project/.planning/todos/pending/002-unknown.md': `---
title: "Unknown priority"
priority: HIGH
---
# Unknown
`,
    });

    const result = await listPendingTodos('/project');

    expect(result[0].priority).toBe('P1');
    expect(result[1].priority).toBe('HIGH');
  });

  it('should include all expected fields on each todo object', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-audit-logging.md': TODO_P1,
    });

    const result = await listPendingTodos('/project');

    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('title');
    expect(result[0]).toHaveProperty('priority');
    expect(result[0]).toHaveProperty('phase');
    expect(result[0]).toHaveProperty('status');
    expect(result[0]).toHaveProperty('created');
    expect(result[0]).toHaveProperty('filename');
    expect(result[0].filename).toBe('001-audit-logging.md');
    expect(result[0].phase).toBe('general');
    expect(result[0].status).toBe('pending');
  });
});

describe('getTodoDetail', () => {
  it('should return full todo detail with rendered HTML', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-audit-logging.md': TODO_P1,
    });

    const result = await getTodoDetail('/project', '001');

    expect(result.id).toBe('001');
    expect(result.title).toBe('Add audit logging to hook scripts');
    expect(result.priority).toBe('P1');
    expect(result.phase).toBe('general');
    expect(result.html).toContain('Add audit logging');
    expect(result.filename).toBe('001-audit-logging.md');
  });

  it('should throw 404 error when no todo matches the given ID', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-audit-logging.md': TODO_P1,
    });

    try {
      await getTodoDetail('/project', '999');
      expect.fail('Expected an error to be thrown');
    } catch (err) {
      expect(err.status).toBe(404);
      expect(err.message).toContain('999');
    }
  });

  it('should throw 404 error when pending directory does not exist', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    try {
      await getTodoDetail('/project', '001');
      expect.fail('Expected an error to be thrown');
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });

  it('should handle UTF-8 BOM in todo file', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-audit-logging.md': '\uFEFF' + TODO_P1,
    });

    const result = await getTodoDetail('/project', '001');

    expect(result.title).toBe('Add audit logging to hook scripts');
  });
});

describe('createTodo', () => {
  it('should create a file in pending directory with correct frontmatter', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    const id = await createTodo('/project', {
      title: 'New task',
      priority: 'P1',
      phase: '09-todo-write-operations',
      description: 'Task description here'
    });

    expect(id).toBe('001');

    const filePath = `/project/.planning/todos/pending/${id}-new-task.md`;
    const content = vol.readFileSync(filePath, 'utf-8');
    expect(content).toContain('title: New task');
    expect(content).toContain('priority: P1');
    expect(content).toContain('phase: 09-todo-write-operations');
    expect(content).toContain('status: pending');
    expect(content).toContain('Task description here');
  });

  it('should generate sequential IDs across multiple creates', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    const id1 = await createTodo('/project', {
      title: 'First',
      priority: 'P1',
      description: 'First task'
    });
    const id2 = await createTodo('/project', {
      title: 'Second',
      priority: 'P2',
      description: 'Second task'
    });

    expect(id1).toBe('001');
    expect(id2).toBe('002');
  });

  it('should account for existing files when generating IDs', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/005-existing.md': TODO_P1,
    });

    const id = await createTodo('/project', {
      title: 'After existing',
      priority: 'P2',
      description: 'Should get ID 006'
    });

    expect(id).toBe('006');
  });

  it('should account for files in done/ directory when generating IDs', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-pending.md': TODO_P1,
      '/project/.planning/todos/done/003-done.md': TODO_P0,
    });

    const id = await createTodo('/project', {
      title: 'After done',
      priority: 'P2',
      description: 'Should get ID 004'
    });

    expect(id).toBe('004');
  });

  it('should create pending directory if it does not exist', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const id = await createTodo('/project', {
      title: 'No dir yet',
      priority: 'P1',
      description: 'Directory should be created'
    });

    expect(id).toBe('001');
    const files = vol.readdirSync('/project/.planning/todos/pending');
    expect(files.length).toBe(1);
  });

  it('should generate filesystem-safe slugs from titles', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    const id = await createTodo('/project', {
      title: 'Fix: Bug #42 (urgent!!)',
      priority: 'P0',
      description: 'Special chars in title'
    });

    const files = vol.readdirSync('/project/.planning/todos/pending');
    const created = files.find(f => f.startsWith(`${id}-`));
    expect(created).toBe(`${id}-fix-bug-42-urgent.md`);
  });

  it('should truncate long slugs to 50 characters', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    const longTitle = 'This is a very long title that should be truncated to fifty characters maximum';
    const id = await createTodo('/project', {
      title: longTitle,
      priority: 'P1',
      description: 'Long title test'
    });

    const files = vol.readdirSync('/project/.planning/todos/pending');
    const created = files.find(f => f.startsWith(`${id}-`));
    const slugPart = created.replace(/^\d{3}-/, '').replace(/\.md$/, '');
    expect(slugPart.length).toBeLessThanOrEqual(50);
  });

  it('should throw 400 error when title is missing', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    try {
      await createTodo('/project', {
        priority: 'P1',
        description: 'No title'
      });
      expect.fail('Expected an error to be thrown');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('should throw 400 error when priority is missing', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    try {
      await createTodo('/project', {
        title: 'Has title',
        description: 'No priority'
      });
      expect.fail('Expected an error to be thrown');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('should throw 400 error when description is missing', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    try {
      await createTodo('/project', {
        title: 'Has title',
        priority: 'P1'
      });
      expect.fail('Expected an error to be thrown');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('should default phase to empty string when not provided', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    const id = await createTodo('/project', {
      title: 'No phase',
      priority: 'P1',
      description: 'Phase should be empty'
    });

    const filePath = `/project/.planning/todos/pending/${id}-no-phase.md`;
    const content = vol.readFileSync(filePath, 'utf-8');
    expect(content).toContain("phase: ''");
  });

  it('should serialize concurrent creates to prevent ID collisions', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/.gitkeep': '',
    });

    const [id1, id2, id3] = await Promise.all([
      createTodo('/project', { title: 'First', priority: 'P1', description: 'A' }),
      createTodo('/project', { title: 'Second', priority: 'P1', description: 'B' }),
      createTodo('/project', { title: 'Third', priority: 'P1', description: 'C' }),
    ]);

    const ids = new Set([id1, id2, id3]);
    expect(ids.size).toBe(3);

    const sorted = [id1, id2, id3].sort();
    expect(sorted).toEqual(['001', '002', '003']);
  });
});

describe('completeTodo', () => {
  it('should move file from pending to done directory', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-test-todo.md': TODO_P1,
    });

    await completeTodo('/project', '001');

    const pendingFiles = vol.readdirSync('/project/.planning/todos/pending');
    expect(pendingFiles.find(f => f.startsWith('001-'))).toBeUndefined();

    const doneFiles = vol.readdirSync('/project/.planning/todos/done');
    expect(doneFiles.find(f => f.startsWith('001-'))).toBe('001-test-todo.md');
  });

  it('should update status to done in frontmatter', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-test-todo.md': TODO_P1,
    });

    await completeTodo('/project', '001');

    const content = vol.readFileSync('/project/.planning/todos/done/001-test-todo.md', 'utf-8');
    expect(content).toContain('status: done');
    expect(content).not.toContain('status: pending');
  });

  it('should preserve other frontmatter fields when updating status', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-test-todo.md': TODO_P1,
    });

    await completeTodo('/project', '001');

    const content = vol.readFileSync('/project/.planning/todos/done/001-test-todo.md', 'utf-8');
    expect(content).toContain('title: Add audit logging to hook scripts');
    expect(content).toContain('priority: P1');
  });

  it('should create done directory if it does not exist', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-test-todo.md': TODO_P1,
    });

    await completeTodo('/project', '001');

    const doneFiles = vol.readdirSync('/project/.planning/todos/done');
    expect(doneFiles.length).toBe(1);
  });

  it('should throw 404 when todo ID does not exist in pending', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-test-todo.md': TODO_P1,
    });

    try {
      await completeTodo('/project', '999');
      expect.fail('Expected an error to be thrown');
    } catch (err) {
      expect(err.status).toBe(404);
      expect(err.message).toContain('999');
    }
  });

  it('should throw 404 when pending directory does not exist', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    try {
      await completeTodo('/project', '001');
      expect.fail('Expected an error to be thrown');
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });

  it('should preserve markdown body content after completion', async () => {
    vol.fromJSON({
      '/project/.planning/todos/pending/001-test-todo.md': TODO_P1,
    });

    await completeTodo('/project', '001');

    const content = vol.readFileSync('/project/.planning/todos/done/001-test-todo.md', 'utf-8');
    expect(content).toContain('Hook scripts currently have no audit trail.');
  });
});

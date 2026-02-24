import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Mock node:fs with memfs (needed for createReadStream)
vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

// Import after mocks
const { listLogFiles, readLogPage, tailLogFile } = await import(
  '../../src/services/log.service.js'
);

beforeEach(() => {
  vol.reset();
});

const LOGS_DIR = '/project/.planning/logs';

const jsonlLine = (overrides = {}) =>
  JSON.stringify({
    timestamp: '2026-01-01T00:00:00Z',
    type: 'tool_use',
    tool: 'Read',
    ...overrides
  });

describe('listLogFiles', () => {
  it('returns empty array when logs dir missing', async () => {
    vol.fromJSON({ '/project/.planning/phases/.gitkeep': '' });
    const result = await listLogFiles('/project');
    expect(result).toEqual([]);
  });

  it('returns .jsonl files sorted by filename descending', async () => {
    vol.fromJSON({
      [`${LOGS_DIR}/b-file.jsonl`]: jsonlLine(),
      [`${LOGS_DIR}/a-file.jsonl`]: jsonlLine()
    });
    const result = await listLogFiles('/project');
    expect(result.map(f => f.name)).toEqual(['b-file.jsonl', 'a-file.jsonl']);
  });

  it('includes name, size, and modified fields', async () => {
    const content = jsonlLine();
    vol.fromJSON({ [`${LOGS_DIR}/test.jsonl`]: content });
    const result = await listLogFiles('/project');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test.jsonl');
    expect(typeof result[0].size).toBe('number');
    expect(typeof result[0].modified).toBe('string');
  });

  it('skips non-.jsonl files', async () => {
    vol.fromJSON({
      [`${LOGS_DIR}/test.jsonl`]: jsonlLine(),
      [`${LOGS_DIR}/README.md`]: '# readme'
    });
    const result = await listLogFiles('/project');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test.jsonl');
  });
});

describe('readLogPage', () => {
  it('returns empty entries and total 0 when file missing', async () => {
    vol.fromJSON({ '/project/.planning/phases/.gitkeep': '' });
    const result = await readLogPage('/project/.planning/logs/missing.jsonl');
    expect(result).toEqual({ entries: [], total: 0, page: 1, pageSize: 100 });
  });

  it('parses valid JSONL lines into objects', async () => {
    const lines = [
      jsonlLine({ tool: 'Read' }),
      jsonlLine({ tool: 'Write' }),
      jsonlLine({ tool: 'Bash' })
    ].join('\n');
    vol.fromJSON({ [`${LOGS_DIR}/test.jsonl`]: lines });

    const result = await readLogPage(`${LOGS_DIR}/test.jsonl`);
    expect(result.entries).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('skips malformed lines', async () => {
    const lines = [
      jsonlLine({ tool: 'Read' }),
      'not-valid-json',
      jsonlLine({ tool: 'Write' }),
      '{bad json'
    ].join('\n');
    vol.fromJSON({ [`${LOGS_DIR}/test.jsonl`]: lines });

    const result = await readLogPage(`${LOGS_DIR}/test.jsonl`);
    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('paginates correctly: page 1 of 2', async () => {
    const lines = Array.from({ length: 150 }, (_, i) =>
      jsonlLine({ tool: `Tool${i}` })
    ).join('\n');
    vol.fromJSON({ [`${LOGS_DIR}/test.jsonl`]: lines });

    const result = await readLogPage(`${LOGS_DIR}/test.jsonl`, { page: 1, pageSize: 100 });
    expect(result.entries).toHaveLength(100);
    expect(result.total).toBe(150);
    expect(result.page).toBe(1);
  });

  it('paginates correctly: page 2 of 2', async () => {
    const lines = Array.from({ length: 150 }, (_, i) =>
      jsonlLine({ tool: `Tool${i}` })
    ).join('\n');
    vol.fromJSON({ [`${LOGS_DIR}/test.jsonl`]: lines });

    const result = await readLogPage(`${LOGS_DIR}/test.jsonl`, { page: 2, pageSize: 100 });
    expect(result.entries).toHaveLength(50);
    expect(result.total).toBe(150);
    expect(result.page).toBe(2);
  });

  it('filters by type when typeFilter provided', async () => {
    const lines = [
      jsonlLine({ type: 'tool_use', tool: 'Read' }),
      jsonlLine({ type: 'message', tool: 'N/A' }),
      jsonlLine({ type: 'tool_use', tool: 'Write' }),
      jsonlLine({ type: 'message', tool: 'N/A' })
    ].join('\n');
    vol.fromJSON({ [`${LOGS_DIR}/test.jsonl`]: lines });

    const result = await readLogPage(`${LOGS_DIR}/test.jsonl`, { typeFilter: 'tool_use' });
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every(e => e.type === 'tool_use')).toBe(true);
  });

  it('filters by text search when q provided', async () => {
    const lines = [
      jsonlLine({ tool: 'ReadThisFile' }),
      jsonlLine({ tool: 'BashCommand' }),
      jsonlLine({ tool: 'ReadOtherFile' })
    ].join('\n');
    vol.fromJSON({ [`${LOGS_DIR}/test.jsonl`]: lines });

    const result = await readLogPage(`${LOGS_DIR}/test.jsonl`, { q: 'read' });
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every(e => e.tool.toLowerCase().includes('read'))).toBe(true);
  });
});

describe('tailLogFile', () => {
  it('calls onLine for each new line appended after the initial offset', async () => {
    vi.useFakeTimers();
    const initialContent = jsonlLine({ tool: 'Read' }) + '\n';
    vol.fromJSON({ [`${LOGS_DIR}/tail.jsonl`]: initialContent });

    const onLine = vi.fn();
    await tailLogFile(`${LOGS_DIR}/tail.jsonl`, onLine);

    // Append new content
    const newLine = jsonlLine({ tool: 'Write' }) + '\n';
    vol.fromJSON({
      [`${LOGS_DIR}/tail.jsonl`]: initialContent + newLine
    });

    // Advance timer to trigger polling interval
    await vi.advanceTimersByTimeAsync(600);

    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine.mock.calls[0][0]).toMatchObject({ tool: 'Write' });

    vi.useRealTimers();
  });

  it('returns a cleanup function that stops watching', async () => {
    vi.useFakeTimers();
    const initialContent = jsonlLine({ tool: 'Read' }) + '\n';
    vol.fromJSON({ [`${LOGS_DIR}/tail.jsonl`]: initialContent });

    const onLine = vi.fn();
    const cleanup = await tailLogFile(`${LOGS_DIR}/tail.jsonl`, onLine);

    // Call cleanup before appending
    cleanup();

    // Append new content
    const newLine = jsonlLine({ tool: 'Write' }) + '\n';
    vol.fromJSON({
      [`${LOGS_DIR}/tail.jsonl`]: initialContent + newLine
    });

    // Advance timer — should not call onLine since we cleaned up
    await vi.advanceTimersByTimeAsync(600);

    expect(onLine).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

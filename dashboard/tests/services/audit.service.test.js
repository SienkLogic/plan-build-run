import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs (used by audit.service.js AND planning.repository.js)
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { listAuditReports, getAuditReport } = await import(
  '../../src/services/audit.service.js'
);

beforeEach(() => {
  vol.reset();
});

describe('listAuditReports', () => {
  it('returns empty array when audits dir missing', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await listAuditReports('/project');

    expect(result).toEqual([]);
  });

  it('returns reports sorted newest-first', async () => {
    vol.fromJSON({
      '/project/.planning/audits/2026-01-10-session-audit.md': '# Old Report',
      '/project/.planning/audits/2026-02-24-session-audit.md': '# New Report',
    });

    const result = await listAuditReports('/project');

    expect(result.length).toBe(2);
    expect(result[0].date).toBe('2026-02-24');
  });

  it('parses filename date and slug', async () => {
    vol.fromJSON({
      '/project/.planning/audits/2026-02-24-session-audit.md': '# Session Audit',
    });

    const result = await listAuditReports('/project');

    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      date: '2026-02-24',
      slug: 'session-audit',
      filename: '2026-02-24-session-audit.md',
      title: 'Session Audit',
    });
  });
});

describe('getAuditReport', () => {
  it('returns null for non-existent file', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await getAuditReport('/project', '2026-02-24-session-audit.md');

    expect(result).toBeNull();
  });

  it('returns html and frontmatter for valid file', async () => {
    vol.fromJSON({
      '/project/.planning/audits/2026-02-24-session-audit.md':
        '---\nmode: full\n---\n\n# Session Audit\n\nAudit content here.',
    });

    const result = await getAuditReport('/project', '2026-02-24-session-audit.md');

    expect(result).not.toBeNull();
    expect(result.filename).toBe('2026-02-24-session-audit.md');
    expect(result.date).toBe('2026-02-24');
    expect(result.slug).toBe('session-audit');
    expect(result.title).toBe('Session Audit');
    expect(result.html).toContain('Audit content here');
  });
});

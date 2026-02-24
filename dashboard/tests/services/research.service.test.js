import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs (used by research.service.js AND planning.repository.js)
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { listResearchDocs, listCodebaseDocs, getResearchDocBySlug } = await import(
  '../../src/services/research.service.js'
);

const RESEARCH_DOC = `---
research_date: 2026-01-15
confidence: high
sources_checked: 5
coverage: complete
topic: Authentication Architecture
---
# Auth Research
Content here.
`;

const CODEBASE_DOC = `---
scan_date: 2026-01-20
---
# Codebase Overview
Analysis content.
`;

beforeEach(() => {
  vol.reset();
});

describe('listResearchDocs', () => {
  it('returns empty array when research dir missing', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await listResearchDocs('/project');

    expect(result).toEqual([]);
  });

  it('returns research docs sorted by filename descending', async () => {
    vol.fromJSON({
      '/project/.planning/research/2026-01-10-auth-arch.md': RESEARCH_DOC,
      '/project/.planning/research/2026-01-20-data-flow.md': RESEARCH_DOC,
    });

    const result = await listResearchDocs('/project');

    expect(result.length).toBe(2);
    expect(result[0].filename).toBe('2026-01-20-data-flow.md');
    expect(result[1].filename).toBe('2026-01-10-auth-arch.md');
  });

  it('extracts topic, date, confidence, coverage from frontmatter', async () => {
    vol.fromJSON({
      '/project/.planning/research/2026-01-15-auth-arch.md': RESEARCH_DOC,
    });

    const result = await listResearchDocs('/project');

    expect(result.length).toBe(1);
    expect(result[0].topic).toBe('Authentication Architecture');
    expect(result[0].date).toBe('2026-01-15');
    expect(result[0].confidence).toBe('high');
    expect(result[0].coverage).toBe('complete');
  });

  it('skips non-.md files', async () => {
    vol.fromJSON({
      '/project/.planning/research/2026-01-15-auth-arch.md': RESEARCH_DOC,
      '/project/.planning/research/notes.txt': 'some notes',
    });

    const result = await listResearchDocs('/project');

    expect(result.length).toBe(1);
  });
});

describe('listCodebaseDocs', () => {
  it('returns empty array when codebase dir missing', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await listCodebaseDocs('/project');

    expect(result).toEqual([]);
  });

  it('returns codebase docs with filename and html', async () => {
    vol.fromJSON({
      '/project/.planning/codebase/2026-01-20-overview.md': CODEBASE_DOC,
    });

    const result = await listCodebaseDocs('/project');

    expect(result.length).toBe(1);
    expect(result[0].filename).toBe('2026-01-20-overview.md');
    expect(result[0].html).toBeTruthy();
  });
});

describe('getResearchDocBySlug', () => {
  it('returns null when file not found', async () => {
    vol.fromJSON({
      '/project/.planning/research/.gitkeep': '',
    });

    const result = await getResearchDocBySlug('/project', 'nonexistent');

    expect(result).toBeNull();
  });

  it('returns document with html and frontmatter when found', async () => {
    vol.fromJSON({
      '/project/.planning/research/2026-01-15-auth-arch.md': RESEARCH_DOC,
    });

    const result = await getResearchDocBySlug('/project', 'auth-arch');

    expect(result).not.toBeNull();
    expect(result.html).toBeTruthy();
    expect(result.topic).toBe('Authentication Architecture');
  });

  it('matches slug derived from filename without date prefix', async () => {
    vol.fromJSON({
      '/project/.planning/research/2026-01-15-auth-arch.md': RESEARCH_DOC,
    });

    const result = await getResearchDocBySlug('/project', 'auth-arch');

    expect(result).not.toBeNull();
    expect(result.slug).toBe('auth-arch');
    expect(result.filename).toBe('2026-01-15-auth-arch.md');
  });
});

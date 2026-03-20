/**
 * Tests for hooks/lib/reference.js — Targeted reference document access.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  listHeadings,
  extractSection,
  resolveReferencePath,
  referenceGet
} = require('../plugins/pbr/scripts/lib/reference');

let tmpDir, pluginRoot, refsDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ref-test-')));
  pluginRoot = tmpDir;
  refsDir = path.join(pluginRoot, 'references');
  fs.mkdirSync(refsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SAMPLE_MD = `## Commit Format

Use conventional commits.

### Types

feat, fix, refactor, test, docs, chore.

### Scopes

hooks, skills, agents.

## Deviation Rules

When you encounter an issue...

### Rule 1

Auto-fix bugs.
`;

// --- listHeadings ---

describe('listHeadings', () => {
  it('extracts H2 and H3 headings', () => {
    const headings = listHeadings(SAMPLE_MD);
    expect(headings.length).toBeGreaterThanOrEqual(5);
    expect(headings[0]).toEqual({ level: 2, heading: 'Commit Format' });
    expect(headings[1]).toEqual({ level: 3, heading: 'Types' });
  });

  it('returns empty array for content with no headings', () => {
    expect(listHeadings('just plain text')).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const crlf = '## Heading One\r\n\r\nContent.\r\n\r\n## Heading Two\r\n';
    const headings = listHeadings(crlf);
    expect(headings).toHaveLength(2);
    expect(headings[0].heading).toBe('Heading One');
    expect(headings[1].heading).toBe('Heading Two');
  });
});

// --- extractSection ---

describe('extractSection', () => {
  it('extracts H2 section by exact match', () => {
    const result = extractSection(SAMPLE_MD, 'Commit Format');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Commit Format');
    expect(result.level).toBe(2);
    expect(result.content).toContain('conventional commits');
  });

  it('extracts H3 section by exact match', () => {
    const result = extractSection(SAMPLE_MD, 'Types');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Types');
    expect(result.level).toBe(3);
    expect(result.content).toContain('feat');
  });

  it('matches case-insensitively', () => {
    const result = extractSection(SAMPLE_MD, 'commit format');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Commit Format');
  });

  it('matches by starts-with', () => {
    const result = extractSection(SAMPLE_MD, 'Deviation');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Deviation Rules');
  });

  it('matches by contains', () => {
    const result = extractSection(SAMPLE_MD, 'Rules');
    expect(result).not.toBeNull();
  });

  it('matches by word-boundary (all words present)', () => {
    const result = extractSection(SAMPLE_MD, 'Rule 1');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Rule 1');
  });

  it('returns null when no match found', () => {
    expect(extractSection(SAMPLE_MD, 'nonexistent section')).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(extractSection('', 'anything')).toBeNull();
  });

  it('includes char_count in result', () => {
    const result = extractSection(SAMPLE_MD, 'Commit Format');
    expect(result.char_count).toBeGreaterThan(0);
    expect(result.char_count).toBe(result.content.length);
  });
});

// --- resolveReferencePath ---

describe('resolveReferencePath', () => {
  it('resolves known reference name to file path', () => {
    fs.writeFileSync(path.join(refsDir, 'plan-format.md'), '# Plan Format');
    const result = resolveReferencePath('plan-format', pluginRoot);
    expect(typeof result).toBe('string');
    expect(result).toContain('plan-format.md');
  });

  it('strips .md extension before resolving', () => {
    fs.writeFileSync(path.join(refsDir, 'commit-conventions.md'), '# Commits');
    const result = resolveReferencePath('commit-conventions.md', pluginRoot);
    expect(typeof result).toBe('string');
    expect(result).toContain('commit-conventions.md');
  });

  it('returns error object for unknown reference name', () => {
    const result = resolveReferencePath('nonexistent', pluginRoot);
    expect(typeof result).toBe('object');
    expect(result.error).toContain('not found');
    expect(Array.isArray(result.available)).toBe(true);
  });

  it('lists available references in error response', () => {
    fs.writeFileSync(path.join(refsDir, 'alpha.md'), 'a');
    fs.writeFileSync(path.join(refsDir, 'beta.md'), 'b');
    const result = resolveReferencePath('missing', pluginRoot);
    expect(result.available).toContain('alpha');
    expect(result.available).toContain('beta');
  });
});

// --- referenceGet ---

describe('referenceGet', () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(refsDir, 'test-ref.md'), SAMPLE_MD);
  });

  it('returns full content when no options', () => {
    const result = referenceGet('test-ref', {}, pluginRoot);
    expect(result.name).toBe('test-ref');
    expect(result.content).toContain('conventional commits');
    expect(result.char_count).toBeGreaterThan(0);
  });

  it('returns headings list with list option', () => {
    const result = referenceGet('test-ref', { list: true }, pluginRoot);
    expect(result.headings).toBeDefined();
    expect(result.headings.length).toBeGreaterThan(0);
  });

  it('extracts a section with section option', () => {
    const result = referenceGet('test-ref', { section: 'Commit Format' }, pluginRoot);
    expect(result.heading).toBe('Commit Format');
    expect(result.content).toBeDefined();
  });

  it('returns error for section not found', () => {
    const result = referenceGet('test-ref', { section: 'nonexistent' }, pluginRoot);
    expect(result.error).toContain('not found');
    expect(result.available).toBeDefined();
  });

  it('returns error for nonexistent reference', () => {
    const result = referenceGet('does-not-exist', {}, pluginRoot);
    expect(result.error).toContain('not found');
  });

  it('strips YAML frontmatter from content', () => {
    fs.writeFileSync(
      path.join(refsDir, 'with-fm.md'),
      '---\ntitle: Test\n---\n\n## Section\n\nBody text.'
    );
    const result = referenceGet('with-fm', {}, pluginRoot);
    expect(result.content).not.toContain('---');
    expect(result.content).toContain('Body text');
  });
});

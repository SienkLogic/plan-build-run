import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs BEFORE importing the module under test
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const {
  readMarkdownFile,
  readMarkdownFiles,
  readMarkdownFilesSettled,
  listPlanningFiles,
  validatePath
} = await import('../../src/repositories/planning.repository.js');

describe('PlanningRepository', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('readMarkdownFile', () => {
    it('should parse frontmatter and render markdown to HTML', async () => {
      vol.fromJSON({
        '/project/doc.md': '---\ntitle: Test Doc\nstatus: draft\n---\n# Hello World\n\nSome content here.'
      });

      const result = await readMarkdownFile('/project/doc.md');

      expect(result.frontmatter).toEqual({ title: 'Test Doc', status: 'draft' });
      expect(result.html).toContain('<h1>');
      expect(result.html).toContain('Hello World');
      expect(result.html).toContain('<p>Some content here.</p>');
      expect(result.rawContent).toContain('# Hello World');
    });

    it('should strip UTF-8 BOM before parsing', async () => {
      vol.fromJSON({
        '/project/bom.md': '\uFEFF---\ntitle: BOM File\n---\n# BOM Content'
      });

      const result = await readMarkdownFile('/project/bom.md');

      expect(result.frontmatter.title).toBe('BOM File');
      expect(result.html).toContain('BOM Content');
    });

    it('should handle empty frontmatter without error', async () => {
      vol.fromJSON({
        '/project/empty-fm.md': '---\n---\n# No Frontmatter Data'
      });

      const result = await readMarkdownFile('/project/empty-fm.md');

      expect(result.frontmatter).toEqual({});
      expect(result.html).toContain('No Frontmatter Data');
    });

    it('should handle file with no frontmatter at all', async () => {
      vol.fromJSON({
        '/project/no-fm.md': '# Just Markdown\n\nNo frontmatter here.'
      });

      const result = await readMarkdownFile('/project/no-fm.md');

      expect(result.frontmatter).toEqual({});
      expect(result.html).toContain('Just Markdown');
      expect(result.html).toContain('No frontmatter here.');
    });

    it('should throw ENOENT for missing files', async () => {
      await expect(readMarkdownFile('/project/missing.md'))
        .rejects
        .toThrow();

      try {
        await readMarkdownFile('/project/missing.md');
      } catch (error) {
        expect(error.code).toBe('ENOENT');
      }
    });

    it('should throw on malformed YAML frontmatter', async () => {
      vol.fromJSON({
        '/project/bad.md': '---\ntitle: [invalid yaml\n  broken: {{\n---\n# Content'
      });

      await expect(readMarkdownFile('/project/bad.md'))
        .rejects
        .toThrow();
    });

    it('should handle complex frontmatter with nested objects and arrays', async () => {
      const content = [
        '---',
        'title: Complex',
        'tags:',
        '  - alpha',
        '  - beta',
        'meta:',
        '  author: test',
        '  version: 2',
        '---',
        '# Complex Doc'
      ].join('\n');

      vol.fromJSON({ '/project/complex.md': content });

      const result = await readMarkdownFile('/project/complex.md');

      expect(result.frontmatter.title).toBe('Complex');
      expect(result.frontmatter.tags).toEqual(['alpha', 'beta']);
      expect(result.frontmatter.meta).toEqual({ author: 'test', version: 2 });
    });

    it('should render GFM features (tables, task lists)', async () => {
      const content = '---\ntitle: GFM\n---\n| Col1 | Col2 |\n|------|------|\n| A    | B    |';

      vol.fromJSON({ '/project/gfm.md': content });

      const result = await readMarkdownFile('/project/gfm.md');

      expect(result.html).toContain('<table>');
      expect(result.html).toContain('<td>A</td>');
    });

    it('strips script tags from rendered markdown', async () => {
      vol.fromJSON({
        '/project/xss.md': '# Hello\n\n<script>alert(1)</script>'
      });

      const result = await readMarkdownFile('/project/xss.md');

      expect(result.html).not.toContain('<script>');
    });

    it('strips onerror event attributes from rendered markdown', async () => {
      vol.fromJSON({
        '/project/xss2.md': '<img src=x onerror="alert(1)">'
      });

      const result = await readMarkdownFile('/project/xss2.md');

      expect(result.html).not.toContain('onerror');
    });
  });

  describe('readMarkdownFiles', () => {
    it('should read multiple files in parallel', async () => {
      vol.fromJSON({
        '/project/a.md': '---\ntitle: A\n---\n# File A',
        '/project/b.md': '---\ntitle: B\n---\n# File B',
        '/project/c.md': '---\ntitle: C\n---\n# File C'
      });

      const results = await readMarkdownFiles([
        '/project/a.md',
        '/project/b.md',
        '/project/c.md'
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].frontmatter.title).toBe('A');
      expect(results[1].frontmatter.title).toBe('B');
      expect(results[2].frontmatter.title).toBe('C');
    });

    it('should reject if any file is missing (fail-fast)', async () => {
      vol.fromJSON({
        '/project/a.md': '---\ntitle: A\n---\n# File A'
      });

      await expect(readMarkdownFiles([
        '/project/a.md',
        '/project/missing.md'
      ])).rejects.toThrow();
    });

    it('should handle empty array', async () => {
      const results = await readMarkdownFiles([]);
      expect(results).toEqual([]);
    });
  });

  describe('readMarkdownFilesSettled', () => {
    it('should return all results even when some fail', async () => {
      vol.fromJSON({
        '/project/a.md': '---\ntitle: A\n---\n# File A'
      });

      const results = await readMarkdownFilesSettled([
        '/project/a.md',
        '/project/missing.md'
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('fulfilled');
      expect(results[0].value.frontmatter.title).toBe('A');
      expect(results[1].status).toBe('rejected');
      expect(results[1].reason.code).toBe('ENOENT');
    });

    it('should handle all files succeeding', async () => {
      vol.fromJSON({
        '/project/a.md': '---\ntitle: A\n---\n# A',
        '/project/b.md': '---\ntitle: B\n---\n# B'
      });

      const results = await readMarkdownFilesSettled([
        '/project/a.md',
        '/project/b.md'
      ]);

      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    });
  });

  describe('listPlanningFiles', () => {
    it('should list all .md files recursively under .planning/', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': '---\nstatus: active\n---\n# State',
        '/project/.planning/ROADMAP.md': '---\nphases: 3\n---\n# Roadmap',
        '/project/.planning/phases/01/PLAN.md': '---\nphase: 1\n---\n# Plan',
        '/project/.planning/config.json': '{"depth": "standard"}',
        '/project/README.md': '# Not in .planning'
      });

      const files = await listPlanningFiles('/project');

      // Should include only .md files under .planning/
      expect(files.length).toBe(3);
      // Should NOT include config.json or root README.md
      const filenames = files.map(f => f.split(/[\\/]/).pop());
      expect(filenames).toContain('STATE.md');
      expect(filenames).toContain('ROADMAP.md');
      expect(filenames).toContain('PLAN.md');
      expect(filenames).not.toContain('config.json');
      expect(filenames).not.toContain('README.md');
    });

    it('should throw ENOENT if .planning/ directory does not exist', async () => {
      vol.fromJSON({
        '/project/README.md': '# No planning dir'
      });

      await expect(listPlanningFiles('/project'))
        .rejects
        .toThrow();
    });

    it('should return empty array for .planning/ with no .md files', async () => {
      vol.fromJSON({
        '/project/.planning/config.json': '{}'
      });

      const files = await listPlanningFiles('/project');
      expect(files).toEqual([]);
    });
  });

  describe('readMarkdownFile error handling', () => {
    it('should throw status 400 for malformed YAML frontmatter', async () => {
      vol.fromJSON({
        '/project/bad.md': '---\ntitle: Test\nstatus [invalid yaml\n---\nContent'
      });

      try {
        await readMarkdownFile('/project/bad.md');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Invalid YAML frontmatter');
        expect(error.message).toContain('/project/bad.md');
        expect(error.status).toBe(400);
        expect(error.cause).toBeDefined();
      }
    });

    it('should throw status 400 for unclosed frontmatter with bad YAML', async () => {
      vol.fromJSON({
        '/project/unclosed.md': '---\ntitle: {{broken\n  invalid: [[\n---\nContent'
      });

      try {
        await readMarkdownFile('/project/unclosed.md');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.status).toBe(400);
      }
    });

    it('should handle empty file without error', async () => {
      vol.fromJSON({
        '/project/empty.md': ''
      });

      const result = await readMarkdownFile('/project/empty.md');
      expect(result.frontmatter).toEqual({});
      expect(result.html).toBe('');
    });

    it('should handle file with only frontmatter (no body)', async () => {
      vol.fromJSON({
        '/project/fm-only.md': '---\ntitle: Only Frontmatter\n---\n'
      });

      const result = await readMarkdownFile('/project/fm-only.md');
      expect(result.frontmatter.title).toBe('Only Frontmatter');
      expect(result.rawContent).toBe('');
    });

    it('should propagate non-YAML errors unchanged', async () => {
      // ENOENT should pass through without being wrapped in status 400
      try {
        await readMarkdownFile('/project/nonexistent.md');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.code).toBe('ENOENT');
        expect(error.status).toBeUndefined();
      }
    });
  });
});

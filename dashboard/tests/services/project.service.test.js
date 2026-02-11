import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs BEFORE importing the module under test
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up -- service imports repository which imports fs
const { getHomepage, getMarkdownFile } = await import(
  '../../src/services/project.service.js'
);

describe('ProjectService', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('getHomepage', () => {
    it('should return parsed README.md content when file exists', async () => {
      vol.fromJSON({
        '/project/.planning/README.md': '---\ntitle: My Project\n---\n# Welcome\n\nProject overview here.'
      });

      const result = await getHomepage('/project');

      expect(result.title).toBe('My Project');
      expect(result.projectDir).toBe('/project');
      expect(result.content).toContain('<h1>');
      expect(result.content).toContain('Welcome');
      expect(result.content).toContain('Project overview here.');
    });

    it('should use default title when frontmatter has no title', async () => {
      vol.fromJSON({
        '/project/.planning/README.md': '---\nstatus: active\n---\n# Content'
      });

      const result = await getHomepage('/project');

      expect(result.title).toBe('Towline Dashboard');
    });

    it('should return fallback when README.md does not exist', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': '---\nstatus: active\n---\n# State'
      });

      const result = await getHomepage('/project');

      expect(result.title).toBe('Welcome');
      expect(result.projectDir).toBe('/project');
      expect(result.content).toContain('No project README found');
    });

    it('should return fallback when .planning/ directory does not exist', async () => {
      vol.fromJSON({
        '/project/README.md': '# Root readme'
      });

      const result = await getHomepage('/project');

      expect(result.title).toBe('Welcome');
      expect(result.content).toContain('No project README found');
    });

    it('should re-throw non-ENOENT errors', async () => {
      vol.fromJSON({
        '/project/.planning/README.md': '---\ntitle: [broken yaml {{\n---\n# Bad'
      });

      await expect(getHomepage('/project'))
        .rejects
        .toThrow();
    });
  });

  describe('getMarkdownFile', () => {
    it('should read a file within .planning/ directory', async () => {
      vol.fromJSON({
        '/project/.planning/phases/01/PLAN.md': '---\nphase: 1\ntitle: Setup\n---\n# Phase 1 Plan'
      });

      const result = await getMarkdownFile('/project', 'phases/01/PLAN.md');

      expect(result.frontmatter.phase).toBe(1);
      expect(result.frontmatter.title).toBe('Setup');
      expect(result.html).toContain('Phase 1 Plan');
    });

    it('should read a file at the root of .planning/', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': '---\ncurrent_phase: 2\n---\n# State'
      });

      const result = await getMarkdownFile('/project', 'STATE.md');

      expect(result.frontmatter.current_phase).toBe(2);
    });

    it('should throw ENOENT for missing files', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': '# exists'
      });

      await expect(getMarkdownFile('/project', 'MISSING.md'))
        .rejects
        .toThrow();
    });

    it('should reject path traversal with ..', async () => {
      vol.fromJSON({
        '/project/.planning/STATE.md': '# state',
        '/project/secret.md': '# secret'
      });

      await expect(getMarkdownFile('/project', '../secret.md'))
        .rejects
        .toThrow('Path traversal not allowed');

      try {
        await getMarkdownFile('/project', '../secret.md');
      } catch (error) {
        expect(error.code).toBe('PATH_TRAVERSAL');
        expect(error.status).toBe(403);
      }
    });

    it('should reject deeply nested path traversal', async () => {
      vol.fromJSON({
        '/project/.planning/phases/01/PLAN.md': '# plan'
      });

      await expect(getMarkdownFile('/project', 'phases/../../secret.md'))
        .rejects
        .toThrow('Path traversal not allowed');
    });
  });
});

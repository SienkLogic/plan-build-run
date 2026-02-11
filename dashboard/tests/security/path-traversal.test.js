import { describe, it, expect } from 'vitest';
import { validatePath } from '../../src/repositories/planning.repository.js';

describe('Path Traversal Protection', () => {
  // Use a platform-appropriate base path for testing.
  // validatePath uses path.resolve internally which handles platform differences.
  const baseDir = process.platform === 'win32'
    ? 'C:\\project\\.planning'
    : '/home/user/project/.planning';

  describe('valid paths', () => {
    it('should allow a simple relative filename', () => {
      const result = validatePath(baseDir, 'ROADMAP.md');
      expect(result).toContain('ROADMAP.md');
    });

    it('should allow nested relative paths', () => {
      const result = validatePath(baseDir, 'phases/01-setup/01-01-PLAN.md');
      expect(result).toContain('phases');
      expect(result).toContain('01-01-PLAN.md');
    });

    it('should allow paths with the base directory itself (empty relative)', () => {
      const result = validatePath(baseDir, '.');
      // Should resolve to the base directory itself
      expect(result).toBeTruthy();
    });
  });

  describe('rejected paths', () => {
    it('should reject parent directory traversal (../)', () => {
      expect(() => validatePath(baseDir, '../../../etc/passwd'))
        .toThrow('Path traversal attempt detected');
    });

    it('should reject parent traversal with status 403', () => {
      try {
        validatePath(baseDir, '../secret.txt');
      } catch (error) {
        expect(error.status).toBe(403);
        expect(error.code).toBe('PATH_TRAVERSAL');
      }
    });

    it('should reject single parent traversal (..)', () => {
      expect(() => validatePath(baseDir, '..'))
        .toThrow('Path traversal attempt detected');
    });

    it('should reject encoded parent traversal via nested ../', () => {
      expect(() => validatePath(baseDir, 'phases/../../secrets'))
        .toThrow('Path traversal attempt detected');
    });

    it('should reject absolute path injection on POSIX', () => {
      // This test uses an absolute POSIX path regardless of platform.
      // On Windows, path.resolve('C:\\base', '/etc/passwd') resolves to
      // the root of the current drive, which is still outside the base.
      expect(() => validatePath(baseDir, '/etc/passwd'))
        .toThrow('Path traversal attempt detected');
    });
  });

  describe('edge cases', () => {
    it('should handle paths with redundant separators', () => {
      // path.normalize handles these
      const result = validatePath(baseDir, 'phases//01-setup///PLAN.md');
      expect(result).toContain('PLAN.md');
    });

    it('should handle dot segments that resolve within base', () => {
      // './phases/../phases/01/PLAN.md' should resolve within base
      const result = validatePath(baseDir, './phases/../phases/01/PLAN.md');
      expect(result).toContain('PLAN.md');
    });
  });
});

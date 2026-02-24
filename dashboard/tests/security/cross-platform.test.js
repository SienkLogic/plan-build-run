import { describe, it, expect } from 'vitest';
import { win32, posix, join, resolve, normalize, sep } from 'node:path';

describe('Cross-Platform Path Handling', () => {
  describe('path.win32 (Windows behavior on any OS)', () => {
    it('should join Windows paths with backslashes', () => {
      const result = win32.join('C:\\', 'project', '.planning', 'ROADMAP.md');
      expect(result).toBe('C:\\project\\.planning\\ROADMAP.md');
    });

    it('should normalize mixed separators to backslashes', () => {
      const result = win32.normalize('C:/project/.planning\\ROADMAP.md');
      expect(result).toBe('C:\\project\\.planning\\ROADMAP.md');
    });

    it('should resolve relative paths against a Windows base', () => {
      const result = win32.resolve('C:\\project\\.planning', 'phases', '01-setup');
      expect(result).toBe('C:\\project\\.planning\\phases\\01-setup');
    });

    it('should detect parent traversal in relative paths', () => {
      const rel = win32.relative('C:\\project\\.planning', 'C:\\project\\secrets');
      expect(rel.startsWith('..')).toBe(true);
    });
  });

  describe('path.posix (POSIX behavior on any OS)', () => {
    it('should join POSIX paths with forward slashes', () => {
      const result = posix.join('/', 'home', 'user', 'project', '.planning', 'ROADMAP.md');
      expect(result).toBe('/home/user/project/.planning/ROADMAP.md');
    });

    it('should normalize redundant separators', () => {
      const result = posix.normalize('/home//user///project/.planning/ROADMAP.md');
      expect(result).toBe('/home/user/project/.planning/ROADMAP.md');
    });

    it('should resolve relative paths against a POSIX base', () => {
      const result = posix.resolve('/home/user/project/.planning', 'phases', '01-setup');
      expect(result).toBe('/home/user/project/.planning/phases/01-setup');
    });

    it('should detect parent traversal in relative paths', () => {
      const rel = posix.relative('/project/.planning', '/project/secrets');
      expect(rel.startsWith('..')).toBe(true);
    });
  });

  describe('current platform path operations', () => {
    it('should use path.join for directory construction (never manual concatenation)', () => {
      const projectDir = sep === '\\' ? 'C:\\project' : '/home/user/project';
      const result = join(projectDir, '.planning', 'phases', '01-setup', '01-01-PLAN.md');
      // Result should contain the correct separator for the platform
      expect(result).toContain('.planning');
      expect(result).toContain('01-01-PLAN.md');
    });

    it('should use path.resolve for absolute path resolution', () => {
      const result = resolve('.', 'src', 'app.js');
      // Result should be an absolute path
      expect(result).toMatch(sep === '\\' ? /^[A-Z]:\\/ : /^\//);
    });

    it('should use path.normalize to clean up paths', () => {
      const messy = join('project', '.planning', '..', '.planning', 'ROADMAP.md');
      const clean = normalize(messy);
      expect(clean).toContain('ROADMAP.md');
      // Should NOT contain '..' since it was resolved
      expect(clean).not.toContain('..');
    });
  });

  describe('server binding validation', () => {
    it('should confirm server.js binds to 127.0.0.1', async () => {
      // Read server.js source and verify the listen call binds to localhost
      const { readFile } = await import('node:fs/promises');
      const serverSource = await readFile(
        join(resolve('.'), 'src', 'server.js'),
        'utf-8'
      );
      // The listen call must specify '127.0.0.1' as the hostname
      expect(serverSource).toContain("'127.0.0.1'");
      expect(serverSource).toMatch(/app\.listen\(\s*port\s*,\s*'127\.0\.0\.1'/);
    });
  });

  describe('Hono secureHeaders security headers', () => {
    it('should set security headers and not send X-Powered-By', async () => {
      // Import createApp from the Hono entry point and wrap with createAdaptorServer
      const { createApp } = await import('../../src/index.tsx');
      const { createAdaptorServer } = await import('@hono/node-server');
      const honoApp = createApp({ projectDir: resolve('.'), port: 0 });
      const server = createAdaptorServer(honoApp);

      const http = await import('node:http');

      // Make a request and inspect response headers
      await new Promise((resolvePromise, reject) => {
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address();
          http.get(`http://127.0.0.1:${port}/favicon.ico`, (res) => {
            try {
              // Hono secureHeaders() sets X-Content-Type-Options
              expect(res.headers['x-content-type-options']).toBe('nosniff');
              // Hono secureHeaders() sets X-Frame-Options or frame-ancestors CSP
              const hasFrameProtection = res.headers['x-frame-options'] ||
                (res.headers['content-security-policy'] && res.headers['content-security-policy'].includes('frame-ancestors'));
              expect(hasFrameProtection).toBeTruthy();
              // Hono does not send X-Powered-By by default
              expect(res.headers['x-powered-by']).toBeUndefined();
              resolvePromise();
            } catch (err) {
              reject(err);
            } finally {
              server.close();
            }
          }).on('error', (err) => {
            server.close();
            reject(err);
          });
        });
      });
    });
  });
});

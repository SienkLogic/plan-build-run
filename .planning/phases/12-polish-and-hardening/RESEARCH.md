# Phase Research: Polish and Hardening

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 12-polish-and-hardening
> Confidence: HIGH

## User Constraints

**Locked Decisions**
| Decision | Rationale | Locked By |
|----------|-----------|-----------|
| Node.js 24 LTS | Latest LTS, support through 2028 | Research |
| Express 5.x | Better async error handling, security improvements | Research |
| HTMX + Alpine.js | No build step, server-rendered | User + Research |
| EJS templates | Simple, HTML-familiar syntax | Research |
| Pico.css | Semantic styling, minimal footprint | Research |
| gray-matter | Industry standard frontmatter parser | Research |
| marked | Fast markdown renderer | Research |
| chokidar 5.x | Cross-platform file watching | Research |
| SSE for real-time | Unidirectional, simpler than WebSocket | Research |
| Three-layer architecture | Routes → Services → Repositories | Research |
| Vitest for testing | Faster than Jest, native ESM | Research |

**User Constraints**
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Phase Goal

Implement production-quality error handling, security hardening, cross-platform validation, and edge case coverage for the Towline dashboard. Ensure all async routes handle errors gracefully, implement path traversal protection, bind server to localhost only, and validate cross-platform path handling works on Windows and macOS/Linux.

## Implementation Approach

### Recommended Approach

Based on the current three-layer architecture (routes → services → repositories) and Express 5.x automatic async error handling, the recommended approach is:

**Steps**:
1. Leverage Express 5's automatic async error handling — routes already return promises, no try-catch needed [S2]
2. Enhance the existing global error handler with development vs production mode detection [S2]
3. Implement path traversal protection in the repository layer using path boundary validation [S4-S5]
4. Add Helmet.js for security headers (13 headers with sensible defaults) [S2]
5. Add explicit localhost binding validation (already implemented at `127.0.0.1`) [S2]
6. Create cross-platform path normalization tests using path.win32 and path.posix [S2]
7. Add gray-matter error handling for malformed YAML frontmatter [S4]
8. Test all edge cases: missing files, empty directories, malformed YAML, path escape attempts [MEDIUM]

**Key decisions**:
- **Use Express 5 automatic error handling** [S2-HIGH]: Express 5 automatically catches rejected promises and thrown errors in async route handlers, calling `next(error)` automatically. This eliminates manual try-catch blocks.
- **Keep error handler simple** [S2-HIGH]: The existing 4-parameter error handler signature is correct. Enhance it to check `NODE_ENV` and hide stack traces in production.
- **Path validation at repository layer** [S4-MEDIUM]: Use `path.resolve()` to get absolute paths, then verify the resolved path starts with the base directory using string comparison after normalization.
- **Helmet with defaults** [S2-HIGH]: `app.use(helmet())` sets 13 security headers. CSP may require customization but other headers are sensible defaults.
- **Test both platforms explicitly** [S2-MEDIUM]: Use `path.win32` and `path.posix` in tests to validate behavior on both platforms regardless of test runner OS.

### Configuration Details

**Error Handler Enhancement**:
```javascript
// src/middleware/errorHandler.js
export default function errorHandler(err, req, res, next) {
  // Source: [S2] https://expressjs.com/en/guide/error-handling.html

  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Log error details (always)
  console.error('Unhandled error:', err.message);
  if (isDevelopment && err.stack) {
    console.error(err.stack);
  }

  // Render user-friendly error page
  res.status(status).render('error', {
    title: 'Error',
    status,
    message: err.message || 'Internal Server Error',
    // Only show stack in development
    stack: isDevelopment ? err.stack : null,
    activePage: ''
  });
}
```

**Helmet Integration**:
```javascript
// src/app.js
import helmet from 'helmet';

export function createApp(config) {
  const app = express();

  // Source: [S2] https://github.com/helmetjs/helmet
  // Sets 13 security headers with sensible defaults
  app.use(helmet());

  // Disable Express fingerprinting
  // Source: [S2] https://expressjs.com/en/advanced/best-practice-security.html
  app.disable('x-powered-by');

  // ... rest of app setup
}
```

**Path Traversal Protection**:
```javascript
// src/repositories/planning.repository.js
import { resolve, relative, normalize } from 'node:path';

/**
 * Validate that a resolved path stays within the base directory.
 * Prevents path traversal attacks.
 *
 * Source: [S4] https://www.nodejs-security.com/book/path-traversal
 * Source: [S5] https://github.com/isaacs/node-tar/commit/875a37e
 *
 * @param {string} basePath - Absolute base directory path
 * @param {string} userPath - User-provided path (may be relative)
 * @returns {string} Validated absolute path
 * @throws {Error} If path escapes base directory
 */
export function validatePath(basePath, userPath) {
  const resolvedBase = normalize(resolve(basePath));
  const resolvedUser = normalize(resolve(basePath, userPath));

  // Check if resolved path is within base directory
  const rel = relative(resolvedBase, resolvedUser);

  // If relative path starts with '..' or is an absolute path,
  // it escaped the base directory
  if (rel.startsWith('..') || resolve(rel) === rel) {
    throw Object.assign(
      new Error('Path traversal attempt detected'),
      { status: 403 }
    );
  }

  return resolvedUser;
}
```

**Gray-matter Error Handling**:
```javascript
// src/repositories/planning.repository.js
export async function readMarkdownFile(filePath) {
  const fileContent = await readFile(filePath, 'utf-8');
  const cleanContent = stripBOM(fileContent);

  try {
    const { data, content } = matter(cleanContent, {
      engines: {
        javascript: false  // Security: disable JS execution
      }
    });

    const html = marked.parse(content);

    return {
      frontmatter: data,
      html,
      rawContent: content
    };
  } catch (error) {
    // Source: [S4] https://github.com/jonschlinkert/gray-matter/issues/169
    // gray-matter throws YAMLException for malformed frontmatter
    if (error.name === 'YAMLException' || error.constructor.name === 'YAMLException') {
      throw Object.assign(
        new Error(`Invalid YAML frontmatter in ${filePath}: ${error.message}`),
        { status: 400, cause: error }
      );
    }
    throw error;
  }
}
```

### API Patterns

**Express 5 Async Error Handling** [S2-HIGH]:
```javascript
// Routes automatically propagate errors - no try-catch needed
// Source: [S2] https://expressjs.com/en/guide/error-handling.html

// OLD (Express 4):
router.get('/phase/:id', async (req, res, next) => {
  try {
    const phase = await phaseService.getPhaseDetail(projectDir, req.params.id);
    res.render('phase', { phase });
  } catch (error) {
    next(error);
  }
});

// NEW (Express 5):
router.get('/phase/:id', async (req, res) => {
  const phase = await phaseService.getPhaseDetail(projectDir, req.params.id);
  res.render('phase', { phase });
});
// If getPhaseDetail throws or rejects, Express 5 calls next(error) automatically
```

**Error Handler Registration** [S2-HIGH]:
```javascript
// Error handlers MUST be registered LAST, after all routes
// Source: [S2] https://expressjs.com/en/guide/error-handling.html

app.use('/', indexRouter);
app.use('/', pagesRouter);
app.use('/api/events', eventsRouter);

// Error handler MUST be last
app.use(errorHandler);
```

### Data Models

**Custom Error Objects** [S2-MEDIUM]:
```javascript
// Source: [S2] https://betterstack.com/community/guides/scaling-nodejs/error-handling-express/

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Usage:
throw new AppError('Phase not found', 404);
```

**Error Response Format**:
```javascript
// JSON API errors (for future API expansion)
{
  "error": {
    "status": 404,
    "message": "Resource not found",
    "details": {} // Only in development
  }
}

// HTML errors (current)
// Rendered via error.ejs template with title, status, message, stack (dev only)
```

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| helmet | ^8.0.0 | Security headers | app.js |
| express | 5.x | Automatic async error handling | All routes |
| memfs | ^4.x | Cross-platform path testing | test files |
| vitest | ^2.x | Test runner with fs mocking support | testing |

**Installation**:
```bash
npm install helmet
npm install --save-dev memfs
```

## Pitfalls for This Phase

### 1. Path Traversal on Windows Drive Letters [S5-LOW]
**Source**: [GitHub node-tar commit](https://github.com/isaacs/node-tar/commit/875a37e)

On Windows, paths like `C:../` can bypass simple `..` checks. A path starting with a drive letter followed by `../` may not be caught by `startsWith('..')` validation.

**Mitigation**: Use `path.resolve()` to normalize paths to absolute form before validation. Check both `startsWith('..')` and `resolve(rel) === rel` to catch absolute path injections.

### 2. Express 5 Requires 4-Parameter Error Handler [S2-HIGH]
**Source**: [Express error handling docs](https://expressjs.com/en/guide/error-handling.html)

Error handlers MUST have exactly 4 parameters `(err, req, res, next)` or Express won't recognize them as error handlers. Even if `next` is unused, it must be in the signature.

**Current implementation**: ✅ Already correct in `errorHandler.js` (line 7)

### 3. Headers Already Sent Check [S2-HIGH]
**Source**: [Express error handling docs](https://expressjs.com/en/guide/error-handling.html)

If `res.headersSent` is true, you cannot send a new response. Must delegate to default Express error handler by calling `next(err)`.

**Current implementation**: ❌ Missing this check (add to errorHandler.js)

### 4. Gray-matter YAMLException is Large [S4-MEDIUM]
**Source**: [gray-matter Issue #169](https://github.com/jonschlinkert/gray-matter/issues/169)

YAMLException objects include the entire source text in the error, making them large when frontmatter is big. Error logs may be verbose.

**Mitigation**: Extract only `error.message` for user-facing messages. Log full error object only in development mode.

### 5. BOM Detection Already Implemented [S2-HIGH]
**Source**: Current codebase (planning.repository.js lines 13-15)

UTF-8 BOM (`\uFEFF`) can cause gray-matter to fail detecting frontmatter delimiters. Windows editors may add BOM to files.

**Current implementation**: ✅ Already handled with `stripBOM()` function

### 6. Cross-Platform Path Testing Requires Explicit Platform Tests [S2-MEDIUM]
**Source**: [Node.js path module docs](https://nodejs.org/api/path.html)

Testing on one platform doesn't guarantee cross-platform correctness. Use `path.win32` and `path.posix` to test both behaviors explicitly.

**Example**:
```javascript
import { win32, posix } from 'node:path';

// Test Windows behavior on any OS
expect(win32.join('C:\\', 'foo', 'bar')).toBe('C:\\foo\\bar');

// Test POSIX behavior on any OS
expect(posix.join('/', 'foo', 'bar')).toBe('/foo/bar');
```

### 7. Helmet CSP May Block HTMX/Alpine.js [S2-MEDIUM]
**Source**: [Helmet README](https://github.com/helmetjs/helmet)

Helmet's Content-Security-Policy defaults may block inline scripts required by HTMX and Alpine.js. CSP "likely requires some configuration for your specific app."

**Mitigation**: Either disable CSP or configure it to allow HTMX/Alpine.js:
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"], // Allow Alpine.js inline scripts
    },
  },
}));
```

**Risk**: `'unsafe-inline'` reduces XSS protection. Consider using nonces or hashes instead for production.

### 8. NODE_ENV Not Set in Development [S2-HIGH]
**Source**: [Express production security best practices](https://expressjs.com/en/advanced/best-practice-security.html)

If `NODE_ENV` is not set, it defaults to empty string (falsy). Check `process.env.NODE_ENV !== 'production'` rather than `process.env.NODE_ENV === 'development'`.

**Current implementation**: ❌ Not checked in errorHandler.js (add environment detection)

## Testing Strategy

### Unit Tests (Vitest + memfs)

**Path Traversal Tests**:
```javascript
import { describe, it, expect } from 'vitest';
import { validatePath } from '../repositories/planning.repository.js';

describe('Path Traversal Protection', () => {
  const baseDir = '/home/user/project/.planning';

  it('should allow valid relative paths', () => {
    expect(validatePath(baseDir, 'phases/01-setup/PLAN.md'))
      .toBe('/home/user/project/.planning/phases/01-setup/PLAN.md');
  });

  it('should reject parent directory traversal', () => {
    expect(() => validatePath(baseDir, '../../../etc/passwd'))
      .toThrow('Path traversal attempt detected');
  });

  it('should reject absolute path injection', () => {
    expect(() => validatePath(baseDir, '/etc/passwd'))
      .toThrow('Path traversal attempt detected');
  });

  it('should reject Windows drive letter injection', () => {
    expect(() => validatePath(baseDir, 'C:\\Windows\\System32'))
      .toThrow('Path traversal attempt detected');
  });
});
```

**Cross-Platform Path Tests**:
```javascript
import { describe, it, expect } from 'vitest';
import { win32, posix } from 'node:path';

describe('Cross-Platform Path Handling', () => {
  it('should handle Windows paths correctly', () => {
    const result = win32.join('C:\\', 'project', '.planning', 'ROADMAP.md');
    expect(result).toBe('C:\\project\\.planning\\ROADMAP.md');
  });

  it('should handle POSIX paths correctly', () => {
    const result = posix.join('/', 'home', 'user', 'project', '.planning', 'ROADMAP.md');
    expect(result).toBe('/home/user/project/.planning/ROADMAP.md');
  });

  it('should normalize mixed separators on Windows', () => {
    const result = win32.normalize('C:/project/.planning\\ROADMAP.md');
    expect(result).toBe('C:\\project\\.planning\\ROADMAP.md');
  });
});
```

**Gray-matter Error Handling Tests**:
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

const { readMarkdownFile } = await import('../repositories/planning.repository.js');

describe('Gray-matter Error Handling', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should throw on malformed YAML frontmatter', async () => {
    vol.fromJSON({
      '/doc.md': '---\ntitle: Test\nstatus [invalid yaml\n---\nContent'
    });

    await expect(readMarkdownFile('/doc.md'))
      .rejects
      .toThrow('Invalid YAML frontmatter');
  });

  it('should handle missing closing frontmatter delimiter', async () => {
    vol.fromJSON({
      '/doc.md': '---\ntitle: Test\nstatus: draft\n\nNo closing delimiter'
    });

    await expect(readMarkdownFile('/doc.md'))
      .rejects
      .toThrow();
  });

  it('should handle empty files gracefully', async () => {
    vol.fromJSON({
      '/empty.md': ''
    });

    const result = await readMarkdownFile('/empty.md');
    expect(result.frontmatter).toEqual({});
    expect(result.html).toBe('');
  });
});
```

**Error Handler Tests** (requires supertest):
```javascript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Error Handler', () => {
  it('should return 404 for missing phase', async () => {
    const app = createApp({ projectDir: '/fake/project' });
    const response = await request(app).get('/phase/99');

    expect(response.status).toBe(404);
    expect(response.text).toContain('Error');
  });

  it('should hide stack traces in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp({ projectDir: '/fake/project' });

    // Trigger an error
    const response = await request(app).get('/invalid-route');

    expect(response.text).not.toContain('at '); // No stack trace
  });

  it('should show stack traces in development', async () => {
    process.env.NODE_ENV = 'development';
    const app = createApp({ projectDir: '/fake/project' });

    // Trigger an error
    const response = await request(app).get('/invalid-route');

    expect(response.text).toContain('at '); // Stack trace visible
  });
});
```

### Integration Tests

**Manual Testing Checklist**:
1. ✅ Start server with invalid project directory → Error page renders
2. ✅ Visit `/phase/99` (non-existent phase) → 404 error page
3. ✅ Create markdown file with malformed YAML → Error page with validation message
4. ✅ Create empty markdown file → Renders without crashing
5. ✅ Create markdown file with BOM → Parses correctly
6. ✅ Test on Windows: paths with backslashes work correctly
7. ✅ Test on macOS/Linux: paths with forward slashes work correctly
8. ✅ Verify server binds to `127.0.0.1` only (not `0.0.0.0`)
9. ✅ Check HTTP response headers include Helmet security headers
10. ✅ Verify `X-Powered-By` header is not present

**Security Testing**:
```bash
# Test path traversal via URL
curl http://127.0.0.1:3000/phase/../../etc/passwd
# Expected: 403 Forbidden or 404 Not Found

# Check security headers
curl -I http://127.0.0.1:3000
# Expected headers:
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - Strict-Transport-Security: max-age=31536000; includeSubDomains
# - Content-Security-Policy: (present)
# - NO X-Powered-By header
```

## Open Questions

1. **CSP Configuration**: Should we disable CSP entirely or configure it for HTMX/Alpine.js? Current dashboard doesn't use inline scripts heavily, but Alpine.js may require `'unsafe-inline'`. [MEDIUM]

2. **Logging Strategy**: Should errors be logged to a file in production, or is console.error sufficient for a local dev tool? [LOW]

3. **Custom 404 Pages**: Should we create separate 404 error page vs general error page, or is one error template sufficient? Current implementation uses single error template. [LOW]

4. **Rate Limiting**: Should we add rate limiting middleware even though this is a local single-user tool? Helmet doesn't include rate limiting. [LOW]

5. **Session Security**: No sessions currently used. If added in future phases, will need to configure secure session cookies. [DEFER]

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | [Express Error Handling](https://expressjs.com/en/guide/error-handling.html) | HIGH |
| S2 | Official Docs | [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html) | HIGH |
| S2 | Official Docs | [Node.js Path Module](https://nodejs.org/api/path.html) | HIGH |
| S2 | GitHub | [Helmet.js Repository](https://github.com/helmetjs/helmet) | HIGH |
| S2 | GitHub | [gray-matter Repository](https://github.com/jonschlinkert/gray-matter) | HIGH |
| S2 | Official Docs | [Vitest File System Mocking](https://vitest.dev/guide/mocking/file-system) | HIGH |
| S4 | Blog/Guide | [Better Stack: Express Error Handling](https://betterstack.com/community/guides/scaling-nodejs/error-handling-express/) | MEDIUM |
| S4 | Blog/Guide | [Better Stack: Express 5 New Features](https://betterstack.com/community/guides/scaling-nodejs/express-5-new-features/) | MEDIUM |
| S4 | Book | [Node.js Secure Coding: Path Traversal](https://www.nodejs-security.com/book/path-traversal) | MEDIUM |
| S4 | GitHub | [Cross-Platform Node Guide: File Paths](https://github.com/ehmicky/cross-platform-node-guide/blob/main/docs/3_filesystem/file_paths.md) | MEDIUM |
| S4 | GitHub Issue | [gray-matter YAMLException Issue #169](https://github.com/jonschlinkert/gray-matter/issues/169) | MEDIUM |
| S5 | GitHub Commit | [node-tar Path Escape Fix](https://github.com/isaacs/node-tar/commit/875a37e) | LOW |
| S5 | Blog | [DEV: Express 5 Async Support](https://dev.to/mahmud007/goodbye-asynchandler-native-async-support-in-express-5-2o9p) | LOW |
| S5 | Blog | [OneUpTime: Helmet Security Guide](https://oneuptime.com/blog/post/2026-01-25-helmet-security-expressjs/view) | LOW |

---
phase: "12-polish-and-hardening"
plan: "12-02"
status: "complete"
subsystem: "security"
tags:
  - "security"
  - "path-traversal"
  - "helmet"
  - "cross-platform"
  - "error-handling"
requires:
  - "12-01: error handler and 404 handler middleware"
  - "01-01: Express server, app.js, planning.repository.js"
provides:
  - "validatePath() export for path traversal protection in planning.repository.js"
  - "gray-matter YAMLException wrapping with status 400 in readMarkdownFile"
  - "Helmet security headers on all responses (CSP, X-Content-Type-Options, X-Frame-Options)"
  - "X-Powered-By header removal"
  - "28 new security and cross-platform tests (154 total)"
affects:
  - "src/repositories/planning.repository.js"
  - "src/app.js"
  - "tests/repositories/planning.repository.test.js"
  - "tests/security/"
tech_stack:
  - "helmet"
  - "vitest"
  - "node:path (win32/posix)"
key_files:
  - "src/repositories/planning.repository.js: validatePath export and gray-matter error wrapping"
  - "src/app.js: helmet middleware with CSP for cdn.jsdelivr.net"
  - "tests/security/path-traversal.test.js: 10 tests for validatePath"
  - "tests/security/cross-platform.test.js: 13 tests for path ops, server binding, Helmet headers"
  - "tests/repositories/planning.repository.test.js: 5 new gray-matter error handling tests (21 total)"
key_decisions:
  - "CSP unsafe-inline for styleSrc: Pico.css uses inline styles in some cases"
  - "Test expectation fix: gray-matter returns empty string (not newline) for frontmatter-only files"
patterns:
  - "validatePath uses path.resolve + path.relative to detect escapes: works cross-platform"
  - "Helmet test creates real HTTP server on random port for header inspection"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  tasks_total: 3
  commits: 2
  files_created: 2
  files_modified: 3
deferred: []
---

# Plan Summary: 12-02

## What Was Built

Security hardening for the Towline Dashboard: path traversal protection in the repository layer, gray-matter YAML error handling with user-friendly 400 responses, and Helmet security headers on all HTTP responses.

The `validatePath` function uses `path.resolve` and `path.relative` to detect when a user-provided path escapes the intended base directory, throwing a 403 error with `PATH_TRAVERSAL` code. The gray-matter try-catch wraps `YAMLException` errors into descriptive 400 errors that include the file path. Helmet configures Content-Security-Policy to allow CDN scripts from cdn.jsdelivr.net (for HTMX, Pico.css, and the SSE extension) while blocking everything else.

28 new tests cover path traversal (valid paths, rejected paths, edge cases), gray-matter error handling (malformed YAML, empty files, non-YAML error propagation), cross-platform path operations (win32, posix, current platform), server binding validation (127.0.0.1), and Helmet security header verification (real HTTP request).

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 12-02-T1: Add validatePath, gray-matter error handling, and Helmet | done | 1a7b59d | 4 | passed |
| 12-02-T2: Write path traversal, gray-matter, cross-platform, and header tests | done | 2de0067 | 3 | passed |
| 12-02-T3: Run full test suite to verify no regressions | done | (verify-only) | 0 | passed (154 tests, 11 files) |

## Key Implementation Details

- `validatePath(basePath, userPath)` is exported from `planning.repository.js` and can be used by any service that resolves user-provided paths against a base directory.
- The gray-matter error wrapping checks both `error.name === 'YAMLException'` and `error.constructor.name === 'YAMLException'` for robustness.
- Helmet CSP directives: `scriptSrc` allows `'self'` and `cdn.jsdelivr.net`; `styleSrc` adds `'unsafe-inline'` for Pico.css inline styles; `connectSrc` allows `'self'` for SSE connections.
- `app.disable('x-powered-by')` is called after Helmet for defense-in-depth.

## Known Issues

None discovered during execution.

## Dependencies Provided

- `validatePath` export available for any path-resolving service
- Helmet security headers active on all responses
- CSP configured for CDN dependencies (no changes needed for existing HTMX/Pico.css usage)

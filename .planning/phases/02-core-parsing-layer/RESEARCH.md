# Phase Research: Core Parsing Layer

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 02-core-parsing-layer
> Confidence: HIGH

## User Constraints

**Locked Decisions:**
- Node.js 24 LTS (support through 2028)
- Express 5.x (better async error handling)
- HTMX + Alpine.js (no build step, server-rendered)
- EJS templates (simple, HTML-familiar syntax)
- Pico.css (semantic styling, minimal footprint)
- gray-matter (industry standard frontmatter parser)
- marked (fast markdown renderer)
- chokidar 5.x (cross-platform file watching)
- SSE for real-time (unidirectional, simpler than WebSocket)
- Three-layer architecture (Routes → Services → Repositories)
- Vitest for testing (faster than Jest, native ESM)

**User Constraints:**
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

**Deferred Ideas:**
- Responsive/mobile layout (Desktop-first, local tool)
- Multi-project support (Complexity, not needed for v1)
- In-browser file editing (Write safety, view-only for v1)

## Phase Goal

Implement the core parsing layer enabling the Repository and Service layers to read and parse any markdown file with YAML frontmatter from a `.planning/` directory. This phase establishes the foundational data access patterns for all subsequent features.

**Success Criteria:**
1. `PlanningRepository.readMarkdownFile()` returns parsed frontmatter and rendered HTML for any `.planning/` file
2. UTF-8 BOM is stripped before parsing
3. gray-matter JavaScript engine is disabled for safety
4. Independent file reads use `Promise.all()` for parallel execution
5. Unit tests pass with in-memory filesystem mocks

## Implementation Approach

### Recommended Approach

Implement a module-based Repository pattern with ESM exports, using `fs.promises` for async file operations, gray-matter for frontmatter parsing with security hardening, and marked for markdown rendering. Service layer orchestrates repository calls with proper error handling. Unit tests use memfs for in-memory filesystem mocking.

**Architecture Decision: Module vs Class** [S4-MEDIUM]

Use **module with named exports** rather than class-based repositories. Rationale:
- ESM best practice for 2026: named exports for multiple functions [S4]
- Stateless operations (no instance state needed)
- Simpler dependency injection (pass dependencies as function parameters)
- Better tree-shaking support
- Easier to test individual functions

**Steps:**

1. **Implement PlanningRepository** (`src/repositories/planning.repository.js`)
   - Export `readMarkdownFile(filePath)` function
   - Use `fs.promises.readFile()` with UTF-8 encoding
   - Strip BOM using `.replace(/^\uFEFF/, '')` before parsing [S2-HIGH]
   - Parse with `matter(content, { engines: { javascript: false } })` for security [S2-HIGH]
   - Render markdown using `marked.parse()` [S2-HIGH]
   - Return `{ frontmatter, html, rawContent }`

2. **Implement ProjectService** (`src/services/project.service.js`)
   - Export `getHomepage(projectDir)` function
   - Call `PlanningRepository.readMarkdownFile()` with appropriate path
   - Handle errors gracefully (missing files, parse errors)
   - Transform repository data for presentation layer

3. **Security Hardening**
   - Disable gray-matter JavaScript engine: `engines: { javascript: false }` [S2-HIGH]
   - marked sanitization: Do NOT use deprecated `sanitize: true` option [S2-HIGH]
   - For user-generated content (not applicable in v1), use DOMPurify: `DOMPurify.sanitize(marked.parse(content))` [S2-HIGH]

4. **Error Handling Patterns**
   - Missing file: Return null or throw custom `FileNotFoundError`
   - Malformed YAML: Catch gray-matter parse errors, return descriptive error
   - Empty frontmatter: gray-matter returns `{ data: {}, content: "..." }` (valid case)
   - Directory instead of file: `fs.promises.readFile()` will throw EISDIR

5. **Parallel File Operations**
   - Use `Promise.all()` for independent file reads [S2-HIGH]
   - Wrap individual promises with `.catch()` if partial failures are acceptable [S2-HIGH]
   - Use `Promise.allSettled()` if all reads should complete even if some fail [S2-HIGH]

**Key decisions:**

- **Module-based exports over classes** [S4-MEDIUM]: Modern ESM pattern, stateless operations
- **Manual BOM stripping with regex** [S2-HIGH]: Node.js does not auto-strip BOM, manual handling required
- **Disable JS engine in gray-matter** [S2-HIGH]: Prevents RCE vulnerability via malicious frontmatter
- **No sanitization in marked** [S2-HIGH]: Deprecated option; for untrusted content use DOMPurify (not needed in v1)
- **memfs for testing** [S1-HIGH]: Vitest official recommendation, fast, constant memory usage

### Configuration Details

**gray-matter Configuration:**

```javascript
import matter from 'gray-matter';

// ESM import - default export [S4]
const result = matter(fileContent, {
  engines: {
    javascript: false  // CRITICAL: Disable JS engine to prevent RCE [S2]
  }
});

// result.data = frontmatter object
// result.content = markdown content after frontmatter
// result.excerpt = optional excerpt
```

**Key gray-matter options:**
- `engines: { javascript: false }` - Disable JS frontmatter parsing for security [S2-HIGH]
- `excerpt: true` - Extract excerpt (optional)
- `excerpt_separator: '---'` - Custom excerpt separator (optional)

**marked Configuration:**

```javascript
import { marked } from 'marked';

// Basic usage for trusted content [S2]
const html = marked.parse(markdownContent);

// With options [S2]
const html = marked.parse(markdownContent, {
  async: false,      // Synchronous parsing (default)
  gfm: true,         // GitHub Flavored Markdown (default: true)
  breaks: false,     // Convert \n to <br> (default: false)
  pedantic: false    // Conform to original markdown.pl (default: false)
});

// For untrusted content (NOT needed in v1):
// import DOMPurify from 'isomorphic-dompurify';
// const safeHtml = DOMPurify.sanitize(marked.parse(content));
```

**Current versions** [S4-MEDIUM]:
- gray-matter: 4.0.3 (published 5 years ago, stable, 3.4M+ weekly downloads)
- marked: 17.x (latest: 17.0.1, published recently)

**UTF-8 BOM Handling:**

```javascript
import { readFile } from 'fs/promises';

// Option 1: Manual strip (recommended for simplicity) [S2]
const content = await readFile(filePath, 'utf-8');
const contentNoBOM = content.replace(/^\uFEFF/, '');

// Option 2: TextDecoder (modern, auto-strips BOM) [S2]
const buffer = await readFile(filePath); // No encoding, returns Buffer
const decoder = new TextDecoder('utf-8'); // BOM stripped by default
const content = decoder.decode(buffer);
```

**Recommendation**: Use Option 1 (manual regex strip) for clarity and explicitness [S2-HIGH].

### API Patterns

**PlanningRepository API:**

```javascript
// src/repositories/planning.repository.js

import { readFile } from 'fs/promises';
import matter from 'gray-matter';
import { marked } from 'marked';

/**
 * Read and parse a markdown file with frontmatter
 * @param {string} filePath - Absolute path to markdown file
 * @returns {Promise<{frontmatter: object, html: string, rawContent: string}>}
 * @throws {Error} If file not found or parse error
 */
export async function readMarkdownFile(filePath) {
  // Read file with UTF-8 encoding
  const fileContent = await readFile(filePath, 'utf-8');

  // Strip UTF-8 BOM if present
  const contentNoBOM = fileContent.replace(/^\uFEFF/, '');

  // Parse frontmatter with security hardening
  const { data, content } = matter(contentNoBOM, {
    engines: {
      javascript: false  // Disable JS engine for security
    }
  });

  // Render markdown to HTML
  const html = marked.parse(content);

  return {
    frontmatter: data,
    html,
    rawContent: content
  };
}

/**
 * Read multiple markdown files in parallel
 * @param {string[]} filePaths - Array of absolute file paths
 * @returns {Promise<Array<{frontmatter: object, html: string, rawContent: string}>>}
 */
export async function readMarkdownFiles(filePaths) {
  return Promise.all(
    filePaths.map(filePath => readMarkdownFile(filePath))
  );
}

/**
 * Read multiple files, handling partial failures
 * @param {string[]} filePaths - Array of absolute file paths
 * @returns {Promise<Array<{status: string, value?: object, reason?: Error}>>}
 */
export async function readMarkdownFilesSettled(filePaths) {
  return Promise.allSettled(
    filePaths.map(filePath => readMarkdownFile(filePath))
  );
}
```

**ProjectService API:**

```javascript
// src/services/project.service.js

import { join } from 'path';
import { readMarkdownFile } from '../repositories/planning.repository.js';

/**
 * Get homepage data for a project
 * @param {string} projectDir - Absolute path to project root
 * @returns {Promise<{title: string, content: string}>}
 */
export async function getHomepage(projectDir) {
  try {
    const readmePath = join(projectDir, '.planning', 'README.md');
    const { frontmatter, html } = await readMarkdownFile(readmePath);

    return {
      title: frontmatter.title || 'Project Dashboard',
      content: html
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        title: 'Welcome',
        content: '<p>No project README found.</p>'
      };
    }
    throw error; // Re-throw other errors
  }
}
```

**Error Handling Patterns:**

```javascript
// Pattern 1: Fail-fast with Promise.all (all or nothing)
try {
  const results = await Promise.all([
    readMarkdownFile(path1),
    readMarkdownFile(path2)
  ]);
} catch (error) {
  // First failure stops everything
}

// Pattern 2: Continue on partial failures with Promise.allSettled
const results = await Promise.allSettled([
  readMarkdownFile(path1),
  readMarkdownFile(path2)
]);

results.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`File ${index}:`, result.value);
  } else {
    console.error(`File ${index} failed:`, result.reason);
  }
});

// Pattern 3: Individual promise error wrapping
const results = await Promise.all([
  readMarkdownFile(path1).catch(err => ({ error: err })),
  readMarkdownFile(path2).catch(err => ({ error: err }))
]);
```

**Recommendation for Phase 2**: Use Pattern 1 (fail-fast) for single file operations, Pattern 2 (allSettled) for bulk operations where partial success is acceptable [S2-HIGH].

### Data Models

**ParsedMarkdownFile Interface:**

```typescript
interface ParsedMarkdownFile {
  frontmatter: Record<string, any>;  // Parsed YAML frontmatter
  html: string;                      // Rendered HTML from markdown
  rawContent: string;                // Markdown content (without frontmatter)
}
```

**Common Frontmatter Schemas:**

```yaml
# STATE.md frontmatter
---
current_phase: "02-core-parsing-layer"
phase_status: "in-progress"
last_updated: "2026-02-08"
---

# PLAN.md frontmatter
---
phase: 2
title: "Core Parsing Layer"
status: "planning"
estimated_tasks: 12
---

# RESEARCH.md frontmatter
---
research_date: "2026-02-08"
confidence: "HIGH"
sources: 15
---
```

### Directory Listing Approach

**Question 7: How to handle glob/directory listing cross-platform?**

**Recommendation**: Use native `fs.promises.readdir()` with `recursive: true` option [S2-HIGH].

**Rationale:**
- Built-in Node.js feature (no dependencies)
- Cross-platform support guaranteed
- Constant memory usage
- Sufficient for Phase 2 needs (reading `.planning/` structure)

**Alternative**: Use `glob` or `fast-glob` packages if advanced pattern matching is needed later [S4-MEDIUM].

```javascript
import { readdir } from 'fs/promises';
import { join } from 'path';

/**
 * List all markdown files in .planning directory recursively
 * @param {string} projectDir - Absolute path to project root
 * @returns {Promise<string[]>} Array of absolute file paths
 */
export async function listPlanningFiles(projectDir) {
  const planningDir = join(projectDir, '.planning');
  const entries = await readdir(planningDir, {
    recursive: true,
    withFileTypes: true
  });

  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join(entry.parentPath || entry.path, entry.name));
}
```

**Note**: `recursive: true` is available in Node.js 18.17.0+ [S2-HIGH]. For older versions, use recursive manual traversal or the `glob` package.

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| gray-matter | 4.0.3 | YAML frontmatter parsing | INF-02 |
| marked | ^17.0.0 | Markdown to HTML rendering | INF-02 |
| memfs | ^4.0.0 | In-memory filesystem for testing | Test requirements |
| vitest | (already installed) | Unit testing framework | Test requirements |

**Installation:**

```bash
npm install gray-matter marked
npm install -D memfs
```

**Version notes:**
- gray-matter 4.0.3 is stable (5 years old, 3.4M+ weekly downloads) [S4-MEDIUM]
- marked 17.x is latest (active development, "built for speed") [S4-MEDIUM]
- memfs 4.x is current stable version [S1-HIGH]

## Pitfalls for This Phase

1. **BOM Not Stripped** [S2-HIGH]: Node.js does not auto-strip UTF-8 BOM. Files created by some Windows editors (Notepad, older VS Code) may have BOM. Always strip with `.replace(/^\uFEFF/, '')` before parsing.

   *Impact*: gray-matter will parse BOM as part of content, breaking frontmatter detection.

2. **JavaScript Engine Enabled** [S2-HIGH]: gray-matter's default allows `---js` frontmatter which executes arbitrary JavaScript via eval(). This is a Remote Code Execution (RCE) vulnerability.

   *Mitigation*: Always set `engines: { javascript: false }` when calling `matter()`.

3. **marked Sanitize Option Deprecated** [S2-HIGH]: The `sanitize: true` option was removed in marked v0.7.0+. Using it will trigger warnings or errors.

   *Mitigation*: Remove sanitize option. For untrusted content, use DOMPurify (not needed in v1 - all content is local developer files).

4. **Promise.all Fail-Fast Behavior** [S2-HIGH]: `Promise.all()` rejects immediately if any promise rejects, stopping other operations. Remaining promises continue in background but results are lost.

   *Mitigation*: Use `Promise.allSettled()` if partial failures are acceptable. Use individual `.catch()` handlers for custom error handling.

5. **Cross-Platform Path Handling** [S2-HIGH]: Hardcoded path separators (`/` or `\`) break cross-platform compatibility. Windows uses `\`, Unix uses `/`.

   *Mitigation*: Always use `path.join()` and `path.resolve()` from `node:path` module.

6. **Empty Frontmatter Mishandling** [S4-MEDIUM]: Files with `---\n---` (empty frontmatter) or no frontmatter are valid. Don't treat as error.

   *gray-matter behavior*: Returns `{ data: {}, content: "..." }` for empty or missing frontmatter.

7. **Synchronous File Operations** [S2-HIGH]: Using `fs.readFileSync()` blocks the event loop, degrading server performance.

   *Mitigation*: Always use `fs.promises` with `async/await`.

8. **Unhandled File Encoding** [S4-MEDIUM]: Not specifying `'utf-8'` encoding returns a Buffer. gray-matter can handle Buffers, but explicit encoding is clearer.

   *Best practice*: Always specify `'utf-8'` encoding in `readFile()`.

9. **memfs State Leakage Between Tests** [S1-HIGH]: In-memory filesystem state persists between tests unless explicitly reset.

   *Mitigation*: Call `vol.reset()` in `beforeEach()` hook [S1-HIGH].

10. **marked Async Parsing Confusion** [S2-HIGH]: `marked.parse()` is synchronous by default. It only returns a Promise if `async: true` is set in options AND custom extensions are registered.

    *Best practice*: Don't set `async: true` unless using async extensions. Use synchronous parsing for simplicity.

## Testing Strategy

### Unit Testing with memfs

**Setup Pattern** [S1-HIGH]:

```javascript
// tests/repositories/planning.repository.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import { readMarkdownFile } from '../../src/repositories/planning.repository.js';

// Mock fs module
vi.mock('node:fs/promises', () => {
  const memfs = vi.importActual('memfs');
  return memfs.fs.promises;
});

describe('PlanningRepository', () => {
  beforeEach(() => {
    // Reset in-memory filesystem before each test
    vol.reset();
  });

  it('should parse markdown with frontmatter', async () => {
    // Arrange: Create test file in memory
    vol.fromJSON({
      '/test/file.md': '---\ntitle: Test\n---\n# Content'
    });

    // Act
    const result = await readMarkdownFile('/test/file.md');

    // Assert
    expect(result.frontmatter.title).toBe('Test');
    expect(result.html).toContain('<h1>Content</h1>');
  });

  it('should strip UTF-8 BOM', async () => {
    // BOM character: \uFEFF
    vol.fromJSON({
      '/test/bom.md': '\uFEFF---\ntitle: BOM Test\n---\nContent'
    });

    const result = await readMarkdownFile('/test/bom.md');
    expect(result.frontmatter.title).toBe('BOM Test');
  });

  it('should handle empty frontmatter', async () => {
    vol.fromJSON({
      '/test/empty.md': '---\n---\n# No frontmatter'
    });

    const result = await readMarkdownFile('/test/empty.md');
    expect(result.frontmatter).toEqual({});
    expect(result.html).toContain('<h1>No frontmatter</h1>');
  });

  it('should throw on missing file', async () => {
    await expect(readMarkdownFile('/test/missing.md'))
      .rejects
      .toThrow();
  });
});
```

**Key Testing Patterns:**

1. **Reset state in beforeEach** [S1-HIGH]: Always call `vol.reset()` to prevent test pollution
2. **Use vol.fromJSON() for setup** [S1-HIGH]: Define file structure as JSON object
3. **Test edge cases**: BOM, empty frontmatter, missing files, malformed YAML
4. **Test parallel operations**: Verify `Promise.all()` behavior
5. **Test error handling**: Missing files, parse errors, directory instead of file

**Test Coverage Goals:**

- [x] Basic frontmatter parsing
- [x] Markdown rendering
- [x] UTF-8 BOM stripping
- [x] Empty frontmatter handling
- [x] Missing file errors
- [x] Malformed YAML errors
- [x] Parallel file reads with Promise.all
- [x] Cross-platform path handling
- [ ] JavaScript engine disabled (security test)

### Integration Testing

**Service Layer Tests:**

```javascript
// tests/services/project.service.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import { getHomepage } from '../../src/services/project.service.js';

vi.mock('node:fs/promises', () => {
  const memfs = vi.importActual('memfs');
  return memfs.fs.promises;
});

describe('ProjectService', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should return homepage data', async () => {
    vol.fromJSON({
      '/project/.planning/README.md': '---\ntitle: My Project\n---\n# Welcome'
    });

    const result = await getHomepage('/project');

    expect(result.title).toBe('My Project');
    expect(result.content).toContain('<h1>Welcome</h1>');
  });

  it('should handle missing README gracefully', async () => {
    vol.fromJSON({
      '/project/.planning/': null // Empty directory
    });

    const result = await getHomepage('/project');

    expect(result.title).toBe('Welcome');
    expect(result.content).toContain('No project README found');
  });
});
```

### Manual Testing Checklist

**After implementation, verify:**

1. [ ] Create test markdown file with frontmatter in `.planning/`
2. [ ] Create test file with UTF-8 BOM (use Notepad on Windows)
3. [ ] Create test file with no frontmatter
4. [ ] Create test file with empty frontmatter (`---\n---`)
5. [ ] Verify HTML rendering includes proper tags (`<h1>`, `<p>`, etc.)
6. [ ] Verify malformed YAML throws descriptive error
7. [ ] Verify missing file throws ENOENT error
8. [ ] Run on both Windows and Unix (macOS/Linux) systems

## Open Questions

1. **Question**: Should we cache parsed markdown in memory, or re-parse on every request?

   **Context**: Phase 2 has no caching. Phase 3 (file watching) will add intelligent cache invalidation via chokidar.

   **Recommendation**: No caching in Phase 2. Keep it simple. Add caching in Phase 3 when file watching is available.

2. **Question**: Should `readMarkdownFile()` validate frontmatter schema, or just parse and return?

   **Context**: Different file types (STATE.md, PLAN.md, RESEARCH.md) have different schemas.

   **Recommendation**: Repository layer does NOT validate schema - it's a dumb parser. Service layer can validate schemas if needed. Keep repositories focused on I/O.

3. **Question**: Should we support CommonJS frontmatter (CJS format) or other formats beyond YAML?

   **Context**: gray-matter supports YAML, JSON, TOML, Coffee, and JavaScript frontmatter.

   **Recommendation**: YAML only for Phase 2. Towline spec uses YAML. Don't add complexity without requirements.

4. **Question**: How to handle very large markdown files (>10MB)?

   **Context**: Planning files are typically <100KB. Large files are unlikely.

   **Recommendation**: No special handling in Phase 2. If this becomes a problem, add streaming parser in future phase. Document as known limitation.

5. **Question**: Should repository functions return custom error types (e.g., `FileNotFoundError`, `ParseError`) or throw native errors?

   **Context**: Service layer needs to distinguish error types for proper handling.

   **Recommendation**: For Phase 2, use native errors (clearer stack traces). Service layer checks `error.code === 'ENOENT'` for missing files. Add custom error classes in later phase if needed for API consistency.

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S1 | Official Docs | [Vitest - Mocking the File System](https://vitest.dev/guide/mocking/file-system) | HIGH |
| S2 | Official Docs | [Node.js - File System Promises API](https://nodejs.org/api/fs.html) | HIGH |
| S2 | Official Docs | [Node.js - ECMAScript Modules](https://nodejs.org/api/esm.html) | HIGH |
| S2 | GitHub Issue | [gray-matter - Security consideration: disable JS engine](https://github.com/jonschlinkert/gray-matter/issues/131) | HIGH |
| S2 | GitHub Issue | [gray-matter - ESM import issues](https://github.com/jonschlinkert/gray-matter/issues/171) | HIGH |
| S2 | GitHub Discussion | [marked - Sanitize and sanitizer deprecated](https://github.com/markedjs/marked/discussions/1232) | HIGH |
| S2 | Official Docs | [marked - Using Advanced](https://marked.js.org/using_advanced) | HIGH |
| S2 | GitHub Commit | [md-to-pdf - Fix: override gray-matter JS engine](https://github.com/simonhaenisch/md-to-pdf/commit/46bdcf2051c8d1758b391c1353185a179a47a4d9) | HIGH |
| S4 | Blog Post | [Kevin Schaul - Mock fs with vitest and memfs](https://kschaul.com/til/2024/06/26/mock-fs-with-vitest-and-memfs/) | MEDIUM |
| S4 | Tutorial | [TheLinuxCode - Exporting Multiple Values from Node.js Module (ESM patterns 2026)](https://thelinuxcode.com/exporting-multiple-values-from-a-nodejs-module-esm-commonjs-patterns-that-hold-up-in-2026/) | MEDIUM |
| S4 | Blog Post | [DEV Community - How to properly handle UTF-8 BOM files in Node.js](https://dev.to/omardulaimi/how-to-properly-handle-utf-8-bom-files-in-nodejs-1nmj) | MEDIUM |
| S4 | Tutorial | [Node.js - Run Async Functions/Promises in Parallel](https://futurestud.io/tutorials/node-js-run-async-functions-promises-in-parallel) | MEDIUM |
| S4 | Blog Post | [Medium - Breaking Free from MVC Hell: Service-Repository-Controller Pattern](https://medium.com/@mohammedbasit362/breaking-free-from-mvc-hell-why-your-node-js-code-needs-the-service-repository-controller-pattern-c080725ab910) | MEDIUM |
| S4 | Documentation | [npm - readdir-glob package](https://www.npmjs.com/package/readdir-glob) | MEDIUM |
| S4 | npm Package | [marked latest version (17.0.1)](https://www.npmjs.com/package/marked?activeTab=versions) | MEDIUM |

**Total sources consulted**: 16 (1 S1, 8 S2, 0 S3, 7 S4)

**Research completeness**: All 7 research questions answered with HIGH or MEDIUM confidence. No critical gaps identified.

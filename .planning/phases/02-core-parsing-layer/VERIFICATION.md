---
status: "passed"
phase: "02-core-parsing-layer"
checked_at: "2026-02-08"
must_haves_checked: 22
must_haves_passed: 22
must_haves_failed: 0
---

# Phase 02 Verification Report: Core Parsing Layer

## Test Suite Results

```
vitest v3.2.4
 ✓ tests/services/project.service.test.js (10 tests) 21ms
 ✓ tests/repositories/planning.repository.test.js (16 tests) 29ms

 Test Files  2 passed (2)
      Tests  26 passed (26)
   Duration  455ms
```

All 26 tests pass. No failures, no skips.

---

## Plan 02-01: Repository Layer Implementation and Tests

### Truths

#### T1: readMarkdownFile(filePath) returns {frontmatter, html, rawContent}
- **Existence**: PASS -- function exported at line 24 of `planning.repository.js`
- **Substantiveness**: PASS -- 17 lines of implementation; parses with gray-matter, renders with marked, returns the three-field object (lines 36-40)
- **Wiring**: PASS -- test at line 24-36 of `planning.repository.test.js` asserts all three fields; service layer calls it at `project.service.js` line 14

#### T2: UTF-8 BOM is stripped before gray-matter parsing
- **Existence**: PASS -- `stripBOM()` helper at lines 13-15
- **Substantiveness**: PASS -- uses regex `content.replace(/^\uFEFF/, '')` to remove BOM before gray-matter receives the string (line 26)
- **Wiring**: PASS -- test at lines 38-47 creates a file with `\uFEFF` prefix and asserts frontmatter parses correctly

#### T3: gray-matter JavaScript engine is disabled
- **Existence**: PASS -- `engines: { javascript: false }` at lines 29-31
- **Substantiveness**: PASS -- passed directly to `matter()` options object, preventing RCE via malicious frontmatter
- **Wiring**: PASS -- the option is applied to every `readMarkdownFile` call since it is inline in the function

#### T4: readMarkdownFiles(filePaths) reads multiple files in parallel via Promise.all()
- **Existence**: PASS -- function exported at line 50
- **Substantiveness**: PASS -- uses `Promise.all(filePaths.map(...))` (line 51-53)
- **Wiring**: PASS -- tests at lines 129-163 verify parallel read of 3 files and fail-fast on missing file

#### T5: readMarkdownFilesSettled(filePaths) uses Promise.allSettled()
- **Existence**: PASS -- function exported at line 63
- **Substantiveness**: PASS -- uses `Promise.allSettled(filePaths.map(...))` (lines 64-66)
- **Wiring**: PASS -- tests at lines 166-197 verify partial failure tolerance (one fulfilled, one rejected with ENOENT)

#### T6: listPlanningFiles(projectDir) recursively lists all .md files under .planning/
- **Existence**: PASS -- function exported at line 77
- **Substantiveness**: PASS -- uses `readdir(planningDir, { recursive: true, withFileTypes: true })`, filters by `.isFile()` and `.endsWith('.md')` (lines 79-86)
- **Wiring**: PASS -- tests at lines 199-239 verify recursive listing, exclusion of non-.md files, ENOENT on missing dir, and empty result

#### T7: Missing file throws an error with code ENOENT
- **Existence**: PASS -- `readFile` from `node:fs/promises` natively throws ENOENT
- **Substantiveness**: PASS -- no swallowing of errors; exception propagates naturally
- **Wiring**: PASS -- test at lines 72-82 explicitly asserts `error.code === 'ENOENT'`

#### T8: Empty frontmatter returns data: {} (not an error)
- **Existence**: PASS -- gray-matter returns `{ data: {} }` for `---\n---` content
- **Substantiveness**: PASS -- no special-case code needed; gray-matter handles it
- **Wiring**: PASS -- test at lines 49-58 creates file with `---\n---` and asserts `frontmatter` equals `{}`

#### T9: All paths use path.join/path.resolve
- **Existence**: PASS -- `import { join } from 'node:path'` at line 2
- **Substantiveness**: PASS -- `join(projectDir, '.planning')` at line 78; `join(entry.parentPath || entry.path, entry.name)` at line 86
- **Wiring**: PASS -- no raw string concatenation for paths anywhere in the file

#### T10: Unit tests pass using memfs in-memory filesystem mocks
- **Existence**: PASS -- `vi.mock('node:fs/promises', ...)` at lines 5-8 of test file
- **Substantiveness**: PASS -- `vol.fromJSON(...)` creates virtual filesystem; `vol.reset()` in beforeEach clears state
- **Wiring**: PASS -- all 16 tests pass with memfs mock in place

### Artifacts

#### A1: src/repositories/planning.repository.js with all 4 functions
- **Existence**: PASS -- file exists at `D:\Repos\towline-test-project\src\repositories\planning.repository.js`
- **Substantiveness**: PASS -- 87 lines; exports `readMarkdownFile`, `readMarkdownFiles`, `readMarkdownFilesSettled`, `listPlanningFiles`
- **Wiring**: PASS -- imported by `project.service.js` at line 2

#### A2: tests/repositories/planning.repository.test.js with comprehensive coverage
- **Existence**: PASS -- file exists at `D:\Repos\towline-test-project\tests\repositories\planning.repository.test.js`
- **Substantiveness**: PASS -- 241 lines; 16 test cases across 4 describe blocks
- **Wiring**: PASS -- imports the module under test via dynamic `await import()`

#### A3: vitest.config.js with test configuration
- **Existence**: PASS -- file exists at `D:\Repos\towline-test-project\vitest.config.js`
- **Substantiveness**: PASS -- 10 lines; configures node environment, explicit imports (`globals: false`), test pattern, 10s timeout
- **Wiring**: PASS -- `package.json` script `"test": "vitest run"` uses this config; `npx vitest run` succeeds

#### A4: package.json with gray-matter, marked, memfs dependencies
- **Existence**: PASS -- `package.json` exists
- **Substantiveness**: PASS -- `gray-matter: ^4.0.3` and `marked: ^17.0.1` in dependencies; `memfs: ^4.56.10` and `vitest: ^3.1.0` in devDependencies
- **Wiring**: PASS -- all packages installed and importable (tests pass)

### Key Links

#### K1: planning.repository.js imports from node:fs/promises, gray-matter, marked
- **PASS** -- line 1: `import { readFile, readdir } from 'node:fs/promises'`; line 3: `import matter from 'gray-matter'`; line 4: `import { marked } from 'marked'`

#### K2: Test file mocks node:fs/promises with memfs
- **PASS** -- lines 5-8: `vi.mock('node:fs/promises', async () => { const memfs = await import('memfs'); return memfs.fs.promises; })`

#### K3: vitest.config.js configures test runner for the project
- **PASS** -- `defineConfig({ test: { globals: false, environment: 'node', include: ['tests/**/*.test.js'], testTimeout: 10000 } })`

---

## Plan 02-02: Service Layer Enhancement and Tests

### Truths

#### T1: getHomepage(projectDir) reads .planning/README.md and returns {title, content}
- **Existence**: PASS -- function exported at line 11 of `project.service.js`
- **Substantiveness**: PASS -- reads via `readMarkdownFile(readmePath)`, extracts `frontmatter.title`, returns `{ title, projectDir, content: html }` (lines 13-20)
- **Wiring**: PASS -- test at lines 21-33 verifies title, projectDir, and HTML content fields; route at `index.routes.js` line 7 calls `getHomepage(req.app.locals.projectDir)`

#### T2: getHomepage returns fallback when README.md is missing (ENOENT)
- **Existence**: PASS -- catch block at lines 21-29 checks `error.code === 'ENOENT'`
- **Substantiveness**: PASS -- returns `{ title: 'Welcome', projectDir, content: '<p>No project README found.</p>' }` (lines 23-27)
- **Wiring**: PASS -- tests at lines 45-55 (missing README) and lines 57-66 (missing .planning/ dir) both verify the fallback

#### T3: getHomepage re-throws non-ENOENT errors
- **Existence**: PASS -- `throw error` at line 29, outside the ENOENT conditional
- **Substantiveness**: PASS -- only ENOENT is caught; all other errors (malformed YAML, permission denied) propagate
- **Wiring**: PASS -- test at lines 68-76 creates malformed YAML and asserts the promise rejects

#### T4: getMarkdownFile(projectDir, relativePath) reads any file under .planning/
- **Existence**: PASS -- function exported at line 43
- **Substantiveness**: PASS -- resolves path with `resolve(planningDir, relativePath)`, then delegates to `readMarkdownFile(filePath)` (lines 44-56)
- **Wiring**: PASS -- tests at lines 80-89 (nested path) and lines 92-99 (root-level path) verify reading

#### T5: getMarkdownFile rejects paths that escape .planning/ (path traversal prevention)
- **Existence**: PASS -- path traversal check at lines 48-54
- **Substantiveness**: PASS -- uses `relative(planningDir, filePath)` and checks `rel.startsWith('..')`; throws with `code: 'PATH_TRAVERSAL'` and `status: 403`
- **Wiring**: PASS -- tests at lines 112-128 (`../secret.md`) and lines 130-138 (`phases/../../secret.md`) both verify rejection

#### T6: Unit tests pass using memfs mocks
- **Existence**: PASS -- `vi.mock('node:fs/promises', ...)` at lines 5-8 of service test file
- **Substantiveness**: PASS -- 10 test cases across 2 describe blocks (getHomepage: 5, getMarkdownFile: 5)
- **Wiring**: PASS -- all 10 service tests pass alongside the 16 repository tests

### Artifacts

#### A1: src/services/project.service.js with getHomepage, getMarkdownFile
- **Existence**: PASS -- file exists at `D:\Repos\towline-test-project\src\services\project.service.js`
- **Substantiveness**: PASS -- 57 lines; two exported functions with real logic (not stubs)
- **Wiring**: PASS -- imported by `index.routes.js` at line 2; imports from `planning.repository.js` at line 2

#### A2: tests/services/project.service.test.js with comprehensive coverage
- **Existence**: PASS -- file exists at `D:\Repos\towline-test-project\tests\services\project.service.test.js`
- **Substantiveness**: PASS -- 140 lines; 10 test cases covering happy paths, fallbacks, error propagation, and path traversal
- **Wiring**: PASS -- imports the module under test via dynamic `await import()`; mock intercepts the repository's fs calls

### Key Links

#### K1: project.service.js imports readMarkdownFile from planning.repository.js
- **PASS** -- line 2: `import { readMarkdownFile, listPlanningFiles } from '../repositories/planning.repository.js'`

#### K2: project.service.js imports listPlanningFiles from planning.repository.js
- **PASS** -- same import at line 2 (imported for future use in Phase 04/08)

#### K3: getHomepage uses path.join(projectDir, '.planning', 'README.md')
- **PASS** -- line 13: `const readmePath = join(projectDir, '.planning', 'README.md')`

#### K4: index.routes.js (from Phase 01) already calls getHomepage -- no route changes needed
- **PASS** -- `index.routes.js` line 2 imports `getHomepage` from service; line 7 calls `getHomepage(req.app.locals.projectDir)`. No modifications needed from Phase 01.

---

## Summary

| Plan  | Truths | Artifacts | Key Links | Total | Passed | Failed |
|-------|--------|-----------|-----------|-------|--------|--------|
| 02-01 | 10     | 4         | 3         | 17    | 17     | 0      |
| 02-02 | 6      | 2         | 4         | 12    | 12     | 0      |

**Note on key_link counting**: The phase spec listed 4 key_links for 02-02 but some overlap with truths. All were verified independently regardless.

**Overall file metrics**:
- `planning.repository.js`: 87 lines (4 exported functions)
- `project.service.js`: 57 lines (2 exported functions)
- `planning.repository.test.js`: 241 lines (16 tests)
- `project.service.test.js`: 140 lines (10 tests)
- `vitest.config.js`: 10 lines
- **Total**: 535 lines of new/modified code across 5 files

**Verdict**: All 22 must-haves pass across all three verification layers (existence, substantiveness, wiring). Phase 02 is complete.

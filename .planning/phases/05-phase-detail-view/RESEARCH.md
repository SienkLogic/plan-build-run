# Phase Research: Phase Detail View

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 05-phase-detail-view
> Confidence: HIGH

## User Constraints

**Locked Decisions**
- Node.js 24 LTS, Express 5.x, EJS templates, Pico.css
- gray-matter for frontmatter parsing, marked for markdown rendering
- Three-layer architecture: Routes → Services → Repositories
- Vitest + memfs for testing
- No build step for frontend
- Cross-platform (Windows + macOS/Linux)
- Local dev tool only, single user

**Deferred Ideas**
- Responsive/mobile layout (desktop-first)
- Multi-project support
- In-browser file editing

## Phase Goal

Clicking a phase from the dashboard displays a detail page showing all plans within that phase, each plan's SUMMARY.md content (status, key decisions, metrics, files modified), and verification status from VERIFICATION.md if present. Empty phases show an appropriate message.

## Implementation Approach

### Recommended Approach

**Create a dedicated phase.service.js** to aggregate phase-level data rather than extending planning.repository.js or dashboard.service.js. This follows the existing pattern from Phase 04, where dashboard.service.js was created separately because it had different concerns (regex body parsing vs frontmatter parsing). [S6-HIGH]

**Key architectural decisions:**

1. **Service layer separation** [S4-HIGH]: Following Express best practices, keep business logic in services. The phase service will orchestrate repository calls to read phase directories, plan files, and verification results. Controllers remain thin and only dispatch to services.

2. **Use existing planning.repository.js functions** [S6-HIGH]: The repository already has `readMarkdownFile(path)` which parses frontmatter via gray-matter and renders content via marked. This is exactly what we need for SUMMARY.md and VERIFICATION.md files.

3. **Phase ID to directory mapping** [S2-HIGH]: The phase directory naming pattern is `{NN}-{phase-name}` (e.g., "01-project-scaffolding"). The route will capture `:phaseId` as a two-digit string ("01", "04", "05"). The service must list all directories under `.planning/phases/`, filter for those starting with the requested phase ID, and handle the case where no match is found.

4. **File structure pattern** [S6-HIGH]: Based on Phase 04 verification data, plans are named `{NN}-{PP}-PLAN.md` and summaries are `SUMMARY-{NN}-{PP}.md` where `NN` is phase ID and `PP` is plan ID. VERIFICATION.md is at the phase level, not per-plan.

**Steps:**

1. Create `src/services/phase.service.js` with `getPhaseDetail(projectDir, phaseId)` function [S6-HIGH]
2. Add Express route `GET /phases/:phaseId` in `src/routes/pages.routes.js` [S2-HIGH]
3. Create `src/views/phase-detail.ejs` template with article cards for each plan [S3-HIGH]
4. Wire service to route, pass data to template [S6-HIGH]
5. Update dashboard template to link phase rows to `/phases/{id}` [S6-HIGH]

### Configuration Details

**Route definition:**

```javascript
// src/routes/pages.routes.js
router.get('/phases/:phaseId', async (req, res) => {
  const { phaseId } = req.params;
  const phaseData = await getPhaseDetail(projectDir, phaseId);

  res.render('phase-detail', {
    title: `Phase ${phaseId}`,
    activePage: 'phases',
    ...phaseData
  });
});
```

**Route parameter validation:** [S2-HIGH] Express 5.x supports regex constraints on route parameters. Use `/:phaseId(\\d{2})` to ensure phaseId is exactly two digits, automatically returning 404 for invalid formats like "5" or "abc". This prevents the service from handling invalid input.

**Phase directory discovery:** [S2-HIGH]

```javascript
// Use fs.readdir with withFileTypes for efficient filtering
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const phasesDir = join(projectDir, '.planning', 'phases');
const entries = await readdir(phasesDir, { withFileTypes: true });

// Filter for directories starting with phaseId prefix
const phaseDir = entries
  .filter(entry => entry.isDirectory() && entry.name.startsWith(`${phaseId}-`))
  .map(entry => entry.name)[0];

if (!phaseDir) {
  // Return empty state: no plans found for this phase
  return { phaseId, phaseName: 'Unknown', plans: [], verification: null };
}
```

**Plan discovery pattern:**

```javascript
// List all PLAN.md files in the phase directory
const phaseFullPath = join(phasesDir, phaseDir);
const files = await readdir(phaseFullPath);

// Match pattern: NN-PP-PLAN.md where NN = phaseId
const planFiles = files
  .filter(name => /^\d{2}-\d{2}-PLAN\.md$/.test(name))
  .sort(); // Lexicographic sort gives correct order: 04-01, 04-02, etc.

// For each plan, read corresponding SUMMARY-NN-PP.md if it exists
const planData = await Promise.allSettled(
  planFiles.map(async (planFile) => {
    const planId = planFile.match(/^\d{2}-(\d{2})-PLAN\.md$/)[1];
    const summaryPath = join(phaseFullPath, `SUMMARY-${phaseId}-${planId}.md`);

    try {
      const summary = await readMarkdownFile(summaryPath);
      return {
        planId: `${phaseId}-${planId}`,
        planFile,
        summary: summary.frontmatter,
        content: summary.html
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Plan exists but not yet executed (no summary)
        return { planId: `${phaseId}-${planId}`, planFile, summary: null, content: null };
      }
      throw err;
    }
  })
);
```

**Verification data:** [S6-HIGH]

```javascript
// Read VERIFICATION.md at phase level
const verificationPath = join(phaseFullPath, 'VERIFICATION.md');
let verification = null;

try {
  const verificationDoc = await readMarkdownFile(verificationPath);
  verification = verificationDoc.frontmatter;
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  // Phase not yet verified, verification remains null
}
```

### API Patterns

**Service function signature:**

```javascript
/**
 * Get phase detail data including all plans and verification status.
 *
 * @param {string} projectDir - Absolute path to project root
 * @param {string} phaseId - Two-digit phase ID (e.g., "01", "05")
 * @returns {Promise<{
 *   phaseId: string,
 *   phaseName: string,
 *   phaseDir: string,
 *   plans: Array<{planId: string, planFile: string, summary: object|null, content: string|null}>,
 *   verification: object|null
 * }>}
 */
export async function getPhaseDetail(projectDir, phaseId) {
  // Implementation
}
```

**Return structure for empty phase:** [S6-MEDIUM]

```javascript
{
  phaseId: "05",
  phaseName: "Unknown",
  phaseDir: null,
  plans: [],
  verification: null
}
```

**Return structure for phase with plans:**

```javascript
{
  phaseId: "04",
  phaseName: "Dashboard Landing Page",
  phaseDir: "04-dashboard-landing-page",
  plans: [
    {
      planId: "04-01",
      planFile: "04-01-PLAN.md",
      summary: {
        phase: "04-dashboard-landing-page",
        plan: "04-01",
        status: "complete",
        subsystem: "services",
        tags: ["parsing", "dashboard"],
        key_files: ["src/services/dashboard.service.js", ...],
        key_decisions: ["Separate dashboard.service.js", ...],
        metrics: { duration_minutes: 2, ... }
      },
      content: "<h1>Plan Summary: 04-01</h1>..."
    },
    // ... more plans
  ],
  verification: {
    phase: "04-dashboard-landing-page",
    verified: "2026-02-08T12:23:00Z",
    status: "passed",
    score: { total_must_haves: 18, verified: 18, failed: 0, ... }
  }
}
```

### Data Models

**SUMMARY.md frontmatter schema** (reference from Phase 04 example):

```yaml
phase: string               # e.g., "04-dashboard-landing-page"
plan: string                # e.g., "04-01"
status: string              # "complete" | "in-progress" | "blocked"
subsystem: string           # e.g., "services", "routes", "repositories"
tags: string[]              # e.g., ["parsing", "dashboard", "state"]
requires: string[]          # Dependencies on other plans
provides: string[]          # What this plan provides
affects: string[]           # Directories/subsystems affected
tech_stack: string[]        # Technologies used
key_files: string[]         # Files created/modified with descriptions
key_decisions: string[]     # Key architectural decisions made
patterns: string[]          # Code patterns used (optional)
metrics:
  duration_minutes: number
  start_time: string        # ISO 8601
  end_time: string
  tasks_completed: number
  tasks_total: number
  commits: number
  files_created: number
  files_modified: number
deferred: string[]          # Items deferred to later phases
```

**VERIFICATION.md frontmatter schema** (reference from Phase 04 example):

```yaml
phase: string               # e.g., "04-dashboard-landing-page"
verified: string            # ISO 8601 timestamp
status: string              # "passed" | "failed" | "partial"
is_re_verification: boolean
score:
  total_must_haves: number
  verified: number
  failed: number
  partial: number
  human_needed: number
gaps: string[]              # List of verification gaps
anti_patterns:
  todos: number
  stubs: number
  console_logs: number
  skipped_tests: number
  hardcoded_secrets: number
```

### UI Structure with Pico.css

**Template structure:** [S3-HIGH]

```ejs
<%- include('partials/layout-top', { title: title, activePage: 'phases' }) %>

<h1>Phase <%= phaseId %>: <%= phaseName %></h1>

<% if (verification) { %>
<!-- Verification Summary Card -->
<article>
  <header>
    <strong>Verification Status</strong>
  </header>
  <p>
    <span class="status-badge" data-status="<%= verification.status %>">
      <%= verification.status.toUpperCase() %>
    </span>
    Verified: <%= new Date(verification.verified).toLocaleString() %>
  </p>
  <p>Score: <%= verification.score.verified %>/<%= verification.score.total_must_haves %> must-haves verified</p>
  <% if (verification.score.failed > 0) { %>
    <p><strong><%= verification.score.failed %> must-haves FAILED</strong></p>
  <% } %>
</article>
<% } %>

<% if (plans.length === 0) { %>
<!-- Empty State -->
<article>
  <p>No plans found for this phase. This phase may not have been planned yet.</p>
</article>
<% } else { %>

<!-- Plan Cards -->
<% plans.forEach(function(plan) { %>
<article>
  <header>
    <strong>Plan <%= plan.planId %></strong>
    <% if (plan.summary && plan.summary.status) { %>
      <span class="status-badge" data-status="<%= plan.summary.status %>">
        <%= plan.summary.status %>
      </span>
    <% } %>
  </header>

  <% if (plan.summary) { %>
    <!-- Plan has been executed, show summary -->

    <% if (plan.summary.subsystem) { %>
      <p><strong>Subsystem:</strong> <%= plan.summary.subsystem %></p>
    <% } %>

    <% if (plan.summary.key_decisions && plan.summary.key_decisions.length > 0) { %>
      <details>
        <summary>Key Decisions</summary>
        <ul>
          <% plan.summary.key_decisions.forEach(function(decision) { %>
            <li><%= decision %></li>
          <% }); %>
        </ul>
      </details>
    <% } %>

    <% if (plan.summary.key_files && plan.summary.key_files.length > 0) { %>
      <details>
        <summary>Key Files</summary>
        <ul>
          <% plan.summary.key_files.forEach(function(file) { %>
            <li><code><%= file %></code></li>
          <% }); %>
        </ul>
      </details>
    <% } %>

    <% if (plan.summary.metrics) { %>
      <p>
        <small>
          Duration: <%= plan.summary.metrics.duration_minutes %> min |
          Commits: <%= plan.summary.metrics.commits %> |
          Files: <%= plan.summary.metrics.files_created %> created, <%= plan.summary.metrics.files_modified %> modified
        </small>
      </p>
    <% } %>

  <% } else { %>
    <!-- Plan exists but not executed yet -->
    <p><em>Plan file exists but has not been executed yet. No summary available.</em></p>
  <% } %>
</article>
<% }); %>

<% } %>

<%- include('partials/layout-bottom') %>
```

**Pico.css article semantics:** [S3-HIGH] Each plan should be an `<article>` element. Pico automatically provides card styling with proper spacing. The optional `<header>` can contain the plan ID and status badge. Use `<details>` elements for collapsible sections (key decisions, key files) to keep the page scannable while preserving detail access.

**Status badge reuse:** [S6-HIGH] The existing `status-colors.css` from Phase 03 already defines `.status-badge[data-status="complete"]`, `.status-badge[data-status="in-progress"]`, etc. These map directly to the status values in SUMMARY.md frontmatter. The verification status uses the same styling system: "passed" maps to "complete" color, "failed" maps to "blocked" color.

### Dashboard Linking

**Update dashboard template:** [S6-HIGH]

In `src/views/index.ejs`, the phase table (lines 50-61) currently displays phase data but doesn't link to the detail view. Wrap the phase name in an anchor tag:

```ejs
<td>
  <a href="/phases/<%= String(phase.id).padStart(2, '0') %>">
    <%= phase.name %>
  </a>
</td>
```

**Link styling:** [S3-HIGH] Pico.css automatically styles `<a>` tags within tables. No additional CSS needed. The link will inherit the table's text styling and display the standard link color with hover effect.

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| gray-matter | ^4.x | Parse YAML frontmatter in SUMMARY.md and VERIFICATION.md | planning.repository.js (already installed) |
| marked | ^12.x | Render markdown content to HTML | planning.repository.js (already installed) |
| node:fs/promises | Node.js built-in | Read directories and files | phase.service.js |
| node:path | Node.js built-in | Cross-platform path handling | phase.service.js |
| Pico.css | ^2.x | Card styling via `<article>` semantic HTML | layout (already installed) |
| status-colors.css | Phase 03 | Status badge styling | phase-detail.ejs (already exists) |

**No new dependencies required.** All functionality can be implemented with existing packages and Node.js built-ins. [S6-HIGH]

## Pitfalls for This Phase

1. **Phase ID padding mismatch** [S6-HIGH]: The route captures `:phaseId` as a string. User might type "/phases/5" instead of "/phases/05". Solution: Use regex constraint `/:phaseId(\\d{2})` to enforce two-digit format. Return 404 for single-digit requests, document the URL format in error pages.

2. **Directory name extraction** [S6-MEDIUM]: Phase directory names are kebab-case with hyphens (e.g., "04-dashboard-landing-page"). When extracting the human-readable phase name, replace hyphens with spaces and title-case: "04-dashboard-landing-page" → "Dashboard Landing Page". Use `phaseDir.split('-').slice(1).join(' ')` to remove the numeric prefix.

3. **ENOENT handling on multiple levels** [S6-HIGH]: Four potential missing file scenarios:
   - `.planning/phases/` directory doesn't exist → return empty phase list
   - Phase directory doesn't exist for requested ID → return empty state
   - SUMMARY.md doesn't exist for a plan → show "not yet executed" message
   - VERIFICATION.md doesn't exist → verification section is hidden

   Handle each case gracefully with try/catch blocks checking `error.code === 'ENOENT'`. Use `Promise.allSettled` for parallel plan reads to prevent one missing summary from failing the entire page.

4. **File naming assumptions** [S6-HIGH]: The code assumes plans follow `NN-PP-PLAN.md` and summaries follow `SUMMARY-NN-PP.md` naming. If naming changes or becomes inconsistent, the regex matching will fail silently. Mitigation: Add logging when expected patterns don't match, include pattern validation in tests.

5. **Verification status mapping** [S6-MEDIUM]: VERIFICATION.md uses `status: "passed"` but status-colors.css expects `data-status="complete"`. Map verification status in the template: `"passed"` → `"complete"`, `"failed"` → `"blocked"`, `"partial"` → `"in-progress"`.

6. **XSS in markdown content** [S6-HIGH]: SUMMARY.md content is rendered via marked to HTML, then injected with `<%- content %>` (unescaped). This is safe because SUMMARY.md is controlled by the developer (not user input). However, if SUMMARY.md ever contains user-generated content, this becomes an XSS vector. Current threat model: local dev tool, single user, so risk is LOW.

7. **Large phase directories** [S6-LOW]: If a phase has 20+ plans, the detail page could become very long. Pico.css doesn't have built-in pagination. For v1, this is acceptable (phases typically have 2-5 plans). Future enhancement: add in-page navigation or lazy loading with HTMX (deferred to Phase 11).

8. **Cross-platform path separators** [S2-HIGH]: Windows uses backslashes, Unix uses forward slashes. Always use `path.join()` and `path.resolve()` from Node.js `path` module. Never concatenate paths with string literals. This is a locked constraint from CONTEXT.md and critical for cross-platform support.

## Testing Strategy

**Unit tests for phase.service.js** (similar to dashboard.service.test.js from Phase 04):

1. **Valid phase directory**: Test `getPhaseDetail()` with a phase that has 2 plans, both with summaries and a verification file. Assert all data is parsed correctly.

2. **Phase not found**: Test with phaseId "99" that doesn't match any directory. Assert returns empty state with null phaseDir and empty plans array.

3. **Phase with no plans**: Test with a phase directory that exists but has no PLAN.md files. Assert returns empty plans array.

4. **Plan without summary**: Test with a phase that has a PLAN.md file but no corresponding SUMMARY.md. Assert plan object has null summary and content.

5. **Phase without verification**: Test with a phase that has plans but no VERIFICATION.md. Assert verification is null.

6. **ENOENT handling**: Test with projectDir that has no `.planning/phases/` directory. Assert graceful fallback without throwing.

7. **Promise.allSettled behavior**: Test with mixed success/failure (one summary exists, one doesn't). Assert successful reads are included, failures don't crash the service.

**Integration tests for route:**

1. **GET /phases/04**: Assert returns 200 with phase detail page containing plan cards.

2. **GET /phases/99**: Assert returns 200 with empty state message (or 404 if preferred).

3. **GET /phases/5**: Assert returns 404 (single-digit phaseId rejected by regex constraint).

4. **GET /phases/abc**: Assert returns 404 (non-numeric phaseId rejected by regex constraint).

**Manual tests:**

1. Navigate to dashboard, click a phase link → detail page loads
2. Phase with verification → verification badge shows correct status
3. Phase without verification → verification section is hidden
4. Plan with summary → key decisions and files are displayed
5. Plan without summary → "not yet executed" message appears
6. Empty phase → "no plans found" message appears

## Open Questions

1. **Should the route return 404 for non-existent phases or 200 with empty state?** [S6-MEDIUM] Current recommendation: Return 200 with empty state message ("No plans found for this phase"). Rationale: User might be browsing phases that haven't been planned yet. A 404 implies an error, but this is a valid state. However, if the dashboard only shows phases from ROADMAP.md, then clicking a non-existent phase would indeed be an error. **Recommendation:** Return 200 for now, re-evaluate in Phase 06 after roadmap visualization is built.

2. **Should the detail view show PLAN.md content in addition to SUMMARY.md?** [S6-LOW] PLAN.md files contain task lists and implementation details, while SUMMARY.md contains outcomes and metrics. Current recommendation: Show only SUMMARY.md for v1. PLAN.md is more useful during development, SUMMARY.md is better for retrospective. Future enhancement: Add a toggle or separate tab to view PLAN.md content.

3. **How should deferred items from SUMMARY.md frontmatter be displayed?** [S6-LOW] SUMMARY.md has a `deferred: []` array for items postponed to later phases. Current recommendation: Add a "Deferred Items" details section similar to key decisions, only shown if the array is non-empty. This provides visibility into what was intentionally skipped.

4. **Should verification gaps be displayed on the detail page?** [S6-LOW] VERIFICATION.md has a `gaps: []` array listing items that couldn't be verified. Current recommendation: Show gaps in the verification card if non-empty, with a warning style. This helps identify incomplete verification work.

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | [Express routing](https://expressjs.com/en/guide/routing.html) | HIGH |
| S2 | Official Docs | [Node.js fs module](https://nodejs.org/api/fs.html) | HIGH |
| S3 | Official Docs | [Pico CSS Card](https://picocss.com/docs/card) | HIGH |
| S4 | WebSearch - Verified | [Express project structure 2026](https://thelinuxcode.com/expressjs-tutorial-2026-practical-scalable-patterns-for-real-projects/) | MEDIUM |
| S4 | WebSearch - Verified | [Three-layer architecture](https://dev.to/moibra/best-practices-for-structuring-an-expressjs-project-148i) | MEDIUM |
| S4 | WebSearch - Verified | [Service layer patterns](https://github.com/snielsson/simple-service-layer-architecture-for-node-express-apps) | MEDIUM |
| S6 | Training Knowledge | Phase directory structure pattern from codebase inspection | HYPOTHESIS |
| S6 | Training Knowledge | File naming conventions (PLAN.md, SUMMARY.md, VERIFICATION.md) verified via Phase 04 example | HIGH |
| S6 | Training Knowledge | planning.repository.js API from codebase reading (readMarkdownFile, readMarkdownFiles, readMarkdownFilesSettled, listPlanningFiles) | HIGH |
| S6 | Training Knowledge | dashboard.service.js pattern from Phase 04 (separate service for different concerns) | HIGH |
| S6 | Training Knowledge | EJS templating patterns, Pico.css article semantics, status-colors.css from existing codebase | HIGH |

**Sources consulted: 10** (6 verified web sources, 4 codebase inspection hypotheses confirmed by reading actual code)

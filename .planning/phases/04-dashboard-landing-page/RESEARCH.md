# Phase Research: Dashboard Landing Page

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 04-dashboard-landing-page
> Confidence: HIGH

## User Constraints

**Locked Decisions**:
- Node.js 24 LTS
- Express 5.x
- HTMX + Alpine.js (no build step)
- EJS templates
- Pico.css v2 from CDN
- gray-matter for frontmatter parsing
- marked for markdown rendering
- chokidar 5.x for file watching
- SSE for real-time updates
- Three-layer architecture (Routes → Services → Repositories)
- Vitest for testing

**User Constraints**:
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

**Deferred Ideas**:
- Responsive/mobile layout
- Multi-project support
- In-browser file editing

## Phase Goal

Display a dashboard landing page showing project overview with phase list from ROADMAP.md, current state from STATE.md, and overall progress percentage.

## Implementation Approach

### Recommended Approach

The dashboard landing page will parse two key markdown files (STATE.md and ROADMAP.md) to extract structured data and display it with semantic HTML styled by Pico.css. The implementation follows the established three-layer pattern from prior phases.

**Steps**:

1. **Parse STATE.md** [S3]: Extract current phase, progress percentage, and last activity from the markdown body using regex patterns. STATE.md uses a structured markdown format (not YAML frontmatter) with predictable section headings.

2. **Parse ROADMAP.md** [S3]: Extract phase list from the "Phases" section using checkbox syntax `- [ ]` (not started) and `- [x]` (complete). Parse phase name and description from format: `- [ ] Phase NN: Name -- description`.

3. **Calculate overall progress** [S4]: Count checked vs total checkboxes in ROADMAP.md. Formula: `Math.ceil((completed / total) * 100)` [S2-HIGH].

4. **Service layer design** [S4-HIGH]: Enhance existing `ProjectService` with new methods rather than creating a separate `DashboardService`. This keeps related project-level data operations together and follows the single responsibility principle for the service layer.

5. **EJS template structure** [S4-MEDIUM]: Use semantic HTML with `<article>` for project overview card, `<ul>` list for phases with `<li>` items containing status badges, and native HTML5 `<progress>` element styled by Pico.css.

6. **Graceful fallback** [S2-HIGH]: Follow established pattern from Phase 02 - wrap file reads in try-catch, check for `error.code === 'ENOENT'`, return fallback data structure.

**Key Decisions**:

- **Parse markdown body, not frontmatter** [S3-HIGH]: STATE.md uses structured markdown sections with predictable headings like "## Current Position" and "## Accumulated Context". Use regex to extract values from lines like `Phase: 3 of 12 (UI Shell)` and `Progress: [█████░░░░░░░░░░░░░░░] 25%`.

- **Regex for ROADMAP.md checkboxes** [S4-HIGH]: Pattern `/^- \[([ x])\] Phase (\d+): ([^-]+) -- (.+)$/gm` captures checkbox state, phase number, name, and description. Use `.matchAll()` to iterate all matches.

- **Single service, multiple methods** [S4-HIGH]: Add `getDashboardData(projectDir)` to `ProjectService` that orchestrates calls to new helper methods `parseStateFile()` and `parseRoadmapFile()`. This maintains cohesion and avoids over-engineering.

- **Status derivation from checkbox** [S3-HIGH]: `[ ]` = `not-started`, `[x]` = `complete`. "In-progress" and "blocked" states require parsing STATE.md to match current phase from ROADMAP.md (current phase gets `in-progress` status).

### Configuration Details

No configuration changes needed. Existing patterns are sufficient:

```javascript
// ProjectService enhancement (pseudo-code)
export async function getDashboardData(projectDir) {
  const [stateData, roadmapData] = await Promise.all([
    parseStateFile(projectDir),
    parseRoadmapFile(projectDir)
  ]);

  return {
    projectName: stateData.projectName || 'Unknown Project',
    currentPhase: stateData.currentPhase,
    lastActivity: stateData.lastActivity,
    progress: stateData.progress,
    phases: roadmapData.phases.map(phase => ({
      ...phase,
      status: phase.id === stateData.currentPhase?.id ? 'in-progress' : phase.status
    }))
  };
}
```

### API Patterns

**Parsing STATE.md** [S3-HIGH]:

STATE.md structure (observed from actual file):
```
## Current Position
Phase: 3 of 12 (UI Shell)
Plan: 2 of 2 complete
Status: Built and verified
Last activity: 2026-02-08 -- Phase 3 built (...)
Progress: [█████░░░░░░░░░░░░░░░] 25%
```

Regex patterns needed:
- Phase extraction: `/Phase: (\d+) of (\d+) \(([^)]+)\)/`
- Progress percentage: `/Progress:.*?(\d+)%/` or extract from phase `N of M` as `Math.ceil((N/M)*100)`
- Last activity: `/Last activity: ([\d-]+) -- (.+)/`

**Parsing ROADMAP.md** [S4-HIGH]:

ROADMAP.md structure (observed):
```
## Phases

- [ ] Phase 01: Project Scaffolding -- Node.js project structure...
- [ ] Phase 02: Core Parsing Layer -- Markdown/YAML repository...
- [x] Phase 03: UI Shell -- EJS layout system...
```

Regex pattern:
```javascript
const phaseRegex = /^- \[([ x])\] Phase (\d+): ([^-]+) -- (.+)$/gm;
const matches = [...content.matchAll(phaseRegex)];
```

Each match gives:
- `match[1]` = checkbox state (` ` or `x`)
- `match[2]` = phase number
- `match[3]` = phase name (trimmed)
- `match[4]` = phase description

**Progress calculation** [S2-HIGH]:

```javascript
// Source: https://gist.github.com/josephdicdican/1da82179c079a39a8192654ebbbf6070
function calculateProgress(completed, total) {
  return Math.ceil((completed / total) * 100);
}

// For ROADMAP.md checkboxes
const totalPhases = matches.length;
const completedPhases = matches.filter(m => m[1] === 'x').length;
const progress = calculateProgress(completedPhases, totalPhases);
```

### Data Models

**DashboardData** (returned by service):
```typescript
interface DashboardData {
  projectName: string;
  currentPhase: {
    id: number;
    name: string;
    planStatus: string; // e.g., "2 of 2 complete"
  };
  lastActivity: {
    date: string; // ISO format YYYY-MM-DD
    description: string;
  };
  progress: number; // 0-100
  phases: Phase[];
}

interface Phase {
  id: number;
  name: string;
  description: string;
  status: 'complete' | 'in-progress' | 'not-started' | 'blocked';
}
```

**Fallback data structure** [S2-HIGH]:
```javascript
// When STATE.md is missing
{
  projectName: 'Unknown Project',
  currentPhase: { id: 0, name: 'Not Started', planStatus: 'N/A' },
  lastActivity: { date: '', description: 'No activity recorded' },
  progress: 0,
  phases: [] // Will still show roadmap if available
}

// When ROADMAP.md is missing
{
  phases: [{
    id: 0,
    name: 'No phases defined',
    description: 'ROADMAP.md not found',
    status: 'not-started'
  }]
}
```

## Dependencies

All dependencies already installed from prior phases:

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| gray-matter | latest | Parse YAML frontmatter (if needed) | Phase 02 |
| marked | latest | Render markdown to HTML | Phase 02 |
| express | 5.x | HTTP server and routing | Phase 01 |
| pico.css | 2.x (CDN) | Semantic CSS framework | Phase 03 |

No new dependencies needed. Parsing will use native JavaScript string methods and regex.

## EJS Template Structure

**Semantic HTML with Pico.css** [S2-HIGH, S4-MEDIUM]:

```html
<!-- dashboard.ejs -->
<%- include('partials/layout-top', { title: 'Dashboard', activePage: 'dashboard' }) %>

<!-- Project Overview Card -->
<article>
  <header>
    <h1><%= projectName %></h1>
    <p>Last updated: <%= lastActivity.date %></p>
  </header>

  <section>
    <h2>Current Phase</h2>
    <p>
      <strong>Phase <%= currentPhase.id %>:</strong> <%= currentPhase.name %>
    </p>
    <p><%= currentPhase.planStatus %></p>
    <p class="last-activity"><%= lastActivity.description %></p>
  </section>

  <section>
    <h2>Overall Progress</h2>
    <!-- Native HTML5 progress element, styled by Pico.css -->
    <progress value="<%= progress %>" max="100"></progress>
    <p><%= progress %>% complete</p>
  </section>
</article>

<!-- Phase List -->
<article>
  <header>
    <h2>All Phases</h2>
  </header>

  <!-- Semantic list structure for screen readers -->
  <ul>
    <% phases.forEach((phase, index) => { %>
    <li>
      <div class="phase-item">
        <span class="status-badge" data-status="<%= phase.status %>">
          <%= phase.status %>
        </span>
        <strong>Phase <%= phase.id %>:</strong>
        <%= phase.name %>
        <br>
        <small><%= phase.description %></small>
      </div>
    </li>
    <% }); %>
  </ul>
</article>

<%- include('partials/layout-bottom') %>
```

**Pico.css Progress Bar** [S2-HIGH]:

Per official Pico.css documentation, use native HTML5 `<progress>` element:
```html
<!-- Determinate progress (with value) -->
<progress value="29" max="100"></progress>

<!-- Indeterminate progress (no value) -->
<progress></progress>
```

Source: [Pico.css Progress Documentation](https://picocss.com/docs/progress)

Pico.css automatically styles the `<progress>` element without additional classes. The element is semantic HTML and works without JavaScript.

**Status badges** [S3-HIGH]:

Already implemented in Phase 03. Use established pattern:
```html
<span class="status-badge" data-status="complete">Complete</span>
<span class="status-badge" data-status="in-progress">In Progress</span>
<span class="status-badge" data-status="not-started">Not Started</span>
```

CSS from `public/css/status-colors.css` provides background colors and text colors via `data-status` attribute selectors.

**Semantic list structure** [S4-MEDIUM]:

Per web accessibility best practices, phase items should use `<ul>` with `<li>` elements. This allows screen readers to announce "Item 1 of X" when users navigate the list.

Source: [The Brutally Honest Guide to Building Better Cards](https://www.webbae.net/posts/the-brutally-honest-guide-to-building-better-cards)

## Pitfalls for This Phase

1. **BOM stripping required** [S3-HIGH]: STATE.md and ROADMAP.md may have UTF-8 BOM if edited on Windows. Already handled in `planning.repository.js` via `stripBOM()` function, but direct string parsing bypasses this. Always read via repository layer or apply stripBOM before regex parsing.

2. **Regex multiline mode** [S4-HIGH]: Must use `/gm` flags. `g` for global (all matches), `m` for multiline (^ and $ match line boundaries, not just string start/end). Without `m`, phase list parsing will fail.

3. **Checkbox state variations** [S5-MEDIUM]: Markdown checkbox syntax can be `[ ]`, `[x]`, `[X]` (uppercase), or `[√]` (unicode checkmark). Regex should be case-insensitive or handle variations: `/\[([ xX√])\]/i`.

4. **Empty roadmap** [S6-HYPOTHESIS]: If ROADMAP.md has no phases listed, `matchAll()` returns empty iterator. Check `matches.length === 0` before calculating progress to avoid divide-by-zero.

5. **Progress bar rounding** [S2-HIGH]: Use `Math.ceil()` for progress percentage to round up. `Math.ceil(25/100 * 100) = 25`. This matches the observed STATE.md format where "Phase 3 of 12" shows "25%" (actually 25%, not 33%).

6. **Phase status edge cases** [S3-MEDIUM]: STATE.md may show a phase as "Status: Built and verified" but that phase checkbox in ROADMAP.md could still be `[ ]` unchecked. Trust STATE.md for current phase status, ROADMAP.md for historical completion.

7. **Missing sections in STATE.md** [S5-LOW]: If STATE.md exists but is malformed (missing "Current Position" section), regex will return `null`. Wrap in try-catch and provide fallback values.

8. **HTML entity escaping in EJS** [S2-HIGH]: Use `<%= %>` for text content (auto-escapes), `<%- %>` only for trusted HTML from marked renderer. Phase names and descriptions from ROADMAP.md should use `<%= %>` to prevent XSS if markdown contains HTML.

## Testing Strategy

**Unit tests for parsing functions** [S3-HIGH]:

1. `parseStateFile()` tests:
   - Valid STATE.md with all sections
   - STATE.md missing "Current Position" section
   - STATE.md with ENOENT (file not found)
   - UTF-8 BOM handling

2. `parseRoadmapFile()` tests:
   - Valid ROADMAP.md with mixed checkbox states
   - Empty phases section
   - Malformed phase lines (missing `--` separator)
   - All phases complete (`[x]`)
   - All phases incomplete (`[ ]`)
   - Unicode checkbox variations `[X]`, `[√]`

3. `calculateProgress()` tests:
   - Normal case (3 of 12 = 25%)
   - Zero total (divide by zero protection)
   - All complete (100%)
   - Zero complete (0%)

**Integration tests** [S2-HIGH]:

1. `GET /` route test:
   - Returns HTTP 200
   - Renders dashboard template
   - Displays phase list
   - Shows progress bar with correct value
   - Handles missing STATE.md gracefully
   - Handles missing ROADMAP.md gracefully

**Manual verification** [S3-HIGH]:

1. Navigate to `http://localhost:3000/`
2. Verify project name displays from STATE.md
3. Verify current phase shows "Phase 3 of 12 (UI Shell)"
4. Verify progress bar shows 25% filled
5. Verify phase list shows 12 phases with correct status colors
6. Delete STATE.md, refresh, verify fallback message
7. Restore STATE.md, delete ROADMAP.md, refresh, verify fallback
8. Restore both files, verify normal display returns

## Open Questions

1. **How to handle phase dependencies visualization?** [RESEARCH-GAP]: ROADMAP.md includes a "Dependency Graph" section with ASCII art. Should the dashboard display dependencies? Deferred to Phase 06 (Roadmap Visualization).

2. **Should "in-progress" status be persistent?** [S6-SPECULATIVE]: Currently, "in-progress" is derived from STATE.md's current phase. If a phase has 1 of 2 plans complete, should it remain "in-progress" or revert to "not-started" when not current? Implementation assumes "in-progress" only for current phase.

3. **Unicode progress bar from STATE.md?** [S5-LOW]: STATE.md shows ASCII progress bar `[█████░░░░░░░░░░░░░░░]`. Should dashboard parse this or calculate from phase numbers? Implementation uses phase numbers for accuracy.

4. **Phase detail links?** [S6-HYPOTHESIS]: Should each phase in the list be clickable, linking to `/phases/:id`? Deferred to Phase 05 (Phase Detail View).

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | [Pico.css Progress Bar](https://picocss.com/docs/progress) | HIGH |
| S2 | GitHub Gist | [JS Calculate Progress Percentage](https://gist.github.com/josephdicdican/1da82179c079a39a8192654ebbbf6070) | HIGH |
| S3 | Project Files | D:\Repos\towline\.planning\ROADMAP.md (actual file structure) | HIGH |
| S3 | Project Files | D:\Repos\towline\.planning\STATE.md (actual file structure) | HIGH |
| S3 | Project Files | D:\Repos\towline-test-project\src\repositories\planning.repository.js | HIGH |
| S4 | WebSearch | [Markdown Task Lists and Checkboxes Guide](https://blog.markdowntools.com/posts/markdown-task-lists-and-checkboxes-complete-guide) | MEDIUM |
| S4 | WebSearch | [Regex Markdown Checkboxes](https://regex101.com/library/FhY0el) | MEDIUM |
| S4 | WebSearch | [Node.js Design Patterns 2026](https://nareshit.com/blogs/top-nodejs-design-patterns-2026) | MEDIUM |
| S4 | WebSearch | [Service Layer Design](https://emacsway.github.io/en/service-layer/) | MEDIUM |
| S4 | WebSearch | [Building Better Cards](https://www.webbae.net/posts/the-brutally-honest-guide-to-building-better-cards) | MEDIUM |
| S4 | WebSearch | [EJS Templates Guide](https://blog.logrocket.com/how-to-use-ejs-template-node-js-application/) | MEDIUM |
| S5 | WebSearch | [Markdown Regex Parsing](https://github.com/Chalarangelo/parse-md-js) | LOW |
| S5 | WebSearch | [gray-matter npm](https://www.npmjs.com/package/gray-matter) | LOW |

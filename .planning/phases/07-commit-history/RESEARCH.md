# Phase Research: Commit History

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 07-commit-history
> Confidence: HIGH

## User Constraints

**From CONTEXT.md:**
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

**Locked Decisions:**
- Node.js 24 LTS
- Express 5.x
- HTMX + Alpine.js (no build step, server-rendered)
- EJS templates
- Pico.css (semantic styling, minimal footprint)
- gray-matter (frontmatter parser)
- marked (markdown renderer)
- Three-layer architecture (Routes → Services → Repositories)

## Phase Goal

Display commit history on the phase detail page, parsed from SUMMARY.md files. Each commit entry shows description, files modified, and timestamp. Phases with no commits show an appropriate empty state.

## Implementation Approach

### Recommended Approach

**Use existing SUMMARY.md data without git calls** [S6-HIGH]. The SUMMARY.md body already contains a "Task Results" table with commit hashes. This avoids external git dependencies and follows Towline's "all data comes from .planning/" principle.

**Steps**:

1. **Parse SUMMARY.md body content** [S6-HIGH]: The existing `getPhaseDetail` function reads SUMMARY.md via `readMarkdownFile`, which returns both frontmatter and the markdown body content. The body includes a "Task Results" table with commit hashes.

2. **Extract commit data from markdown tables** [S6-MEDIUM]: Parse the "Task Results" section from the SUMMARY body. Each row contains: Task ID, Status, Commit hash, Files count, Verify status.

3. **Optionally enrich with git log data** [S4-MEDIUM]: If git is available, run `git log --format="%H|%s|%an|%ad" {hash}^!` for each commit hash to get full message, author, and date. Fall back gracefully if git is unavailable.

4. **Add commit history section to phase-detail.ejs** [S6-HIGH]: Display commits in a table or timeline format using Pico.css semantic elements. Group commits by plan if multiple plans exist in the phase.

5. **Handle empty state** [S6-HIGH]: When a phase has no SUMMARY files or plans with zero commits, show "No commits yet" message.

**Key decisions**:
- **Data source priority**: SUMMARY.md body table (always available) > git log enrichment (optional) [S6-HIGH]
- **No external dependencies**: Works without git installed, making it truly portable [S6-HIGH]
- **Service layer**: Extend `getPhaseDetail` to include parsed commit data OR create new `getPhaseCommits` function [S6-MEDIUM]
- **Display location**: Add section to existing phase-detail.ejs below the verification card [S6-HIGH]

### Data Available in SUMMARY.md

**Frontmatter metrics** [S6-HIGH]:
```yaml
metrics:
  commits: 2              # Count only
  files_created: 1
  files_modified: 3
```

**Body content Task Results table** [S6-HIGH]:
```markdown
| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 05-02-T1: Create phase-detail.ejs | done | e008221 | 2 | passed |
| 05-02-T2: Wire route handler | done | f0b5a51 | 3 | passed |
```

This provides:
- ✅ Commit hash (abbreviated, 7 chars)
- ✅ Task description (can be used as commit message fallback)
- ✅ Files affected count
- ✅ Verification status
- ❌ Author name (not in SUMMARY)
- ❌ Commit date (not in SUMMARY)
- ❌ Full commit message (not in SUMMARY)

### Git Enrichment (Optional Enhancement)

If git is available, enrich commit data with additional metadata.

**Command** [S2-HIGH]:
```bash
git log --format="%H|%s|%an|%ad" {hash}^!
```

**Format placeholders** [S2-HIGH]:
- `%H` - Full commit hash (40 chars)
- `%h` - Abbreviated hash (7 chars)
- `%s` - Commit subject (first line of message)
- `%an` - Author name
- `%ad` - Author date (respects --date format)
- `%b` - Commit body

**Error handling** [S4-MEDIUM]:
1. Check if git is available: `child_process.exec('git --version')`
2. If git fails or is missing, skip enrichment and use SUMMARY data only
3. Run git commands with a timeout (2 seconds per commit)
4. Use `util.promisify` for promise-based exec handling [S4-MEDIUM]

**Example Node.js implementation** [S4-MEDIUM]:
```javascript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function enrichCommitWithGit(hash) {
  try {
    const { stdout } = await execAsync(
      `git log --format="%H|%s|%an|%ad" --date=iso ${hash}^!`,
      { timeout: 2000 }
    );
    const [fullHash, subject, author, date] = stdout.trim().split('|');
    return { fullHash, subject, author, date };
  } catch (error) {
    // Git not available or hash not found - return null
    return null;
  }
}
```

Sources: [Git pretty formats documentation](https://git-scm.com/docs/pretty-formats) [S2], [Node.js child_process patterns](https://www.tabnine.com/code/javascript/functions/child_process/exec) [S4]

### Markdown Table Parsing

Parse the "Task Results" table from SUMMARY.md body content.

**Approach 1: Regex-based extraction** [S6-MEDIUM]:
```javascript
function parseTaskResultsTable(markdownBody) {
  // Find table after "## Task Results" heading
  const tableRegex = /## Task Results\s+\|.*?\|[\s\S]*?\n\n/;
  const match = markdownBody.match(tableRegex);
  if (!match) return [];

  // Parse table rows (skip header and separator)
  const rows = match[0].split('\n').slice(2).filter(line => line.includes('|'));
  return rows.map(row => {
    const cols = row.split('|').map(c => c.trim()).filter(c => c);
    return {
      task: cols[0],
      status: cols[1],
      commit: cols[2],
      files: parseInt(cols[3], 10),
      verify: cols[4]
    };
  });
}
```

**Approach 2: Use marked renderer** [S6-LOW]:
The `marked` library already parses markdown into HTML. Could extract table data from the parsed HTML using a custom renderer or post-processing. This is more robust but adds complexity.

**Recommendation**: Use Approach 1 (regex) [S6-MEDIUM]. It's simpler, doesn't require additional parsing, and the table format is standardized by towline-executor.

### UI Design Options

**Option 1: Simple table (recommended)** [S6-HIGH]:
```html
<h2>Commit History (<%= totalCommits %>)</h2>
<% if (commits.length > 0) { %>
  <table>
    <thead>
      <tr>
        <th>Commit</th>
        <th>Description</th>
        <th>Files</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <% commits.forEach(commit => { %>
        <tr>
          <td><code><%= commit.hash %></code></td>
          <td><%= commit.description %></td>
          <td><%= commit.files %></td>
          <td><span class="status-badge" data-status="<%= commit.verifyStatus %>">
            <%= commit.verifyStatus %>
          </span></td>
        </tr>
      <% }); %>
    </tbody>
  </table>
<% } else { %>
  <p><em>No commits yet for this phase.</em></p>
<% } %>
```

**Pros**:
- Uses existing Pico.css table styling [S2-HIGH]
- Consistent with dashboard phase table
- Simple, no custom CSS needed
- Works well for 2-10 commits per phase

**Cons**:
- Less visual for timeline/history narrative
- No chronological visual flow

**Option 2: Vertical timeline with details elements** [S5-LOW]:
```html
<details open>
  <summary>Commit History (<%= totalCommits %>)</summary>
  <ul>
    <% commits.forEach(commit => { %>
      <li>
        <strong><code><%= commit.hash %></code></strong>
        <%= commit.description %>
        <br><small><%= commit.date %> | <%= commit.files %> files</small>
      </li>
    <% }); %>
  </ul>
</details>
```

**Pros**:
- Collapsible to save space [S6-MEDIUM]
- Visual hierarchy with details/summary [S2-HIGH]
- Chronological flow (list format)

**Cons**:
- Requires custom CSS for timeline connectors [S5-LOW]
- More complex than table
- Not semantic for tabular data

Sources: [CSS timeline patterns](https://www.w3schools.com/howto/howto_css_timeline.asp) [S5], [Pico CSS semantic elements](https://picocss.com/) [S2]

**Recommendation**: Use Option 1 (table) [S6-HIGH]. It aligns with existing UI patterns, requires zero custom CSS, and displays the data clearly. Timeline UIs are better suited for storytelling; commit history here is reference data.

### Service Layer Design

**Option A: Extend getPhaseDetail** [S6-MEDIUM]:
```javascript
export async function getPhaseDetail(projectDir, phaseId) {
  // ... existing code ...

  const plans = summaryPaths.map(({ planId, planFile }, index) => {
    const result = summaryResults[index];
    if (result.status === 'fulfilled') {
      const commits = parseTaskResultsTable(result.value.rawContent);
      return {
        planId,
        planFile,
        summary: result.value.frontmatter,
        content: result.value.html,
        commits  // NEW: parsed commit data
      };
    }
    // ... error handling ...
  });

  return { phaseId, phaseName, phaseDir, plans, verification };
}
```

**Pros**:
- Single service function for all phase detail data
- No additional service calls needed
- Commits are always available with plan data

**Cons**:
- Increases function complexity
- Always parses commits even if UI doesn't need them

**Option B: New getPhaseCommits function** [S6-LOW]:
```javascript
export async function getPhaseCommits(projectDir, phaseId) {
  // Read all SUMMARY files for the phase
  // Parse Task Results tables
  // Optionally enrich with git log
  // Return flat list of commits
}
```

**Pros**:
- Separation of concerns
- Can be called independently
- Easier to add git enrichment later

**Cons**:
- Duplicates file reading logic
- Requires additional route call or parallel fetching

**Recommendation**: Use Option A [S6-MEDIUM]. Phase detail view needs this data, and parsing markdown tables is lightweight. Keep it in one service call to minimize round-trips.

### Git Availability Detection

**Check git once at app startup** [S6-MEDIUM]:
```javascript
// In app.js or a config module
let gitAvailable = false;

async function checkGitAvailability() {
  try {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);
    await execAsync('git --version', { timeout: 1000 });
    gitAvailable = true;
  } catch {
    gitAvailable = false;
  }
}

// Call on startup
await checkGitAvailability();
```

**Benefits**:
- Avoids checking git availability on every request [S6-HIGH]
- Graceful degradation if git missing [S6-HIGH]
- Works in Docker, sandboxed environments, or on systems without git

**Alternative**: Check per-request [S6-LOW]. This is safer if git availability changes during runtime (unlikely for local dev tool) but adds overhead.

**Recommendation**: Check once at startup [S6-MEDIUM]. Cache result in module scope. For a local dev tool, git availability won't change during app lifetime.

## Pitfalls for This Phase

1. **Assuming git is always available** [S6-HIGH]: The dashboard is a read-only view tool. Users might view .planning/ output on a machine without git. Always fall back to SUMMARY.md data.

2. **Parsing full SUMMARY body for every request** [S6-MEDIUM]: The getPhaseDetail function already returns `rawContent` from readMarkdownFile. Parse the Task Results table from that instead of re-reading files.

3. **Not handling missing Task Results tables** [S6-HIGH]: Early phases or manually created SUMMARYs might not have the table. Check for table existence before parsing.

4. **Git command timeout** [S4-MEDIUM]: Git operations can hang on corrupted repos or network file systems. Always use a timeout (1-2 seconds) on exec calls.

5. **XSS from commit messages** [S6-HIGH]: If enriching with git log, commit messages are user-controlled strings. Always use `<%= %>` (escaped) in EJS, never `<%- %>` (unescaped) for commit data.

6. **Commit hash collisions** [S6-LOW]: Abbreviated hashes (7 chars) can collide in large repos. For git enrichment, use full hash (%H) in queries but display abbreviated (%h) in UI.

7. **Regex brittleness** [S6-MEDIUM]: If towline-executor changes the Task Results table format, regex parsing breaks. Consider adding a version check or making the parser more flexible.

## Testing Strategy

### Unit Tests (phase.service.test.js)

1. **Parse Task Results table from markdown body**:
   - Valid table with 2 commits → returns array with 2 entries
   - SUMMARY with no Task Results section → returns empty array
   - Malformed table (missing columns) → returns empty array or partial data

2. **Git enrichment (if implemented)**:
   - Mock `child_process.exec` to return git log output
   - Verify enriched data merges with SUMMARY data
   - Verify fallback when git command fails

3. **Empty state handling**:
   - Phase with no plans → commits array is empty
   - Plan with metrics.commits: 0 → commits array is empty
   - Plan with SUMMARY but no Task Results table → commits array is empty

### Integration Tests (manual verification)

1. **Render phase detail page** for Phase 05 → commits table appears with 2-4 entries
2. **Render phase detail page** for Phase 01 (if not executed) → empty state message appears
3. **Test git unavailable scenario**: Rename git executable temporarily → page still renders with SUMMARY data
4. **Test XSS protection**: Create commit with `<script>alert('xss')</script>` message → rendered as text, not executed

### Visual Verification

1. Commit table aligns with existing phase detail layout
2. Status badges use existing status-colors.css classes
3. Commit hashes are monospace (code element)
4. Table is responsive (Pico.css default behavior)

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| gray-matter | (existing) | Parse YAML frontmatter from SUMMARY.md | planning.repository.js |
| marked | (existing) | Parse markdown body (already available in rawContent) | planning.repository.js |
| node:child_process | Built-in | Execute git log commands (optional) | phase.service.js (optional) |
| node:util | Built-in | Promisify exec for async/await (optional) | phase.service.js (optional) |

**No new npm packages required** [S6-HIGH]. All data parsing uses existing dependencies or built-in Node.js modules.

## Open Questions

1. **Should commit enrichment be enabled by default or opt-in?** [DECISION-REQUIRED]
   - Default ON: Better UX (shows dates, authors) but requires git
   - Default OFF: Works everywhere but shows minimal data
   - **Recommendation**: Default ON with graceful fallback [S6-MEDIUM]

2. **Should commits be grouped by plan or shown as flat list?** [DECISION-REQUIRED]
   - Grouped: Clearer structure, aligns with plan cards
   - Flat: Simpler implementation, chronological flow
   - **Recommendation**: Grouped by plan [S6-MEDIUM] — maintains context with plan cards above

3. **Should the commit hash link to anything?** [DEFERRED]
   - Could link to `file:///.git/...` (doesn't work in browsers)
   - Could link to GitHub if remote URL is known (out of scope)
   - **Recommendation**: Display as plain code element [S6-HIGH]

4. **What if a task has multiple commits?** [EDGE-CASE]
   - Current towline-executor creates 1 commit per task
   - If this changes, Task Results table might show "3" in Commit column
   - Parser should handle commit count field gracefully
   - **Recommendation**: Assume 1:1 task-to-commit mapping for now [S6-MEDIUM]

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | [Git pretty formats](https://git-scm.com/docs/pretty-formats) | HIGH |
| S2 | Official Docs | [Pico CSS documentation](https://picocss.com/) | HIGH |
| S4 | WebSearch Verified | [Node.js child_process exec patterns](https://www.tabnine.com/code/javascript/functions/child_process/exec) | MEDIUM |
| S4 | WebSearch Verified | [Node.js exec error handling](https://davidwalsh.name/catching-fatal-errors-nodejs-childprocess) | MEDIUM |
| S5 | WebSearch Unverified | [CSS timeline design patterns](https://www.w3schools.com/howto/howto_css_timeline.asp) | LOW |
| S6 | Training Knowledge | Three-layer architecture patterns, EJS template syntax | HYPOTHESIS |
| S6 | Training Knowledge | Markdown table parsing with regex | HYPOTHESIS |
| S6 | Codebase Verified | Existing phase.service.js and phase-detail.ejs structure | HIGH |

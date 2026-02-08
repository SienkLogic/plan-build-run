# Phase Research: Roadmap Visualization

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 06-roadmap-visualization
> Confidence: HIGH

## User Constraints

**Locked decisions:**
- Node.js 24 LTS, Express 5.x, HTMX + Alpine.js, EJS templates, Pico.css, gray-matter, marked
- Three-layer architecture (Routes → Services → Repositories)
- No build step for frontend

**User constraints:**
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Phase Goal

Display all project phases with color-coded status indicators, plan counts, and dependency information on a dedicated roadmap page.

## Implementation Approach

### Recommended Approach: Enhanced Table Layout

Based on the existing dashboard implementation and Pico.css capabilities, the recommended approach is an **enhanced table layout** with custom CSS for dependency visualization.

**Rationale**:
1. Dashboard already uses table layout successfully [S6-PROJECT-PATTERN]
2. Pico.css provides clean table styling with `.striped` class option [S2-HIGH]
3. Tables are semantic, accessible, and work without JavaScript [S2-HIGH]
4. Custom CSS can add dependency indicators without build step [S6-HYPOTHESIS]

**Steps**:
1. Create `roadmap.service.js` to provide enhanced phase data (status, plan count, dependencies)
2. Add GET /roadmap route in `pages.routes.js` to replace current coming-soon placeholder
3. Create `roadmap.ejs` template with enhanced table layout
4. Add custom CSS for dependency visualization (optional visual connectors)
5. Reuse existing status badge pattern from dashboard

**Key decisions**:
- **Reuse vs new service**: Create dedicated `roadmap.service.js` [S6-RECOMMENDATION]. While `getDashboardData()` exists, the roadmap needs additional data (plan counts, dependencies) that dashboard doesn't need. Following three-layer architecture pattern, create focused service.
- **Data source**: Parse ROADMAP.md "Phase Details" section for dependencies [S6-PROJECT-PATTERN], count PLAN.md files per phase via `fs.readdir()` [S3-HIGH]
- **Visualization style**: Table with status badges + dependency column [S6-RECOMMENDATION]. Card grid would require more custom CSS and may not display dependencies clearly.
- **Dependencies display**: Text-based list in dedicated column [S6-RECOMMENDATION]. CSS-only dependency graphs are possible but complex and may not be worth the effort for 12 phases [S5-LOW].

### Configuration Details

**Service structure** (`roadmap.service.js`):
```javascript
// Source: [S6-PROJECT-PATTERN] Following phase.service.js pattern
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRoadmapFile } from './dashboard.service.js';

/**
 * Get roadmap data with plan counts and dependencies
 * @param {string} projectDir - Absolute path to project root
 * @returns {Promise<{phases: Array<{id, name, description, status, planCount, dependencies}>}>}
 */
export async function getRoadmapData(projectDir) {
  // 1. Get base phase list from parseRoadmapFile() (reuse existing logic)
  const { phases: basePhases } = await parseRoadmapFile(projectDir);

  // 2. Enhance each phase with plan count
  const enhancedPhases = await Promise.all(
    basePhases.map(async (phase) => {
      const planCount = await countPlansForPhase(projectDir, phase.id);
      const dependencies = extractDependencies(phase.id, roadmapContent);
      return { ...phase, planCount, dependencies };
    })
  );

  return { phases: enhancedPhases };
}

/**
 * Count PLAN.md files in a phase directory
 */
async function countPlansForPhase(projectDir, phaseId) {
  const phaseIdPadded = String(phaseId).padStart(2, '0');
  const phasesDir = join(projectDir, '.planning', 'phases');

  // Find directory matching phaseId
  const entries = await readdir(phasesDir, { withFileTypes: true });
  const phaseDir = entries.find(e =>
    e.isDirectory() && e.name.startsWith(`${phaseIdPadded}-`)
  );

  if (!phaseDir) return 0;

  const phaseFiles = await readdir(join(phasesDir, phaseDir.name));
  return phaseFiles.filter(f => /^\d{2}-\d{2}-PLAN\.md$/.test(f)).length;
}

/**
 * Extract dependencies from ROADMAP.md Phase Details section
 */
function extractDependencies(phaseId, roadmapContent) {
  // Parse "**Depends on**: Phase 01, Phase 02" lines
  const phaseIdPadded = String(phaseId).padStart(2, '0');
  const regex = new RegExp(
    `### Phase ${phaseIdPadded}:.*?\\*\\*Depends on\\*\\*:\\s*([^\\n]+)`,
    's'
  );
  const match = roadmapContent.match(regex);
  if (!match) return [];

  const depText = match[1].trim();
  if (depText.toLowerCase().includes('none')) return [];

  // Extract phase IDs from "Phase 01, Phase 02" format
  const depMatches = depText.matchAll(/Phase (\d+)/g);
  return Array.from(depMatches, m => parseInt(m[1], 10));
}
```

### Template Structure

**Table layout** (`roadmap.ejs`):
```html
<!-- Source: [S6-PROJECT-PATTERN] Following dashboard.ejs pattern -->
<%- include('partials/layout-top', { title: 'Roadmap', activePage: 'roadmap' }) %>

<h1>Project Roadmap</h1>

<article>
  <table>
    <thead>
      <tr>
        <th scope="col">Phase</th>
        <th scope="col">Name</th>
        <th scope="col">Description</th>
        <th scope="col">Plans</th>
        <th scope="col">Status</th>
        <th scope="col">Depends On</th>
      </tr>
    </thead>
    <tbody>
      <% phases.forEach(function(phase) { %>
      <tr>
        <td><%= String(phase.id).padStart(2, '0') %></td>
        <td>
          <a href="/phases/<%= String(phase.id).padStart(2, '0') %>">
            <%= phase.name %>
          </a>
        </td>
        <td><%= phase.description %></td>
        <td><%= phase.planCount %></td>
        <td>
          <span class="status-badge" data-status="<%= phase.status %>">
            <%= phase.status.replace('-', ' ') %>
          </span>
        </td>
        <td>
          <% if (phase.dependencies && phase.dependencies.length > 0) { %>
            <%= phase.dependencies.map(d => String(d).padStart(2, '0')).join(', ') %>
          <% } else { %>
            <small>None</small>
          <% } %>
        </td>
      </tr>
      <% }); %>
    </tbody>
  </table>
</article>

<%- include('partials/layout-bottom') %>
```

### API Patterns

**Route handler** (`pages.routes.js`):
```javascript
// Source: [S6-PROJECT-PATTERN] Following existing route pattern
import { getRoadmapData } from '../services/roadmap.service.js';

router.get('/roadmap', async (req, res) => {
  const roadmapData = await getRoadmapData(req.app.get('projectDir'));
  res.render('roadmap', {
    title: 'Roadmap',
    phases: roadmapData.phases
  });
});
```

### Data Models

**Phase object** (enhanced from dashboard version):
```typescript
// Source: [S6-PROJECT-PATTERN]
interface RoadmapPhase {
  id: number;              // From parseRoadmapFile
  name: string;            // From parseRoadmapFile
  description: string;     // From parseRoadmapFile
  status: 'complete' | 'in-progress' | 'not-started' | 'failed';  // From parseRoadmapFile + state
  planCount: number;       // NEW: from countPlansForPhase
  dependencies: number[];  // NEW: from extractDependencies
}
```

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| fs/promises | Node 24 | readdir() to count PLAN files and find phase dirs | roadmap.service.js |
| dashboard.service.js | current | parseRoadmapFile() reuse | roadmap.service.js |
| status-colors.css | current | Status badge styling | roadmap.ejs |

**No new npm packages required** [S6-HIGH].

## Pitfalls for This Phase

1. **Plan count performance** [S6-HYPOTHESIS]: Reading 12 phase directories in parallel should be fast (< 50ms), but could be slow on network drives. Mitigation: Use `Promise.all()` for parallelization.

2. **Dependency parsing fragility** [S6-HYPOTHESIS]: Regex parsing of ROADMAP.md Phase Details section depends on consistent formatting. If ROADMAP.md format changes, parsing breaks. Mitigation: Add tests for dependency extraction, consider fallback to empty array on parse failure.

3. **Missing phase directories** [S6-HYPOTHESIS]: If a phase exists in ROADMAP.md but has no directory in `.planning/phases/`, plan count will be 0. This is acceptable (phase not yet planned), but should not error. Mitigation: Return 0 on ENOENT, don't throw.

4. **Status derivation** [S6-PROJECT-PATTERN]: Current logic in `getDashboardData()` only marks current phase as "in-progress". Need to determine if we reuse that logic or parse status differently. Recommendation: Reuse `getDashboardData()` and enhance results, not duplicate logic.

5. **Pico.css table responsiveness** [S2-MEDIUM]: Pico tables don't have built-in responsive behavior for wide tables. With 6 columns, table may overflow on narrow viewports. Mitigation: Project is desktop-first per CONTEXT.md constraints, so this is acceptable. Could add horizontal scroll if needed.

## Alternative Approaches Considered

### Card Grid Layout

**Description**: Use Pico.css `.grid` class with `<article>` cards for each phase [S2-HIGH].

**Pros**:
- Visually appealing, modern design
- Pico.css grid auto-collapses on small devices [S2-HIGH]
- More space for dependency visualization

**Cons**:
- Less information density than table
- Harder to scan full roadmap at a glance
- Dependencies harder to visualize in card format
- More custom CSS needed for layout

**Decision**: Rejected in favor of table. Table is more information-dense and better for scanning 12 phases at once.

### Vertical Timeline

**Description**: CSS timeline with connector lines and circular markers [S4-MEDIUM].

**Pros**:
- Visually engaging, shows progression
- Natural fit for sequential phases
- Many CSS-only examples available [S4-MEDIUM]

**Cons**:
- Hard to show dependencies (phases aren't strictly linear)
- More complex CSS (pseudo-elements, positioning)
- Less semantic than table
- Doesn't scale well past 15-20 items

**Decision**: Rejected. Dependencies make this non-linear, and CSS complexity increases maintenance burden.

### Dependency Graph (CSS-only)

**Description**: Visual graph with nodes and edges using CSS Grid positioning [S5-LOW].

**Pros**:
- Shows dependencies visually
- Impressive visual design

**Cons**:
- No established CSS-only libraries found [S5-LOW]
- Would require manual positioning or complex CSS Grid
- Likely needs JavaScript for dynamic layout
- Overkill for 12 phases with simple dependencies

**Decision**: Rejected. Too complex for minimal benefit. Text-based dependency list is sufficient.

## Testing Strategy

1. **Unit tests** for `roadmap.service.js`:
   - `getRoadmapData()` returns phases with plan counts and dependencies
   - `countPlansForPhase()` counts PLAN.md files correctly
   - `extractDependencies()` parses ROADMAP.md correctly
   - Handles missing phase directories gracefully (returns 0 plans)
   - Handles missing dependencies in ROADMAP.md (returns empty array)

2. **Integration test** for GET /roadmap:
   - Returns 200 with roadmap template
   - Renders table with all phases
   - Status badges display correct colors
   - Plan counts are accurate
   - Dependencies are formatted correctly

3. **Manual verification**:
   - Open http://localhost:3000/roadmap in browser
   - Verify table displays all 12 phases
   - Verify status badges match ROADMAP.md checkboxes
   - Verify plan counts match actual PLAN.md files in `.planning/phases/`
   - Verify dependencies column shows correct phase references
   - Click phase links to verify navigation to phase detail page

## Enhanced Visualization (Optional)

If visual dependency indicators are desired later, add this CSS:

```css
/* Source: [S6-HYPOTHESIS] Custom CSS for dependency visualization */
.roadmap-table tr[data-has-dependencies="true"] td:last-child::before {
  content: "← ";
  color: var(--status-in-progress);
}
```

And update the template:
```html
<tr data-has-dependencies="<%= phase.dependencies.length > 0 %>">
```

This adds a visual arrow indicator to rows with dependencies, without JavaScript.

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | [Pico.css Table Documentation](https://picocss.com/docs/table) | HIGH |
| S2 | Official Docs | [Pico.css Grid Documentation](https://picocss.com/docs/grid) | HIGH |
| S3 | Official Docs | [Node.js fs.readdir Documentation](https://nodejs.org/api/fs.html) | HIGH |
| S4 | WebSearch - Verified | [CSS Timeline Components](https://www.sliderrevolution.com/resources/css-timeline/) | MEDIUM |
| S4 | WebSearch - Verified | [90 CSS Timelines Examples](https://freefrontend.com/css-timelines/) | MEDIUM |
| S5 | WebSearch - Unverified | [CSS-only dependency graphs](https://github.com/sverweij/dependency-cruiser) - No CSS-only solutions found | LOW |
| S6 | Project Pattern | Existing dashboard.service.js, phase.service.js, status-colors.css | HIGH |
| S6 | Project Pattern | ROADMAP.md structure and parsing | HIGH |

## Open Questions

1. **Should we add visual dependency graph?** Current recommendation is text-based list. If visual graph is desired, consider using a JavaScript library (D3.js, Cytoscape.js) in a later phase, or defer entirely per CONTEXT.md mobile/responsive deferral pattern.

2. **Should we show phase progress percentage per phase?** (e.g., "2 of 3 plans complete"). This would require parsing SUMMARY.md files per phase to determine plan status. Could be added in Phase 07 (Commit History) when parsing summaries.

3. **Should dependencies be clickable links?** Could enhance UX by making dependency numbers clickable: `<a href="/phases/01">01</a>`. Simple to add, but increases template complexity slightly.

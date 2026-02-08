# Phase Research: UI Shell

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 03-ui-shell
> Confidence: HIGH

## User Constraints

- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Phase Goal

Implement an EJS layout system that renders pages with consistent header, sidebar navigation, and content area styled with Pico.css. The layout should support status color coding (green/complete, yellow/in-progress, red/blocked-failed, gray/not-started) and provide navigation links for Dashboard, Phases, Todos, and Roadmap pages.

## Implementation Approach

### Recommended Approach

Based on the locked decision to use EJS without `express-ejs-layouts` or `ejs-mate`, the recommended pattern is to use **CSS Grid with manual EJS includes** [S2-HIGH].

**Architecture**:
1. Use CSS Grid with `grid-template-areas` for the main layout structure [S2-HIGH]
2. Create a layout wrapper partial that includes sidebar and content sections
3. Pass `activePage` variable to partials to highlight current navigation item [S4-MEDIUM]
4. Use Pico.css v2 semantic styling with minimal custom CSS for status colors [S2-HIGH]
5. Create placeholder routes that return "Coming Soon" pages for not-yet-implemented sections [S4-MEDIUM]

**Steps**:

1. **Create Layout Structure** [S2-HIGH]
   - Create `src/views/layouts/main.ejs` as a wrapper layout with CSS Grid
   - Structure: `<header>`, `<aside>` (sidebar), `<main>` (content), `<footer>`
   - Use `grid-template-areas` for responsive layout: header spans full width, sidebar + content in columns, footer spans full width

2. **Implement Sidebar Navigation** [S4-MEDIUM]
   - Create `src/views/partials/sidebar.ejs` with nav links
   - Accept `activePage` parameter to highlight current page
   - Use semantic `<nav>` with `<ul>` and `<li>` for navigation structure
   - Apply `.active` class or data attribute to current page link

3. **Add Status Color System** [S2-MEDIUM]
   - Create `public/css/status-colors.css` for minimal status color overrides
   - Use Pico.css color families (green, yellow, red, grey) with custom CSS variables
   - Apply status colors via `data-status` attributes on HTML elements
   - Do not rely solely on color; include text indicators for accessibility [S3-HIGH]

4. **Restructure Page Templates** [S4-HIGH]
   - Convert Phase 01 pages from "complete HTML docs" to content-only templates
   - Pages should only contain their unique content area, not full HTML structure
   - Wrap all pages with the main layout using includes
   - Pass `activePage` and `title` variables from route handlers

5. **Create Placeholder Routes** [S2-MEDIUM]
   - Add routes for `/phases`, `/todos`, `/roadmap` (even if not implemented)
   - Return a "Coming Soon" template for unimplemented features
   - Use HTTP 200 status (not 501) since routes exist but features are pending

6. **Add Minimal Custom CSS** [S2-HIGH]
   - Create `public/css/layout.css` for layout-specific tweaks
   - Define CSS Grid structure (should be ~20 lines)
   - Override Pico.css sidebar spacing if needed
   - Keep custom CSS under 100 lines total

### Configuration Details

**CSS Grid Layout** [S2-HIGH]:

```css
/* public/css/layout.css */
.page-wrapper {
  display: grid;
  gap: 1rem;
  grid-template-columns: 250px 1fr;
  grid-template-areas:
    "header header"
    "sidebar content"
    "footer footer";
  min-height: 100vh;
}

header {
  grid-area: header;
}

aside.sidebar {
  grid-area: sidebar;
}

main {
  grid-area: content;
}

footer {
  grid-area: footer;
}

/* Responsive: collapse sidebar on mobile */
@media (max-width: 768px) {
  .page-wrapper {
    grid-template-columns: 1fr;
    grid-template-areas:
      "header"
      "content"
      "sidebar"
      "footer";
  }
}
```

**Status Colors CSS** [S2-MEDIUM]:

```css
/* public/css/status-colors.css */
:root {
  --status-complete: var(--pico-color-green-500, #22c55e);
  --status-in-progress: var(--pico-color-yellow-500, #eab308);
  --status-blocked: var(--pico-color-red-500, #ef4444);
  --status-not-started: var(--pico-color-grey-400, #9ca3af);
}

[data-status="complete"] {
  color: var(--status-complete);
}

[data-status="in-progress"] {
  color: var(--status-in-progress);
}

[data-status="blocked"],
[data-status="failed"] {
  color: var(--status-blocked);
}

[data-status="not-started"] {
  color: var(--status-not-started);
}

/* Background variants for badges */
.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.status-badge[data-status="complete"] {
  background-color: var(--pico-color-green-100, #dcfce7);
  color: var(--pico-color-green-900, #14532d);
}

.status-badge[data-status="in-progress"] {
  background-color: var(--pico-color-yellow-100, #fef9c3);
  color: var(--pico-color-yellow-900, #713f12);
}

.status-badge[data-status="blocked"],
.status-badge[data-status="failed"] {
  background-color: var(--pico-color-red-100, #fee2e2);
  color: var(--pico-color-red-900, #7f1d1d);
}

.status-badge[data-status="not-started"] {
  background-color: var(--pico-color-grey-100, #f3f4f6);
  color: var(--pico-color-grey-900, #111827);
}
```

### EJS Layout Pattern

**Manual Layout Approach** [S2-HIGH]:

Since `express-ejs-layouts` is not being used (per locked decisions), EJS layouts must be implemented manually using `<%- include() %>` [S2].

**Layout Structure**:

```ejs
<!-- src/views/layouts/main.ejs -->
<!DOCTYPE html>
<html lang="en">
<%- include('../partials/head', { title: title || 'Towline Dashboard' }) %>
<body>
  <div class="page-wrapper">
    <%- include('../partials/header') %>
    <%- include('../partials/sidebar', { activePage: activePage || 'dashboard' }) %>
    <main>
      <%- body %>
    </main>
    <%- include('../partials/footer') %>
  </div>
</body>
</html>
```

**Page Template Pattern**:

```ejs
<!-- src/views/dashboard.ejs -->
<%- include('layouts/main', {
  activePage: 'dashboard',
  title: 'Dashboard',
  body: capture(() => { %>
    <h1>Dashboard</h1>
    <p>Content goes here...</p>
  <% })
}) %>
```

**HOWEVER**, EJS does not natively support a `capture()` function [S6-HYPOTHESIS]. The simpler pattern recommended by the EJS documentation is to include header/footer separately in each page [S2-HIGH]:

```ejs
<!-- src/views/dashboard.ejs -->
<%- include('partials/layout-top', { activePage: 'dashboard', title: 'Dashboard' }) %>

<h1>Dashboard</h1>
<p>Dashboard content...</p>

<%- include('partials/layout-bottom') %>
```

**Split Layout Files**:
- `partials/layout-top.ejs`: Contains `<!DOCTYPE>` through opening `<main>`
- `partials/layout-bottom.ejs`: Contains closing `</main>` through `</html>`

### API Patterns

**Route Handler Pattern** [S4-HIGH]:

```javascript
// src/routes/pages.routes.js
router.get('/dashboard', (req, res) => {
  res.render('dashboard', {
    activePage: 'dashboard',
    title: 'Dashboard'
  });
});

router.get('/phases', (req, res) => {
  res.render('phases/index', {
    activePage: 'phases',
    title: 'Phases',
    phases: [] // populated by service layer
  });
});

// Placeholder for not-yet-implemented pages
router.get('/roadmap', (req, res) => {
  res.render('coming-soon', {
    activePage: 'roadmap',
    title: 'Roadmap - Coming Soon',
    featureName: 'Roadmap'
  });
});
```

**Sidebar Partial with Active Page** [S4-MEDIUM]:

```ejs
<!-- src/views/partials/sidebar.ejs -->
<aside class="sidebar">
  <nav>
    <ul>
      <li>
        <a
          href="/"
          <%= activePage === 'dashboard' ? 'aria-current="page"' : '' %>
        >
          Dashboard
        </a>
      </li>
      <li>
        <a
          href="/phases"
          <%= activePage === 'phases' ? 'aria-current="page"' : '' %>
        >
          Phases
        </a>
      </li>
      <li>
        <a
          href="/todos"
          <%= activePage === 'todos' ? 'aria-current="page"' : '' %>
        >
          Todos
        </a>
      </li>
      <li>
        <a
          href="/roadmap"
          <%= activePage === 'roadmap' ? 'aria-current="page"' : '' %>
        >
          Roadmap
        </a>
      </li>
    </ul>
  </nav>
</aside>
```

Then style the active link with CSS:

```css
/* public/css/layout.css */
nav a[aria-current="page"] {
  font-weight: bold;
  background-color: var(--pico-primary-background);
  border-left: 3px solid var(--pico-primary);
  padding-left: calc(1rem - 3px);
}
```

### Data Models

No database models required for this phase. All data is passed as view variables from route handlers.

**View Data Interface** [S6-HIGH]:

```typescript
interface ViewData {
  activePage: 'dashboard' | 'phases' | 'todos' | 'roadmap';
  title: string;
  // Phase-specific data added by individual pages
  [key: string]: any;
}
```

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| Pico.css | 2.x | Semantic CSS framework | Phase 03 (UI) |
| None (CSS only) | - | No npm dependencies needed | Phase 03 |

**CSS Files to Create**:
- `public/css/layout.css` - Grid layout structure (~30 lines)
- `public/css/status-colors.css` - Status color definitions (~60 lines)

**Pico.css CDN Link** [S2-HIGH]:

Already included in `src/views/partials/head.ejs` from Phase 01:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
```

## Pitfalls for This Phase

1. **EJS Does Not Support Layout Wrappers Natively** [S2-HIGH]

   EJS does not have a native `<%- body %>` placeholder like `express-ejs-layouts` or `ejs-mate` [S2]. The manual pattern requires splitting the layout into top and bottom includes, which each page must explicitly include. This is more verbose but respects the locked decision to avoid middleware dependencies.

   **Solution**: Create `layout-top.ejs` and `layout-bottom.ejs` partials. Each page includes both.

2. **Passing Variables to Includes Can Be Tricky** [S4-MEDIUM]

   Variables passed to `include()` are not automatically inherited from the parent scope in all EJS versions [S4]. You must explicitly pass variables as the second argument: `<%- include('partial', { activePage: activePage }) %>`.

   **Solution**: Always explicitly pass variables to includes. Do not rely on scope inheritance.

3. **Pico.css Has No Built-in Status Color Classes** [S2-HIGH]

   Pico.css v2 provides 380 colors across 20 families, but does not include semantic status utilities like `.text-success` or `.bg-danger` [S2]. You must create custom CSS variables and classes.

   **Solution**: Create `status-colors.css` with custom CSS variables mapped to Pico's color families.

4. **Active Page Styling Requires ARIA Best Practices** [S3-HIGH]

   For accessibility, the active navigation link should use `aria-current="page"` rather than just a CSS class [S3]. Screen readers rely on this attribute to announce the current page.

   **Solution**: Conditionally add `aria-current="page"` in the sidebar template based on the `activePage` variable.

5. **Sidebar Collapse on Mobile Requires Media Query** [S2-MEDIUM]

   Pico.css does not automatically handle sidebar layouts. The grid will collapse all columns on screens under 768px by default [S2]. You must define responsive behavior explicitly.

   **Solution**: Use `@media (max-width: 768px)` to redefine `grid-template-areas` and stack the sidebar below content on mobile.

6. **Color Alone Is Not Sufficient for Accessibility** [S3-HIGH]

   Using only color to indicate status violates WCAG 2.1 Level A guidelines [S3]. Status indicators must include text or icons in addition to color.

   **Solution**: Always pair status colors with text labels (e.g., "Complete", "In Progress") or use status badge components that include both color and text.

7. **Placeholder Routes Should Not Return 501 Status** [S2-MEDIUM]

   HTTP 501 means "Not Implemented" and indicates the server does not recognize the request method [S2]. For features that are planned but not yet built, return 200 with a "Coming Soon" page instead.

   **Solution**: Create a `coming-soon.ejs` template and render it with 200 status for unimplemented features.

## Testing Strategy

### Manual Testing Checklist

1. **Layout Structure**:
   - [ ] Header spans full width
   - [ ] Sidebar is 250px wide on desktop
   - [ ] Content area takes remaining width
   - [ ] Footer spans full width
   - [ ] Layout collapses to single column on mobile (<768px)

2. **Navigation**:
   - [ ] All four nav links render (Dashboard, Phases, Todos, Roadmap)
   - [ ] Active page is highlighted with bold text and left border
   - [ ] Active page has `aria-current="page"` attribute
   - [ ] Clicking nav links navigates correctly
   - [ ] Placeholder pages show "Coming Soon" message

3. **Status Colors**:
   - [ ] Complete status shows green
   - [ ] In-progress status shows yellow
   - [ ] Blocked/failed status shows red
   - [ ] Not-started status shows gray
   - [ ] Status badges have background colors with sufficient contrast
   - [ ] Status indicators include text labels, not just color

4. **Pico.css Integration**:
   - [ ] Semantic HTML elements styled correctly by Pico
   - [ ] No custom classes needed for basic elements
   - [ ] Dark mode toggle works (if implemented)
   - [ ] Typography scales correctly

### Automated Testing (if applicable)

**Route Tests** (Vitest):
```javascript
describe('UI Routes', () => {
  test('GET / renders dashboard with activePage=dashboard', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('activePage: dashboard');
  });

  test('GET /phases renders phases page with activePage=phases', async () => {
    const res = await request(app).get('/phases');
    expect(res.status).toBe(200);
    expect(res.text).toContain('activePage: phases');
  });

  test('Placeholder routes return 200 with coming-soon template', async () => {
    const res = await request(app).get('/roadmap');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Coming Soon');
  });
});
```

**Accessibility Tests** (if using tools like axe-core):
- [ ] No color contrast violations
- [ ] `aria-current="page"` present on active nav links
- [ ] Semantic HTML structure (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`)

## Open Questions

1. **Should the sidebar be collapsible on desktop?**

   The current design assumes a fixed sidebar. Some users may prefer a collapsible sidebar to maximize content area. This would require JavaScript (Alpine.js) and is deferred until HTMX/Alpine integration in Phase 11.

2. **How should status colors work in dark mode?**

   Pico.css automatically switches between light and dark themes based on user preference [S2]. The custom status colors should also adjust for dark mode. This requires defining status colors separately for `[data-theme="light"]` and `[data-theme="dark"]` selectors, but specific dark mode color values are not researched yet [RESEARCH-GAP].

3. **Should nav links use client-side routing or full page reloads?**

   The current implementation uses standard `<a>` tags with full page navigation. HTMX (Phase 11) could enable SPA-style navigation without full reloads. This decision is deferred.

4. **What should the "Coming Soon" page look like?**

   Should it be a generic template or should it show a roadmap/timeline for when the feature will be available? The latter requires project planning data integration, which is outside the scope of this phase [S6-SPECULATIVE].

## Restructuring from Phase 01

Phase 01 implemented each page as a **complete HTML document** with inline `<%- include() %>` calls for head, header, and footer. This pattern must be restructured to support the new sidebar layout.

**Phase 01 Pattern** (Current):
```ejs
<!-- src/views/index.ejs -->
<!DOCTYPE html>
<html lang="en">
<%- include('partials/head', { title: 'Dashboard' }) %>
<body>
  <%- include('partials/header') %>
  <main class="container">
    <!-- page content -->
  </main>
  <%- include('partials/footer') %>
</body>
</html>
```

**Phase 03 Pattern** (New):
```ejs
<!-- src/views/dashboard.ejs -->
<%- include('partials/layout-top', { activePage: 'dashboard', title: 'Dashboard' }) %>

<!-- page content only -->
<h1>Dashboard</h1>
<p>Content...</p>

<%- include('partials/layout-bottom') %>
```

**Migration Steps**:
1. Create `partials/layout-top.ejs` (contains everything from `<!DOCTYPE>` to opening `<main>`, including sidebar)
2. Create `partials/layout-bottom.ejs` (contains closing `</main>` to `</html>`)
3. Update existing pages (`index.ejs`, `error.ejs`) to use new pattern
4. Remove duplicate `<body>`, `<main class="container">` from pages
5. Pass `activePage` variable from all route handlers

## Key Recommendations

1. **Use CSS Grid with `grid-template-areas`** [HIGH Confidence]

   This is the most semantic and maintainable approach for dashboard layouts [S2]. It provides clear visual structure in CSS and is well-supported across browsers.

2. **Split Layout into Top/Bottom Partials** [HIGH Confidence]

   Since EJS does not natively support layout wrappers, the "split layout" pattern is the recommended approach [S2][S4]. It's more explicit than middleware-based solutions and avoids additional dependencies.

3. **Use `aria-current="page"` for Active Navigation** [HIGH Confidence]

   This is the accessible standard for indicating the current page [S3]. Do not rely solely on CSS classes or visual styling.

4. **Create Minimal Custom CSS (Under 100 Lines)** [MEDIUM Confidence]

   Pico.css handles 95% of styling. Only layout structure (~30 lines) and status colors (~60 lines) need custom CSS [S2]. Resist the temptation to add more custom styles.

5. **Always Pair Status Colors with Text** [HIGH Confidence]

   For accessibility, never rely on color alone [S3]. Use status badges with both color and text labels.

6. **Return 200 for Placeholder Routes** [MEDIUM Confidence]

   Unimplemented features should return 200 with a "Coming Soon" page, not 501 [S2]. HTTP 501 is for unsupported HTTP methods, not missing features.

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2-01 | Official Docs | [Pico.css Documentation](https://picocss.com/docs) | HIGH |
| S2-02 | Official Docs | [Pico.css Grid](https://picocss.com/docs/grid) | HIGH |
| S2-03 | Official Docs | [Pico.css CSS Variables](https://picocss.com/docs/css-variables) | HIGH |
| S2-04 | Official Docs | [Pico.css Colors](https://picocss.com/docs/colors) | HIGH |
| S2-05 | Official Docs | [EJS Official Documentation](https://ejs.co/) | HIGH |
| S2-06 | Official Docs | [MDN: CSS Grid Common Layouts](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Common_grid_layouts) | HIGH |
| S2-07 | Official Docs | [MDN: HTTP 503 Status](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/503) | HIGH |
| S3-01 | GitHub | [Pico Examples Repository](https://github.com/picocss/examples) | HIGH |
| S3-02 | GitHub | [Pico CSS Repository](https://github.com/picocss/pico) | HIGH |
| S3-03 | W3C Spec | [ARIA in HTML](https://www.w3.org/TR/html-aria/) | HIGH |
| S3-04 | W3C Spec | [ARIA 1.3 Specification](https://w3c.github.io/aria/) | HIGH |
| S4-01 | Tutorial | [NodeJs Express EJS Layouts and Partials - RaddyDev](https://raddy.dev/blog/nodejs-express-layouts-and-partials/) | MEDIUM |
| S4-02 | Tutorial | [DigitalOcean: How To Use EJS to Template Your Node Application](https://www.digitalocean.com/community/tutorials/how-to-use-ejs-to-template-your-node-application) | MEDIUM |
| S4-03 | Blog Post | [Using layouts with EJS in Express 3.x](https://hectorcorrea.com/blog/2012-09-13/using-layouts-with-ejs-in-express-3-x) | MEDIUM |
| S4-04 | StackOverflow | [Wappler Community: Passing data to EJS partials](https://community.wappler.io/t/reusability-and-passing-data-to-ejs-includes-partials/32641) | MEDIUM |
| S4-05 | Blog Post | [Express Routes and Controllers - MDN](https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs/routes) | MEDIUM |

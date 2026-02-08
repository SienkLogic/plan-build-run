# Phase Research: HTMX Dynamic Loading

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 11-htmx-dynamic-loading
> Confidence: HIGH

## User Constraints

- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Phase Goal

Implement HTMX for partial content loading to enable:
1. Phase detail navigation without full page reloads (hx-get)
2. Todo creation with in-place list updates (hx-post)
3. Todo completion with in-place item updates (hx-put)
4. SSE-triggered HTMX content refresh for affected sections
5. Fragment vs. full-page responses based on HX-Request header

## Implementation Approach

### Recommended Approach

**Use HTMX 2.0.8 with SSE extension for dynamic loading and live updates** [S2-HIGH]

HTMX is designed to enable AJAX, CSS Transitions, WebSockets and Server Sent Events directly in HTML using attributes, eliminating the need for a build step. It works perfectly with the locked decision to use HTMX + Alpine.js with no build step [S2].

**Steps**:

1. **Add HTMX 2.0.8 from CDN** [S2-HIGH]
   - Include script tag in `<head>` of layout-top.ejs
   - Use integrity hash for security
   - Add SSE extension separately (removed from core in 2.0)

2. **Detect HX-Request header in Express routes** [S4-HIGH]
   - Check `req.get('HX-Request') === 'true'` to differentiate HTMX requests from normal requests
   - Add `Vary: HX-Request` header to responses for proper HTTP caching
   - Return HTML fragment when HX-Request is true, full page otherwise

3. **Create fragment-only EJS templates** [S5-MEDIUM]
   - Split existing views into layout + content partials
   - Use conditional logic in routes to render full page or fragment
   - Pattern: `if (isHtmxRequest) res.render('fragment') else res.render('full-page')`

4. **Add HTMX attributes to navigation and forms** [S2-HIGH]
   - Phase links: `hx-get="/phases/01" hx-target="#content" hx-swap="innerHTML" hx-push-url="true"`
   - Todo creation: `hx-post="/todos" hx-target="#todo-list" hx-swap="beforeend"`
   - Todo completion: `hx-put="/todos/123/done" hx-target="#todo-123" hx-swap="outerHTML"`

5. **Replace sse-client.js with HTMX SSE extension** [S2-HIGH]
   - Install SSE extension from CDN
   - Use `hx-ext="sse"` and `sse-connect="/api/events/stream"` on container element
   - Use `sse-swap="file-change"` to trigger content refresh on specific elements
   - Remove `window.location.reload()` in favor of targeted swaps

**Key decisions**:

- **Use HTMX 2.0.8** [S2-HIGH]: Latest stable version with improved SSE extension architecture
- **Return fragments for HX-Request** [S4-HIGH]: Standard HTMX pattern for SPA-like navigation
- **Use hx-push-url for navigation** [S2-HIGH]: Maintains browser history and URL bar updates
- **Target specific elements, not full page** [S2-MEDIUM]: Enables granular updates for todos without affecting sidebar/header
- **Use SSE extension instead of custom EventSource** [S2-HIGH]: Built-in reconnection logic and better integration

### Configuration Details

**CDN Script Tags** [S2-HIGH]:

```html
<!-- In layout-top.ejs <head> section -->
<script
  src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js"
  integrity="sha384-/TgkGk7p307TH7EXJDuUlgG3Ce1UVolAOFopFekQkkXihi5u/6OCvVKyz1W+idaz"
  crossorigin="anonymous">
</script>
<script
  src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.2/sse.js">
</script>
```

**Express Route Pattern** [S4-HIGH]:

```javascript
// In pages.routes.js
router.get('/phases/:phaseId', async (req, res) => {
  const isHtmxRequest = req.get('HX-Request') === 'true';
  res.setHeader('Vary', 'HX-Request'); // Critical for caching

  const { phaseId } = req.params;
  const projectDir = req.app.locals.projectDir;
  const phaseData = await getPhaseDetail(projectDir, phaseId);

  if (isHtmxRequest) {
    // Return fragment only
    res.render('partials/phase-content', {
      ...phaseData
    });
  } else {
    // Return full page with layout
    res.render('phase-detail', {
      title: `Phase ${phaseId}: ${phaseData.phaseName}`,
      activePage: 'phases',
      ...phaseData
    });
  }
});
```

**EJS Template Pattern** [S5-MEDIUM]:

```ejs
<!-- phase-detail.ejs (full page) -->
<%- include('partials/layout-top', { title, activePage }) %>
  <div id="content">
    <%- include('partials/phase-content', { phaseData }) %>
  </div>
<%- include('partials/layout-bottom') %>

<!-- partials/phase-content.ejs (fragment) -->
<article>
  <h1><%= phaseName %></h1>
  <p><%= description %></p>
  <!-- ... phase content ... -->
</article>
```

**SSE Message Format** [S2-HIGH]:

The existing sse.service.js already emits correctly formatted SSE messages:

```javascript
// Current format (correct):
event: file-change
data: {"path":".planning/todos/pending/001.md","type":"changed"}
id: 1738944000000

```

This format is compatible with HTMX SSE extension's `sse-swap` attribute [S2].

### API Patterns

**hx-get for navigation** [S2-HIGH]:

```html
<a href="/phases/01"
   hx-get="/phases/01"
   hx-target="#content"
   hx-swap="innerHTML"
   hx-push-url="true">
  Phase 01: Project Setup
</a>
```

**hx-post for form submission** [S2-HIGH]:

```html
<form hx-post="/todos"
      hx-target="#todo-list"
      hx-swap="beforeend"
      hx-on::after-request="this.reset()">
  <input type="text" name="title" required>
  <button type="submit">Create Todo</button>
</form>
```

Note: HTMX eliminates the need for Post/Redirect/Get pattern — just return the new HTML fragment directly [S3-HIGH].

**hx-put for updates** [S2-HIGH]:

```html
<form hx-put="/todos/123/done"
      hx-target="#todo-123"
      hx-swap="outerHTML">
  <button type="submit">Mark Done</button>
</form>
```

**SSE integration** [S2-HIGH]:

```html
<div hx-ext="sse"
     sse-connect="/api/events/stream">

  <div id="todo-list"
       sse-swap="file-change"
       hx-get="/todos/fragments/list"
       hx-trigger="sse:file-change">
    <!-- Todo items render here -->
  </div>
</div>
```

Pattern: When SSE event "file-change" fires, trigger hx-get to refresh the todo list [S2].

### Data Models

No new data models required. HTMX works with existing:
- Phase data from phase.service.js
- Todo data from todo.service.js
- SSE events from sse.service.js (already correctly formatted)

**Response Structure**:

- **Full page response**: Complete HTML document with `<!DOCTYPE>`, `<html>`, `<body>`, layout partials
- **Fragment response**: Raw HTML snippet (e.g., `<article>...</article>` or `<li>...</li>`)

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| htmx.org | 2.0.8 | Core HTMX library | CDN (no npm install) |
| htmx-ext-sse | 2.2.2 | SSE extension for HTMX 2.x | CDN (no npm install) |

**CRITICAL**: HTMX 2.x removed SSE extension from core distribution [S2-HIGH]. It must be included separately. The legacy `hx-sse` attribute is removed in favor of `sse-connect` and `sse-swap` attributes provided by the extension [S2].

**No Alpine.js needed for this phase** [S4-MEDIUM]: HTMX handles all server interactions (navigation, forms, SSE). Alpine.js is only needed for client-side state (modals, dropdowns, conditional rendering) which aren't part of Phase 11 requirements [S4].

## Pitfalls for This Phase

1. **Forgetting Vary: HX-Request header** [S4-HIGH]
   - If server returns different content based on HX-Request header, MUST add `Vary: HX-Request` to response
   - Without it, HTTP caches (CDN, browser) will return wrong content type
   - Example: Browser caches full HTML page, then HTMX request gets full page instead of fragment

2. **Including layout in fragment responses** [S5-MEDIUM]
   - When HX-Request is true, return ONLY the content fragment, not `layout-top` + `layout-bottom`
   - Including layout will nest `<html>` inside `<main>`, breaking the DOM
   - Test with DevTools to verify fragment structure

3. **SSE extension version mismatch** [S2-HIGH]
   - HTMX 1.x used `hx-sse` attribute (now deprecated)
   - HTMX 2.x requires separate SSE extension with `hx-ext="sse"` and `sse-connect`
   - Mixing versions will silently fail — verify correct script tags

4. **Default hx-swap is innerHTML** [S2-MEDIUM]
   - If you don't specify `hx-swap`, HTMX uses `innerHTML` by default
   - For todo creation, you want `beforeend` to append new item
   - For todo completion, you want `outerHTML` to replace entire item including `<li>` tag

5. **hx-push-url doesn't update active nav state** [S6-MEDIUM]
   - Pushing URL to history doesn't re-render sidebar to update active page highlight
   - Need to either: (a) use Alpine.js to track active page client-side, or (b) include sidebar in fragment response
   - For Phase 11, option (b) is simpler: include sidebar in phase detail fragment [S6-LOW]

6. **SSE event name must match sse-swap value** [S2-HIGH]
   - Current sse.service.js broadcasts `event: file-change`
   - HTMX SSE extension requires exact match: `sse-swap="file-change"`
   - Event name "message" is the default if no event type specified [S2]

7. **POST forms need method="post" attribute** [S6-LOW]
   - HTMX respects standard HTML form methods
   - If form has no method attribute, defaults to GET even with `hx-post`
   - Best practice: explicitly set `method="post"` on forms with hx-post

8. **SSE reconnection can cause duplicate listeners** [S5-LOW]
   - If you manually create EventSource in sse-client.js AND use HTMX SSE extension, you'll have two connections
   - Remove custom sse-client.js when migrating to HTMX SSE extension [S6-MEDIUM]

## Testing Strategy

### Unit Tests (Vitest)

**Test HX-Request header detection** [S5-HIGH]:

```javascript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('HTMX integration', () => {
  it('returns full page when HX-Request header is missing', async () => {
    const res = await request(app).get('/phases/01');
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<html');
  });

  it('returns fragment when HX-Request header is true', async () => {
    const res = await request(app)
      .get('/phases/01')
      .set('HX-Request', 'true');

    expect(res.text).not.toContain('<!DOCTYPE html>');
    expect(res.text).not.toContain('<html');
    expect(res.text).toContain('<article'); // Fragment content
  });

  it('sets Vary: HX-Request header', async () => {
    const res = await request(app).get('/phases/01');
    expect(res.headers.vary).toBe('HX-Request');
  });
});
```

**Test todo operations return correct fragments** [S6-MEDIUM]:

```javascript
it('POST /todos returns new todo HTML fragment', async () => {
  const res = await request(app)
    .post('/todos')
    .set('HX-Request', 'true')
    .send({ title: 'Test todo', priority: 'P1' });

  expect(res.text).toContain('<li'); // New todo list item
  expect(res.text).toContain('Test todo');
  expect(res.text).not.toContain('<!DOCTYPE'); // Not full page
});
```

### Manual Testing

1. Verify navigation doesn't reload page: Network tab should show XHR request, not document request
2. Verify URL bar updates with hx-push-url: Back button should work
3. Verify SSE triggers content refresh: Edit a .md file in .planning/, watch todo list update
4. Verify forms work without page reload: Submit todo form, see new item appear inline

## Open Questions

1. **Should sidebar be included in phase detail fragments?**
   - Pro: Keeps active page highlight accurate
   - Con: Larger fragment, potential flicker
   - Recommendation: Start without sidebar in fragment (simpler), add if needed [S6-SPECULATIVE]

2. **Should we use hx-indicator for loading states?**
   - Not required by success criteria, but improves UX
   - Defer to Phase 12 (UI polish) [S6-SPECULATIVE]

3. **How granular should SSE swaps be?**
   - Option A: Swap entire todo list on any file change (simpler)
   - Option B: Parse event data.path and only swap affected todo (complex)
   - Recommendation: Start with Option A, optimize in Phase 12 if needed [S6-SPECULATIVE]

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | https://htmx.org/docs/ | HIGH |
| S2 | Official Docs | https://htmx.org/attributes/hx-get/ | HIGH |
| S2 | Official Docs | https://htmx.org/attributes/hx-post/ | HIGH |
| S2 | Official Docs | https://htmx.org/attributes/hx-target/ | HIGH |
| S2 | Official Docs | https://htmx.org/attributes/hx-swap/ | HIGH |
| S2 | Official Docs | https://htmx.org/attributes/hx-push-url/ | HIGH |
| S2 | Official Docs | https://htmx.org/extensions/sse/ | HIGH |
| S2 | Official Docs | https://htmx.org/migration-guide-htmx-1/ | HIGH |
| S2 | Official Docs | https://htmx.org/headers/hx-trigger/ | HIGH |
| S3 | GitHub Discussion | https://github.com/bigskysoftware/htmx/issues/369 | HIGH |
| S4 | WebSearch | Express HX-Request header pattern | MEDIUM |
| S4 | WebSearch | HTMX Alpine.js comparison | MEDIUM |
| S5 | WebSearch | EJS partial template patterns | MEDIUM |
| S5 | WebSearch | HTMX testing patterns | LOW |
| S6 | Training Knowledge | Express routing patterns | HYPOTHESIS |
| S6 | Training Knowledge | Form submission best practices | HYPOTHESIS |

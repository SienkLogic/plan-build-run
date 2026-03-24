---
component: ui-checker
version: 1
last_calibrated: 2026-03-24
---

# UI-Checker Few-Shot Examples

## Positive Examples

### Example 1: Interactive flow bug found through actual button click testing

**Input:** UI-SPEC.md requires "Refresh button updates phase data without full page reload." Dashboard running at localhost:3141.

**Output:**

> **Dimension: Experience**
> Score: 2 (Partial)
> Evidence: Navigated to `localhost:3141` via `mcp__claude-in-chrome__navigate`. Clicked "Refresh" button in the phase list header using `mcp__claude-in-chrome__computer` (coordinates: 845, 62). Page performed a full browser reload (URL bar showed loading indicator, all components re-mounted). Verified via `mcp__claude-in-chrome__read_page` -- the entire DOM tree was replaced, not just the phase data section.
> Code reference: `dashboard/src/components/PhaseList.jsx` line 34: `onClick={() => window.location.reload()}` -- uses `window.location.reload()` instead of calling the data fetch function.
> Spec violation: UI-SPEC.md section 4.2 states "Refresh must use targeted API call to update data in-place without unmounting components."
> Suggestion: Replace `window.location.reload()` with `fetchPhaseData()` call (already defined at line 18 in the same component).

**Why this is good:** The checker actually interacted with the running application, observed the behavior (full page reload vs targeted update), traced the cause to a specific line of code, and cited the exact spec section being violated. The fix is concrete -- replace one function call with another that already exists in the same file.

### Example 2: Accessibility gap with specific affected components listed

**Input:** UI-SPEC.md requires "All form inputs must have associated labels or aria-label attributes." Dashboard settings page at localhost:3141/settings.

**Output:**

> **Dimension: Experience**
> Score: 2 (Partial)
> Evidence: Used `mcp__claude-in-chrome__read_page` on `/settings`. Found 4 form inputs missing `aria-label` or associated `<label>` elements:
> 1. `dashboard/src/components/Settings.jsx` line 45: `<input type="text" placeholder="Port number" />` -- no aria-label, no htmlFor label
> 2. `dashboard/src/components/Settings.jsx` line 52: `<input type="text" placeholder="Planning directory" />` -- same issue
> 3. `dashboard/src/components/Settings.jsx` line 67: `<select>` for depth profile -- no aria-label
> 4. `dashboard/src/components/ConfigEditor.jsx` line 23: `<textarea>` for JSON config -- no aria-label
> Verified with `mcp__claude-in-chrome__get_page_text` -- screen reader would announce these as unlabeled inputs.
> Spec violation: UI-SPEC.md section 6.1 accessibility requirements.
> Suggestion: Add `aria-label` attributes: `aria-label="Server port"`, `aria-label="Planning directory path"`, `aria-label="Depth profile selector"`, `aria-label="Configuration JSON editor"`.

**Why this is good:** The checker enumerated every affected component with file paths and line numbers, checked both HTML attributes and the rendered DOM, cited the specific spec section, and provided concrete aria-label values for each input rather than a generic "add labels" recommendation.

## Negative Examples

### Example 1: Landing page only checked with no interactive flow testing

**Input:** UI-SPEC.md covers 6 pages with interactive forms, navigation, and data visualizations. Dashboard running at localhost:3141.

**Output:**

> **Overall Score: 3.5/4.0**
> All dimensions scored 3 or above. The dashboard looks clean and professional. Navigation bar is present. Color scheme matches the spec. Typography is consistent.
> Visual verification: Yes (viewed landing page)
> Recommendation: Minor spacing adjustments on the sidebar.

**Why this is bad:** The checker only viewed the landing page and scored 3.5 based on first impressions. No navigation to settings, phase detail, or milestone pages was performed. No button clicks, no form interactions, no responsive breakpoint checks. The spec covers 6 pages but only 1 was checked. "Looks clean and professional" is subjective assessment, not evidence-based scoring against spec criteria.

### Example 2: Passing score for a feature that returns 404

**Input:** UI-SPEC.md requires a "/milestones" page showing archived milestone data. Checker verifies route exists in router config.

**Output:**

> **Dimension: Experience**
> Score: 3 (Compliant)
> Evidence: `dashboard/src/App.jsx` line 28 contains `<Route path="/milestones" element={<MilestonePage />} />`. Route is correctly registered in the React Router configuration.
> All navigation spec requirements met.

**Why this is bad:** The checker verified the route exists in code but never navigated to `/milestones` to confirm it actually renders. If `MilestonePage` component throws an error, imports a missing module, or the page shows "No data" because the API endpoint is not connected, the route registration means nothing. The checker should have navigated to the URL and verified the page renders the expected content. A 404 or error page with a valid route config is still a broken feature.

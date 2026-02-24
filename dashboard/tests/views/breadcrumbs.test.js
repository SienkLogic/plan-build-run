import { describe, it, expect } from 'vitest';

/**
 * Navigation / breadcrumb tests.
 *
 * The EJS breadcrumbs partial has been replaced by the JSX Layout component
 * in the Hono rebuild. Navigation structure is verified via the route
 * integration tests (tests/routes/routes.integration.test.js), which confirm
 * that pages render with proper HTML structure including navigation.
 *
 * This file is retained to document the coverage handoff and to prevent
 * vitest from reporting a missing test file as a configuration error.
 */
describe('navigation (formerly breadcrumbs)', () => {
  it('navigation is covered by routes integration tests', () => {
    // The JSX Layout component provides navigation for all pages.
    // See tests/routes/routes.integration.test.js for HTTP-level coverage.
    expect(true).toBe(true);
  });
});

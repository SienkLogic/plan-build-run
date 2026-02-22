import { describe, it, expect } from 'vitest';
import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const partialPath = join(import.meta.dirname, '..', '..', 'src', 'views', 'partials', 'breadcrumbs.ejs');

async function renderBreadcrumbs(breadcrumbs) {
  const template = await readFile(partialPath, 'utf-8');
  return ejs.render(template, { breadcrumbs });
}

describe('breadcrumbs partial', () => {
  it('renders nothing for empty breadcrumbs array', async () => {
    const html = await renderBreadcrumbs([]);
    expect(html.trim()).toBe('');
  });

  it('renders nothing when breadcrumbs is undefined', async () => {
    const template = await readFile(partialPath, 'utf-8');
    const html = ejs.render(template, {});
    expect(html.trim()).toBe('');
  });

  it('renders single item without link (current page)', async () => {
    const html = await renderBreadcrumbs([{ label: 'Dashboard' }]);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Dashboard');
    expect(html).not.toContain('href="Dashboard"');
  });

  it('renders multiple items with links for all but last', async () => {
    const html = await renderBreadcrumbs([
      { label: 'Phases', url: '/phases' },
      { label: 'Phase 01', url: '/phases/01' },
      { label: 'Plan 01-01' }
    ]);

    expect(html).toContain('href="/phases"');
    expect(html).toContain('href="/phases/01"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Plan 01-01');
  });

  it('renders home icon link', async () => {
    const html = await renderBreadcrumbs([{ label: 'Test' }]);
    // Home icon (&#8962;) with link to /
    expect(html).toContain('href="/"');
    expect(html).toContain('&#8962;');
  });

  it('escapes special characters in labels', async () => {
    const html = await renderBreadcrumbs([
      { label: '<script>alert("xss")</script>' }
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

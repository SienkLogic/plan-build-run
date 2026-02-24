import { html } from 'hono/html';

interface LayoutProps {
  title: string;
  children: any;
  currentView?: string;
}

const navItems = [
  { href: '/', label: 'Command Center', view: 'home' },
  { href: '/explorer', label: 'Explorer', view: 'explorer' },
  { href: '/timeline', label: 'Timeline', view: 'timeline' },
  { href: '/settings', label: 'Settings', view: 'settings' },
];

export function Layout({ title, children, currentView }: LayoutProps) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} — PBR Dashboard</title>

        {/* Open Props */}
        <link rel="stylesheet" href="https://unpkg.com/open-props" />
        <link rel="stylesheet" href="https://unpkg.com/open-props/normalize.min.css" />

        {/* Local design system */}
        <link rel="stylesheet" href="/css/tokens.css" />
        <link rel="stylesheet" href="/css/layout.css" />
        <link rel="stylesheet" href="/css/status-colors.css" />

        {/* Prevent flash of wrong theme */}
        {html`<script>
          (function() {
            var saved = localStorage.getItem('pbr-theme');
            if (saved) { document.documentElement.setAttribute('data-theme', saved); }
            else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
          })();
        </script>`}
      </head>
      <body>
        <a href="#main-content" class="skip-link">Skip to content</a>

        <nav class="sidebar" aria-label="Main navigation">
          <div class="sidebar__brand">
            <span class="sidebar__brand-name">PBR</span>
            <span class="sidebar__brand-subtitle">Dashboard</span>
          </div>

          <ul class="sidebar__nav" role="list">
            {navItems.map((item) => {
              const isActive = currentView === item.view ||
                (!currentView && item.view === 'home');
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    class={`sidebar__nav-link${isActive ? ' sidebar__nav-link--active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>

          <div class="sidebar__footer">
            <button id="theme-toggle" class="theme-btn" type="button" aria-label="Toggle dark/light theme">
              <span class="theme-btn__icon" aria-hidden="true">◐</span>
            </button>
            <span id="sse-status" data-connected="false" title="Live updates: disconnected" aria-label="Live update status"></span>
          </div>
        </nav>

        <main id="main-content" class="main-content">
          {children}
        </main>

        {/* HTMX */}
        <script src="https://unpkg.com/htmx.org@2" defer></script>
        {/* Alpine.js */}
        <script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
        {/* Local scripts */}
        <script src="/js/theme-toggle.js"></script>
        <script src="/js/sse-client.js" defer></script>
      </body>
    </html>
  );
}

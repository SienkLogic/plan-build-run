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

        {/* Google Fonts: Inter + JetBrains Mono */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />

        {/* Open Props */}
        <link rel="stylesheet" href="https://unpkg.com/open-props" />
        <link rel="stylesheet" href="https://unpkg.com/open-props/normalize.min.css" />

        {/* Local design system */}
        <link rel="stylesheet" href="/css/tokens.css" />
        <link rel="stylesheet" href="/css/layout.css" />
        <link rel="stylesheet" href="/css/status-colors.css" />
        <link rel="stylesheet" href="/css/command-center.css" />
        <link rel="stylesheet" href="/css/explorer.css" />
        <link rel="stylesheet" href="/css/timeline.css" />
        <link rel="stylesheet" href="/css/settings.css" />

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
        <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js" defer></script>
        {html`<script>
          document.addEventListener('DOMContentLoaded', function() {
            function initMermaid() {
              var isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
              mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'neutral' });
            }
            initMermaid();
            new MutationObserver(function(mutations) {
              mutations.forEach(function(m) { if (m.attributeName === 'data-theme') initMermaid(); });
            }).observe(document.documentElement, { attributes: true });
          });
        </script>`}
      </head>
      <body>
        <a href="#main-content" class="skip-link">Skip to content</a>

        <nav class="sidebar" aria-label="Main navigation">
          <button id="sidebar-toggle" class="sidebar__toggle" type="button" aria-label="Toggle navigation">
            <span aria-hidden="true">☰</span>
          </button>
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
          <div class="loading-bar" aria-hidden="true"></div>
          {children}
        </main>

        {/* HTMX */}
        <script src="https://unpkg.com/htmx.org@2" defer></script>
        {/* Alpine.js */}
        <script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
        {/* Local scripts */}
        <script src="/js/theme-toggle.js"></script>
        <script src="/js/sse-client.js" defer></script>
        <script src="/js/sidebar-toggle.js" defer></script>
      </body>
    </html>
  );
}

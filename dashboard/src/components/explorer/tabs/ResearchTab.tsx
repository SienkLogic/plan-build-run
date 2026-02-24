import { type FC } from 'hono/jsx';

export function researchDocHtml(doc: any): string {
  if (!doc) return '<p class="explorer__loading">Document not found.</p>';
  return `<div class="explorer-doc-content">${doc.html}</div>`;
}

function DocItem({ doc, apiPath }: { doc: any; apiPath: string }) {
  return (
    <div class="explorer-item" x-data="{ open: false }">
      <div class="explorer-item__header" x-on:click="open = !open">
        <span class="explorer-item__toggle" x-bind:class="open ? 'explorer-item__toggle--open' : ''">▶</span>
        <span class="explorer-item__title">{doc.title || doc.filename}</span>
        {doc.date && <span class="explorer-item__meta">{doc.date}</span>}
        {doc.confidence && (
          <span class={`explorer-badge explorer-badge--${doc.confidence}`}>{doc.confidence}</span>
        )}
      </div>
      <div class="explorer-item__body" x-show="open" x-cloak>
        <div hx-get={apiPath} hx-trigger="load" hx-swap="innerHTML">
          <span class="explorer__loading">Loading...</span>
        </div>
      </div>
    </div>
  );
}

export function ResearchTab({ researchDocs, codebaseDocs }: { researchDocs: any[]; codebaseDocs: any[] }) {
  return (
    <div>
      <h3 class="explorer-section-title">Research Docs</h3>
      {researchDocs.length === 0 && <p class="explorer__loading">No research docs.</p>}
      <div class="explorer-list">
        {researchDocs.map(doc => (
          <DocItem key={doc.slug} doc={doc} apiPath={`/api/explorer/research/${doc.slug}`} />
        ))}
      </div>
      <h3 class="explorer-section-title" style="margin-top: var(--space-lg)">Codebase Docs</h3>
      {codebaseDocs.length === 0 && <p class="explorer__loading">No codebase docs.</p>}
      <div class="explorer-list">
        {codebaseDocs.map(doc => (
          <DocItem key={doc.slug} doc={doc} apiPath={`/api/explorer/research/${doc.slug}`} />
        ))}
      </div>
    </div>
  );
}

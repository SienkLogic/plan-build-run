export function auditDetailHtml(report: any): string {
  if (!report) return '<p class="explorer__loading">Report not found.</p>';
  return `<div class="explorer-doc-content">${report.html}</div>`;
}

export function AuditsTab({ reports }: { reports: any[] }) {
  return (
    <div class="explorer-list">
      {reports.length === 0 && <p class="explorer__loading">No audit reports.</p>}
      {reports.map(report => (
        <div class="explorer-item" x-data="{ open: false }" key={report.filename}>
          <div class="explorer-item__header" x-on:click="open = !open">
            <span class="explorer-item__toggle"
              x-bind:class="open ? 'explorer-item__toggle--open' : ''">▶</span>
            <span class="explorer-item__title">{report.title || report.filename}</span>
            <span class="explorer-item__meta">{report.date}</span>
          </div>
          <div class="explorer-item__body" x-show="open" x-cloak>
            <div hx-get={`/api/explorer/audits/${encodeURIComponent(report.filename)}`}
              hx-trigger="load"
              hx-swap="innerHTML">
              <span class="explorer__loading">Loading...</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

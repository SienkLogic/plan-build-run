import { html } from 'hono/html';
import { LogFileList } from './LogFileList';
import { LogEntryList } from './LogEntryList';

interface LogViewerProps {
  files: Array<{ name: string; size: number; modified: string }>;
  selectedFile?: string;
  entries?: object[];
  total?: number;
  page?: number;
  pageSize?: number;
  typeFilter?: string;
  q?: string;
  isLatest?: boolean;
}

export function LogViewer({
  files,
  selectedFile,
  entries = [],
  total = 0,
  page = 1,
  pageSize = 50,
  typeFilter = '',
  q = '',
  isLatest = false,
}: LogViewerProps) {
  return (
    <div class="log-viewer-layout">
      <aside class="log-file-sidebar">
        <h2 class="config-section__title">Log Files</h2>
        <LogFileList files={files} selectedFile={selectedFile} />
      </aside>

      <section class="log-main">
        {!selectedFile ? (
          <p class="log-prompt">Select a log file to view entries.</p>
        ) : (
          <>
            <form
              class="log-filters"
              hx-get="/api/settings/logs/entries"
              hx-target="#log-entries"
              hx-swap="outerHTML"
              hx-trigger="change, input delay:300ms from:[name=q]"
            >
              <input type="hidden" name="file" value={selectedFile} />
              <input type="hidden" name="page" value="1" />

              <select name="typeFilter">
                <option value="" selected={typeFilter === ''}>All types</option>
                <option value="hook" selected={typeFilter === 'hook'}>hook</option>
                <option value="task" selected={typeFilter === 'task'}>task</option>
                <option value="agent" selected={typeFilter === 'agent'}>agent</option>
                <option value="error" selected={typeFilter === 'error'}>error</option>
                <option value="info" selected={typeFilter === 'info'}>info</option>
                <option value="warn" selected={typeFilter === 'warn'}>warn</option>
                <option value="debug" selected={typeFilter === 'debug'}>debug</option>
              </select>

              <input
                type="text"
                name="q"
                placeholder="Search entries..."
                value={q || ''}
              />
            </form>

            <div id="log-entries-container">
              <LogEntryList
                entries={entries}
                total={total}
                page={page}
                pageSize={pageSize}
                file={selectedFile}
                typeFilter={typeFilter}
                q={q}
              />
            </div>

            {isLatest && (
              <>
                <div
                  class="log-tail-indicator"
                  x-data={`logTail({ file: '${selectedFile}' })`}
                  x-init="start()"
                >
                  <span class="tail-dot" x-bind:class="{ 'tail-dot--active': connected }"></span>
                  <span x-text="connected ? 'Live' : 'Connecting...'"></span>
                  <span class="tail-count" x-text="newCount + ' new entries'"></span>
                </div>
                <div id="log-tail-entries" class="log-tail-entries"></div>
              </>
            )}
          </>
        )}
      </section>

      {html`<script>
function logTail({ file }) {
  return {
    connected: false,
    newCount: 0,
    es: null,
    start() {
      this.es = new EventSource('/api/settings/logs/tail?file=' + encodeURIComponent(file));
      this.es.addEventListener('log-entry', (e) => {
        this.newCount++;
        const container = document.getElementById('log-tail-entries');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'log-tail-row';
        try {
          const entry = JSON.parse(e.data);
          row.textContent = JSON.stringify(entry);
        } catch { row.textContent = e.data; }
        container.prepend(row);
      });
      this.es.onopen = () => { this.connected = true; };
      this.es.onerror = () => { this.connected = false; };
      window.addEventListener('beforeunload', () => this.stop());
    },
    stop() { if (this.es) this.es.close(); }
  };
}
</script>`}
    </div>
  );
}

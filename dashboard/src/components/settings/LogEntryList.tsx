interface LogEntryListProps {
  entries: object[];
  total: number;
  page: number;
  pageSize: number;
  file: string;
  typeFilter: string;
  q: string;
}

function sanitizeType(t: unknown): string {
  if (typeof t !== 'string' || !t) return 'unknown';
  return t.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

function getTimestamp(entry: Record<string, unknown>): string {
  const raw = entry['timestamp'] ?? entry['ts'] ?? entry['time'];
  if (!raw) return '—';
  try {
    return new Date(raw as string).toLocaleString();
  } catch {
    return String(raw);
  }
}

function getSummary(entry: Record<string, unknown>): string {
  const { type: _type, timestamp: _ts, ts: _ts2, time: _time, ...rest } = entry;
  const str = JSON.stringify(rest);
  return str.length > 120 ? str.slice(0, 117) + '...' : str;
}

export function LogEntryRow({ entry }: { entry: object }) {
  const e = entry as Record<string, unknown>;
  const type = typeof e['type'] === 'string' ? e['type'] : '';
  const badge = sanitizeType(type);
  const timestamp = getTimestamp(e);
  const summary = getSummary(e);

  return (
    <tr>
      <td>
        <span class={`log-badge log-badge--${badge}`}>{type || '—'}</span>
      </td>
      <td>{timestamp}</td>
      <td>{summary}</td>
    </tr>
  );
}

export function LogEntryList({ entries, total, page, pageSize, file, typeFilter, q }: LogEntryListProps) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const encodedFile = encodeURIComponent(file);
  const encodedQ = encodeURIComponent(q);
  const encodedType = encodeURIComponent(typeFilter);

  const baseQuery = `file=${encodedFile}&typeFilter=${encodedType}&q=${encodedQ}`;

  return (
    <div id="log-entries">
      <p class="log-summary">
        {total === 0
          ? 'No entries found.'
          : `Showing ${start}–${end} of ${total} entries`}
      </p>

      {entries.length > 0 && (
        <table class="log-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Timestamp</th>
              <th>Message / Data</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <LogEntryRow key={i} entry={entry} />
            ))}
          </tbody>
        </table>
      )}

      <div class="log-pagination">
        <button
          hx-get={`/api/settings/logs/entries?${baseQuery}&page=${page - 1}`}
          hx-target="#log-entries"
          hx-swap="outerHTML"
          disabled={page <= 1}
        >
          Prev
        </button>
        <span>{page}</span>
        <button
          hx-get={`/api/settings/logs/entries?${baseQuery}&page=${page + 1}`}
          hx-target="#log-entries"
          hx-swap="outerHTML"
          disabled={end >= total}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// Alias used by route for HTMX partial responses
export const LogEntriesFragment = LogEntryList;

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
  const raw = entry['timestamp'] ?? entry['ts'] ?? entry['time'] ?? entry['start'] ?? entry['end'];
  if (!raw) return '—';
  try {
    return new Date(raw as string).toLocaleString();
  } catch {
    return String(raw);
  }
}

function getType(entry: Record<string, unknown>): string {
  if (typeof entry['type'] === 'string' && entry['type']) return entry['type'];
  if (typeof entry['event'] === 'string' && entry['event']) return entry['event'];
  if (typeof entry['hook'] === 'string' && entry['hook']) return 'hook';
  if (typeof entry['action'] === 'string' && entry['action']) return entry['action'];
  return '';
}

function getSummary(entry: Record<string, unknown>): string {
  // Session log entry: has start/end/duration_minutes
  if (entry['duration_minutes'] != null || (entry['start'] && entry['end'])) {
    const parts: string[] = [];
    if (entry['duration_minutes'] != null) parts.push(`Duration: ${entry['duration_minutes']}m`);
    if (entry['reason']) parts.push(`Reason: ${entry['reason']}`);
    if (entry['agents'] != null) parts.push(`Agents: ${entry['agents']}`);
    if (parts.length > 0) return parts.join(', ');
  }

  // Hook log entry: has hook/script fields
  if (entry['hook'] || entry['script']) {
    const parts: string[] = [];
    if (entry['hook']) parts.push(`Hook: ${entry['hook']}`);
    if (entry['script']) parts.push(`Script: ${entry['script']}`);
    if (entry['result']) parts.push(`Result: ${entry['result']}`);
    if (parts.length > 0) return parts.join(', ');
  }

  // Event/action entry
  if (entry['event'] || entry['action']) {
    const parts: string[] = [];
    if (entry['event']) parts.push(`Event: ${entry['event']}`);
    if (entry['action']) parts.push(`Action: ${entry['action']}`);
    if (parts.length > 0) return parts.join(', ');
  }

  // Fallback: first 3 meaningful key-value pairs
  const skip = new Set(['type', 'timestamp', 'ts', 'time', 'start', 'end']);
  const pairs = Object.entries(entry)
    .filter(([k, v]) => !skip.has(k) && v != null && typeof v !== 'object')
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`);
  return pairs.length > 0 ? pairs.join(', ') : '—';
}

export function LogEntryRow({ entry }: { entry: object }) {
  const e = entry as Record<string, unknown>;
  const type = getType(e);
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

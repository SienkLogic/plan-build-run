export function noteDetailHtml(note: any): string {
  if (!note) return '<p class="explorer__loading">Note not found.</p>';
  return `<div class="explorer-doc-content">${note.html}</div>`;
}

export function NotesTab({ notes }: { notes: any[] }) {
  return (
    <div class="explorer-list">
      {notes.length === 0 && <p class="explorer__loading">No notes.</p>}
      {notes.map(note => (
        <div class="explorer-item" x-data="{ open: false }" key={note.filename}>
          <div class="explorer-item__header" x-on:click="open = !open">
            <span class="explorer-item__toggle"
              x-bind:class="open ? 'explorer-item__toggle--open' : ''">▶</span>
            <span class="explorer-item__title">{note.title || note.filename}</span>
            <span class="explorer-item__meta">{note.date}</span>
            {note.promoted && (
              <span class="explorer-badge explorer-badge--complete">promoted</span>
            )}
          </div>
          <div class="explorer-item__body" x-show="open" x-cloak>
            <div hx-get={`/api/explorer/notes/${encodeURIComponent(note.filename.replace(/\.md$/, ''))}`}
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

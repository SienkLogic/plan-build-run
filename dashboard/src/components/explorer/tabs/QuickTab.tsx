export function quickTaskDetailHtml(task: any): string {
  if (!task) return '<p class="explorer__loading">Task not found.</p>';
  const planSection = task.planHtml
    ? `<h4 style="font-size:0.85rem;font-weight:600;color:var(--color-text-dim);margin-bottom:var(--space-xs)">Plan</h4>
       <div class="explorer-doc-content">${task.planHtml}</div>`
    : '';
  const summarySection = task.summaryHtml
    ? `<h4 style="font-size:0.85rem;font-weight:600;color:var(--color-text-dim);margin:var(--space-md) 0 var(--space-xs)">Summary</h4>
       <div class="explorer-doc-content">${task.summaryHtml}</div>`
    : '';
  return planSection + summarySection || '<p class="explorer__loading">No content available.</p>';
}

export function QuickTab({ tasks }: { tasks: any[] }) {
  return (
    <div class="explorer-list">
      {tasks.length === 0 && <p class="explorer__loading">No quick tasks.</p>}
      {tasks.map(task => (
        <div class="explorer-item" x-data="{ open: false }" key={task.id}>
          <div class="explorer-item__header" x-on:click="open = !open">
            <span class="explorer-item__toggle"
              x-bind:class="open ? 'explorer-item__toggle--open' : ''">▶</span>
            <span class="explorer-item__title">{task.title || task.id}</span>
            <span class={`explorer-badge explorer-badge--${task.status === 'done' ? 'complete' : 'pending'}`}>
              {task.status}
            </span>
            <span class="explorer-item__meta">{task.id}</span>
          </div>
          <div class="explorer-item__body" x-show="open" x-cloak>
            <div hx-get={`/api/explorer/quick/${task.id}`}
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

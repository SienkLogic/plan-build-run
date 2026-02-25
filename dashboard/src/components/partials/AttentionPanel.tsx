import type { FC } from 'hono/jsx';

interface AttentionPanelProps {
  todos: Array<{ priority: string }>;
  phases: Array<{ id: number; name?: string; status: string }>;
  currentPhaseId: number;
}

export const AttentionPanel: FC<AttentionPanelProps> = ({
  todos,
  phases,
  currentPhaseId,
}) => {
  const highPriorityCount = todos.filter(
    (t) => t.priority === 'P0' || t.priority === 'P1'
  ).length;

  const stalledPhases = phases.filter(
    (p) => p.id < currentPhaseId && p.status !== 'complete'
  );

  const hasItems = highPriorityCount > 0 || stalledPhases.length > 0;

  return (
    <div class="card attention-panel" id="attention-panel">
      <div class="card__header attention-panel__header">Needs Attention</div>
      {hasItems ? (
        <ul class="attention-panel__list">
          {highPriorityCount > 0 && (
            <li>
              <a href="/todos?priority=P0,P1">
                {highPriorityCount} high-priority todo
                {highPriorityCount !== 1 ? 's' : ''} pending
              </a>
            </li>
          )}
          {stalledPhases.map((p) => (
            <li key={p.id}>
              Phase {p.id} ({p.name || `Phase ${p.id}`}) is incomplete — expected to be done by now
            </li>
          ))}
        </ul>
      ) : (
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </span>
          <p class="empty-state__heading">All clear</p>
          <p class="empty-state__body">No blockers or attention items right now.</p>
        </div>
      )}
    </div>
  );
};

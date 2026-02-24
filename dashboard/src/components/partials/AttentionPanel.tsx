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
        <p class="attention-panel__clear">All clear — nothing needs attention.</p>
      )}
    </div>
  );
};

import type { FC } from 'hono/jsx';

interface CurrentPhaseCardProps {
  currentPhase: {
    id: number;
    name: string;
    status: string;
    planStatus: string;
  };
  lastActivity: {
    date: string;
    description: string;
  };
  nextAction: string | null;
}

export const CurrentPhaseCard: FC<CurrentPhaseCardProps> = ({
  currentPhase,
  lastActivity,
  nextAction,
}) => {
  return (
    <div class="card current-phase-card">
      <div class="card__header">Current Phase</div>
      <h2 class="card__title">
        Phase {currentPhase.id}: {currentPhase.name}
      </h2>
      <span class={`badge status-badge status-badge--${currentPhase.status}`}>
        {currentPhase.status}
      </span>
      <p class="card__meta">Plans: {currentPhase.planStatus}</p>
      <p class="card__meta">
        Last activity: {lastActivity.date || 'N/A'} — {lastActivity.description}
      </p>
      {nextAction && (
        <div class="next-action">
          <span class="next-action__label">Next</span>
          <code class="next-action__cmd">{nextAction}</code>
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            onclick={`navigator.clipboard.writeText('${nextAction}')`}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
};

import type { FC } from 'hono/jsx';

interface PhaseTimelineProps {
  phases: Array<{ id: number; name: string; status: string }>;
  currentPhaseId: number;
}

export const PhaseTimeline: FC<PhaseTimelineProps> = ({ phases, currentPhaseId }) => {
  return (
    <div class="phase-timeline" id="phase-timeline">
      <p class="phase-timeline__label">Phase Timeline</p>
      <div class="phase-timeline__strip">
        {phases.map((phase) => {
          const isCurrent = phase.id === currentPhaseId;
          const cls = [
            'phase-block',
            `phase-block--${phase.status}`,
            isCurrent ? 'phase-block--current' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <a
              key={phase.id}
              href={`/explorer?phase=${phase.id}`}
              class={cls}
              title={`Phase ${phase.id}: ${phase.name}`}
              aria-label={`Phase ${phase.id}: ${phase.name} (${phase.status})`}
            >
              {phase.id}
            </a>
          );
        })}
      </div>
    </div>
  );
};

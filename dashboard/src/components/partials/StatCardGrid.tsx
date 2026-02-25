import type { FC } from 'hono/jsx';

interface StatCardGridProps {
  currentPhase: { id: number; name: string; status: string };
  plansComplete: number;
  plansTotal: number;
  progress: number;
  completedPhases: number;
  totalPhases: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string | any;
  accent?: boolean;
}

const StatCard: FC<StatCardProps> = ({ label, value, sub, accent }) => (
  <div class={`stat-card${accent ? ' stat-card--accent' : ''}`}>
    <span class="stat-card__label">{label}</span>
    <span class="stat-card__value">{value}</span>
    {sub && <span class="stat-card__sub">{sub}</span>}
  </div>
);

export const StatCardGrid: FC<StatCardGridProps> = ({
  currentPhase,
  plansComplete,
  plansTotal,
  progress,
  completedPhases,
  totalPhases,
}) => {
  const plansDisplay = plansTotal > 0 ? `${plansComplete} / ${plansTotal}` : '—';
  const phasesDisplay = `${completedPhases} / ${totalPhases}`;

  return (
    <div class="stat-card-grid">
      <StatCard
        label="Current Phase"
        value={`#${currentPhase.id}`}
        sub={currentPhase.name}
        accent
      />
      <StatCard
        label="Plans"
        value={plansDisplay}
        sub={plansTotal > 0 ? `${plansTotal - plansComplete} remaining` : 'none yet'}
      />
      <StatCard
        label="Phases"
        value={phasesDisplay}
        sub="completed"
      />
      <StatCard
        label="Progress"
        value={`${progress}%`}
        sub={
          <div class="stat-card__mini-bar">
            <div class="stat-card__mini-bar-fill" style={`width:${progress}%`} />
          </div>
        }
      />
    </div>
  );
};

/** @deprecated Replaced by StatCardGrid in Phase 44. Kept for test compatibility. */
import type { FC } from 'hono/jsx';

interface StatusHeaderProps {
  projectName: string;
  currentPhase: {
    id: number;
    total: number;
    name: string;
    status: string;
  };
  completedCount: number;
  totalCount: number;
  progress: number;
}

export const StatusHeader: FC<StatusHeaderProps> = ({
  projectName,
  currentPhase,
  completedCount,
  totalCount,
  progress,
}) => {
  return (
    <div class="status-header">
      <span class="status-header__project">{projectName}</span>
      <span class="status-header__phase">
        Phase {currentPhase.id}: {currentPhase.name}
      </span>
      <span class={`badge status-badge status-badge--${currentPhase.status}`} data-status={currentPhase.status}>
        {currentPhase.status}
      </span>
      <div class="milestone-bar">
        <div class="milestone-bar__track">
          <div
            class="milestone-bar__fill"
            style={`width:${progress}%`}
          />
        </div>
        <span class="milestone-bar__label">
          {completedCount} of {totalCount} phases — {progress}%
        </span>
      </div>
    </div>
  );
};

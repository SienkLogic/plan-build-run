import { useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { Card, ProgressBar } from '../../components/ui/index.js';
import MilestoneDetail from './MilestoneDetail.jsx';

const STATUS_COLORS = {
  active: '#06b6d4',
  'on-track': '#10b981',
  'at-risk': '#f59e0b',
  completed: '#10b981',
  archived: '#64748b',
  blocked: '#ef4444',
};

function statusColor(status) {
  return STATUS_COLORS[status] || '#94a3b8';
}

export default function MilestonesTab({ milestones = [], phases = [], todos = [] }) {
  const { tokens: t } = useTheme();
  const [selectedMilestone, setSelectedMilestone] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  if (selectedMilestone) {
    return (
      <MilestoneDetail
        milestone={selectedMilestone}
        phases={phases}
        todos={todos}
        onBack={() => setSelectedMilestone(null)}
      />
    );
  }

  const activeMilestones = milestones.filter((m) => !m.archived);
  const archivedMilestones = milestones.filter((m) => m.archived);
  const displayed = showArchived ? archivedMilestones : activeMilestones;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setShowArchived(false)}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${!showArchived ? t.accent : t.border}`,
            background: !showArchived ? `${t.accent}18` : 'transparent',
            color: !showArchived ? t.accent : t.textMuted,
            fontFamily: FONTS.mono,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Active ({activeMilestones.length})
        </button>
        <button
          onClick={() => setShowArchived(true)}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${showArchived ? t.accent : t.border}`,
            background: showArchived ? `${t.accent}18` : 'transparent',
            color: showArchived ? t.accent : t.textMuted,
            fontFamily: FONTS.mono,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Archived ({archivedMilestones.length})
        </button>
      </div>

      {displayed.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            color: t.textMuted,
            fontFamily: FONTS.sans,
            fontSize: 13,
          }}
        >
          No {showArchived ? 'archived' : 'active'} milestones.
        </div>
      )}

      {displayed.map((ms) => {
        const progress = ms.progress != null ? ms.progress : 0;
        return (
          <Card
            key={ms.id}
            onClick={() => setSelectedMilestone(ms)}
            style={{
              borderLeft: `3px solid ${statusColor(ms.status)}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: t.text,
                  fontFamily: FONTS.sans,
                }}
              >
                {ms.title}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: statusColor(ms.status),
                  fontFamily: FONTS.mono,
                }}
              >
                {progress}%
              </span>
            </div>
            {ms.description && (
              <div
                style={{
                  fontSize: 11,
                  color: t.textMuted,
                  fontFamily: FONTS.sans,
                  marginBottom: 8,
                }}
              >
                {ms.description}
              </div>
            )}
            <ProgressBar
              pct={progress}
              color={statusColor(ms.status)}
            />
          </Card>
        );
      })}
    </div>
  );
}

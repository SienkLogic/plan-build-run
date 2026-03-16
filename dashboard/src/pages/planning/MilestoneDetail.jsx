import { useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import {
  BackButton,
  Card,
  KeyValue,
  ProgressBar,
  Badge,
  SectionTitle,
} from '../../components/ui/index.js';

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

export default function MilestoneDetail({ milestone, phases = [], todos = [], onBack }) {
  const { tokens: t } = useTheme();
  const [expandedPhase, setExpandedPhase] = useState(null);

  const linkedPhases = phases.filter((p) =>
    milestone.phases?.includes(p.id)
  );

  const relatedTodos = todos.filter((todo) =>
    linkedPhases.some((p) => todo.phase === p.id)
  );

  const progress =
    milestone.progress != null
      ? milestone.progress
      : Math.round(
          (linkedPhases.filter((p) => p.status === 'completed').length /
            Math.max(linkedPhases.length, 1)) *
            100
        );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackButton onClick={onBack} />

      <Card>
        {milestone.archived && (
          <div
            style={{
              background: `${t.warning}18`,
              border: `1px solid ${t.warning}40`,
              borderRadius: 6,
              padding: '6px 12px',
              marginBottom: 12,
              fontSize: 11,
              fontFamily: FONTS.mono,
              color: t.warning,
            }}
          >
            Archived Milestone
          </div>
        )}

        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: 18,
            fontWeight: 700,
            color: t.text,
            fontFamily: FONTS.sans,
          }}
        >
          {milestone.title}
        </h2>

        {milestone.description && (
          <p
            style={{
              margin: '0 0 16px 0',
              fontSize: 12,
              color: t.textMuted,
              fontFamily: FONTS.sans,
              lineHeight: 1.5,
            }}
          >
            {milestone.description}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <KeyValue label="Progress" value={`${progress}%`} />
          <KeyValue label="Target" value={milestone.target || 'N/A'} />
          <KeyValue
            label="Status"
            value={milestone.status || 'unknown'}
            color={statusColor(milestone.status)}
          />
          <KeyValue
            label="Depends On"
            value={
              milestone.dependsOn?.length
                ? milestone.dependsOn.join(', ')
                : 'None'
            }
          />
        </div>

        <ProgressBar pct={progress} color={statusColor(milestone.status)} />
      </Card>

      {milestone.acceptance?.length > 0 && (
        <Card>
          <SectionTitle>Acceptance Criteria</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {milestone.acceptance.map((criterion, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontFamily: FONTS.sans,
                  color: t.text,
                }}
              >
                <span style={{ color: t.success, fontSize: 14 }}>
                  {'\u25CF'}
                </span>
                {criterion}
              </div>
            ))}
          </div>
        </Card>
      )}

      {milestone.risks?.length > 0 && (
        <Card>
          <SectionTitle>Risks</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {milestone.risks.map((risk, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontFamily: FONTS.sans,
                  color: t.text,
                }}
              >
                <span style={{ color: t.warning, fontSize: 14 }}>
                  {'\u26A0'}
                </span>
                {risk}
              </div>
            ))}
          </div>
        </Card>
      )}

      {linkedPhases.length > 0 && (
        <div>
          <SectionTitle sub={`${linkedPhases.length} phase(s)`}>
            Linked Phases
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linkedPhases.map((phase) => {
              const isExpanded = expandedPhase === phase.id;
              return (
                <Card
                  key={phase.id}
                  onClick={() =>
                    setExpandedPhase(isExpanded ? null : phase.id)
                  }
                  style={{
                    borderLeft: `3px solid ${statusColor(phase.status)}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: t.text,
                        fontFamily: FONTS.sans,
                      }}
                    >
                      {phase.title}
                    </div>
                    <Badge color={statusColor(phase.status)}>
                      {phase.status}
                    </Badge>
                  </div>
                  {isExpanded && phase.tasks?.length > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {phase.tasks.map((task, ti) => (
                        <div
                          key={ti}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            fontFamily: FONTS.mono,
                            color: task.done ? t.textMuted : t.text,
                          }}
                        >
                          <span
                            style={{
                              color: task.done ? t.success : t.textDim,
                            }}
                          >
                            {task.done ? '\u2713' : '\u25CB'}
                          </span>
                          <span
                            style={{
                              textDecoration: task.done
                                ? 'line-through'
                                : 'none',
                            }}
                          >
                            {task.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {relatedTodos.length > 0 && (
        <div>
          <SectionTitle sub={`${relatedTodos.length} todo(s)`}>
            Related Todos
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {relatedTodos.map((todo) => {
              const priorityColor =
                todo.priority === 'high'
                  ? t.error
                  : todo.priority === 'medium'
                    ? t.warning
                    : t.textMuted;
              return (
                <Card
                  key={todo.id}
                  style={{ borderLeft: `3px solid ${priorityColor}` }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: t.text,
                        fontFamily: FONTS.sans,
                      }}
                    >
                      {todo.title}
                    </span>
                    <Badge color={priorityColor}>{todo.priority}</Badge>
                  </div>
                  {todo.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: t.textMuted,
                        fontFamily: FONTS.sans,
                      }}
                    >
                      {todo.description}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

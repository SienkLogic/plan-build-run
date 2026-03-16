import { useState } from 'react';
import { Card, Badge, ProgressBar, BackButton, KeyValue, StatusDot, StatusSymbol, SectionTitle } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { apiPut } from '../../lib/api.js';
import useToast from '../../hooks/useToast.jsx';

export default function PhasesTab({ phases = [], todos = [] }) {
  const { tokens } = useTheme();
  const { addToast } = useToast();
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [taskOverrides, setTaskOverrides] = useState({});

  const statusColors = {
    done: tokens.success,
    'in-progress': tokens.warning,
    todo: tokens.textDim,
  };

  const priorityColors = {
    high: tokens.error,
    medium: tokens.warning,
    low: tokens.success,
  };

  const getTaskStatus = (task, index) => {
    const overrideKey = `${selectedPhase?.id}-${index}`;
    if (taskOverrides[overrideKey] !== undefined) {
      return taskOverrides[overrideKey];
    }
    return task.status;
  };

  const statusIcon = (status) => {
    if (status === 'done') return '\u2713';
    if (status === 'in-progress') return '\u25D1';
    return '\u25CB';
  };

  const toggleTask = async (e, task, index) => {
    e.stopPropagation();
    const currentStatus = getTaskStatus(task, index);
    const isDone = currentStatus === 'done';
    const newStatus = isDone ? 'todo' : 'done';
    const overrideKey = `${selectedPhase.id}-${index}`;

    // Optimistic update
    setTaskOverrides((prev) => ({ ...prev, [overrideKey]: newStatus }));

    try {
      await apiPut(`/api/planning/phases/${selectedPhase.slug || selectedPhase.id}/tasks/${index}`, {
        completed: !isDone,
      });
      addToast('success', isDone ? 'Task unmarked' : 'Task completed');
    } catch (err) {
      // Revert optimistic update
      setTaskOverrides((prev) => {
        const next = { ...prev };
        delete next[overrideKey];
        return next;
      });
      addToast('error', 'Failed to update task: ' + err.message);
    }
  };

  if (selectedPhase) {
    // Recalculate completed count with overrides
    const taskStatuses = selectedPhase.taskList.map((task, i) => getTaskStatus(task, i));
    const completedCount = taskStatuses.filter((s) => s === 'done').length;
    const totalTasks = selectedPhase.tasks || selectedPhase.taskList.length;
    const pct = Math.round((completedCount / totalTasks) * 100);
    const relatedTodos = todos.filter((t) => t.phase === selectedPhase.id);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BackButton onClick={() => setSelectedPhase(null)} />
        <Card style={{ borderTop: `3px solid ${statusColors[selectedPhase.status]}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: FONTS.sans, color: tokens.text }}>
            {selectedPhase.title}
          </div>
          <div style={{ fontSize: 11, color: tokens.textMuted, fontFamily: FONTS.sans, marginBottom: 10 }}>
            {selectedPhase.description}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
            <KeyValue label="Milestone" value={selectedPhase.milestone} color={tokens.accent} />
            <KeyValue label="Tasks" value={`${completedCount}/${totalTasks}`} />
            <KeyValue label="Progress" value={`${pct}%`} color={tokens.accent} />
            <KeyValue label="Status" value={selectedPhase.status} />
          </div>
          <ProgressBar pct={pct} color={statusColors[selectedPhase.status]} height={8} />
        </Card>

        <SectionTitle>Task List</SectionTitle>
        {selectedPhase.taskList.map((task, index) => {
          const taskStatus = getTaskStatus(task, index);
          const isDone = taskStatus === 'done';

          return (
            <div
              key={task.id}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: tokens.surfaceAlt,
                borderRadius: 6,
              }}
            >
              <span
                onClick={(e) => toggleTask(e, task, index)}
                role="checkbox"
                aria-checked={isDone}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') toggleTask(e, task, index);
                }}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: `${statusColors[taskStatus]}18`,
                  color: statusColors[taskStatus],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                  cursor: 'pointer',
                  border: isDone ? 'none' : `1.5px solid ${statusColors[taskStatus]}`,
                }}
                title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
              >
                {statusIcon(taskStatus)}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontFamily: FONTS.sans,
                  color: isDone ? tokens.textMuted : tokens.text,
                  textDecoration: isDone ? 'line-through' : 'none',
                }}
              >
                {task.title}
              </span>
              <StatusDot status={taskStatus} />
            </div>
          );
        })}

        {relatedTodos.length > 0 && (
          <>
            <SectionTitle>Related Todos</SectionTitle>
            {relatedTodos.map((todo) => (
              <Card
                key={todo.id}
                style={{
                  padding: 10,
                  borderLeft: `3px solid ${priorityColors[todo.priority]}`,
                  borderRadius: '4px 10px 10px 4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, fontFamily: FONTS.sans, color: tokens.text }}>
                    {todo.title}
                  </span>
                  <Badge color={priorityColors[todo.priority]}>{todo.priority}</Badge>
                  <StatusDot status={todo.status} />
                </div>
                {todo.notes && (
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: tokens.textMuted, marginTop: 4 }}>
                    {todo.notes}
                  </div>
                )}
                {todo.relatedAgents && todo.relatedAgents.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {todo.relatedAgents.map((agent) => (
                      <Badge key={agent} color={tokens.info}>{agent}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {phases.map((phase) => {
        const pct = phase.tasks > 0 ? Math.round((phase.completed / phase.tasks) * 100) : 0;
        return (
          <Card key={phase.id} onClick={() => setSelectedPhase(phase)} style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge color={statusColors[phase.status]}>{phase.id}</Badge>
                <StatusSymbol status={phase.status === 'done' ? 'done' : phase.status === 'in-progress' ? 'active' : 'pending'} size={14} />
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: FONTS.sans, color: tokens.text }}>
                  {phase.title}
                </span>
                <Badge color={tokens.textMuted}>{phase.milestone}</Badge>
              </div>
              <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: tokens.accent }}>
                {pct}%
              </span>
            </div>
            <ProgressBar pct={pct} color={statusColors[phase.status]} />
          </Card>
        );
      })}
    </div>
  );
}

import { useState } from 'react';
import { Card, Badge, StatusDot, KeyValue, CodeBlock, useConfirm } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { apiPost, apiPut, apiDelete } from '../../lib/api.js';
import useToast from '../../hooks/useToast.jsx';

export default function TodosTab({ todos = [], onRefresh }) {
  const { tokens } = useTheme();
  const { addToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [expandedId, setExpandedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newPhase, setNewPhase] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const priorityColors = {
    high: tokens.error,
    medium: tokens.warning,
    low: tokens.success,
  };

  const statusColors = {
    done: tokens.success,
    'in-progress': tokens.warning,
    todo: tokens.textDim,
    pending: tokens.textDim,
  };

  const statusIcon = (status) => {
    if (status === 'done') return '\u2713';
    if (status === 'in-progress') return '\u25D1';
    return '\u25CB';
  };

  const btnStyle = (bg, color) => ({
    background: bg,
    border: 'none',
    borderRadius: 6,
    padding: '4px 12px',
    fontFamily: FONTS.mono,
    fontSize: 11,
    color,
    cursor: 'pointer',
  });

  const inputStyle = {
    width: '100%',
    background: tokens.surfaceAlt,
    border: `1px solid ${tokens.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: tokens.text,
    boxSizing: 'border-box',
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      addToast('error', 'Title is required');
      return;
    }
    try {
      await apiPost('/api/planning/todos', {
        title: newTitle.trim(),
        priority: newPriority,
        phase: newPhase.trim(),
        notes: newNotes,
      });
      addToast('success', 'Todo added');
      setCreating(false);
      setNewTitle('');
      setNewPriority('medium');
      setNewPhase('');
      setNewNotes('');
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast('error', 'Failed to add todo: ' + err.message);
    }
  };

  const handleToggle = async (e, todo) => {
    e.stopPropagation();
    try {
      await apiPut(`/api/planning/todos/${todo.id}/toggle`, {
        currentStatus: todo.status,
      });
      addToast('success', todo.status === 'done' ? 'Marked as pending' : 'Marked as done');
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast('error', 'Failed to toggle status: ' + err.message);
    }
  };

  const handleDelete = async (e, todo) => {
    e.stopPropagation();
    if (!(await confirm('Delete Todo', 'Are you sure you want to delete this todo?'))) return;
    try {
      await apiDelete(`/api/planning/todos/${todo.id}`, { status: todo.status });
      addToast('success', 'Todo deleted');
      if (expandedId === todo.id) setExpandedId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast('error', 'Failed to delete todo: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btnStyle(tokens.accent, tokens.bg)} onClick={() => setCreating(true)}>
          Add Todo
        </button>
      </div>

      {creating && (
        <Card style={{ padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.sans, color: tokens.text, marginBottom: 8 }}>
            New Todo
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              style={inputStyle}
              placeholder="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ ...inputStyle, width: 'auto', flex: 1 }}
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                style={{ ...inputStyle, flex: 2 }}
                placeholder="Phase"
                value={newPhase}
                onChange={(e) => setNewPhase(e.target.value)}
              />
            </div>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={3}
              placeholder="Notes"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                style={btnStyle('transparent', tokens.textMuted)}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button style={btnStyle(tokens.accent, tokens.bg)} onClick={handleCreate}>
                Save
              </button>
            </div>
          </div>
        </Card>
      )}

      {todos.map((todo) => {
        const isExpanded = expandedId === todo.id;
        return (
          <Card
            key={todo.id}
            onClick={() => setExpandedId(isExpanded ? null : todo.id)}
            style={{
              padding: 10,
              borderLeft: `3px solid ${priorityColors[todo.priority]}`,
              borderRadius: '4px 10px 10px 4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                onClick={(e) => handleToggle(e, todo)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: `${statusColors[todo.status]}18`,
                  color: statusColors[todo.status],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
                title="Toggle status"
              >
                {statusIcon(todo.status)}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontFamily: FONTS.sans,
                  color: todo.status === 'done' ? tokens.textMuted : tokens.text,
                  textDecoration: todo.status === 'done' ? 'line-through' : 'none',
                }}
              >
                {todo.title}
              </span>
              <Badge color={priorityColors[todo.priority]}>{todo.priority}</Badge>
              <Badge color={tokens.textMuted}>{todo.phase}</Badge>
              <button
                onClick={(e) => handleDelete(e, todo)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: tokens.textMuted,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 4px',
                  lineHeight: 1,
                }}
                title="Delete todo"
              >
                x
              </button>
              <StatusDot status={todo.status} />
            </div>

            {isExpanded && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px solid ${tokens.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <KeyValue label="Assignee" value={todo.assignee || 'Unassigned'} color={tokens.accent} />
                  <KeyValue label="Phase" value={todo.phase} />
                </div>

                {todo.notes && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontFamily: FONTS.mono,
                        color: tokens.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      Notes
                    </div>
                    <CodeBlock>{todo.notes}</CodeBlock>
                  </div>
                )}

                {todo.relatedAgents && todo.relatedAgents.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontFamily: FONTS.mono,
                        color: tokens.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      Related Agents
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {todo.relatedAgents.map((agent) => (
                        <Badge key={agent} color={tokens.info}>{agent}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
      <ConfirmDialog />
    </div>
  );
}

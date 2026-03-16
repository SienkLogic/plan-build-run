import { useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { Card, Badge, CodeBlock, useConfirm } from '../../components/ui/index.js';
import { apiPost, apiPut, apiDelete } from '../../lib/api.js';
import useToast from '../../hooks/useToast.jsx';

export default function NotesTab({ notes = [], onRefresh }) {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditTags((note.tags || []).join(', '));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
  };

  const startCreate = () => {
    setCreating(true);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
  };

  const handleSaveNew = async () => {
    if (!editTitle.trim()) {
      addToast('error', 'Title is required');
      return;
    }
    try {
      await apiPost('/api/planning/notes', {
        title: editTitle.trim(),
        content: editContent,
        tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      addToast('success', 'Note created');
      setCreating(false);
      setEditTitle('');
      setEditContent('');
      setEditTags('');
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast('error', 'Failed to create note: ' + err.message);
    }
  };

  const handleSaveEdit = async (noteId) => {
    if (!editTitle.trim()) {
      addToast('error', 'Title is required');
      return;
    }
    try {
      await apiPut(`/api/planning/notes/${noteId}`, {
        title: editTitle.trim(),
        content: editContent,
        tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      addToast('success', 'Note updated');
      cancelEdit();
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast('error', 'Failed to update note: ' + err.message);
    }
  };

  const handleDelete = async (noteId) => {
    if (!(await confirm('Delete Note', 'Are you sure you want to delete this note?'))) return;
    try {
      await apiDelete(`/api/planning/notes/${noteId}`);
      addToast('success', 'Note deleted');
      if (expandedId === noteId) setExpandedId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast('error', 'Failed to delete note: ' + err.message);
    }
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
    background: t.surfaceAlt,
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: t.text,
    boxSizing: 'border-box',
  };

  const renderForm = (onSave, onCancel) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <input
        style={inputStyle}
        placeholder="Title"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
      />
      <textarea
        style={{ ...inputStyle, resize: 'vertical' }}
        rows={6}
        placeholder="Content"
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
      />
      <input
        style={inputStyle}
        placeholder="Tags (comma-separated)"
        value={editTags}
        onChange={(e) => setEditTags(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={btnStyle('transparent', t.textMuted)} onClick={onCancel}>
          Cancel
        </button>
        <button style={btnStyle(t.accent, t.bg)} onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btnStyle(t.accent, t.bg)} onClick={startCreate}>
          New Note
        </button>
      </div>

      {creating && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.sans, color: t.text }}>
            Create Note
          </div>
          {renderForm(handleSaveNew, () => setCreating(false))}
        </Card>
      )}

      {notes.map((note) => {
        const isExpanded = expandedId === note.id;
        const isEditing = editingId === note.id;

        return (
          <Card
            key={note.id}
            onClick={() => {
              if (!isEditing) setExpandedId(isExpanded ? null : note.id);
            }}
            style={{ cursor: isEditing ? 'default' : 'pointer' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: t.text,
                  }}
                >
                  {note.title}
                </div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 10,
                    color: t.textMuted,
                    marginTop: 4,
                  }}
                >
                  {note.created}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(note.tags || []).map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            </div>

            {isExpanded && !isEditing && (
              <div style={{ marginTop: 12 }}>
                <CodeBlock>{note.content}</CodeBlock>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                  <button
                    style={btnStyle(t.accent, t.bg)}
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(note);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    style={btnStyle(t.error, '#fff')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(note.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {isEditing && (
              <div onClick={(e) => e.stopPropagation()}>
                {renderForm(() => handleSaveEdit(note.id), cancelEdit)}
              </div>
            )}
          </Card>
        );
      })}
      <ConfirmDialog />
    </div>
  );
}

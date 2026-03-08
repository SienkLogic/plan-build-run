import { useState, useEffect } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { Card } from '../../components/ui/index.js';
import { apiFetch, apiPutWithHeaders } from '../../lib/api.js';
import useToast from '../../hooks/useToast.jsx';

/**
 * Simple markdown-to-React renderer.
 * Handles headers, bullets, fenced code blocks, and paragraphs.
 */
function renderMarkdown(content) {
  const lines = content.split('\n');
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={key++}
          style={{
            background: 'rgba(0,0,0,0.15)',
            borderRadius: 6,
            padding: '10px 14px',
            fontFamily: FONTS.mono,
            fontSize: 12,
            overflowX: 'auto',
            margin: '6px 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 4px' }}>
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} style={{ fontSize: 17, fontWeight: 700, margin: '14px 0 4px' }}>
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} style={{ fontSize: 20, fontWeight: 700, margin: '16px 0 6px' }}>
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }

    // Bullet list items
    if (line.startsWith('- ')) {
      elements.push(
        <div key={key++} style={{ paddingLeft: 16, margin: '2px 0', fontSize: 13 }}>
          {'\u2022'} {line.slice(2)}
        </div>
      );
      i++;
      continue;
    }

    // Empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={key++} style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.5 }}>
        {line}
      </p>
    );
    i++;
  }

  return elements;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

export default function FilesTab({ onRefresh }) {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/planning/files');
      setFiles(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleSelectFile = async (name) => {
    try {
      const data = await apiFetch(`/api/planning/files/${name}`);
      setSelectedFile(data);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError('Failed to load file: ' + err.message);
    }
  };

  const handleEdit = () => {
    setEditing(true);
    setEditContent(selectedFile.content);
  };

  const handleCancel = () => {
    setEditing(false);
    setConflict(null);
  };

  const handleReload = async () => {
    if (!selectedFile) return;
    try {
      const data = await apiFetch(`/api/planning/files/${selectedFile.name}`);
      setSelectedFile(data);
      setEditContent(data.content);
      setConflict(null);
      setEditing(false);
    } catch (err) {
      addToast('error', 'Reload failed: ' + err.message);
    }
  };

  const handleForceSave = () => {
    setConflict(null);
    handleSave(true);
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (!saving) handleSave();
    }
  };

  const handleSave = async (forceSave) => {
    if (!selectedFile) return;
    // Store previous state for rollback
    const previousContent = selectedFile.content;
    const previousMtime = selectedFile.mtimeMs;
    try {
      setSaving(true);
      // Optimistic update: show new content immediately
      setSelectedFile({ ...selectedFile, content: editContent });
      setEditing(false);

      const headers = {};
      if (!forceSave && previousMtime) {
        headers['If-Unmodified-Since'] = String(previousMtime);
      }
      const result = await apiPutWithHeaders(
        `/api/planning/files/${selectedFile.name}`,
        { content: editContent },
        headers,
      );

      if (result.conflict) {
        // Conflict detected -- rollback content and show conflict UI
        setSelectedFile({ ...selectedFile, content: previousContent, mtimeMs: previousMtime });
        setConflict({ currentMtime: result.currentMtime });
        setEditing(true);
        setEditContent(editContent); // preserve user edits
        return;
      }

      // Success
      setSelectedFile({ ...selectedFile, content: editContent, mtimeMs: result.mtimeMs });
      setConflict(null);
      addToast('success', `Saved ${selectedFile.name}`);
      fetchFiles(); // refresh file list for updated mtime/size
      if (onRefresh) onRefresh();
    } catch (err) {
      // Error -- rollback and re-enter edit mode
      setSelectedFile({ ...selectedFile, content: previousContent, mtimeMs: previousMtime });
      setEditing(true);
      setEditContent(editContent); // preserve user edits
      addToast('error', 'Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const btnStyle = (bg, color) => ({
    background: bg,
    border: 'none',
    borderRadius: 6,
    padding: '5px 14px',
    fontFamily: FONTS.mono,
    fontSize: 11,
    color,
    cursor: 'pointer',
  });

  if (loading) {
    return <Card><div style={{ color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>Loading files...</div></Card>;
  }

  if (error && files.length === 0) {
    return <Card><div style={{ color: t.error, fontFamily: FONTS.mono, fontSize: 12 }}>{error}</div></Card>;
  }

  return (
    <div style={{ display: 'flex', gap: 12, minHeight: 400 }}>
      {/* File list panel */}
      <div
        style={{
          width: 250,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 12,
            fontWeight: 600,
            color: t.textMuted,
            padding: '4px 8px',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          .planning/ files
        </div>
        {files.length === 0 && (
          <div style={{ color: t.textMuted, fontFamily: FONTS.mono, fontSize: 11, padding: '8px 10px' }}>
            No .md files found
          </div>
        )}
        {files.map((file) => {
          const isSelected = selectedFile && selectedFile.name === file.name;
          return (
            <div
              key={file.name}
              onClick={() => handleSelectFile(file.name)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: isSelected ? t.accent + '22' : 'transparent',
                borderLeft: isSelected ? `3px solid ${t.accent}` : '3px solid transparent',
                transition: 'background 0.15s',
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? t.accent : t.text,
                }}
              >
                {file.name}
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  color: t.textMuted,
                  marginTop: 2,
                }}
              >
                {formatSize(file.size)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Content panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedFile ? (
          <Card>
            <div
              style={{
                color: t.textMuted,
                fontFamily: FONTS.sans,
                fontSize: 13,
                textAlign: 'center',
                padding: 40,
              }}
            >
              Select a file to view its contents
            </div>
          </Card>
        ) : editing ? (
          <Card>
            {conflict && (
              <div
                style={{
                  background: t.warning ? t.warning + '22' : '#f59e0b22',
                  border: `1px solid ${t.warning || '#f59e0b'}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: t.text }}>
                  This file was modified externally since you last loaded it.
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btnStyle('transparent', t.textMuted)} onClick={handleReload}>
                    Reload
                  </button>
                  <button style={btnStyle(t.warning || '#f59e0b', '#fff')} onClick={handleForceSave}>
                    Force Save
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.text }}>
                Editing: {selectedFile.name}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle('transparent', t.textMuted)} onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
                <button style={btnStyle(t.accent, t.bg)} onClick={() => handleSave()} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                minHeight: 400,
                background: t.surfaceAlt,
                border: `1px solid ${t.border}`,
                borderRadius: 6,
                padding: '10px 14px',
                fontFamily: FONTS.mono,
                fontSize: 12,
                color: t.text,
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: 1.6,
              }}
            />
          </Card>
        ) : (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.text }}>
                {selectedFile.name}
              </div>
              <button style={btnStyle(t.accent, t.bg)} onClick={handleEdit}>
                Edit
              </button>
            </div>
            <div style={{ color: t.text, fontFamily: FONTS.sans }}>
              {renderMarkdown(selectedFile.content)}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

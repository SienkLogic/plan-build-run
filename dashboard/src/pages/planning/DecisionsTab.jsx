import { useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { Card, Badge, SectionTitle } from '../../components/ui/index.js';
import { apiPost } from '../../lib/api.js';
import useToast from '../../hooks/useToast.jsx';

export default function DecisionsTab({ decisions, onCreateDecision }) {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [phase, setPhase] = useState('');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const items = decisions || [];
  const filtered = filter
    ? items.filter(
        (d) =>
          d.text.toLowerCase().includes(filter.toLowerCase()) ||
          d.phase.toLowerCase().includes(filter.toLowerCase())
      )
    : items;

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await apiPost('/api/planning/decisions', { phase: phase || 'General', text });
      setPhase('');
      setText('');
      setShowForm(false);
      if (onCreateDecision) onCreateDecision();
    } catch (err) {
      addToast('error', 'Failed to save decision: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setPhase('');
    setText('');
    setShowForm(false);
  }

  const inputStyle = {
    fontFamily: FONTS.mono,
    fontSize: 12,
    padding: '6px 10px',
    background: t.surfaceAlt,
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    color: t.text,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const btnStyle = (bg) => ({
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    background: bg,
    color: '#fff',
    opacity: saving ? 0.6 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SectionTitle>Decisions ({filtered.length})</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Filter decisions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
          />
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={btnStyle(t.accent)}
            >
              + Add Decision
            </button>
          )}
        </div>
      </div>

      {/* Inline create form */}
      {showForm && (
        <Card style={{ border: `1px solid ${t.accent}44` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="Phase (e.g. Phase 01)"
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="Decision text..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={btnStyle(t.success)}>
                Save
              </button>
              <button onClick={handleCancel} style={btnStyle(t.textDim)}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Decision list */}
      {filtered.length === 0 && (
        <Card>
          <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: t.textMuted, textAlign: 'center', padding: 20 }}>
            {items.length === 0 ? 'No decisions recorded yet.' : 'No decisions match filter.'}
          </div>
        </Card>
      )}

      {filtered.map((d) => (
        <Card key={d.id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Badge color={t.plan}>{d.phase}</Badge>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: t.text, lineHeight: 1.4 }}>
                {d.text}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textDim, marginTop: 4 }}>
                {d.created}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

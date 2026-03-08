import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { StatusDot } from '../ui/index.js';

export default function ProjectSwitcher({ collapsed, activeProject, projects, onSwitch }) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = projects.find((p) => p.id === activeProject) || projects[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (collapsed) {
    return (
      <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: t.surfaceAlt,
            border: `1px solid ${t.border}`,
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {'\u25C6'}
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', padding: '8px 12px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: t.surfaceAlt,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: 8,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: t.text,
              fontFamily: FONTS.sans,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {current.name}
          </div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textDim }}>
            {current.branch}
          </div>
        </div>
        <StatusDot status={current.status} />
        <span style={{ color: t.textDim, fontSize: 10 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 12,
            right: 12,
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: `0 8px 24px ${t.shadow}`,
            zIndex: 50,
            maxHeight: 260,
            overflowY: 'auto',
            marginTop: 4,
          }}
        >
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => {
                onSwitch(proj.id);
                setOpen(false);
              }}
              style={{
                padding: 8,
                cursor: 'pointer',
                background: 'transparent',
                borderLeft: proj.id === activeProject ? `3px solid ${t.accent}` : '3px solid transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = t.surfaceAlt; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: t.text,
                  fontFamily: FONTS.sans,
                  marginBottom: 2,
                }}
              >
                {proj.name}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textDim, marginBottom: 4 }}>
                {proj.repo}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 10,
                    color: t.accent,
                    background: `${t.accent}18`,
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  {proj.branch}
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textMuted }}>
                  {proj.sessions} sessions
                </span>
                <StatusDot status={proj.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

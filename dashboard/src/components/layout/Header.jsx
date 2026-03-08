import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function Header({ title, activeProject }) {
  const { themeName, tokens: t, toggleTheme } = useTheme();

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Left: page title */}
      <div
        style={{
          fontFamily: FONTS.sans,
          fontSize: 15,
          fontWeight: 700,
          color: t.text,
        }}
      >
        {title}
      </div>

      {/* Right: project badge, theme toggle, status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Project badge */}
        {activeProject && (
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 10,
              background: t.surfaceAlt,
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: '3px 8px',
              color: t.accent,
            }}
          >
            {activeProject.name}
          </span>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: t.surfaceAlt,
            border: `1px solid ${t.border}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: t.text,
            padding: 0,
          }}
          aria-label={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
        >
          {themeName === 'dark' ? '\u2600' : '\uD83C\uDF19'}
        </button>

        {/* Status indicator */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: t.success,
            boxShadow: `0 0 8px ${t.success}`,
            animation: 'pulse 2s infinite',
          }}
        />
      </div>
    </div>
  );
}

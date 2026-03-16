import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function TabBar({ tabs, active, onChange, theme }) {
  const ctx = useTheme();
  const t = theme || (ctx && ctx.tokens);

  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        background: t.surfaceAlt,
        borderRadius: 8,
        padding: 3,
        flexWrap: 'wrap',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '5px 11px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: active === tab ? t.surface : 'transparent',
            color: active === tab ? t.accent : t.textMuted,
            fontFamily: FONTS.mono,
            fontSize: 11,
            fontWeight: active === tab ? 600 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

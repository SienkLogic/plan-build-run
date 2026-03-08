import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function ChartTooltip({ active, payload, label, theme }) {
  const ctx = useTheme();
  const t = theme || (ctx && ctx.tokens);

  if (!active || !payload) return null;

  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: `0 8px 24px ${t.shadow}`,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 10,
          color: t.textMuted,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      {payload.map((entry, i) => (
        <div
          key={i}
          style={{
            fontFamily: FONTS.mono,
            fontSize: 11,
            display: 'flex',
            flexDirection: 'row',
            gap: 6,
            color: entry.color || t.text,
          }}
        >
          <span>{entry.name}:</span>
          <span style={{ fontWeight: 600 }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

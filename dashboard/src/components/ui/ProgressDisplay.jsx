import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import ProgressBar from './ProgressBar.jsx';

export default function ProgressDisplay({ label, value, total, sub, color }) {
  const { tokens: t } = useTheme();
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const barColor = color || t.accent;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 16px',
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: t.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: t.text, fontWeight: 700 }}>
          {value.toLocaleString()} / {total.toLocaleString()} ({pct}%)
        </span>
      </div>
      <ProgressBar pct={pct} color={barColor} />
      {sub && (
        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textDim }}>
          {sub}
        </span>
      )}
    </div>
  );
}

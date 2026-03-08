import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import Card from './Card.jsx';

export default function MetricCard({ label, value, sub, color, theme }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;

  return (
    <Card theme={t} style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${color || t.accent}, transparent)`,
        }}
      />
      <div
        style={{
          fontSize: 10,
          color: t.textMuted,
          fontFamily: FONTS.mono,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: t.text,
          fontFamily: FONTS.sans,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: t.textMuted,
            marginTop: 4,
            fontFamily: FONTS.mono,
          }}
        >
          {sub}
        </div>
      )}
    </Card>
  );
}

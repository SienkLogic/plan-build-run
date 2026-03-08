import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function KeyValue({ label, value, theme, color }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: t.textMuted,
          fontFamily: FONTS.mono,
          textTransform: 'uppercase',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: color || t.text,
          fontFamily: FONTS.sans,
        }}
      >
        {value}
      </div>
    </div>
  );
}

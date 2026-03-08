import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function Badge({ children, color, theme }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;
  const c = color || t.accent;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        background: `${c}18`,
        color: c,
        fontFamily: FONTS.mono,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </span>
  );
}

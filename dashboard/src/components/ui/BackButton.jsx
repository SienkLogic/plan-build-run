import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function BackButton({ onClick, theme }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;

  return (
    <button
      onClick={onClick}
      style={{
        alignSelf: 'flex-start',
        background: 'transparent',
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        padding: '3px 10px',
        color: t.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 10,
        cursor: 'pointer',
        marginBottom: 8,
      }}
    >
      &larr; Back
    </button>
  );
}

import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function CodeBlock({ children, theme }) {
  const ctx = useTheme();
  const t = theme || (ctx && ctx.tokens);

  return (
    <pre
      style={{
        background: t.codeBlock,
        borderRadius: 6,
        padding: '10px 12px',
        fontFamily: FONTS.mono,
        fontSize: 11,
        color: t.textMuted,
        overflowX: 'auto',
        margin: 0,
        lineHeight: 1.5,
        border: `1px solid ${t.border}`,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </pre>
  );
}

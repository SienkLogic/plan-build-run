import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function SectionTitle({ children, sub, theme }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;

  return (
    <div style={{ marginBottom: 12 }}>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: t.text,
          fontFamily: FONTS.sans,
          margin: 0,
        }}
      >
        {children}
      </h3>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: t.textMuted,
            fontFamily: FONTS.mono,
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

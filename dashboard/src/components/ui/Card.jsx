import { useTheme } from '../../theme/ThemeProvider.jsx';

export default function Card({ children, style, theme, onClick }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;

  return (
    <div
      onClick={onClick}
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: 16,
        transition: 'all 0.2s',
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

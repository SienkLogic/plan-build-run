import { useTheme } from '../../theme/ThemeProvider.jsx';

export default function ProgressBar({ pct, color, theme, height }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;
  const h = height || 6;

  return (
    <div
      style={{
        height: h,
        background: t.surfaceAlt,
        borderRadius: h / 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.min(pct, 100)}%`,
          background: color || t.accent,
          borderRadius: h / 2,
          transition: 'width 0.4s',
        }}
      />
    </div>
  );
}

import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function NumberInput({ value, onChange, label, min, max, step, theme }) {
  const ctx = useTheme();
  const t = theme || (ctx && ctx.tokens);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {label && (
        <span
          style={{
            fontSize: 10,
            color: t.textMuted,
            fontFamily: FONTS.mono,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {label}
        </span>
      )}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: t.surfaceAlt,
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          color: t.text,
          fontFamily: FONTS.mono,
          fontSize: 12,
          padding: '5px 8px',
          outline: 'none',
          width: 100,
        }}
      />
    </div>
  );
}

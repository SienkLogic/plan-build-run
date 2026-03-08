import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function Toggle({ checked, onChange, label, theme }) {
  const ctx = useTheme();
  const t = theme || (ctx && ctx.tokens);

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(!checked)}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />
      <div
        style={{
          width: 32,
          height: 17,
          borderRadius: 9,
          background: checked ? t.accent : t.border,
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <div
          style={{
            width: 13,
            height: 13,
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: checked ? 17 : 2,
            transition: 'left 0.2s',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          color: t.text,
          fontFamily: FONTS.sans,
        }}
      >
        {label}
      </span>
    </label>
  );
}

import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

const SYMBOL_MAP = {
  done: { char: '\u2713', colorKey: 'success' },       // checkmark
  active: { char: '\u25C6', colorKey: 'accent' },      // filled diamond
  pending: { char: '\u25CB', colorKey: 'textDim' },    // empty circle
  failed: { char: '\u2717', colorKey: 'error' },       // cross
  blocked: { char: '\u2717', colorKey: 'error' },      // cross
  milestone: { char: '\u2605', colorKey: 'warning' },  // star
};

const DEFAULT_SYMBOL = { char: '\u25CB', colorKey: 'textDim' };

export default function StatusSymbol({ status, size, showLabel }) {
  const { tokens: t } = useTheme();
  const sz = size || 16;
  const { char, colorKey } = SYMBOL_MAP[status] || DEFAULT_SYMBOL;
  const color = t[colorKey];

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          fontSize: sz,
          lineHeight: 1,
          color: color,
          fontWeight: 700,
        }}
      >
        {char}
      </span>
      {showLabel && (
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: Math.max(sz * 0.65, 9),
            color: color,
            textTransform: 'uppercase',
            letterSpacing: 0.7,
            fontWeight: 600,
          }}
        >
          {status}
        </span>
      )}
    </span>
  );
}

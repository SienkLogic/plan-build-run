import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

const STATUS_COLORS = {
  success: 'success',
  done: 'success',
  failed: 'error',
  error: 'error',
  running: 'warning',
  'in-progress': 'warning',
  todo: 'textDim',
  reviewed: 'info',
  integrated: 'success',
  warn: 'warning',
  info: 'info',
};

export default function StatusDot({ status, theme }) {
  const ctx = useTheme();
  const t = theme || ctx.tokens;
  const colorKey = STATUS_COLORS[status] || 'textDim';
  const c = t[colorKey];
  const isRunning = status === 'running';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: c,
          boxShadow: isRunning ? `0 0 8px ${c}` : 'none',
          animation: isRunning ? 'pulse 2s infinite' : 'none',
        }}
      />
      <span
        style={{
          fontFamily: FONTS.mono,
          fontSize: 10,
          color: c,
          textTransform: 'uppercase',
          letterSpacing: 0.7,
          fontWeight: 600,
        }}
      >
        {status}
      </span>
    </span>
  );
}

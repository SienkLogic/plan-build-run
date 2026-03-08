import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

const STATUS_SYMBOLS = {
  pending: '\u25C7',
  passed: '\u2713',
  failed: '\u2717',
};

export default function CheckpointBox({ title, status = 'pending', items = [], actions = [], readOnly = false }) {
  const { tokens: t } = useTheme();

  const borderColor = status === 'passed' ? t.success
    : status === 'failed' ? t.error
    : t.accent;

  const statusSymbol = STATUS_SYMBOLS[status] || STATUS_SYMBOLS.pending;
  const statusColor = status === 'passed' ? t.success
    : status === 'failed' ? t.error
    : t.accent;

  return (
    <div
      style={{
        border: `3px double ${borderColor}`,
        borderRadius: 8,
        padding: 16,
        background: t.surface,
      }}
    >
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: items.length > 0 ? 12 : 0,
          fontFamily: FONTS.sans,
          fontSize: 14,
          fontWeight: 700,
          color: t.text,
        }}
      >
        <span style={{ color: statusColor, fontSize: 16 }}>{statusSymbol}</span>
        <span>{title}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: statusColor,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {status}
        </span>
      </div>

      {/* Checklist items */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: FONTS.mono,
                fontSize: 12,
                color: item.checked ? t.text : t.textMuted,
              }}
            >
              <span style={{ color: item.checked ? t.success : t.textDim }}>
                {item.checked ? '\u2713' : '\u25CB'}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons (interactive mode only) */}
      {!readOnly && actions && actions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              style={{
                background: t.accent,
                color: t.bg,
                border: 'none',
                borderRadius: 4,
                padding: '6px 14px',
                fontFamily: FONTS.mono,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

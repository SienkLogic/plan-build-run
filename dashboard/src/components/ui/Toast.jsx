import { useTheme } from '../../theme/ThemeProvider.jsx';

const TOAST_KEYFRAMES_ID = 'pbr-toast-fadein';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(TOAST_KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = TOAST_KEYFRAMES_ID;
  style.textContent = `
    @keyframes pbr-toast-fadein {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

const TYPE_CONFIG = {
  success: { icon: '\u2713', colorKey: 'success' },
  error:   { icon: '\u2717', colorKey: 'error' },
  warning: { icon: '\u26A0', colorKey: 'warning' },
  info:    { icon: '\u2139', colorKey: 'info' },
};

/**
 * Fixed-position container that renders active toast notifications.
 *
 * @param {{ toasts: Array, removeToast: (id: number) => void }} props
 */
export default function ToastContainer({ toasts, removeToast }) {
  const { tokens } = useTheme();
  ensureKeyframes();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 380,
      }}
    >
      {toasts.map((toast) => {
        const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;
        const accentColor = tokens[cfg.colorKey] || tokens.info;

        return (
          <div
            key={toast.id}
            style={{
              background: tokens.surface,
              border: `1px solid ${tokens.border}`,
              borderLeft: `3px solid ${accentColor}`,
              borderRadius: 6,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              boxShadow: `0 4px 12px ${tokens.shadow}`,
              animation: 'pbr-toast-fadein 0.25s ease-out',
            }}
          >
            <span
              style={{
                color: accentColor,
                fontSize: 16,
                lineHeight: '20px',
                flexShrink: 0,
              }}
            >
              {cfg.icon}
            </span>

            <span
              style={{
                flex: 1,
                color: tokens.text,
                fontSize: 14,
                lineHeight: '20px',
                wordBreak: 'break-word',
              }}
            >
              {toast.message}
            </span>

            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: tokens.textMuted,
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: '20px',
                padding: 0,
                flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              {'\u2715'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

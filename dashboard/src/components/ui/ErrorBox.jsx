import { useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function ErrorBox({ title = 'Error', message, details, onRetry }) {
  const { tokens: t } = useTheme();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      style={{
        background: `${t.error}1a`,
        border: `1px solid ${t.error}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontFamily: FONTS.sans,
          fontSize: 14,
          fontWeight: 700,
          color: t.text,
        }}
      >
        <span style={{ color: t.error, fontSize: 16 }}>{'\u2717'}</span>
        <span>{title}</span>
      </div>

      {/* Message */}
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 12,
          color: t.text,
          lineHeight: 1.5,
        }}
      >
        {message}
      </div>

      {/* Details toggle */}
      {details && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowDetails((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontFamily: FONTS.mono,
              fontSize: 11,
              color: t.textMuted,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: t.codeBlock,
                borderRadius: 4,
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: t.text,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowX: 'auto',
              }}
            >
              {details}
            </pre>
          )}
        </div>
      )}

      {/* Retry button */}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: `1px solid ${t.error}`,
            borderRadius: 4,
            padding: '5px 14px',
            fontFamily: FONTS.mono,
            fontSize: 11,
            color: t.error,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function NextUpBlock({ command, phaseLink, phaseName }) {
  const { tokens: t } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (command) {
      navigator.clipboard.writeText(command).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  return (
    <div
      style={{
        background: t.surfaceAlt,
        borderRadius: 8,
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 10,
          color: t.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginBottom: 8,
        }}
      >
        Next Up
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <code
          style={{
            flex: 1,
            fontFamily: FONTS.mono,
            fontSize: 13,
            color: t.accent,
            background: `${t.accent}12`,
            padding: '6px 10px',
            borderRadius: 4,
            border: `1px solid ${t.accent}33`,
          }}
        >
          {command}
        </code>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            padding: '5px 10px',
            fontFamily: FONTS.mono,
            fontSize: 11,
            color: copied ? t.success : t.textMuted,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {phaseLink && phaseName && (
        <div
          style={{
            marginTop: 8,
            fontFamily: FONTS.mono,
            fontSize: 11,
            color: t.textMuted,
            cursor: 'pointer',
          }}
        >
          View {phaseName} &gt;
        </div>
      )}
    </div>
  );
}

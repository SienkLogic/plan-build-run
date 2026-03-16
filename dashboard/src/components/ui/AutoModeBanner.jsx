import { useState, useEffect } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

function elapsedSince(startedAt) {
  if (!startedAt) return '';
  const ms = Date.now() - new Date(startedAt).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export default function AutoModeBanner({ autoMode }) {
  const { tokens: t } = useTheme();
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!autoMode || !autoMode.active || !autoMode.startedAt) return;
    setElapsed(elapsedSince(autoMode.startedAt)); // eslint-disable-line react-hooks/set-state-in-effect -- initial value before interval subscription
    const interval = setInterval(() => {
      setElapsed(elapsedSince(autoMode.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [autoMode]);

  if (!autoMode || !autoMode.active) return null;

  const completed = autoMode.completedStages || [];

  return (
    <div
      style={{
        background: `${t.accent}18`,
        border: `1px solid ${t.accent}44`,
        borderRadius: 10,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      {/* Auto mode label with pulse */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: t.accent,
            boxShadow: `0 0 8px ${t.accent}`,
            animation: 'pulse 2s infinite',
          }}
        />
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 11,
            fontWeight: 700,
            color: t.accent,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Auto Mode
        </span>
      </div>

      {/* Current stage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: FONTS.sans, fontSize: 13, color: t.textMuted }}>
          Stage:
        </span>
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: 13,
            fontWeight: 700,
            color: t.text,
          }}
        >
          {autoMode.currentStage}
        </span>
      </div>

      {/* Completed mini pipeline */}
      {completed.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {completed.map((s) => (
            <span
              key={s}
              style={{
                fontFamily: FONTS.mono,
                fontSize: 9,
                color: t.success,
                background: `${t.success}18`,
                padding: '1px 5px',
                borderRadius: 3,
                textTransform: 'uppercase',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Next stage preview */}
      {autoMode.nextStage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textDim }}>
            next:
          </span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: t.textMuted }}>
            {autoMode.nextStage}
          </span>
        </div>
      )}

      {/* Elapsed time */}
      {elapsed && (
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: t.textMuted,
            marginLeft: 'auto',
          }}
        >
          {elapsed}
        </span>
      )}
    </div>
  );
}

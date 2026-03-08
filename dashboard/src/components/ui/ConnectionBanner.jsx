import { useEffect, useState } from 'react';

const STYLES = {
  reconnecting: { bg: '#b45309', text: '#fef3c7', label: 'Reconnecting to server...' },
  disconnected: { bg: '#991b1b', text: '#fee2e2', label: 'Connection lost. Retrying...' },
  connecting:   { bg: '#1e3a5f', text: '#e0f2fe', label: 'Connecting to server...' },
};

export default function ConnectionBanner({ status }) {
  const [dotOpacity, setDotOpacity] = useState(1);

  useEffect(() => {
    if (status === 'connected') return;
    const id = setInterval(() => {
      setDotOpacity((o) => (o === 1 ? 0.3 : 1));
    }, 600);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'connected') return null;

  const style = STYLES[status];
  if (!style) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        zIndex: 9999,
        background: style.bg,
        color: style.text,
        textAlign: 'center',
        padding: '6px 0',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: style.text,
          opacity: dotOpacity,
          transition: 'opacity 0.3s',
        }}
      />
      {style.label}
    </div>
  );
}

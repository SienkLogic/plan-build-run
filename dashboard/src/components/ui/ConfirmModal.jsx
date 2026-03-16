import { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

/**
 * Portal-based confirmation modal that replaces window.confirm.
 * Uses theme tokens for all colors, matching the toast styling pattern.
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}) {
  const { tokens } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 8,
          padding: '20px 24px',
          maxWidth: 400,
          width: '90%',
          boxShadow: `0 8px 24px ${tokens.shadow}`,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 16,
            fontWeight: 600,
            color: tokens.text,
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 14,
            color: tokens.textMuted,
            lineHeight: '20px',
            marginBottom: 20,
          }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: `1px solid ${tokens.border}`,
              borderRadius: 6,
              padding: '6px 16px',
              fontFamily: FONTS.mono,
              fontSize: 12,
              color: tokens.textMuted,
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: tokens.error,
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              fontFamily: FONTS.mono,
              fontSize: 12,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Hook that provides a promise-based confirmation dialog.
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   if (await confirm('Title', 'Message?')) { ... }
 *   // Render <ConfirmDialog /> in the component tree
 */
export function useConfirm() {
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const resolveRef = useRef(null);

  const confirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ isOpen: true, title, message });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef.current) resolveRef.current(true);
    resolveRef.current = null;
    setModal({ isOpen: false, title: '', message: '' });
  }, []);

  const handleCancel = useCallback(() => {
    if (resolveRef.current) resolveRef.current(false);
    resolveRef.current = null;
    setModal({ isOpen: false, title: '', message: '' });
  }, []);

  const ConfirmDialog = useCallback(
    () => (
      <ConfirmModal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
    [modal.isOpen, modal.title, modal.message, handleConfirm, handleCancel]
  );

  return { confirm, ConfirmDialog };
}

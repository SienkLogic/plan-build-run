import { createContext, useContext, useState, useCallback } from 'react';
import ToastContainer from '../components/ui/Toast.jsx';

const ToastContext = createContext();

/**
 * Provider component that manages toast state and renders the toast container.
 * Wrap your app with <ToastProvider> to enable useToast() in child components.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type, message, duration = 4000) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, message, duration }]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook to access toast notifications from any component.
 * @returns {{ addToast: (type: string, message: string, duration?: number) => void, toasts: Array, removeToast: (id: number) => void }}
 */
export default function useToast() {
  return useContext(ToastContext);
}

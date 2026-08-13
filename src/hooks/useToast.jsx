import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Minimal toast/notification surface used across forms (payment success,
 * validation errors, save confirmations). Rendered once near the app root.
 */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, { type = 'info', duration = 3500 } = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, type }]);
      if (duration) setTimeout(() => remove(id), duration);
      return id;
    },
    [remove]
  );

  const api = useMemo(
    () => ({
      info: (m, o) => push(m, { ...o, type: 'info' }),
      success: (m, o) => push(m, { ...o, type: 'success' }),
      warning: (m, o) => push(m, { ...o, type: 'warning' }),
      error: (m, o) => push(m, { ...o, type: 'error', duration: 5000 }),
      push,
      remove,
    }),
    [push, remove]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const COLORS = {
  info: { bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
  success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
  warning: { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
  error: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)' },
};

function Toast({ toast, onClose }) {
  const c = COLORS[toast.type] ?? COLORS.info;
  return (
    <div
      className="flex items-start gap-3 rounded-[12px] px-4 py-3 shadow-card animate-in"
      style={{ background: c.bg, border: `1px solid ${c.fg}40` }}
    >
      <span style={{ color: c.fg }} className="mt-0.5">
        ●
      </span>
      <p className="text-sm flex-1" style={{ color: 'var(--color-text-primary)' }}>
        {toast.message}
      </p>
      <button
        onClick={onClose}
        className="text-xs"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

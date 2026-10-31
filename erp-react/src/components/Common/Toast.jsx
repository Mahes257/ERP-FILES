import { useState, useCallback, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { ToastContext } from './ToastContext';

const TOAST_STYLES = {
  success: { border: 'border-emerald-300', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> },
  error: { border: 'border-rose-300', icon: <XCircle className="w-4 h-4 text-rose-500 shrink-0" /> },
  warning: { border: 'border-amber-300', icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> },
  info: { border: 'border-sky-300', icon: <Info className="w-4 h-4 text-sky-500 shrink-0" /> }
};

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type, message) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      warning: (message) => push('warning', message),
      info: (message) => push('info', message),
      clearAll: () => setToasts([])
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
        return (
          <div
            key={toast.id}
            className={`bg-surface border ${style.border} rounded-xl shadow-lg p-3 flex items-start gap-2.5`}
          >
            {style.icon}
            <p className="flex-1 text-xs font-semibold text-slate-700 leading-snug break-words">{toast.message}</p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="p-0.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

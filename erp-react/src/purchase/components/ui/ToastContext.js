/**
 * purchase/components/ui/ToastContext.js
 * ------------------------------------------------------------------
 * Vendored from src/components/Common/ToastContext.js.
 * ------------------------------------------------------------------
 */
import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      success() {},
      error() {},
      info() {},
      clearAll() {}
    };
  }
  return context;
}

/**
 * purchase/layouts/PurchaseLayout.jsx
 * ------------------------------------------------------------------
 * Page shell for every Purchase route. Wraps the route element in a
 * suspense boundary and supplies the module's providers (theme, toast)
 * so the package stays self-contained. Consumed exclusively by
 * purchaseRoutes.jsx.
 *
 * Adds `.purchase-active` to <html> while mounted so the override CSS
 * can force the sidebar, topbar, and all Purchase content to the
 * professional light ERP theme regardless of global dark mode.
 * ------------------------------------------------------------------
 */
import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary, PageLoader, ThemeProvider, ToastProvider } from '../components/ui';
import '../styles/design-system.css';
import '../styles/dark-mode.css';
import '../styles/ui-polish.css';
import '../styles/settings-polish.css';
import '../styles/document-repository.css';
import '../styles/purchase-numeric-input.css';

export default function PurchaseLayout() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('purchase-active');
    return () => {
      root.classList.remove('purchase-active');
    };
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}

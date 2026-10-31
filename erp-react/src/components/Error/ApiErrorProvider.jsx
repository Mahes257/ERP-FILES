import { useEffect, useMemo, useState } from 'react';
import ErrorPage from './ErrorPage';
import { ApiErrorContext } from './ApiErrorContext';

function normalizeApiError(error) {
  // Keep this guard even though the Axios interceptor filters cancellations;
  // other callers can publish errors directly and cancellation is never a
  // user-visible network failure.
  if (error?.code === 'ERR_CANCELED' || error?.__CANCEL__) {
    return null;
  }
  const status = error?.response?.status;
  if (status) {
    const supported = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504];
    if (supported.includes(status)) return status;
    if (status >= 400 && status < 500) return 400;
    if (status >= 500 && status <= 599) return 500;
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || /timeout/i.test(error?.message || '')) {
    return 408;
  }
  return 'NETWORK';
}

export default function ApiErrorProvider({ children }) {
  const [error, setError] = useState(null);
  const value = useMemo(() => ({ clearApiError: () => setError(null) }), []);

  useEffect(() => {
    const handleApiError = (event) => {
      if (window.location.pathname.startsWith('/error/')) {
        return;
      }
      // Purchase screens own their data-loading states. A failed auxiliary
      // request must not replace a valid Purchase route with the global 404
      // page; the page or its local error boundary can surface the failure.
      if (window.location.pathname.startsWith('/purchase/')) {
        return;
      }
      const status = normalizeApiError(event.detail);
      if (status) {
        setError({ status });
      }
    };
    window.addEventListener('erp:api-error', handleApiError);
    return () => window.removeEventListener('erp:api-error', handleApiError);
  }, []);

  if (error) {
    return (
      <ApiErrorContext.Provider value={value}>
        <ErrorPage status={error.status} />
      </ApiErrorContext.Provider>
    );
  }

  return <ApiErrorContext.Provider value={value}>{children}</ApiErrorContext.Provider>;
}

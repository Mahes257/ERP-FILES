import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load one Production report from the backend, re-fetching whenever its filters
 * change.
 *
 *   const { data, loading, error, reload } = useReportData(reportService.getProductionSummary, filters);
 *
 * `fetchReport` must be a stable reference (a method of the reportService
 * object) and `filters` the plain filter object the report bar produced.
 * `data` is the endpoint's payload — the report's rows plus its summary — or
 * null until the first response arrives; `error` carries the backend's message
 * so a failing report says why instead of quietly rendering zeros.
 */
export default function useReportData(fetchReport, filters) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Only the filter VALUES should trigger a reload — the object identity
  // changes on every render of the page.
  const filterKey = JSON.stringify(filters ?? {});
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetchReport(JSON.parse(filterKey));
      if (id !== requestId.current) return; // a newer request already answered
      setData(response.data || null);
    } catch (loadError) {
      if (id !== requestId.current) return;
      setData(null);
      setError(loadError.message || 'This report could not be loaded.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [fetchReport, filterKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

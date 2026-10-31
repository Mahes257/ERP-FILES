import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/v1';

/**
 * Fetches sidebar notification badge counts from the single backend endpoint:
 *   GET /api/production/notifications
 *
 * All counts are derived directly from MySQL database records.
 * No localStorage, no React state, no hardcoded values.
 *
 * Returns an object keyed by sidebar navigation key:
 *   { 'orders': 3, 'casting': 4, 'fabrication': 3, ... }
 *
 * A count of 0 means no badge is shown.
 */
export function useProductionNotificationCounts() {
  const [counts, setCounts] = useState({});

  const fetchCounts = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/production/notifications`);
      const data = await response.json();
      if (data.ok && data.data) {
        setCounts({
          orders: data.data.orders || 0,
          'technical-verification': data.data.technicalVerification || 0,
          drawings: data.data.drawings || 0,
          models: data.data.models || 0,
          casting: data.data.casting || 0,
          fabrication: data.data.fabrication || 0,
          assembly: data.data.assembly || 0,
          quality: data.data.quality || 0,
          packing: data.data.packing || 0,
          dispatch: data.data.dispatch || 0,
        });
      }
    } catch {
      // Backend unavailable — show no badges
      setCounts({});
    }
  }, []);

  useEffect(() => {
    fetchCounts();

    // Poll every 30 seconds to keep badges fresh
    const interval = setInterval(fetchCounts, 30000);

    return () => clearInterval(interval);
  }, [fetchCounts]);

  // Listen for custom events to trigger a refetch after CRUD operations
  useEffect(() => {
    const handleRefresh = () => fetchCounts();
    window.addEventListener('production-data-changed', handleRefresh);
    return () => window.removeEventListener('production-data-changed', handleRefresh);
  }, [fetchCounts]);

  return counts;
}

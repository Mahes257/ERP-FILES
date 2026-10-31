import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { technicalVerificationApi, tvApi } from '../utils/api';
import {
  notifyProductionDataChanged,
  subscribeProductionDataChanged,
} from '../utils/dataChanged';

const TechnicalVerificationContext = createContext(null);

/** Refresh-bus identity so this store never re-fetches its own writes. */
const TV_STORE = 'technical-verification';

// The list endpoint caps `size` at 100 per page, so a single request for 500
// silently returned only the first 100 verification records — every Work Order
// beyond that was shown as "Pending" even when its items were verified.
const PAGE_SIZE = 100;
const MAX_PAGES = 100; // safety stop (10 000 verification records)

/**
 * Normalise a verification record coming from the API into the shape the pages
 * use. Two wire-format details have to be translated back:
 *   - `checklist` is persisted as a JSON string (the entity column is TEXT) but
 *     the pages read it as an object (`tv.checklist[item]`);
 *   - the API field for the Fabrication length is `lengthMm` (column
 *     length_mm) while the pages use the `length` key.
 */
function normalizeRecord(record) {
  if (!record) return record;
  const out = { ...record };
  if (typeof out.checklist === 'string') {
    const trimmed = out.checklist.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        out.checklist = JSON.parse(trimmed);
      } catch {
        out.checklist = {};
      }
    } else {
      out.checklist = {};
    }
  }
  if (out.checklist === null || out.checklist === undefined) out.checklist = {};
  if (out.lengthMm !== undefined && out.length === undefined) out.length = out.lengthMm;
  return out;
}

/**
 * Technical Verification store — one record per Work Order Item.
 * Uses the real ERP backend API exclusively. No localStorage fallback.
 */
export function TechnicalVerificationProvider({ children }) {
  const [technicalVerifications, setTechnicalVerifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const all = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const result = await tvApi.list({ page, size: PAGE_SIZE });
        const data = result?.data || result || {};
        const content = Array.isArray(data.content) ? data.content : [];
        all.push(...content);
        if (content.length < PAGE_SIZE) break;
      }
      setTechnicalVerifications(all.map(normalizeRecord));
      return true;
    } catch (err) {
      console.error('Failed to load technical verifications:', err.message);
      setTechnicalVerifications([]);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const result = await tvApi.getStats();
      setStats(result?.data || result);
    } catch {
      setStats(null);
    }
  }, []);

  /**
   * Reload both the records and the summary counters from the API.
   * Resolves with false when the records could not be reloaded so callers can
   * report the failure instead of silently showing stale data.
   */
  const refreshAll = useCallback(async () => {
    const recordsOk = await fetchData();
    await fetchStats();
    return recordsOk;
  }, [fetchData, fetchStats]);

  useEffect(() => {
    fetchData();
    fetchStats();
  }, [fetchData, fetchStats]);

  useEffect(
    () => subscribeProductionDataChanged(TV_STORE, () => { fetchData(); fetchStats(); }),
    [fetchData, fetchStats]
  );

  /**
   * Save (create or update) one Technical Verification record.
   * Resolves with { ok, record, error } — it never throws, because every caller
   * is a fire-and-forget UI action and a rejected save used to be swallowed
   * (the form closed and the page kept showing "Pending" with no explanation).
   */
  const saveTechnicalVerification = useCallback(async (data) => {
    try {
      const result = await technicalVerificationApi.save(data);
      const record = normalizeRecord(result?.data || result || null);
      await fetchData();
      await fetchStats();
      // This store already reloaded itself — tell the OTHER stores only.
      notifyProductionDataChanged(TV_STORE);
      return { ok: true, record };
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Could not save the technical verification.';
      console.error('Backend TV save failed:', message);
      return { ok: false, record: null, error: message };
    }
  }, [fetchData, fetchStats]);

  /**
   * Look up the verification record for a Work Order (optionally one item).
   *
   * `itemId` is compared as a string: the Work Order items carry a numeric `id`
   * (2, 3, …) while the API returns the stored `itemId` as a string ("2"), so a
   * strict `===` never matched. Every item therefore kept showing "Pending"
   * after it had been verified and committed — and re-opening the form started
   * from a blank record instead of the saved values.
   */
  const getTechnicalVerification = useCallback((workOrderId, itemId) => {
    if (itemId !== undefined && itemId !== null && itemId !== '') {
      const wanted = String(itemId);
      return technicalVerifications.find(
        (tv) => tv.workOrderId === workOrderId && String(tv.itemId ?? tv.workOrderItemId ?? '') === wanted
      ) || null;
    }
    return technicalVerifications.find((tv) => tv.workOrderId === workOrderId) || null;
  }, [technicalVerifications]);

  const getTechnicalVerificationsForOrder = useCallback((workOrderId) => {
    return technicalVerifications.filter((tv) => tv.workOrderId === workOrderId);
  }, [technicalVerifications]);

  const deleteTechnicalVerificationsForOrder = useCallback(async (workOrderId) => {
    try {
      // The API only exposes a work-order scoped delete; the previous code called
      // a non-existent technicalVerificationApi.delete(item.id), so the
      // verification rows survived the Work Order deletion in the database.
      await technicalVerificationApi.deleteForOrder(workOrderId);
      await fetchData();
      await fetchStats();
      notifyProductionDataChanged(TV_STORE);
      return true;
    } catch (err) {
      // Never report a cleanup that did not happen: the caller deletes the
      // dependent records as part of removing a Work Order.
      console.error(`Failed to delete technical verifications for ${workOrderId}:`, err?.message || err);
      return false;
    }
  }, [fetchData, fetchStats]);

  const computedStats = stats || {
    total: technicalVerifications.length,
    pending: technicalVerifications.filter((tv) => (tv.status || tv.verificationStatus || 'Pending') === 'Pending').length,
    verified: technicalVerifications.filter((tv) => tv.verificationStatus === 'Verified').length,
    rejected: technicalVerifications.filter((tv) => tv.verificationStatus === 'Rejected').length,
  };

  const value = {
    technicalVerifications, loading, stats: computedStats,
    refresh: fetchData, refreshStats: fetchStats, refreshAll,
    saveTechnicalVerification,
    getTechnicalVerification, getTechnicalVerificationsForOrder,
    deleteTechnicalVerificationsForOrder,
  };

  return (
    <TechnicalVerificationContext.Provider value={value}>
      {children}
    </TechnicalVerificationContext.Provider>
  );
}

export function useTechnicalVerification() {
  const context = useContext(TechnicalVerificationContext);
  if (!context) {
    throw new Error('useTechnicalVerification must be used inside <TechnicalVerificationProvider>');
  }
  return context;
}

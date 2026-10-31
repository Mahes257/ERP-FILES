import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { qualityApi } from '../utils/api';
import { notifyProductionDataChanged } from '../utils/dataChanged';
import useVisibleInterval from '../../hooks/useVisibleInterval';

const QualityContext = createContext(null);

/** Refresh-bus identity for this store's writes. */
const QUALITY_STORE = 'quality';

/**
 * The API stores the Work Order reference in `productionOrderId` (and mirrors it
 * in `workOrder`), but every consumer in this module — the list, the detail page,
 * the edit form and the Work-Order Quality tab — reads `productionOrder`.
 * Without this alias an inspection loaded from the database had no Work Order:
 * Edit opened with an empty Work Order field (and refused to save),
 * `/production/quality/:id` could not resolve its Work Order, and the Work-Order
 * Quality tab matched nothing. Records built by the create form already carry
 * `productionOrder`, so the alias is a no-op for them.
 */
const normalizeInspection = (record) => ({
  ...record,
  productionOrder: record.productionOrder ?? record.productionOrderId ?? record.workOrder ?? '',
});

/**
 * Quality store — manages QC inspection records.
 * PRIMARY: Fetches from the unified ERP QualityInspection backend API (MySQL).
 * REAL-TIME: Subscribes to WebSocket /topic/qc-updates for live sync with Sales CPO QC.
 * NO localStorage fallback — the database is the single source of truth.
 */
export function QualityProvider({ children }) {
  const [inspections, setInspections] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInspections = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      const result = await qualityApi.list({ size: 500, ...params });
      // ERP ApiResponse wraps in { ok, data: { content: [...], ... } }
      const content = result?.data?.content || result?.content || [];
      setInspections(content.map(normalizeInspection));
    } catch (err) {
      console.error('Failed to load quality inspections:', err.message);
      setInspections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async (productionOrder) => {
    try {
      const result = await qualityApi.getStats(productionOrder);
      // ERP ApiResponse wraps in { ok, data: { ... } }
      setStats(result?.data || result);
    } catch {
      setStats(null);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchInspections();
    fetchStats();
  }, [fetchInspections, fetchStats]);

  // ======================== live sync ========================
  /* QC records are kept fresh by polling. An earlier revision also opened a
     SockJS socket here, but nothing ever subscribed to it — no STOMP client
     and no message handler were attached, so it delivered no updates while
     pulling in sockjs-client, which registers a document-level `unload`
     listener (utils.unloadAdd). Chrome rejects that now with
     "Permissions policy violation: unload is not allowed in this document".
     The API calls plus this poll are the whole live-sync path, so dropping
     the unused socket changes no behaviour. */
  // Polling is suspended while the tab is hidden (see useVisibleInterval) so a
  // background Production tab no longer re-reads the inspection list every 30 s.
  useVisibleInterval(fetchInspections, 30000);

  // ======================== CRUD ========================

  const addInspection = async (data) => {
    // Map frontend field names to ERP backend field names
    const payload = { ...data };
    if (payload.productionOrder && !payload.productionOrderId) {
      payload.productionOrderId = payload.productionOrder;
    }
    // Ensure checklist and history are JSON strings for the ERP entity
    if (payload.checklist && typeof payload.checklist === 'object') {
      payload.checklist = JSON.stringify(payload.checklist);
    }
    if (payload.history && Array.isArray(payload.history)) {
      payload.history = JSON.stringify(payload.history);
    }
    // Convert QC data objects to JSON strings
    if (payload.inspectionReport && typeof payload.inspectionReport === 'object') {
      payload.inspectionReport = JSON.stringify(payload.inspectionReport);
    }
    if (payload.dimensionalInspection && typeof payload.dimensionalInspection === 'object') {
      payload.dimensionalInspection = JSON.stringify(payload.dimensionalInspection);
    }
    if (payload.materialTestCertificate && typeof payload.materialTestCertificate === 'object') {
      payload.materialTestCertificate = JSON.stringify(payload.materialTestCertificate);
    }
    if (payload.finalQcInfo && typeof payload.finalQcInfo === 'object') {
      payload.finalQcInfo = JSON.stringify(payload.finalQcInfo);
    }
    const result = await qualityApi.create(payload);
    // Return the persisted record (with its database id) so callers can save
    // the dependent QC data straight away instead of using a missing form id.
    const rawCreated = result?.data || result || null;
    const created = rawCreated ? normalizeInspection(rawCreated) : null;
    await fetchInspections();
    await fetchStats();
    notifyProductionDataChanged(QUALITY_STORE);
    return created;
  };

  const updateInspection = async (inspection) => {
    // Accept either (id, data) or a merged object
    let id, data;
    if (inspection && inspection.id) {
      id = inspection.id;
      data = { ...inspection };
    } else {
      return;
    }
    // Map field names
    if (data.productionOrder && !data.productionOrderId) {
      data.productionOrderId = data.productionOrder;
    }
    // Ensure JSON strings for entity fields
    if (data.checklist && typeof data.checklist === 'object') {
      data.checklist = JSON.stringify(data.checklist);
    }
    if (data.history && Array.isArray(data.history)) {
      data.history = JSON.stringify(data.history);
    }
    if (data.inspectionReport && typeof data.inspectionReport === 'object') {
      data.inspectionReport = JSON.stringify(data.inspectionReport);
    }
    if (data.dimensionalInspection && typeof data.dimensionalInspection === 'object') {
      data.dimensionalInspection = JSON.stringify(data.dimensionalInspection);
    }
    if (data.materialTestCertificate && typeof data.materialTestCertificate === 'object') {
      data.materialTestCertificate = JSON.stringify(data.materialTestCertificate);
    }
    if (data.finalQcInfo && typeof data.finalQcInfo === 'object') {
      data.finalQcInfo = JSON.stringify(data.finalQcInfo);
    }
    await qualityApi.update(id, data);
    await fetchInspections();
    await fetchStats();
    notifyProductionDataChanged(QUALITY_STORE);
  };

  const deleteInspection = async (id) => {
    await qualityApi.delete(id);
    await fetchInspections();
    await fetchStats();
    notifyProductionDataChanged(QUALITY_STORE);
  };

  const getInspection = (id) => inspections.find(i => i.id === id);

  const changeStatus = async (id, newStatus, options = {}) => {
    const { action, remarks } = options;
    await qualityApi.updateStatus(id, newStatus, action || `Status changed to ${newStatus}`, remarks || '');
    await fetchInspections();
    await fetchStats();
    notifyProductionDataChanged(QUALITY_STORE);
  };

  const setChecklistItem = async (id, index, updates) => {
    await qualityApi.updateChecklist(id, index, updates.result, updates.remarks);
    await fetchInspections();
  };

  const saveQcData = async (inspectionId, qcData) => {
    // The backend binds `PUT /{id}/qc-data` to `Map<String, String>` and stores
    // each value straight into a JSON column. The four sections are objects /
    // arrays here, so they must travel as JSON strings — exactly how
    // addInspection/updateInspection already handle `checklist` and `history`.
    //
    // Sending them as objects made Jackson fail to bind the body and the
    // endpoint answered 500, so the Inspection Report, Dimensional Inspection,
    // Material Test Certificate and Final QC data were NEVER persisted on any
    // create or save. The caller ignored the rejection, so it looked like it had
    // worked.
    const asJson = (value) => {
      if (value === undefined || value === null) return null;
      return typeof value === 'string' ? value : JSON.stringify(value);
    };
    await qualityApi.saveQcData(inspectionId, {
      inspectionReport: asJson(qcData?.inspectionReport),
      dimensionalInspection: asJson(qcData?.dimensionalInspection),
      materialTestCertificate: asJson(qcData?.materialTestCertificate),
      finalQcInfo: asJson(qcData?.finalQcInfo),
    });
    await fetchInspections();
    await fetchStats();
    notifyProductionDataChanged(QUALITY_STORE);
  };

  const computedStats = stats || {
    total: inspections.length,
    pending: inspections.filter(i => i.status === 'Pending').length,
    inProgress: inspections.filter(i => i.status === 'In Progress').length,
    passed: inspections.filter(i => i.status === 'Passed').length,
    failed: inspections.filter(i => i.status === 'Failed').length,
    hold: inspections.filter(i => i.status === 'Hold').length,
    acceptedQuantity: inspections.reduce((sum, i) => sum + (i.acceptedQuantity || 0), 0),
    rejectedQuantity: inspections.reduce((sum, i) => sum + (i.rejectedQuantity || 0), 0),
    inspectionsToday: inspections.filter(i => i.inspectionDate === new Date().toISOString().slice(0, 10)).length,
  };

  const value = {
    inspections,
    stats: computedStats,
    loading,
    backendAvailable: true,
    refresh: fetchInspections,
    refreshStats: fetchStats,
    addInspection,
    updateInspection,
    deleteInspection,
    getInspection,
    changeStatus,
    setChecklistItem,
    saveQcData,
  };

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export function useQuality() {
  const context = useContext(QualityContext);
  if (!context) {
    throw new Error('useQuality must be used inside <QualityProvider>');
  }
  return context;
}

/**
 * purchase/hooks/usePrEditState.js
 * ------------------------------------------------------------------
 * Manages the editable state for the Purchase Requisition print preview.
 * Provides: state management, field/item editing, auto-recalculation,
 * save to service, and reset to original data.
 * ------------------------------------------------------------------
 */
import { useCallback, useMemo, useState } from 'react';
import { requisitionService } from '../services/requisition';
import { calcDocumentTotals } from '../utils/purchase';

/* ------------------------------------------------------------------ */
/*  Deep-clone helper (safe for the data shapes used by this module).  */
/* ------------------------------------------------------------------ */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ------------------------------------------------------------------ */
/*  Recalculate record.totals from edited items / discount / charges.  */
/* ------------------------------------------------------------------ */
function recalcTotals(record) {
  const items = record.items || [];
  const discount = Number(record.discount) || 0;
  const charges = Number(record.charges) || 0;
  const gstType = record.gstType || '';
  const totals = calcDocumentTotals(items, discount, charges, gstType);
  return { ...record, totals };
}

/**
 * usePrEditState — manages the full editing lifecycle for the PR print page.
 *
 * @param {string} id - The PR record ID
 * @param {object|null} initialData - The printPreview response { record, company, preparedBy, checkedBy, approvedBy, generatedAt }
 * @param {object} options - { onToast }
 * @returns {object} Edit state and handlers
 */
export function usePrEditState(id, initialData, { onToast } = {}) {
  const [editableData, setEditableData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  /** Initialize editable data from loaded preview data. */
  const initializeData = useCallback((data) => {
    setEditableData(deepClone(data));
    setIsEditing(false);
    setHasUnsavedChanges(false);
  }, []);

  /** Enter edit mode. */
  const startEditing = useCallback(() => {
    setIsEditing(true);
    setHasUnsavedChanges(false);
  }, []);

  /** Cancel editing — reset to original data and exit edit mode. */
  const cancelEditing = useCallback(() => {
    if (initialData) {
      setEditableData(deepClone(initialData));
    }
    setIsEditing(false);
    setHasUnsavedChanges(false);
  }, [initialData]);

  /** Save edited data to the service. Returns true on success. */
  const saveData = useCallback(async () => {
    if (!editableData || !id) return false;
    setSaving(true);
    try {
      const { record } = editableData;
      /* Save the record fields (header, items, notes, totals, etc.)
         via the existing updateRequisition service. */
      const updatePayload = {
        title: record.title,
        department: record.department,
        project: record.project,
        requester: record.requester,
        buyer: record.buyer,
        vendor: record.vendor,
        currency: record.currency,
        priority: record.priority,
        prType: record.prType,
        terms: record.terms,
        gstType: record.gstType,
        expectedDate: record.expectedDate,
        discount: record.discount,
        charges: record.charges,
        notes: record.notes,
        internalNotes: record.internalNotes,
        items: (record.items || []).map((item) => ({
          itemCode: item.itemCode || '',
          product: item.product || '',
          category: item.category || '',
          hsn: item.hsn || '',
          uom: item.uom || 'Nos',
          qty: Number(item.qty) || 0,
          rate: Number(item.rate) || 0,
          discount: Number(item.discount) || 0,
          gstRate: Number(item.gstRate) || 0,
          remarks: item.remarks || ''
        }))
      };

      await requisitionService.updateRequisition(id, updatePayload);

      /* Re-fetch the print preview to get freshly computed totals. */
      const refreshed = await requisitionService.printPreview(id);
      setEditableData(deepClone(refreshed));
      setIsEditing(false);
      setHasUnsavedChanges(false);

      onToast?.success?.('Changes saved successfully');
      return true;
    } catch (err) {
      onToast?.error?.(err?.message || 'Failed to save changes');
      return false;
    } finally {
      setSaving(false);
    }
  }, [editableData, id, onToast]);

  /** Edit a company-level field: company.name, company.email, etc. */
  const handleCompanyChange = useCallback((field, value) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        company: { ...prev.company, [field]: value }
      };
    });
    setHasUnsavedChanges(true);
  }, []);

  /** Edit a record-level field (title, department, vendor, etc.). */
  const handleRecordChange = useCallback((field, value) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const updatedRecord = recalcTotals({ ...prev.record, [field]: value });
      return { ...prev, record: updatedRecord };
    });
    setHasUnsavedChanges(true);
  }, []);

  /** Edit an item field at a specific index. Recalculates totals. */
  const handleItemChange = useCallback((index, field, value) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.record.items.map((item, i) => {
        if (i !== index) return item;
        return { ...item, [field]: value };
      });
      const updatedRecord = recalcTotals({ ...prev.record, items: updatedItems });
      return { ...prev, record: updatedRecord };
    });
    setHasUnsavedChanges(true);
  }, []);

  /** Add a new blank line item. */
  const handleAddItem = useCallback(() => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const newItem = {
        itemCode: '',
        product: '',
        specification: '',
        category: '',
        hsn: '',
        uom: 'Nos',
        qty: 0,
        rate: 0,
        discount: 0,
        gstRate: 18,
        remarks: ''
      };
      const updatedRecord = recalcTotals({
        ...prev.record,
        items: [...(prev.record.items || []), newItem]
      });
      return { ...prev, record: updatedRecord };
    });
    setHasUnsavedChanges(true);
  }, []);

  /** Remove a line item at a specific index. */
  const handleRemoveItem = useCallback((index) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const updatedItems = (prev.record.items || []).filter((_, i) => i !== index);
      const updatedRecord = recalcTotals({ ...prev.record, items: updatedItems });
      return { ...prev, record: updatedRecord };
    });
    setHasUnsavedChanges(true);
  }, []);

  /** Edit top-level fields: preparedBy, checkedBy, approvedBy,
   *  inWordsOverride (custom amount-in-words text). */
  const handleTopLevelChange = useCallback((field, value) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      if (field === 'inWordsOverride') {
        const updatedRecord = {
          ...prev.record,
          totals: { ...(prev.record.totals || {}), inWords: value }
        };
        return { ...prev, record: updatedRecord };
      }
      return { ...prev, [field]: value };
    });
    setHasUnsavedChanges(true);
  }, []);

  /** Computed: the current totals from editable data. */
  const totals = useMemo(() => {
    if (!editableData?.record?.totals) return {};
    return editableData.record.totals;
  }, [editableData?.record?.totals]);

  return {
    editableData,
    isEditing,
    saving,
    hasUnsavedChanges,
    totals,
    initializeData,
    startEditing,
    cancelEditing,
    saveData,
    handleCompanyChange,
    handleRecordChange,
    handleItemChange,
    handleAddItem,
    handleRemoveItem,
    handleTopLevelChange
  };
}

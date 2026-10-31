import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import ActionFeedback from '../components/production/ActionFeedback';
import ProductionOrderForm from '../components/production/ProductionOrderForm';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useAcknowledgement } from '../context/AcknowledgementContext';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { nextWorkOrderNumber } from '../data/orders';
import { loadCpoItemConversion, workOrderPrefill } from '../../utils/cpoItemConversion';
import api from '../../api/axiosInstance';
import { useToast } from '../../components/Common';
import './WorkOrderFormPage.css';

/** A saved Production Item id — an unsaved item uses a non-numeric form slug. */
const isSavedItemId = (value) => /^\d+$/.test(String(value ?? '').trim());

const itemAttachmentUrl = (orderBackendId, itemId) =>
  `/production-orders/${orderBackendId}/items/${itemId}/attachments`;

const attachmentListOf = (body) =>
  (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []);

/**
 * Apply the item-wise attachment changes collected by the form, once the Work
 * Order — and therefore its item ids — exists.
 *
 * Removing an existing file, uploading the files staged on a new or existing
 * item, and the deletion of an item's files all target the SAVED item id, so the
 * attachment-to-item association is the database's, not the form's.
 *
 * @returns {Promise<string[]>} human-readable failures (empty on full success)
 */
async function syncItemAttachments(order, formItems) {
  const items = Array.isArray(formItems) ? formItems : [];
  const savedItems = Array.isArray(order?.items) ? order.items : [];
  const orderBackendId = order?.backendId;
  const changed = items.filter(
    (item) =>
      (item.pendingAttachments || []).length > 0 ||
      (item.removedAttachmentIds || []).length > 0
  );
  if (changed.length === 0) return [];
  if (!orderBackendId) {
    return ['The Work Order was saved, but its items could not be addressed to store the attachments.'];
  }

  // Existing items are matched by their id. Newly added items have no id yet;
  // the backend appends them in request order, so they are matched by position
  // among the rows the server has just created.
  const claimedIds = new Set(
    items.filter((item) => isSavedItemId(item.id)).map((item) => String(item.id))
  );
  const newRows = savedItems.filter((row) => !claimedIds.has(String(row.id)));
  let nextNewRow = 0;
  const failures = [];

  for (const formItem of items) {
    const removed = formItem.removedAttachmentIds || [];
    const pending = formItem.pendingAttachments || [];
    if (removed.length === 0 && pending.length === 0) continue;

    const saved = isSavedItemId(formItem.id)
      ? savedItems.find((row) => String(row.id) === String(formItem.id))
      : newRows[nextNewRow++];
    const label = formItem.productName || 'Production item';
    if (!saved || saved.id == null) {
      failures.push(`${label}: the saved item could not be matched, so its attachments were not applied.`);
      continue;
    }

    const base = itemAttachmentUrl(orderBackendId, saved.id);

    for (const attachmentId of removed) {
      try {
        await api.delete(`${base}/${attachmentId}`);
      } catch (err) {
        // Already gone is exactly the intended state.
        if (err?.response?.status !== 404) {
          failures.push(`${label}: a saved attachment could not be removed.`);
        }
      }
    }

    if (pending.length === 0) continue;

    // A previous save attempt may already have uploaded some of these files.
    // Their stored name is the only stable link the browser has, so a file that
    // is already attached is not uploaded a second time.
    let storedNames = [];
    try {
      const listed = await api.get(base);
      storedNames = attachmentListOf(listed?.data).map((doc) => doc.name);
    } catch {
      // The uploads below report their own failures; a listing failure must not
      // stop a file that can still be stored.
    }

    for (const file of pending) {
      if (storedNames.includes(file.name)) continue;
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post(base, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch (err) {
        const reason = err?.response?.data?.message || err?.message || 'upload failed';
        failures.push(`${label} — ${file.name}: ${reason}`);
      }
    }
  }

  return failures;
}

/**
 * Create / Edit Work Order — standalone full-page view.
 *
 * Routes:
 *   /production/orders/new      → create mode
 *   /production/orders/:id/edit → edit mode (:id = work order number)
 *
 * Create mode also accepts `?cpoId=<id>&itemId=<id>` — the handoff written
 * when a Customer Purchase Order item is marked "Convert To → WO". The CPO
 * and its item are then RE-READ from the API (the link is validated, never
 * trusted), the form opens pre-filled from the persisted item, and the Work
 * Order is still only created when the user saves this form.
 *
 * Mirrors the Sales "Create Lead" page architecture: the previous list is
 * NOT rendered behind the form; this route fully replaces the workspace
 * content (application shell / sidebar / topbar remain from AppLayout).
 */
export default function WorkOrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // CPO item handoff (see utils/cpoItemConversion).
  const conversionCpoId = searchParams.get('cpoId');
  const conversionItemId = searchParams.get('itemId');

  const {
    orders,
    loading: ordersLoading,
    addOrder,
    updateOrder,
  } = useProductionOrders();
  const { saveAcknowledgement } = useAcknowledgement();
  const { saveTechnicalVerification } = useTechnicalVerification();
  // Save failures (validation errors, or editing an order that is no longer in
  // Draft) must be reported here instead of navigating away as if saved.
  const [feedback, setFeedback] = useState(null);
  const toast = useToast();

  // ---- CPO item → Work Order handoff ----
  // `prefill` holds the values derived from the PERSISTED CPO item plus the
  // facts the banner shows; `conversionError` blocks the form when the link
  // does not resolve to a real CPO item marked for a Work Order.
  const [prefill, setPrefill] = useState(null);
  const [conversionError, setConversionError] = useState('');
  const [conversionLoading, setConversionLoading] = useState(
    Boolean(conversionCpoId && conversionItemId && !id)
  );
  // A double click on Save must not raise the same Work Order twice. The
  // backend's unique Work Order number is the final guard; this simply never
  // fires the second create.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!conversionCpoId || !conversionItemId || id) return undefined;
    let cancelled = false;
    // No synchronous setState here: `conversionLoading` already starts as true
    // for a conversion link, and the state below is only written once the
    // request settles.
    (async () => {
      try {
        const { cpo, item, itemNumber } = await loadCpoItemConversion(
          conversionCpoId,
          conversionItemId,
          'WO'
        );
        if (cancelled) return;
        setPrefill({
          values: workOrderPrefill(cpo, item, itemNumber),
          salesOrderId: cpo.id != null ? String(cpo.id) : '',
          cpoNo: cpo.soNo || String(cpo.id),
          customer: cpo.clientName || '',
          itemNumber,
          itemName: String(item.description || '').trim(),
          itemCode: String(item.sku || '').trim(),
        });
      } catch (err) {
        if (!cancelled) {
          setPrefill(null);
          setConversionError(
            err?.message || 'The Customer Purchase Order item could not be loaded.'
          );
        }
      } finally {
        if (!cancelled) setConversionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversionCpoId, conversionItemId, id]);

  // Work Orders already raised against the same CPO whose item carries the
  // same item code / description — surfaced before the user saves so a retry
  // does not silently raise a second Work Order for one CPO item.
  const existingWorkOrder = useMemo(() => {
    if (!prefill || (!prefill.itemName && !prefill.itemCode)) return null;
    const code = prefill.itemCode.toLowerCase();
    const name = prefill.itemName.toLowerCase();
    // Editing a CPO creates a REVISION with a new id and a "(n)" suffix on the
    // number, so the same CPO is matched by id OR by number prefix.
    const cpoNo = String(prefill.values?.salesOrderNumber || prefill.cpoNo || '').trim();
    const sameCpo = (order) => {
      if (String(order.salesOrderId || '') === prefill.salesOrderId) return true;
      const stored = String(order.salesOrderNumber || '').trim();
      return Boolean(
        cpoNo && stored && (stored === cpoNo || stored.startsWith(cpoNo) || cpoNo.startsWith(stored))
      );
    };
    return orders.find((order) => {
      if (!sameCpo(order)) return false;
      if (!Array.isArray(order.items)) return false;
      return order.items.some((it) => {
        const itCode = String(it.productCode || '').trim().toLowerCase();
        const itName = String(it.productName || '').trim().toLowerCase();
        return code ? itCode === code : name && itName === name;
      });
    }) || null;
  }, [orders, prefill]);

  const editingOrder = useMemo(() => {
    if (!id) return null;
    return (
      orders.find((o) => String(o.id) === String(id)) ||
      orders.find((o) => String(o.backendId) === String(id)) ||
      null
    );
  }, [id, orders]);

  const nextWorkOrder = useMemo(() => nextWorkOrderNumber(orders), [orders]);
  const existingNumbers = useMemo(() => orders.map((o) => o.workOrder), [orders]);

  const backToList = () => navigate('/production/orders');

  const saveWorkOrder = async (values) => {
    if (editingOrder) {
      // The server only edits Work Orders in Draft status. Saving a non-Draft
      // order returned a 500 that replaced the whole page with the global error
      // screen, so refuse here and explain why (covers deep links to
      // /production/orders/:id/edit as well as the row action).
      if (editingOrder.status !== 'Draft') {
        setFeedback({
          message: `Work Order ${editingOrder.workOrder} cannot be edited — its status is ${editingOrder.status}. Only Work Orders in Draft status can be edited.`,
          tone: 'error',
        });
        return;
      }
      const result = await updateOrder({ ...editingOrder, ...values });
      if (!result?.ok) {
        setFeedback({
          message: result?.error || `Could not save ${editingOrder.workOrder}.`,
          tone: 'error',
        });
        return;
      }
      // The Work Order itself is saved at this point. Item attachment changes are
      // applied afterwards because a NEWLY ADDED item only receives its id from
      // this save; a failure is reported without claiming the order failed.
      const failures = await syncItemAttachments(result.order, values.items);
      if (failures.length > 0) {
        toast.error(
          `${editingOrder.workOrder} was saved, but ${failures.length} item attachment change`
          + `${failures.length === 1 ? '' : 's'} could not be applied: ${failures.join(' | ')}`
        );
      }
      navigate('/production/orders');
      return;
    }

    // Create + supporting Acknowledgement / Technical Verification records
    // (same behaviour as the previous list-page flow).
    const createResult = await addOrder({
      ...values,
      progress: 0,
      status: values.status || 'Draft',
      productionApprovedBy: '',
      productionApprovedAt: '',
      adminApprovedBy: '',
      adminApprovedAt: '',
    });

    // Nothing was created — keep the form open with the reason. Previously the
    // page navigated to the list and even wrote Acknowledgement / Technical
    // Verification rows for a Work Order number that had never been persisted.
    if (!createResult?.ok) {
      setFeedback({
        message: createResult?.error || 'Could not create the Work Order.',
        tone: 'error',
      });
      return;
    }

    const created = createResult.order;
    const woNumber = created?.workOrder || values.workOrder;

    // Item attachments for the Work Order that has just been created. The item
    // rows (and their ids) exist now, so each staged file is uploaded against the
    // item it was picked for.
    const attachmentFailures = await syncItemAttachments(created, values.items);
    if (attachmentFailures.length > 0) {
      toast.error(
        `${woNumber} was created, but ${attachmentFailures.length} item attachment`
        + `${attachmentFailures.length === 1 ? '' : 's'} could not be uploaded: ${attachmentFailures.join(' | ')}`
      );
    }
    saveAcknowledgement({
      workOrderId: woNumber,
      workOrderNumber: woNumber,
      productionOrderNumber: values.salesOrderNumber || woNumber,
      createdDate: new Date().toISOString(),
      acknowledgedBy: '',
      acknowledgementDateTime: '',
      status: 'Pending',
      remarks: '',
    });
    // Each item's Technical Verification row must be keyed on the item's real
    // database id — the same value the Technical Verification module writes
    // (`String(item.id)`). The create request never carries item ids (the server
    // creates those rows), so this used to persist the form's own client-side
    // slug instead. That produced a SECOND Technical Verification row per item
    // (one on the slug, one on the real id), and because the lookups return the
    // first match, the Work Order then reported whichever row came back first —
    // so a verified item could still read "Pending".
    const createdItems = Array.isArray(created?.items) ? created.items : [];
    const items = values.items || [];
    if (items.length > 0) {
      items.forEach((item, index) => {
        const savedItem =
          createdItems.find((ci) => ci?.productName === item.productName) ||
          createdItems[index] ||
          null;
        saveTechnicalVerification({
          workOrderId: woNumber,
          itemId: String(savedItem?.id ?? item.productName ?? ''),
          workOrderNumber: woNumber,
          productionOrderNumber: values.salesOrderNumber || woNumber,
          itemProduct: item.productName || item.product || '',
          itemCode: item.productCode || item.itemCode || '',
          productionType: item.productionType || '',
          drawingNumber: item.drawingNumber || '',
          drawingRevision: '',
          patternNumber: item.patternNumber || '',
          specification: '',
          requiredQuantity: item.quantity || 0,
          materialGrade: '',
          technicalInstructions: '',
          verifiedBy: '',
          verificationDateTime: '',
          verificationStatus: 'Pending',
          verificationRemarks: '',
        });
      });
    } else {
      saveTechnicalVerification({
        workOrderId: woNumber,
        itemId: '',
        workOrderNumber: woNumber,
        productionOrderNumber: values.salesOrderNumber || woNumber,
        itemProduct: values.product || '',
        productionType: values.productionType || '',
        drawingNumber: values.drawingNumber || '',
        drawingRevision: '',
        specification: '',
        requiredQuantity: values.quantity || 0,
        materialGrade: '',
        technicalInstructions: '',
        verifiedBy: '',
        verificationDateTime: '',
        verificationStatus: 'Pending',
        verificationRemarks: '',
      });
    }
    navigate('/production/orders');
  };

  /**
   * Save entry point handed to the form. The in-flight guard keeps a double
   * click from firing the same create twice (the backend's unique Work Order
   * number remains the final guard).
   */
  const handleSubmit = async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await saveWorkOrder(values);
    } finally {
      submittingRef.current = false;
    }
  };

  const isEdit = !!id;
  const conversionActive = Boolean(conversionCpoId && conversionItemId && !isEdit);

  return (
    <div className="wo-page">
      <ActionFeedback
        message={feedback?.message}
        tone={feedback?.tone}
        onDismiss={() => setFeedback(null)}
      />

      {/* ===== PAGE HEADER — same visual language as Production Orders ===== */}
      <div className="wo-header">
        <div className="wo-header-left">
          <div className="wo-breadcrumb">
            <span
              className="wo-bc-link"
              role="link"
              tabIndex={0}
              onClick={() => navigate('/production')}
            >
              Dashboard
            </span>
            <span className="bc-sep">›</span>
            <span className="bc-current">Production</span>
            <span className="bc-sep">›</span>
            <span
              className="wo-bc-link"
              role="link"
              tabIndex={0}
              onClick={backToList}
            >
              Production Work Orders
            </span>
            <span className="bc-sep">›</span>
            <span className="bc-current">{isEdit ? 'Edit Work Order' : 'Create Work Order'}</span>
          </div>
          <h1 className="wo-title">
            <Icon name="clipboard" size={22} />
            {isEdit ? `Edit ${editingOrder?.workOrder || 'Work Order'}` : 'Create Work Order'}
          </h1>
          <p className="wo-subtitle">
            {isEdit
              ? `Update ${editingOrder?.workOrder || 'the work order'} and its production items.`
              : 'Raise a new Work Order from a Customer Purchase Order (CPO) and define its production items.'}
          </p>
        </div>
        <button type="button" className="wo-back-btn" onClick={backToList}>
          <Icon name="chevron-left" size={14} /> Back to Production Work Orders
        </button>
      </div>

      {/* ===== FORM / LOADING / NOT FOUND ===== */}
      {conversionActive && conversionLoading ? (
        <div className="wo-state-card">
          <span className="wo-spinner" aria-hidden="true" />
          <p>Loading the Customer Purchase Order item…</p>
        </div>
      ) : conversionActive && conversionError ? (
        <div className="wo-state-card">
          <span className="wo-state-icon">
            <Icon name="search" size={22} />
          </span>
          <h3>Conversion not available</h3>
          <p>{conversionError}</p>
          <p>
            Nothing was converted. Open the Customer Purchase Order, check the item&apos;s
            Convert To choice and save it, then use Convert again.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/production/orders/new', { replace: true })}
          >
            Create a blank Work Order
          </button>
          <button type="button" className="btn btn-secondary" onClick={backToList}>
            Back to Production Work Orders
          </button>
        </div>
      ) : ordersLoading ? (
        <div className="wo-state-card">
          <span className="wo-spinner" aria-hidden="true" />
          <p>Loading work orders…</p>
        </div>
      ) : isEdit && !editingOrder ? (
        <div className="wo-state-card">
          <span className="wo-state-icon">
            <Icon name="search" size={22} />
          </span>
          <h3>Work Order not found</h3>
          <p>
            {`No work order matches "${id}". It may have been deleted or the link is incorrect.`}
          </p>
          <button type="button" className="btn btn-secondary" onClick={backToList}>
            Back to Production Work Orders
          </button>
        </div>
      ) : (
        <>
          {prefill && (
            <div className="wo-convert-note">
              <Icon name="clipboard" size={16} />
              <div>
                <strong>
                  Pre-filled from Customer Purchase Order {prefill.cpoNo}, item {prefill.itemNumber}
                </strong>
                <p>
                  {prefill.itemName ? `${prefill.itemName} — ` : ''}
                  nothing is created until you save this form. Review the item, quantity,
                  dates and production type before saving.
                </p>
                {existingWorkOrder && (
                  <p className="wo-convert-warn">
                    Work Order {existingWorkOrder.workOrder} already exists for this CPO item —
                    check it before raising another one.
                  </p>
                )}
              </div>
            </div>
          )}
          <ProductionOrderForm
            key={isEdit ? `edit-${editingOrder?.id || id}` : (prefill ? `cpo-${conversionCpoId}-${conversionItemId}` : 'create')}
            asPage
            orderBackendId={editingOrder?.backendId ?? null}
            initialValues={prefill?.values || editingOrder || undefined}
            existingNumbers={existingNumbers}
            nextWorkOrder={nextWorkOrder}
            orders={orders}
            title={isEdit ? `Edit ${editingOrder?.workOrder || 'Work Order'}` : 'Create Work Order'}
            onSubmit={handleSubmit}
            onCancel={backToList}
          />
        </>
      )}
    </div>
  );
}

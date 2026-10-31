import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Icon from '../components/icons/Icon';
import Modal from '../components/production/Modal';
import ActionFeedback from '../components/production/ActionFeedback';
import ProductionStatusBadge from '../components/production/ProductionStatusBadge';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useProductionEntry } from '../context/ProductionEntryContext';
import {
  PRODUCTION_TYPES,
  ENTRY_STATUSES,
  HOLD_REASONS,
  SKIP_REASONS,
  workflowForType,
  productionTypeOf,
  effectiveCurrentStage,
  nextEntryStage,
  pendingQuantity,
  overallStatusFor,
  currentStageFor,
  progressFor,
} from '../data/entries';
import { formatDate } from '../utils/format';
import './ProductionEntry.css';

const emptyForm = () => ({
  productionType: 'Casting',
  workOrder: '',
  stage: '',
  inputQuantity: '',
  outputQuantity: '',
  rejectedQuantity: '',
  operator: '',
  date: new Date().toISOString().slice(0, 10),
  remarks: '',
  status: 'In Progress',
  holdReason: '',
  skipReason: '',
  editingId: null,
});

/**
 * Recompute the order's overall status / current stage / progress
 * from its stage entries (the system calculates these — never the
 * user) and persist the derived values onto the order record.
 */
const syncOrderFromEntries = (order, updatedEntries, updateOrder, ackRecord, tvRecord) => {
  if (!order) return;
  const status = overallStatusFor(order, updatedEntries, ackRecord, tvRecord);
  const currentStage = currentStageFor(order, updatedEntries, ackRecord, tvRecord);
  const progress = progressFor(order, updatedEntries, ackRecord, tvRecord);
  if (
    status !== order.status ||
    currentStage !== order.currentStage ||
    progress !== (order.progress || 0)
  ) {
    updateOrder({ ...order, status, currentStage, progress });
  }
};

/**
 * /production/entry — hybrid production entry.
 *
 * AUTOMATIC flow: select a Production Order → its current stage is
 * loaded with the previous stage's output as input → "Save & Complete
 * Stage" marks it completed, advances the order's Current Stage and
 * carries the output forward.
 *
 * MANUAL flow: pick any Production Type / Production Order / Stage →
 * "Save Entry" records it without advancing the workflow.
 *
 * Both modes write to the SAME stage-entry records (one per order +
 * stage) — no duplicate data, one shared process history.
 */
export default function ProductionEntry() {
  const { orders, updateOrder } = useProductionOrders();
  const { entries, saveEntry: upsertEntry, deleteEntry, getEntry } = useProductionEntry();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [actionModal, setActionModal] = useState(null); // { type: 'hold'|'skip', entry, reason, remarks }

  const selectedOrder = orders.find((order) => order.workOrder === form.workOrder);
  const selectedType = form.productionType;
  const flow = workflowForType(selectedType);

  // Orders of the selected production type only.
  const typeOrders = useMemo(
    () => orders.filter((order) => productionTypeOf(order) === selectedType),
    [orders, selectedType]
  );
  const orderOptions = typeOrders.map((order) => ({
    value: order.workOrder,
    label: order.workOrder,
  }));

  // Stage entries for the selected Work Order (shared history).
  const historyEntries = useMemo(
    () =>
      selectedOrder
        ? entries
            .filter((entry) => entry.workOrderId === selectedOrder.workOrder)
            .sort((a, b) => (a.date < b.date ? -1 : 1))
        : [],
    [entries, selectedOrder]
  );

  const set = (key) => (e) => {
    const value = e.target.value;
    if (key === 'productionType') {
      // Changing the type resets the order/stage selection.
      setForm((prev) => ({
        ...emptyForm(),
        productionType: value,
        date: prev.date,
      }));
      setError('');
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** Output of the stage before `stage` in the workflow (default next-stage input). */
  const previousOutput = (po, type, stage) => {
    const stageFlow = workflowForType(type);
    const index = stageFlow.indexOf(stage);
    if (index <= 0) return null;
    const prevEntry = getEntry(po, stageFlow[index - 1]);
    return prevEntry ? prevEntry.outputQuantity : null;
  };

  /** Load a stage into the form — existing entry prefills (edit), else master defaults. */
  const loadStage = (wo, type, stage) => {
    const order = orders.find((o) => o.workOrder === wo);
    const existing = getEntry(wo, stage);
    setForm((prev) => {
      const input =
        existing?.inputQuantity ?? previousOutput(wo, type, stage) ?? order?.quantity ?? '';
      return {
        ...prev,
        productionType: type,
        workOrder: wo,
        stage,
        inputQuantity: input === '' ? '' : String(input),
        outputQuantity: existing ? String(existing.outputQuantity) : '',
        rejectedQuantity: existing ? String(existing.rejectedQuantity) : '',
        operator: existing?.operator ?? prev.operator,
        date: existing?.date ?? prev.date,
        remarks: existing?.remarks ?? '',
        status: existing?.status ?? 'In Progress',
        holdReason: existing?.holdReason ?? '',
        skipReason: existing?.skipReason ?? '',
        editingId: existing?.id ?? null,
      };
    });
    setError('');
  };

  /**
   * Apply a status-only change to an existing entry (Hold / Resume /
   * Skip) and re-derive the Work Order's overall status.
   */
  const changeEntryStatus = (entry, patch) => {
    const updated = { ...entry, ...patch, id: entry.id, updatedAt: new Date().toISOString() };
    upsertEntry(updated);
    const order = orders.find((o) => o.workOrder === entry.workOrderId);
    const updatedEntries = [
      ...entries.filter((e) => e.workOrderId !== entry.workOrderId || e.stage !== entry.stage),
      updated,
    ];
    syncOrderFromEntries(order, updatedEntries, updateOrder);
    return updated;
  };

  const selectWorkOrder = (wo) => {
    const order = orders.find((o) => o.workOrder === wo);
    if (!order) {
      setForm((prev) => ({ ...prev, workOrder: '', stage: '' }));
      return;
    }
    loadStage(wo, productionTypeOf(order), effectiveCurrentStage(order));
  };

  // Deep link from Production Orders (Continue) — preselect the Work Order.
  useEffect(() => {
    const wo = searchParams.get('order');
    if (wo) selectWorkOrder(wo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectStage = (stage) => {
    if (!form.workOrder) {
      setError('Select a Work Order first.');
      return;
    }
    loadStage(form.workOrder, form.productionType, stage);
  };

  const validate = (values) => {
    if (!values.productionType) return 'Please select a production type.';
    if (!values.workOrder) return 'Please select a Work Order.';
    if (!values.stage) return 'Please select a stage.';
    if (!String(values.inputQuantity).trim()) return 'Input quantity is required.';
    if (Number(values.inputQuantity) <= 0) return 'Input quantity must be greater than zero.';
    if (!values.operator.trim()) return 'Operator is required.';
    if (!values.date) return 'Date is required.';
    if (Number(values.outputQuantity) < 0) return 'Output quantity cannot be negative.';
    if (Number(values.rejectedQuantity) < 0) return 'Rejected quantity cannot be negative.';
    if (Number(values.outputQuantity) + Number(values.rejectedQuantity) > Number(values.inputQuantity)) {
      return 'Output + rejected quantity cannot exceed the input quantity.';
    }
    return null;
  };

  const saveEntry = (completeStage) => {
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    const order = orders.find((o) => o.workOrder === form.workOrder);
    // A stage explicitly on Hold or Skipped keeps that status even
    // when "Save & Complete Stage" is pressed — only an active stage
    // can be completed.
    const recordStatus = ['Hold', 'Skipped'].includes(form.status)
      ? form.status
      : completeStage
        ? 'Completed'
        : form.status;
    const record = {
      workOrderId: form.workOrder,
      productionType: form.productionType,
      stage: form.stage,
      inputQuantity: Number(form.inputQuantity),
      outputQuantity: Number(form.outputQuantity) || 0,
      rejectedQuantity: Number(form.rejectedQuantity) || 0,
      operator: form.operator.trim(),
      date: form.date,
      remarks: form.remarks.trim(),
      status: recordStatus,
      holdReason: recordStatus === 'Hold' ? form.holdReason.trim() : '',
      skipReason: recordStatus === 'Skipped' ? form.skipReason.trim() : '',
      ...(recordStatus === 'Skipped'
        ? {
            skippedBy: form.operator.trim(),
            skippedDate: form.date,
          }
        : {}),
    };
    upsertEntry(record);

    // OVERALL status / current stage / progress are derived from the
    // shared stage entries — the system calculates them, the user
    // never types them. Compute against the entries as they will be
    // after this save.
    const updatedEntries = [
      ...entries.filter(
        (entry) =>
          entry.workOrderId !== record.workOrderId || entry.stage !== record.stage
      ),
      record,
    ];
    syncOrderFromEntries(order, updatedEntries, updateOrder);

    if (!completeStage || recordStatus === 'Hold' || recordStatus === 'Skipped') {
      // Manual save (or hold/skip): never advances the workflow.
      setFeedback({ message: `Entry saved for ${record.stage} (${record.workOrderId}).`, tone: 'success' });
      setForm((prev) => ({ ...emptyForm(), productionType: prev.productionType }));
      setError('');
      return;
    }

    // Automatic flow: carry this stage's output forward as the next
    // stage's input.
    const next = nextEntryStage(form.productionType, record.stage);

    if (next === 'Completed') {
      setFeedback({
        message: `${record.stage} completed — Work Order ${record.workOrderId} is now completed.`,
        tone: 'success',
      });
      setForm((prev) => ({ ...emptyForm(), productionType: prev.productionType }));
    } else {
      setFeedback({
        message: `${record.stage} completed — current stage is now ${next}.`,
        tone: 'success',
      });
      // Carry this stage's output forward as the next stage's input.
      // If the next stage already has an entry (e.g. added manually
      // earlier), prefill from it so that data is never lost.
      const existingNext = getEntry(record.workOrderId, next);
      setForm((prev) => ({
        ...emptyForm(),
        productionType: prev.productionType,
        workOrder: prev.workOrder,
        stage: next,
        inputQuantity: String(existingNext?.inputQuantity ?? record.outputQuantity),
        outputQuantity: existingNext ? String(existingNext.outputQuantity) : '',
        rejectedQuantity: existingNext ? String(existingNext.rejectedQuantity) : '',
        operator: existingNext?.operator ?? prev.operator,
        date: existingNext?.date ?? prev.date,
        remarks: existingNext?.remarks ?? '',
        status: existingNext?.status ?? 'In Progress',
        editingId: existingNext?.id ?? null,
      }));
    }
    setError('');
  };

  const confirmDelete = () => {
    deleteEntry(deleting.id);
    // Re-derive the Work Order's overall status/current stage after
    // removing the entry (deleting a stage may roll the order back to
    // an earlier point in the workflow).
    const order = orders.find((o) => o.workOrder === deleting.workOrderId);
    const updatedEntries = entries.filter((entry) => entry.id !== deleting.id);
    syncOrderFromEntries(order, updatedEntries, updateOrder);
    setDeleting(null);
    setFeedback({ message: 'Stage entry deleted.', tone: 'success' });
  };

  const masterFields = selectedOrder
    ? [
        { label: 'Work Order', value: selectedOrder.workOrder || '—' },
        { label: 'Sales Order', value: selectedOrder.salesOrderNumber || '—' },
        { label: 'Item Name', value: selectedOrder.product || '—' },
        { label: 'Planned Quantity', value: selectedOrder.quantity },
        { label: 'Batch Number', value: selectedOrder.batchNumber || '—' },
        ...(selectedOrder.productionType === 'Casting'
          ? [{ label: 'Pattern Number', value: selectedOrder.patternNumber || '—' }]
          : []),
        ...(selectedOrder.productionType === 'Fabrication'
          ? [{ label: 'Drawing Number', value: selectedOrder.drawingNumber || '—' }]
          : []),
        { label: 'Department', value: selectedOrder.department || '—' },
        { label: 'Start Date', value: formatDate(selectedOrder.startDate) },
        { label: 'Due Date', value: formatDate(selectedOrder.dueDate) },
        { label: 'Priority', value: selectedOrder.priority || '—' },
        { label: 'Current Stage', value: selectedOrder.currentStage || '—' },
      ]
    : [];

  const pending = pendingQuantity(form.inputQuantity, form.outputQuantity, form.rejectedQuantity);

  return (
    <div className="page">
      <PageHeader
        title="Production Entry"
        subtitle="Hybrid stage entry — automatic stage flow and manual stage entry share the same process records."
      />

      <ActionFeedback
        message={feedback?.message}
        tone={feedback?.tone}
        onDismiss={() => setFeedback(null)}
      />

      {/* Entry form */}
      <section className="settings-page-card">
        <div className="settings-page-head">
          <div>
            <h3 className="settings-page-title">
              {form.editingId ? `Edit ${form.stage} Entry` : 'New Stage Entry'}
            </h3>
            <p className="settings-page-subtitle">
              {form.editingId
                ? 'Updating the existing stage record — no duplicate is created.'
                : 'Select a Work Order to load its master information.'}
            </p>
          </div>
        </div>

        <form
          id="entry-form"
          className="po-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveEntry(false);
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Production Type *</span>
              <select className="form-select" value={form.productionType} onChange={set('productionType')}>
                {PRODUCTION_TYPES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span className="form-label">Work Order *</span>
              <select className="form-select" value={form.workOrder} onChange={(e) => selectWorkOrder(e.target.value)}>
                {!form.workOrder && <option value="">Select a Work Order…</option>}
                {orderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {orderOptions.length === 0 && (
                <span className="form-hint">
                  No {selectedType} Work Orders Available — create one in Production Work Orders first.
                </span>
              )}
            </label>

            <label className="form-field form-field-wide">
              <span className="form-label">Stage *</span>
              <select className="form-select" value={form.stage} onChange={(e) => selectStage(e.target.value)}>
                {!form.stage && <option value="">Select a stage…</option>}
                {flow.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="form-hint">
                Automatic flow: the order&apos;s current stage is loaded — use{' '}
                <strong>Save &amp; Complete Stage</strong> to advance. Manual entry: pick any stage and
                use <strong>Save Entry</strong>.
              </span>
            </label>
          </div>

          {selectedOrder && (
            <div className="entry-master">
              <div className="entry-master-title">
                <Icon name="clipboard" size={14} /> Master Information — read-only
              </div>
              <div className="entry-master-grid">
                {masterFields.map((field) => (
                  <div key={field.label} className="entry-master-item">
                    <span className="entry-master-label">{field.label}</span>
                    <span className="entry-master-value">{field.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Input Quantity *</span>
              <input
                type="number"
                min="0"
                className="form-input"
                value={form.inputQuantity}
                onChange={set('inputQuantity')}
                placeholder="0"
              />
            </label>

            <label className="form-field">
              <span className="form-label">Output Quantity</span>
              <input
                type="number"
                min="0"
                className="form-input"
                value={form.outputQuantity}
                onChange={set('outputQuantity')}
                placeholder="0"
              />
            </label>

            <label className="form-field">
              <span className="form-label">Rejected Quantity</span>
              <input
                type="number"
                min="0"
                className="form-input"
                value={form.rejectedQuantity}
                onChange={set('rejectedQuantity')}
                placeholder="0"
              />
            </label>

            <label className="form-field">
              <span className="form-label">Pending / Balance</span>
              <input className="form-input" value={pending} disabled />
              <span className="form-hint">Input − Output − Rejected (auto)</span>
            </label>

            <label className="form-field">
              <span className="form-label">Operator *</span>
              <input
                className="form-input"
                value={form.operator}
                onChange={set('operator')}
                placeholder="Operator name"
              />
            </label>

            <label className="form-field">
              <span className="form-label">Date *</span>
              <input type="date" className="form-input" value={form.date} onChange={set('date')} />
            </label>

            <label className="form-field">
              <span className="form-label">Status</span>
              <select className="form-select" value={form.status} onChange={set('status')}>
                {ENTRY_STATUSES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            {form.status === 'Hold' && (
              <label className="form-field">
                <span className="form-label">Hold Reason</span>
                <select className="form-select" value={form.holdReason} onChange={set('holdReason')}>
                  <option value="">Select a reason…</option>
                  {HOLD_REASONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <span className="form-hint">A held stage puts the Work Order on Hold.</span>
              </label>
            )}

            {form.status === 'Skipped' && (
              <label className="form-field">
                <span className="form-label">Skip Reason</span>
                <select className="form-select" value={form.skipReason} onChange={set('skipReason')}>
                  <option value="">Select a reason…</option>
                  {SKIP_REASONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <span className="form-hint">Skipped stages stay separate from Completed.</span>
              </label>
            )}

            <label className="form-field form-field-wide">
              <span className="form-label">Remarks</span>
              <textarea
                className="form-textarea"
                rows={2}
                value={form.remarks}
                onChange={set('remarks')}
                placeholder="Optional notes…"
              />
            </label>
          </div>

          {error && (
            <p className="form-error">
              <Icon name="info" size={14} /> {error}
            </p>
          )}

          <div className="entry-actions">
            <button type="submit" form="entry-form" className="btn btn-secondary">
              <Icon name="check" size={14} /> Save Entry
            </button>
            <button type="button" className="btn btn-primary" onClick={() => saveEntry(true)}>
              <Icon name="arrow-right" size={14} /> Save &amp; Complete Stage
            </button>
          </div>
        </form>
      </section>

      {/* Stage history for the selected order */}
      <section className="settings-page-card">
        <div className="settings-page-head">
          <div>
            <h3 className="settings-page-title">
              Stage History{selectedOrder ? ` — ${selectedOrder.workOrder}` : ''}
            </h3>
            <p className="settings-page-subtitle">
              {selectedOrder
                ? 'Shared process records for both entry modes. Click a stage to load it into the form.'
                : 'Select a Work Order above to view its stage history.'}
            </p>
          </div>
        </div>

        {selectedOrder ? (
          <>
            <div className="entry-workflow">
              {flow.map((stage) => {
                const entry = getEntry(selectedOrder.workOrder, stage);
                const completed = entry?.status === 'Completed';
                const skipped = entry?.status === 'Skipped';
                const held = entry?.status === 'Hold';
                const isCurrent =
                  selectedOrder.currentStage !== 'Completed' &&
                  stage === effectiveCurrentStage(selectedOrder);
                const stepClass = [
                  'entry-step',
                  completed ? ' completed' : '',
                  skipped ? ' skipped' : '',
                  held ? ' held' : '',
                  isCurrent && !completed && !skipped ? ' current' : '',
                ].join('');
                return (
                  <button
                    key={stage}
                    type="button"
                    className={stepClass}
                    onClick={() => selectStage(stage)}
                    title={entry ? `Edit ${stage} entry` : `Add ${stage} entry`}
                  >
                    <span className="entry-step-icon">
                      <Icon
                        name={completed ? 'check' : skipped ? 'skip-forward' : held ? 'pause' : isCurrent ? 'play' : 'clock'}
                        size={13}
                      />
                    </span>
                    <span className="entry-step-name">{stage}</span>
                    {entry && (
                      <span className="entry-step-qty">
                        {entry.outputQuantity}/{entry.inputQuantity}
                      </span>
                    )}
                  </button>
                );
              })}
              <span
                className={`entry-step${effectiveCurrentStage(selectedOrder) === 'Completed' ? ' completed' : ''}`}
              >
                <span className="entry-step-icon">
                  <Icon name="check" size={13} />
                </span>
                <span className="entry-step-name">Completed</span>
              </span>
            </div>

            {historyEntries.length > 0 ? (
              <div className="table-scroll">
                {/* Sticky grid (shared Production scope): the Stage column is
                    frozen at left: 0 and Actions at right: 0 while the middle
                    columns scroll. */}
                <table className="data-table sgrid sgrid-prod sgrid-actions">
                  <thead>
                    <tr>
                      <th className="sgrid-pin sgrid-first">Stage</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Rejected</th>
                      <th>Pending</th>
                      <th>Operator</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Hold Reason</th>
                      <th>Skip Reason</th>
                      <th className="sgrid-pin-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="cell-strong sgrid-pin sgrid-first">{entry.stage}</td>
                        <td>{entry.inputQuantity}</td>
                        <td>{entry.outputQuantity}</td>
                        <td>{entry.rejectedQuantity}</td>
                        <td>{pendingQuantity(entry.inputQuantity, entry.outputQuantity, entry.rejectedQuantity)}</td>
                        <td>{entry.operator}</td>
                        <td>{formatDate(entry.date)}</td>
                        <td>
                          <ProductionStatusBadge status={entry.status} />
                        </td>
                        <td className="cell-muted">{entry.holdReason || '—'}</td>
                        <td className="cell-muted">{entry.skipReason || '—'}</td>
                        <td className="sgrid-pin-actions">
                          <div className="row-actions">
                            {entry.status === 'In Progress' && (
                              <button
                                type="button"
                                className="btn-icon"
                                title="Hold stage"
                                aria-label={`Hold ${entry.stage}`}
                                onClick={() => setActionModal({ type: 'hold', entry, reason: '', remarks: '' })}
                              >
                                <Icon name="pause" size={16} />
                              </button>
                            )}
                            {entry.status === 'Hold' && (
                              <button
                                type="button"
                                className="btn-icon"
                                title="Resume stage"
                                aria-label={`Resume ${entry.stage}`}
                                onClick={() => {
                                  changeEntryStatus(entry, { status: 'In Progress', holdReason: '', remarks: entry.remarks });
                                  setFeedback({ message: `${entry.stage} resumed.`, tone: 'success' });
                                }}
                              >
                                <Icon name="rotate-ccw" size={16} />
                              </button>
                            )}
                            {!['Completed', 'Skipped'].includes(entry.status) && (
                              <button
                                type="button"
                                className="btn-icon"
                                title="Skip stage"
                                aria-label={`Skip ${entry.stage}`}
                                onClick={() => setActionModal({ type: 'skip', entry, reason: '', remarks: '' })}
                              >
                                <Icon name="skip-forward" size={16} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-icon"
                              title="Edit entry"
                              aria-label={`Edit ${entry.stage} entry`}
                              onClick={() => loadStage(entry.workOrderId, entry.productionType, entry.stage)}
                            >
                              <Icon name="edit" size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon btn-icon-danger"
                              title="Delete entry"
                              aria-label={`Delete ${entry.stage} entry`}
                              onClick={() => setDeleting(entry)}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="sf-empty">
                <span className="sf-empty-icon">
                  <Icon name="list" size={22} />
                </span>
                <h4>No stage entries yet</h4>
                <p>
                  Enter quantities above and press Save Entry or Save &amp; Complete Stage to create
                  the first process record.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="search" size={22} />
            </span>
            <h4>Select a Work Order</h4>
            <p>Its stage workflow and process history will appear here.</p>
          </div>
        )}
      </section>

      {deleting && (
        <Modal
          title="Delete Stage Entry"
          size="sm"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                <Icon name="trash" size={14} /> Delete
              </button>
            </>
          }
        >
          <p className="confirm-text">Are you sure you want to delete this stage entry?</p>
          <p className="confirm-subtext">
            <strong>{deleting.stage}</strong> · {deleting.workOrderId}
          </p>
        </Modal>
      )}

      {actionModal && (
        <Modal
          title={actionModal.type === 'hold' ? `Hold ${actionModal.entry.stage}` : `Skip ${actionModal.entry.stage}`}
          size="sm"
          onClose={() => setActionModal(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setActionModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={actionModal.type === 'skip' ? 'btn btn-secondary' : 'btn btn-primary'}
                onClick={() => {
                  const patch =
                    actionModal.type === 'hold'
                      ? { status: 'Hold', holdReason: actionModal.reason || 'Other', remarks: actionModal.remarks }
                      : {
                          status: 'Skipped',
                          skipReason: actionModal.reason || 'Other',
                          skippedBy: actionModal.entry.operator,
                          skippedDate: actionModal.entry.date || new Date().toISOString().slice(0, 10),
                          remarks: actionModal.remarks,
                        };
                  changeEntryStatus(actionModal.entry, patch);
                  setFeedback({
                    message:
                      actionModal.type === 'hold'
                        ? `${actionModal.entry.stage} is on hold.`
                        : `${actionModal.entry.stage} skipped.`,
                    tone: 'success',
                  });
                  setActionModal(null);
                }}
              >
                <Icon name={actionModal.type === 'hold' ? 'pause' : 'skip-forward'} size={14} />{' '}
                {actionModal.type === 'hold' ? 'Hold Stage' : 'Skip Stage'}
              </button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <label className="form-field" style={{ marginBottom: 12 }}>
              <span className="form-label">
                {actionModal.type === 'hold' ? 'Hold Reason' : 'Skip Reason'}
              </span>
              <select
                className="form-select"
                value={actionModal.reason}
                onChange={(e) => setActionModal((prev) => ({ ...prev, reason: e.target.value }))}
              >
                <option value="">Select a reason…</option>
                {(actionModal.type === 'hold' ? HOLD_REASONS : SKIP_REASONS).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">Remarks</span>
              <textarea
                className="form-textarea"
                rows={2}
                value={actionModal.remarks}
                onChange={(e) => setActionModal((prev) => ({ ...prev, remarks: e.target.value }))}
                placeholder="Optional notes…"
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}

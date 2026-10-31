import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Users, ChevronRight, Zap, Plus, ArrowLeft, AlertTriangle, Search } from 'lucide-react';
import salesOrderEActionService from '../../services/salesOrderEActionService';
import useManagedGrid from '../../hooks/useManagedGrid';
import useClickOutside from '../../hooks/useClickOutside';
import { defaultEActionColumns, E_ACTION_STATUS_OPTIONS } from '../../utils/salesOrderColumns';
import { cpoNo } from '../../utils/salesHelpers';
import {
  CreationActionBar,
  FormField,
  INPUT_BASE,
  SelectInput,
  TextArea,
  TextInput,
  useToast
} from '../../components/Common';
import '../crm/crm-erp.css';

/* ------------------------------------------------------------------
 * E-Action Create / Edit — the dedicated E-Actions page's create/edit form.
 * One E-Action is one row of `sales_order_e_actions`; this page writes and
 * reads exactly that record through the E-Action backend endpoints, using the
 * same fields, statuses and column configuration as the E-Actions list
 * (salesOrderColumns.js).
 *
 * A new record starts BLANK (only the real system defaults: status Pending and
 * today's Requested On). Nothing is copied from another E-Action.
 * ------------------------------------------------------------------ */

const SECTION =
  'bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden';

/* ------------------------------------------------------------------
 * Customer Purchase Order picker helpers.
 *
 * The CPO options endpoint (GET /sales-orders/e-actions/options) returns the
 * real SalesOrderOptionResponse projection — { id, soNo, clientId, clientName,
 * orderDate, itemCount } — which is also what the E-Action list's filters read.
 * The number is what the user recognises (CPO-2026-000004) and the customer is
 * what they search by, so both are shown; older payload shapes (`cpoNo` /
 * `customer`) are still honoured by the fallbacks.
 * ------------------------------------------------------------------ */
function cpoDisplayNo(cpo) {
  return cpoNo(cpo?.soNo ?? cpo?.cpoNo ?? '') || (cpo?.id != null ? `CPO #${cpo.id}` : '');
}

function cpoCustomer(cpo) {
  return cpo?.clientName || cpo?.customer || '';
}

function cpoOptionLabel(cpo) {
  const no = cpoDisplayNo(cpo);
  const customer = cpoCustomer(cpo);
  return customer ? `${no} — ${customer}` : no;
}

/** Everything a CPO can be found by: number, customer, order date, record id. */
function cpoSearchText(cpo) {
  return [cpoDisplayNo(cpo), cpoCustomer(cpo), cpo?.orderDate, cpo?.id]
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase();
}

/**
 * CpoSearchSelect — the "Customer Purchase Order" field of this form.
 *
 * This field used to be a plain <select> over the CPO options, which meant
 * scrolling a long list to find one order. It is now the app's standard
 * "type-or-select" dropdown (the same pattern as ClientLookup / the CPR
 * combobox), fed by the SAME existing service call:
 *
 *   · focus / click            → browse the existing CPOs (number + customer)
 *   · type                     → filters on CPO number, customer, order date
 *                                and record id
 *   · ↑ ↓ Enter Tab Escape     → keyboard-only search and selection
 *   · choosing an option       → onChange(Number(cpo.id)): the form state gets
 *                                the REAL record id of that CPO, never the
 *                                typed display text
 *   · text that matches nothing → reported through onManualReference and kept
 *                                as the action's manual CPO reference, so an
 *                                E-Action can be saved for an order that has no
 *                                CPO record here. Nothing is created for it and
 *                                no CPO row is invented
 *
 * The list renders in a fixed overlay (like ClientLookup) so the section's
 * `overflow-hidden` can never clip it.
 */
function CpoSearchSelect({
  value,
  reference = '',
  cpos = [],
  loading = false,
  disabled = false,
  error = false,
  onChange,
  onManualReference
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => cpos.find((c) => String(c?.id) === String(value)) || null,
    [cpos, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cpos;
    return cpos.filter((c) => cpoSearchText(c).includes(q));
  }, [cpos, query]);

  const typed = query.trim();
  const noMatch = typed.length > 0 && filtered.length === 0;
  const activeOption = open ? filtered[highlight] : null;

  const positionList = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const width = Math.max(rect.width, 320);
    const height = 288;
    let left = Math.max(8, rect.left);
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < height && rect.top > height;
    setPos({
      left,
      width,
      top: dropUp ? rect.top - height - 4 : rect.bottom + 4,
      maxHeight: dropUp ? Math.min(height, rect.top - 16) : Math.min(height, spaceBelow - 16)
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    positionList();
    // …again once the browser has laid the list out, and whenever the field
    // itself moves or resizes (a sidebar toggle, a scrollbar appearing, a
    // window/panel resize), so the overlay can never be left behind.
    const frame = requestAnimationFrame(positionList);
    const onMove = () => positionList();
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onMove);
    if (observer) {
      if (inputRef.current) observer.observe(inputRef.current);
      observer.observe(document.body);
    }
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      observer?.disconnect();
    };
  }, [open, positionList]);

  // Keep the arrow-key highlight in view while stepping through the list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  /**
   * Close the list. Typed text that matches no CPO is NOT an error: it is
   * handed to the form as this action's manual CPO reference, so the record can
   * be saved for an order that is not one of the CPO records here. Text that
   * DOES match an existing CPO is simply discarded when no option was chosen —
   * the user can pick it from the list instead.
   */
  const close = useCallback(
    (keepTypedText) => {
      if (keepTypedText && noMatch) onManualReference?.(typed);
      setQuery('');
      setOpen(false);
      setHighlight(0);
    },
    [noMatch, typed, onManualReference]
  );

  useClickOutside([wrapRef, listRef], () => close(true), open);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setHighlight(0);
  };

  /** Commit one existing CPO — its record id, never the typed display text. */
  const select = (cpo) => {
    if (!cpo || cpo.id == null) return;
    onChange(Number(cpo.id));
    setQuery('');
    setOpen(false);
    setHighlight(0);
  };

  const onKeyDown = (event) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
      else close(true);
    } else if (event.key === 'Tab') {
      if (filtered[highlight]) select(filtered[highlight]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Customer Purchase Order"
        aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : selected ? cpoOptionLabel(selected) : reference}
        placeholder={
          loading && cpos.length === 0
            ? 'Loading Customer Purchase Orders...'
            : 'Type a CPO number, customer or new CPO reference'
        }
        onChange={(event) => {
          setOpen(true);
          setQuery(event.target.value);
          setHighlight(0);
        }}
        onFocus={openList}
        onKeyDown={onKeyDown}
        // Leaving the field keeps whatever the user typed as the CPO reference
        // (the option list prevents this blur when an option is clicked).
        onBlur={() => close(true)}
        className={`${INPUT_BASE} ${error ? 'border-rose-400' : ''} pr-8 disabled:cursor-not-allowed disabled:opacity-60`}
      />
      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />

      {open &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Customer Purchase Orders"
            className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-xl overflow-y-auto py-1"
            style={{
              left: pos?.left,
              width: pos?.width,
              top: pos?.top,
              maxHeight: pos?.maxHeight,
              display: pos ? 'block' : 'none'
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {loading && cpos.length === 0 && (
              <div className="px-3 py-2.5 text-xs text-slate-400">Loading Customer Purchase Orders...</div>
            )}
            {!loading && cpos.length === 0 && (
              <div className="px-3 py-2.5 text-xs text-slate-400">
                No Customer Purchase Orders exist yet — create one from the CPO List first.
              </div>
            )}
            {noMatch && (
              <div className="px-3 py-2.5 text-xs text-slate-500">
                “{typed}” is not in the CPO list — press Enter (or click away) to save it as the CPO reference.
              </div>
            )}
            {filtered.map((cpo, index) => (
              <button
                key={cpo.id}
                type="button"
                id={`${listId}-${cpo.id}`}
                role="option"
                aria-selected={String(cpo.id) === String(value)}
                data-active={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => select(cpo)}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer ${
                  index === highlight ? 'bg-slate-50' : ''
                }`}
              >
                <span className="block text-xs font-semibold text-slate-700">{cpoDisplayNo(cpo)}</span>
                <span className="block text-[10px] text-slate-400">
                  {cpoCustomer(cpo) || 'No customer on record'}
                  {cpo.orderDate ? ` · ${String(cpo.orderDate).slice(0, 10)}` : ''}
                  {cpo.itemCount ? ` · ${cpo.itemCount} item${cpo.itemCount === 1 ? '' : 's'}` : ''}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
      <span className="w-7 h-7 rounded-lg bg-[#E8F0EE] text-[#0B4A3D] flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <h2 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider">{title}</h2>
    </div>
  );
}

export default function EActionFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const LIST_ROUTE = '/sales-orders/e-actions';

  const [form, setForm] = useState({
    // Exactly one of the two addresses the E-Action: the selected CPO's record
    // id, or the CPO reference typed for an order that is not a CPO record here.
    salesOrderId: searchParams.get('cpoId') || '',
    cpoReference: '',
    participantTeam: '',
    assignedAction: '',
    assignedTo: '',
    status: 'Pending',
    requestedOn: new Date().toISOString().slice(0, 10),
    startedOn: '',
    completedOn: '',
    result: '',
    remarks: '',
    customFields: {}
  });
  const [cpos, setCpos] = useState([]);
  const [cposLoading, setCposLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Guards against a double-click / repeated submit firing two POSTs before
  // React re-renders the disabled Save button (one action = one record).
  const savingRef = useRef(false);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState(null);

  // The SAME persisted column configuration the CPO form's E-Action grid uses
  // (grid key `sales.eactions.salesOrder`), so a user-defined column added
  // there is available here — configuration only, never another row's values.
  const managed = useManagedGrid({
    gridKey: 'sales.eactions.salesOrder',
    defaults: defaultEActionColumns,
    enabled: true,
    itemNoun: 'E-Action',
    rowCount: 1
  });
  const customColumns = useMemo(
    () => managed.visibleColumns.filter((c) => !c.system),
    [managed.visibleColumns]
  );

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const setCustomField = (columnId, value) =>
    setForm((prev) => ({ ...prev, customFields: { ...(prev.customFields || {}), [columnId]: value } }));

  // ---- real CPO options (the same current records the CPO list shows) ----
  useEffect(() => {
    let cancelled = false;
    salesOrderEActionService
      .options()
      .then((data) => {
        if (!cancelled) setCpos(data?.cpos || []);
      })
      .catch(() => {
        if (!cancelled) setCpos([]);
      })
      .finally(() => {
        if (!cancelled) setCposLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- load the real E-Action when editing ----
  const load = useCallback(async () => {
    if (!isEdit) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await salesOrderEActionService.get(id);
      const row = res?.data ?? res;
      if (!row?.id) {
        setLoadError('This E-Action no longer exists.');
        return;
      }
      setForm({
        salesOrderId: row.salesOrderId || '',
        cpoReference: row.cpoReference || '',
        participantTeam: row.participantTeam || '',
        assignedAction: row.assignedAction || '',
        assignedTo: row.assignedTo || '',
        status: row.status || 'Pending',
        requestedOn: row.requestedOn || '',
        startedOn: row.startedOn || '',
        completedOn: row.completedOn || '',
        result: row.result || '',
        remarks: row.remarks || '',
        customFields: { ...(row.customFields || {}) }
      });
    } catch (err) {
      setLoadError(err?.message || 'Failed to load the E-Action');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    load();
  }, [load]);

  // The CPO reference typed for an order that is not one of our CPO records.
  const manualCpoReference = String(form.cpoReference || '').trim();

  const validate = () => {
    const next = {};
    // Either address is valid: an existing Customer Purchase Order, or the CPO
    // reference typed for an order this system has no CPO record for. Only
    // "neither" is an error.
    if (!form.salesOrderId && !manualCpoReference) {
      next.salesOrderId =
        'Select an existing Customer Purchase Order, or type the CPO reference this E-Action belongs to.';
    }
    if (!String(form.participantTeam).trim()) next.participantTeam = 'Participant / Team is required.';
    if (!String(form.assignedAction).trim()) next.assignedAction = 'Assigned Action is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /**
   * The CPO picker committed a real record: store the CPO's own record id and
   * drop the manual reference, so the row is addressed by exactly one of them.
   */
  const handleCpoChange = (salesOrderId) => {
    setForm((prev) => ({ ...prev, salesOrderId, cpoReference: '' }));
    setErrors((prev) => (prev.salesOrderId ? { ...prev, salesOrderId: undefined } : prev));
  };

  /**
   * The CPO field holds text that is not one of our CPO records: keep it as the
   * action's manual CPO reference (the form no longer refuses to save it) and
   * clear any previously selected CPO. No CPO record is created for the text.
   */
  const handleManualReference = (text) => {
    const value = String(text || '').trim();
    setForm((prev) => ({ ...prev, salesOrderId: '', cpoReference: value }));
    setErrors((prev) => (prev.salesOrderId ? { ...prev, salesOrderId: undefined } : prev));
  };

  const payload = () => ({
    // Sent for the standalone endpoints: the typed reference is stored on the
    // row when there is no CPO id to link (and dropped when there is one).
    cpoReference: form.salesOrderId ? '' : manualCpoReference,
    participantTeam: String(form.participantTeam).trim(),
    assignedAction: String(form.assignedAction).trim(),
    assignedTo: String(form.assignedTo).trim(),
    status: form.status,
    requestedOn: form.requestedOn,
    startedOn: form.startedOn,
    completedOn: form.completedOn,
    result: form.result,
    remarks: form.remarks,
    customFields: form.customFields
  });

  const save = async ({ andNew = false } = {}) => {
    if (savingRef.current) return;
    if (!validate()) {
      toast.error('Please correct the highlighted fields.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (isEdit) {
        // A row raised against a typed CPO reference has no CPO id to address it
        // by, so the standalone (own-id) endpoint is used for it.
        if (form.salesOrderId) await salesOrderEActionService.update(form.salesOrderId, id, payload());
        else await salesOrderEActionService.updateStandalone(id, payload());
        toast.success('E-Action updated');
        navigate(`${LIST_ROUTE}/${id}`);
        return;
      }
      const res = form.salesOrderId
        ? await salesOrderEActionService.create(form.salesOrderId, payload())
        : await salesOrderEActionService.createStandalone(payload());
      const created = res?.data ?? res;
      toast.success('E-Action created');
      if (andNew) {
        setForm({
          // Same CPO (record or manual reference) as the record just saved.
          salesOrderId: form.salesOrderId,
          cpoReference: form.cpoReference,
          participantTeam: '',
          assignedAction: '',
          assignedTo: '',
          status: 'Pending',
          requestedOn: new Date().toISOString().slice(0, 10),
          startedOn: '',
          completedOn: '',
          result: '',
          remarks: '',
          customFields: {}
        });
        setErrors({});
      } else if (created?.id) {
        navigate(`${LIST_ROUTE}/${created.id}`);
      } else {
        navigate(LIST_ROUTE);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save the E-Action');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="purchase-page cpr-page">
        <div className="prm-card prm-card-body p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">E-Action unavailable</h2>
          <p className="text-xs text-slate-400 mb-5">{loadError}</p>
          <button
            type="button"
            onClick={() => navigate(LIST_ROUTE)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to E-Actions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-create-scope purchase-page cpr-page">
      {/* ===== BREADCRUMB (Sales → Sales Execution → Customer Purchase Orders → E-Actions) ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate('/sales-orders')}>Customer Purchase Orders</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate(LIST_ROUTE)}>E-Actions</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="bc-current">{isEdit ? 'Edit' : 'New'}</span>
      </nav>

      {/* ===== PAGE HEADER ===== */}
      <div className="pr-page-header">
        <div>
          <h1>
            <Users size={20} />
            {isEdit ? 'Edit E-Action' : 'New E-Action'}
          </h1>
        </div>
        <div className="pr-page-header-actions">
          <button
            type="button"
            onClick={() => navigate(LIST_ROUTE)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold text-slate-600 bg-surface border border-slate-200 hover:border-[#0B4A3D] hover:text-[#0B4A3D] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to E-Actions
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ===== SECTION 1: E-ACTION DETAILS ===== */}
          <div className={SECTION}>
            <SectionHeader icon={Zap} title="E-Action Details" />
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField
                  label="Customer Purchase Order"
                  required
                  error={errors.salesOrderId}
                  hint={
                    manualCpoReference && !form.salesOrderId
                      ? `“${manualCpoReference}” is not in the CPO list — it will be saved as this E-Action's CPO reference.`
                      : 'Search by CPO number or customer and pick the matching CPO, or type a CPO reference that is not in the list.'
                  }
                  className="sm:col-span-2 lg:col-span-3"
                >
                  <CpoSearchSelect
                    value={form.salesOrderId}
                    reference={manualCpoReference}
                    cpos={cpos}
                    loading={cposLoading}
                    disabled={isEdit}
                    error={Boolean(errors.salesOrderId)}
                    onChange={handleCpoChange}
                    onManualReference={handleManualReference}
                  />
                </FormField>

                <FormField label="Participant / Team" required error={errors.participantTeam}>
                  <TextInput
                    value={form.participantTeam}
                    onChange={(e) => setField('participantTeam', e.target.value)}
                    placeholder="e.g. Purchase Team"
                  />
                </FormField>

                <FormField label="Assigned Action" required error={errors.assignedAction} className="sm:col-span-2">
                  <TextInput
                    value={form.assignedAction}
                    onChange={(e) => setField('assignedAction', e.target.value)}
                    placeholder="What the participant / team has to do"
                  />
                </FormField>

                <FormField label="Assigned To">
                  <TextInput
                    value={form.assignedTo}
                    onChange={(e) => setField('assignedTo', e.target.value)}
                    placeholder="Person responsible"
                  />
                </FormField>

                <FormField label="Status">
                  <SelectInput value={form.status} onChange={(e) => setField('status', e.target.value)}>
                    {E_ACTION_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </SelectInput>
                </FormField>

                <FormField label="Requested On">
                  <TextInput type="date" value={form.requestedOn ? String(form.requestedOn).slice(0, 10) : ''} onChange={(e) => setField('requestedOn', e.target.value)} />
                </FormField>
                <FormField label="Started On">
                  <TextInput type="date" value={form.startedOn ? String(form.startedOn).slice(0, 10) : ''} onChange={(e) => setField('startedOn', e.target.value)} />
                </FormField>
                <FormField label="Completed On">
                  <TextInput type="date" value={form.completedOn ? String(form.completedOn).slice(0, 10) : ''} onChange={(e) => setField('completedOn', e.target.value)} />
                </FormField>

                <FormField label="Result" className="sm:col-span-2 lg:col-span-3">
                  <TextArea rows={2} value={form.result} onChange={(e) => setField('result', e.target.value)} placeholder="Outcome recorded when the action finishes" />
                </FormField>
                <FormField label="Remarks" className="sm:col-span-2 lg:col-span-3">
                  <TextArea rows={2} value={form.remarks} onChange={(e) => setField('remarks', e.target.value)} placeholder="Remarks" />
                </FormField>
              </div>
            </div>
          </div>

          {/* ===== SECTION 2: USER-DEFINED COLUMNS (same config as the CPO grid) ===== */}
          {customColumns.length > 0 && (
            <div className={SECTION}>
              <SectionHeader icon={Plus} title="Additional Fields" />
              <div className="p-5">
                <p className="text-[11px] text-slate-400 mb-3">
                  Columns added to the E-Action grid (Manage Columns). The configuration is shared with the CPO
                  Create/Edit page — the values below belong to THIS E-Action only.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customColumns.map((col) => (
                    <FormField key={col.id} label={col.label}>
                      {col.type === 'number' ? (
                        <TextInput
                          type="number"
                          value={(form.customFields || {})[col.id] ?? ''}
                          onChange={(e) => setCustomField(col.id, e.target.value)}
                        />
                      ) : col.type === 'date' ? (
                        <TextInput
                          type="date"
                          value={(form.customFields || {})[col.id] ?? ''}
                          onChange={(e) => setCustomField(col.id, e.target.value)}
                        />
                      ) : (
                        <TextInput
                          value={(form.customFields || {})[col.id] ?? ''}
                          onChange={(e) => setCustomField(col.id, e.target.value)}
                        />
                      )}
                    </FormField>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isEdit && (
            <p className={`text-[11px] text-slate-400 px-1`}>
              Saving creates a new E-Action row addressed by the Customer Purchase Order above. It appears immediately
              in the E-Actions list — and in that CPO&apos;s E-Action grid when the CPO is one of our records. One
              record, one source of truth.
            </p>
          )}
        </div>
      )}

      <CreationActionBar
        onBackToList={() => navigate(LIST_ROUTE)}
        onCancel={() => navigate(isEdit ? `${LIST_ROUTE}/${id}` : LIST_ROUTE)}
        cancelLabel="Cancel"
        onSave={() => save()}
        saveLabel={isEdit ? 'Save Changes' : 'Save E-Action'}
        onSaveNew={isEdit ? undefined : () => save({ andNew: true })}
        saveNewLabel="Save & New"
        disabled={saving || loading}
      />
    </div>
  );
}

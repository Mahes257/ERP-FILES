/**
 * purchase/pages/invoices/AdjustmentNotesList.jsx
 * ------------------------------------------------------------------
 * Credit / Debit Notes register. Notes are raised against an ORIGINAL
 * vendor invoice (returns, rate corrections, extra charges) and only
 * move the invoice ledger once Approved:
 *
 *   Credit Note → reduces invoice outstanding / vendor payable
 *   Debit Note  → raises them
 *
 * A note may not exceed the invoice's outstanding balance unless it
 * was explicitly raised with "Allow excess credit". Row actions follow
 * the note lifecycle: Draft → Submitted → Approved / Rejected, with
 * Approved notes reversible back off the ledger.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeftRight, ArrowRight, CheckCircle2, Eye, FilePen,
  Link2, MinusCircle, Paperclip, PlusCircle, RefreshCw, Send, Trash2,
  Undo2, X
} from 'lucide-react';
import { ConfirmDialog, Modal, TextArea, useToast } from '../../components/ui';
import {
  PurchaseListPage, PurchaseSearch, PurchaseEmptyState, PurchaseExportDropdown,
  PurchaseStatusCell
} from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import useKpiFilter from '../../hooks/useKpiFilter';
import { invoiceService } from '../../services/invoice';
import {
  ADJUSTMENT_NOTE_STATUS, ADJUSTMENT_NOTE_TYPE
} from '../../constants';
import { formatAmount } from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import { exportCsv } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ─── Status segments ────────────────────────────────────────────── */
const STATUS_SEGMENTS = [
  { key: 'All', label: 'All' },
  { key: ADJUSTMENT_NOTE_STATUS.SUBMITTED, label: 'Submitted' },
  { key: ADJUSTMENT_NOTE_STATUS.APPROVED, label: 'Approved' },
  { key: ADJUSTMENT_NOTE_STATUS.DRAFT, label: 'Draft' },
  { key: ADJUSTMENT_NOTE_STATUS.REJECTED, label: 'Rejected' },
  { key: ADJUSTMENT_NOTE_STATUS.REVERSED, label: 'Reversed' }
];

/* ─── KPI Definitions (same selectable standard as Invoice List) ── */
const KPI_DEFS = [
  { key: 'total', label: 'Total Notes', icon: FilePen, color: '#4f46e5', bg: 'rgba(99,102,241,0.10)' },
  { key: ADJUSTMENT_NOTE_STATUS.DRAFT, label: 'Draft', icon: FilePen, color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
  { key: ADJUSTMENT_NOTE_STATUS.SUBMITTED, label: 'Submitted', icon: Send, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: ADJUSTMENT_NOTE_STATUS.APPROVED, label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: ADJUSTMENT_NOTE_STATUS.REJECTED, label: 'Rejected', icon: AlertTriangle, color: '#e11d48', bg: 'rgba(225,29,72,0.10)' },
  { key: ADJUSTMENT_NOTE_STATUS.REVERSED, label: 'Reversed', icon: Undo2, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' }
];

const NOTE_COLUMNS = [
  { key: 'noteNo', label: 'Note No', visible: true },
  { key: 'noteType', label: 'Type', visible: true },
  { key: 'invoiceNo', label: 'Original Invoice', visible: true },
  { key: 'vendor', label: 'Vendor', visible: true },
  { key: 'noteDate', label: 'Note Date', visible: true },
  { key: 'reason', label: 'Reason', visible: true },
  { key: 'total', label: 'Value', visible: true, align: 'right' },
  { key: 'status', label: 'Status', visible: true },
  { key: 'actions', label: 'Actions', visible: true }
];

const TYPE_TONES = {
  [ADJUSTMENT_NOTE_TYPE.CREDIT]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [ADJUSTMENT_NOTE_TYPE.DEBIT]: 'bg-rose-50 text-rose-700 border-rose-200'
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function Pill({ label, tone }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${tone}`}>
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * AdjustmentNoteDrawer — right side panel with full note detail
 * ───────────────────────────────────────────────────────────────── */
function AdjustmentNoteDrawer({ open, note, onClose, onOpenInvoice }) {
  if (!open) return null;
  const value = Number(note?.total) || 0;
  const isCredit = note?.noteType === ADJUSTMENT_NOTE_TYPE.CREDIT;
  const approval = note?.approval || {};
  const audit = Array.isArray(note?.auditHistory) ? [...note.auditHistory].reverse() : [];
  const actionLabels = {
    created: 'Note Created', updated: 'Details Updated', submitted: 'Submitted for Approval',
    approved: 'Approved', rejected: 'Rejected', resubmitted: 'Resubmitted', reversed: 'Reversed'
  };
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" />
      <aside
        className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden animate-[slideInRight_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isCredit ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              {isCredit
                ? <MinusCircle className="w-4.5 h-4.5 text-emerald-700" />
                : <PlusCircle className="w-4.5 h-4.5 text-rose-700" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{note?.noteNo || 'Loading...'}</div>
              <div className="text-[11px] text-slate-500 truncate">{note?.noteType} · {note?.vendor || ''}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!note && <div className="text-center py-12 text-sm text-slate-500">Note not found</div>}
          {note && (
            <>
              <div className="flex flex-wrap gap-2">
                <Pill label={note.noteType} tone={TYPE_TONES[note.noteType]} />
                <PurchaseStatusCell status={note.status} />
                {note.allowExcess && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-orange-200 bg-orange-50 text-orange-700">
                    Allow excess credit
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Linked Invoice</div>
                <button
                  type="button"
                  onClick={() => onOpenInvoice?.(note)}
                  className="w-full text-left rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 flex items-center justify-between hover:border-[#0B4A3D]/40 transition-colors"
                >
                  <div>
                    <div className="text-sm font-bold text-[#0B4A3D]">{note.invoiceNo}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{note.vendor}{note.poNo ? ` · PO ${note.poNo}` : ''}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
                {note.originalInvoice && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Invoice outstanding after this note:{' '}
                    <span className="font-bold text-slate-700 tabular-nums">{formatAmount(note.originalInvoice.outstanding)}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Note Details</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="py-1"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Note Date</div><div className="font-semibold text-slate-800 mt-0.5">{formatDate(note.noteDate)}</div></div>
                  <div className="py-1"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference</div><div className="font-semibold text-slate-800 mt-0.5">{note.reference || '—'}</div></div>
                  <div className="py-1 col-span-2"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reason</div><div className="font-semibold text-slate-800 mt-0.5">{note.reason || '—'}</div></div>
                  {note.notes && <div className="py-1 col-span-2"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes</div><div className="font-semibold text-slate-700 mt-0.5 text-[11px] leading-relaxed">{note.notes}</div></div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Amount</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Taxable</div>
                    <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(note.amount)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GST</div>
                    <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(note.gst)}</div>
                  </div>
                  <div className={`rounded-lg border p-3 ${isCredit ? 'bg-emerald-50/60 border-emerald-200/60' : 'bg-rose-50/60 border-rose-200/60'}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {isCredit ? 'Credits Vendor' : 'Debits Vendor'}
                    </div>
                    <div className={`text-sm font-bold mt-1 tabular-nums ${isCredit ? 'text-emerald-800' : 'text-rose-800'}`}>{formatAmount(value)}</div>
                  </div>
                </div>
                {note.charges > 0 && <div className="text-[11px] text-slate-500 mt-2">Charges included: {formatAmount(note.charges)}</div>}
                {note.freight > 0 && <div className="text-[11px] text-slate-500">Freight included: {formatAmount(note.freight)}</div>}
              </div>

              {Array.isArray(note.items) && note.items.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Items ({note.items.length})</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left font-bold text-slate-500 py-1 pr-2">Item</th>
                          <th className="text-right font-bold text-slate-500 py-1 px-1">Qty</th>
                          <th className="text-right font-bold text-slate-500 py-1 px-1">Rate</th>
                          <th className="text-right font-bold text-slate-500 py-1 px-1">GST %</th>
                          <th className="text-right font-bold text-slate-500 py-1 pl-1">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {note.items.map((line, i) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="py-1 pr-2 font-semibold text-slate-700">{line.product || '—'}</td>
                            <td className="py-1 px-1 text-right tabular-nums text-slate-600">{line.qty}</td>
                            <td className="py-1 px-1 text-right tabular-nums text-slate-600">{formatAmount(line.rate)}</td>
                            <td className="py-1 px-1 text-right tabular-nums text-slate-600">{line.gstRate}%</td>
                            <td className="py-1 pl-1 text-right font-bold text-slate-700 tabular-nums">{formatAmount((Number(line.qty) || 0) * (Number(line.rate) || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Approval</div>
                <div className="space-y-1.5 text-[11px] text-slate-600">
                  {approval.submittedAt && <div className="flex items-center gap-1.5"><Send className="w-3 h-3 text-slate-400" /> Submitted {formatDate(approval.submittedAt)} by {approval.submittedBy || 'System'}</div>}
                  {approval.approvedAt && <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Approved {formatDate(approval.approvedAt)} by {approval.approvedBy || 'System'}</div>}
                  {approval.rejectedAt && <div className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-rose-500" /> Rejected {formatDate(approval.rejectedAt)} by {approval.rejectedBy || 'System'}{approval.rejectionReason ? ` — ${approval.rejectionReason}` : ''}</div>}
                  {approval.reversedAt && <div className="flex items-center gap-1.5"><Undo2 className="w-3 h-3 text-violet-500" /> Reversed {formatDate(approval.reversedAt)} by {approval.reversedBy || 'System'}{approval.reversalReason ? ` — ${approval.reversalReason}` : ''}</div>}
                  {!approval.approvedAt && !approval.rejectedAt && !approval.submittedAt && (
                    <p className="text-slate-400">Awaiting submission</p>
                  )}
                </div>
              </div>

              {(note.attachments || []).length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Attachments ({(note.attachments || []).length})</div>
                  <div className="space-y-1.5">
                    {(note.attachments || []).map((att, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{att.name || att.fileName || `Attachment ${i + 1}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audit.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Activity</div>
                  <div className="divide-y divide-slate-100">
                    {audit.map((entry, i) => (
                      <div key={i} className="flex items-start gap-2.5 py-2">
                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#0B4A3D] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-700">{actionLabels[entry.action] || entry.action}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {entry.actor || 'System'} · {formatDate(entry.timestamp)}
                            {entry.details?.note && <span className="italic"> — {entry.details.note}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Close</button>
        </div>
      </aside>
    </div>
  );
}

export default function AdjustmentNotesList() {
  const navigate = useNavigate();
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const response = await invoiceService.getAdjustmentNotes({
        search,
        status: filters.status || 'All',
        page,
        pageSize
      });
      return response;
    },
    []
  );

  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [activeNote, setActiveNote] = useState(null);
  const [actionTarget, setActionTarget] = useState(null); // { key, record }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reasonModal, setReasonModal] = useState(null); // { key, record }
  const [reasonText, setReasonText] = useState('');
  const [stats, setStats] = useState({ total: 0 });

  const debouncedSearch = useDebounce(searchInput, 400);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(debouncedSearch); setSelectedIds([]); }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  const refreshStats = useCallback(() => {
    /* Per-status counts drive the KPI cards + segment counts, always
       derived from the actual note store (no fabricated figures). */
    invoiceService.getAdjustmentNotes({ status: 'All', page: 1, pageSize: 100000 })
      .then((result) => {
        const notes = result.data || [];
        const count = (s) => notes.filter((note) => note.status === s).length;
        setStats({
          total: notes.length,
          [ADJUSTMENT_NOTE_STATUS.DRAFT]: count(ADJUSTMENT_NOTE_STATUS.DRAFT),
          [ADJUSTMENT_NOTE_STATUS.SUBMITTED]: count(ADJUSTMENT_NOTE_STATUS.SUBMITTED),
          [ADJUSTMENT_NOTE_STATUS.APPROVED]: count(ADJUSTMENT_NOTE_STATUS.APPROVED),
          [ADJUSTMENT_NOTE_STATUS.REJECTED]: count(ADJUSTMENT_NOTE_STATUS.REJECTED),
          [ADJUSTMENT_NOTE_STATUS.REVERSED]: count(ADJUSTMENT_NOTE_STATUS.REVERSED)
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  const refreshAll = useCallback(() => {
    refresh();
    refreshStats();
    if (activeNote) {
      invoiceService.getAdjustmentNote(activeNote.id).then(setActiveNote).catch(() => {});
    }
  }, [refresh, refreshStats, activeNote]);

  const segments = STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: seg.key === 'All' ? (stats.total ?? 0) : (stats[seg.key] ?? 0)
  }));

  /* Shared KPI ↔ status-tab bridge (same interaction model as
     Invoice Management). KPI keys reuse the real note statuses. */
  const { activeKpi, selectKpi, selectToken } = useKpiFilter({
    kpiMap: {
      total: 'All',
      [ADJUSTMENT_NOTE_STATUS.DRAFT]: ADJUSTMENT_NOTE_STATUS.DRAFT,
      [ADJUSTMENT_NOTE_STATUS.SUBMITTED]: ADJUSTMENT_NOTE_STATUS.SUBMITTED,
      [ADJUSTMENT_NOTE_STATUS.APPROVED]: ADJUSTMENT_NOTE_STATUS.APPROVED,
      [ADJUSTMENT_NOTE_STATUS.REJECTED]: ADJUSTMENT_NOTE_STATUS.REJECTED,
      [ADJUSTMENT_NOTE_STATUS.REVERSED]: ADJUSTMENT_NOTE_STATUS.REVERSED
    },
    tokenKpi: {
      'All': 'total',
      [ADJUSTMENT_NOTE_STATUS.DRAFT]: ADJUSTMENT_NOTE_STATUS.DRAFT,
      [ADJUSTMENT_NOTE_STATUS.SUBMITTED]: ADJUSTMENT_NOTE_STATUS.SUBMITTED,
      [ADJUSTMENT_NOTE_STATUS.APPROVED]: ADJUSTMENT_NOTE_STATUS.APPROVED,
      [ADJUSTMENT_NOTE_STATUS.REJECTED]: ADJUSTMENT_NOTE_STATUS.REJECTED,
      [ADJUSTMENT_NOTE_STATUS.REVERSED]: ADJUSTMENT_NOTE_STATUS.REVERSED
    },
    allToken: 'All',
    allKpi: 'total',
    initialKpi: 'total',
    applyToken: (token) => setFilter('status', token)
  });

  const resetKpiAndStatus = () => selectToken('All');

  const kpiCards = KPI_DEFS.map((def) => ({
    ...def,
    value: String(stats[def.key] ?? 0)
  }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`;
  const hasFilters = Boolean(searchInput) || Boolean(filters.status && filters.status !== 'All');
  const resetAll = () => { resetFilters(); setSearchInput(''); setSelectedIds([]); resetKpiAndStatus(); };

  const openNote = useCallback(async (row) => {
    try {
      const note = await invoiceService.getAdjustmentNote(row.id);
      setActiveNote(note);
    } catch (err) {
      toast.error(err?.message || 'Failed to open note');
    }
  }, [toast]);

  const openOriginalInvoice = (note) => {
    setActiveNote(null);
    navigate(`/purchase/invoices/${note.invoiceId || note.invoiceNo}`);
  };

  /* ── lifecycle helpers ─────────────────────────────────────── */
  const runLifecycle = async (key, row, reason) => {
    let call;
    if (key === 'submit') call = () => invoiceService.submitAdjustmentNote(row.id);
    else if (key === 'approve') call = () => invoiceService.approveAdjustmentNote(row.id);
    else if (key === 'reject') call = () => invoiceService.rejectAdjustmentNote(row.id, { reason });
    else if (key === 'resubmit') call = () => invoiceService.resubmitAdjustmentNote(row.id);
    else if (key === 'reverse') call = () => invoiceService.reverseAdjustmentNote(row.id, { reason });
    else if (key === 'delete') call = () => invoiceService.deleteAdjustmentNote(row.id);
    if (!call) return;
    const result = await runMutation(call);
    if (result.ok) {
      const messages = {
        submit: `${row.noteNo} submitted for approval`,
        approve: `${row.noteNo} approved — the ${row.noteType === ADJUSTMENT_NOTE_TYPE.CREDIT ? 'invoice outstanding and vendor payable were reduced' : 'vendor payable was raised'}`,
        reject: `${row.noteNo} rejected`,
        resubmit: `${row.noteNo} resubmitted`,
        reverse: `${row.noteNo} reversed — the ledger was restored`,
        delete: `${row.noteNo} deleted`
      };
      toast.success(messages[key]);
      refreshAll();
    } else {
      toast.error(result.error?.message || `Failed to ${key} note`);
    }
    setActionTarget(null);
    setReasonModal(null);
    setReasonText('');
    setConfirmOpen(false);
  };

  const executeConfirm = () => {
    if (!actionTarget) return;
    runLifecycle(actionTarget.key, actionTarget.record);
  };

  const executeReasonAction = () => {
    if (!reasonModal) return;
    runLifecycle(reasonModal.key, reasonModal.record, reasonText.trim());
  };

  const handleExport = (type) => {
    if (type === 'csv') {
      exportCsv(NOTE_COLUMNS, records.map((row) => ({ ...row, total: Number(row.total) })), 'adjustment-notes');
      toast.success('Notes exported');
    } else {
      toast.info('CSV export is available for adjustment notes');
    }
  };

  const renderers = useMemo(
    () => ({
      noteNo: (row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openNote(row); }}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.noteNo}
        </button>
      ),
      noteType: (row) => {
        const isCredit = row.noteType === ADJUSTMENT_NOTE_TYPE.CREDIT;
        return (
          <span className="inline-flex items-center gap-1">
            {isCredit
              ? <MinusCircle className="w-3.5 h-3.5 text-emerald-600" />
              : <PlusCircle className="w-3.5 h-3.5 text-rose-600" />}
            <Pill label={row.noteType} tone={TYPE_TONES[row.noteType]} />
          </span>
        );
      },
      invoiceNo: (row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(`/purchase/invoices/${row.invoiceId || row.invoiceNo}`); }}
          className="font-semibold text-slate-600 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.invoiceNo || '—'}
        </button>
      ),
      vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
      noteDate: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.noteDate)}</span>,
      reason: (row) => (
        <span className="text-xs text-slate-600 line-clamp-1 max-w-[220px]">{row.reason || '—'}</span>
      ),
      total: (row) => (
        <span className={`font-bold tabular-nums whitespace-nowrap ${row.noteType === ADJUSTMENT_NOTE_TYPE.CREDIT ? 'text-emerald-700' : 'text-rose-700'}`}>
          {row.noteType === ADJUSTMENT_NOTE_TYPE.CREDIT ? '−' : '+'}{formatAmount(row.total)}
        </span>
      ),
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate, openNote]
  );

  const rowActions = (row) => {
    const items = [{ key: 'view', label: 'View Note', icon: Eye }];
    const status = row.status;
    if (status === ADJUSTMENT_NOTE_STATUS.DRAFT) {
      items.push({ key: 'submit', label: 'Submit for Approval', icon: Send });
      items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    } else if (status === ADJUSTMENT_NOTE_STATUS.SUBMITTED) {
      items.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
      items.push({ key: 'reject', label: 'Reject', icon: AlertTriangle, danger: true });
    } else if (status === ADJUSTMENT_NOTE_STATUS.REJECTED) {
      items.push({ key: 'resubmit', label: 'Resubmit for Approval', icon: RefreshCw });
    } else if (status === ADJUSTMENT_NOTE_STATUS.APPROVED) {
      items.push({ key: 'reverse', label: 'Reverse Note', icon: Undo2, danger: true });
    }
    items.push({ key: 'invoice', label: 'Open Original Invoice', icon: Link2 });
    return items;
  };

  const onRowMenuAction = async (key, row) => {
    if (key === 'view') { openNote(row); return; }
    if (key === 'invoice') { openOriginalInvoice(row); return; }
    if (key === 'approve' || key === 'submit' || key === 'resubmit' || key === 'delete') {
      setActionTarget({ key, record: row });
      setConfirmOpen(true);
      return;
    }
    if (key === 'reject' || key === 'reverse') {
      setReasonModal({ key, record: row });
      setReasonText('');
    }
  };

  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const newNoteButton = (type) => (
    <button
      type="button"
      onClick={() => navigate(`/purchase/invoices/notes/new?type=${encodeURIComponent(type)}`)}
      className="po-btn po-btn-secondary"
    >
      {type === ADJUSTMENT_NOTE_TYPE.CREDIT
        ? <MinusCircle className="po-btn-icon-ic" />
        : <PlusCircle className="po-btn-icon-ic" />}
      {type}
    </button>
  );

  const confirmMessage = actionTarget
    ? ({
        approve: `${actionTarget.record.noteNo} will be APPROVED and immediately adjust the ledger of ${actionTarget.record.invoiceNo} (${actionTarget.record.noteType} of ${formatAmount(actionTarget.record.total)}).`,
        submit: `${actionTarget.record.noteNo} will be submitted for approval.`,
        resubmit: `${actionTarget.record.noteNo} will be resubmitted for approval.`,
        delete: `${actionTarget.record.noteNo} (Draft) will be permanently deleted.`,
        reverse: `${actionTarget.record.noteNo} will be reversed and its effect removed from the ledger of ${actionTarget.record.invoiceNo}.`
      }[actionTarget.key])
    : '';

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Credit / Debit Notes' }
        ],
        icon: FilePen,
        title: 'Credit / Debit Notes',
        subtitle: 'Notes against vendor invoices that adjust the outstanding balance once approved',
        actions: (
          <div className="flex items-center gap-2">
            {newNoteButton(ADJUSTMENT_NOTE_TYPE.DEBIT)}
            {newNoteButton(ADJUSTMENT_NOTE_TYPE.CREDIT)}
          </div>
        )
      }}
      flowNav={<ModuleTabNav module="invoices" />}
      error={error}
      onRetry={refreshAll}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi, loading: stats.total === 0 && loading }}
      tabs={{
        primary: {
          label: 'All Notes',
          count: stats?.total ?? 0,
          active: !filters.status || filters.status === 'All',
          onSelect: () => { selectToken('All'); setSelectedIds([]); }
        },
        segments: {
          tabs: segments,
          activeKey: filters.status || 'All',
          onSelect: (status) => { selectToken(status); setSelectedIds([]); },
          ariaLabel: 'Note status'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            {hasFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="noteSearchInput"
              placeholder="Search note / invoice / vendor..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Notes"
            />
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
          </>
        )
      }}
      table={{
        columns: NOTE_COLUMNS.filter((c) => c.visible !== false),
        rows: records,
        loading,
        selectable: false,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: () => {},
        onToggleRow: () => {},
        renderers,
        idColumn: 'noteNo',
        tableId: 'adjustmentNotesTable',
        alignRight: ['total'],
        onRowClick: (row) => openNote(row),
        rowActions: (row) => rowActions(row).map(({ key, label, icon, danger }) => ({ key, label, icon, danger })),
        onRowAction: onRowMenuAction,
        emptyContent: (
          <PurchaseEmptyState
            icon={ArrowLeftRight}
            title="No Adjustment Notes"
            message={
              hasFilters
                ? 'No notes matching your criteria.'
                : 'Raise a Credit Note (returns, rate corrections) or Debit Note (extra charges) against an approved vendor invoice.'
            }
            action={
              hasFilters ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Filters
                </button>
              ) : undefined
            }
          />
        )
      }}
      pagination={{
        page,
        totalPages,
        pageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        pageInfo,
        onPageChange: goToPage,
        onPageSizeChange: changePageSize
      }}
    >
      <AdjustmentNoteDrawer
        open={!!activeNote}
        note={activeNote}
        onClose={() => setActiveNote(null)}
        onOpenInvoice={(note) => openOriginalInvoice(note)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={
          actionTarget?.key === 'approve' ? 'Approve credit / debit note?'
            : actionTarget?.key === 'delete' ? 'Delete draft note?'
              : actionTarget?.key === 'reverse' ? 'Reverse approved note?'
                : actionTarget?.key === 'resubmit' ? 'Resubmit note?' : 'Submit note?'
        }
        message={confirmMessage}
        confirmLabel={
          actionTarget?.key === 'delete' ? 'Delete'
            : actionTarget?.key === 'reverse' ? 'Reverse'
              : actionTarget?.key === 'approve' ? 'Approve'
                : actionTarget?.key === 'resubmit' ? 'Resubmit' : 'Submit'
        }
        variant={actionTarget?.key === 'delete' || actionTarget?.key === 'reverse' ? 'danger' : 'default'}
        icon={
          actionTarget?.key === 'approve' ? CheckCircle2
            : actionTarget?.key === 'delete' ? Trash2
              : actionTarget?.key === 'reverse' ? Undo2 : Send
        }
        loading={actionLoading}
        onConfirm={executeConfirm}
        onCancel={() => { setConfirmOpen(false); setActionTarget(null); }}
      />

      <Modal
        open={!!reasonModal}
        onClose={() => setReasonModal(null)}
        title={reasonModal?.key === 'reverse' ? 'Reverse approved note' : 'Reject note'}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setReasonModal(null)} className="btn btn-ghost btn-sm">Cancel</button>
            <button
              type="button"
              onClick={executeReasonAction}
              disabled={!reasonText.trim() || actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reasonModal?.key === 'reverse' ? 'Reverse Note' : 'Reject Note'}
            </button>
          </>
        }
      >
        {reasonModal && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              {reasonModal.record.noteNo} · {reasonModal.record.noteType} · {formatAmount(reasonModal.record.total)} against {reasonModal.record.invoiceNo}
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                {reasonModal.key === 'reverse' ? 'Reversal reason' : 'Rejection reason'} *
              </label>
              <TextArea rows={3} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Required — recorded on the note and its audit trail" />
            </div>
          </div>
        )}
      </Modal>
    </PurchaseListPage>
  );
}

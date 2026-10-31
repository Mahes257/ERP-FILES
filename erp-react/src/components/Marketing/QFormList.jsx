import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Plus, Eye, Edit3, Printer, Trash2, Search, X } from 'lucide-react';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import { useToast } from '../Common';
import StatusBadge from '../Common/StatusBadge';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import marketingService from '../../services/marketingService';

// ============================== Constants ==============================

const STATUS_TABS = [
  { key: '', label: 'All Q Forms' },
  { key: 'Not Prepared', label: 'Not Prepared' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Filled & Submitted', label: 'Filled & Submitted' }
];

const PILL = {
  'Not Prepared': 'bg-slate-100 text-slate-500 border-slate-200',
  'Draft': 'bg-amber-50 text-amber-700 border-amber-200',
  'Filled & Submitted': 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function StatusPill({ status }) {
  return <StatusBadge status={status} />;
}

// ============================== Module-level fetch ==============================

async function fetchQForms({ setQForms, setTotal, setLoading, setLoadError }, params) {
  setLoading(true);
  setLoadError('');
  try {
    const res = await marketingService.listQForms(params);
    const data = res?.data || res;
    if (data?.content) {
      setQForms(data.content);
      setTotal(data.totalElements || 0);
    } else if (Array.isArray(data)) {
      setQForms(data);
      setTotal(data.length);
    } else {
      setQForms([]);
      setTotal(0);
    }
  } catch (err) {
    setQForms([]);
    setTotal(0);
    setLoadError(err?.message || 'Failed to load Q Forms.');
  } finally {
    setLoading(false);
  }
}

// ============================== Main Component ==============================

export default function QFormList({ onOpenForm, onNewForm }) {
  const toast = useToast();
  // Q Forms action permissions (UI gate; the backend enforces each one).
  const { can } = useMarketingAccess();
  const canCreate = can('qforms', 'create');
  const canEdit = can('qforms', 'edit');
  const canDelete = can('qforms', 'delete');
  const canPrint = can('qforms', 'print');
  const [qForms, setQForms] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [size] = useState(15);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const allPageSelected = qForms.length > 0 && qForms.every((row) => selectedIds.includes(row.id));
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !qForms.some((row) => row.id === id)));
    } else {
      const ids = new Set(selectedIds);
      qForms.forEach((row) => ids.add(row.id));
      setSelectedIds([...ids]);
    }
  };

  const headerRowRef = useRef(null);
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey: 'formNo',
    visibleKeys: ['formNo', 'dateOfVisit', 'plantName', 'companyName', 'location', 'travelPlanNo', 'marketer', 'status', 'updatedAt', 'actions']
  });
  const stickyShadow = 'shadow-[1px_0_0_rgba(15,23,42,0.06)]';

  const loadQForms = useCallback(() => {
    fetchQForms({ setQForms, setTotal, setLoading, setLoadError }, {
      page, size, sort: 'createdAt,desc',
      search: search || undefined,
      status: statusFilter || undefined
    });
  }, [page, size, search, statusFilter]);

  useEffect(() => {
    fetchQForms({ setQForms, setTotal, setLoading, setLoadError }, {
      page, size, sort: 'createdAt,desc',
      search: search || undefined,
      status: statusFilter || undefined
    });
  }, [page, size, search, statusFilter]);

  const handleDelete = async (e, qf) => {
    e.stopPropagation();
    if (!confirm(`Delete Q Form ${qf.formNo || qf.id}?`)) return;
    try {
      await marketingService.deleteQForm(qf.id);
      toast.success('Q Form deleted');
      loadQForms();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  const handlePrint = (e, qf) => {
    e.stopPropagation();
    onOpenForm && onOpenForm(qf.visitId, qf.id);
  };

  const totalPages = Math.ceil(total / size);

  return (
    <div className="cpr-page space-y-3">
      {/* The app's global unlayered `button { background: none; color: inherit;
          border: none; font: inherit }` reset (production/styles/global.css)
          outranks Tailwind's layered utilities on <button> elements, so the
          utility classes on "New Q Form" paint nothing on their own. These
          component-local rules restore the specified button look. The selector
          matches only this button — the sole <button> in the app carrying
          bg-[#0F5A46]. */}
      <style>{`
        button[class*="bg-[#0F5A46]"] {
          background: #0F5A46;
          border: 1px solid #0F5A46;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
        }
        button[class*="bg-[#0F5A46]"]:hover { background: #0B4A3A; }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-[#0B4A3D]" />
          <h2 className="text-base font-bold text-slate-800">Q Forms</h2>
        </div>
        {onNewForm && canCreate && (
          <button onClick={onNewForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0F5A46] border border-[#0F5A46] hover:bg-[#0B4A3A] transition-colors cursor-pointer">
            <Plus size={14} /> New Q Form
          </button>
        )}
      </div>

      {/* Status Tabs — PR-style segmented control */}
      <div className="segmented-control" role="tablist" aria-label="Q Form status">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} role="tab" type="button"
            aria-selected={statusFilter === tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(0); }}
            className="pr-tab">
            {tab.label} <span className="tab-count">{tab.key === '' ? total : qForms.filter(qf => tab.key === '' || qf.status === tab.key).length}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by Q Form ID, Plant Name, Group Name, Location..."
          className="w-full pl-8 pr-8 h-[34px] border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
        {search && (
          <button onClick={() => { setSearch(''); setPage(0); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table — PR-style card with sticky header */}
      <div className="pr-table-card">
        <div className="pr-table-wrap">
          <table className="pr-table sgrid sgrid-mkt pr-table-fixed" style={{ tableLayout: 'fixed', minWidth: 1760 }}>
            <colgroup>
              <col style={{ width: 50 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 170 }} />
            </colgroup>
            <thead>
            <tr ref={headerRowRef}>
              <th className="checkbox-cell sgrid-pin sgrid-first" style={{ width: 50 }}>                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="accent-[#0B4A3D]"
                    />
              </th>
              <th className="pr-th sgrid-pin" data-sticky-key="formNo" data-sticky-col="true" style={{ left: stickyLeft }}>Q Form ID</th>
              <th className="pr-th">Date of Visit</th>
              <th className="pr-th">Plant Name</th>
              <th className="pr-th">Group Name</th>
              <th className="pr-th">Location</th>
              <th className="pr-th">Travel Registry</th>
              <th className="pr-th">Marketing User</th>
              <th className="pr-th">Status</th>
              <th className="pr-th">Updated</th>
              <th className="pr-th sgrid-pin-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="text-center py-8 text-slate-400">Loading Q Forms...</td></tr>
            ) : loadError ? (
              <tr><td colSpan={11} className="text-center py-8">
                <p className="text-rose-500 text-xs font-bold">{loadError}</p>
                <button onClick={loadQForms} className="mt-2 px-3 py-1 rounded-lg text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer">Retry</button>
              </td></tr>
            ) : qForms.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-8 text-slate-400">No Q Forms found.</td></tr>
            ) : (
              qForms.map(qf => (
                <tr key={qf.id}
                  className={`pr-tr ${selectedIds.includes(qf.id) ? 'is-selected' : ''}`}>
                  <td className="pr-td checkbox-cell sgrid-pin sgrid-first" data-sticky-col="true">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(qf.id)}
                      onChange={() =>
                        setSelectedIds((prev) =>
                          prev.includes(qf.id) ? prev.filter((id) => id !== qf.id) : [...prev, qf.id]
                        )
                      }
                      aria-label={`Select ${qf.formNo || qf.id}`}
                      className="accent-[#0B4A3D]"
                    />
                  </td>
                  <td
                    className="pr-td cell-id font-bold text-[#0B4A3D] hover:underline cursor-pointer sgrid-pin"
                    style={{ left: stickyLeft }}
                    title={qf.formNo || `QF-${qf.id}`}
                    onClick={() => onOpenForm && onOpenForm(qf.visitId, qf.id)}
                  >
                    {qf.formNo || `QF-${qf.id}`}
                  </td>
                  <td className="pr-td cell-date">{fmtDate(qf.dateOfVisit)}</td>
                  <td className="pr-td" title={qf.plantName || ''}>{qf.plantName || '—'}</td>
                  <td className="pr-td" title={qf.companyName || ''}>{qf.companyName || '—'}</td>
                  <td className="pr-td" title={qf.location || ''}>{qf.location || '—'}</td>
                  <td className="pr-td">
                    {qf.travelPlanNo ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#E8F0EE] text-[#0B4A3D] text-[9px] font-bold whitespace-nowrap">{qf.travelPlanNo}</span>
                    ) : '—'}
                  </td>
                  <td className="pr-td" title={qf.marketer || ''}>{qf.marketer || '—'}</td>
                  <td className="pr-td"><StatusPill status={qf.status} /></td>
                  <td className="pr-td cell-date">{fmtDateTime(qf.updatedAt)}</td>
                  <td className="pr-td sgrid-pin-actions">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => onOpenForm && onOpenForm(qf.visitId, qf.id)}
                        title="View"
                        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-100 text-[#0B4A3D] cursor-pointer">
                        <Eye size={15} />
                      </button>
                      {canEdit && (
                        <button onClick={() => onOpenForm && onOpenForm(qf.visitId, qf.id)}
                          title="Edit"
                          className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-100 text-amber-600 cursor-pointer">
                          <Edit3 size={15} />
                        </button>
                      )}
                      {canPrint && (
                        <button onClick={(e) => handlePrint(e, qf)}
                          title="Print"
                          className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer">
                          <Printer size={15} />
                        </button>
                      )}
                      {canDelete && qf.status !== 'Filled & Submitted' && (
                        <button onClick={(e) => handleDelete(e, qf)}
                          title="Delete"
                          className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-100 text-rose-500 cursor-pointer">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Showing {page * size + 1}—{Math.min((page + 1) * size, total)} of {total}
          </p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-2 py-1 rounded text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 cursor-pointer">
              Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const startPage = Math.max(0, Math.min(page - 2, totalPages - 5));
              const p = startPage + i;
              if (p >= totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    p === page ? 'bg-[#0B4A3D] text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                  }`}>
                  {p + 1}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 cursor-pointer">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

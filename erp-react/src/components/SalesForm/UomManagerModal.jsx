import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Ruler, Search, Trash2, X } from 'lucide-react';
import QtnModal from './QtnModal';
import { ConfirmDialog, useToast } from '../Common';
import masterService from '../../services/masterService';

const UOM_KEY = 'units';

const parseMasterList = (res) =>
  Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

const LIST_INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-[#0B4A3D]/50 focus:bg-white transition-all';

const ROW_BTN = 'p-1.5 rounded text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer';
const ROW_BTN_EDIT = 'p-1.5 rounded text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer';
const ROW_BTN_DEL = 'p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer';

/**
 * UomManagerModal — in-app Unit of Measure (UOM) management for the New
 * Quotation workflow. Add / Edit / Delete / Search UOMs, persisted in MySQL via
 * the shared /masters/units API (same master list used by the editable UOM
 * dropdowns). "Use" applies a unit to the quotation item without leaving the page.
 *
 * No new routes or pages are created — the modal keeps the flow inside Quotations.
 */
export default function UomManagerModal({ open, onClose, onApply, onChanged, inUseUnits = [] }) {
  const toast = useToast();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const editRef = useRef(null);
  const addRef = useRef(null);

  const load = async () => {
    try {
      const res = await masterService.list(UOM_KEY);
      setOptions(parseMasterList(res));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  // Reset draft state when the modal opens (adjusting state from props during
  // render — the same pattern used by the other quotation feature modals).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setLoading(true);
      setQuery('');
      setNewValue('');
      setEditingId(null);
      setEditText('');
      setPendingDelete(null);
    }
  }

  // Fresh backend read whenever the modal opens (multi-user sync).
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    masterService
      .list(UOM_KEY)
      .then((res) => {
        if (cancelled) return;
        setOptions(parseMasterList(res));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.value).toLowerCase().includes(q));
  }, [options, query]);

  // ---- Add (duplicates refused, backend dedupes anyway) ----
  const addValue = async () => {
    const v = newValue.trim();
    if (!v) return;
    if (options.some((o) => String(o.value).trim().toLowerCase() === v.toLowerCase())) {
      toast.warning(`"${v}" already exists`);
      setNewValue('');
      return;
    }
    try {
      await masterService.create(UOM_KEY, v);
      await load();
      toast.success(`"${v}" added`);
      onChanged?.();
      setNewValue('');
      addRef.current?.focus();
    } catch (err) {
      toast.error(err?.message || 'Failed to add UOM');
    }
  };

  // ---- Edit (inline rename) ----
  const startEdit = (opt) => {
    setEditingId(opt.id);
    setEditText(opt.value);
    setTimeout(() => editRef.current?.select(), 0);
  };

  const saveEdit = async () => {
    const t = editText.trim();
    if (!t) {
      toast.warning('UOM cannot be empty');
      return;
    }
    const dup = options.find(
      (o) => o.id !== editingId && String(o.value).trim().toLowerCase() === t.toLowerCase()
    );
    if (dup) {
      toast.warning(`"${t}" already exists`);
      return;
    }
    try {
      await masterService.update(UOM_KEY, editingId, t);
      await load();
      toast.success(`Renamed to "${t}"`);
      onChanged?.();
      setEditingId(null);
      setEditText('');
    } catch (err) {
      toast.error(err?.message || 'Failed to update UOM');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // ---- Delete (blocked while the unit is still used in the quotation) ----
  const confirmDelete = async () => {
    const opt = pendingDelete;
    setPendingDelete(null);
    if (!opt) return;
    const inUse = inUseUnits.some(
      (u) => String(u || '').trim().toLowerCase() === String(opt.value).trim().toLowerCase()
    );
    if (inUse) {
      toast.warning(`"${opt.value}" is used by an item in this quotation and cannot be deleted`);
      return;
    }
    try {
      await masterService.remove(UOM_KEY, opt.id);
      await load();
      toast.success(`"${opt.value}" deleted`);
      onChanged?.();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete UOM');
    }
  };

  // ---- Use: apply the unit to the quotation item row ----
  const applyUom = (opt) => {
    if (onApply) onApply(opt.value);
  };

  return (
    <QtnModal
      open={open}
      onClose={onClose}
      title="Unit of Measure (UOM)"
      icon={<Ruler size={16} color="#7C3AED" />}
      theme="purple"
      maxWidth={540}
      footer={
        <>
          <span className="qtn-modal-footer-spacer" />
          <button type="button" className="qtn-modal-btn ghost" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search UOMs..."
            className={`${LIST_INPUT_CLS} pl-8`}
            aria-label="Search UOMs"
          />
        </div>

        {/* Add new */}
        <div className="flex items-center gap-2">
          <input
            ref={addRef}
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addValue();
              }
            }}
            placeholder="Add new UOM, e.g. pair"
            className={LIST_INPUT_CLS}
            aria-label="Add new UOM"
          />
          <button
            type="button"
            onClick={addValue}
            className="flex items-center gap-1.5 h-[34px] px-3 rounded-lg text-xs font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading UOMs...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-3 text-xs text-slate-400">
              {query ? 'No UOMs match your search.' : 'No UOMs yet — add one above.'}
            </div>
          )}
          {filtered.map((opt) =>
            editingId === opt.id ? (
              <div key={opt.id} className="flex items-center gap-1 px-2 py-1.5 bg-[#F5F3FF]">
                <input
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  className="flex-1 min-w-0 bg-white border border-[#7C3AED]/50 rounded px-2 py-1 text-xs text-slate-700 outline-none"
                  aria-label="Edit UOM"
                />
                <button type="button" title="Save" onClick={saveEdit} className={ROW_BTN_EDIT}>
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Cancel" onClick={cancelEdit} className={ROW_BTN}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                key={opt.id}
                className="flex items-center gap-1.5 px-2 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <button
                  type="button"
                  title={`Use "${opt.value}" in the quotation`}
                  onClick={() => applyUom(opt)}
                  className="p-1.5 rounded text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <span className="flex-1 min-w-0 truncate font-medium">{opt.value}</span>
                <button type="button" title="Edit" onClick={() => startEdit(opt)} className={ROW_BTN_EDIT}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => setPendingDelete(opt)}
                  className={ROW_BTN_DEL}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          )}
        </div>

        <p className="text-[11px] text-slate-400 leading-snug">
          UOMs are saved to the shared units list (MySQL) and appear in every unit dropdown across
          Sales Execution automatically. Click the check icon to use a unit in the quotation.
        </p>
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete UOM"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.value}" from the units list? Values already referenced by any document cannot be deleted.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </QtnModal>
  );
}

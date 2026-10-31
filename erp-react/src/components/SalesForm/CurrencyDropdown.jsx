import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import masterService from '../../services/masterService';
import { ALL_CURRENCIES } from '../../constants/salesConstants';
import { ConfirmDialog, useToast, useExchangeRates } from '../Common';

const CURRENCY_KEY = 'currencies';

const ROW_BTN = 'p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer';
const ROW_BTN_EDIT = 'p-1 rounded text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer';
const ROW_BTN_DEL = 'p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer';

/**
 * CurrencyDropdown — searchable, complete international currency dropdown for the
 * Quotation module. The list is the full ISO set (CODE - Name) plus any custom
 * currencies persisted via /masters/currencies. Type to filter by code or name;
 * a non-matching typed value can be added as a custom currency. The value stored
 * in the document stays the currency CODE, so the existing data model, GST
 * calculations, totals, formatting, save/load and the Number & Currency modal are
 * all untouched. Rendered in a fixed portal so the list can never be clipped.
 */
export default function CurrencyDropdown({
  id,
  value,
  onChange,
  placeholder = 'Currency',
  invalid = false,
  inputClassName,
  readOnly = false,
  selectOnly = false,
  disabled = false
}) {
  const toast = useToast();
  const { lastUpdated, base: ratesBase, stale: ratesStale } = useExchangeRates();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const editRef = useRef(null);
  const [pos, setPos] = useState(null);

  useClickOutside(wrapRef, () => setOpen(false), open);

  // ---- portal positioning (list can never be clipped by parent containers) ----
  const positionDd = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    let left = Math.max(8, rect.left);
    const width = Math.max(rect.width, 300);
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const ddHeight = 280;
    const top = spaceBelow < ddHeight && rect.top > ddHeight ? rect.top - ddHeight : rect.bottom;
    const maxHeight = spaceBelow < ddHeight && rect.top > ddHeight ? Math.min(ddHeight, rect.top - 16) : Math.min(ddHeight, spaceBelow - 16);
    setPos({ left, width, top, maxHeight });
  };

  useEffect(() => {
    if (!open) return undefined;
    positionDd();
    const onScroll = () => positionDd();
    const onResize = () => positionDd();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, value]);

  // ---- state reset + fresh backend read on open ----
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setLoading(true);
      setQuery('');
      setHighlight(-1);
      setEditingId(null);
      setEditText('');
      setPendingDelete(null);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    masterService
      .list(CURRENCY_KEY)
      .then((res) => {
        if (cancelled) return;
        setCustom(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
      })
      .catch(() => {
        if (!cancelled) setCustom([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const refreshCustom = async () => {
    try {
      const res = await masterService.list(CURRENCY_KEY);
      setCustom(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
      return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  };

  // Built-in constants (CODE - Name) + custom entries from the backend master list.
  const allOptions = useMemo(() => {
    const seen = new Set(ALL_CURRENCIES.map((c) => c.code.toUpperCase()));
    return [
      ...ALL_CURRENCIES,
      ...custom
        .filter((c) => !seen.has(String(c.value).toUpperCase()))
        .map((c) => ({ code: c.value, name: '', id: c.id, custom: true }))
    ];
  }, [custom]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [allOptions, query]);

  const q = query.trim();
  const exactMatch = q
    ? allOptions.some((c) => c.code.toLowerCase() === q.toLowerCase())
    : true;
  const canMutate = !readOnly;

  const commit = (code) => {
    onChange(code);
    setQuery('');
    setOpen(false);
    setHighlight(-1);
  };

  const selectOption = (opt) => commit(opt.code);

  // ---- Add a custom currency (persisted to /masters/currencies) ----
  const addValue = async () => {
    if (!q) return;
    const existing = allOptions.find((c) => c.code.toLowerCase() === q.toLowerCase());
    if (existing) {
      selectOption(existing);
      return;
    }
    try {
      const res = await masterService.create(CURRENCY_KEY, q);
      const created = res?.data ?? {};
      await refreshCustom();
      toast.success(`Currency "${q}" added`);
      commit(created.value || q);
    } catch (err) {
      toast.error(err?.message || 'Failed to add currency');
    }
  };

  // ---- Inline edit / delete for custom currencies only ----
  const startEdit = (opt) => {
    setEditingId(opt.id);
    setEditText(opt.code);
    setHighlight(-1);
    setTimeout(() => editRef.current?.select(), 0);
  };

  const saveEdit = async () => {
    const newCode = editText.trim().toUpperCase();
    if (!newCode) {
      toast.warning('Currency code cannot be empty');
      return;
    }
    const dup = allOptions.find(
      (c) => c.id !== editingId && c.code.toLowerCase() === newCode.toLowerCase()
    );
    if (dup) {
      toast.warning(`"${newCode}" already exists`);
      return;
    }
    try {
      const res = await masterService.update(CURRENCY_KEY, editingId, newCode);
      const updated = res?.data ?? {};
      await refreshCustom();
      toast.success(`Updated to "${updated.value || newCode}"`);
      if (String(value || '').toLowerCase() === String(editText).trim().toLowerCase()) {
        commit(updated.value || newCode);
      } else {
        setEditingId(null);
        setEditText('');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to update currency');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const confirmDelete = async () => {
    const opt = pendingDelete;
    setPendingDelete(null);
    if (!opt) return;
    try {
      await masterService.remove(CURRENCY_KEY, opt.id);
      await refreshCustom();
      toast.success(`"${opt.code}" deleted`);
      if (String(value || '') === String(opt.code)) {
        commit('');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to delete currency');
    }
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (editingId != null) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h < filtered.length - 1 ? h + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h > 0 ? h - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && filtered[highlight]) {
        selectOption(filtered[highlight]);
      } else if (canMutate) {
        addValue();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setHighlight(-1);
    } else if (e.key === 'Tab') {
      if (highlight >= 0 && filtered[highlight]) selectOption(filtered[highlight]);
      else if (canMutate && q && !exactMatch) addValue();
    }
  };

  const displayName = (opt) => (opt.name ? `${opt.code} - ${opt.name}` : opt.code);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={open ? query : value || ''}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            setHighlight(-1);
            if (canMutate && !selectOnly) onChange(v);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!selectOnly && query.trim() && query.trim() !== (value || '') && editingId == null && canMutate) {
              onChange(query.trim());
            }
            setOpen(false);
            setHighlight(-1);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          className={
            disabled
              ? 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-7 text-xs text-slate-400 cursor-not-allowed'
              : inputClassName ||
                `w-full bg-slate-50 border ${invalid ? 'border-rose-400' : 'border-slate-200/80'} rounded-lg px-3 py-2 pr-7 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all`
          }
          autoComplete="off"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {open &&
        createPortal(
          <div
            className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-xl overflow-y-auto"
            style={{ left: pos?.left, width: pos?.width, top: pos?.top, maxHeight: pos?.maxHeight, display: pos ? 'block' : 'none' }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading currencies...
              </div>
            )}
            {!loading && canMutate && q && !exactMatch && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addValue();
                }}
                onClick={() => addValue()}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-[#0B4A3D] border-b border-slate-100 hover:bg-[#0B4A3D]/5 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" /> Add &quot;{q}&quot;
              </button>
            )}
            {filtered.map((opt, i) =>
              editingId === opt.id ? (
                <div key={opt.id} className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-[#F4F7F6]">
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
                    className="flex-1 min-w-0 bg-white border border-emerald-600/50 rounded px-2 py-1 text-xs text-slate-700 outline-none"
                    aria-label="Edit currency code"
                  />
                  <button type="button" title="Save" onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} className={ROW_BTN_EDIT}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" title="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} className={ROW_BTN}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  key={opt.id || opt.code}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(opt);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex items-center gap-1 px-3 py-2 text-xs border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer ${
                    i === highlight ? 'bg-[#0B4A3D]/10 text-[#0B4A3D]' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex-1 min-w-0 truncate">{displayName(opt)}</span>
                  {opt.custom && canMutate && (
                    <span
                      className="flex items-center gap-0.5 shrink-0"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                    >
                      <button type="button" title="Edit" onClick={() => startEdit(opt)} className={ROW_BTN_EDIT}>
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button type="button" title="Delete" onClick={() => setPendingDelete(opt)} className={ROW_BTN_DEL}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              )
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2.5 text-xs text-slate-400">No currencies found</div>
            )}
            {lastUpdated && (
              <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  Rates updated {new Date(lastUpdated).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {ratesStale && <span className="text-amber-500"> (cached)</span>}
                </span>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">base: {ratesBase}</span>
              </div>
            )}
          </div>,
          document.body
        )}
      {canMutate && (
        <ConfirmDialog
          open={pendingDelete != null}
          title="Delete currency"
          message={
            pendingDelete
              ? `Delete "${pendingDelete.code}" from the currencies list? Values already referenced by any document cannot be deleted.`
              : ''
          }
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

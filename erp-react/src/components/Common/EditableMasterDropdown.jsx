import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Eye, EyeOff, Loader2, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import masterService from '../../services/masterService';
import { isValueDisabled, setValueDisabled, useDropdownVersion } from '../../utils/dropdownManager';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './ToastContext';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';
const INPUT_CLS_INVALID =
  'w-full bg-slate-50 border border-rose-400 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-rose-500 focus:bg-surface transition-all shadow-inner';

const ROW_BTN =
  'p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer';
const ROW_BTN_EDIT = 'p-1 rounded text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer';
const ROW_BTN_DEL = 'p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer';

/**
 * EditableMasterDropdown — a searchable, database-backed master dropdown.
 *
 * Every option lives in MySQL (master_values via GET/POST/PUT/DELETE /masters/{key}).
 * While typing, existing values are filtered; when no exact (case-insensitive,
 * trimmed) match exists an "Add <value>" row appears. Each option can be edited
 * or deleted inline; delete is refused by the backend while the value is still
 * referenced by CPR / Cost Workout records.
 *
 * No localStorage / sessionStorage / mock data is used — the dropdown always
 * reads from the backend and refreshes after every mutation, so changes made by
 * any user appear after refresh or API reload.
 *
 * Props:
 *  - masterKey   : which master list to load (e.g. 'pr_departments', 'pr_units')
 *  - value       : currently selected value
 *  - onChange    : (value) => void
 *  - placeholder : input placeholder
 *  - invalid     : marks the field as errored (red border)
 *  - portal      : render the dropdown list in a fixed-position portal (always
 *                  ON by default — the list is mounted into document.body so it
 *                  can never be clipped by overflow-hidden cards, accordions,
 *                  tables, modals or the app's scroll containers). The inline
 *                  absolute fallback is only kept for API compatibility and
 *                  can be clipped by overflow containers; do not pass false.
 *  - inputClassName : override the input styling (e.g. compact table-cell)
 *  - readOnly       : search + select only (hides add/edit/delete actions).
 *  - onDeleted      : (value) => void, fired after a value is deleted so the
 *                     parent can reset any form fields still referencing it.
 */
export default function EditableMasterDropdown({
  masterKey,
  value,
  onChange,
  placeholder = 'Type or select...',
  invalid = false,
  portal = true,
  inputClassName,
  readOnly = false,
  onDeleted,
  id,
  manageLabel,
  onManage,
  allowDisable = false
}) {
  const toast = useToast();
  // Re-render whenever the frontend enable/disable overlay changes.
  const dropdownVersion = useDropdownVersion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const editRef = useRef(null);
  const [pos, setPos] = useState(null);

  useClickOutside(wrapRef, () => setOpen(false), open);

  // Portal positioning (used inside scroll/overflow containers like the item grid).
  const positionDd = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    let left = Math.max(8, rect.left);
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const ddHeight = 224;
    // 4px gap mirrors the inline list's `mt-1` (kept in both directions).
    const top = spaceBelow < ddHeight && rect.top > ddHeight ? rect.top - ddHeight - 4 : rect.bottom + 4;
    const maxHeight = spaceBelow < ddHeight && rect.top > ddHeight ? Math.min(224, rect.top - 16) : Math.min(224, spaceBelow - 16);
    setPos({ left, width: rect.width, top, maxHeight });
  };

  useEffect(() => {
    if (!open || !portal) return;
    positionDd();
    const onScroll = () => positionDd();
    const onResize = () => positionDd();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, portal, value]);

  // Load the master list from the backend ONCE per masterKey — on the first
  // open (or when the key changes). Reopening a dropdown reuses the loaded
  // options instead of firing a fresh GET /masters/{key} every time; mutations
  // (add/edit/delete below) call refresh() directly, so multi-user changes
  // made through this UI still appear immediately.
  useEffect(() => {
    if (!open || loaded) return undefined;
    let cancelled = false;
    masterService
      .list(masterKey)
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setOptions(items);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([]);
          setLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [masterKey, open, loaded]);

  const refresh = async () => {
    try {
      const res = await masterService.list(masterKey);
      const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setOptions(items);
      return items;
    } catch {
      return [];
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.value).toLowerCase().includes(q));
  }, [options, query]);

  // Frontend enable/disable overlay. The options themselves live in MySQL via
  // /masters/{key}; only the enabled state is a per-browser preference, so
  // disabled values disappear from new selections while existing records keep
  // displaying their stored value.
  const disabledSet = useMemo(
    () => {
      // Recompute when the enable/disable overlay changes.
      void dropdownVersion;
      return new Set(
        (options || [])
          .map((o) => o.value)
          .filter((v) => isValueDisabled(masterKey, v))
          .map((v) => String(v).trim().toLowerCase())
      );
    },
    [options, masterKey, dropdownVersion]
  );
  const isDisabled = (v) => disabledSet.has(String(v).trim().toLowerCase());

  const q = query.trim();
  // A disabled value is treated as absent for selection purposes.
  const exactMatch = q
    ? options.some(
        (o) => !isDisabled(o.value) && String(o.value).trim().toLowerCase() === q.toLowerCase()
      )
    : true;

  const enabledFiltered = filtered.filter((o) => !isDisabled(o.value));
  const disabledFiltered = filtered.filter((o) => isDisabled(o.value));
  const displayList = [...enabledFiltered, ...disabledFiltered];

  const commit = (val) => {
    onChange(val);
    setQuery('');
    setOpen(false);
    setHighlight(-1);
  };

  // Read-only users can only search and select existing values.
  const canMutate = !readOnly;

  const selectOption = (opt) => {
    if (isDisabled(opt.value)) {
      toast.warning(`"${opt.value}" is disabled. Enable it in the list first.`);
      return;
    }
    commit(opt.value);
  };

  // ---- Frontend enable/disable toggle ----
  const toggleEnabled = (opt) => {
    const nextEnabled = !isDisabled(opt.value);
    setValueDisabled(masterKey, opt.value, !nextEnabled);
    toast.success(nextEnabled ? `"${opt.value}" enabled` : `"${opt.value}" disabled`);
  };

  // ---- Add a brand-new value (backend dedupes: returns existing row) ----
  const addValue = async () => {
    if (!q) return;
    if (options.some((o) => isDisabled(o.value) && String(o.value).trim().toLowerCase() === q.toLowerCase())) {
      toast.warning(`"${q}" is disabled. Enable it in the list first.`);
      return;
    }
    if (options.some((o) => String(o.value).trim().toLowerCase() === q.toLowerCase())) {
      const existing = options.find((o) => String(o.value).trim().toLowerCase() === q.toLowerCase());
      selectOption(existing);
      return;
    }
    try {
      const res = await masterService.create(masterKey, q);
      const created = res?.data ?? {};
      await refresh();
      toast.success(`"${q}" added`);
      commit(created.value || q);
    } catch (err) {
      toast.error(err?.message || 'Failed to add value');
    }
  };

  // ---- Inline edit of an existing value ----
  const startEdit = (opt) => {
    setEditingId(opt.id);
    setEditText(opt.value);
    setHighlight(-1);
    setTimeout(() => editRef.current?.select(), 0);
  };

  const saveEdit = async () => {
    const newText = editText.trim();
    if (!newText) {
      toast.warning('Value cannot be empty');
      return;
    }
    const dup = options.find(
      (o) => o.id !== editingId && String(o.value).trim().toLowerCase() === newText.toLowerCase()
    );
    if (dup) {
      toast.warning(`"${newText}" already exists`);
      return;
    }
    try {
      const res = await masterService.update(masterKey, editingId, newText);
      const updated = res?.data ?? {};
      await refresh();
      toast.success(`Renamed to "${updated.value || newText}"`);
      // If the currently selected value was renamed, propagate the new name.
      if (String(value || '').trim().toLowerCase() === String(editText).trim().toLowerCase()) {
        commit(updated.value || newText);
      } else {
        setEditingId(null);
        setEditText('');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to update value');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // ---- Delete (backend refuses while the value is in use) ----
  const confirmDelete = async () => {
    const opt = pendingDelete;
    setPendingDelete(null);
    if (!opt) return;
    try {
      await masterService.remove(masterKey, opt.id);
      await refresh();
      toast.success(`"${opt.value}" deleted`);
      if (String(value || '') === String(opt.value)) {
        commit('');
      }
      onDeleted?.(opt.value);
    } catch (err) {
      toast.error(err?.message || 'Failed to delete value');
    }
  };

  const onKeyDown = (e) => {
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
      setHighlight((h) => (h < displayList.length - 1 ? h + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h > 0 ? h - 1 : displayList.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && displayList[highlight]) {
        selectOption(displayList[highlight]);
      } else if (canMutate) {
        addValue();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setHighlight(-1);
    } else if (e.key === 'Tab') {
      if (highlight >= 0 && displayList[highlight]) selectOption(displayList[highlight]);
      else if (canMutate && q && !exactMatch) addValue();
    }
  };

  const renderList = () => (
    <>
      {(loading || (open && !loaded)) && (
        <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading...
        </div>
      )}
      {!loading && loaded && filtered.length === 0 && !q && (
        <div className="px-3 py-2.5 text-xs text-slate-400">No values yet — type to add</div>
      )}
      {canMutate && q && !exactMatch && (
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
      {displayList.map((opt, i) =>
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
              aria-label="Edit master value"
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
            key={opt.id}
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
            <span
              className={`flex-1 min-w-0 truncate ${isDisabled(opt.value) ? 'text-slate-400 line-through' : ''}`}
            >
              {opt.value}
            </span>
            {allowDisable && isDisabled(opt.value) ? (
              <span
                className="flex items-center gap-1.5 shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                  Disabled
                </span>
                {canMutate && (
                  <button type="button" title="Enable" onClick={() => toggleEnabled(opt)} className={ROW_BTN_EDIT}>
                    <EyeOff className="w-3 h-3" />
                  </button>
                )}
              </span>
            ) : (
              canMutate && (
                <span
                  className="flex items-center gap-0.5 shrink-0"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                >
                  {allowDisable && (
                    <button type="button" title="Disable" onClick={() => toggleEnabled(opt)} className={ROW_BTN}>
                      <Eye className="w-3 h-3" />
                    </button>
                  )}
                  <button type="button" title="Edit" onClick={() => startEdit(opt)} className={ROW_BTN_EDIT}>
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => {
                      setPendingDelete(opt);
                      // Close the (now portaled, z-9999) list so it does not
                      // float above the delete ConfirmDialog (Modal z-[80]).
                      setOpen(false);
                    }}
                    className={ROW_BTN_DEL}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              )
            )}
          </div>
        )
      )}
      {onManage && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setQuery('');
            setHighlight(-1);
            onManage();
          }}
          className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <Settings2 className="w-3.5 h-3.5 shrink-0 text-slate-400" /> Manage {manageLabel || 'values'}…
        </button>
      )}
    </>
  );

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
            if (canMutate) onChange(v);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (query.trim() && query.trim() !== (value || '')) {
              if (editingId == null && canMutate) {
                // Commit typed text so any value can still be entered manually.
                onChange(query.trim());
              }
            }
            setOpen(false);
            setHighlight(-1);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className={inputClassName || (invalid ? INPUT_CLS_INVALID : INPUT_CLS)}
          autoComplete="off"
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {open &&
        (portal
          ? createPortal(
              <div
                className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-xl overflow-y-auto"
                style={{
                  left: pos?.left,
                  width: pos?.width,
                  top: pos?.top,
                  maxHeight: pos?.maxHeight,
                  display: pos ? 'block' : 'none'
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  // Keep clicks inside the portaled list from reaching the
                  // click-outside handler (identical to an inline list), so
                  // inline-edit Save/Cancel and option buttons all work.
                  e.stopPropagation();
                }}
              >
                {renderList()}
              </div>,
              document.body
            )
          : <div className="absolute left-0 right-0 top-full mt-1 z-40 max-h-56 overflow-y-auto bg-surface border border-slate-200 rounded-lg shadow-lg">{renderList()}</div>)}
      {canMutate && (
      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete master value"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.value}" from the ${masterKey.replace(/_/g, ' ')} list? Values already referenced by any document cannot be deleted.`
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

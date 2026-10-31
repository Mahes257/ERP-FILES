/**
 * purchase/components/ui/EditableMasterSelect.jsx
 * ------------------------------------------------------------------
 * Searchable, editable master dropdown for Purchase forms.
 *
 * Every master field (Department, Requester, Vendor, Company, Branch,
 * Project, Category, UOM, GST Type, Warehouse, Location, Delivery
 * Address, Transport Mode, Incoterm, Currency, Payment Terms, Cost
 * Center, Priority, …) renders through this component:
 *
 *   ✓ select existing value         ✓ search as you type
 *   ✓ add new value (+ Add "…")     ✓ rename custom value (inline)
 *   ✓ delete custom value (confirm) ✓ duplicate-name prevention
 *   ✓ keyboard support              ✓ persists to localStorage
 *
 * Values are stored as strings (the selected item's name). Works with
 * react-hook-form's <Controller> or plain controlled state.
 *
 * The dropdown menu is rendered through a portal with fixed positioning
 * so it is never clipped by the table's scroll wrapper (important for
 * the Category / UOM cells inside the line-item grid).
 *
 * Data flows through ../../services/masterStore — the single seam to
 * swap for a real backend later.
 * ------------------------------------------------------------------
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './ToastContext';
import api from '../../../api/axiosInstance';
import { purchaseGet } from '../../api';
import { READ_CACHE_TTL, cachedRead } from '../../../utils/readCache';
import {
  addMasterItem, listMaster, MASTER_DEFS, removeMasterItem, renameMasterItem, subscribeMaster
} from '../../services/masterStore';

const TRIGGER =
  'w-full border bg-white px-3 text-[13px] text-slate-700 outline-none transition-colors cursor-pointer flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed';

/* Optional display transform for a value's name (e.g. currencies show
   "INR — Indian Rupee"). Defaults to identity so existing fields are
   unaffected. */
function identityLabel(name) {
  return name;
}

function sizeClasses(size) {
  if (size === 'table') return 'h-[42px] rounded-[10px] text-[13px]';
  if (size === 'sm') return 'h-8 rounded-md text-xs';
  return 'h-9 rounded-md text-[13px]';
}

export default function EditableMasterSelect({
  masterKey,
  value = '',
  onChange,
  placeholder = 'Select...',
  options = null,
  clearable = true,
  disabled = false,
  error = false,
  size = 'md',
  searchable = true,
  editable = true,
  formatLabel = identityLabel,
  id,
  ariaLabel = 'Select option',
  className = ''
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menuPos, setMenuPos] = useState(null); // { top, left, width }
  const remoteMaster = ['vendors', 'departments', 'requesters', 'buyers', 'companies'].includes(masterKey);
  const canEdit = editable && !remoteMaster;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const deleteFromDropdownRef = useRef(false);

  const masterLabel = MASTER_DEFS[masterKey]?.label || (Array.isArray(options) ? 'Option' : masterKey);

  const closeDropdown = () => {
    setOpen(false);
    setMenuPos(null);
    setEditingId(null);
    setEditError('');
  };

  /* Static options mode: the list comes from the `options` prop ({ value,
     label } or plain strings) and bypasses masterStore entirely — no add /
     rename / delete, values stored as-is (e.g. ISO codes for currencies). */
  const isStatic = Array.isArray(options);
  const staticItems = useMemo(() => {
    if (!isStatic) return [];
    return options.map((opt) => {
      const isObj = opt && typeof opt === 'object';
      const val = String(isObj ? opt.value : opt);
      const label = String(isObj && opt.label != null ? opt.label : val);
      return { id: val, value: val, name: label, system: true };
    });
  }, [isStatic, options]);

  /* Load + stay in sync with other selects using the same master. */
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: load master data from store on mount and subscribe to updates */
  useEffect(() => {
    if (isStatic) return undefined;
    let active = true;
    if (remoteMaster) {
      /* Remote reference data is read through the shared cache so that:
         · every "Requesters" and "Buyers" picker on one form shares the SAME
           GET /users instead of firing one each (it fired twice per form), and
           · reopening a form reuses the already-loaded list instead of
           re-fetching it on every mount.

         These keys are deliberately separate from masterService's own
         `master:<key>` entries: this picker caches the raw API envelope,
         while masterService caches the unwrapped body, so sharing a key would
         hand one of the two consumers the wrong shape.

         Staleness is bounded by the TTL (60 s for pickers) and cleared by any
         Purchase write, which drops every 'purchase:' entry — see
         services/api/index.js writeRequest. */
      const loadRemote = async () => {
        const response = masterKey === 'vendors'
          ? await cachedRead(
              'purchase:vendors:page-500',
              () => purchaseGet('/vendors', { page: 0, size: 500 }),
              { ttlMs: READ_CACHE_TTL.PICKER_MS }
            )
          : masterKey === 'departments'
            ? await cachedRead(
                'purchase:departments',
                () => api.get('/masters/pr_departments'),
                { ttlMs: READ_CACHE_TTL.PICKER_MS }
              )
            : masterKey === 'companies'
              ? await cachedRead(
                  'purchase:companies',
                  () => api.get('/masters/companies'),
                  { ttlMs: READ_CACHE_TTL.PICKER_MS }
                )
              : await cachedRead(
                  'purchase:users',
                  () => api.get('/users'),
                  { ttlMs: READ_CACHE_TTL.PICKER_MS }
                );
        const body = response?.data?.data ?? response?.data ?? [];
        const values = masterKey === 'vendors'
          ? (body?.content || []).map((item) => ({ id: item.id, name: item.name, system: true }))
          : body.map((item) => {
            const value = item.value ?? item.fullName ?? item.name;
            return { id: item.id, name: String(value), system: true };
          });
        if (active) {
          setItems(values.filter((item) => item.name));
          setLoaded(true);
        }
      };
      loadRemote().catch(() => {
        if (active) {
          setLoaded(true);
          toast.error(`Unable to load ${MASTER_DEFS[masterKey]?.label || masterKey}`);
        }
      });
      return () => {
        active = false;
      };
    }
    const list = listMaster(masterKey);
    if (active) {
      setItems(list);
      setLoaded(true);
    }
    const unsubscribe = subscribeMaster(masterKey, (updatedList) => {
      if (active) setItems(updatedList);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isStatic, masterKey, remoteMaster, toast]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Close on outside click — must also cover the portaled menu. */
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      const target = e.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      closeDropdown();
    };
    const onScroll = (e) => {
      // allow scrolling inside the menu itself; close on any other scroll
      // Resize events target window, and captured scroll events may target
      // document/window; neither is a valid argument for Node.contains().
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, masterKey]);

  /* Position the portaled menu under the trigger (flip upward if needed). */
  const q = query.trim().toLowerCase();

  /* In static mode the list comes from the `options` prop; otherwise it
     comes from masterStore. Everything downstream uses `displayItems`. */
  const displayItems = isStatic ? staticItems : items;
  const listLoaded = isStatic || loaded;

  const filtered = useMemo(() => {
    if (!q) return displayItems;
    return displayItems.filter((i) => {
      const hay = formatLabel(i.name).toLowerCase();
      return i.name.toLowerCase().includes(q) || hay.includes(q);
    });
  }, [displayItems, q, formatLabel]);

  const exactMatch = displayItems.some((i) => i.name.trim().toLowerCase() === q);
  const showAddRow = !isStatic && canEdit && Boolean(q) && !exactMatch && !disabled;

  /* Unified rows (items + optional add-row) for keyboard navigation. */
  const rows = useMemo(() => {
    const list = filtered.map((item) => ({ kind: 'item', item }));
    if (showAddRow) list.push({ kind: 'add' });
    return list;
  }, [filtered, showAddRow]);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let top = rect.bottom + 6;
    let left = rect.left;
    const menu = menuRef.current;
    const height = menu ? menu.scrollHeight : 320;
    if (top + height > window.innerHeight - 8 && rect.top - height - 6 > 8) {
      top = rect.top - height - 6;
    }
    setMenuPos({ top, left, width: rect.width });
  }, [open, loaded, editingId, rows.length]);

  useEffect(() => {
    queueMicrotask(() => {
      setHighlight((h) => Math.min(h, Math.max(rows.length - 1, 0)));
    });
  }, [rows.length]);

  /* Keep the highlighted option in view — essential for long lists such as
     the ISO currency master when navigating with the arrow keys. */
  useEffect(() => {
    if (!open) return undefined;
    const rowEl = listRef.current?.querySelector(`[data-row-index="${highlight}"]`);
    rowEl?.scrollIntoView?.({ block: 'nearest' });
    return undefined;
  }, [open, highlight]);

  const selected = isStatic
    ? displayItems.find((i) => i.value === value) || (value ? { value, name: value } : null)
    : items.find((i) => i.name === value) || (value ? { id: value, name: value, system: false } : null);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setEditingId(null);
    setEditError('');
    setHighlight(
      searchable
        ? 0
        : Math.max(displayItems.findIndex((i) => (isStatic ? i.value : i.name) === value), 0)
    );
    requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus();
      else menuRef.current?.focus();
    });
  };

  const selectItem = (item) => {
    onChange?.(isStatic ? item.value : item.name);
    closeDropdown();
  };

  /* ---------- add ---------- */
  const handleAdd = async () => {
    if (!q || busy) return;
    const name = query.trim(); // keep the user's casing
    setBusy(true);
    const result = await addMasterItem(masterKey, name);
    setBusy(false);
    if (result.ok) {
      onChange?.(result.item.name);
      toast.success(`"${result.item.name}" added to ${masterLabel}`);
      closeDropdown();
    } else if (result.error === 'DUPLICATE') {
      setEditError(`"${name}" already exists in ${masterLabel}`);
    }
  };

  /* ---------- rename ---------- */
  const startRename = (item) => {
    setEditingId(item.id);
    setEditValue(item.name);
    setEditError('');
    setQuery('');
  };

  const submitRename = async () => {
    if (!editingId || busy) return;
    setBusy(true);
    const result = await renameMasterItem(masterKey, editingId, editValue);
    setBusy(false);
    if (result.ok) {
      if (value === result.previousName) onChange?.(result.item.name);
      toast.success(`Renamed to "${result.item.name}"`);
      setEditingId(null);
      setEditError('');
    } else if (result.error === 'DUPLICATE') {
      setEditError(`"${editValue.trim()}" already exists in ${masterLabel}`);
    } else if (result.error === 'EMPTY') {
      setEditError('Name cannot be empty');
    }
  };

  /* ---------- delete ---------- */
  const requestDelete = (item) => {
    /* Close the dropdown and drop focus BEFORE the confirmation modal
       opens so the dialog never overlaps an open menu (SAP/Oracle style). */
    deleteFromDropdownRef.current = true;
    closeDropdown();
    setPendingDelete(item);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || busy) return;
    setBusy(true);
    const result = await removeMasterItem(masterKey, pendingDelete.id);
    setBusy(false);
    const fromDropdown = deleteFromDropdownRef.current;
    deleteFromDropdownRef.current = false;
    if (result.ok) {
      if (value === pendingDelete.name) onChange?.('');
      toast.success(`"${pendingDelete.name}" removed from ${masterLabel}`);
    } else if (result.error === 'SYSTEM') {
      toast.error('System default values cannot be deleted');
    } else {
      toast.error('Could not delete value');
    }
    setPendingDelete(null);
    /* Reopen the dropdown (when the delete came from this dropdown) so the
       refreshed list is visible again and keyboard focus returns. */
    if (fromDropdown) openDropdown();
  };

  /* ---------- keyboard ---------- */
  const onSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[highlight];
      if (!row) return;
      if (row.kind === 'add') handleAdd();
      else selectItem(row.item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  };

  const menu = open ? (
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label={`${masterLabel} values`}
        tabIndex={searchable ? undefined : -1}
        onKeyDown={searchable ? undefined : onSearchKeyDown}
        style={{ position: 'fixed', top: menuPos?.top ?? 0, left: menuPos?.left ?? 0, width: menuPos?.width ?? 240, zIndex: 9999 }}
        className="bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95 outline-none"
      >
        {searchable && (
          <div className="relative border-b border-slate-100">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
                setEditError('');
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={canEdit ? 'Type to search or add...' : 'Type to search...'}
              aria-label={`Search ${masterLabel}`}
              className="w-full h-9 pl-8 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        )}

        <ul ref={listRef} className="max-h-56 overflow-y-auto py-1">
          {!listLoaded && <li className="px-3 py-6 text-center text-xs text-slate-400">Loading…</li>}
          {listLoaded && rows.length === 0 && !q && (
            <li className="px-3 py-6 text-center text-xs text-slate-400">No values yet — type to add one</li>
          )}
          {listLoaded && rows.length === 0 && q && (
            <li className="px-3 py-6 text-center text-xs text-slate-400">No matching values</li>
          )}

          {rows.map((row, index) => {
            if (row.kind === 'add') {
              return (
                <li key="add-row" role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={handleAdd}
                    onMouseEnter={() => setHighlight(index)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center gap-2 font-semibold ${
                      highlight === index ? 'bg-[#EDF7F4] text-[#0B4A3D]' : 'text-[#0B4A3D]'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    Add &ldquo;{query.trim()}&rdquo;
                  </button>
                </li>
              );
            }

            const item = row.item;
            const isSelected = isStatic ? item.value === value : item.name === value;
            const isEditing = editingId === item.id;

            if (isEditing) {
              return (
                <li key={item.id} className="px-2 py-1">
                  <input
                    type="text"
                    value={editValue}
                    autoFocus
                    onChange={(e) => {
                      setEditValue(e.target.value);
                      setEditError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitRename();
                      } else if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditError('');
                      }
                    }}
                    placeholder="New name"
                    aria-label={`Rename ${masterLabel}`}
                    className="w-full h-8 px-2 rounded-md border text-xs outline-none border-[#0B4A3D] focus:ring-2 focus:ring-[#0B4A3D]/20"
                  />
                  <div className="flex items-center justify-between mt-1 px-1">
                    {editError ? (
                      <span className="text-[10px] font-semibold text-rose-500">{editError}</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Enter to save · Esc to cancel</span>
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={submitRename}
                        disabled={busy}
                        className="px-2 py-0.5 text-[10px] font-bold text-white bg-[#0B4A3D] rounded cursor-pointer disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditError('');
                        }}
                        className="px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={item.id} role="option" data-row-index={index} aria-selected={isSelected}>
                <div
                  className={`w-full flex items-center gap-1 transition-colors ${
                    highlight === index ? 'bg-[#EDF7F4]' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`flex-1 min-w-0 text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected ? 'font-bold text-[#0B4A3D]' : 'font-medium text-slate-700'
                    }`}
                  >
                    <span className="truncate">{formatLabel(item.name)}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#0B4A3D] shrink-0" />}
                  </button>
                  {canEdit && !item.system && (
                    <span className="flex items-center gap-0.5 pr-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startRename(item)}
                        aria-label={`Rename ${item.name}`}
                        title="Rename"
                        className="p-1 rounded text-slate-400 hover:text-[#0B4A3D] hover:bg-white cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDelete(item)}
                        aria-label={`Delete ${item.name}`}
                        title="Delete"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-white cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body
    )
  ) : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={openDropdown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openDropdown();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${TRIGGER} ${sizeClasses(size)} ${error ? 'border-rose-400' : 'border-slate-200 hover:border-slate-300 focus:border-[#0B4A3D]'}`}
      >
        <span className={`truncate ${selected ? 'text-slate-700' : 'text-slate-400'}`}>
          {selected ? formatLabel(selected.name) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
                setQuery('');
              }}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {menu}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${masterLabel}?`}
        message={`Are you sure you want to delete "${pendingDelete?.name || ''}"?\n\nThis action removes it from future selections.\nExisting saved documents using this value will not be affected.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

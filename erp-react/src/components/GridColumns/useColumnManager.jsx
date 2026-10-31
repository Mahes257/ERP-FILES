/**
 * useColumnManager.jsx — the reusable "Manage Columns" engine.
 * ------------------------------------------------------------------
 * Extracted and generalized from the CPR Item Details grid (the ERP's
 * reference implementation) so EVERY Sales & Marketing grid offers the exact
 * same experience:
 *
 *   · portal-rendered, viewport-clamped popup (never clipped, never off-screen)
 *   · show/hide (eye) per column
 *   · rename (pencil) per column — display label only, data keeps its id
 *   · reorder (move left / move right) per column
 *   · remove (trash) for user-defined columns only; system columns protected
 *   · Add Custom Column (name + type) with a stable, label-independent id
 *   · Reset to Default
 *
 * The hook is CONTROLLED: it never owns column state. It calls onChange(next)
 * / onReset(), so the caller decides where the configuration lives — a
 * document's JSON payload (CPR, Quotation, …) or the MySQL-backed grid config
 * store (list tables). Both paths persist React → Spring Boot → MySQL.
 *
 * Custom column values are stored per row in `row.customFields[columnId]`, so
 * values stay independent per row and renaming a column never orphans data.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, Check, Columns3, Eye, EyeOff, Pencil, Plus, Trash2, X
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../Common';
import { newCustomColumnId } from '../../utils/gridColumns';

const ACTION_BTN =
  'inline-flex items-center justify-center w-[22px] h-[22px] rounded text-slate-400 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';
const ACTION_DEL =
  'inline-flex items-center justify-center w-[22px] h-[22px] rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer';

export const DEFAULT_CUSTOM_COLUMN_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' }
];

/**
 * @param {object}   cfg
 * @param {Array}    cfg.columns       ordered column defs {id,key,label,type,system,required,hidden,width,order}
 * @param {Function} cfg.onChange      called with the full next column array
 * @param {Function} [cfg.onReset]     reset-to-default handler (enables the footer button)
 * @param {boolean}  [cfg.allowCustom] offer "Add Custom Column" (default true)
 * @param {Array}    [cfg.columnTypes] custom column type options
 * @param {string}   [cfg.itemNoun]    noun used in confirm copy ("row" | "item")
 * @param {Array}    [cfg.insertBeforeKeys] keys the new column is inserted before
 * @param {string}   [cfg.masterKeyPrefix] master-key prefix for dropdown custom columns
 * @param {number}   [cfg.rowCount]    rows affected by remove/reset confirmations
 */
export default function useColumnManager({
  columns = [],
  onChange,
  onReset,
  allowCustom = true,
  columnTypes = DEFAULT_CUSTOM_COLUMN_TYPES,
  itemNoun = 'row',
  insertBeforeKeys = [],
  rowCount = 0,
  removeColumnValues,
  // When the caller knows the configuration has drifted from the grid's own
  // defaults (order / visibility / width / label), Reset to Default must be
  // available even though no CUSTOM column exists. Undefined keeps the
  // original rule (only grids with custom columns can reset).
  resetEnabled,
  // Structural columns that are excluded from the Management list entirely
  // (e.g. the row checkbox and the Actions column). They can neither be
  // renamed, reordered, hidden nor removed.
  protectedKeys = []
}) {
  const toast = useToast();
  const [anchorRect, setAnchorRect] = useState(null);
  // null (closed) | 'menu' | 'add' | {renameId}
  const [panel, setPanel] = useState(null);
  const [popupPos, setPopupPos] = useState(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('text');
  const [renameValue, setRenameValue] = useState('');
  const [columnToRemove, setColumnToRemove] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const anchorRef = useRef(null);
  const popupRef = useRef(null);

  const ordered = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasCustom = ordered.some((c) => c && !c.system);
  // Reset is offered when there is something to reset: custom columns, or a
  // configuration that has drifted from the grid's built-in defaults.
  const canReset = resetEnabled === undefined ? hasCustom : Boolean(resetEnabled);
  const plural = rowCount === 1 ? itemNoun : `${itemNoun}s`;
  // Columns the user may manage. Protected structural columns stay in the
  // table but never appear in the Manage Columns list.
  const manageable = ordered.filter((c) => !protectedKeys.includes(c.key));

  const update = (next) => {
    const withOrder = next.map((c, i) => ({ ...c, order: i + 1 }));
    if (onChange) onChange(withOrder);
  };

  const openMenu = (el) => {
    anchorRef.current = el || null;
    setAnchorRect(el ? el.getBoundingClientRect() : null);
    setPanel((p) => (p ? null : 'menu'));
  };
  const openRename = (columnId, el) => {
    const col = ordered.find((c) => c.id === columnId);
    if (!col) return;
    anchorRef.current = el || null;
    setAnchorRect(el ? el.getBoundingClientRect() : null);
    setRenameValue(col.label);
    setPanel({ renameId: columnId });
  };
  const close = () => {
    setPanel(null);
    setColumnToRemove(null);
  };

  /* ---- column mutations (shared by every grid) ---- */
  const toggleVisibility = (id) => {
    update(ordered.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)));
  };

  const renameColumn = (id, label) => {
    const trimmed = (label || '').trim();
    if (!trimmed) {
      toast.warning('Column name cannot be empty');
      return;
    }
    if (ordered.some((c) => c.id !== id && c.label.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast.warning(`A column named "${trimmed}" already exists`);
      return;
    }
    update(ordered.map((c) => (c.id === id ? { ...c, label: trimmed } : c)));
    setPanel('menu');
  };

  const addCustomColumn = (name, type) => {
    const label = (name ?? newColumnName).trim();
    if (!label) {
      toast.warning('Enter a column name');
      return;
    }
    if (ordered.some((c) => c.label.trim().toLowerCase() === label.toLowerCase())) {
      toast.warning(`A column named "${label}" already exists`);
      return;
    }
    const col = {
      id: newCustomColumnId(),
      key: 'custom',
      label,
      type: (type ?? newColumnType) || 'text',
      required: false,
      system: false,
      hidden: false,
      width: 150,
      order: 0
    };
    // Insert before the first matching key (e.g. Remarks / Actions) so custom
    // columns land inside the data area, never after the Actions column.
    let insertAt = ordered.length;
    for (const key of insertBeforeKeys) {
      const idx = ordered.findIndex((c) => c.key === key);
      if (idx >= 0) {
        insertAt = Math.min(insertAt, idx);
      }
    }
    const next = [...ordered];
    next.splice(insertAt, 0, col);
    update(next);
    setNewColumnName('');
    setNewColumnType('text');
    setPanel('menu');
  };

  const removeColumn = (col) => {
    update(ordered.filter((c) => c.id !== col.id));
    if (removeColumnValues) removeColumnValues(col.id);
    setColumnToRemove(null);
  };

  // Reorder by swapping with the neighbouring MANAGEABLE column, so protected
  // structural columns (checkbox, Actions) always keep their position.
  const moveColumn = (id, dir) => {
    const mIdx = manageable.findIndex((c) => c.id === id);
    const tIdx = mIdx + dir;
    if (mIdx < 0 || tIdx < 0 || tIdx >= manageable.length) return;
    const targetId = manageable[tIdx].id;
    const a = ordered.findIndex((c) => c.id === id);
    const b = ordered.findIndex((c) => c.id === targetId);
    if (a < 0 || b < 0) return;
    const next = [...ordered];
    [next[a], next[b]] = [next[b], next[a]];
    update(next);
  };

  const reset = () => {
    setConfirmReset(false);
    setPanel(null);
    if (onReset) onReset();
  };

  /* ---- viewport-clamped popup positioning (portal to body) ---- */
  useLayoutEffect(() => {
    if (!panel) {
      setPopupPos(null);
      return undefined;
    }
    const compute = () => {
      const anchor = anchorRef.current;
      const W = 340;
      const MARGIN = 12;
      const maxH = Math.max(240, Math.min(420, window.innerHeight - 2 * MARGIN));
      let top;
      let left;
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        left = r.right - W;
        if (left < MARGIN) left = MARGIN;
        if (left + W > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - W;
        const spaceBelow = window.innerHeight - r.bottom;
        top = spaceBelow >= Math.min(maxH, 320) + MARGIN
          ? r.bottom + 6
          : Math.max(MARGIN, r.top - maxH - 6);
      } else if (anchorRect) {
        left = Math.max(MARGIN, Math.min(anchorRect.right - W, window.innerWidth - MARGIN - W));
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        top = spaceBelow >= Math.min(maxH, 320) + MARGIN
          ? anchorRect.bottom + 6
          : Math.max(MARGIN, anchorRect.top - maxH - 6);
      } else {
        left = Math.max(MARGIN, window.innerWidth - MARGIN - W);
        top = 80;
      }
      setPopupPos({ top, left, width: W, maxHeight: maxH });
    };
    compute();
    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const popup = panel && popupPos
    ? createPortal(
        <div
          ref={popupRef}
          className="fixed z-[70] rounded-xl border border-slate-200 bg-surface shadow-xl flex flex-col"
          style={{ top: popupPos.top, left: popupPos.left, width: popupPos.width, maxHeight: popupPos.maxHeight }}
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">Manage Columns</span>
            <button type="button" className="text-slate-400 hover:text-slate-700" onClick={close} title="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {panel === 'add' ? (
            <div className="p-3.5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Column Name</label>
              <input
                autoFocus
                className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                value={newColumnName}
                placeholder="e.g. Material, Grade, Finish"
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomColumn();
                  }
                }}
              />
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-3 mb-1">Type</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value)}
              >
                {columnTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  className="h-8 px-3 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                  onClick={() => {
                    setNewColumnName('');
                    setNewColumnType('text');
                    setPanel('menu');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-8 px-3.5 rounded-md text-xs font-bold bg-[#0B4A3D] text-white hover:bg-[#083D34] transition-all cursor-pointer"
                  onClick={() => addCustomColumn()}
                >
                  Add Column
                </button>
              </div>
            </div>
          ) : panel && typeof panel === 'object' && panel.renameId ? (
            (() => {
              const col = ordered.find((c) => c.id === panel.renameId);
              if (!col) return null;
              return (
                <div className="p-3.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Rename “{col.label}”</label>
                  <input
                    autoFocus
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        renameColumn(col.id, renameValue);
                      }
                    }}
                  />
                  <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
                    Only the display label changes — saved data keeps the same internal column, so nothing breaks.
                  </p>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button
                      type="button"
                      className="h-8 px-3 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                      onClick={() => setPanel('menu')}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 h-8 px-3.5 rounded-md text-xs font-bold bg-[#0B4A3D] text-white hover:bg-[#083D34] transition-all cursor-pointer"
                      onClick={() => renameColumn(col.id, renameValue)}
                    >
                      <Check className="w-3.5 h-3.5" /> Rename
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                {manageable.map((c, i) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 group ${c.hidden ? 'opacity-50' : ''}`}
                  >
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center w-5 h-5 rounded shrink-0 transition-colors ${c.hidden ? 'text-slate-300 hover:text-slate-500' : 'text-[#0B4A3D] hover:bg-[#0B4A3D]/10'}`}
                      title={c.hidden ? `Show ${c.label}` : `Hide ${c.label}`}
                      onClick={() => toggleVisibility(c.id)}
                    >
                      {c.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <span
                      className={`flex-1 text-xs font-medium truncate ${c.hidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                      title={c.system ? `${c.label} (system column)` : c.label}
                    >
                      {c.label}
                      {c.required && c.system ? <span className="text-rose-400"> *</span> : null}
                    </span>
                    <button
                      type="button"
                      className={ACTION_BTN}
                      title="Rename"
                      onClick={() => {
                        setRenameValue(c.label);
                        setPanel({ renameId: c.id });
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {!c.system && allowCustom && (
                      <button
                        type="button"
                        className={ACTION_DEL}
                        title={`Remove ${c.label}`}
                        onClick={() => setColumnToRemove({ id: c.id, label: c.label })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    <span className="inline-flex flex-col">
                      <button
                        type="button"
                        className={`${ACTION_BTN} !w-4 !h-3`}
                        title="Move Left"
                        disabled={i === 0}
                        onClick={() => moveColumn(c.id, -1)}
                      >
                        <ArrowLeft className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        className={`${ACTION_BTN} !w-4 !h-3`}
                        title="Move Right"
                        disabled={i === manageable.length - 1}
                        onClick={() => moveColumn(c.id, 1)}
                      >
                        <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-t border-slate-100 shrink-0">
                {allowCustom ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold text-[#0B4A3D] hover:bg-[#0B4A3D]/5 transition-all cursor-pointer"
                    onClick={() => setPanel('add')}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Custom Column
                  </button>
                ) : <span />}
                {onReset ? (
                  <button
                    type="button"
                    className={`h-8 px-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${canReset ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'}`}
                    disabled={!canReset}
                    onClick={() => setConfirmReset(true)}
                  >
                    Reset to Default
                  </button>
                ) : <span />}
              </div>
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return {
    popup,
    isOpen: Boolean(panel),
    hasCustom,
    openMenu,
    openRename,
    close,
    columnToRemove,
    confirmResetDialogs: (
      <>
        <ConfirmDialog
          open={!!columnToRemove}
          title="Remove Column"
          message={
            columnToRemove
              ? `Remove the "${columnToRemove.label}" column? Its values in all ${rowCount} ${plural} will be removed.`
              : ''
          }
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => removeColumn(columnToRemove)}
          onCancel={() => setColumnToRemove(null)}
        />
        <ConfirmDialog
          open={confirmReset}
          title="Reset Columns to Default"
          message={
            hasCustom
              ? 'Resetting removes all custom columns AND their saved values in every row. Standard columns and their data are kept. Continue?'
              : canReset
                ? 'Reset the columns to their defaults? Order, visibility, widths and labels go back to the built-in layout. No data is lost.'
                : 'Reset the table to the default columns? No custom columns exist, so nothing will be lost.'
          }
          confirmLabel="Reset"
          variant={hasCustom ? 'danger' : 'default'}
          onConfirm={reset}
          onCancel={() => setConfirmReset(false)}
        />
      </>
    )
  };
}

/**
 * Toolbar button that opens the shared Manage Columns popup.
 *
 * It renders the popup itself (portal) plus its confirmation dialogs, so a
 * grid only has to drop the button into its toolbar — no extra wiring, and no
 * chance of a grid forgetting to mount the popup.
 */
export function ManageColumnsButton({ manager, label = 'Manage Columns', className = '' }) {
  const ref = useRef(null);
  return (
    <>
      <button
        type="button"
        ref={ref}
        data-manage-columns-button=""
        onClick={() => manager.openMenu(ref.current)}
        title="Add, rename, reorder, hide, resize or remove table columns"
        className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold border-[1.5px] transition-all cursor-pointer ${
          manager.hasCustom
            ? 'border-[#0B4A3D] text-[#0B4A3D] bg-[#0B4A3D]/5 hover:bg-[#0B4A3D]/10'
            : 'border-slate-300 text-slate-600 bg-surface hover:bg-slate-50'
        } ${className}`}
      >
        <Columns3 className="w-3.5 h-3.5" /> {label}
      </button>
      {manager.popup}
      {manager.confirmResetDialogs}
    </>
  );
}

/** Pencil control rendered inside a table header for direct label editing. */
export function ColumnRenameButton({ manager, column, className = '' }) {
  const ref = useRef(null);
  return (
    <button
      type="button"
      ref={ref}
      className={`inline-flex items-center justify-center w-4 h-4 rounded text-slate-400 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-all cursor-pointer ${className}`}
      title={`Rename ${column.label}`}
      onClick={() => manager.openRename(column.id, ref.current)}
    >
      <Pencil className="w-2.5 h-2.5" />
    </button>
  );
}

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Boxes, ChevronDown, ChevronUp, Columns3, Copy, Eye, EyeOff, FileText, GripVertical, Lock, Paperclip, Pencil, Plus, Trash2, X, AlertTriangle, Check, ArrowLeft, ArrowRight
} from 'lucide-react';
import { ConfirmDialog, EditableMasterDropdown, useToast } from '../Common';
import { useColumnResize, ColumnResizer } from '../GridColumns';
import ItemCwPrButtons from './ItemCwPrButtons';
import { getAttachmentSelectionError, MAX_ATTACHMENT_SIZE_LABEL } from '../../utils/attachmentStorage';
import { defaultCprItemColumns, hasCustomItemColumns, newCustomColumnId } from '../../utils/cprHelpers';
import useClickOutside from '../../hooks/useClickOutside';
import useGridColumns from '../../hooks/useGridColumns';

// UOM values are loaded from the backend `master_values` table (master key
// 'pr_units') via EditableMasterDropdown — searchable, addable, editable,
// deletable, and persisted in MySQL. No hardcoded list.

// min-w-0 lets auto table layout shrink cells to the colgroup hints instead
// of the input's intrinsic ~170px minimum.
const CELL_INPUT =
  'w-full min-w-0 h-[30px] rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all';
const CELL_INPUT_ERROR =
  'w-full min-w-0 h-[30px] rounded-md border border-rose-400 bg-rose-50/40 px-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-rose-500 transition-all';

const ACTION_BTN =
  'inline-flex items-center justify-center w-[22px] h-[22px] rounded text-slate-400 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';
const ACTION_DEL = 'inline-flex items-center justify-center w-[22px] h-[22px] rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer';

// A column is removable if it is user-defined (custom) OR if it is a standard
// column that is NOT required by validation/workflow.  Required standard
// columns (Description, Qty, UOM) are protected; optional ones (Drawing No,
// Specification, Est. Cost, Remarks) may be removed.
const isColumnRemovable = (c) => !c.system || !c.required;

// The Material column (`description`) is still required — it is validated, kept
// non-removable and submitted exactly as before. Only its visual required
// marker (the `*`) is suppressed; every other required column keeps its marker.
const showsRequiredMarker = (c) => c.required && c.system && c.id !== 'description';

// Structural column widths — the serial number / grip / computed Total / Actions
// columns are fixed; every configurable column below is drag-resizable and its
// width is persisted with the column configuration.
const SNO_COL_WIDTH = 42;
const GRIP_COL_WIDTH = 34;
const TOTAL_COL_WIDTH = 120;
// Per-item Notes is a fixed structural column: every item row always has its
// own notes input (it is never hidden or removed by the column configuration).
const NOTES_COL_WIDTH = 230;
const ACTIONS_COL_WIDTH = 250;

function newItem() {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    drawingNo: '',
    description: '',
    specification: '',
    qty: 1,
    unit: '',
    estimatedCost: 0,
    remarks: '',
    // Item-level notes for THIS row only. Multi-line; persisted with the item.
    notes: '',
    // Item-level attachments {name, size, type, data(base64)} — carried into
    // the Cost Workout / Purchase Requisition created from this item.
    attachments: [],
    // User-defined custom column cell values {columnId: value} — one object per
    // row, so values are always independent between rows.
    customFields: {}
  };
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

// Reads a File as a base64 data URL — the same embedded payload shape the
// Cost Workout form uses for its attachments ({name, size, type, data}).
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatCurrency(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Repeated item rows are VALID here: two rows may legitimately carry the same
// Drawing No and/or the same Material (the legacy ERP's
// findDuplicateDescriptions() rule used to reject them, and this grid mirrored
// it). Each row is its own record — identity comes from the per-row `id`
// generated in newItem() and used as the React key, never from its business
// values — so identical rows render, persist and reload independently. The
// database has no unique constraint on cpr_items business fields, and the
// backend creates one CprItem per submitted row, so nothing is deduplicated.
// Duplicate-DOCUMENT protection (double-clicked Save / retried request) lives
// in AddCpr's saveCpr() concurrency guard, which is a different concern.

const CprItemGrid = forwardRef(function CprItemGrid({ items, setItems, sourceForm, onColumnsChange, onEnsureSaved, hideCostColumns = false, labelOverrides = null }, ref) {
  const toast = useToast();
  const dragIndexRef = useRef(null);
  const tableRef = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Manage Columns popup — portal-rendered to document.body so the Item
  // Details card's `overflow: hidden` can never clip it, and viewport-clamped
  // so it always fits on screen (internal scroll for long column lists).
  const columnsBtnWrapRef = useRef(null);
  const popupRef = useRef(null);
  const [popupPos, setPopupPos] = useState(null);
  // columnToRemove is {id, label} while the "Remove column?" dialog is open.
  const [columnToRemove, setColumnToRemove] = useState(null);
  // Panel state: null (closed) | 'menu' | 'add' | {renameId}
  const [columnsPanel, setColumnsPanel] = useState(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('text');
  const [renameValue, setRenameValue] = useState('');
  // rowErrors[i] = set of fields flagged invalid by validate(): 'description' | 'qty' | 'unit' | 'cost' | custom column ids
  const [rowErrors, setRowErrors] = useState({});

  // Close the popup on any pointer press outside it. Declared AFTER the
  // columnsPanel state (it is referenced in the enabled flag).  The popup
  // is portal-rendered to document.body, so clicks inside it must also be
  // treated as "inside" to prevent the mousedown handler from closing the
  // panel before the onClick handler on Add/Delete/Rename buttons fires.
  const clickOutsideRefs = useMemo(() => [columnsBtnWrapRef, popupRef], []);
  useClickOutside(clickOutsideRefs, () => setColumnsPanel(null), !!columnsPanel);

  // ---- Manage Columns configuration ----------------------------------------
  // The Item Details column configuration is a MODULE setting, exactly like
  // every other grid in the ERP: it lives in the shared MySQL grid-config store
  // under `sales.items.cpr` (GET/PUT /settings/grid-configs/sales.items.cpr).
  //
  //   · a NEW CPR has no snapshot of its own → it opens with the module
  //     configuration, so a renamed / added / reordered / hidden / resized
  //     column is still there next time;
  //   · a SAVED CPR carries its own snapshot (form.itemColumns →
  //     cprs.item_columns_json) and that snapshot wins, so an existing document
  //     keeps rendering the exact columns it was saved with (View / Preview /
  //     PDF stay immutable and never change retroactively);
  //   · every user column action writes BOTH — the module configuration for
  //     future CPRs and the current record's snapshot.
  //
  // Only COLUMN DEFINITIONS (id / key / label / type / width / order / hidden /
  // system / required) are ever stored here. Item VALUES stay per row in the
  // document's own items (customFields), so a new CPR always starts blank and
  // no other record is ever copied.
  const moduleStore = useGridColumns({
    gridKey: 'sales.items.cpr',
    defaults: defaultCprItemColumns
  });

  const recordColumns = sourceForm?.itemColumns;
  const columns = useMemo(
    () => (Array.isArray(recordColumns) && recordColumns.length > 0
      ? recordColumns
      : (Array.isArray(moduleStore.columns) && moduleStore.columns.length > 0
        ? moduleStore.columns
        : defaultCprItemColumns())),
    [recordColumns, moduleStore.columns]
  );

  // Create-CPR-only UI scope: the Create form hides the Est. Cost and Total
  // columns (see the `hideCostColumns` prop). This is a RENDER-ONLY switch —
  // every row keeps its real `estimatedCost` value, the save payload is
  // unchanged, and the column definitions (module + record snapshot) are
  // written exactly as before, so Edit / View keep rendering both columns.
  const showCostColumns = !hideCostColumns;

  const businessColumns = columns.filter((c) => c.id !== 'qty' && c.id !== 'unit' && c.id !== 'estimatedCost');
  const commercialColumns = columns.filter((c) => c.id === 'qty' || c.id === 'unit' || c.id === 'estimatedCost');
  const sortedBusiness = [...businessColumns].sort((a, b) => a.order - b.order);
  // The TABLE renders only visible columns; hidden ones stay in the
  // configuration (Manage Columns) so they can be shown again.
  const orderedBusiness = sortedBusiness.filter((c) => !c.hidden);

  const updateColumns = (next) => {
    const withOrder = next.map((c, i) => ({ ...c, order: i + 1 }));
    // MODULE-level persistence: every future CPR opens with these columns.
    moduleStore.setColumns(withOrder);
    // RECORD-level snapshot: this document keeps rendering these columns.
    if (onColumnsChange) onColumnsChange(withOrder);
  };

  const toggleColumnVisibility = (id) => {
    updateColumns(columns.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)));
  };

  const addCustomColumn = () => {
    const label = newColumnName.trim();
    if (!label) {
      toast.warning('Enter a column name');
      return;
    }
    if (columns.some((c) => c.label.trim().toLowerCase() === label.toLowerCase())) {
      toast.warning(`A column named "${label}" already exists`);
      return;
    }
    const col = { id: newCustomColumnId(), key: 'custom', label, type: newColumnType || 'text', required: false, system: false, hidden: false, order: 0 };
    // Every existing row gets an independent value slot for the new column.
    setItems((prev) => prev.map((it) => ({ ...it, customFields: { ...(it.customFields || {}), [col.id]: '' } })));
    // Custom columns are inserted before Remarks when present, else before the
    // commercial columns (Qty/UOM/Est. Cost) which stay grouped at the right.
    // Insertion uses the FULL sorted list so position is correct even when
    // some columns are currently hidden.
    const remarksIdx = sortedBusiness.findIndex((c) => c.id === 'remarks');
    const insertAt = remarksIdx >= 0 ? remarksIdx : sortedBusiness.length;
    const next = [...sortedBusiness];
    next.splice(insertAt, 0, col);
    updateColumns([...next, ...commercialColumns]);
    setNewColumnName('');
    setNewColumnType('text');
    setColumnsPanel('menu');
  };

  const renameColumn = (id, label) => {
    const trimmed = (label || '').trim();
    if (!trimmed) {
      toast.warning('Column name cannot be empty');
      return;
    }
    if (columns.some((c) => c.id !== id && c.label.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast.warning(`A column named "${trimmed}" already exists`);
      return;
    }
    updateColumns(columns.map((c) => (c.id === id ? { ...c, label: trimmed } : c)));
    setColumnsPanel('menu');
  };

  const removeColumn = (col) => {
    updateColumns(columns.filter((c) => c.id !== col.id));
    // Drop the column's cell values from every row (labels are display-only;
    // stable ids mean this only touches the removed column's data).
    setItems((prev) => prev.map((it) => {
      const cf = { ...(it.customFields || {}) };
      delete cf[col.id];
      return { ...it, customFields: cf };
    }));
    setRowErrors((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        next[k] = (v || []).filter((f) => f !== col.id);
      });
      return next;
    });
    setColumnToRemove(null);
  };

  const moveColumn = (id, dir) => {
    const idx = sortedBusiness.findIndex((c) => c.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sortedBusiness.length) return;
    const next = [...sortedBusiness];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    updateColumns([...next, ...commercialColumns]);
  };

  const resetColumns = () => {
    const defaults = defaultCprItemColumns();
    // Drop the stored module configuration so future CPRs fall back to the
    // built-in columns again, and snapshot the defaults on this record.
    moduleStore.resetToDefaults();
    if (onColumnsChange) onColumnsChange(defaults);
    setConfirmReset(false);
    setColumnsPanel(null);
  };

  const addItem = () => setItems((prev) => [...prev, newItem()]);

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const updateCustomField = (index, columnId, value) => {
    setItems((prev) => prev.map((it, i) => (
      i === index ? { ...it, customFields: { ...(it.customFields || {}), [columnId]: value } } : it
    )));
  };

  const deleteItem = (index) => {
    // Mirrors the ERP: the grid must keep at least one item.
    if (items.length <= 1) {
      toast.warning('Keep at least one item');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const moveItem = (index, dir) => {
    setItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  // Per-item attachment file inputs, keyed by item.id so refs survive reorders.
  const fileInputRefs = useRef({});

  const handleAttachFiles = async (index, fileList) => {
    const all = Array.from(fileList || []);
    const files = all.filter((file) => {
      const err = getAttachmentSelectionError(file);
      if (err) {
        toast.warning(err.message);
        return false;
      }
      return true;
    });
    if (files.length === 0) return;
    const read = await Promise.all(files.map(async (file) => ({ file, data: await readFileAsDataUrl(file) })));
    const next = read.map(({ file, data }) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      data
    }));
    updateItem(index, { attachments: [...(items[index]?.attachments || []), ...next] });
  };

  const removeItemAttachment = (index, fileIdx) => {
    updateItem(index, { attachments: (items[index]?.attachments || []).filter((_, i) => i !== fileIdx) });
  };

  const duplicateItem = (index) => {
    setItems((prev) => {
      const copy = { ...prev[index], id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, customFields: { ...(prev[index]?.customFields || {}) } };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const clearAll = () => {
    setItems([]);
    setRowErrors({});
    setConfirmClear(false);
  };

  const onDragStart = (index) => (e) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (index) => (e) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from == null || from === index) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    dragIndexRef.current = null;
  };

  /* ---- Keyboard navigation (mirrors ERP _initKeyboardNav / _focusNextCell) ---- */
  const editableFieldsOf = (rowEl) => Array.from(rowEl.querySelectorAll('input, select'));
  const rowsOf = () => Array.from(tableRef.current?.querySelectorAll('tbody tr') || []);

  const focusField = (el) => {
    if (el) {
      el.focus();
      if (el.tagName === 'INPUT') el.select();
    }
  };

  const onGridKeyDown = (e) => {
    const target = e.target;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'SELECT')) return;
    const row = target.closest('tr');
    if (!row) return;
    const rows = rowsOf();
    const rowIdx = rows.indexOf(row);
    const fields = editableFieldsOf(row);
    const fieldIdx = fields.indexOf(target);

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const targetRow = rows[rowIdx + dir];
      if (!targetRow) return;
      const targetFields = editableFieldsOf(targetRow);
      focusField(targetFields[Math.min(fieldIdx, targetFields.length - 1)]);
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey) {
        if (fieldIdx < fields.length - 1) {
          focusField(fields[fieldIdx + 1]);
          return;
        }
        const nextRow = rows[rowIdx + 1];
        if (nextRow) {
          focusField(editableFieldsOf(nextRow)[0]);
        } else {
          // Last cell of last row: auto-add a new row when the current row is valid.
          const item = items[rowIdx];
          if (item && (item.description || '').trim() && parseFloat(item.qty) > 0) {
            addItem();
            requestAnimationFrame(() => {
              const newRows = rowsOf();
              const nr = newRows[newRows.length - 1];
              focusField(editableFieldsOf(nr)[0]);
            });
          }
        }
      } else {
        if (fieldIdx > 0) {
          focusField(fields[fieldIdx - 1]);
          return;
        }
        const prevRow = rows[rowIdx - 1];
        if (prevRow) {
          const prevFields = editableFieldsOf(prevRow);
          focusField(prevFields[prevFields.length - 1]);
        }
      }
    }
  };

  /* ---- Drawing No sanitization (mirrors ERP onDrawingNoChange) ---- */
  const onDrawingNoChange = (index, value) => {
    const sanitized = value.replace(/[^A-Za-z0-9 _/.-]+/g, '');
    updateItem(index, { drawingNo: sanitized });
  };

  /* ---- Imperative validate() (mirrors ERP validate + _highlightErrors) ---- */
  useImperativeHandle(ref, () => ({
    validate() {
      const messages = [];
      let valid = true;
      if (items.length === 0) {
        return { valid: false, messages: ['Please add at least one item'] };
      }
      const nextErrors = {};
      let hasEmptyDesc = false;
      let hasInvalidQty = false;
      let hasEmptyUom = false;
      let hasMissingCustom = false;

      const requiredCustom = columns.filter((c) => !c.system && c.required);

      items.forEach((item, i) => {
        const errSet = new Set();
        const desc = (item.description || '').trim();
        const qty = parseFloat(item.qty) || 0;
        const cost = parseFloat(item.estimatedCost) || 0;

        if (!desc) {
          errSet.add('description');
          hasEmptyDesc = true;
          valid = false;
        }
        if (!item.qty || isNaN(parseFloat(item.qty)) || qty <= 0) {
          errSet.add('qty');
          hasInvalidQty = true;
          valid = false;
        }
        if (!item.unit) {
          errSet.add('unit');
          hasEmptyUom = true;
          valid = false;
        }
        if (cost < 0) {
          errSet.add('cost');
          valid = false;
        }
        // Custom columns default to optional; explicitly-required ones are enforced.
        requiredCustom.forEach((c) => {
          const v = (item.customFields || {})[c.id];
          if (v == null || String(v).trim() === '') {
            errSet.add(c.id);
            hasMissingCustom = true;
            valid = false;
          }
        });
        if (errSet.size) nextErrors[i] = Array.from(errSet);
      });

      // No duplicate-description rule: identical Material/Drawing No across rows
      // is intentional and must not block the save.
      if (hasEmptyDesc) messages.push('Fill in item descriptions');
      if (hasInvalidQty) messages.push('Enter valid quantities');
      if (hasEmptyUom) messages.push('Select UOM for all items');
      if (hasMissingCustom) {
        const names = requiredCustom.filter((c) => items.some((it) => {
          const v = (it.customFields || {})[c.id];
          return v == null || String(v).trim() === '';
        })).map((c) => c.label).join(', ');
        messages.push(`Fill in required column(s): ${names}`);
      }

      setRowErrors(nextErrors);
      if (messages.length) toast.warning(messages.join('; '));
      return { valid, messages };
    },
    clearErrors() {
      setRowErrors({});
    }
  }));

  const grandTotal = items.reduce((sum, it) => sum + (parseFloat(it.qty) || 0) * (parseFloat(it.estimatedCost) || 0), 0);
  const hasItems = items.length > 0;
  const hasCustomCols = hasCustomItemColumns(columns);

  const cellCls = (index, field) =>
    rowErrors[index]?.includes(field) ? CELL_INPUT_ERROR : CELL_INPUT;

  // Compute the popup position (viewport-clamped) whenever it opens or the
  // window changes. Rendered via portal to document.body — never clipped by
  // the Item Details card's overflow:hidden, never off-screen.
  useLayoutEffect(() => {
    if (!columnsPanel) {
      setPopupPos(null);
      return undefined;
    }
    const compute = () => {
      const anchor = columnsBtnWrapRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const W = 340;
      const MARGIN = 12;
      const maxH = Math.max(240, Math.min(420, window.innerHeight - 2 * MARGIN));
      let left = r.right - W;
      if (left < MARGIN) left = MARGIN;
      if (left + W > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - W;
      // Prefer opening DOWNWARD from the button; if the popup would overflow
      // the viewport bottom, open upward instead.
      const spaceBelow = window.innerHeight - r.bottom;
      let top;
      if (spaceBelow >= Math.min(maxH, 320) + MARGIN) {
        top = r.bottom + 6;
      } else {
        top = Math.max(MARGIN, r.top - maxH - 6);
      }
      setPopupPos({ top, left, width: W, maxHeight: maxH });
    };
    compute();
    // Recompute once fonts/layout have fully settled (first paint can be a few
    // px off, which at short viewport heights would push the popup off-screen).
    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [columnsPanel]);

  // Drag-to-resize: live widths while dragging, committed (and persisted with
  // the column config) on release. Header and body cells share these widths via
  // the colgroup, so they can never drift apart.
  const resize = useColumnResize({ columns, onChange: (next) => updateColumns(next) });

  const colById = (id) => columns.find((c) => c.id === id);

  // Display-only column-name override (see the `labelOverrides` prop).
  //
  // The Create CPR table labels its `drawingNo` column "PR" to match the
  // reference design, while the column itself keeps its stored definition —
  // so Edit / View, the saved record snapshot and the shared module config
  // (`sales.items.cpr`) all keep the original name. Nothing here is written
  // back through updateColumns(), which always persists the real `c.label`.
  const labelOf = (c) => (c && labelOverrides && labelOverrides[c.id]) || (c ? c.label : '');

  // Width for a configurable column (drag-resizable, persisted).
  const colWidth = (c) => ({ width: c ? resize.widthOf(c) : undefined });

  // The table's min-width is the sum of every rendered column width, so the grid
  // scrolls horizontally INSIDE its container once the columns need more room
  // than the page provides — never the page itself.
  // A column whose stored configuration carries no width legitimately renders
  // "auto" (widthOf returns undefined). Coerce those to 0 here so the table's
  // min-width stays a real number — a width-less saved/module column must never
  // turn into NaN and break the grid's layout.
  const minWidthOf = (c) => Number(resize.widthOf(c)) || 0;
  const tableMinWidth =
    GRIP_COL_WIDTH + SNO_COL_WIDTH + NOTES_COL_WIDTH + ACTIONS_COL_WIDTH +
    (showCostColumns ? TOTAL_COL_WIDTH + minWidthOf(colById('estimatedCost')) : 0) +
    orderedBusiness.reduce((sum, c) => sum + minWidthOf(c), 0) +
    minWidthOf(colById('qty')) +
    minWidthOf(colById('unit'));

  const renderBusinessHeader = (c) => (
    <th key={c.id} className="py-2.5 text-left px-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap grid-resizable-th" style={colWidth(c)}>
      <span className="inline-flex items-center gap-1">
        {labelOf(c)}
        {showsRequiredMarker(c) ? <span className="text-rose-400">*</span> : null}
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 rounded text-white/50 hover:text-white hover:bg-white/10 transition-all"
          title={`Rename ${labelOf(c)}`}
          onClick={() => { setRenameValue(c.label); setColumnsPanel({ renameId: c.id }); }}
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
      </span>
      <ColumnResizer column={c} resize={resize} />
    </th>
  );

  const renderCustomCell = (index, c) => {
    const item = items[index];
    const value = (item.customFields || {})[c.id] ?? '';
    if (c.type === 'date') {
      return (
        <td key={c.id} className="py-1 px-1">
          <input
            type="date"
            className={cellCls(index, c.id)}
            value={value}
            onChange={(e) => updateCustomField(index, c.id, e.target.value)}
          />
        </td>
      );
    }
    if (c.type === 'number') {
      return (
        <td key={c.id} className="py-1 px-1">
          <input
            type="number"
            className={`${cellCls(index, c.id)} text-right`}
            value={value}
            onChange={(e) => updateCustomField(index, c.id, e.target.value)}
          />
        </td>
      );
    }
    if (c.type === 'dropdown') {
      return (
        <td key={c.id} className="py-1 px-1">
          <EditableMasterDropdown
            masterKey={`cpr_custom_${c.id}`}
            value={value}
            onChange={(v) => updateCustomField(index, c.id, v)}
            placeholder="Select..."
            portal
            inputClassName={`${cellCls(index, c.id)} cursor-text`}
          />
        </td>
      );
    }
    return (
      <td key={c.id} className="py-1 px-1">
        <input
          className={cellCls(index, c.id)}
          value={value}
          placeholder={c.label}
          onChange={(e) => updateCustomField(index, c.id, e.target.value)}
        />
      </td>
    );
  };

  return (
    <div className="item-table-section overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-surface flex-wrap">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Boxes className="w-4 h-4 text-[#0B4A3D]" /> Items
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Manage Columns — popup is portal-rendered (see popupPos) so the
              card's overflow-hidden can never clip it */}
          <div ref={columnsBtnWrapRef}>
            <button
              type="button"
              onClick={() => setColumnsPanel((p) => (p ? null : 'menu'))}
              className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold border-[1.5px] transition-all cursor-pointer ${hasCustomCols ? 'border-[#0B4A3D] text-[#0B4A3D] bg-[#0B4A3D]/5 hover:bg-[#0B4A3D]/10' : 'border-slate-300 text-slate-600 bg-surface hover:bg-slate-50'}`}
              title="Add, rename, reorder or remove item table columns"
            >
              <Columns3 className="w-3.5 h-3.5" /> Manage Columns
            </button>
            {columnsPanel && popupPos && createPortal(
              <div
                ref={popupRef}
                className="fixed z-[70] rounded-xl border border-slate-200 bg-surface shadow-xl flex flex-col"
                style={{ top: popupPos.top, left: popupPos.left, width: popupPos.width, maxHeight: popupPos.maxHeight }}
              >
                {/* Header stays pinned while the column list scrolls */}
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">Manage Columns</span>
                  <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setColumnsPanel(null)} title="Close">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {columnsPanel === 'add' ? (
                  <div className="p-3.5">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Column Name</label>
                    <input
                      autoFocus
                      className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                      value={newColumnName}
                      placeholder="e.g. Material, Grade, Finish"
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomColumn(); } }}
                    />
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-3 mb-1">Type</label>
                    <select
                      className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                      value={newColumnType}
                      onChange={(e) => setNewColumnType(e.target.value)}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                    <div className="flex items-center justify-end gap-2 mt-4">
                      <button
                        type="button"
                        className="h-8 px-3 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                        onClick={() => { setNewColumnName(''); setNewColumnType('text'); setColumnsPanel('menu'); }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="h-8 px-3.5 rounded-md text-xs font-bold bg-[#0B4A3D] text-white hover:bg-[#083D34] transition-all cursor-pointer"
                        onClick={addCustomColumn}
                      >
                        Add Column
                      </button>
                    </div>
                  </div>
                ) : columnsPanel && typeof columnsPanel === 'object' && columnsPanel.renameId ? (
                  (() => {
                    const col = columns.find((c) => c.id === columnsPanel.renameId);
                    if (!col) return null;
                    return (
                      <div className="p-3.5">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Rename “{col.label}”</label>
                        <input
                          autoFocus
                          className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); renameColumn(col.id, renameValue); } }}
                        />
                        <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
                          Only the display label changes — saved data keeps the same internal column, so nothing breaks.
                        </p>
                        {labelOf(col) !== col.label && (
                          /* This page shows an alias for the column (Create CPR
                             renders `drawingNo` as “PR”). The rename field above
                             always edits the REAL stored name, so opening Rename
                             and saving without typing can never write the
                             page-local alias into the shared column config. */
                          <p className="mt-1.5 text-[10px] text-[#0B4A3D] leading-relaxed">
                            This page labels it “{labelOf(col)}”. Renaming edits the stored
                            name used by every CPR (including Edit and View).
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-2 mt-3">
                          <button
                            type="button"
                            className="h-8 px-3 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                            onClick={() => setColumnsPanel('menu')}
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
                    {/* Column list — scrolls internally; header/footer stay visible */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-2">
                      {sortedBusiness.map((c, i) => (
                        <div key={c.id} className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 group ${c.hidden ? 'opacity-50' : ''}`}>
                          <button
                            type="button"
                            className={`inline-flex items-center justify-center w-5 h-5 rounded shrink-0 transition-colors ${c.hidden ? 'text-slate-300 hover:text-slate-500' : 'text-[#0B4A3D] hover:bg-[#0B4A3D]/10'}`}
                            title={c.hidden ? `Show ${labelOf(c)}` : `Hide ${labelOf(c)}`}
                            onClick={() => toggleColumnVisibility(c.id)}
                          >
                            {c.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <span className={`flex-1 text-xs font-medium truncate ${c.hidden ? 'text-slate-400 line-through' : 'text-slate-700'}`} title={c.system ? `${labelOf(c)} (system column)` : labelOf(c)}>
                            {labelOf(c)}
                            {showsRequiredMarker(c) ? <span className="text-rose-400"> *</span> : null}
                          </span>
                          <button type="button" className={ACTION_BTN} title="Rename" onClick={() => { setRenameValue(c.label); setColumnsPanel({ renameId: c.id }); }}>
                            <Pencil className="w-3 h-3" />
                          </button>
                          {isColumnRemovable(c) ? (
                            <button type="button" className={ACTION_DEL} title={`Remove ${labelOf(c)}`} onClick={() => setColumnToRemove({ id: c.id, label: labelOf(c) })}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded text-slate-300" title={`Cannot remove "${labelOf(c)}" — required by validation`}>
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
                          <span className="inline-flex flex-col">
                            <button type="button" className={`${ACTION_BTN} !w-4 !h-3`} title="Move Left" disabled={i === 0} onClick={() => moveColumn(c.id, -1)}>
                              <ArrowLeft className="w-2.5 h-2.5" />
                            </button>
                            <button type="button" className={`${ACTION_BTN} !w-4 !h-3`} title="Move Right" disabled={i === sortedBusiness.length - 1} onClick={() => moveColumn(c.id, 1)}>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Sticky footer controls — always accessible regardless of list length */}
                    <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-t border-slate-100 shrink-0">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-bold text-[#0B4A3D] hover:bg-[#0B4A3D]/5 transition-all cursor-pointer"
                        onClick={() => setColumnsPanel('add')}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Custom Column
                      </button>
                      <button
                        type="button"
                        className={`h-8 px-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${hasCustomCols ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'}`}
                        disabled={!hasCustomCols}
                        onClick={() => setConfirmReset(true)}
                      >
                        Reset to Default
                      </button>
                    </div>
                  </>
                )}
              </div>,
              document.body
            )}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold bg-[#0B4A3D] text-white shadow-sm hover:bg-[#083D34] transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Row
          </button>
          {hasItems && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold border-[1.5px] border-rose-600 bg-surface text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* Scrollable table — horizontal scrolling stays INSIDE this container */}
      <div className="overflow-x-auto" ref={tableRef} onKeyDown={onGridKeyDown}>
        {/* Fixed layout with explicit colgroup widths: columns keep exactly the
            width the user dragged them to, header and rows stay aligned, and the
            table scrolls horizontally inside this container when the total
            width exceeds the available space. */}
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <colgroup>
            <col style={{ width: GRIP_COL_WIDTH }} />
            <col style={{ width: SNO_COL_WIDTH }} />
            {orderedBusiness.map((c) => (
              <col key={c.id} style={colWidth(c)} />
            ))}
            <col style={colWidth(colById('qty'))} />
            <col style={colWidth(colById('unit'))} />
            {showCostColumns && <col style={colWidth(colById('estimatedCost'))} />}
            {showCostColumns && <col style={{ width: TOTAL_COL_WIDTH }} />}
            <col style={{ width: NOTES_COL_WIDTH }} />
            <col style={{ width: ACTIONS_COL_WIDTH }} />
          </colgroup>
          <thead>
            <tr className="bg-[#0B4A3D] text-white">
              <th className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider"><GripVertical className="w-3 h-3 inline opacity-60" /></th>
              <th className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider">#</th>
              {orderedBusiness.map(renderBusinessHeader)}
              <th className="py-2.5 text-left px-2 text-[11px] font-semibold uppercase tracking-wider grid-resizable-th" style={colWidth(colById('qty'))}>
                {/* No space before the marker so the required indicator renders
                    exactly like the other required columns' inline marker. */}
                Qty<span className="text-rose-400">*</span>
                {colById('qty') && <ColumnResizer column={colById('qty')} resize={resize} />}
              </th>
              <th className="py-2.5 text-left px-2 text-[11px] font-semibold uppercase tracking-wider grid-resizable-th" style={colWidth(colById('unit'))}>
                UOM
                {colById('unit') && <ColumnResizer column={colById('unit')} resize={resize} />}
              </th>
              {showCostColumns && (
                <th className="py-2.5 text-left px-2 text-[11px] font-semibold uppercase tracking-wider grid-resizable-th" style={colWidth(colById('estimatedCost'))}>
                  Est. Cost
                  {colById('estimatedCost') && <ColumnResizer column={colById('estimatedCost')} resize={resize} />}
                </th>
              )}
              {showCostColumns && (
                <th className="py-2.5 text-right px-2 text-[11px] font-semibold uppercase tracking-wider">Total</th>
              )}
              <th className="py-2.5 text-left px-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">Notes</th>
              <th className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!hasItems ? (
              <tr>
                <td colSpan={6 + orderedBusiness.length + (showCostColumns ? 2 : 0)} className="py-16">
                  <div className="text-center max-w-[360px] mx-auto px-4">
                    <div className="w-[52px] h-[52px] rounded-[14px] bg-[#E8F0EE] flex items-center justify-center mx-auto mb-3">
                      <Boxes className="w-5 h-5 text-[#0B4A3D]" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-1">No items added yet</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                      Add products, materials or services required for this Purchase Request.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const rowTotal = (parseFloat(item.qty) || 0) * (parseFloat(item.estimatedCost) || 0);
                const hasValue = (parseFloat(item.qty) || 0) > 0 || (parseFloat(item.estimatedCost) || 0) > 0;
                return (
                  <tr
                    key={item.id}
                    draggable
                    onDragStart={onDragStart(index)}
                    onDragOver={onDragOver}
                    onDrop={onDrop(index)}
                    className="border-b border-slate-100 hover:bg-slate-50 even:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-1 px-1 text-center cursor-grab text-slate-300">
                      <GripVertical className="w-3.5 h-3.5 inline" />
                    </td>
                    <td className="py-1 px-1 text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                    {orderedBusiness.map((c) => {
                      if (c.id === 'drawingNo') {
                        return (
                          <td key={c.id} className="py-1 px-1">
                            <input
                              className={cellCls(index, 'drawingNo')}
                              value={item.drawingNo}
                              maxLength={255}
                              // No placeholder: Drawing No. is optional and must
                              // read as EMPTY in new rows (a grey "DWG-001"
                              // placeholder looked like copied data).
                              placeholder=""
                              onChange={(e) => onDrawingNoChange(index, e.target.value)}
                            />
                          </td>
                        );
                      }
                      if (c.id === 'description') {
                        return (
                          <td key={c.id} className="py-1 px-1">
                            <input
                              className={`${cellCls(index, 'description')} font-medium`}
                              value={item.description}
                              placeholder="Enter item description"
                              onChange={(e) => updateItem(index, { description: e.target.value })}
                            />
                          </td>
                        );
                      }
                      if (c.id === 'specification') {
                        return (
                          <td key={c.id} className="py-1 px-1">
                            <input
                              className={cellCls(index, 'specification')}
                              value={item.specification}
                              placeholder="Spec / grade"
                              onChange={(e) => updateItem(index, { specification: e.target.value })}
                            />
                          </td>
                        );
                      }
                      if (c.id === 'remarks') {
                        return (
                          <td key={c.id} className="py-1 px-1">
                            <input
                              className={cellCls(index, 'remarks')}
                              value={item.remarks}
                              placeholder="Remarks"
                              onChange={(e) => updateItem(index, { remarks: e.target.value })}
                            />
                          </td>
                        );
                      }
                      return renderCustomCell(index, c);
                    })}
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        className={`${cellCls(index, 'qty')} text-right`}
                        value={item.qty}
                        min="0"
                        step="1"
                        onChange={(e) => updateItem(index, { qty: e.target.value })}
                      />
                    </td>
                    <td className="py-1 px-1">
                      <EditableMasterDropdown
                        masterKey="pr_units"
                        value={item.unit}
                        onChange={(v) => updateItem(index, { unit: v })}
                        placeholder="Select UOM..."
                        portal
                        inputClassName={`${cellCls(index, 'unit')} cursor-text`}
                      />
                    </td>
                    {showCostColumns && (
                      <td className="py-1 px-1">
                        <input
                          type="number"
                          className={`${cellCls(index, 'cost')} text-right`}
                          value={item.estimatedCost}
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          onChange={(e) => updateItem(index, { estimatedCost: e.target.value })}
                        />
                      </td>
                    )}
                    {showCostColumns && (
                      <td className="py-1 px-2 text-right text-xs font-semibold text-[#0B4A3D] whitespace-nowrap">
                        {hasValue ? formatCurrency(rowTotal) : '—'}
                      </td>
                    )}
                    {/* Item Notes — one multi-line input per row, bound only to
                        this row's `notes`, so editing one item never touches
                        another item's notes. */}
                    <td className="py-1 px-1 align-top">
                      <textarea
                        className="w-full min-w-0 min-h-[30px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs leading-relaxed text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all resize-y whitespace-pre-wrap"
                        rows={2}
                        value={item.notes || ''}
                        placeholder="Item notes"
                        onChange={(e) => updateItem(index, { notes: e.target.value })}
                      />
                    </td>
                    <td className="py-1 px-1.5 text-center align-top whitespace-nowrap">
                      <span className="inline-flex items-center whitespace-nowrap">
                        <button
                          type="button"
                          className={ACTION_BTN}
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                          title="Move Up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className={ACTION_BTN}
                          onClick={() => moveItem(index, 1)}
                          disabled={index === items.length - 1}
                          title="Move Down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className={ACTION_DEL} onClick={() => deleteItem(index)} title="Delete Row">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className={ACTION_BTN} onClick={() => duplicateItem(index)} title="Duplicate Row">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <span className="inline-block w-px h-4 bg-slate-200 mx-1 align-middle" />
                        <ItemCwPrButtons item={item} itemIndex={index} sourceForm={sourceForm} onEnsureSaved={onEnsureSaved} />
                        <button
                          type="button"
                          className={ACTION_BTN}
                          onClick={() => fileInputRefs.current[item.id]?.click()}
                          title={`Attach files to this item (PDF, DOCX, XLSX, PNG, JPG up to ${MAX_ATTACHMENT_SIZE_LABEL})`}
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                        </button>
                        <input
                          ref={(el) => {
                            fileInputRefs.current[item.id] = el;
                          }}
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                          className="hidden"
                          onChange={(e) => {
                            handleAttachFiles(index, e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </span>
                      {Array.isArray(item.attachments) && item.attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap justify-end gap-1 max-w-[240px] ml-auto">
                          {item.attachments.map((f, fi) => (
                            <span
                              key={`${f.name}-${fi}`}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-600 max-w-full"
                              title={f.name}
                            >
                              <FileText className="w-3 h-3 shrink-0 text-[#0B4A3D]" />
                              <span className="truncate max-w-[110px]">{f.name}</span>
                              <span className="text-slate-400">{formatBytes(f.size)}</span>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-rose-600 transition-colors"
                                onClick={() => removeItemAttachment(index, fi)}
                                title={`Remove ${f.name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer totals — only Est. Cost feeds the total; custom columns never affect it */}
      {hasItems && (
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs">
          <span className="text-slate-500">
            Total Estimated Value (<span className="font-bold text-slate-700">{items.length}</span> items)
          </span>
          <span className="font-bold text-[#0B4A3D]">{formatCurrency(grandTotal)}</span>
        </div>
      )}

      {/* Clear All confirmation (mirrors the ERP VT.Confirm dialog) */}
      <ConfirmDialog
        open={confirmClear}
        title="Clear All Items"
        message={`Remove all ${items.length} item${items.length === 1 ? '' : 's'} from this grid? This action cannot be undone.`}
        confirmLabel="Clear All"
        variant="danger"
        icon={AlertTriangle}
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />

      {/* Remove-column confirmation */}
      <ConfirmDialog
        open={!!columnToRemove}
        title="Remove Column"
        message={columnToRemove ? `Remove this column? The column and its values will no longer be shown in this CPR.` : ''}
        confirmLabel="Remove"
        variant="danger"
        icon={AlertTriangle}
        onConfirm={() => removeColumn(columnToRemove)}
        onCancel={() => setColumnToRemove(null)}
      />

      {/* Reset-to-default confirmation (warns about custom data loss) */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset Columns to Default"
        message={
          hasCustomCols
            ? 'Resetting removes all custom columns AND their saved values in every row. Standard columns and their data are kept. Continue?'
            : 'Reset the item table to the default columns? No custom columns exist, so nothing will be lost.'
        }
        confirmLabel="Reset"
        variant={hasCustomCols ? 'danger' : 'default'}
        icon={AlertTriangle}
        onConfirm={resetColumns}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
});

export default CprItemGrid;

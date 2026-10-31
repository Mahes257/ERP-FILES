import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, ClipboardList, Copy, Plus, Trash2 } from 'lucide-react';
import { EditableMasterDropdown, TextArea } from '../Common';
import useManagedGrid from '../../hooks/useManagedGrid';
import { ColumnRenameButton, ColumnResizer, ManageColumnsButton } from '../GridColumns';
import { defaultSalesOrderItemColumns } from '../../utils/salesOrderColumns';
import { GST_RATES } from '../../constants/salesConstants';
import { lineAmount } from '../../utils/salesHelpers';
import { CPO_ITEM_CONVERT_KEY } from '../../utils/cpoItemConversion';
// Same items-table styling every Sales Execution module uses.
import '../../pages/sales/quotation-create.css';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

const TH_CLS = 'px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap';

// Horizontally frozen columns of the CPO items table: the first three rendered
// columns stay pinned left, the last two pinned right, everything between
// scrolls. Counted from the RENDERED column order (S.No / Material / Item
// Description on the left, Convert To / Actions on the right by default) so
// Manage Columns reordering, resizing and hiding keep working unchanged.
const LEFT_FROZEN_COUNT = 3;
const RIGHT_FROZEN_COUNT = 2;
// The create-form header band is the ERP green (#0B4A3D on #083D34, see
// styles/erp-create-scope.css); body cells use the theme surface so frozen
// cells stay opaque and correct in light AND dark mode.
const STICKY_HEADER_BG = '#0B4A3D';
const STICKY_HEADER_BORDER = '#083D34';
const STICKY_BODY_BG = 'var(--surface)';

const TOOLBAR_BTN =
  'flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-[#0B4A3D] hover:text-[#0B4A3D] hover:bg-[#E8F0EE] transition-colors cursor-pointer';

/**
 * The WO / PO choice of an item row is stored in
 * `customFields[CPO_ITEM_CONVERT_KEY]` — see utils/cpoItemConversion, which
 * also owns the validated read of the saved value and the destination
 * pre-fills. The grid only renders and edits it; it is NOT a user-managed
 * custom column, so the Manage Columns toolkit never removes or renames it.
 */
export { CPO_ITEM_CONVERT_KEY };

/** Fixed column key for the WO / PO selection column. */
const CONVERT_COLUMN = {
  id: 'convertTo',
  key: 'convertTo',
  label: 'Convert To',
  system: true
};
const CONVERT_COLUMN_WIDTH = 130;

/**
 * Column key → real `sales_order_items` field. The key is what the column
 * configuration stores, so it must never be renamed when the label changes
 * (otherwise the saved values would move to a different column).
 */
const ITEM_FIELD_BY_KEY = {
  desc: 'description',
  material: 'material',
  drawingNo: 'drawingNo',
  sku: 'sku',
  delivery: 'delivery',
  hsn: 'hsn'
};

/**
 * Customer Purchase Order items grid.
 *
 * Every column is driven by the persisted configuration for the
 * `sales.items.salesOrder` grid (MySQL app_settings), so the SAME Manage
 * Columns toolkit as the other Sales Execution item grids applies here:
 * show/hide, rename, reorder, drag-to-resize, Add Custom Column, remove a
 * custom column and Reset to Default. Custom columns keep their per-row value
 * in `row.customFields[columnId]`, so values are independent per row, survive
 * rename/reorder, and are never copied from another document.
 */
export default function CpoItemsGrid({
  items = [],
  setItems,
  hsnView = true,
  taxType = 'CGST + SGST',
  initialGstRate = 18,
  onTaxTypeChange,
  onHsnViewChange,
  readOnly = false,
  // Called with the row index when the user continues a WO / PO conversion.
  onConvert
}) {
  const managed = useManagedGrid({
    gridKey: 'sales.items.salesOrder',
    defaults: () => defaultSalesOrderItemColumns({ showHsn: true }),
    insertBeforeKeys: ['actions'],
    itemNoun: 'item',
    rowCount: items.length,
    removeColumnValues: (columnId) => {
      if (!setItems) return;
      setItems((prev) =>
        prev.map((it) => {
          if (!it || !it.customFields) return it;
          const cf = { ...it.customFields };
          delete cf[columnId];
          return { ...it, customFields: cf };
        })
      );
    }
  });
  const resize = managed.resize;
  // The HSN Column View Advanced Option hides HSN independently of the saved
  // configuration (saved values are never lost).
  const configuredColumns = hsnView
    ? managed.visibleColumns
    : managed.visibleColumns.filter((c) => c.key !== 'hsn');
  // The WO / PO selector is a system column of this grid, not a user-managed
  // one: it is always shown (before the row actions) so the choice can never be
  // hidden by an old saved column configuration.
  const visibleColumns = useMemo(() => {
    const base = configuredColumns.filter((c) => c.key !== CONVERT_COLUMN.key);
    const insertAt = base.findIndex((c) => c.key === 'actions');
    if (insertAt === -1) return [...base, CONVERT_COLUMN];
    return [...base.slice(0, insertAt), CONVERT_COLUMN, ...base.slice(insertAt)];
  }, [configuredColumns]);
  const colCount = visibleColumns.length;
  const tableMinWidth = visibleColumns.reduce(
    (sum, c) => sum + (c.key === CONVERT_COLUMN.key ? CONVERT_COLUMN_WIDTH : (Number(resize.widthOf(c)) || 0)),
    0
  );

  // ---- Left / right frozen columns -----------------------------------------
  // Offsets come from the ACTUAL rendered header-cell widths (table-layout is
  // auto, so a column may be wider than its configured width) and are measured
  // again whenever the columns, their widths or the viewport change.
  const scrollRef = useRef(null);
  const headRowRef = useRef(null);
  const stickySignatureRef = useRef('');
  const [stickyOffsets, setStickyOffsets] = useState({ left: [], right: [] });

  const measureSticky = useCallback(() => {
    const headRow = headRowRef.current;
    if (!headRow) return;
    const widths = Array.from(headRow.children).map((cell) => cell.getBoundingClientRect().width);
    const total = widths.length;
    const leftCount = Math.min(LEFT_FROZEN_COUNT, total);
    const rightCount = Math.min(RIGHT_FROZEN_COUNT, Math.max(0, total - leftCount));
    const left = [];
    let leftOffset = 0;
    for (let i = 0; i < leftCount; i += 1) {
      left[i] = leftOffset;
      leftOffset += widths[i];
    }
    const right = [];
    let rightOffset = 0;
    for (let i = total - 1; i >= total - rightCount; i -= 1) {
      right[i] = rightOffset;
      rightOffset += widths[i];
    }
    const signature = `${left.map((v) => v.toFixed(2)).join(',')}|${right.map((v) => v.toFixed(2)).join(',')}`;
    if (signature === stickySignatureRef.current) return;
    stickySignatureRef.current = signature;
    setStickyOffsets({ left, right });
  }, []);

  // Measure after row/column changes (a new item row reflows the auto table
  // layout); content- and viewport-driven width changes come from the
  // ResizeObserver below, so typing in a cell never forces a re-measure.
  useLayoutEffect(() => {
    measureSticky();
  }, [visibleColumns, items.length, measureSticky]);

  useLayoutEffect(() => {
    const headRow = headRowRef.current;
    if (!headRow) return undefined;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measureSticky) : null;
    if (observer) {
      if (scrollRef.current) observer.observe(scrollRef.current);
      observer.observe(headRow);
      Array.from(headRow.children).forEach((cell) => observer.observe(cell));
    }
    window.addEventListener('resize', measureSticky);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measureSticky);
    };
  }, [visibleColumns, measureSticky]);

  const leftFrozenCount = Math.min(LEFT_FROZEN_COUNT, visibleColumns.length);
  const rightFrozenCount = Math.min(
    RIGHT_FROZEN_COUNT,
    Math.max(0, visibleColumns.length - leftFrozenCount)
  );

  /**
   * Sticky style for the frozen columns; `undefined` for every middle column.
   * The frozen cells carry an opaque background (the scrolling content must
   * never show through them) plus the edge/bottom hairlines the row had before.
   */
  const stickyCellStyle = (index, { header = false } = {}) => {
    const total = visibleColumns.length;
    const frozenLeft = index < leftFrozenCount;
    const frozenRight = !frozenLeft && index >= total - rightFrozenCount;
    if (!frozenLeft && !frozenRight) return undefined;
    const edgeColor = header ? 'rgba(255, 255, 255, 0.18)' : 'var(--surface-3)';
    const bottomColor = header ? STICKY_HEADER_BORDER : 'var(--surface-3)';
    const edge = frozenLeft
      ? index === leftFrozenCount - 1
        ? `inset -1px 0 0 ${edgeColor}`
        : ''
      : index === total - rightFrozenCount
        ? `inset 1px 0 0 ${edgeColor}`
        : '';
    const bottom = `inset 0 -1px 0 ${bottomColor}`;
    return {
      position: 'sticky',
      ...(frozenLeft
        ? { left: stickyOffsets.left[index] ?? 0 }
        : { right: stickyOffsets.right[index] ?? 0 }),
      // Left frozen cells always stack above the right ones, so an extremely
      // narrow viewport (frozen columns wider than the scroll box) can never
      // let the right group paint over the first columns.
      zIndex: header ? (frozenLeft ? 5 : 4) : (frozenLeft ? 3 : 2),
      background: header ? STICKY_HEADER_BG : STICKY_BODY_BG,
      boxShadow: edge ? `${edge}, ${bottom}` : bottom
    };
  };

  // Header GST rate applies to every item row (same pattern as Quotations).
  const [gstRate, setGstRate] = useState(initialGstRate || 18);
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    const first = items.find((it) => !it.rowType || it.rowType === 'item');
    setGstRate(first && first.gstRate != null ? Number(first.gstRate) || 0 : 18);
  }
  const headerGstRate = Number(gstRate) || 0;
  const isIgst = String(taxType || '').toLowerCase().includes('igst');
  const gstRateOptions = GST_RATES.includes(headerGstRate)
    ? GST_RATES
    : [...GST_RATES, headerGstRate].sort((a, b) => a - b);
  const gstTypeOptions = ['CGST + SGST', 'IGST'];
  const gstTypeOptionsForSelect = gstTypeOptions.includes(taxType)
    ? gstTypeOptions
    : [...gstTypeOptions, taxType];

  const itemRows = () => items.filter((it) => !it.rowType || it.rowType === 'item');

  const addRow = () => {
    setItems([
      ...items,
      {
        productId: null,
        productName: '',
        description: '',
        sku: '',
        drawingNo: '',
        material: '',
        delivery: '',
        hsn: '',
        unit: '',
        qty: 1,
        rate: 0,
        discountPct: 0,
        gstRate: headerGstRate,
        customFields: {}
      }
    ]);
  };

  const addDescriptionRow = () => setItems([...items, { rowType: 'description', description: '' }]);

  const duplicateLast = () => {
    const rows = itemRows();
    if (rows.length === 0) return addRow();
    const last = rows[rows.length - 1];
    // A duplicate is a NEW row: its custom-column values are copied on purpose
    // (the user asked to duplicate this row), never inherited across documents.
    setItems([...items, { ...last, id: undefined, customFields: { ...(last.customFields || {}) } }]);
  };

  const updateRow = (index, patch) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const updateCustomField = (index, columnId, value) =>
    setItems(
      items.map((it, i) =>
        i === index ? { ...it, customFields: { ...(it.customFields || {}), [columnId]: value } } : it
      )
    );

  const removeRow = (index) => setItems(items.filter((_, i) => i !== index));

  const moveRow = (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
  };

  const applyGstRateToAll = (rate) => {
    setGstRate(rate);
    if (itemRows().length > 0) {
      setItems((prev) => prev.map((it) => (it.rowType ? it : { ...it, gstRate: rate })));
    }
  };

  const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  /** One cell of an item row. Custom columns render a real editable input. */
  const renderCell = (col, item, idx) => {
    const key = col.key;
    if (!col.system) {
      const value = (item.customFields || {})[col.id] ?? '';
      if (col.type === 'date') {
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => updateCustomField(idx, col.id, e.target.value)}
            className={INPUT_CLS}
          />
        );
      }
      if (col.type === 'number') {
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => updateCustomField(idx, col.id, e.target.value)}
            className={`${INPUT_CLS} text-right`}
          />
        );
      }
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => updateCustomField(idx, col.id, e.target.value)}
          placeholder={col.label}
          className={INPUT_CLS}
        />
      );
    }

    if (key === CONVERT_COLUMN.key) {
      const value = (item.customFields || {})[CPO_ITEM_CONVERT_KEY] || '';
      const action = value === 'WO'
        ? 'Create Production Work Order from this item'
        : value === 'PO'
          ? 'Create Purchase Order from this item'
          : '';
      return (
        <div className="flex items-center gap-1">
          <select
            value={value}
            disabled={readOnly}
            title="Convert this CPO item into a Production Work Order or a Purchase Order"
            onChange={(e) => updateCustomField(idx, CPO_ITEM_CONVERT_KEY, e.target.value)}
            className={`${INPUT_CLS} w-[74px] cursor-pointer disabled:cursor-not-allowed`}
          >
            <option value="">None</option>
            <option value="WO">WO</option>
            <option value="PO">PO</option>
          </select>
          {action && (
            <button
              type="button"
              onClick={() => onConvert && onConvert(idx)}
              disabled={readOnly || !onConvert}
              title={action}
              className="p-1 rounded text-[#0B4A3D] hover:bg-[#E8F0EE] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      );
    }
    if (key === 'qty' || key === 'rate' || key === 'discount') {
      const field = key === 'discount' ? 'discountPct' : key;
      return (
        <input
          type="number"
          min="0"
          step={key === 'qty' ? undefined : '0.01'}
          value={item[field] ?? 0}
          onChange={(e) => updateRow(idx, { [field]: e.target.value })}
          className={`${INPUT_CLS} text-right`}
        />
      );
    }
    if (key === 'unit') {
      return (
        <EditableMasterDropdown
          masterKey="units"
          value={item.unit || ''}
          onChange={(v) => updateRow(idx, { unit: v })}
          placeholder="UOM"
          portal
          inputClassName={`${INPUT_CLS} w-20 cursor-text`}
        />
      );
    }
    if (key === 'gst') {
      return (
        <div className="flex justify-center gap-2 text-xs font-semibold text-slate-700 whitespace-nowrap pt-2">
          {isIgst ? (
            <span>IGST {Number(item.gstRate) || 0}%</span>
          ) : (
            <>
              <span>CGST {(Number(item.gstRate) || 0) / 2}%</span>
              <span>SGST {(Number(item.gstRate) || 0) / 2}%</span>
            </>
          )}
        </div>
      );
    }
    if (key === 'total') {
      return (
        <div className="text-xs font-bold text-slate-800 text-right pt-2 whitespace-nowrap">
          {fmt(lineAmount(item).amount)}
        </div>
      );
    }
    if (key === 'actions') {
      return (
        <div className="flex items-center justify-center gap-0.5">
          <button
            type="button"
            onClick={() => moveRow(idx, -1)}
            title="Move Up"
            disabled={idx === 0}
            className="p-1 rounded text-slate-300 hover:text-[#0B4A3D] hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveRow(idx, 1)}
            title="Move Down"
            disabled={idx === items.length - 1}
            className="p-1 rounded text-slate-300 hover:text-[#0B4A3D] hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => removeRow(idx)}
            aria-label={`Remove item ${idx + 1}`}
            className="p-1.5 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }
    if (key === 'sno') {
      return <span className="text-xs text-slate-400 block pt-2">{idx + 1}</span>;
    }
    // Remaining system text columns (desc / material / drawingNo / sku / delivery / hsn)
    const field = ITEM_FIELD_BY_KEY[key] || key;
    return (
      <input
        type="text"
        value={item[field] || ''}
        onChange={(e) => updateRow(idx, { [field]: e.target.value })}
        placeholder={ITEM_FIELD_BY_KEY[key] ? col.label : ''}
        className={INPUT_CLS}
      />
    );
  };

  const headerLabel = (col) => {
    if (col.key === 'rate') return `Rate (INR)`;
    if (col.key === 'total') return `Total (INR)`;
    return col.label;
  };

  /** The WO/PO column is not in the saved grid configuration — no manage controls. */
  const isManagedColumn = (col) => col.key !== CONVERT_COLUMN.key;

  return (
    <div>
      <div className="qtn-items-toolbar flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={addRow} disabled={readOnly} className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] shadow-sm transition-all cursor-pointer hover:-translate-y-px disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> Add New Line
        </button>
        <button type="button" onClick={addDescriptionRow} disabled={readOnly} className={TOOLBAR_BTN}>
          <ClipboardList className="w-3.5 h-3.5" /> Add Description
        </button>
        <button type="button" onClick={duplicateLast} disabled={readOnly} className={TOOLBAR_BTN}>
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <ManageColumnsButton manager={managed.manager} />
        <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={hsnView}
            onChange={(e) => onHsnViewChange && onHsnViewChange(e.target.checked)}
          />
          HSN Column View
        </label>
      </div>
      <div className="overflow-x-auto" ref={scrollRef}>
        <table className="w-full border-collapse" style={{ minWidth: Math.max(940, tableMinWidth) }}>
          <colgroup>
            {visibleColumns.map((col) => (
              <col
                key={col.id}
                style={{
                  width: col.key === CONVERT_COLUMN.key
                    ? CONVERT_COLUMN_WIDTH
                    : (resize.widthOf(col) || undefined)
                }}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50" ref={headRowRef}>
              {visibleColumns.map((col, colIndex) => (
                <th
                  key={col.id}
                  className={`${TH_CLS} grid-resizable-th text-center`}
                  style={stickyCellStyle(colIndex, { header: true })}
                >
                  {/* Label + (for the GST column) its two selects share ONE
                      line so the header row keeps a compact single-row height
                      instead of stacking controls vertically. */}
                  <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
                    {headerLabel(col)}
                    {isManagedColumn(col) && (
                      <ColumnRenameButton manager={managed.manager} column={col} />
                    )}
                    {col.key === 'gst' && (
                      <>
                        <select
                          value={taxType}
                          onChange={(e) => onTaxTypeChange && onTaxTypeChange(e.target.value)}
                          title="GST type — CGST + SGST (intra-state) or IGST (inter-state)"
                          className="w-[86px] bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-700 outline-none cursor-pointer"
                        >
                          {gstTypeOptionsForSelect.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <select
                          value={headerGstRate}
                          onChange={(e) => applyGstRateToAll(Number(e.target.value))}
                          title="GST rate — applies to all items"
                          className="w-[56px] bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-700 outline-none cursor-pointer"
                        >
                          {gstRateOptions.map((r) => (
                            <option key={r} value={r}>{r}%</option>
                          ))}
                        </select>
                      </>
                    )}
                  </span>
                  {isManagedColumn(col) && <ColumnResizer column={col} resize={resize} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              if (item.rowType === 'description') {
                return (
                  <tr key={`d${idx}`} className="border-b border-slate-100 bg-amber-50/40">
                    <td colSpan={Math.max(1, colCount - 1)} className="px-2 py-1.5">
                      <TextArea
                        rows={1}
                        value={item.description || ''}
                        onChange={(e) => updateRow(idx, { description: e.target.value })}
                        placeholder="Description line..."
                        className={`${INPUT_CLS} resize-none`}
                      />
                    </td>
                    <td
                      className="px-2 py-1.5"
                      style={stickyCellStyle(colCount - 1)}
                    >
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        aria-label={`Remove row ${idx + 1}`}
                        className="p-1.5 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={idx} className="border-b border-slate-100 align-top">
                  {visibleColumns.map((col, colIndex) => (
                    <td key={col.id} className="px-2 py-1.5" style={stickyCellStyle(colIndex)}>
                      {renderCell(col, item, idx)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, colCount)} className="px-2 py-6 text-center text-xs text-slate-400">
                  No items added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

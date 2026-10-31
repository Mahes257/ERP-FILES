/**
 * purchase/components/PurchaseItemTable.jsx
 * ------------------------------------------------------------------
 * Line-item grid for Purchase documents.
 *
 * Two modes:
 *  - Editable (form): bound to react-hook-form via `register` +
 *    `useFieldArray` fields, with per-cell errors, live amounts,
 *    inline editing of qty / rate / discount / GST / remarks /
 *    description / category, and add / duplicate / remove / move
 *    row actions.
 *  - Read-only (view): renders the stored items with a line-total
 *    column derived from the service-computed totals.
 *
 * When the `excel` flag is set (Purchase Requisition and RFQ
 * create/edit), the editable grid switches to an Excel-style layout:
 * horizontal scroll with a 2200px minimum width, sticky header,
 * sticky first + last (actions) columns, 42px / 12px-padding /
 * 10px-radius cell inputs, keyboard navigation (Tab · Shift+Tab ·
 * Enter · arrows), row move up/down, an instant Subtotal · GST ·
 * Grand Total summary bar (Subtotal-only when `showTaxTotals` is
 * false — RFQ estimated rates) and a large green "Add Item"
 * button. All styling is scoped under .pr-item-grid
 * (design-system.css §13c); the mobile card layout reflows each
 * row under labelled cells.
 *
 * Business logic, validation, calculations, state management and
 * routes are untouched.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { ArrowDown, ArrowUp, Copy, FileText, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { GST_RATES } from '../constants';
import { formatAmount, formatAmountConverted } from '../utils/purchase';
import { listMaster } from '../services/masterStore';
import { getActiveItems, getItemByCode } from '../services/itemCatalog';
import api from '../../api/axiosInstance';
import { isApiMode } from '../services/api-client';
import { EditableMasterSelect, SelectInput, TextArea, TextInput } from './ui';

const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700 whitespace-nowrap';
const TD = 'px-3 py-2';

/* Column widths for the Excel-style grid (total ≈ 2200px+). */
const COLS = {
  idx: 60,
  drawingNo: 160,
  itemCode: 180,
  product: 350,
  specification: 220,
  category: 220,
  hsn: 180,
  uom: 150,
  qty: 120,
  rate: 150,
  discount: 120,
  gst: 120,
  amount: 180,
  remarks: 300,
  actions: 180
};

/* CPR-aligned column widths (fewer columns → tighter grid). */
const COLS_CPR = {
  idx: 60,
  drawingNo: 160,
  product: 350,
  specification: 220,
  uom: 150,
  qty: 120,
  rate: 150,
  remarks: 300,
  total: 150,
  actions: 180
};

/* Mobile card labels (reused via data-label attributes). */
const LABELS = {
  0: '#',
  1: 'Item Code',
  2: 'Item Description',
  3: 'Category',
  4: 'HSN / SKU',
  5: 'UOM',
  6: 'Qty',
  7: 'Rate',
  8: 'Disc %',
  9: 'GST %',
  10: 'Amount',
  11: 'Remarks',
  12: 'Actions'
};


const CELL_ERROR = 'mt-1 text-[11px] font-semibold text-rose-500';

/* ---------- Per-item attachments (CPR item-grid behaviour) ---------- */
const ITEM_FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
const ITEM_FILE_MAX_LABEL = '200MB';

/* CPR Drawing No sanitization — letters, digits, space and _ / . - only. */
const sanitizeDrawingNo = (value) => String(value || '').replace(/[^A-Za-z0-9 _/.-]+/g, '').slice(0, 100);

function formatItemBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/* Attachment chips for one row — live via useWatch so add/remove re-renders. */
function RowAttachments({ control, index, onRemove }) {
  const files = useWatch({ control, name: `items.${index}.attachments` }) || [];
  if (!Array.isArray(files) || files.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap justify-end gap-1 max-w-[240px] ml-auto">
      {files.map((f, fi) => (
        <span
          key={`${f?.name}-${fi}`}
          className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-600 max-w-full"
          title={f?.name}
        >
          <FileText className="w-3 h-3 shrink-0 text-[#0B4A3D]" />
          <span className="truncate max-w-[110px]">{f?.name}</span>
          <span className="text-slate-400">{formatItemBytes(f?.size)}</span>
          <button
            type="button"
            className="text-slate-400 hover:text-rose-600 transition-colors"
            onClick={() => onRemove?.(fi)}
            title={`Remove ${f?.name}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export default function PurchaseItemTable({
  control,
  register,
  fields = [],
  itemsErrors,
  onAppend,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  watchedItems = [],
  currency = 'INR',
  readOnly = false,
  items = [],
  lines = [],
  totals,
  excel = false,
  convert = false,
  /* CPR-derived line details (Drawing No. + Specification). Gated behind
     this flag so every existing consumer (RFQ / PO / view pages) renders
     exactly as before; only the Purchase Requisition form passes it. */
  extendedItemFields = false,
  /* Per-item attachment handlers (CPR item-grid behaviour, gated by
     extendedItemFields). */
  onAttachFiles,
  onRemoveItemAttachment,
  /* When false (RFQ form), the excel footer renders a Subtotal-only
     summary — RFQs carry estimated rates, not computed tax totals. */
  showTaxTotals = true,
  /* Dynamic GST rates from settings. Falls back to the hard-coded
     GST_RATES constant when not provided (backward-compatible). */
  gstRates = GST_RATES
}) {
  /* Live HSN codes (Settings → HSN/SAC master) and Item Master entries
     (Settings → Items / Products) drive the suggestion datalists. */
  const hsnCodes = useMemo(() => listMaster('hsnCodes').map((h) => String(h.name || '')), []);
  const [catalogItems, setCatalogItems] = useState(() =>
    isApiMode() ? [] : getActiveItems().filter((i) => i.product)
  );

  useEffect(() => {
    if (!isApiMode()) return undefined;
    let active = true;
    api.get('/products').then(({ data }) => {
      const products = data?.data || [];
      if (!active) return;
      setCatalogItems(products.map((product) => ({
        id: product.id,
        itemCode: product.sku || '',
        product: product.name || '',
        category: '',
        hsn: product.hsn || '',
        uom: product.unit || '',
        standardRate: product.rate || 0,
        tax: product.gstRate || 0,
        active: true
      })).filter((product) => product.product));
    }).catch(() => {
      if (active) setCatalogItems([]);
    });
    return () => {
      active = false;
    };
  }, []);

  /* Auto-fill a line from the Item Master when the typed/picked product
     matches a catalog SKU or name. `onItemSelect` is provided by the
     forms and writes the master fields back into the row. */
  const productInput = (index, rowError) => {
    const registration = register(`items.${index}.product`);
    return (
      <TextInput
        registration={registration}
        error={!!rowError?.product}
        placeholder="Type item description…"
        list="pr-item-list"
        onChange={(e) => {
          registration.onChange(e);
          if (typeof onItemSelect === 'function') {
            const item = getItemByCode(e.target.value);
            if (item) onItemSelect(index, item);
          }
        }}
      />
    );
  };
  const sourceItems = readOnly ? items : watchedItems;
  const tableRef = useRef(null);
  /* Per-row hidden file inputs for item attachments (keyed by field id so
     refs survive reorders). */
  const itemFileRefs = useRef({});
  /* When `convert` is set (Purchase Requisition), stored INR amounts are
     displayed in the document currency via the exchange-rate master. */
  const fmt = (value) => (convert ? formatAmountConverted(value, currency) : formatAmount(value, currency));

  const amountFor = (item) => {
    const qty = Number(item?.qty) || 0;
    const rate = Number(item?.rate) || 0;
    const discount = Math.min(Number(item?.discount) || 0, 100);
    return qty * rate * (1 - discount / 100);
  };
  const subtotal = sourceItems.reduce((sum, item) => sum + amountFor(item), 0);

  /* ---------- Excel-style keyboard navigation ---------- */
  const focusCell = (row, col) => {
    const tbody = tableRef.current?.querySelector('tbody');
    const tr = tbody?.querySelector(`tr[data-row="${row}"]`);
    const cell = tr?.querySelector(`td[data-col="${col}"]`);
    const el = cell?.querySelector('input, select, textarea, button');
    el?.focus();
  };

  const handleCellKey = (e, row, col) => {
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA') return; // remarks — free text, no navigation
    const isButton = tag === 'BUTTON' || Boolean(e.target.closest?.('button'));
    if (e.key === 'Enter') {
      if (isButton) return; // let buttons activate (dropdowns, row actions)
      e.preventDefault(); // avoid form submit; jump to next row
      focusCell(row + 1, 1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (tag === 'SELECT') return; // native select behaviour
      e.preventDefault();
      focusCell(e.key === 'ArrowDown' ? row + 1 : row - 1, col);
    }
  };

  const keyProps = (row, col) => ({ onKeyDown: (e) => handleCellKey(e, row, col) });

  /* ---------- Excel-style editable grid (PR create/edit) ---------- */
  if (excel && !readOnly) {
    /* Extended column plan (Purchase Requisition / CPR): CPR-aligned column
       order — Drawing No., Item Description, Specification, Qty, UOM,
       Est. Cost, Remarks, Total, Actions. Matches the CPR Create page
       exactly. Item Code, Category and HSN / SKU are kept as hidden
       form fields for data preservation but not rendered as visible
       columns. Disc % and GST % remain hidden form fields for
       calculation. */
    const showExt = extendedItemFields === true;
    const COL = showExt
      ? {
          drawingNo: 1, product: 2, specification: 3,
          uom: 4, qty: 5, rate: 6,
          remarks: 7, total: 8, actions: 9
        }
      : {
          itemCode: 1, product: 2, category: 3, hsn: 4, uom: 5,
          qty: 6, rate: 7, discount: 8, gst: 9, amount: 10,
          remarks: 11, actions: 12
        };
    return (
      <div className={`pr-item-grid${showExt ? ' show-ext' : ''}`}>
        <div className="pr-item-wrap">
          <table ref={tableRef} className="pr-item-table">
            <thead>
              <tr>
                <th style={{ width: COLS.idx }} className="pr-num-header">#</th>
                {showExt ? (
                  <>
                    <th style={{ width: COLS_CPR.drawingNo }}>DRAWING NO.</th>
                    <th style={{ width: COLS_CPR.product }}>ITEM DESCRIPTION <span className="text-red-300">*</span></th>
                    <th style={{ width: COLS_CPR.specification }}>SPECIFICATION</th>
                    <th style={{ width: COLS_CPR.qty }} className="pr-num-header">QTY <span className="text-red-300">*</span></th>
                    <th style={{ width: COLS_CPR.uom }}>UOM</th>
                    <th style={{ width: COLS_CPR.rate }} className="pr-num-header">EST. COST</th>
                    <th style={{ width: COLS_CPR.remarks }}>REMARKS</th>
                    <th style={{ width: COLS_CPR.total }} className="pr-amt-header">TOTAL</th>
                    <th style={{ width: COLS_CPR.actions }}>ACTIONS</th>
                  </>
                ) : (
                  <>
                    <th style={{ width: COLS.itemCode }}>Item Code</th>
                    <th style={{ width: COLS.product }}>Item Description</th>
                    <th style={{ width: COLS.category }}>Category</th>
                    <th style={{ width: COLS.hsn }}>HSN / SKU</th>
                    <th style={{ width: COLS.uom }}>UOM</th>
                    <th style={{ width: COLS.qty }} className="pr-num-header">Qty</th>
                    <th style={{ width: COLS.rate }} className="pr-num-header">Rate</th>
                    <th style={{ width: COLS.discount }} className="pr-num-header">Disc %</th>
                    <th style={{ width: COLS.gst }} className="pr-num-header">GST %</th>
                    <th style={{ width: COLS.remarks }}>Remarks</th>
                    <th style={{ width: COLS.amount }} className="pr-amt-header">{convert ? `Amount (${currency})` : 'Amount'}</th>
                    <th style={{ width: COLS.actions }}>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const rowError = itemsErrors?.[index];
                const amount = amountFor(watchedItems?.[index]);
                return (
                  <tr key={field.id} data-row={index} className="pr-item-row">
                    <td data-col={0} data-label="#">
                      <span className="font-bold">{index + 1}</span>
                    </td>
                    {showExt ? (
                      /* ---- CPR-aligned columns ---- */
                      <>
                        {/* Drawing No. */}
                        <td data-col={COL.drawingNo} data-label="Drawing No." {...keyProps(index, COL.drawingNo)}>
                          {control ? (
                            <Controller
                              control={control}
                              name={`items.${index}.drawingNo`}
                              render={({ field: f }) => (
                                <TextInput
                                  value={f.value || ''}
                                  onChange={(e) => f.onChange(sanitizeDrawingNo(e.target.value))}
                                  placeholder="e.g. DWG-001"
                                  maxLength={100}
                                />
                              )}
                            />
                          ) : (
                            <TextInput
                              registration={register(`items.${index}.drawingNo`)}
                              placeholder="e.g. DWG-001"
                              maxLength={100}
                            />
                          )}
                        </td>
                        {/* Item Description (required) */}
                        <td data-col={COL.product} data-label="Item Description" {...keyProps(index, COL.product)}>
                          <TextInput
                            registration={register(`items.${index}.product`)}
                            error={!!rowError?.product}
                            placeholder="Type item description…"
                            list="pr-item-list"
                          />
                          {rowError?.product && <p className={CELL_ERROR}>{rowError.product.message}</p>}
                        </td>
                        {/* Specification */}
                        <td data-col={COL.specification} data-label="Specification" {...keyProps(index, COL.specification)}>
                          <TextInput
                            registration={register(`items.${index}.specification`)}
                            placeholder="Spec / grade"
                          />
                        </td>
                        {/* Qty (required) */}
                        <td data-col={COL.qty} data-label="Qty" className="pr-num-cell" {...keyProps(index, COL.qty)}>
                          <TextInput
                            type="number"
                            min="0"
                            step="any"
                            registration={register(`items.${index}.qty`)}
                            error={!!rowError?.qty}
                            placeholder="0"
                          />
                          {rowError?.qty && <p className={CELL_ERROR}>{rowError.qty.message}</p>}
                        </td>
                        {/* UOM */}
                        <td data-col={COL.uom} data-label="UOM" {...keyProps(index, COL.uom)}>
                          {control ? (
                            <Controller
                              control={control}
                              name={`items.${index}.uom`}
                              render={({ field: f }) => (
                                <EditableMasterSelect
                                  masterKey="uoms"
                                  size="table"
                                  value={f.value || ''}
                                  onChange={f.onChange}
                                  placeholder="Select / add UOM"
                                  ariaLabel={`UOM row ${index + 1}`}
                                />
                              )}
                            />
                          ) : (
                            <TextInput registration={register(`items.${index}.uom`)} placeholder="UOM" />
                          )}
                        </td>
                        {/* Est. Cost */}
                        <td data-col={COL.rate} data-label="Est. Cost" className="pr-num-cell" {...keyProps(index, COL.rate)}>
                          <TextInput
                            type="number"
                            min="0"
                            step="any"
                            registration={register(`items.${index}.rate`)}
                            error={!!rowError?.rate}
                            placeholder="0.00"
                          />
                          {rowError?.rate && <p className={CELL_ERROR}>{rowError.rate.message}</p>}
                        </td>
                        {/* Remarks */}
                        <td data-col={COL.remarks} data-label="Remarks">
                          <TextArea registration={register(`items.${index}.remarks`)} rows={2} placeholder="Remarks" />
                        </td>
                        {/* Total (calculated) */}
                        <td data-col={COL.total} data-label="Total" className="pr-amt-cell">
                          {fmt(amount)}
                        </td>
                        {/* Actions */}
                        <td data-col={COL.actions} data-label="Actions" className="pr-actions" {...keyProps(index, COL.actions)}>
                          <div className="pr-item-actions">
                            <button type="button" className="pr-item-action" onClick={() => onMoveUp?.(index)} disabled={index === 0} aria-label={`Move item ${index + 1} up`} title="Move up">
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="pr-item-action" onClick={() => onMoveDown?.(index)} disabled={index === fields.length - 1} aria-label={`Move item ${index + 1} down`} title="Move down">
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="pr-item-action" onClick={() => onDuplicate?.(index)} aria-label={`Duplicate item ${index + 1}`} title="Duplicate">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="pr-item-action pr-item-action-del" onClick={() => onRemove?.(index)} aria-label={`Remove item ${index + 1}`} title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="pr-item-action"
                              onClick={() => itemFileRefs.current?.[field.id]?.click()}
                              aria-label={`Attach files to item ${index + 1}`}
                              title={`Attach files to this item (PDF, DOCX, XLSX, PNG, JPG up to ${ITEM_FILE_MAX_LABEL})`}
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                            </button>
                            <input
                              ref={(el) => { itemFileRefs.current[field.id] = el; }}
                              type="file"
                              multiple
                              accept={ITEM_FILE_ACCEPT}
                              className="hidden"
                              onChange={(e) => { onAttachFiles?.(index, e.target.files); e.target.value = ''; }}
                            />
                          </div>
                          <RowAttachments
                            control={control}
                            index={index}
                            onRemove={(fi) => onRemoveItemAttachment?.(index, fi)}
                          />
                        </td>
                      </>
                    ) : (
                      /* ---- Standard PR columns (non-extended) ---- */
                      <>
                        <td data-col={COL.itemCode} data-label={LABELS[1]} {...keyProps(index, COL.itemCode)}>
                          <TextInput registration={register(`items.${index}.itemCode`)} placeholder="Item Code" />
                        </td>
                        <td data-col={COL.product} data-label={LABELS[2]} {...keyProps(index, COL.product)}>
                          <TextInput
                            registration={register(`items.${index}.product`)}
                            error={!!rowError?.product}
                            placeholder="Type item description…"
                            list="pr-item-list"
                          />
                          {rowError?.product && <p className={CELL_ERROR}>{rowError.product.message}</p>}
                        </td>
                        <td data-col={COL.category} data-label={LABELS[3]} {...keyProps(index, COL.category)}>
                          {control ? (
                            <Controller
                              control={control}
                              name={`items.${index}.category`}
                              render={({ field: f }) => (
                                <EditableMasterSelect
                                  masterKey="categories"
                                  size="table"
                                  value={f.value || ''}
                                  onChange={f.onChange}
                                  placeholder="Select / add category"
                                  ariaLabel={`Category row ${index + 1}`}
                                />
                              )}
                            />
                          ) : (
                            <TextInput registration={register(`items.${index}.category`)} placeholder="Category" />
                          )}
                        </td>
                        <td data-col={COL.hsn} data-label={LABELS[4]} {...keyProps(index, COL.hsn)}>
                          <TextInput registration={register(`items.${index}.hsn`)} placeholder="e.g. 7208" list="pr-hsn-list" />
                        </td>
                        <td data-col={COL.uom} data-label={LABELS[5]} {...keyProps(index, COL.uom)}>
                          {control ? (
                            <Controller
                              control={control}
                              name={`items.${index}.uom`}
                              render={({ field: f }) => (
                                <EditableMasterSelect
                                  masterKey="uoms"
                                  size="table"
                                  value={f.value || ''}
                                  onChange={f.onChange}
                                  placeholder="Select / add UOM"
                                  ariaLabel={`UOM row ${index + 1}`}
                                />
                              )}
                            />
                          ) : (
                            <TextInput registration={register(`items.${index}.uom`)} placeholder="UOM" />
                          )}
                        </td>
                        <td data-col={COL.qty} data-label={LABELS[6]} className="pr-num-cell" {...keyProps(index, COL.qty)}>
                          <TextInput
                            type="number"
                            min="0"
                            step="any"
                            registration={register(`items.${index}.qty`)}
                            error={!!rowError?.qty}
                            placeholder="0"
                          />
                          {rowError?.qty && <p className={CELL_ERROR}>{rowError.qty.message}</p>}
                        </td>
                        <td data-col={COL.rate} data-label={LABELS[7]} className="pr-num-cell" {...keyProps(index, COL.rate)}>
                          <TextInput
                            type="number"
                            min="0"
                            step="any"
                            registration={register(`items.${index}.rate`)}
                            error={!!rowError?.rate}
                            placeholder="0.00"
                          />
                          {rowError?.rate && <p className={CELL_ERROR}>{rowError.rate.message}</p>}
                        </td>
                        <td data-col={COL.discount} data-label={LABELS[8]} className="pr-num-cell" {...keyProps(index, COL.discount)}>
                          <TextInput
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            registration={register(`items.${index}.discount`)}
                            error={!!rowError?.discount}
                            placeholder="0"
                          />
                          {rowError?.discount && <p className={CELL_ERROR}>{rowError.discount.message}</p>}
                        </td>
                        <td data-col={COL.gst} data-label={LABELS[9]} className="pr-num-cell" {...keyProps(index, COL.gst)}>
                          <SelectInput registration={register(`items.${index}.gstRate`)} error={!!rowError?.gstRate}>
                            {gstRates.map((rate) => (
                              <option key={rate} value={rate}>{rate}%</option>
                            ))}
                          </SelectInput>
                          {rowError?.gstRate && <p className={CELL_ERROR}>{rowError.gstRate.message}</p>}
                        </td>
                        <td data-col={COL.remarks} data-label={LABELS[11]}>
                          <TextArea registration={register(`items.${index}.remarks`)} rows={2} placeholder="Remarks" />
                        </td>
                        <td data-col={COL.amount} data-label={LABELS[10]} className="pr-amt-cell">
                          {fmt(amount)}
                        </td>
                        <td data-col={COL.actions} data-label={LABELS[12]} className="pr-actions" {...keyProps(index, COL.actions)}>
                          <div className="pr-item-actions">
                            <button type="button" className="pr-item-action" onClick={() => onMoveUp?.(index)} disabled={index === 0} aria-label={`Move item ${index + 1} up`} title="Move up">
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="pr-item-action" onClick={() => onMoveDown?.(index)} disabled={index === fields.length - 1} aria-label={`Move item ${index + 1} down`} title="Move down">
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="pr-item-action" onClick={() => onDuplicate?.(index)} aria-label={`Duplicate item ${index + 1}`} title="Duplicate">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="pr-item-action pr-item-action-del" onClick={() => onRemove?.(index)} aria-label={`Remove item ${index + 1}`} title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {fields.length === 0 && (
              <tfoot>
                <tr>
                  <td colSpan={showExt ? 10 : 13} className="p-8 text-center text-xs text-slate-400">
                    No items added yet
                    <br />
                    <span className="text-slate-300">Add products, materials or services required for this Purchase Requisition.</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {/* HSN/SAC suggestions come from the live HSN master
              (Settings → HSN/SAC); item suggestions come from the
              Item Master (Settings → Items / Products). */}
          <datalist id="pr-hsn-list">
            {hsnCodes.map((code) => <option key={code} value={code} />)}
          </datalist>
          <datalist id="pr-item-list">
            {catalogItems.flatMap((item) => [
              <option key={`${item.itemCode}-c`} value={item.itemCode} />,
              <option key={`${item.itemCode}-p`} value={item.product} />
            ])}
          </datalist>
        </div>

        <div className="pr-item-footer">
          <button type="button" className="pr-item-add" onClick={onAppend}>
            <Plus className="w-4 h-4" /> {showExt ? 'Add Row' : 'Add Item'}
          </button>
          <div className="pr-item-summary" aria-label="Live totals">
            <div className="sum-block">
              <span className="sum-label">Subtotal</span>
              <span className="sum-value">{fmt(totals?.subtotal ?? subtotal)}</span>
            </div>
            {showTaxTotals && (
              <>
                <div className="sum-block">
                  <span className="sum-label">GST</span>
                  <span className="sum-value">{fmt(totals?.gstTotal ?? 0)}</span>
                </div>
                <div className="sum-block sum-grand">
                  <span className="sum-label">Grand Total</span>
                  <span className="sum-value">{fmt(totals?.roundedTotal ?? totals?.total ?? 0)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Read-only (view) mode ---------- */
  if (readOnly) {
    return (
      <div>
        <div className="po-table-card" style={{ marginBottom: 0 }}>
          <div className="po-table-wrap">
            <table className="po-table w-full text-left border-collapse text-xs min-w-[1100px]">
              <thead>
                <tr>
                  <th className={`${TH} w-8`}>#</th>
                  <th className={TH}>Item Code</th>
                  <th className={TH}>Item Description</th>
                  <th className={`${TH} w-36`}>Category</th>
                  <th className={TH}>HSN / SKU</th>
                  <th className={`${TH} w-24`}>UOM</th>
                  <th className={`${TH} w-20 text-right`}>Qty</th>
                  <th className={`${TH} w-28 text-right`}>Rate</th>
                  <th className={`${TH} w-24 text-right`}>Disc %</th>
                  <th className={`${TH} w-20 text-center`}>GST %</th>
                  <th className={`${TH} w-32 text-right`}>Amount</th>
                  <th className={`${TH} w-36`}>Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const line = lines?.[index] || null;
                  return (
                    <tr key={`${item.product}-${index}`} className="bg-surface hover:bg-slate-50/60 transition-colors">
                      <td className={`${TD} text-slate-400 font-bold`}>{index + 1}</td>
                      <td className={`${TD} text-slate-500`}>{item.itemCode || '—'}</td>
                      <td className={`${TD} font-semibold text-slate-800`}>{item.product || '—'}</td>
                      <td className={`${TD} text-slate-500`}>{item.category || '—'}</td>
                      <td className={`${TD} text-slate-500`}>{item.hsn || '—'}</td>
                      <td className={`${TD} text-slate-600`}>{item.uom || '—'}</td>
                      <td className={`${TD} text-right text-slate-700 font-semibold`}>{Number(item.qty) || 0}</td>
                      <td className={`${TD} text-right text-slate-700 font-semibold`}>{fmt(item.rate)}</td>
                      <td className={`${TD} text-right text-slate-600`}>{Number(item.discount) || 0}%</td>
                      <td className={`${TD} text-center text-slate-600`}>{Number(item.gstRate) || 0}%</td>
                      <td className={`${TD} text-right font-bold text-slate-800`}>
                        {fmt(line?.total ?? amountFor(item))}
                      </td>
                      <td className={`${TD} text-slate-500`}>{item.remarks || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-3 text-xs">
          <span className="text-slate-400 font-semibold">Subtotal</span>
          <span className="text-sm font-bold text-slate-900">{fmt(subtotal)}</span>
        </div>
      </div>
    );
  }

  /* ---------- Standard editable grid (PO / RFQ forms) ---------- */
  return (
    <div>
      <div className="po-table-card" style={{ marginBottom: 0 }}>
        <div className="po-table-wrap">
          <table className="po-table w-full text-left border-collapse text-xs min-w-[1100px]">
            <thead>
              <tr>
                <th className={`${TH} w-8`}>#</th>
                <th className={TH}>Item Code</th>
                <th className={TH}>Item Description</th>
                <th className={`${TH} w-36`}>Category</th>
                <th className={TH}>HSN / SKU</th>
                <th className={`${TH} w-24`}>UOM</th>
                <th className={`${TH} w-20 text-right`}>Qty</th>
                <th className={`${TH} w-28 text-right`}>Rate</th>
                <th className={`${TH} w-24 text-right`}>Disc %</th>
                <th className={`${TH} w-20 text-center`}>GST %</th>
                <th className={`${TH} w-32 text-right`}>Amount</th>
                <th className={`${TH} w-36`}>Remarks</th>
                <th className={`${TH} w-20`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map((field, index) => {
                const rowError = itemsErrors?.[index];
                const amount = amountFor(watchedItems?.[index]);
                return (
                  <tr key={field.id} className="bg-surface hover:bg-slate-50/60 transition-colors align-top">
                    <td className={`${TD} text-slate-400 font-bold`}>{index + 1}</td>
                    <td className={TD}>
                      <TextInput registration={register(`items.${index}.itemCode`)} placeholder="Code" className="min-w-[76px]" />
                    </td>
                    <td className={TD}>
                      <TextInput
                        registration={register(`items.${index}.product`)}
                        error={!!rowError?.product}
                        placeholder="Item description"
                      />
                      {rowError?.product && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-500">{rowError.product.message}</p>
                      )}
                    </td>
                    <td className={TD}>
                      {control ? (
                        <Controller
                          control={control}
                          name={`items.${index}.category`}
                          render={({ field: f }) => (
                            <EditableMasterSelect
                              masterKey="categories"
                              size="sm"
                              value={f.value || ''}
                              onChange={f.onChange}
                              placeholder="Category"
                              ariaLabel={`Category row ${index + 1}`}
                            />
                          )}
                        />
                      ) : (
                        <TextInput registration={register(`items.${index}.category`)} placeholder="Category" className="min-w-[96px]" />
                      )}
                    </td>
                    <td className={TD}>
                      <TextInput registration={register(`items.${index}.hsn`)} placeholder="HSN" className="min-w-[84px]" />
                    </td>
                    <td className={TD}>
                      {control ? (
                        <Controller
                          control={control}
                          name={`items.${index}.uom`}
                          render={({ field: f }) => (
                            <EditableMasterSelect
                              masterKey="uoms"
                              size="sm"
                              value={f.value || ''}
                              onChange={f.onChange}
                              placeholder="UOM"
                              ariaLabel={`UOM row ${index + 1}`}
                            />
                          )}
                        />
                      ) : (
                        <TextInput registration={register(`items.${index}.uom`)} placeholder="UOM" className="min-w-[72px]" />
                      )}
                    </td>
                    <td className={TD}>
                      <TextInput
                        type="number"
                        min="0"
                        step="any"
                        registration={register(`items.${index}.qty`)}
                        error={!!rowError?.qty}
                        placeholder="0"
                        className="text-right"
                      />
                      {rowError?.qty && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-500">{rowError.qty.message}</p>
                      )}
                    </td>
                    <td className={TD}>
                      <TextInput
                        type="number"
                        min="0"
                        step="any"
                        registration={register(`items.${index}.rate`)}
                        error={!!rowError?.rate}
                        placeholder="0.00"
                        className="text-right"
                      />
                      {rowError?.rate && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-500">{rowError.rate.message}</p>
                      )}
                    </td>
                    <td className={TD}>
                      <TextInput
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        registration={register(`items.${index}.discount`)}
                        error={!!rowError?.discount}
                        placeholder="0"
                        className="text-right"
                      />
                      {rowError?.discount && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-500">{rowError.discount.message}</p>
                      )}
                    </td>
                    <td className={TD}>
                      <SelectInput
                        registration={register(`items.${index}.gstRate`)}
                        error={!!rowError?.gstRate}
                      >
                        {gstRates.map((rate) => (
                          <option key={rate} value={rate}>{rate}%</option>
                        ))}
                      </SelectInput>
                      {rowError?.gstRate && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-500">{rowError.gstRate.message}</p>
                      )}
                    </td>
                    <td className={`${TD} text-right font-bold text-slate-800 whitespace-nowrap`}>
                      {formatAmount(amount, currency)}
                    </td>
                    <td className={TD}>
                      <TextInput registration={register(`items.${index}.remarks`)} placeholder="Remarks" className="min-w-[110px]" />
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onDuplicate?.(index)}
                          aria-label={`Duplicate item ${index + 1}`}
                          className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove?.(index)}
                          aria-label={`Remove item ${index + 1}`}
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {fields.length === 0 && (
              <tfoot>
                <tr>
                  <td colSpan={13} className="p-8 text-center text-xs text-slate-400">
                    No items added yet. Click &quot;Add Item&quot; to get started.
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        <button
          type="button"
          onClick={onAppend}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] border border-dashed border-[#0B4A3D]/40 hover:border-[#0B4A3D] bg-[#EDF7F4]/50 hover:bg-[#EDF7F4] px-3 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-semibold">Subtotal</span>
          <span className="text-sm font-bold text-slate-900">{formatAmount(subtotal, currency)}</span>
        </div>
      </div>
    </div>
  );
}

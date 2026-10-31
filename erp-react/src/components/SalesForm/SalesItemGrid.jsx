import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2, Copy } from 'lucide-react';
import { GST_RATES } from '../../constants/salesConstants';
import { CURRENCY_SYMBOLS } from '../../utils/quotationPrintUtils';
import { EditableMasterDropdown } from '../Common';
import useClickOutside from '../../hooks/useClickOutside';
import useManagedGrid from '../../hooks/useManagedGrid';
import { ColumnRenameButton, ColumnResizer, ManageColumnsButton } from '../GridColumns';
import { defaultSalesItemsColumns } from '../../utils/salesItemsColumns';
import productService from '../../services/productService';
import { lineAmount } from '../../utils/salesHelpers';
// Reuse the Quotation items-table styles so every Sales Execution module's
// Items section uses the SAME professional item-entry system.
import '../../pages/sales/quotation-create.css';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

const TH_CLS = 'px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap';

/**
 * Type-or-select product combobox (matches the original ERP item grid):
 * searching the product master auto-fills description, HSN, UOM, rate and GST.
 */
function ProductCombobox({ value, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  useEffect(() => {
    let cancelled = false;
    productService
      .list()
      .then((products) => {
        if (cancelled) return;
        setOptions(products || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.sku || '').toLowerCase().includes(q) ||
        String(p.hsn || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <div ref={wrapRef} className="relative min-w-[220px]">
      <div className="relative">
        <input
          type="text"
          value={open ? query : value || ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search product…"
          className={INPUT_CLS}
        />
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p);
                setOpen(false);
                setQuery('');
              }}
              className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs text-slate-700 cursor-pointer"
            >
              <span className="font-semibold">{p.name || ''}</span>
              <span className="block text-[10px] text-slate-400">
                {p.sku || ''} {p.hsn ? `· HSN ${p.hsn}` : ''} · {p.unit || ''} · ₹{Number(p.rate || 0).toLocaleString('en-IN')}
              </span>
            </button>
          ))}
          {loaded && filtered.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No products found</div>}
        </div>
      )}
    </div>
  );
}

// Standardized module header labels (kept per module where the reference
// genuinely differs, otherwise the Quotation standard applies).
const PROFORMA_HEADERS = { product: 'Item / Description', hsn: 'HSN/SAC', unit: 'UOM' };
const INVOICE_HEADERS = { product: 'Product / Description', hsn: 'HSN', unit: 'Unit' };
const CREDIT_NOTE_HEADERS = { product: 'Product', hsn: 'HSN', unit: 'Unit' };

/**
 * Standard Items grid shared by Proforma Invoices, Invoices and Credit Notes.
 * Matches the Quotation master reference:
 *   S.NO | QTY | UOM | [HSN] | ITEM DESCRIPTION | RATE | GST(CGST|SGST) | TOTAL | ACTIONS
 * The GST type + rate dropdowns live in the GST table header (single dropdown
 * set); rows are display-only for the CGST/SGST split.
 */
function SimpleItemsGrid({
  items = [],
  setItems,
  readOnly = false,
  headers = PROFORMA_HEADERS,
  hsnView = true,
  taxType = 'CGST + SGST',
  onTaxTypeChange,
  variant = 'invoice',
  exportMode = false,
  currency = 'INR'
}) {
  const isIgst = String(taxType || '').toLowerCase().includes('igst');
  const showHsn = hsnView;
  // Per-variant column sets:
  //  - export:    S.No | Product / Description | Item Code | Drawing No |
  //               Material | HSN | Manufacturer | Country of Origin | Qty | UOM |
  //               Rate (cur) | Total (cur) | Actions — NO GST column.
  //  - proformaExport: the export proforma invoice reference table — S.No |
  //               Marks & Nos / Container No | No. & Kind of Pkgs | Description
  //               of Goods | Item Code | Drawing No | Material | HSN |
  //               Manufacturer | Country of Origin | Qty | UOM | Unit Price
  //               (cur) | Total (cur) | Actions (no GST column).
  //  - packingList: S.No | Description of Goods | Marks & Nos / Container No |
  //               No. & Kind of Pkgs | Qty | Unit | Net Weight (KGS) | Gross
  //               Weight (KGS) | Actions — no price / GST columns at all.
  //  - proforma:  S.No | Description of Goods | HS Code | Quantity | Unit |
  //               Unit Price (USD) | GST | Amount (USD) | Actions
  //  - creditNote: S.No | Item | HSN | Qty | UOM | Rate | GST % |
  //               Taxable Amount | Total | Actions — a Credit Note has NO
  //               Discount % column (no discount input, and nothing to
  //               re-enable through Manage Columns).
  //  - invoice (default): the Quotation-master order (QTY | UOM | HSN | DESC...).
  const variantKey = exportMode ? 'export' : (variant || 'invoice');
  const isProforma = variantKey === 'proforma';
  const isProformaExport = variantKey === 'proformaExport';
  const isPackingList = variantKey === 'packingList';
  const isCreditNote = variantKey === 'creditNote';
  const isExport = variantKey === 'export';
  const curLabel = String(currency || 'INR').toUpperCase();
  // Export invoices / export proformas / packing lists have no GST column at
  // all; the other variants keep the two-column GST group (Credit Note: single
  // % column).
  const GST_SPAN = isExport || isProformaExport || isPackingList ? 0 : isCreditNote ? 1 : 2;
  const COL_CLASS = {
    sno: 'it-th-sno', qty: 'it-th-qty', unit: 'it-th-uom', hsn: 'it-th-hsn',
    desc: 'it-th-desc', rate: 'it-th-rate', gst: 'it-th-gst',
    discount: 'it-th-discount', taxable: 'it-th-taxable',
    total: 'it-th-total', amount: 'it-th-total', actions: 'it-th-actions',
    sku: 'it-th-sku', drawingNo: 'it-th-drawingno', material: 'it-th-material',
    manufacturer: 'it-th-manufacturer', countryOfOrigin: 'it-th-country',
    marksNos: 'it-th-marksnos', noKindPkgs: 'it-th-nokindpkgs',
    netWeight: 'it-th-netweight', grossWeight: 'it-th-grossweight'
  };

  // ---- Manageable / resizable column configuration -------------------------
  // Every variant's default column set drives the grid through the shared
  // GridColumns toolkit: rename, reorder, hide/show, Add Custom Column, remove
  // custom columns and drag-to-resize — persisted in MySQL (app_settings) via
  // the module grid-config store, restored exactly on refresh/reopen.
  // A Credit Note has no Discount % column: the column is absent from the
  // credit-note defaults (salesItemsColumns) AND pruned from any configuration
  // already saved for this grid, so it is gone from the table, from Manage
  // Columns and from the persisted config alike — never merely hidden.
  const excludedColumnKeys = isCreditNote ? ['discount'] : [];
  const managed = useManagedGrid({
    gridKey: `sales.items.${variantKey}`,
    defaults: () => defaultSalesItemsColumns({ variant: variantKey, showHsn }),
    excludeKeys: excludedColumnKeys,
    insertBeforeKeys: ['actions'],
    itemNoun: 'item',
    rowCount: items.length,
    removeColumnValues: (columnId) => {
      if (!setItems) return;
      setItems((prev) => prev.map((it) => {
        if (!it || !it.customFields) return it;
        const cf = { ...it.customFields };
        delete cf[columnId];
        return { ...it, customFields: cf };
      }));
    }
  });
  const resize = managed.resize;
  // The HSN Column View Advanced Option still hides HSN independently of the
  // saved configuration (saved values are never lost).
  const visibleColumns = showHsn ? managed.visibleColumns : managed.visibleColumns.filter((c) => c.key !== 'hsn');
  const colCount = visibleColumns.reduce((n, c) => n + (c.key === 'gst' ? GST_SPAN : 1), 0);
  const tableMinWidth = visibleColumns.reduce((sum, c) => sum + resize.widthOf(c) * (c.key === 'gst' ? GST_SPAN : 1), 0);

  // User-defined columns store their per-row value in row.customFields[col.id],
  // so every row keeps an independent value and renaming never orphans data.
  const updateCustomField = (index, columnId, value) => {
    if (!setItems) return;
    setItems((prev) => prev.map((it, i) => (
      i === index ? { ...it, customFields: { ...(it.customFields || {}), [columnId]: value } } : it
    )));
  };

  // Header GST rate applies to every item row (like the Quotation master);
  // syncs to the first item's stored rate on load.
  const [gstRate, setGstRate] = useState(18);
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    const first = items.find((it) => !it.rowType || it.rowType === 'item');
    setGstRate(first && first.gstRate != null ? Number(first.gstRate) || 0 : 18);
  }
  const headerGstRate = Number(gstRate) || 0;
  const gstRateOptions = GST_RATES.includes(headerGstRate)
    ? GST_RATES
    : [...GST_RATES, headerGstRate].sort((a, b) => a - b);
  const gstTypeOptions = ['CGST + SGST', 'IGST'];
  const gstTypeOptionsForSelect = gstTypeOptions.includes(taxType)
    ? gstTypeOptions
    : [...gstTypeOptions, taxType];

  const applyGstRateToAll = (rate) => {
    setGstRate(rate);
    if (items.some((it) => !it.rowType || it.rowType === 'item')) {
      setItems((prev) =>
        prev.map((it) => {
          const updated = { ...it, gstRate: rate };
          updated.amount = lineAmount(updated).amount;
          return updated;
        })
      );
    }
  };

  const addRow = () => {
    const first = items.find((it) => !it.rowType || it.rowType === 'item');
    const rate = first && first.gstRate != null ? Number(first.gstRate) || 0 : Number(gstRate) || 0;
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
        manufacturer: '',
        countryOfOrigin: '',
        marksNos: '',
        noKindPkgs: '',
        unit: isExport || isProformaExport || isPackingList ? 'NOS' : 'pcs',
        qty: 1,
        rate: 0,
        discountPct: 0,
        // Export invoices (LUT / Bond or Export with IGST via the item-level
        // IGST column) never carry the domestic CGST/SGST split.
        gstRate: isExport || isProformaExport ? 0 : rate,
        amount: 0,
        // Packing List line weights (KGS).
        netWeight: 0,
        grossWeight: 0
      }
    ]);
  };

  const updateRow = (index, patch) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    const row = next[index];
    if (row) row.amount = lineAmount(row).amount;
    setItems(next);
  };

  const removeRow = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const duplicateRow = (index) => {
    const source = items[index];
    if (!source) return;
    const copy = { ...source, id: undefined, qty: source.qty ?? 1 };
    copy.amount = lineAmount(copy).amount;
    setItems([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
  };

  const descLines = (item) => {
    const lines = [
      item.sku ? `Item Code: ${item.sku}` : '',
      item.drawingNo ? `Drawing No: ${item.drawingNo}` : '',
      item.material ? `Material: ${item.material}` : '',
      item.delivery ? `Delivery: ${item.delivery}` : ''
    ];
    if (isExport || isProformaExport || isPackingList) {
      lines.push(item.manufacturer ? `Manufacturer: ${item.manufacturer}` : '');
      lines.push(item.countryOfOrigin ? `Country of Origin: ${item.countryOfOrigin}` : '');
    }
    return lines.filter(Boolean).join(' | ') || item.description || '—';
  };

  // Rename pencil control — shown on every managed column header (CPR parity),
  // protected structural columns (S.No / Actions) keep no rename control.
  const renameBtn = (col) => (
    ['sno', 'actions'].includes(col.key)
      ? null
      : <ColumnRenameButton manager={managed.manager} column={col} />
  );

  const headTh = (col, rowSpan) => (
    <th
      key={col.id}
      rowSpan={rowSpan}
      className={`${COL_CLASS[col.key] || 'it-th-export'} grid-resizable-th`}
      style={{ width: resize.widthOf(col) }}
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {col.label}
        {renameBtn(col)}
      </span>
      {col.key !== 'actions' && <ColumnResizer column={col} resize={resize} />}
    </th>
  );

  const renderHead = () => {
    // Export invoices / export proformas / packing lists use a single-row
    // header — no GST group at all.
    if (isExport || isProformaExport || isPackingList) {
      return (
        <thead>
          <tr>
            {visibleColumns.map((col) => headTh(col, undefined))}
          </tr>
        </thead>
      );
    }
    // Number of single columns before/after the GST group in this variant's
    // column order — the CGST/SGST sub-header aligns directly under the GST
    // header (spacer cells keep the two header rows in sync). A hidden GST
    // column removes the group entirely (all columns become single-row).
    const beforeGst = visibleColumns.findIndex((c) => c.key === 'gst');
    if (beforeGst < 0) {
      return (
        <thead>
          <tr>{visibleColumns.map((col) => headTh(col, undefined))}</tr>
        </thead>
      );
    }
    const afterGst = visibleColumns.length - beforeGst - 1;
    return (
      <thead>
        <tr>
          {visibleColumns.map((col) =>
            col.key === 'gst' ? (
              <th
                key={col.id}
                className="it-th-gst grid-resizable-th"
                colSpan={GST_SPAN}
                style={{ width: resize.widthOf(col) * GST_SPAN }}
              >
                <div className="it-gst-header">
                  <span className="it-gst-header-label">GST</span>
                  <select
                    className="it-gst-type-select"
                    value={taxType}
                    onChange={(e) => onTaxTypeChange && onTaxTypeChange(e.target.value)}
                    title="GST type — CGST + SGST (intra-state) or IGST (inter-state)"
                  >
                    {gstTypeOptionsForSelect.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    className="it-gst-rate-select"
                    value={headerGstRate}
                    onChange={(e) => applyGstRateToAll(Number(e.target.value))}
                    title="GST rate — applies to all items"
                  >
                    {gstRateOptions.map((r) => (
                      <option key={r} value={r}>{r}%</option>
                    ))}
                  </select>
                  {renameBtn(col)}
                </div>
                <ColumnResizer column={col} resize={resize} />
              </th>
            ) : (
              headTh(col, 2)
            )
          )}
        </tr>
        <tr className="it-subhead-row">
          {beforeGst > 0 && <th colSpan={beforeGst} />}
          {GST_SPAN === 1 ? (
            <th className={isIgst ? 'it-th-igst' : 'it-th-cgst'} colSpan={1}>
              {isIgst ? `IGST ${headerGstRate}%` : `CGST ${headerGstRate / 2}% + SGST ${headerGstRate / 2}%`}
            </th>
          ) : isIgst ? (
            <th className="it-th-igst" colSpan={2}>IGST {headerGstRate}%</th>
          ) : (
            <>
              <th className="it-th-cgst">CGST {headerGstRate / 2}%</th>
              <th className="it-th-sgst">SGST {headerGstRate / 2}%</th>
            </>
          )}
          {afterGst > 0 && <th colSpan={afterGst} />}
        </tr>
      </thead>
    );
  };

  const renderRow = (item, idx) => {
    const calc = lineAmount(item);
    const gstHalf = Number(item.gstRate || 0) / 2;
    return (
      <tr key={idx} className="item-table-row">
        {visibleColumns.map((col) => {
          const c = col.key;
          switch (c) {
            case 'sno':
              return <td key={col.id} className="it-td-sno">{idx + 1}</td>;
            case 'qty':
              return (
                <td key={col.id} className="it-td-qty">
                  <input
                    type="number"
                    min="0"
                    value={item.qty ?? 1}
                    onChange={(e) => updateRow(idx, { qty: e.target.value })}
                    placeholder="0"
                  />
                </td>
              );
            case 'unit':
              return (
                <td key={col.id} className="it-td-uom">
                  <EditableMasterDropdown
                    masterKey="units"
                    value={item.unit || item.uom || ''}
                    onChange={(v) => updateRow(idx, { unit: v })}
                    placeholder="Unit"
                    portal
                    inputClassName="it-unit-dd"
                  />
                </td>
              );
            case 'hsn':
              return (
                <td key={col.id} className="it-td-hsn">
                  <input
                    type="text"
                    value={item.hsn || ''}
                    onChange={(e) => updateRow(idx, { hsn: e.target.value })}
                    placeholder="HSN"
                  />
                </td>
              );
            case 'desc':
              // Export invoices / export proformas / packing lists: the
              // description column carries ONLY the description — Item Code /
              // Drawing No / Material / Manufacturer / Country of Origin have
              // their own dedicated columns (or appear as read-only chips).
              if (isExport || isProformaExport || isPackingList) {
                return (
                  <td key={col.id} className="it-td-desc">
                    <div className="it-desc-stack">
                      <div className="it-desc-field it-desc-main">
                        <label htmlFor={`sigDesc-${idx}`}>{headers.product}</label>
                        <input
                          id={`sigDesc-${idx}`}
                          type="text"
                          value={item.description || item.productName || ''}
                          onChange={(e) => updateRow(idx, { description: e.target.value })}
                          placeholder="Description"
                        />
                      </div>
                    </div>
                  </td>
                );
              }
              return (
                <td key={col.id} className="it-td-desc">
                  <div className="it-desc-stack">
                    <div className="it-desc-field">
                      <label htmlFor={`sigDesc-${idx}`}>{headers.product}</label>
                      <input
                        id={`sigDesc-${idx}`}
                        type="text"
                        value={item.description || item.productName || ''}
                        onChange={(e) => updateRow(idx, { description: e.target.value })}
                        placeholder="Description"
                      />
                    </div>
                    <div className="it-desc-field">
                      <label htmlFor={`sigSku-${idx}`}>Item Code</label>
                      <input
                        id={`sigSku-${idx}`}
                        type="text"
                        value={item.sku || ''}
                        onChange={(e) => updateRow(idx, { sku: e.target.value })}
                        placeholder="Item Code"
                      />
                    </div>
                    <div className="it-desc-field">
                      <label htmlFor={`sigDrw-${idx}`}>Drawing No</label>
                      <input
                        id={`sigDrw-${idx}`}
                        type="text"
                        value={item.drawingNo || ''}
                        onChange={(e) => updateRow(idx, { drawingNo: e.target.value })}
                        placeholder="Drawing No"
                      />
                    </div>
                    <div className="it-desc-field">
                      <label htmlFor={`sigMat-${idx}`}>Material</label>
                      <input
                        id={`sigMat-${idx}`}
                        type="text"
                        value={item.material || ''}
                        onChange={(e) => updateRow(idx, { material: e.target.value })}
                        placeholder="Material"
                      />
                    </div>
                    <div className="it-desc-field">
                      <label htmlFor={`sigDel-${idx}`}>Delivery</label>
                      <input
                        id={`sigDel-${idx}`}
                        type="text"
                        value={item.delivery || ''}
                        onChange={(e) => updateRow(idx, { delivery: e.target.value })}
                        placeholder="Delivery"
                      />
                    </div>
                  </div>
                </td>
              );
            case 'sku':
              return (
                <td key={col.id} className="it-td-sku">
                  <input
                    type="text"
                    value={item.sku || ''}
                    onChange={(e) => updateRow(idx, { sku: e.target.value })}
                    placeholder="Item Code"
                  />
                </td>
              );
            case 'drawingNo':
              return (
                <td key={col.id} className="it-td-drawingno">
                  <input
                    type="text"
                    value={item.drawingNo || ''}
                    onChange={(e) => updateRow(idx, { drawingNo: e.target.value })}
                    placeholder="Drawing No"
                  />
                </td>
              );
            case 'material':
              return (
                <td key={col.id} className="it-td-material">
                  <input
                    type="text"
                    value={item.material || ''}
                    onChange={(e) => updateRow(idx, { material: e.target.value })}
                    placeholder="Material"
                  />
                </td>
              );
            case 'manufacturer':
              return (
                <td key={col.id} className="it-td-manufacturer">
                  <input
                    type="text"
                    value={item.manufacturer || ''}
                    onChange={(e) => updateRow(idx, { manufacturer: e.target.value })}
                    placeholder="Manufacturer"
                  />
                </td>
              );
            case 'countryOfOrigin':
              return (
                <td key={col.id} className="it-td-country">
                  <input
                    type="text"
                    value={item.countryOfOrigin || ''}
                    onChange={(e) => updateRow(idx, { countryOfOrigin: e.target.value })}
                    placeholder="Country of Origin"
                  />
                </td>
              );
            case 'marksNos':
              return (
                <td key={col.id} className="it-td-marksnos">
                  <input
                    type="text"
                    value={item.marksNos || ''}
                    onChange={(e) => updateRow(idx, { marksNos: e.target.value })}
                    placeholder="Marks & Nos"
                  />
                </td>
              );
            case 'noKindPkgs':
              return (
                <td key={col.id} className="it-td-nokindpkgs">
                  <input
                    type="text"
                    value={item.noKindPkgs || ''}
                    onChange={(e) => updateRow(idx, { noKindPkgs: e.target.value })}
                    placeholder="No. & Kind of Pkgs"
                  />
                </td>
              );
            case 'netWeight':
              return (
                <td key={col.id} className="it-td-netweight">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.netWeight ?? 0}
                    onChange={(e) => updateRow(idx, { netWeight: e.target.value })}
                    placeholder="0.00"
                  />
                </td>
              );
            case 'grossWeight':
              return (
                <td key={col.id} className="it-td-grossweight">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.grossWeight ?? 0}
                    onChange={(e) => updateRow(idx, { grossWeight: e.target.value })}
                    placeholder="0.00"
                  />
                </td>
              );
            case 'rate':
              return (
                <td key={col.id} className="it-td-rate">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.rate ?? 0}
                    onChange={(e) => updateRow(idx, { rate: e.target.value })}
                    placeholder="0.00"
                  />
                </td>
              );
            case 'gst':
              return (
                <td key={col.id} className="it-td-gst" colSpan={GST_SPAN}>
                  <div className="it-gst-group">
                    {isIgst ? (
                      <div className="it-gst-split it-gst-igst">
                        <span>IGST {Number(item.gstRate) || 0}%</span>
                      </div>
                    ) : (
                      <div className="it-gst-split">
                        <span>CGST {gstHalf}%</span>
                        <span>SGST {gstHalf}%</span>
                      </div>
                    )}
                  </div>
                </td>
              );
            case 'taxable':
              return <td key={col.id} className="it-td-taxable">{formatAmount(calc.taxable)}</td>;
            case 'total':
            case 'amount':
              return <td key={col.id} className="it-td-total">{formatMoney(calc.amount)}</td>;
            case 'actions':
              return (
                <td key={col.id} className="item-actions">
                  <div className="it-row-actions">
                    <button type="button" className="it-row-action-btn success" onClick={() => duplicateRow(idx)} title="Duplicate">
                      <Copy size={12} />
                    </button>
                    <button type="button" className="it-row-action-btn danger" onClick={() => removeRow(idx)} title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              );
            default:
              // User-defined column — the value lives in this row's own
              // customFields object, so rows never share or copy values.
              return (
                <td key={col.id} className="it-td-custom">
                  <input
                    type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                    value={(item.customFields || {})[col.id] ?? ''}
                    onChange={(e) => updateCustomField(idx, col.id, e.target.value)}
                    placeholder={col.label}
                  />
                </td>
              );
          }
        })}
      </tr>
    );
  };

  const formatAmount = (v) =>
    isProforma || isExport || isProformaExport
      ? Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
      : `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  // Rate / total cells for the export variants are prefixed with the selected
  // currency symbol (EUR → €, USD → $, INR → ₹).
  const formatMoney = (v) => {
    const num = Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const sym = CURRENCY_SYMBOLS[curLabel] || `${curLabel} `;
    return isExport || isProformaExport ? `${sym}${num}` : formatAmount(v);
  };

  if (readOnly) {
    const roCols = visibleColumns.filter((c) => c.key !== 'actions');
    return (
      <div className="overflow-x-auto">
        <table className="item-table-wrap" style={{ tableLayout: 'fixed', minWidth: Math.max(720, tableMinWidth) }}>
          <colgroup>
            {roCols.flatMap((c) => (c.key === 'gst' ? Array.from({ length: GST_SPAN }, () => c) : [c])).map((c, i) =>
              c.key === 'desc' ? (
                <col key={`${c.id}-${i}`} className="it-col-desc" style={{ width: resize.widthOf(c) }} />
              ) : (
                <col key={`${c.id}-${i}`} style={{ width: resize.widthOf(c) }} />
              )
            )}
          </colgroup>
          {renderHead()}
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="item-table-row">
                {roCols.map((col) => {
                  const c = col.key;
                  switch (c) {
                    case 'sno':
                      return <td key={col.id} className="it-td-sno">{idx + 1}</td>;
                    case 'qty':
                      return <td key={col.id} className="it-td-qty">{Number(item.qty ?? 1).toLocaleString('en-IN')}</td>;
                    case 'unit':
                      return <td key={col.id} className="it-td-uom">{item.unit || item.uom || '—'}</td>;
                    case 'hsn':
                      return <td key={col.id} className="it-td-hsn">{item.hsn || '—'}</td>;
                    case 'sku':
                      return <td key={col.id} className="it-td-sku">{item.sku || '—'}</td>;
                    case 'drawingNo':
                      return <td key={col.id} className="it-td-drawingno">{item.drawingNo || '—'}</td>;
                    case 'material':
                      return <td key={col.id} className="it-td-material">{item.material || '—'}</td>;
                    case 'manufacturer':
                      return <td key={col.id} className="it-td-manufacturer">{item.manufacturer || '—'}</td>;
                    case 'countryOfOrigin':
                      return <td key={col.id} className="it-td-country">{item.countryOfOrigin || '—'}</td>;
                    case 'marksNos':
                      return <td key={col.id} className="it-td-marksnos">{item.marksNos || '—'}</td>;
                    case 'noKindPkgs':
                      return <td key={col.id} className="it-td-nokindpkgs">{item.noKindPkgs || '—'}</td>;
                    case 'netWeight':
                      return <td key={col.id} className="it-td-netweight">{Number(item.netWeight || 0).toLocaleString('en-US')}</td>;
                    case 'grossWeight':
                      return <td key={col.id} className="it-td-grossweight">{Number(item.grossWeight || 0).toLocaleString('en-US')}</td>;
                    case 'desc':
                      return <td key={col.id} className="it-td-desc" style={{ textAlign: 'left', padding: '0 8px' }}>{descLines(item)}</td>;
                    case 'rate':
                      return <td key={col.id} className="it-td-rate">{formatMoney(item.rate)}</td>;
                    case 'gst':
                      return (
                        <td key={col.id} className="it-td-gst" colSpan={GST_SPAN}>
                          {isIgst ? `IGST ${Number(item.gstRate) || 0}%` : `CGST ${Number(item.gstRate || 0) / 2}% | SGST ${Number(item.gstRate || 0) / 2}%`}
                        </td>
                      );
                    case 'taxable':
                      return <td key={col.id} className="it-td-taxable">{formatAmount(lineAmount(item).taxable)}</td>;
                    case 'total':
                    case 'amount':
                      return <td key={col.id} className="it-td-total">{formatMoney(lineAmount(item).amount)}</td>;
                    default:
                      return (
                        <td key={col.id} className="it-td-custom">
                          {(item.customFields || {})[col.id] ?? '—'}
                        </td>
                      );
                  }
                })}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px 0', fontSize: 12 }}>
                  No items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Proforma reference footer totals — computed automatically from the rows.
  const totalQty = items
    .filter((it) => !it.rowType || it.rowType === 'item')
    .reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalAmount = items
    .filter((it) => !it.rowType || it.rowType === 'item')
    .reduce((sum, it) => sum + lineAmount(it).amount, 0);
  // Packing List footer totals (KGS).
  const totalNetWeight = items
    .filter((it) => !it.rowType || it.rowType === 'item')
    .reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
  const totalGrossWeight = items
    .filter((it) => !it.rowType || it.rowType === 'item')
    .reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);

  return (
    // item-table-section defines the --it-* design tokens (ERP green #0B4A3D
    // etc.) this grid's CSS was written against — without it the footer
    // .it-btn-add renders as a transparent box with white (invisible) text.
    <div className="item-table-section">
      <div className="overflow-x-auto">
        <table className="item-table-wrap" style={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <colgroup>
            {visibleColumns.flatMap((c) => (c.key === 'gst' ? Array.from({ length: GST_SPAN }, () => c) : [c])).map((c, i) =>
              c.key === 'desc' ? (
                <col key={`${c.id}-${i}`} className="it-col-desc" style={{ width: resize.widthOf(c) }} />
              ) : (
                <col key={`${c.id}-${i}`} style={{ width: resize.widthOf(c) }} />
              )
            )}
          </colgroup>
          {renderHead()}
          <tbody>
            {items.map((item, idx) => renderRow(item, idx))}
            {items.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px 0', fontSize: 12 }}>
                  No items added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isProforma && items.some((it) => !it.rowType || it.rowType === 'item') && (
        <div className="flex items-center justify-end gap-8 pt-3 text-xs font-bold text-slate-600">
          <span>
            TOTAL QUANTITY:{' '}
            <span className="text-slate-900 font-extrabold">{Number(totalQty).toLocaleString('en-US')}</span>
          </span>
          <span>
            TOTAL AMOUNT (USD):{' '}
            <span className="text-slate-900 font-extrabold">{formatAmount(totalAmount)}</span>
          </span>
        </div>
      )}
      {isPackingList && items.some((it) => !it.rowType || it.rowType === 'item') && (
        <div className="flex items-center justify-end gap-8 pt-3 text-xs font-bold text-slate-600">
          <span>
            TOTAL QUANTITY:{' '}
            <span className="text-slate-900 font-extrabold">{Number(totalQty).toLocaleString('en-US')}</span>
          </span>
          <span>
            NET WEIGHT:{' '}
            <span className="text-slate-900 font-extrabold">{Number(totalNetWeight).toLocaleString('en-US')} KGS</span>
          </span>
          <span>
            GROSS WEIGHT:{' '}
            <span className="text-slate-900 font-extrabold">{Number(totalGrossWeight).toLocaleString('en-US')} KGS</span>
          </span>
        </div>
      )}
      <div className="item-table-footer" style={{ paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="it-btn-add" onClick={addRow} title="Add a new item row">
          <Plus size={14} /> Add
        </button>
        {/* Same Manage Columns experience as the CPR item grid: rename,
            reorder, hide/show, add custom columns and drag-to-resize — saved
            to MySQL and restored exactly on reopen. */}
        <ManageColumnsButton manager={managed.manager} />
      </div>

    </div>
  );
}

/**
 * Legacy default grid (Product combobox variant) used only where a module does
 * not opt into the proforma/invoice/creditNote variants. Kept as-is.
 */
function DefaultItemsGrid({ items = [], setItems, readOnly = false }) {
  const addRow = () => {
    setItems([
      ...items,
      {
        productId: null,
        productName: '',
        description: '',
        hsn: '',
        unit: '',
        qty: 1,
        rate: 0,
        discountPct: 0,
        gstRate: 0,
        amount: 0
      }
    ]);
  };

  const updateRow = (index, patch) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    const row = next[index];
    if (row) {
      row.amount = lineAmount(row).amount;
    }
    setItems(next);
  };

  const removeRow = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleProductSelect = (index, product) => {
    updateRow(index, {
      productId: product.id,
      productName: product.name,
      description: product.description || product.name,
      hsn: product.hsn || '',
      unit: product.unit || '',
      rate: Number(product.rate) || 0,
      gstRate: Number(product.gstRate) || 0
    });
  };

  if (readOnly) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-slate-50">
              <th className={TH_CLS}>#</th>
              <th className={TH_CLS}>Product</th>
              <th className={TH_CLS}>Description</th>
              <th className={TH_CLS}>HSN</th>
              <th className={TH_CLS}>Unit</th>
              <th className={`${TH_CLS} text-right`}>Qty</th>
              <th className={`${TH_CLS} text-right`}>Rate</th>
              <th className={`${TH_CLS} text-right`}>Disc %</th>
              <th className={`${TH_CLS} text-right`}>GST %</th>
              <th className={`${TH_CLS} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const calc = lineAmount(item);
              return (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="px-2 py-2 text-xs text-slate-400">{idx + 1}</td>
                  <td className="px-2 py-2 text-xs font-semibold text-slate-700">{item.productName || '—'}</td>
                  <td className="px-2 py-2 text-xs">{item.description || '—'}</td>
                  <td className="px-2 py-2 text-xs">{item.hsn || '—'}</td>
                  <td className="px-2 py-2 text-xs">{item.unit || '—'}</td>
                  <td className="px-2 py-2 text-xs text-right">{calc.qty}</td>
                  <td className="px-2 py-2 text-xs text-right">{Number(calc.rate).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-2 text-xs text-right">{calc.discountPct}%</td>
                  <td className="px-2 py-2 text-xs text-right">{calc.gstRate}%</td>
                  <td className="px-2 py-2 text-xs font-semibold text-right">
                    ₹{calc.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-6 text-center text-xs text-slate-400">
                  No items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] bg-[#E8F0EE] hover:bg-[#D7E7E3] px-3 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 780 }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 85 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 65 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th className={TH_CLS}>#</th>
              <th className={TH_CLS}>Product</th>
              <th className={TH_CLS}>Description</th>
              <th className={TH_CLS}>HSN</th>
              <th className={TH_CLS}>Unit</th>
              <th className={`${TH_CLS} text-right`}>Qty</th>
              <th className={`${TH_CLS} text-right`}>Rate</th>
              <th className={`${TH_CLS} text-right`}>Disc %</th>
              <th className={`${TH_CLS} text-right`}>GST %</th>
              <th className={`${TH_CLS} text-right`}>Amount</th>
              <th className={TH_CLS} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const calc = lineAmount(item);
              return (
                <tr key={idx} className="border-b border-slate-100 align-top">
                  <td className="px-2 py-1.5 text-xs text-slate-400 pt-3">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <ProductCombobox value={item.productName} onSelect={(p) => handleProductSelect(idx, p)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => updateRow(idx, { description: e.target.value })}
                      placeholder="Description"
                      className={INPUT_CLS}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={item.hsn || ''}
                      onChange={(e) => updateRow(idx, { hsn: e.target.value })}
                      placeholder="HSN"
                      className={`${INPUT_CLS} w-20`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableMasterDropdown
                      masterKey="units"
                      value={item.unit || ''}
                      onChange={(v) => updateRow(idx, { unit: v })}
                      placeholder="Unit"
                      portal
                      inputClassName={`${INPUT_CLS} w-20 cursor-text`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      value={item.qty ?? 1}
                      onChange={(e) => updateRow(idx, { qty: e.target.value })}
                      className={`${INPUT_CLS} w-20 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate ?? 0}
                      onChange={(e) => updateRow(idx, { rate: e.target.value })}
                      className={`${INPUT_CLS} w-24 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      value={item.discountPct ?? 0}
                      onChange={(e) => updateRow(idx, { discountPct: e.target.value })}
                      className={`${INPUT_CLS} w-16 text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={item.gstRate ?? 0}
                      onChange={(e) => updateRow(idx, { gstRate: Number(e.target.value) })}
                      className={`${INPUT_CLS} w-20 cursor-pointer text-right`}
                    >
                      {GST_RATES.map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 pt-3 text-xs font-bold text-slate-800 text-right whitespace-nowrap">
                    ₹{calc.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      aria-label={`Remove item ${idx + 1}`}
                      className="p-1.5 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center text-xs text-slate-400">
                  No items added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-3 flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] bg-[#E8F0EE] hover:bg-[#D7E7E3] px-3 py-2 rounded-lg transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Add Item
      </button>
    </div>
  );
}

export default function SalesItemGrid({
  items = [],
  setItems,
  readOnly = false,
  proforma = false,
  invoice = false,
  creditNote = false,
  exportMode = false,
  proformaExport = false,
  packingList = false,
  currency = 'INR',
  hsnView = true,
  taxType = 'CGST + SGST',
  onTaxTypeChange
}) {
  const shared = { items, setItems, readOnly, hsnView, taxType, onTaxTypeChange, exportMode, currency };
  if (proforma) {
    return <SimpleItemsGrid {...shared} headers={PROFORMA_HEADERS} variant="proforma" />;
  }
  if (proformaExport) {
    return <SimpleItemsGrid {...shared} headers={PROFORMA_HEADERS} variant="proformaExport" />;
  }
  if (packingList) {
    return <SimpleItemsGrid {...shared} headers={PROFORMA_HEADERS} variant="packingList" />;
  }
  if (invoice) {
    return <SimpleItemsGrid {...shared} headers={INVOICE_HEADERS} />;
  }
  if (exportMode) {
    return <SimpleItemsGrid {...shared} headers={INVOICE_HEADERS} variant="export" />;
  }
  if (creditNote) {
    return <SimpleItemsGrid {...shared} headers={CREDIT_NOTE_HEADERS} variant="creditNote" />;
  }
  return <DefaultItemsGrid items={items} setItems={setItems} readOnly={readOnly} />;
}

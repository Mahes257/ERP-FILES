import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  Info,
  Layers,
  Link as LinkIcon,
  List,
  Loader2,
  Paperclip,
  Plus,
  StickyNote,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { CreationActionBar, FormField, SelectInput, TextArea, TextInput, useToast } from '../../components/Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import ClientLookup from '../../components/SalesForm/ClientLookup';
import CreateCustomerModal from '../../components/SalesForm/CreateCustomerModal';
import PendingAttachments from '../../components/SalesForm/PendingAttachments';
import SalesAttachments from '../../components/SalesDetail/SalesAttachments';
import { TRANSPORT_COMPANIES } from '../../constants/salesConstants';
import { cpoNo, isHsnVisible, lineAmount, round2, SERIALIZERS } from '../../utils/salesHelpers';
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import { GST_RATES } from '../../constants/salesConstants';
import deliveryChallanService from '../../services/deliveryChallanService';
import customerService from '../../services/customerService';
import proformaInvoiceService from '../../services/proformaInvoiceService';
import salesOrderService from '../../services/salesOrderService';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

/**
 * Delivery Challan create/edit page — visual 1:1 with the ERP reference
 * (delivery-challan-create.html).
 *
 *   1. "Delivery Challan" card
 *      - grid-2: DC Number (readonly auto-generated), Sales Order (select)
 *      - grid-3: Date, Sales Contract Ref (readonly, auto-filled from SO),
 *        Status (Draft/Packed/Dispatched/In Transit/Delivered)
 *      - Client Details party card (Client lookup + Create New Customer,
 *        Customer Name, Contact Person, Email|Phone, Billing, Shipping,
 *        City|State)
 *      - Transport & Dispatch party card (Transport Company select, Vehicle
 *        Number, Driver Name|Driver Phone, LR Number, E-Way Bill|Dispatch
 *        Date, Expected Delivery)
 *   2. "Items" card (plain-text line grid matching the ERP: Description, HSN,
 *      UOM, Qty, Rate, Disc%, GST%, Amount, Total; toolbar Add New Line /
 *      Add Description / Duplicate). Amount = taxable; Total = taxable + GST.
 *   3. "Notes & Terms" card (Notes + Terms & Conditions)
 *   4. "Attachments" card (staged files on create, the saved files on edit)
 *   Sidebar: Totals (Sub Total, CGST, SGST, Discount flat ₹, Charges flat ₹,
 *   Grand Total, words) + Linked Documents.
 *
 * Auto-fill: Dispatch Date = today, Expected Delivery = today + 5 days (ERP
 * init). Selecting a Sales Order loads the client, SC ref, items, notes and
 * terms like the ERP's loadFromSO. Dates/status/validation match the ERP
 * DCCreate object exactly.
 */
const DC_STATUS_OPTIONS = ['Draft', 'Packed', 'Dispatched', 'In Transit', 'Delivered'];

const HEADER_FIELDS = [
  { key: 'dcNo', label: 'DC Number', type: 'text', placeholder: 'DC-YYYY-XXXXXX', required: true, readOnly: true },
  { key: 'soRef', label: 'Customer Purchase Order', type: 'soSelect' }
];

const HEADER_ROW2 = [
  { key: 'dcDate', label: 'Date', type: 'date', required: true },
  { key: 'scRef', label: 'Sales Contract Ref', type: 'text', readOnly: true, placeholder: 'Auto-filled from SO' },
  { key: 'status', label: 'Status', type: 'select', options: DC_STATUS_OPTIONS, required: true }
];

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

// ERP party-card inputs (.sales-form-input): white bg, 1px #e5e7eb border,
// 8px radius, 8px 12px padding, 13px text, emerald focus ring. Inputs are
// 40px tall; textareas keep auto height.
const PARTY_FIELD_CLS =
  'w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 placeholder-slate-400 outline-none focus:border-[#0B4A3D] focus:ring-2 focus:ring-[#0B4A3D]/10 transition-all';
const PARTY_INPUT_CLS = `${PARTY_FIELD_CLS} h-10`;
const PARTY_TEXTAREA_CLS = PARTY_FIELD_CLS;

const TH_CLS = 'px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap';

/**
 * Delivery Challan–specific items grid matching ERP delivery-challan-create.html
 * (DCCreate.addRow): columns # | Item Description | HSN/SAC | UOM | Qty | Rate |
 * Disc% | GST% | Amount | Total | trash. Amount = taxable; Total = taxable + GST.
 */
function DeliveryChallanItemsGrid({ items = [], setItems, hsnView = true, taxType = 'CGST + SGST', initialGstRate = 18, onHsnViewChange, onTaxTypeChange }) {
  const [gstRate, setGstRate] = useState(initialGstRate);
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
        unit: 'Nos',
        qty: 1,
        rate: 0,
        discountPct: 0,
        gstRate,
        amount: 0
      }
    ]);
  };

  const addDescriptionRow = () => {
    setItems([...items, { rowType: 'description', description: '' }]);
  };

  const duplicateLast = () => {
    if (items.length === 0) return addRow();
    const last = { ...items[items.length - 1] };
    if (last.rowType) return addDescriptionRow();
    setItems([...items, { ...last, amount: 0 }]);
  };

  const updateRow = (index, patch) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    const row = next[index];
    if (row && row.rowType !== 'description') {
      row.amount = lineAmount(row).amount;
    }
    setItems(next);
  };

  const removeRow = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const moveRow = (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
  };

  // Header GST rate dropdown — single GST control in the table header that
  // applies the chosen rate to every item row (same pattern as Quotations).
  const applyGstRateToAll = (rate) => {
    setGstRate(rate);
    if (items.some((it) => !it.rowType)) {
      setItems((prev) => prev.map((it) => (it.rowType ? it : { ...it, gstRate: rate })));
    }
  };

  const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  const showHsn = hsnView;
  const isIgst = String(taxType || '').toLowerCase().includes('igst');
  const headerGstRate = Number(gstRate) || 0;
  const gstRateOptions = GST_RATES.includes(headerGstRate)
    ? GST_RATES
    : [...GST_RATES, headerGstRate].sort((a, b) => a - b);
  const gstTypeOptions = ['CGST + SGST', 'IGST'];
  const gstTypeOptionsForSelect = gstTypeOptions.includes(taxType)
    ? gstTypeOptions
    : [...gstTypeOptions, taxType];

  return (
    <div>
      <div className="qtn-items-toolbar flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] shadow-sm transition-all cursor-pointer hover:-translate-y-px"
        >
          <Plus className="w-3.5 h-3.5" /> Add New Line
        </button>
        <button
          type="button"
          onClick={addDescriptionRow}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-[#0B4A3D] hover:text-[#0B4A3D] hover:bg-[#E8F0EE] transition-colors cursor-pointer"
        >
          <ClipboardList className="w-3.5 h-3.5" /> Add Description
        </button>
        <button
          type="button"
          onClick={duplicateLast}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-[#0B4A3D] hover:text-[#0B4A3D] hover:bg-[#E8F0EE] transition-colors cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={hsnView}
            onChange={(e) => onHsnViewChange(e.target.checked)}
          />
          HSN Column View
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 940 }}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 92 }} />
            {showHsn && <col style={{ width: 88 }} />}
            <col />
            <col style={{ width: 92 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 88 }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th rowSpan={2} className={`${TH_CLS} text-center`}>S.NO</th>
              <th rowSpan={2} className={`${TH_CLS} text-center`}>QTY</th>
              <th rowSpan={2} className={`${TH_CLS} text-center`}>UOM</th>
              {showHsn && <th rowSpan={2} className={`${TH_CLS} text-center`}>HSN</th>}
              <th rowSpan={2} className={`${TH_CLS} text-center`}>ITEM DESCRIPTION</th>
              <th rowSpan={2} className={`${TH_CLS} text-center`}>RATE</th>
              <th rowSpan={2} className={`${TH_CLS} text-center`}>DISC%</th>
              <th colSpan={2} className={`${TH_CLS} text-center`}>
                <div className="flex flex-col items-center gap-1">
                  <span>GST</span>
                  <div className="flex items-center gap-1">
                    <select
                      value={taxType}
                      onChange={(e) => onTaxTypeChange(e.target.value)}
                      title="GST type — CGST + SGST (intra-state) or IGST (inter-state)"
                      className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-700 outline-none cursor-pointer"
                    >
                      {gstTypeOptionsForSelect.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={headerGstRate}
                      onChange={(e) => applyGstRateToAll(Number(e.target.value))}
                      title="GST rate — applies to all items"
                      className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] font-semibold text-slate-700 outline-none cursor-pointer"
                    >
                      {gstRateOptions.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>
              </th>
              <th rowSpan={2} className={`${TH_CLS} text-center`}>TOTAL</th>
              <th rowSpan={2} className={`${TH_CLS} text-center`}>ACTIONS</th>
            </tr>
            <tr className="bg-slate-50">
              {isIgst ? (
                <th colSpan={2} className={`${TH_CLS} text-center`}>IGST {headerGstRate}%</th>
              ) : (
                <>
                  <th className={`${TH_CLS} text-center`}>CGST {headerGstRate / 2}%</th>
                  <th className={`${TH_CLS} text-center`}>SGST {headerGstRate / 2}%</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              if (item.rowType === 'description') {
                return (
                  <tr key={`d${idx}`} className="border-b border-slate-100 bg-amber-50/40">
                    <td className="px-2 py-1.5 text-xs text-slate-400 pt-3">{idx + 1}</td>
                    <td colSpan={8 + (showHsn ? 1 : 0)} className="px-2 py-1.5">
                      <TextArea
                        rows={1}
                        value={item.description || ''}
                        onChange={(e) => updateRow(idx, { description: e.target.value })}
                        placeholder="Description text (non-item)"
                        className={`${INPUT_CLS} resize-none`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
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
              const calc = lineAmount(item);
              return (
                <tr key={idx} className="border-b border-slate-100 align-top">
                  <td className="px-2 py-1.5 text-xs text-slate-400 pt-3">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      value={item.qty ?? 1}
                      onChange={(e) => updateRow(idx, { qty: e.target.value })}
                      className={`${INPUT_CLS} text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={item.unit || ''}
                      onChange={(e) => updateRow(idx, { unit: e.target.value })}
                      placeholder="UOM"
                      className={`${INPUT_CLS} w-20`}
                    />
                  </td>
                  {showHsn && (
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={item.hsn || ''}
                        onChange={(e) => updateRow(idx, { hsn: e.target.value })}
                        placeholder="HSN"
                        className={INPUT_CLS}
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <div className="flex flex-col gap-1">
                      {/* Item description — the field the document prints and
                          the one a Proforma Invoice conversion fills. Editable
                          on its own; it never writes to the item code /
                          drawing / material / delivery sub-fields below. */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Description</span>
                        <TextArea
                          rows={2}
                          value={item.description || ''}
                          onChange={(e) => updateRow(idx, { description: e.target.value })}
                          placeholder="Item description"
                          className={`${INPUT_CLS} resize-none`}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Item Code</span>
                        <input
                          type="text"
                          value={item.sku || ''}
                          onChange={(e) => updateRow(idx, { sku: e.target.value })}
                          placeholder="Item code"
                          className={INPUT_CLS}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Drawing No</span>
                        <input
                          type="text"
                          value={item.drawingNo || ''}
                          onChange={(e) => updateRow(idx, { drawingNo: e.target.value })}
                          placeholder="Drawing no"
                          className={INPUT_CLS}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Material</span>
                        <input
                          type="text"
                          value={item.material || ''}
                          onChange={(e) => updateRow(idx, { material: e.target.value })}
                          placeholder="Material"
                          className={INPUT_CLS}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Delivery</span>
                        <input
                          type="text"
                          value={item.delivery || ''}
                          onChange={(e) => updateRow(idx, { delivery: e.target.value })}
                          placeholder="Delivery"
                          className={INPUT_CLS}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate ?? 0}
                      onChange={(e) => updateRow(idx, { rate: e.target.value })}
                      className={`${INPUT_CLS} text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.discountPct ?? 0}
                      onChange={(e) => updateRow(idx, { discountPct: e.target.value })}
                      className={`${INPUT_CLS} text-right`}
                    />
                  </td>
                  <td colSpan={2} className="px-2 py-1.5 text-center">
                    <div className="flex justify-center gap-2 text-xs font-semibold text-slate-700 whitespace-nowrap">
                      {isIgst ? (
                        <span>IGST {Number(item.gstRate) || 0}%</span>
                      ) : (
                        <>
                          <span>CGST {(Number(item.gstRate) || 0) / 2}%</span>
                          <span>SGST {(Number(item.gstRate) || 0) / 2}%</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 pt-3 text-xs font-bold text-slate-800 text-right whitespace-nowrap">
                    {fmt(calc.amount)}
                  </td>
                  <td className="px-2 py-1.5">
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
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={10 + (showHsn ? 1 : 0)} className="px-2 py-6 text-center text-xs text-slate-400">
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

function numberToWordsINR(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convert = (num) => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
    if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
    if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
    return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
  };
  return 'Rupees ' + convert(n) + ' Only';
}

function fieldControl(field, value, onChange) {
  const shared = { value: value ?? '', onChange: (e) => onChange(e.target.value) };
  switch (field.type) {
    case 'textarea':
      return <TextArea rows={field.rows || 3} {...shared} placeholder={field.placeholder || ''} />;
    case 'hidden':
      return null;
    case 'select':
      return (
        <SelectInput {...shared}>
          <option value="">Select {field.label}</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </SelectInput>
      );
    default:
      return <TextInput type={field.type || 'text'} {...shared} placeholder={field.placeholder || ''} readOnly={field.readOnly} />;
  }
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 select-none">
      <div className="p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <span className="text-sm font-bold text-slate-900">{title}</span>
        {subtitle && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function DeliveryChallanFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);
  const navigateToList = '/delivery-challans';
  // "Back" always opens the existing Delivery Challans list WITH the Sales
  // Execution hub chrome (breadcrumb + module tab nav), regardless of how this
  // form was reached. navigateToList stays the bare module path because it is
  // also the base for record URLs and post-save redirects.
  const backToList = SALES_EXEC_HUB_TABS.deliveryChallans;

  const emptyForm = () => {
    const form = { status: 'Dispatched', hsnView: true, taxType: 'CGST + SGST' };
    const d = new Date();
    form.dcDate = d.toISOString().split('T')[0];
    form.dispatchDate = d.toISOString().split('T')[0];
    form.deliveryDate = new Date(d.getTime() + 5 * 86400000).toISOString().split('T')[0];
    return form;
  };

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({
    moduleKey: 'deliveryChallan',
    setForm,
    setItems,
    enabled: !isEdit
  });
  const [headerGstRateInit, setHeaderGstRateInit] = useState(18);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  // Attachments: staged on create (uploaded once the challan exists), listed
  // from the attachment endpoint on edit — the same endpoint the detail page
  // reads, so both pages show the same files.
  const [attachments, setAttachments] = useState([]);
  // The id whose attachment list has been read; the panel shows its loading
  // state until it matches the record on screen (also after an id change).
  const [attachmentsLoadedFor, setAttachmentsLoadedFor] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const attachmentsLoading = isEdit && String(attachmentsLoadedFor) !== String(id);
  // Historical revisions (older versions of an edited challan) are read-only.
  const [historical, setHistorical] = useState(false);
  const [soOptions, setSoOptions] = useState([]);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [clientRefreshKey, setClientRefreshKey] = useState(0);
  // Convert to Delivery Challan (Proforma Invoices ⋮): the source document this
  // form was opened from, kept for the source banner and for the save path.
  const [sourcePi, setSourcePi] = useState(null);
  const [sourcePiConflict, setSourcePiConflict] = useState(null);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleFieldChange = (field, value) => setField(field.key, value);

  // Feed the Sales Order dropdown (approved/in-progress/completed SOs).
  useEffect(() => {
    let cancelled = false;
    salesOrderService
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        const all = parseListResponse(res);
        const s = (val) => String(val || '').toLowerCase();
        const filtered = all.filter((o) => {
          const st = s(o.status);
          return st === 'approved' || st === 'in progress' || st === 'in_progress' || st === 'completed';
        });
        setSoOptions(filtered);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const soOptionsByNo = useMemo(() => {
    const map = {};
    soOptions.forEach((o) => {
      map[String(o.soNo ?? o.id)] = o;
    });
    return map;
  }, [soOptions]);

  const handleClientSelect = (customer) => {
    setField('clientId', customer.id);
    setField('clientName', customer.businessName || '');
    setField('contactPerson', customer.contactPerson || '');
    setField('email', customer.email || '');
    setField('phone', customer.phone || '');
    setField('city', customer.city || customer.billingCity || '');
    setField('state', customer.state || customer.billingState || '');
    setField('billingAddress', customer.billingAddress || customer.address || '');
    setField('shippingAddress', customer.shippingAddress || customer.billingAddress || customer.address || '');
  };

  // Client actions menu deep-link (Create Delivery Challan): ?clientId=<id>
  // pre-fills the client details from the saved Client record.
  const [searchParams] = useSearchParams();
  const prefillClientId = searchParams.get('clientId');

  useEffect(() => {
    if (!prefillClientId || isEdit) return;
    let cancelled = false;
    customerService
      .get(prefillClientId)
      .then((res) => {
        if (cancelled) return;
        const c = res?.data ?? res ?? {};
        handleClientSelect({
          id: c.id,
          businessName: c.businessName || '',
          contactPerson: c.contactPerson || '',
          email: c.email || '',
          phone: c.phone || '',
          city: c.billingCity || '',
          state: c.billingState || '',
          billingAddress: c.billingAddress || '',
          shippingAddress: c.shippingAddress || c.billingAddress || ''
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillClientId, isEdit]);

  // Convert to Delivery Challan deep-link (?fromPi=<id>, Proforma Invoices ⋮
  // Actions): the Proforma Invoice is read from the BACKEND (never from route
  // state) and prefilled into this form. Only the values the Delivery Challan
  // model actually carries transfer: the source reference (the Proforma
  // Invoice's CPO/SO and Sales Contract references — the same mapping the
  // backend one-click conversion applies), the customer party block, the line
  // items with their own quantities/units/rates/discounts/GST, the notes and
  // terms, the GST display flags, and the Delivery Challan sidebar's flat
  // Discount/Charges. City/State are left alone because a Proforma Invoice has
  // no city/state columns, and no total is copied — the challan recomputes its
  // totals from the rows below.
  const prefillPiId = searchParams.get('fromPi');

  useEffect(() => {
    if (!prefillPiId || isEdit) return undefined;
    let cancelled = false;
    // suppressGlobalError: this form renders its own failure banner — a source
    // Proforma Invoice that no longer exists must not swap the page for the
    // global error page.
    proformaInvoiceService
      .get(prefillPiId, { suppressGlobalError: true })
      .then((res) => {
        if (cancelled) return;
        const pi = res?.data ?? res ?? {};
        setSourcePi({ id: pi.id ?? prefillPiId, piNo: pi.piNo || '', clientName: pi.clientName || '' });
        if (pi.convertedToDc) {
          setSourcePiConflict(
            `This Proforma Invoice has already been converted to Delivery Challan ${pi.convertedToDc}. Open that challan instead of creating another one.`
          );
          return;
        }
        setForm((prev) => ({
          ...prev,
          soRef: pi.sourceRef || prev.soRef || '',
          scRef: pi.referenceNo || '',
          clientId: pi.clientId ?? prev.clientId,
          clientName: pi.clientName || '',
          contactPerson: pi.contactPerson || '',
          email: pi.email || '',
          phone: pi.phone || '',
          billingAddress: pi.billingAddress || '',
          shippingAddress: pi.shippingAddress || '',
          notes: pi.notes ?? prev.notes,
          terms: pi.terms ?? prev.terms,
          taxType: pi.taxType || prev.taxType,
          hsnView: pi.hsnView != null ? isHsnVisible(pi.hsnView) : prev.hsnView,
          discountPct: pi.discount != null ? Number(pi.discount) : prev.discountPct,
          charges: pi.charges != null ? Number(pi.charges) : prev.charges
        }));
        const piItems = (Array.isArray(pi.items) ? pi.items : []).filter((it) => !it.rowType);
        const mapped = piItems.map((it) => ({
          productId: it.productId || null,
          productName: it.productName || '',
          description: it.description || it.productName || '',
          sku: it.sku || '',
          drawingNo: it.drawingNo || '',
          material: it.material || '',
          delivery: it.delivery || '',
          hsn: it.hsn || '',
          unit: it.uom || it.unit || 'Nos',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate) || 0,
          discountPct: Number(it.discountPct) || 0,
          gstRate: Number(it.gstRate) || 0,
          amount: Number(it.amount) || 0
        }));
        setItems(mapped);
        setHeaderGstRateInit(mapped[0] ? Number(mapped[0].gstRate) || 18 : 18);
        // City / State are not Proforma Invoice columns, but the Delivery
        // Challan carries them: take them from the linked Customer record (the
        // same source the customer lookup uses). Only values the customer
        // actually has are filled — transport, vehicle, driver, LR and e-way
        // bill have no source document value and stay for manual entry.
        const fillCityState = (customer) => {
          if (!customer || cancelled) return;
          setForm((prev) => ({
            ...prev,
            city: prev.city || customer.billingCity || customer.city || '',
            state: prev.state || customer.billingState || customer.state || ''
          }));
        };
        if (pi.clientId != null) {
          customerService
            .get(pi.clientId)
            .then((cRes) => fillCityState(cRes?.data ?? cRes))
            .catch(() => {});
        } else if (pi.clientName) {
          // A Proforma Invoice raised from a CPO can carry only the customer
          // NAME (no client id), so resolve the saved customer record by its
          // exact name and take the address details from the customer master.
          customerService
            .list(pi.clientName)
            .then((res) => {
              const list = Array.isArray(res?.data) ? res.data : [];
              const wanted = String(pi.clientName).trim().toLowerCase();
              fillCityState(
                list.find((c) => String(c?.businessName || c?.companyName || '').trim().toLowerCase() === wanted)
              );
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load the source Proforma Invoice');
      });
    return () => {
      cancelled = true;
    };
  }, [prefillPiId, isEdit, toast]);

  const handleClientCreated = (customer) => {
    setClientRefreshKey((k) => k + 1);
    handleClientSelect(customer);
  };

  // Fill client, SC ref, items, notes and terms from a Sales Order record —
  // shared by the CPO select (loadFromSO) and the ?so=<id> conversion prefill
  // that the Customer Purchase Order page opens this form with.
  const applySalesOrderSource = (so, soValue) => {
    if (!so) return;
    setField('soRef', soValue);
    const customer = {
      id: so.clientId,
      businessName: so.clientName || so.client || '',
      contactPerson: so.contactPerson || '',
      email: so.email || '',
      phone: so.phone || '',
      city: so.city || '',
      state: so.state || '',
      billingAddress: so.billingAddress || '',
      shippingAddress: so.shippingAddress || so.billingAddress || ''
    };
    handleClientSelect(customer);
    setField('scRef', so.scRef || so.salesContract || so.contractRef || '');
    if (so.notes) setField('notes', so.notes);
    if (so.terms) setField('terms', so.terms);

    const soItems = Array.isArray(so.items) ? so.items : [];
    if (soItems.length > 0) {
      setItems(
        soItems.map((it) => ({
          productId: it.productId || null,
          productName: it.productName || it.product || '',
          // Preserve the source item SKU through the Sales Order → Delivery Challan conversion
          sku: it.sku || '',
          description: it.description || it.productName || it.product || '',
          hsn: it.hsn || '',
          unit: it.unit || it.uom || 'Nos',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate || it.unitPrice || it.price) || 0,
          discountPct: Number(it.discountPct || it.disc) || 0,
          gstRate: Number(it.gstRate || it.tax) || 0,
          amount: Number(it.amount) || 0
        }))
      );
    } else {
      setItems([]);
    }
  };

  // ERP loadFromSO: fill client, SC ref, items, notes and terms from the SO.
  const loadFromSO = (soValue) => {
    setField('soRef', soValue);
    if (!soValue) return;
    const so = soOptionsByNo[String(soValue)];
    if (!so) return;
    applySalesOrderSource(so, soValue);
    toast.success(`Loaded from Customer Purchase Order: ${cpoNo(so.soNo ?? soValue)}`);
  };

  // Convert to Delivery Challan deep-link (?so=<id>, Customer Purchase Order
  // view/list conversion): the CPO is read from the BACKEND and prefilled into
  // this form — customer block, SC ref, item rows (description/SKU/HSN/UOM/
  // qty/rate/discount/GST), notes, terms and the expected delivery date. The
  // challan number is still resolved through the existing numbering endpoint and
  // NOTHING is created, saved or linked until the user presses Save.
  const prefillSoId = searchParams.get('so');

  useEffect(() => {
    if (!prefillSoId || isEdit) return undefined;
    let cancelled = false;
    // suppressGlobalError: this form renders its own failure toast — a source
    // CPO that no longer exists must not swap the page for the global error
    // view (same rule as the ?fromPi prefill above).
    salesOrderService
      .get(prefillSoId, { suppressGlobalError: true })
      .then((res) => {
        if (cancelled) return;
        const so = res?.data ?? res ?? {};
        if (!so.soNo && !so.id) {
          toast.error('Customer Purchase Order could not be loaded');
          return;
        }
        applySalesOrderSource(so, so.soNo || String(prefillSoId));
        // CPO header values the challan carries (the select path reads the same
        // fields off the list projection; a CPO stores its notes in remarks).
        setForm((prev) => ({
          ...prev,
          scRef: so.scRef || prev.scRef || '',
          notes: so.remarks ?? prev.notes,
          terms: so.terms ?? prev.terms,
          deliveryDate: so.deliveryDate ? String(so.deliveryDate).slice(0, 10) : prev.deliveryDate
        }));
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load the source Customer Purchase Order');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSoId, isEdit]);

  const validate = () => {
    const realItems = (Array.isArray(items) ? items : []).filter((i) => !i || !i.rowType || i.rowType === 'item');
    if (realItems.length === 0) {
      toast.error('Add at least one item');
      return false;
    }
    if (!form.clientName) {
      toast.error('Select a client');
      return false;
    }
    return true;
  };

  const resetForm = async () => {
    setForm({ ...emptyForm(), dcNo: '' });
    setItems([]);
    setPendingFiles([]);
    setAttachments([]);
    const next = await deliveryChallanService
      .getNextNumber()
      .then((res) => {
        const value = res?.data?.dcNo || res?.data?.nextNumber;
        if (value) setForm((prev) => ({ ...prev, dcNo: value }));
      })
      .catch(() => {});
    return next;
  };

  useEffect(() => {
    if (!isEdit) {
      let cancelled = false;
      deliveryChallanService
        .getNextNumber()
        .then((res) => {
          if (cancelled) return;
          const value = res?.data?.dcNo || res?.data?.nextNumber;
          if (value) setForm((prev) => ({ ...prev, dcNo: value }));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [isEdit]);

  const reloadAttachments = () => {
    if (!isEdit) return Promise.resolve();
    return deliveryChallanService
      .getAttachments(id)
      .then((res) => {
        setAttachments(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    const readList = (res) =>
      Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    deliveryChallanService
      .getAttachments(id)
      .then((res) => {
        if (cancelled) return;
        setAttachments(readList(res));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAttachmentsLoadedFor(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    deliveryChallanService
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        setHistorical(raw.latestRevision === false);
        const toForm = {};
        const DATE_KEYS = new Set(['dcDate', 'dispatchDate', 'deliveryDate']);
        Object.keys(raw).forEach((key) => {
          if (key === 'items') return;
          if (typeof raw[key] === 'string' && (DATE_KEYS.has(key) || /Date$/.test(key))) {
            toForm[key] = raw[key].slice(0, 10);
          } else {
            toForm[key] = raw[key];
          }
        });
        if (raw.discount != null && toForm.discountPct == null) toForm.discountPct = raw.discount;
        if (raw.hsnView != null) toForm.hsnView = isHsnVisible(raw.hsnView);
        toForm.taxType = raw.taxType || 'CGST + SGST';
        setForm({ status: 'Dispatched', ...toForm });
        const loadedItems = (Array.isArray(raw.items) ? raw.items : []).map((it) => ({
          productId: it.productId || null,
          productName: it.productName || it.product || '',
          description: it.description || it.productName || it.product || '',
          hsn: it.hsn || '',
          unit: it.unit || it.uom || 'Nos',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate || it.unitPrice || it.price) || 0,
          discountPct: Number(it.discountPct || it.disc) || 0,
          gstRate: Number(it.gstRate || it.tax) || 0,
          sku: it.sku || '',
          drawingNo: it.drawingNo || '',
          material: it.material || '',
          delivery: it.delivery || '',
          amount: Number(it.amount) || 0
        }));
        setItems(loadedItems);
        setHeaderGstRateInit(loadedItems[0] ? Number(loadedItems[0].gstRate) || 18 : 18);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load document');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, toast]);

  const save = async ({ draft = false, stay = false, view = false } = {}) => {
    if (sourcePiConflict) {
      toast.error('This Proforma Invoice has already been converted to a Delivery Challan');
      return;
    }
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...SERIALIZERS.deliveryChallan(form, items) };
      if (draft) payload.status = 'Draft';
      // A challan converted from a Proforma Invoice is saved through that
      // conversion endpoint: the challan is created by the existing Delivery
      // Challan service AND the source Proforma Invoice is marked converted in
      // the same transaction, so a repeated Save (or a retry after a dropped
      // response) can never leave a second challan behind — the backend refuses
      // it and this form never reports success it did not get.
      // suppressGlobalError on the conversion save: a rejection (the Proforma
      // Invoice converted in another tab, validation, a server fault) must keep
      // the user on this form with their input and surface the reason, never
      // hand the page to the global error view.
      const res = isEdit
        ? await deliveryChallanService.update(id, payload)
        : prefillPiId
          ? await proformaInvoiceService.postAction(prefillPiId, 'delivery-challans', payload, { suppressGlobalError: true })
          : await deliveryChallanService.create(payload, draft);
      const created = res?.data ?? {};
      const no = created.dcNo || form.dcNo || '';
      // Files staged on create are uploaded only after the challan exists, so
      // nothing is ever stored without a parent document. A failed upload is
      // reported but does not undo the saved challan.
      if (!isEdit && created?.id && pendingFiles.length > 0) {
        const results = await deliveryChallanService.uploadMany(created.id, pendingFiles);
        const failed = results.filter((r) => !r.ok).length;
        const ok = results.length - failed;
        if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
        if (failed > 0) toast.error(`${failed} attachment(s) failed to upload`);
        setPendingFiles([]);
      }
      toast.success(isEdit ? `${no} updated` : `${no} ${draft ? 'saved as draft' : 'created'}`);
      if (stay) {
        // Save & Create New → reset the form and stay on the page (ERP saveAndNew)
        await resetForm();
      } else if (view && created.id) {
        // Save & Finish → open the saved document (ERP saveAndView)
        navigate(`/delivery-challans/${created.id}`);
      } else {
        navigate(navigateToList);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ERP DC totals: Sub Total = Σ taxable; CGST/SGST on taxable; Discount and
  // Charges are flat ₹ inputs; Grand Total = SubTotal + CGST + SGST − Discount
  // + Charges (never negative).
  const lines = (Array.isArray(items) ? items : []).filter((i) => !i || !i.rowType || i.rowType === 'item');
  const subTotal = round2(lines.reduce((sum, it) => sum + lineAmount(it).taxable, 0));
  const cgstTotal = round2(lines.reduce((sum, it) => sum + lineAmount(it).tax / 2, 0));
  const sgstTotal = round2(lines.reduce((sum, it) => sum + lineAmount(it).tax / 2, 0));
  const discountValue = Number(form.discountPct ?? 0);
  const chargesValue = Number(form.charges ?? 0);
  const grandTotal = round2(Math.max(0, subTotal + cgstTotal + sgstTotal - discountValue + chargesValue));
  const totalWords = numberToWordsINR(grandTotal);
  const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      {/* Convert to Delivery Challan: the source Proforma Invoice this form was
          opened from. Nothing is persisted until Save. */}
      {sourcePi && !sourcePiConflict && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <div className="text-xs">
            <p className="font-bold text-emerald-800">
              Converting from Proforma Invoice {sourcePi.piNo || sourcePi.id}
              {sourcePi.clientName ? ` — ${sourcePi.clientName}` : ''}
            </p>
            <p className="text-emerald-700 font-medium mt-0.5">
              Prefilled from the source document. Review quantities, transport and dispatch details, then Save — the
              Delivery Challan is created (and the Proforma Invoice marked converted) only when you save.
            </p>
          </div>
        </div>
      )}
      {sourcePiConflict && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <div className="text-xs">
            <p className="font-bold text-rose-800">Already converted</p>
            <p className="text-rose-700 font-medium mt-0.5">{sourcePiConflict}</p>
          </div>
        </div>
      )}
      {/* Historical revision notice: older versions of an edited document are
          immutable. The backend also rejects any mutation of a non-latest
          revision, so this banner is defence-in-depth for direct URL access. */}
      {historical && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-xs">
            <p className="font-bold text-amber-800">Historical revision — read-only</p>
            <p className="text-amber-700 font-medium mt-0.5">
              This version is preserved in history and can no longer be edited. Use View / Preview / Print / PDF to review it.
            </p>
          </div>
        </div>
      )}
      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>Sales</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Sales Execution</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Delivery Challans</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="text-slate-600">{isEdit ? 'Edit' : 'New'}</span>
      </div>

      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#0B4A3D]" />
            {isEdit ? 'Edit Delivery Challan' : 'Create Delivery Challan'}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500">*</span> are required
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(backToList)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to List
        </button>
      </div>

      {/* ===== TWO-COLUMN LAYOUT: ERP DC sections + totals sidebar ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 min-w-0 space-y-4">
          {/* ===== SECTION 1: DELIVERY CHALLAN ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={Truck} title="Delivery Challan" />
            <div className="p-5 space-y-4">
              {/* grid-2: DC Number + Customer Purchase Order */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {HEADER_FIELDS.map((field) => (
                  <FormField key={field.key} label={field.label} required={field.required}>
                    {field.type === 'soSelect' ? (
                      <SelectInput
                        value={form.soRef ?? ''}
                        onChange={(e) => loadFromSO(e.target.value)}
                      >
                        <option value="">Select CPO...</option>
                        {/* A reference carried over from the source Proforma
                            Invoice (its CPO/SO reference) is not one of the
                            open Sales Orders, so it is offered explicitly —
                            otherwise the select would render blank and the
                            source reference would look lost. */}
                        {form.soRef && !soOptions.some((o) => String(o.soNo ?? o.id) === String(form.soRef)) && (
                          <option value={form.soRef}>{cpoNo(form.soRef)} (source reference)</option>
                        )}
                        {soOptions.map((o) => (
                          <option key={o.id ?? o.soNo} value={o.soNo ?? o.id}>
                            {cpoNo(o.soNo ?? o.id)} - {o.clientName || o.client || ''}
                          </option>
                        ))}
                      </SelectInput>
                    ) : (
                      fieldControl(field, form[field.key], (value) => handleFieldChange(field, value), loadFromSO)
                    )}
                  </FormField>
                ))}
              </div>
              {/* grid-3: Date + SC Ref + Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {HEADER_ROW2.map((field) => (
                  <FormField key={field.key} label={field.label} required={field.required}>
                    {fieldControl(field, form[field.key], (value) => handleFieldChange(field, value))}
                  </FormField>
                ))}
              </div>
            </div>
          </div>

          {/* PARTY CARDS (ERP sc-info-grid): Client Details (minmax 650px/1fr) +
              Transport & Dispatch (320px), gap 20px */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
            {/* PARTY CARD: CLIENT DETAILS */}
            <div className="bg-surface border border-slate-200 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4 select-none">
                <Users className="w-4 h-4 text-[#0B4A3D]" /> Client Details
              </h4>
              <div className="space-y-3">
                <FormField label="Client" required hint="Type to search, or select an existing Client to auto-fill billing, shipping, contacts and addresses">
                  <ClientLookup
                    value={form.clientName}
                    onChange={(name) => setField('clientName', name)}
                    onAutoFill={handleClientSelect}
                    refreshKey={clientRefreshKey}
                    portal
                  />
                </FormField>
                <FormField label="Customer Name">
                  <TextInput
                    value={form.clientName ?? ''}
                    onChange={(e) => setField('clientName', e.target.value)}
                    placeholder="Customer name"
                    className={PARTY_INPUT_CLS}
                  />
                </FormField>
                <FormField label="Contact Person">
                  <TextInput
                    value={form.contactPerson ?? ''}
                    onChange={(e) => setField('contactPerson', e.target.value)}
                    placeholder="Contact person"
                    className={PARTY_INPUT_CLS}
                  />
                </FormField>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Email">
                    <TextInput
                      type="email"
                      value={form.email ?? ''}
                      onChange={(e) => setField('email', e.target.value)}
                      placeholder="Email"
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                  <FormField label="Phone">
                    <TextInput
                      value={form.phone ?? ''}
                      onChange={(e) => setField('phone', e.target.value)}
                      placeholder="Phone"
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                </div>
                <FormField label="Billing Address">
                  <TextArea
                    rows={2}
                    value={form.billingAddress ?? ''}
                    onChange={(e) => setField('billingAddress', e.target.value)}
                    placeholder="Billing address"
                    className={PARTY_TEXTAREA_CLS}
                  />
                </FormField>
                <FormField label="Shipping Address">
                  <TextArea
                    rows={2}
                    value={form.shippingAddress ?? ''}
                    onChange={(e) => setField('shippingAddress', e.target.value)}
                    placeholder="Shipping address"
                    className={PARTY_TEXTAREA_CLS}
                  />
                </FormField>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="City">
                    <TextInput
                      value={form.city ?? ''}
                      onChange={(e) => setField('city', e.target.value)}
                      placeholder="City"
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                  <FormField label="State">
                    <TextInput
                      value={form.state ?? ''}
                      onChange={(e) => setField('state', e.target.value)}
                      placeholder="State"
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[13px] font-medium text-[#0B4A3D] hover:underline mt-2 cursor-pointer bg-transparent border-none p-0 font-sans"
                  onClick={() => setCustomerModalOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5" /> Create New Customer
                </button>
              </div>
            </div>

            {/* PARTY CARD: TRANSPORT & DISPATCH */}
            <div className="bg-surface border border-slate-200 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4 select-none">
                <Truck className="w-4 h-4 text-[#0B4A3D]" /> Transport &amp; Dispatch
              </h4>
              <div className="space-y-3.5">
                <FormField label="Transport Company">
                  <SelectInput
                    value={form.transportCompany ?? ''}
                    onChange={(e) => setField('transportCompany', e.target.value)}
                    className={PARTY_INPUT_CLS}
                  >
                    <option value="">Select...</option>
                    {TRANSPORT_COMPANIES.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Vehicle Number">
                  <TextInput
                    value={form.vehicleNumber ?? ''}
                    onChange={(e) => setField('vehicleNumber', e.target.value)}
                    placeholder="e.g. MH-01-AB-1234"
                    className={PARTY_INPUT_CLS}
                  />
                </FormField>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Driver Name">
                    <TextInput
                      value={form.driverName ?? ''}
                      onChange={(e) => setField('driverName', e.target.value)}
                      placeholder="Driver name"
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                  <FormField label="Driver Phone">
                    <TextInput
                      value={form.driverPhone ?? ''}
                      onChange={(e) => setField('driverPhone', e.target.value)}
                      placeholder="Driver phone"
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                </div>
                <FormField label="LR Number">
                  <TextInput
                    value={form.lrNumber ?? ''}
                    onChange={(e) => setField('lrNumber', e.target.value)}
                    placeholder="LR number"
                    className={PARTY_INPUT_CLS}
                  />
                </FormField>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="E-Way Bill No">
                    <TextInput
                      value={form.ewayBill ?? ''}
                      onChange={(e) => setField('ewayBill', e.target.value)}
                      placeholder="E-way bill number"
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                  <FormField label="Dispatch Date">
                    <TextInput
                      type="date"
                      value={form.dispatchDate ?? ''}
                      onChange={(e) => setField('dispatchDate', e.target.value)}
                      className={PARTY_INPUT_CLS}
                    />
                  </FormField>
                </div>
                <FormField label="Expected Delivery">
                  <TextInput
                    type="date"
                    value={form.deliveryDate ?? ''}
                    onChange={(e) => setField('deliveryDate', e.target.value)}
                    className={PARTY_INPUT_CLS}
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* ===== SECTION 2: ITEMS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={List} title="Items" />
            <div className="p-4">
              <DeliveryChallanItemsGrid
                items={items}
                setItems={setItems}
                hsnView={form.hsnView}
                taxType={form.taxType}
                initialGstRate={headerGstRateInit}
                onHsnViewChange={(v) => setField('hsnView', v)}
                onTaxTypeChange={(v) => setField('taxType', v)}
              />
            </div>
          </div>

          {/* ===== SECTION 3: NOTES & TERMS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={StickyNote} title="Notes & Terms" />
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Notes">
                  <TextArea
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(e) => setField('notes', e.target.value)}
                    placeholder="Internal notes..."
                    className={INPUT_CLS}
                  />
                </FormField>
                <FormField label="Terms & Conditions">
                  <TextArea
                    rows={3}
                    value={form.terms ?? ''}
                    onChange={(e) => setField('terms', e.target.value)}
                    placeholder="Terms and conditions..."
                    className={INPUT_CLS}
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* ===== SECTION 4: ATTACHMENTS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={Paperclip} title="Attachments" subtitle="Files linked to this delivery challan" />
            <div className="p-5">
              {attachmentsLoading ? (
                <div className="flex items-center justify-center py-10 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading attachments...
                </div>
              ) : isEdit ? (
                <SalesAttachments
                  service={deliveryChallanService}
                  docId={id}
                  attachments={attachments}
                  onChanged={reloadAttachments}
                />
              ) : (
                <PendingAttachments files={pendingFiles} onChange={setPendingFiles} />
              )}
            </div>
          </div>
        </div>

        {/* ===== RIGHT SIDEBAR ===== */}
        <div className="min-w-0 space-y-4">
          {/* TOTALS — ERP DC: Sub Total, CGST, SGST, Discount (flat ₹), Charges
              (flat ₹), Grand Total, words */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="flex items-center gap-3 text-sm font-bold text-slate-900 mb-4">
              <span className="p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                <Info className="w-4 h-4" />
              </span>
              Totals
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">Sub Total</span>
                <span className="font-bold text-slate-800">{fmt(subTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">CGST</span>
                <span className="font-bold text-slate-800">{fmt(cgstTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">SGST</span>
                <span className="font-bold text-slate-800">{fmt(sgstTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-500">Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setField('discountPct', e.target.value)}
                  className="w-[100px] bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1 text-xs text-slate-700 text-right outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-500">Charges</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={chargesValue}
                  onChange={(e) => setField('charges', e.target.value)}
                  className="w-[100px] bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1 text-xs text-slate-700 text-right outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner"
                />
              </div>
              <div className="border-t-2 border-slate-200 my-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-900">Grand Total</span>
                <span className="font-bold text-slate-900">{fmt(grandTotal)}</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-1">{totalWords}</p>
            </div>
          </div>

          {/* LINKED DOCUMENTS */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="flex items-center gap-3 text-sm font-bold text-slate-900 mb-4">
              <span className="p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                <LinkIcon className="w-4 h-4" />
              </span>
              Linked Documents
            </h3>
            {form.soRef ? (
              <p className="text-xs text-slate-400 font-medium py-1">
                Linked to Customer Purchase Order: <span className="text-slate-600 font-semibold">{cpoNo(form.soRef)}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-400 font-medium py-1">No linked documents</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== STICKY FOOTER (ERP standard creation action bar) ===== */}
      <CreationActionBar
        showBackToList={false}
        onCancel={() => navigate(backToList)}
        onSaveDraft={!isEdit ? () => save({ draft: true }) : null}
        onSaveNew={!isEdit ? () => save({ stay: true }) : null}
        onSave={() => save({ view: true })}
        saveLabel={isEdit ? 'Update' : 'Save & Finish'}
        disabled={saving}
        locked={historical || Boolean(sourcePiConflict)}
      />

      <CreateCustomerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onCreated={handleClientCreated}
      />
    </div>
  );
}

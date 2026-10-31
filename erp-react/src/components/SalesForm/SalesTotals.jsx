import { computeTotals, round2 } from '../../utils/salesHelpers';
import { CURRENCY_SYMBOLS, formatAmountInWords } from '../../utils/quotationPrintUtils';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner text-right';

// Currency-aware amount formatting: EUR → €1,500.50, USD → $1,500.50,
// INR → ₹1,500.50 (Indian grouping), everything else falls back to the code.
function fmt(value, currency = 'INR') {
  const num = Number(value || 0).toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', {
    maximumFractionDigits: 2
  });
  const sym = CURRENCY_SYMBOLS[currency] || `${currency} `;
  const spacer = /[A-Za-z]/.test(sym) ? ' ' : '';
  return `${sym}${spacer}${num}`;
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
  return convert(n) + ' Rupees Only';
}

/**
 * Right-hand totals card. `discountPct` and `charges` are editable when not
 * read-only; all computed figures follow the original ERP math.
 *
 * - Default (ERP quotation): Sub Total, CGST, SGST, Discount %, Charges,
 *   Grand Total = sub − discount + cgst + sgst + charges (+ freight/insurance).
 * - `flatDiscount` (ERP DC): Discount becomes a flat ₹ input.
 * - `percentageDiscount` (ERP proforma-invoice-create.html): Sub Total,
 *   single GST row, Discount (%) input → Discount Amount display = SubTotal ×
 *   pct / 100, Additional Charges, Grand Total = SubTotal + GST − Discount
 *   Amount + Charges, plus amount-in-words.
 * - `creditNote` (ERP credit-note-create.html): Sub Total, Taxable Value,
 *   one GST row, Additional Charges, Grand Total. A Credit Note has NO discount
 *   INPUT (nothing user-editable), so a new note is discount-free and its
 *   Taxable Value equals the Sub Total. A LEGACY note that stored a genuine
 *   historical discount still shows it (read-only): the item-row and header
 *   discounts it was saved with keep reducing the taxable value, and the
 *   Discount row appears only when such a discount is really present.
 */
export default function SalesTotals({
  items = [],
  discountPct = 0,
  charges = 0,
  freight = 0,
  insurance = 0,
  onDiscountChange,
  onChargesChange,
  readOnly = false,
  showRoundOff = false,
  flatDiscount = false,
  percentageDiscount = false,
  creditNote = false,
  taxType = 'CGST + SGST',
  showWords = false,
  currency = 'INR',
  exportMode = false,
  taxTreatment = '',
  // Packing List logistics totals (replaces the monetary rows entirely):
  // Total Packages comes from the Package Details card; Total Quantity / Net
  // Weight / Gross Weight are computed from the line items when the rows carry
  // weights, falling back to the stored package-level value for Gross Weight.
  packingList = false,
  totalPackages = 0,
  packageGrossWeight = 0
}) {
  // Credit Note: there is no discount INPUT any more (the item rows have no
  // Discount % column and there is no header Discount % field), so nothing is
  // user-editable. A legacy note may nevertheless carry a genuine historical
  // discount on its rows / header: those values come from the saved record and
  // keep reducing its taxable value exactly as they were stored (see below).
  const t = computeTotals(items, {
    discountPct: flatDiscount || percentageDiscount || creditNote ? 0 : discountPct,
    charges: Number(charges || 0) + Number(freight || 0) + Number(insurance || 0),
    // Export invoices (foreign currency) keep exact decimals — no rupee rounding.
    roundOffEnabled: showRoundOff && !exportMode
  });

  const pct = Number(discountPct || 0);
  // ERP proforma: Discount Amount = SubTotal × Discount% / 100.
  const discAmt = percentageDiscount ? round2(Number(t.subTotal) * (pct / 100)) : 0;
  const flatDiscountValue = flatDiscount ? pct : 0;
  // Credit Note taxable value = Sub Total − the record's own historical
  // discounts (per-item sums + header %). Both are 0 for every new note (there
  // is no control to set them), so a discount-free note is unaffected.
  const cnLineDisc = creditNote
    ? round2((t.lines || []).reduce((sum, l) => sum + l.discount, 0))
    : 0;
  const cnHeaderDisc = creditNote ? round2(Number(t.subTotal) * (pct / 100)) : 0;
  const cnDiscount = round2(cnHeaderDisc + cnLineDisc);
  const cnTaxable = creditNote ? round2(Number(t.subTotal) - cnDiscount) : 0;
  const rawGrand = creditNote
    ? round2(cnTaxable + t.taxTotal + t.charges)
    : percentageDiscount
      ? round2(t.subTotal + t.taxTotal + t.charges - discAmt)
      : flatDiscount
        ? round2(t.subTotal + t.taxTotal + t.charges - flatDiscountValue)
        : Number(t.grandTotal) || 0;
  const grandTotal = rawGrand;

  // Show the minus glyph only when a real discount is applied — a zero
  // discount renders plain "₹0.00" (never "− ₹0.00").
  const sign = (v) => (Number(v) > 0 ? '− ' : '');

  // Packing List totals: pure logistics figures, no monetary rows at all.
  if (packingList) {
    const realItems = items.filter((it) => !it.rowType || it.rowType === 'item');
    const totalQty = realItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const netWeight = realItems.reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
    const grossFromItems = realItems.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);
    const grossWeight = grossFromItems > 0 ? grossFromItems : Number(packageGrossWeight || 0);
    const fmtNum = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
    const rows = [
      ['Total Packages', fmtNum(totalPackages)],
      ['Total Quantity', `${fmtNum(totalQty)} NOS`],
      ['Net Weight', `${fmtNum(netWeight)} KGS`],
      ['Gross Weight', `${fmtNum(grossWeight)} KGS`]
    ];
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-center justify-between px-3 py-1.5 text-xs ${
              i === rows.length - 1
                ? 'bg-[#0B4A3D] text-white'
                : 'border-b border-slate-100'
            }`}
          >
            <span className={i === rows.length - 1 ? 'font-bold' : 'text-slate-500 font-medium'}>
              {label}
            </span>
            <span className={i === rows.length - 1 ? 'font-extrabold text-sm' : 'font-bold text-slate-800'}>
              {value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  let baseRows;
  if (exportMode) {
    // Export Invoice totals: Sub Total, IGST (0 for LUT / Bond — supply without
    // payment of IGST), Discount, Additional Charges, Grand Total.
    const lutNoIgst = String(taxTreatment || '').toLowerCase().includes('lut');
    const igstValue = lutNoIgst ? 0 : t.taxTotal;
    baseRows = [
      ['Sub Total', fmt(t.subTotal, currency)],
      ['IGST', fmt(igstValue, currency)],
      ['Discount', `${sign(discAmt)}${fmt(discAmt, currency)}`],
      ['Additional Charges', fmt(t.charges, currency)]
    ];
  } else if (creditNote) {
    const isIgst = String(taxType || '').toLowerCase().includes('igst');
    baseRows = [
      ['Sub Total', fmt(t.subTotal, currency)],
      // Printed only for a record that really carries a historical discount —
      // a discount-free (i.e. every newly created) note shows no such row.
      ...(cnDiscount > 0
        ? [['Discount', `${sign(cnDiscount)}${fmt(cnDiscount, currency)}`]]
        : []),
      ['Taxable Value', fmt(cnTaxable, currency)],
      [isIgst ? 'GST (IGST)' : 'GST (CGST + SGST)', fmt(t.taxTotal, currency)],
      ['Additional Charges', fmt(t.charges, currency)]
    ];
  } else if (percentageDiscount) {
    // Export proforma under LUT / Bond — supply without payment of IGST, so
    // the GST row is 0 (the declaration banner on the form explains why).
    const lutNoIgst = String(taxTreatment || '').toLowerCase().includes('lut');
    const gstValue = lutNoIgst ? 0 : t.taxTotal;
    baseRows = [
      ['Sub Total', fmt(t.subTotal, currency)],
      ['GST', fmt(gstValue, currency)],
      ['Discount', `${sign(discAmt)}${fmt(discAmt, currency)}`],
      ['Discount Amount', fmt(discAmt, currency)],
      ['Additional Charges', fmt(t.charges, currency)]
    ];
  } else {
    baseRows = [
      ['Sub Total', fmt(t.subTotal, currency)],
      ['CGST', fmt(t.cgstTotal, currency)],
      ['SGST', fmt(t.sgstTotal, currency)],
      ['Charges', fmt(t.charges, currency)],
      ...(showRoundOff ? [['Round Off', fmt(t.roundOffAmount, currency)]] : [])
    ];
    if (flatDiscount) {
      baseRows.splice(1, 0, ['Discount', fmt(flatDiscountValue, currency)]);
    } else {
      baseRows.splice(1, 0, ['Discount', `${sign(t.discount)}${fmt(t.discount, currency)}`]);
    }
  }
  const rows = [...baseRows, ['Grand Total', fmt(grandTotal, currency)]];

  const discountLabel = percentageDiscount || exportMode ? 'Discount (%)' : flatDiscount ? 'Discount (₹)' : 'Discount %';

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className={`grid ${flatDiscount || percentageDiscount || creditNote ? 'grid-cols-1' : 'grid-cols-2'} gap-2.5`}>
          {/* A Credit Note has no discount input at all — only the Additional
              Charges field remains in this row for that variant. */}
          {!creditNote && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                {discountLabel}
              </label>
              <input
                type="number"
                min="0"
                max={percentageDiscount ? 100 : undefined}
                step={percentageDiscount ? '0.1' : '0.01'}
                value={discountPct ?? 0}
                onChange={(e) => onDiscountChange?.(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              {creditNote || percentageDiscount || exportMode
                ? `Additional Charges (${currency})`
                : `Charges (${currency})`}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={charges ?? 0}
              onChange={(e) => onChargesChange?.(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className={`flex items-center justify-between px-3 py-1.5 text-xs ${
              label === 'Grand Total'
                ? 'bg-[#0B4A3D] text-white'
                : 'border-b border-slate-100'
            }`}
          >
            <span className={label === 'Grand Total' ? 'font-bold' : 'text-slate-500 font-medium'}>
              {label}
            </span>
            {label === 'Discount' && flatDiscount ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountPct ?? 0}
                onChange={(e) => onDiscountChange?.(e.target.value)}
                className="w-28 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 text-xs text-right text-slate-700 outline-none focus:border-emerald-600/50"
              />
            ) : (
              <span className={label === 'Grand Total' ? 'font-extrabold text-sm' : 'font-bold text-slate-800'}>
                {value}
              </span>
            )}
          </div>
        ))}
      </div>

      {(showWords || percentageDiscount) && (
        <div className="text-[11px] text-slate-400 text-center pt-1">
          {exportMode || (percentageDiscount && currency && currency !== 'INR')
            ? formatAmountInWords(grandTotal, currency || 'INR', 'Standard')
            : numberToWordsINR(grandTotal)}
        </div>
      )}
    </div>
  );
}

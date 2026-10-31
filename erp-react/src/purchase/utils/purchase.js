/**
 * purchase/utils/purchase.js
 * ------------------------------------------------------------------
 * Purchase-domain math helpers: document totals (GST split CGST/SGST),
 * requisition normalisation, sequence numbering, amount formatting
 * and amount-in-words conversion.
 * ------------------------------------------------------------------
 */
import { PR_STATUS } from '../constants';
import { getCurrency } from '../../data/currencies';
import { convertFromBase } from '../services/exchangeRates';
import { getCurrencyPrefs, issueNextNumber, NUMBERING_DOC_KEY_BY_PREFIX } from '../services/settings';

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Formats a monetary value with the document's currency symbol.
 *
 * Honors the Currency Settings preferences (default currency, symbol
 * position, decimal places, thousands separator). Symbols come from
 * the ISO-4217 master (src/data/currencies.js); unknown codes fall
 * back to "CODE". Single-char / $-style symbols (₹, $, €, £, ¥, ₩, ₨)
 * attach directly to the number; longer symbols get a separating
 * space (e.g. "FCFA 1,234"). INR uses Indian digit grouping (en-IN);
 * other currencies use en-US.
 *
 * `prefs` may be passed explicitly (e.g. from the settings page for a
 * live preview); otherwise the persisted preferences are used.
 */
export function formatAmount(value, currency = '', prefs) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const p = prefs || getCurrencyPrefs();
  const code = currency || p.defaultCurrency || 'INR';
  const entry = getCurrency(code);
  const symbol = entry ? entry.symbol : code;
  const decimals = Math.max(0, Math.min(Number(p.decimalPlaces) || 2, 4));
  const locale = entry?.code === 'INR' ? 'en-IN' : 'en-US';
  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: p.thousandsSeparator !== false
  });
  const needsSpace = symbol.length > 1 && !/[.$€£₹¥₩₨]/.test(symbol);
  const sep = needsSpace ? ' ' : '';
  if (p.symbolPosition === 'after') return `${formatted}${sep}${symbol}`;
  if (p.symbolPosition === 'none') return formatted;
  return `${symbol}${sep}${formatted}`;
}

/**
 * Formats a stored INR amount in the display currency:
 * Display = INR ÷ exchange rate (see src/data/exchangeRates.js).
 * INR is the base currency (rate 1), so an INR value renders
 * identically to formatAmount — only non-INR currencies convert.
 * Currencies without a configured rate fall back to 1:1.
 */
export function formatAmountConverted(value, currency = '', prefs) {
  return formatAmount(convertFromBase(value, currency), currency, prefs);
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen'
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = n % 10 ? ` ${ONES[n % 10]}` : '';
  return `${tens}${ones}`;
}

/** Converts an amount to Indian English words (Crore / Lakh / Thousand). */
export function numberToWords(value) {
  const num = Math.floor(Number(value) || 0);
  if (num === 0) return 'Zero Rupees Only';
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const rest = num % 100;
  const parts = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return `${parts.join(' ')} Rupees Only`;
}

/** Major / minor unit names for foreign-currency amount-in-words. */
const CURRENCY_WORDS = {
  USD: { major: 'Dollars', minor: 'Cents', decimals: 2 },
  EUR: { major: 'Euros', minor: 'Cents', decimals: 2 },
  GBP: { major: 'Pounds', minor: 'Pence', decimals: 2 },
  AED: { major: 'Dirhams', minor: 'Fils', decimals: 2 },
  JPY: { major: 'Yen', minor: '', decimals: 0 },
  AUD: { major: 'Dollars', minor: 'Cents', decimals: 2 },
  CAD: { major: 'Dollars', minor: 'Cents', decimals: 2 },
  SGD: { major: 'Dollars', minor: 'Cents', decimals: 2 },
  CHF: { major: 'Francs', minor: 'Centimes', decimals: 2 },
  CNY: { major: 'Yuan', minor: 'Fen', decimals: 2 },
  SAR: { major: 'Riyals', minor: 'Halalas', decimals: 2 },
  QAR: { major: 'Riyals', minor: 'Dirhams', decimals: 2 },
  KWD: { major: 'Dinars', minor: 'Fils', decimals: 3 },
  BHD: { major: 'Dinars', minor: 'Fils', decimals: 3 }
};

const MAGNITUDE_GROUPS = [
  { value: 1000000000, word: 'Billion' },
  { value: 1000000, word: 'Million' },
  { value: 1000, word: 'Thousand' },
  { value: 100, word: 'Hundred' }
];

/** Western 3-digit grouping integer → English words. */
function westernWords(n) {
  const num = Math.floor(Number(n) || 0);
  if (num === 0) return 'Zero';
  let remaining = num;
  const parts = [];
  MAGNITUDE_GROUPS.forEach(({ value, word }) => {
    if (remaining >= value) {
      const count = Math.floor(remaining / value);
      parts.push(`${count >= 100 ? westernWords(count) : twoDigits(count)} ${word}`);
      remaining %= value;
    }
  });
  if (remaining) parts.push(twoDigits(remaining));
  return parts.join(' ');
}

/**
 * Amount-in-words for a stored INR value in the display currency.
 *
 * INR (the base currency) keeps the existing Indian style
 * ("… Rupees Only"). Non-INR currencies are converted via the
 * exchange-rate master first, then spelled out with the currency's
 * major / minor unit names — e.g. 15000 INR @ 86.25 →
 * "One Hundred Seventy-Three Dollars and 91 Cents". Currencies
 * without an entry fall back to their ISO name (no minor part).
 */
export function formatAmountInWords(value, currency = '') {
  const code = String(currency || 'INR').toUpperCase();
  if (code === 'INR') return numberToWords(value);

  const spec = CURRENCY_WORDS[code] || (() => {
    /* Unlisted codes (no exchange rate configured): spell out the ISO
       name, naive-pluralized for readability. */
    const name = getCurrency(code)?.name || code;
    return {
      major: /s$/i.test(name) ? name : `${name}s`,
      minor: '',
      decimals: 2
    };
  })();

  const raw = Number(value) || 0;
  const negative = raw < 0;
  const converted = convertFromBase(Math.abs(raw), code);
  const decimals = Math.max(0, Number(spec.decimals) || 0);
  const factor = 10 ** decimals;
  let major = Math.floor(converted);
  let minor = Math.round((converted - major) * factor);
  if (minor >= factor) {
    major += 1;
    minor = 0;
  }

  const majorWords = westernWords(major);
  const prefix = negative ? 'Minus ' : '';
  if (!spec.minor || decimals === 0 || minor === 0) {
    return `${prefix}${majorWords} ${spec.major}`;
  }
  return `${prefix}${majorWords} ${spec.major} and ${String(minor).padStart(decimals, '0')} ${spec.minor}`;
}

/**
 * Resolves the GST treatment for a document from its GST Type label.
 *
 * Returns one of:
 *   'inter'   — Inter-State (IGST): full rate charged as IGST only
 *   'none'    — Nil Rated / Exempt / Composite: no output GST is charged
 *   'intra'   — everything else (incl. empty): CGST/SGST 50/50 split
 *
 * Composite follows the project's existing rule: the GST_TYPES master
 * (constants) lists Composite but defines no alternate calculation, and
 * under the GST composition scheme a registered dealer cannot charge
 * GST to the customer — so Composite renders zero output tax, exactly
 * like Nil Rated / Exempt.
 */
export function gstTaxMode(gstType) {
  const type = String(gstType || '');
  if (type.includes('Inter-State')) return 'inter';
  if (/Nil Rated|Exempt|Composite/.test(type)) return 'none';
  return 'intra';
}

/**
 * Computes line + document totals for a requisition / PO.
 *
 * GST is applied per line at that line's own `gstRate` (never a global
 * 18%), and the `gstType` drives the tax split:
 *   - Inter-State (IGST)  → IGST only, CGST/SGST forced to 0
 *   - Nil Rated / Exempt / Composite → no output tax (all components 0)
 *   - otherwise            → CGST/SGST 50/50 split (legacy default, also
 *                            used by RFQ / PO / invoice documents that
 *                            carry items but no GST type)
 *
 * Document-level discount is applied proportionally across lines;
 * per-line discount reduces that line's taxable value first; charges
 * are NON-TAXABLE and added to the grand total without any GST. All
 * derived values (including `roundOff`) are computed fresh on every
 * call, so switching GST mode can never leave stale amounts behind.
 */
export function calcDocumentTotals(items = [], discount = 0, charges = 0, gstType = '') {
  const discountRate = Number(discount) || 0;
  const chargesTotal = Number(charges) || 0;
  const mode = gstTaxMode(gstType);
  const rawLines = items.map((item) => {
    const lineAmount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
    const lineDiscountRate = Number(item.discount) || 0;
    const discounted = lineAmount * (1 - Math.min(lineDiscountRate, 100) / 100);
    return {
      amount: lineAmount,
      lineDiscountRate,
      lineDiscountAmount: round2(lineAmount - discounted),
      base: discounted,
      gstRate: Number(item.gstRate) || 0
    };
  });
  const subtotal = round2(rawLines.reduce((sum, line) => sum + line.amount, 0));
  const lineDiscountAmount = round2(rawLines.reduce((sum, line) => sum + line.lineDiscountAmount, 0));
  const discountedSubtotal = round2(subtotal - lineDiscountAmount);
  const discountAmount = round2(discountedSubtotal * (discountRate / 100));
  const factor = discountedSubtotal > 0 ? 1 - discountRate / 100 : 1;

  const lines = rawLines.map((line) => {
    const taxable = round2(line.base * factor);
    const rate = line.gstRate;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (mode === 'inter') {
      igst = round2((taxable * rate) / 100);
    } else if (mode === 'intra') {
      cgst = round2((taxable * (rate / 2)) / 100);
      sgst = round2((taxable * (rate / 2)) / 100);
    }
    /* mode 'none' leaves every component at 0. */
    return {
      ...line,
      taxable,
      cgst,
      sgst,
      igst,
      total: round2(taxable + cgst + sgst + igst)
    };
  });

  const taxable = round2(discountedSubtotal - discountAmount);
  const cgst = round2(lines.reduce((sum, line) => sum + line.cgst, 0));
  const sgst = round2(lines.reduce((sum, line) => sum + line.sgst, 0));
  const igst = round2(lines.reduce((sum, line) => sum + line.igst, 0));
  const gstTotal = round2(cgst + sgst + igst);
  const total = round2(taxable + gstTotal + chargesTotal);
  const roundedTotal = Math.round(total);
  const roundOff = round2(roundedTotal - total);

  return {
    lines,
    subtotal,
    discountAmount,
    lineDiscountAmount,
    taxable,
    cgst,
    sgst,
    igst,
    gstTotal,
    charges: chargesTotal,
    total,
    roundOff,
    roundedTotal,
    inWords: numberToWords(roundedTotal)
  };
}

/** Normalises a raw requisition record with computed totals + defaults. */
export function normalizePurchaseRequest(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const discount = Number(raw.discount) || 0;
  const charges = Number(raw.charges) || 0;
  /* Totals must reflect the document's GST type (IGST / CGST+SGST /
     Nil / Exempt / Composite) so stored values are never stale. */
  const totals = calcDocumentTotals(items, discount, charges, raw.gstType);
  return {
    ...raw,
    items,
    discount,
    charges,
    amount: Number(raw.amount) || totals.total,
    totals,
    status: raw.status || PR_STATUS.DRAFT,
    approvalStatus: raw.approvalStatus || 'Pending',
    recordState: raw.recordState || 'active',
    activity: Array.isArray(raw.activity) ? raw.activity : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    comments: Array.isArray(raw.comments) ? raw.comments : []
  };
}

/**
 * Builds the next PR number based on existing records.
 *
 * The format is driven by the configured Document Numbering section:
 * prefix, padding and the stored counter all come from Settings
 * (falling back to the legacy PR-YYYY-NNNN format when unconfigured).
 */
export function nextPRNo(records = []) {
  return nextSeqNo(records, 'PR', 'prNo', 4200, 4);
}

/** Builds the next Vendor Code (V-NNNN) based on existing records. */
export function nextVendorCode(records = []) {
  const nums = records
    .map((record) => {
      const match = /^V-(\d+)$/.exec(String(record.id || ''));
      return match ? Number(match[1]) : NaN;
    })
    .filter((num) => Number.isFinite(num));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `V-${String(next).padStart(4, '0')}`;
}

/**
 * Builds the next sequence number for a prefixed document (PO/RFQ/INV).
 *
 * When the Settings → Document Numbering section defines a sequence for
 * the document type (matched through NUMBERING_DOC_KEY_BY_PREFIX), the
 * central numbering engine computes the next number from the configured
 * prefix, FY, starting/current counter and padding, guards it against
 * the persistent issued-ledger (duplicate prevention) and existing
 * records, and writes the counter back. Unconfigured document types
 * keep the legacy call-site defaults.
 */
export function nextSeqNo(records = [], prefix = 'PO', field = 'poNo', start = 1, pad = 4) {
  const year = new Date().getFullYear();
  const docKey = NUMBERING_DOC_KEY_BY_PREFIX[prefix];
  if (docKey) {
    const existing = records.map((r) => String(r[field] || '')).filter(Boolean);
    return issueNextNumber(docKey, existing).number;
  }
  const nums = records
    .map((record) => Number(String(record[field] || '').split('-').pop()))
    .filter((num) => Number.isFinite(num));
  const next = (nums.length ? Math.max(...nums) : start) + 1;
  return `${prefix}-${year}-${String(next).padStart(pad, '0')}`;
}

// =====================================================================
// New Quotation page — Number & Currency Format + Customize Columns &
// Formulas. New feature (does not exist in the original ERP).
// Lives only in erp-react.
// =====================================================================

// ---------------------------------------------------------------------
// Number & currency settings
// ---------------------------------------------------------------------

// Sample used for the "Change Number Systems" radio previews.
export const SAMPLE_NUMBER = 12345679;

// Radio options for "Change Number Systems" (labels per design spec).
export const NUMBER_SYSTEM_OPTIONS = [
  { value: 'India', title: 'India – English', tag: 'Lakhs', locale: 'en-IN' },
  { value: 'US', title: 'United States – English', tag: 'Millions', locale: 'en-US' },
  { value: 'Other', title: 'Other – English', tag: 'English', locale: 'en-US' }
];

// Country dropdown shown when "Other – English" is selected.
export const COUNTRIES = [
  { value: 'US', label: 'United States', locale: 'en-US' },
  { value: 'UK', label: 'United Kingdom', locale: 'en-GB' },
  { value: 'AU', label: 'Australia', locale: 'en-AU' },
  { value: 'CA', label: 'Canada', locale: 'en-CA' },
  { value: 'SG', label: 'Singapore', locale: 'en-SG' },
  { value: 'NZ', label: 'New Zealand', locale: 'en-NZ' },
  { value: 'ZA', label: 'South Africa', locale: 'en-ZA' },
  { value: 'IE', label: 'Ireland', locale: 'en-IE' },
  { value: 'IN', label: 'India', locale: 'en-IN' }
];

// "Select Decimal Digits" options (labels exactly per spec).
export const DECIMAL_DIGIT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: '0', label: '99' },
  { value: '1', label: '99.0' },
  { value: '2', label: '99.00' },
  { value: '3', label: '99.000' },
  { value: '4', label: '99.0000' }
];

export const DEFAULT_NUMBER_SETTINGS = {
  numberSystem: 'India',
  country: 'US',
  decimalDigits: '2',
  roundOffQty: false,
  roundOffRate: false,
  customCurrencySymbol: ''
};

const NUMBER_SETTINGS_KEY = 'qtn_number_format_settings';
const COLUMN_CONFIG_KEY = 'qtn_column_config';

// Legacy settings (from the first version of this feature) migration map.
const LEGACY_SYSTEM_MAP = { Indian: 'India', US: 'US', UK: 'Other', European: 'Other', UAE: 'Other' };
const LEGACY_COUNTRY_MAP = { UK: 'UK', European: 'DE', UAE: 'AE', US: 'US' };

export function loadNumberSettings() {
  try {
    const raw = localStorage.getItem(NUMBER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_NUMBER_SETTINGS, ...parsed };
      if (parsed.numberSystem && LEGACY_SYSTEM_MAP[parsed.numberSystem]) {
        merged.numberSystem = LEGACY_SYSTEM_MAP[parsed.numberSystem];
      }
      if (parsed.country && LEGACY_COUNTRY_MAP[parsed.country]) {
        merged.country = LEGACY_COUNTRY_MAP[parsed.country];
      }
      if (parsed.decimalPrecision != null && merged.decimalDigits === DEFAULT_NUMBER_SETTINGS.decimalDigits) {
        merged.decimalDigits = String(parsed.decimalPrecision);
      }
      if (parsed.currencySymbol && !merged.customCurrencySymbol) {
        merged.customCurrencySymbol = parsed.currencySymbol;
      }
      return merged;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_NUMBER_SETTINGS };
}

export function saveNumberSettings(settings) {
  try {
    localStorage.setItem(NUMBER_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** Numeric precision derived from the "Select Decimal Digits" setting (Default → 2). */
export function effectivePrecision(settings) {
  const d = settings?.decimalDigits ?? '2';
  return d === 'default' ? 2 : Number(d) || 2;
}

/** Effective currency symbol — a custom symbol overrides the default ₹. */
export function effectiveCurrencySymbol(settings) {
  const custom = String(settings?.customCurrencySymbol || '').trim();
  return custom || settings?.currencySymbol || '₹';
}

/** Locale for the selected number system (Other → country locale). */
export function getNumberSystemLocale(settings) {
  if (!settings) return 'en-IN';
  if (settings.numberSystem === 'India') return 'en-IN';
  if (settings.numberSystem === 'US') return 'en-US';
  const country =
    COUNTRIES.find((c) => c.value === settings.country) ||
    COUNTRIES.find((c) => c.label === settings.country);
  return country ? country.locale : 'en-US';
}

// ---------------------------------------------------------------------
// Column configuration model
// ---------------------------------------------------------------------

export const DEFAULT_COLUMNS = [
  { key: 'index', label: '#', type: 'index', width: 50, visible: true, locked: true },
  { key: 'description', label: 'Item Description', type: 'text', width: 320, visible: true, locked: false },
  { key: 'sku', label: 'SKU', type: 'text', width: 130, visible: true, locked: false },
  { key: 'hsn', label: 'HSN/SAC', type: 'text', width: 110, visible: true, locked: false },
  { key: 'gstRate', label: 'GST%', type: 'number', width: 80, visible: true, locked: false },
  { key: 'unit', label: 'UOM', type: 'text', width: 110, visible: true, locked: false },
  { key: 'qty', label: 'Qty', type: 'number', width: 90, visible: true, locked: false },
  { key: 'rate', label: 'Rate', type: 'number', width: 120, visible: true, locked: false },
  { key: 'discountPct', label: 'Disc%', type: 'number', width: 80, visible: true, locked: false },
  { key: 'amount', label: 'Amount', type: 'computed', width: 120, visible: true, locked: false },
  { key: 'cgst', label: 'CGST', type: 'computed', width: 100, visible: true, locked: false },
  { key: 'sgst', label: 'SGST', type: 'computed', width: 100, visible: true, locked: false },
  { key: 'total', label: 'Total', type: 'computed', width: 130, visible: true, locked: false },
  { key: 'actions', label: 'Actions', type: 'actions', width: 140, visible: true, locked: true }
];

// system columns that cannot be renamed or deleted
const SYSTEM_KEYS = new Set(['index', 'actions']);

export function loadColumnConfig() {
  try {
    const raw = localStorage.getItem(COLUMN_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_COLUMNS.map((c) => ({ ...c }));
}

export function saveColumnConfig(columns) {
  try {
    localStorage.setItem(COLUMN_CONFIG_KEY, JSON.stringify(columns));
    return true;
  } catch {
    return false;
  }
}

export function isSystemColumn(key) {
  return SYSTEM_KEYS.has(key);
}

// ---------------------------------------------------------------------
// Safe formula evaluator (arithmetic + named variables, no eval)
// Supported: + - * / ( ) and variable names from the whitelist.
// ---------------------------------------------------------------------

const FORMULA_VARS = ['qty', 'rate', 'discountPct', 'gstRate', 'grossAmt', 'discAmt', 'netAmt', 'cgst', 'sgst', 'total'];

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') {
      i += 1;
    } else if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < n && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i += 1;
      }
      const val = parseFloat(num);
      if (Number.isNaN(val)) return null;
      tokens.push({ type: 'num', value: val });
    } else if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < n && /[a-zA-Z0-9_]/.test(expr[i])) {
        id += expr[i];
        i += 1;
      }
      if (!FORMULA_VARS.includes(id)) return null;
      tokens.push({ type: 'var', value: id });
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push({ type: ch, value: ch });
      i += 1;
    } else {
      return null;
    }
  }
  return tokens;
}

const BAD = Symbol('bad-formula');

function evaluateTokens(tokens, vars) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const parseExpr = () => {
    let left = parseTerm();
    if (left === BAD) return BAD;
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      const right = parseTerm();
      if (right === BAD) return BAD;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const parseTerm = () => {
    let left = parseFactor();
    if (left === BAD) return BAD;
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = next().type;
      const right = parseFactor();
      if (right === BAD) return BAD;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const parseFactor = () => {
    const t = next();
    if (!t) return BAD; // trailing operator / missing operand
    if (t.type === 'num') return t.value;
    if (t.type === 'var') {
      const v = vars[t.value];
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
    if (t.type === '(') {
      const inner = parseExpr();
      if (inner === BAD) return BAD;
      if (peek() && peek().type === ')') next();
      else return BAD; // unbalanced parenthesis
      return inner;
    }
    if (t.type === '-') {
      const inner = parseFactor();
      return inner === BAD ? BAD : -inner;
    }
    if (t.type === '+') return parseFactor();
    return BAD; // unexpected token (e.g. two operators in a row)
  };

  try {
    const result = parseExpr();
    if (result === BAD || peek()) return null; // leftover tokens = invalid
    return result;
  } catch {
    return null;
  }
}

/**
 * Evaluate a formula like "qty * rate" or "(rate - 5) * 1.18" against row vars.
 * Returns null when the expression is invalid.
 */
export function evaluateFormula(formula, rowVars = {}) {
  if (!formula || typeof formula !== 'string') return null;
  const tokens = tokenize(formula.trim());
  if (!tokens || tokens.length === 0) return null;
  const result = evaluateTokens(tokens, rowVars);
  return typeof result === 'number' && Number.isFinite(result) ? result : null;
}

// ---------------------------------------------------------------------
// Formatting helpers (respect number settings)
// ---------------------------------------------------------------------

/** Plain value string for in-grid computed cells (precision only, no grouping, no symbol). */
export function formatCellValue(value, settings) {
  const n = Number(value) || 0;
  const precision = effectivePrecision(settings);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: false
  });
}

/** Money string for totals with currency symbol + grouping + precision. */
export function formatMoney(value, settings) {
  const n = Number(value) || 0;
  const precision = effectivePrecision(settings);
  const locale = getNumberSystemLocale(settings);
  const symbol = effectiveCurrencySymbol(settings);
  return `${symbol}${n.toLocaleString(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  })}`;
}

/** Sample number used by the "Change Number Systems" radio previews (no decimals). */
export function formatSampleNumber(system, settings) {
  const symbol = effectiveCurrencySymbol(settings);
  const locale = system.locale;
  return `${symbol}${SAMPLE_NUMBER.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
}

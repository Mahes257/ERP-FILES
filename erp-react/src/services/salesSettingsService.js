/**
 * salesSettingsService.js
 * ------------------------------------------------------------------
 * Centralized Sales Settings. Every Sales module (and the Settings page)
 * reads its configurable defaults from here — document generation, forms,
 * approvals, numbering and display.
 *
 * Architecture (the same one Marketing & Production settings use):
 *   SalesSettingsService → /settings/sales → app_settings (sales_settings)
 *                                            + settings_audit_log trail
 *
 * The backend stores the whole document as JSON, so a new settings section is
 * a frontend-only change and the configuration is shared across devices and
 * users instead of living in the browser. Reads are open to authenticated
 * users; the PUT is ADMIN-only (SETTINGS_MANAGE) and surfaces a clear error.
 *
 * API surface: async getSettings()/updateSettings()/resetSettings() for
 * reads and writes, plus the synchronous cache readers (get, getSection,
 * getSettingsSync, getConfigHealth) the settings page renders from.
 * ------------------------------------------------------------------
 */

import api from '../api/axiosInstance';

/* ===== DEFAULT VALUES ===== */
function getDefaultSettings() {
  return {
    // A. General
    general: {
      defaultSalesExecutive: '',
      defaultCurrency: 'INR',
      defaultPaymentTerms: '30 Days',
      defaultDeliveryTerms: 'Ex-Works',
      defaultTaxType: 'GST',
      defaultCountry: 'India',
      defaultState: 'Maharashtra',
      defaultNumberFormat: 'Indian',
      defaultSalesStatus: 'Draft',
      defaultPriority: 'Medium',
      defaultValidityDays: 30,
      defaultDiscountPolicy: 'Discounts above 10% require manager approval'
    },

    // B. Approval & Workflow
    approval: {
      quotationApproval: true,
      salesContractApproval: true,
      salesOrderApproval: false,
      creditNoteApproval: true,
      levels: [
        { level: 1, role: 'Sales Manager', minAmount: 0, maxAmount: 100000, days: 2, enabled: true },
        { level: 2, role: 'Sales Director', minAmount: 100001, maxAmount: 500000, days: 3, enabled: true },
        { level: 3, role: 'Finance Controller', minAmount: 500001, maxAmount: 0, days: 4, enabled: true }
      ]
    },

    // C. Tax Settings
    taxSettings: {
      taxType: 'GST',
      taxRates: [
        { rate: 0, label: 'Exempt', cgst: 0, sgst: 0, active: true },
        { rate: 5, label: 'Essential Goods', cgst: 2.5, sgst: 2.5, active: true },
        { rate: 12, label: 'Standard', cgst: 6, sgst: 6, active: true },
        { rate: 18, label: 'Standard (Default)', cgst: 9, sgst: 9, active: true, default: true },
        { rate: 28, label: 'Luxury', cgst: 14, sgst: 14, active: true }
      ],
      igstEnabled: true,
      igstRate: 18,
      vatEnabled: false,
      vatRate: 0
    },

    // D. Currency & Number Settings
    currencySettings: {
      displayCurrency: 'INR',
      customCurrencySymbol: '',
      decimalDigits: 2,
      numberSystem: 'Indian',
      country: 'India',
      quantityRounding: 2,
      rateRounding: 4,
      decimalPrecision: 2,
      symbolPosition: 'before',
      thousandSeparator: true,
      enabledCurrencies: ['INR', 'USD', 'EUR', 'GBP', 'AED'],
      autoSyncEnabled: true,
      syncFrequency: 'daily'
    },

    // D2. Exchange Rates (system-managed, not user-edited)
    exchangeRates: {
      baseCurrency: 'INR',
      lastSyncAt: null,
      syncStatus: 'idle',
      rates: [],
      provider: ''
    },

    // E. Payment Terms
    paymentTerms: [
      { name: 'Advance', days: 0, active: true, default: false },
      { name: 'COD', days: 0, active: true, default: false },
      { name: '7 Days', days: 7, active: true, default: false },
      { name: '15 Days', days: 15, active: true, default: false },
      { name: '30 Days', days: 30, active: true, default: true },
      { name: '45 Days', days: 45, active: true, default: false },
      { name: '60 Days', days: 60, active: true, default: false },
      { name: '90 Days', days: 90, active: true, default: false }
    ],

    // F. Delivery & Logistics
    deliveryTerms: [
      { name: 'Ex-Works', active: true, default: true },
      { name: 'FOB', active: true, default: false },
      { name: 'CIF', active: true, default: false },
      { name: 'CFR', active: true, default: false },
      { name: 'FOR', active: true, default: false },
      { name: 'Door Delivery', active: true, default: false },
      { name: 'Freight Paid', active: true, default: false },
      { name: 'Freight To Pay', active: true, default: false }
    ],
    transportCompanies: [
      { name: 'Blue Dart', active: true },
      { name: 'DTDC', active: true },
      { name: 'VRL Logistics', active: true },
      { name: 'Gati', active: true }
    ],

    // G. Document Numbering (FY-aware, matches Purchase numbering pattern)
    documentNumbering: {
      Quotation: { prefix: 'QTN', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      SalesContract: { prefix: 'SC', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      SalesOrder: { prefix: 'SO', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      ProformaInvoice: { prefix: 'PI', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      DeliveryChallan: { prefix: 'DC', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      Invoice: { prefix: 'INV', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      CreditNote: { prefix: 'CN', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      PaymentReceipt: { prefix: 'PR', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 }
    },

    // H. PDF & Document Defaults
    documentDefaults: {
      showHSN: true,
      showHSNSummary: true,
      showTaxSummary: true,
      showTotal: true,
      showSerialNumber: true,
      showBatch: false,
      showUnit: true,
      showDescription: true,
      showImages: false,
      showThumbnails: false,
      termsAndConditions: 'Payment is due as per agreed terms. Goods once sold will not be returned. Subject to local jurisdiction.',
      footer: 'Thank you for your business!',
      notes: '',
      signature: false,
      signatureLabel: 'Authorized Signatory',
      showCompanyLogo: true,
      showGstin: true,
      showBankDetails: true,
      bankName: '',
      bankAccount: '',
      bankIFSC: '',
      bankBranch: ''
    },

    // I. Notifications
    notifications: {
      quotationPendingApproval: true,
      quotationExpiring: true,
      quotationAccepted: true,
      salesContractPendingApproval: true,
      salesOrderPendingApproval: false,
      invoiceOverdue: true,
      paymentReceived: true,
      creditNotePendingApproval: true,
      emailNotifications: false,
      browserNotifications: true
    },

    // J. Sales Masters
    masters: {
      salesExecutives: [
        { name: 'Rajesh Kumar', active: true },
        { name: 'Priya Sharma', active: true },
        { name: 'Amit Patel', active: true }
      ],
      paymentModes: [
        { name: 'Cash', active: true },
        { name: 'Cheque', active: true },
        { name: 'NEFT/RTGS', active: true },
        { name: 'UPI', active: true },
        { name: 'Credit Card', active: true },
        { name: 'Demand Draft', active: true }
      ],
      creditNoteReasons: [
        { name: 'Quality Issue', active: true },
        { name: 'Overcharge', active: true },
        { name: 'Return', active: true },
        { name: 'Discount', active: true },
        { name: 'Other', active: true }
      ],
      warrantyPeriods: [
        { name: 'No Warranty', months: 0, active: true },
        { name: '6 Months', months: 6, active: true },
        { name: '1 Year', months: 12, active: true, default: true },
        { name: '2 Years', months: 24, active: true },
        { name: '3 Years', months: 36, active: true }
      ],
      contractDurations: [
        { name: '3 Months', months: 3, active: true },
        { name: '6 Months', months: 6, active: true },
        { name: '1 Year', months: 12, active: true, default: true },
        { name: '2 Years', months: 24, active: true },
        { name: '3 Years', months: 36, active: true },
        { name: '5 Years', months: 60, active: true }
      ]
    },

    // K. Company (Sales-specific preferences)
    companyPreferences: {
      showCompanyHeader: true,
      showGSTIN: true,
      showPAN: true,
      defaultBankAccount: '',
      invoiceFooter: '',
      letterheadEnabled: false
    }
  };
}

/* ===== CACHE ===== */

/**
 * Last backend document merged over the defaults. `null` until the first
 * fetch completes — every synchronous reader then answers from the defaults,
 * so the page always renders something while the request is in flight.
 */
let _cache = null;

function loadSettings() {
  return _cache || getDefaultSettings();
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/* ===== SERVICE API ===== */
let _listeners = new Set();
let _inflightGet = null;   // single-flight GET — concurrent callers share one request
let _getPromise = null;    // resolved promise memo (micro-cache for rapid re-mounts)

const salesSettingsService = {
  /**
   * Synchronous read of the current settings: the last-fetched cache, or the
   * built-in defaults before the first fetch completes. Never triggers a
   * request — pair with getSettings() to populate the cache.
   */
  getSettingsSync() {
    return loadSettings();
  },

  /** Fetch the settings document from the backend. */
  async getSettings() {
    if (_getPromise) return _getPromise;
    _inflightGet = (async () => {
      try {
        const { data } = await api.get('/settings/sales');
        _cache = deepMerge(getDefaultSettings(), data?.data || {});
        _listeners.forEach((fn) => fn(_cache));
        return _cache;
      } finally {
        _getPromise = null;
      }
    })();
    _getPromise = _inflightGet;
    return _inflightGet;
  },

  /** Get a specific section */
  getSection(section) {
    return loadSettings()[section] || {};
  },

  /** Get a specific setting value */
  get(path) {
    const parts = path.split('.');
    let val = loadSettings();
    for (const p of parts) {
      val = val?.[p];
    }
    return val;
  },

  /** Update entire settings (persisted backend-side, ADMIN only). */
  async updateSettings(partial) {
    const current = deepMerge(loadSettings(), partial);
    const { data } = await api.put('/settings/sales', current);
    const updated = deepMerge(getDefaultSettings(), data?.data || current);
    _cache = updated;
    _listeners.forEach((fn) => fn(updated));
    return updated;
  },

  /** Update a specific section */
  updateSection(section, data) {
    const current = loadSettings();
    current[section] = typeof data === 'object' && !Array.isArray(data)
      ? { ...current[section], ...data }
      : data;
    return this.updateSettings(current);
  },

  /** Update a single nested setting */
  updateSetting(path, value) {
    const parts = path.split('.');
    const current = loadSettings();
    let obj = current;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    return this.updateSettings(current);
  },

  /**
   * Reset every Sales setting to its factory default (persisted backend-side).
   *
   * Document-number SEQUENCE COUNTERS are deliberately preserved: the reset
   * restores configuration, never business data. Zeroing a counter could make
   * the next generated document reuse a number that already exists, so
   * `preserveNumberingCounters` defaults to true and only the counters are
   * carried over from the current document (prefixes/padding still reset).
   */
  async resetSettings(options = {}) {
    const { preserveNumberingCounters = true } = options;
    const defaults = getDefaultSettings();
    if (preserveNumberingCounters) {
      const current = loadSettings();
      const currentNumbering = current?.documentNumbering || {};
      for (const [key, cfg] of Object.entries(currentNumbering)) {
        if (cfg && typeof cfg === 'object' && cfg.currentNo != null) {
          // Only the sequence counter is carried over — the prefix, financial
          // year and padding must still fall back to their factory defaults.
          const base = defaults.documentNumbering[key] || { ...cfg };
          defaults.documentNumbering[key] = { ...base, currentNo: cfg.currentNo };
        }
      }
    }
    const { data } = await api.put('/settings/sales', defaults);
    const updated = deepMerge(getDefaultSettings(), data?.data || defaults);
    _cache = updated;
    _listeners.forEach((fn) => fn(updated));
    return updated;
  },

  /** Reset a specific section */
  resetSection(section) {
    const defaults = getDefaultSettings();
    const current = loadSettings();
    current[section] = defaults[section];
    return this.updateSettings(current);
  },

  /** Subscribe to changes */
  subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  /** Export settings as JSON */
  exportSettings() {
    return JSON.stringify(loadSettings(), null, 2);
  },

  /** Import settings from JSON */
  importSettings(jsonString) {
    let imported;
    try {
      imported = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid settings JSON');
    }
    return this.updateSettings(deepMerge(getDefaultSettings(), imported));
  },

  /**
   * Configuration health check. Every status is derived from the ACTUAL
   * configuration values, never a hardcoded percentage:
   *   · a section is `configured` only when the values it needs are present
   *     and internally consistent (an active default tax rate, a default
   *     payment term, a usable prefix on every document type, …).
   *
   * Pass a settings document to score that document (the settings page passes
   * the last SAVED document so the Overview never reports unsaved drafts).
   * Without an argument it scores the current cache.
   */
  getConfigHealth(settingsOverride) {
    const s = settingsOverride ? deepMerge(getDefaultSettings(), settingsOverride) : loadSettings();
    const permits = (flag) => flag !== false;
    const activeRates = (s.taxSettings?.taxRates || []).filter((t) => permits(t.active));
    const activeTerms = (s.paymentTerms || []).filter((t) => permits(t.active));
    const activeLevels = (s.approval?.levels || []).filter((l) => permits(l.enabled) && String(l.role || '').trim());
    const numbering = s.documentNumbering || {};
    const numberingComplete =
      Object.keys(numbering).length > 0 &&
      Object.values(numbering).every((cfg) => cfg && String(cfg.prefix || '').trim() && Number(cfg.padding) >= 1);
    /*
     * Company / Organization owns the Sales-document output flags
     * (showCompanyHeader / showGSTIN / showPAN / letterheadEnabled). The two
     * free-text fields beside them — defaultBankAccount and invoiceFooter — are
     * OPTIONAL overrides: they default to empty, no Sales document reads them
     * (the real bank details live per document and under Document Defaults), so
     * an empty pair must never mark a complete section as incomplete.
     *
     * The section is therefore configured when at least one company detail is
     * actually switched on for Sales documents, OR an override was entered. Turn
     * every flag off on an otherwise empty section and it correctly reports
     * "Needs attention" — nothing would identify the company on a document.
     */
    const companyPrefs = s.companyPreferences || {};
    const hasText = (value) => String(value ?? '').trim().length > 0;
    const companyDetailsEnabled = ['showCompanyHeader', 'showGSTIN', 'showPAN', 'letterheadEnabled']
      .some((flag) => companyPrefs[flag] === true);
    const companyConfigured = companyDetailsEnabled
      || hasText(companyPrefs.defaultBankAccount)
      || hasText(companyPrefs.invoiceFooter);
    const checks = [
      { key: 'general', label: 'General', configured: !!(s.general?.defaultCurrency && s.general?.defaultPaymentTerms && s.general?.defaultDeliveryTerms) },
      { key: 'approval', label: 'Approval & Workflow', configured: activeLevels.length > 0 },
      { key: 'tax', label: 'Tax Settings', configured: activeRates.length > 0 && activeRates.some((t) => t.default) },
      { key: 'currency', label: 'Currency & Exchange Rates', configured: !!(s.currencySettings?.displayCurrency && (s.currencySettings?.enabledCurrencies || []).length > 0) },
      { key: 'payment', label: 'Payment Terms', configured: activeTerms.length > 0 && activeTerms.some((t) => t.default) },
      { key: 'delivery', label: 'Delivery & Logistics', configured: (s.deliveryTerms || []).some((t) => permits(t.active)) },
      { key: 'numbering', label: 'Document Numbering', configured: numberingComplete },
      { key: 'pdf', label: 'PDF / Document Defaults', configured: !!(s.documentDefaults?.termsAndConditions || s.documentDefaults?.footer) },
      { key: 'notifications', label: 'Notifications', configured: ['quotationPendingApproval', 'quotationExpiring', 'quotationAccepted', 'salesContractPendingApproval', 'salesOrderPendingApproval', 'invoiceOverdue', 'paymentReceived', 'creditNotePendingApproval'].some((k) => s.notifications?.[k] === true) },
      { key: 'masters', label: 'Sales Masters', configured: (s.masters?.salesExecutives || []).some((m) => permits(m.active)) },
      {
        key: 'company',
        label: 'Company / Organization',
        configured: companyConfigured,
        hint: companyConfigured
          ? undefined
          : 'Enable at least one company detail on Sales documents, or enter a default bank account / invoice footer.'
      }
    ];
    const configured = checks.filter((c) => c.configured).length;
    const total = checks.length;
    const percentage = total > 0 ? Math.round((configured / total) * 100) : 0;
    const status = percentage === 100 ? 'healthy' : percentage >= 50 ? 'warning' : 'error';
    return { status, percentage, configured, total, checks };
  }
};

export default salesSettingsService;

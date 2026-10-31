/**
 * fyNumbering.js
 * ------------------------------------------------------------------
 * Shared Financial-Year (FY) aware document numbering utilities.
 *
 * The current FY is determined dynamically (never hardcoded).
 * India FY runs April–March: FY 2026 = Apr 2026 – Mar 2027.
 *
 * Format: PREFIX-FY-PADDED_NUMBER
 * Example: QTN-2026-0001
 * ------------------------------------------------------------------
 */

/**
 * Returns the current Indian Financial Year as a string.
 * Apr–Mar cycle: if current month >= April → FY = current year
 *                 if current month < April  → FY = current year - 1
 */
export function getCurrentFY() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed: 0=Jan, 3=Apr
  return month >= 3 ? String(now.getFullYear()) : String(now.getFullYear() - 1);
}

/**
 * Returns the FY label for display.
 * e.g. "2026" or "2026-27"
 */
export function getFYLabel(fy) {
  if (!fy) fy = getCurrentFY();
  const endYear = Number(fy) + 1;
  return `${fy}-${String(endYear).slice(2)}`;
}

/**
 * Generates the next document number based on numbering config.
 *
 * @param {Object} cfg - { prefix, fy, startNo, currentNo, padding }
 * @returns {string} e.g. "QTN-2026-0001"
 */
export function nextDocNumber(cfg = {}) {
  const prefix = cfg.prefix || 'DOC';
  const fy = cfg.fy || getCurrentFY();
  const padding = cfg.padding || 4;
  const nextNum = (cfg.currentNo || 0) + 1;
  return `${prefix}-${fy}-${String(nextNum).padStart(padding, '0')}`;
}

/**
 * Generates the preview of the next number (same as nextDocNumber but
 * clearly named for UI display).
 */
export function previewNextNumber(cfg = {}) {
  return nextDocNumber(cfg);
}

/**
 * Increments the counter for a document type after creation.
 * Returns a new config object (immutable update).
 */
export function incrementCounter(cfg = {}) {
  const currentFY = getCurrentFY();
  const fy = cfg.fy || currentFY;
  
  // If the stored FY doesn't match current FY, reset counter (new FY)
  if (fy !== currentFY) {
    return {
      ...cfg,
      fy: currentFY,
      currentNo: 1
    };
  }
  
  return {
    ...cfg,
    currentNo: (cfg.currentNo || 0) + 1
  };
}

/**
 * Checks if FY transition is needed and returns updated config.
 * If the stored FY differs from current FY, resets counter to startNo.
 */
export function ensureCurrentFY(cfg = {}) {
  const currentFY = getCurrentFY();
  if (cfg.fy !== currentFY) {
    return {
      ...cfg,
      fy: currentFY,
      currentNo: (cfg.startNo || 1) - 1 // Will be incremented on next use
    };
  }
  return cfg;
}

/**
 * Default numbering configuration for Sales documents.
 */
export function getDefaultSalesNumbering() {
  const fy = getCurrentFY();
  return {
    Quotation: { prefix: 'QTN', fy, startNo: 1, currentNo: 0, padding: 4 },
    SalesContract: { prefix: 'SC', fy, startNo: 1, currentNo: 0, padding: 4 },
    SalesOrder: { prefix: 'SO', fy, startNo: 1, currentNo: 0, padding: 4 },
    ProformaInvoice: { prefix: 'PI', fy, startNo: 1, currentNo: 0, padding: 4 },
    DeliveryChallan: { prefix: 'DC', fy, startNo: 1, currentNo: 0, padding: 4 },
    Invoice: { prefix: 'INV', fy, startNo: 1, currentNo: 0, padding: 4 },
    CreditNote: { prefix: 'CN', fy, startNo: 1, currentNo: 0, padding: 4 },
    PaymentReceipt: { prefix: 'PR', fy, startNo: 1, currentNo: 0, padding: 4 }
  };
}

/**
 * Default numbering configuration for Marketing documents.
 */
export function getDefaultMarketingNumbering() {
  const fy = getCurrentFY();
  return {
    Lead: { prefix: 'LEAD', fy, startNo: 1, currentNo: 0, padding: 4 },
    Visit: { prefix: 'VIS', fy, startNo: 1, currentNo: 0, padding: 4 },
    FollowUp: { prefix: 'FU', fy, startNo: 1, currentNo: 0, padding: 4 },
    Expense: { prefix: 'EXP', fy, startNo: 1, currentNo: 0, padding: 4 },
    TravelPlan: { prefix: 'TP', fy, startNo: 1, currentNo: 0, padding: 4 },
    QForm: { prefix: 'QF', fy, startNo: 1, currentNo: 0, padding: 4 }
  };
}

/**
 * Display labels for Marketing document types.
 */
export const MARKETING_DOC_LABELS = {
  Lead: 'Lead',
  Visit: 'Visit',
  FollowUp: 'Follow-up',
  Expense: 'Marketing Expense',
  TravelPlan: 'Travel Plan',
  QForm: 'Q-Form'
};

/**
 * Display labels for Sales document types.
 */
export const SALES_DOC_LABELS = {
  Quotation: 'Quotation',
  SalesContract: 'Sales Contract',
  SalesOrder: 'Customer Purchase Order',
  ProformaInvoice: 'Proforma Invoice',
  DeliveryChallan: 'Delivery Challan',
  Invoice: 'Invoice',
  CreditNote: 'Credit Note',
  PaymentReceipt: 'Payment Receipt'
};

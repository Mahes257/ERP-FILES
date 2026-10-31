/**
 * purchase/services/settings.js
 * ------------------------------------------------------------------
 * Centralised Settings service for the Purchase module: organisation
 * profile, commercial defaults, approval policy, approval matrix,
 * tax rates, currency list, payment terms, document numbering,
 * procurement defaults, workflow stages, notification rules,
 * logistics defaults, PDF/document defaults, terms & conditions
 * templates, audit history, and import/export.
 *
 * Persisted to localStorage via the lazy collection. Every setting
 * change is recorded in the audit log so nothing is lost.
 * ------------------------------------------------------------------ */
import api from '../../api/axiosInstance';
import { clone, createCollection, delay, storageKeys } from './base';
import { EXCHANGE_RATES } from '../../data/exchangeRates';
import { approvalRuleSeed, budgetControlSeed, matchingConfigSeed } from './configSeeds';
import {
  computeNext as engineComputeNext,
  ensureSequences,
  getSequence,
  NUMBERING_DOC_TYPES,
  NUMBERING_SEQUENCES,
  recordIssued as engineRecordIssued,
  resetSequence as engineResetSequence
} from './numberingEngine';

/* ================================================================== */
/*  DOCUMENT NUMBERING DEFAULTS                                        */
/*  Delegated to the central numbering engine (services/numberingEngine)
 *  — one independent sequence per business document. Inventory Movement
 *  (INV) and Vendor Invoice (VINV) deliberately use different prefixes
 *  so they can never collide. Keys mirror the numbering panel rows and
 *  the doc-type keys used across purchase services.                  */
/* ================================================================== */
export const NUMBERING_DEFAULTS = NUMBERING_SEQUENCES;

export { NUMBERING_DOC_TYPES };

export {
  getSequence,
  validatePrefixes,
  RESET_POLICIES,
  NUMBERING_SEQUENCES
} from './numberingEngine';

/**
 * Fill in any numbering sequences missing from a stored settings blob
 * and migrate legacy sequence keys (Inventory → Inventory Movement,
 * Invoice → Vendor Invoice). Existing sequences (including their
 * current counters and issued ledgers) are untouched, so older
 * persisted settings migrate forward safely.
 */
export function ensureNumberingEntries(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const numbering = settings.numbering && typeof settings.numbering === 'object' ? settings.numbering : {};
  const next = ensureSequences(numbering);
  if (next === numbering) return settings;
  return { ...settings, numbering: next };
}

/* ================================================================== */
/*  SEED DATA                                                          */
/* ================================================================== */
function settingsSeed() {
  return {
    company: {
      name: 'Vishak Engineering Pvt Ltd',
      legalName: 'Vishak Engineering Private Limited',
      address: 'Plot 12, MIDC Industrial Area, Pune, Maharashtra 411026',
      billingAddress: 'Plot 12, MIDC Industrial Area, Pune, Maharashtra 411026',
      shippingAddress: 'Plot 12, MIDC Industrial Area, Pune, Maharashtra 411026',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      pin: '411026',
      gstin: '27AABCV1234E1ZP',
      pan: 'AABCV1234E',
      cin: 'U29300PN2005PTC123456',
      tan: 'PUNE12345E',
      email: 'purchase@vishaktech.in',
      phone: '+91 20 6723 4500',
      website: 'https://vishaktech.in',
      bank: {
        bankName: 'HDFC Bank',
        accountName: 'Vishak Engineering Pvt Ltd',
        accountNumber: '50100012345678',
        ifsc: 'HDFC0001234',
        swift: 'HDFCINBB',
        branch: 'MIDC Branch, Pune'
      },
      signature: {
        authorizedSignatory: 'Rajesh Kumar',
        designation: 'Director & CFO'
      }
    },

    defaults: {
      currency: 'INR',
      tax: '18%',
      paymentTerms: '30 Days',
      deliveryTerms: 'FOB',
      warehouse: 'Main Store',
      department: 'Purchase',
      priority: 'Medium',
      incoterm: 'FOB',
      buyer: 'Rahul Sharma',
      approvalWorkflow: 'Standard'
    },

    currencySettings: {
      defaultCurrency: 'INR',
      symbolPosition: 'before',
      decimalPlaces: 2,
      thousandsSeparator: true,
      decimalSeparator: '.',
      negativeFormat: '-₹1,234',
      dateFormat: 'dd-MMM-yyyy',
      numberFormat: 'Indian'
    },

    approval: {
      autoApproveBelow: 50000,
      twoLevelAbove: 250000,
      requireGstin: true
    },

    approvalMatrix: [
      { level: 1, role: 'Department Head', minAmount: 0, maxAmount: 50000, slaDays: 2, active: true, fallbackApprover: '', escalationDays: 3 },
      { level: 2, role: 'Procurement Manager', minAmount: 50001, maxAmount: 250000, slaDays: 3, active: true, fallbackApprover: '', escalationDays: 4 },
      { level: 3, role: 'Finance Controller', minAmount: 250001, maxAmount: 1000000, slaDays: 4, active: true, fallbackApprover: '', escalationDays: 5 },
      { level: 4, role: 'Managing Director', minAmount: 1000001, maxAmount: 0, slaDays: 5, active: true, fallbackApprover: '', escalationDays: 7 }
    ],

    /* Configurable approval engine — rules condition on amount /
       department / project / cost centre / document type / role and
       define sequential or parallel approval chains. When no rule
       matches, the approvalMatrix above is the fallback chain. */
    approvalRules: approvalRuleSeed(),

    /* Purchase Budget Control — budgets keyed by department / project /
       cost centre / financial year. Utilisation is always computed from
       real PO + invoice records (never hardcoded). */
    budgetControl: budgetControlSeed(),

    /* 3-Way Matching engine — configurable tolerances and approval gating. */
    matching: matchingConfigSeed(),

    /* Payment controls — ledger behaviour configuration.
       allowOverpayment: when false (default) a payment that exceeds the
       invoice's outstanding balance is refused; when true an explicit
       overpayment is permitted (recorded on the payment ledger). */
    payment: {
      allowOverpayment: false,
      defaultBankAccount: 'HDFC Bank — 50100012345678'
    },

    taxRates: [
      { id: 'tax-1', code: 'EXEMPT', name: 'Exempt', rate: 0, type: 'GST', cgst: 0, sgst: 0, igst: 0, applicableTo: ['PR', 'RFQ', 'PO', 'Invoice'], active: true, effectiveDate: '2024-01-01' },
      { id: 'tax-2', code: 'GST-5', name: 'Essential Goods', rate: 5, type: 'GST', cgst: 2.5, sgst: 2.5, igst: 5, applicableTo: ['PR', 'RFQ', 'PO', 'Invoice'], active: true, effectiveDate: '2024-01-01' },
      { id: 'tax-3', code: 'GST-12', name: 'Standard', rate: 12, type: 'GST', cgst: 6, sgst: 6, igst: 12, applicableTo: ['PR', 'RFQ', 'PO', 'Invoice'], active: true, effectiveDate: '2024-01-01' },
      { id: 'tax-4', code: 'GST-18', name: 'Standard (Default)', rate: 18, type: 'GST', cgst: 9, sgst: 9, igst: 18, applicableTo: ['PR', 'RFQ', 'PO', 'Invoice'], active: true, effectiveDate: '2024-01-01' },
      { id: 'tax-5', code: 'GST-28', name: 'Luxury', rate: 28, type: 'GST', cgst: 14, sgst: 14, igst: 28, applicableTo: ['PR', 'RFQ', 'PO', 'Invoice'], active: true, effectiveDate: '2024-01-01' },
      { id: 'tax-6', code: 'TDS-194C', name: 'TDS u/s 194C', rate: 2, type: 'TDS', cgst: 0, sgst: 0, igst: 0, applicableTo: ['PO', 'Invoice'], active: true, effectiveDate: '2024-01-01' },
      { id: 'tax-7', code: 'CESS-5', name: 'Compensation Cess', rate: 5, type: 'CESS', cgst: 0, sgst: 0, igst: 0, applicableTo: ['PO', 'Invoice'], active: false, effectiveDate: '2024-01-01' }
    ],

    exchangeRates: EXCHANGE_RATES.map((entry) => ({ ...entry })),

    currencies: [
      { code: 'INR', symbol: '₹', name: 'Indian Rupee', rate: 1, active: true, default: true },
      { code: 'USD', symbol: '$', name: 'US Dollar', rate: 86.25, active: true, default: false },
      { code: 'EUR', symbol: '€', name: 'Euro', rate: 99.4, active: true, default: false },
      { code: 'GBP', symbol: '£', name: 'British Pound', rate: 115.2, active: true, default: false },
      { code: 'AED', symbol: 'AED ', name: 'UAE Dirham', rate: 23.49, active: false, default: false },
      { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rate: 0.58, active: true, default: false }
    ],

    paymentTerms: [
      { id: 'pt-1', code: 'ADV', name: 'Advance', creditDays: 0, advancePercent: 100, balancePercent: 0, dueDateRule: 'On Invoice', active: true },
      { id: 'pt-2', code: 'NET7', name: 'Net 7', creditDays: 7, advancePercent: 0, balancePercent: 100, dueDateRule: 'Invoice Date + Days', active: true },
      { id: 'pt-3', code: 'NET15', name: 'Net 15', creditDays: 15, advancePercent: 0, balancePercent: 100, dueDateRule: 'Invoice Date + Days', active: true },
      { id: 'pt-4', code: 'NET30', name: 'Net 30', creditDays: 30, advancePercent: 0, balancePercent: 100, dueDateRule: 'Invoice Date + Days', active: true, default: true },
      { id: 'pt-5', code: 'NET45', name: 'Net 45', creditDays: 45, advancePercent: 0, balancePercent: 100, dueDateRule: 'Invoice Date + Days', active: true },
      { id: 'pt-6', code: 'NET60', name: 'Net 60', creditDays: 60, advancePercent: 0, balancePercent: 100, dueDateRule: 'Invoice Date + Days', active: true },
      { id: 'pt-7', code: 'NET90', name: 'Net 90', creditDays: 90, advancePercent: 0, balancePercent: 100, dueDateRule: 'Invoice Date + Days', active: false },
      { id: 'pt-8', code: '50-50', name: '50% Advance + 50% Delivery', creditDays: 15, advancePercent: 50, balancePercent: 50, dueDateRule: 'Delivery + Days', active: true }
    ],

    numbering: ensureSequences({}),

    procurementDefaults: {
      defaultCurrency: 'INR',
      defaultTax: '18%',
      defaultPaymentTerms: 'Net 30',
      defaultDeliveryTerms: 'FOB',
      defaultWarehouse: 'Main Store',
      defaultDepartment: 'Purchase',
      defaultPriority: 'Medium',
      defaultIncoterm: 'FOB',
      defaultBuyer: 'Rahul Sharma',
      defaultApprovalWorkflow: 'Standard'
    },

    workflow: {
      PR: [
        { stage: 'Draft', enabled: true, displayName: 'Draft', sequence: 1, sla: 0, responsibleRole: 'Requester', escalation: '', allowedTransitions: ['Pending Approval'] },
        { stage: 'Pending Approval', enabled: true, displayName: 'Pending Approval', sequence: 2, sla: 3, responsibleRole: 'Approver', escalation: 'Department Head', allowedTransitions: ['Approved', 'Rejected', 'Returned'] },
        { stage: 'Approved', enabled: true, displayName: 'Approved', sequence: 3, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: ['Technical Specification Review'] },
        { stage: 'Technical Specification Review', enabled: true, displayName: 'Technical Specification Review', sequence: 4, sla: 5, responsibleRole: 'Engineer', escalation: 'Technical Manager', allowedTransitions: ['Ready for RFQ'] },
        { stage: 'Ready for RFQ', enabled: true, displayName: 'Ready for RFQ', sequence: 5, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: ['Converted to RFQ'] },
        { stage: 'Rejected', enabled: true, displayName: 'Rejected', sequence: 6, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] },
        { stage: 'Cancelled', enabled: true, displayName: 'Cancelled', sequence: 7, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] }
      ],
      RFQ: [
        { stage: 'Draft', enabled: true, displayName: 'Draft', sequence: 1, sla: 0, responsibleRole: 'Buyer', escalation: '', allowedTransitions: ['Published'] },
        { stage: 'Published', enabled: true, displayName: 'Published', sequence: 2, sla: 0, responsibleRole: 'Buyer', escalation: '', allowedTransitions: ['Quotation Received'] },
        { stage: 'Quotation Received', enabled: true, displayName: 'Quotation Received', sequence: 3, sla: 0, responsibleRole: 'Buyer', escalation: '', allowedTransitions: ['Under Evaluation'] },
        { stage: 'Under Evaluation', enabled: true, displayName: 'Under Evaluation', sequence: 4, sla: 5, responsibleRole: 'Evaluator', escalation: 'Procurement Manager', allowedTransitions: ['Negotiation'] },
        { stage: 'Negotiation', enabled: true, displayName: 'Negotiation', sequence: 5, sla: 5, responsibleRole: 'Buyer', escalation: 'Procurement Manager', allowedTransitions: ['Supplier Selected'] },
        { stage: 'Supplier Selected', enabled: true, displayName: 'Supplier Selected', sequence: 6, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: ['PO Conversion'] },
        { stage: 'Closed', enabled: true, displayName: 'Closed', sequence: 7, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] },
        { stage: 'Cancelled', enabled: true, displayName: 'Cancelled', sequence: 8, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] }
      ],
      PO: [
        { stage: 'Draft', enabled: true, displayName: 'Draft', sequence: 1, sla: 0, responsibleRole: 'Buyer', escalation: '', allowedTransitions: ['Pending Approval'] },
        { stage: 'Pending Approval', enabled: true, displayName: 'Pending Approval', sequence: 2, sla: 3, responsibleRole: 'Approver', escalation: 'Procurement Manager', allowedTransitions: ['Approved', 'Cancelled'] },
        { stage: 'Approved', enabled: true, displayName: 'Approved', sequence: 3, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: ['Released', 'Cancelled'] },
        { stage: 'Released', enabled: true, displayName: 'Released', sequence: 4, sla: 0, responsibleRole: 'Buyer', escalation: '', allowedTransitions: ['Supplier Acknowledged', 'Cancelled'] },
        { stage: 'Supplier Acknowledged', enabled: true, displayName: 'Supplier Acknowledged', sequence: 5, sla: 3, responsibleRole: 'Supplier', escalation: 'Buyer', allowedTransitions: ['In Progress', 'Cancelled'] },
        { stage: 'In Progress', enabled: true, displayName: 'In Progress', sequence: 6, sla: 0, responsibleRole: 'Supplier', escalation: '', allowedTransitions: ['Partially Delivered', 'Completed', 'Cancelled'] },
        { stage: 'Partially Delivered', enabled: true, displayName: 'Partially Delivered', sequence: 7, sla: 0, responsibleRole: 'Supplier', escalation: '', allowedTransitions: ['Completed', 'Cancelled'] },
        { stage: 'Completed', enabled: true, displayName: 'Completed', sequence: 8, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: ['Closed'] },
        { stage: 'Closed', enabled: true, displayName: 'Closed', sequence: 9, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] },
        { stage: 'Cancelled', enabled: true, displayName: 'Cancelled', sequence: 10, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] }
      ],
      Invoice: [
        { stage: 'Draft', enabled: true, displayName: 'Draft', sequence: 1, sla: 0, responsibleRole: 'Accountant', escalation: '', allowedTransitions: ['Submitted'] },
        { stage: 'Submitted', enabled: true, displayName: 'Submitted', sequence: 2, sla: 2, responsibleRole: 'Verifier', escalation: 'Finance Manager', allowedTransitions: ['Under Verification'] },
        { stage: 'Under Verification', enabled: true, displayName: 'Under Verification', sequence: 3, sla: 3, responsibleRole: 'Verifier', escalation: 'Finance Manager', allowedTransitions: ['Approved', 'Rejected'] },
        { stage: 'Approved', enabled: true, displayName: 'Approved', sequence: 4, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: ['Partially Paid', 'Paid'] },
        { stage: 'Partially Paid', enabled: true, displayName: 'Partially Paid', sequence: 5, sla: 0, responsibleRole: 'Accountant', escalation: '', allowedTransitions: ['Paid'] },
        { stage: 'Paid', enabled: true, displayName: 'Paid', sequence: 6, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] },
        { stage: 'Rejected', enabled: true, displayName: 'Rejected', sequence: 7, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] },
        { stage: 'Cancelled', enabled: true, displayName: 'Cancelled', sequence: 8, sla: 0, responsibleRole: 'System', escalation: '', allowedTransitions: [] }
      ]
    },

    notificationRules: [
      { id: 'nr-1', event: 'PR approval pending', enabled: true, recipientRole: 'Approver', reminderAfter: 1, escalateAfter: 3, repeatInterval: 'daily' },
      { id: 'nr-2', event: 'RFQ deadline approaching', enabled: true, recipientRole: 'Buyer', reminderAfter: 2, escalateAfter: 5, repeatInterval: 'daily' },
      { id: 'nr-3', event: 'Quotation received', enabled: true, recipientRole: 'Buyer', reminderAfter: 0, escalateAfter: 0, repeatInterval: 'once' },
      { id: 'nr-4', event: 'Negotiation pending', enabled: true, recipientRole: 'Buyer', reminderAfter: 1, escalateAfter: 3, repeatInterval: 'daily' },
      { id: 'nr-5', event: 'PO approval pending', enabled: true, recipientRole: 'Approver', reminderAfter: 1, escalateAfter: 3, repeatInterval: 'daily' },
      { id: 'nr-6', event: 'Supplier acknowledgement pending', enabled: true, recipientRole: 'Buyer', reminderAfter: 2, escalateAfter: 5, repeatInterval: 'every 2 days' },
      { id: 'nr-7', event: 'Delivery overdue', enabled: true, recipientRole: 'Logistics', reminderAfter: 1, escalateAfter: 3, repeatInterval: 'daily' },
      { id: 'nr-8', event: 'Quality inspection pending', enabled: true, recipientRole: 'Quality', reminderAfter: 1, escalateAfter: 2, repeatInterval: 'daily' },
      { id: 'nr-9', event: 'Invoice pending verification', enabled: true, recipientRole: 'Finance', reminderAfter: 1, escalateAfter: 3, repeatInterval: 'daily' },
      { id: 'nr-10', event: 'Payment overdue', enabled: true, recipientRole: 'Finance', reminderAfter: 1, escalateAfter: 5, repeatInterval: 'daily' }
    ],

    logisticsDefaults: {
      defaultWarehouse: 'Main Store',
      receivingLocation: 'Goods Inward Gate',
      inspectionRequired: true,
      grnRequired: true,
      packingRequired: false,
      shippingDocsRequired: true,
      partialDeliveryAllowed: true,
      overDeliveryTolerance: 5,
      underDeliveryTolerance: 0,
      deliveryReminderDays: 2
    },

    pdfDefaults: {
      companyLogo: true,
      headerText: 'PURCHASE ORDER',
      footerText: 'This is a system-generated document.',
      pageSize: 'A4',
      orientation: 'Portrait',
      showCompanyAddress: true,
      showGstin: true,
      showPan: false,
      showBankDetails: true,
      showTerms: true,
      showSignature: true,
      showApprovalHistory: false,
      showQrCode: false,
      showMetadata: false
    },

    termsAndConditions: [
      { id: 'tc-1', category: 'Purchase Terms', name: 'Standard Purchase Terms', content: '1. All goods shall conform to the specifications mentioned in the purchase order.\n2. Vendor shall ensure timely delivery as per agreed schedule.\n3. Any deviation from specifications must be approved in writing.', active: true, isDefault: true },
      { id: 'tc-2', category: 'Payment Terms', name: 'Standard Payment Terms', content: '1. Payment shall be made as per agreed payment terms.\n2. Invoices must be submitted with valid GST documentation.\n3. TDS will be deducted as per applicable provisions.', active: true, isDefault: true },
      { id: 'tc-3', category: 'Delivery Terms', name: 'Standard Delivery Terms', content: '1. Delivery shall be made to the address mentioned in the PO.\n2. Vendor shall provide delivery Challan and GRN copies.\n3. Risk transfers upon acceptance at destination.', active: true, isDefault: true },
      { id: 'tc-4', category: 'Quality Terms', name: 'Standard Quality Terms', content: '1. All goods are subject to quality inspection.\n2. Rejected goods must be replaced within 15 days.\n3. Vendor shall provide test certificates where applicable.', active: true, isDefault: false },
      { id: 'tc-5', category: 'Warranty Terms', name: 'Standard Warranty Terms', content: '1. Minimum 12 months warranty from date of installation.\n2. Warranty covers manufacturing defects only.\n3. Warranty service within 48 hours of complaint.', active: true, isDefault: false },
      { id: 'tc-6', category: 'Cancellation Terms', name: 'Standard Cancellation Terms', content: '1. Orders may be cancelled before dispatch without penalty.\n2. Cancellation after dispatch subject to mutual agreement.\n3. Custom/special items non-cancellable once production starts.', active: true, isDefault: false }
    ],

    notifications: {
      pendingApproval: true,
      poRelease: true,
      invoiceOverdue: true
    },

    auditHistory: []
  };
}

/* ================================================================== */
/*  STORE                                                              */
/* ================================================================== */
export const settingsStore = createCollection(storageKeys.settings, settingsSeed);

/* ================================================================== */
/*  MERGE                                                              */
/* ================================================================== */
function mergeSettings(current, patch = {}) {
  /** Dedup an array by a stable key function. First occurrence wins. */
  const dedupBy = (arr, keyFn) => {
    if (!Array.isArray(arr)) return arr;
    const seen = new Set();
    return arr.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const merged = {
    ...current,
    ...patch,
    company: { ...current.company, ...(patch.company || {}), bank: { ...(current.company?.bank || {}), ...(patch.company?.bank || {}) }, signature: { ...(current.company?.signature || {}), ...(patch.company?.signature || {}) } },
    defaults: { ...current.defaults, ...(patch.defaults || {}) },
    approval: { ...current.approval, ...(patch.approval || {}) },
    notifications: { ...current.notifications, ...(patch.notifications || {}) },
    approvalMatrix: dedupBy(Array.isArray(patch.approvalMatrix) ? patch.approvalMatrix : current.approvalMatrix, (r) => r.level),
    approvalRules: dedupBy(Array.isArray(patch.approvalRules) ? patch.approvalRules : current.approvalRules, (r) => r.id),
    budgetControl: { ...(current.budgetControl || {}), ...(patch.budgetControl || {}), budgets: Array.isArray(patch.budgetControl?.budgets) ? patch.budgetControl.budgets : (current.budgetControl?.budgets || []) },
    matching: { ...(current.matching || {}), ...(patch.matching || {}), tolerances: { ...(current.matching?.tolerances || {}), ...(patch.matching?.tolerances || {}) } },
    payment: { ...(current.payment || {}), ...(patch.payment || {}) },
    taxRates: dedupBy(Array.isArray(patch.taxRates) ? patch.taxRates : current.taxRates, (t) => t.code || t.id),
    exchangeRates: Array.isArray(patch.exchangeRates) ? patch.exchangeRates : current.exchangeRates,
    currencies: dedupBy(Array.isArray(patch.currencies) ? patch.currencies : current.currencies, (c) => c.code),
    paymentTerms: dedupBy(Array.isArray(patch.paymentTerms) ? patch.paymentTerms : current.paymentTerms, (p) => p.code || p.id),
    currencySettings: { ...current.currencySettings, ...(patch.currencySettings || {}) },
    numbering: { ...current.numbering, ...(patch.numbering || {}) },
    procurementDefaults: { ...current.procurementDefaults, ...(patch.procurementDefaults || {}) },
    workflow: { ...current.workflow, ...(patch.workflow || {}) },
    notificationRules: dedupBy(Array.isArray(patch.notificationRules) ? patch.notificationRules : current.notificationRules, (n) => n.id || n.event),
    logisticsDefaults: { ...current.logisticsDefaults, ...(patch.logisticsDefaults || {}) },
    pdfDefaults: { ...current.pdfDefaults, ...(patch.pdfDefaults || {}) },
    termsAndConditions: dedupBy(Array.isArray(patch.termsAndConditions) ? patch.termsAndConditions : current.termsAndConditions, (t) => t.id || t.name)
  };
  return merged;
}

/* ================================================================== */
/*  AUDIT LOG HELPER                                                   */
/* ================================================================== */
function recordAudit(current, patch, changedBy = 'Admin User') {
  const existingAudit = Array.isArray(current.auditHistory) ? current.auditHistory : [];
  const history = [...existingAudit];
  const now = new Date().toISOString();
  const sections = Object.keys(patch).filter((k) => k !== 'auditHistory');

  sections.forEach((section) => {
    const oldVal = JSON.stringify(current[section]);
    const newVal = JSON.stringify(patch[section]);
    if (oldVal !== newVal) {
      history.unshift({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        setting: section,
        section,
        oldValue: typeof current[section] === 'object' ? JSON.stringify(current[section]).slice(0, 200) : String(current[section]),
        newValue: typeof patch[section] === 'object' ? JSON.stringify(patch[section]).slice(0, 200) : String(patch[section]),
        changedBy,
        changedAt: now
      });
    }
  });

  return history.slice(0, 200);
}

/* ================================================================== */
/*  CONFIG HEALTH CALCULATOR                                           */
/*  Each entry mirrors a navigable settings section (key = section key
 *  used by the sidebar/router). Status is derived from the actual
 *  saved configuration — never hardcoded:
 *    configured — required values are present
 *    partial    — section exists but key values are missing
 *    missing    — nothing usable configured                      */
/* ================================================================== */
function calculateHealth(s) {
  const rows = (arr) => (Array.isArray(arr) ? arr : []);
  const gt = (arr) => rows(arr).length;
  const anyActive = (arr) => rows(arr).some((x) => x.active);
  const gstRates = rows(s.taxRates).filter((t) => t.active && t.type === 'GST');
  const numberKeys = Object.keys(s.numbering || {});
  const wfDocs = Object.keys(s.workflow || {});
  const pd = s.procurementDefaults || {};
  const ld = s.logisticsDefaults || {};
  const pdf = s.pdfDefaults || {};
  const co = s.company || {};
  const validRates = rows(s.exchangeRates).filter((r) => Number(r.rate) > 0 && !!r.effectiveDate);
  const currencies = rows(s.currencies);
  const cur = s.currencySettings || {};
  const terms = rows(s.termsAndConditions);
  const nRules = rows(s.notificationRules);

  /* [key, label, { required, partial }] — first failing required ⇒ configured,
   * otherwise if any partial satisfied ⇒ partial, else missing. */
  const statusOf = (required, partial) => (required ? 'configured' : partial ? 'partial' : 'missing');

  const checks = [
    {
      key: 'approval',
      label: 'Approval Matrix',
      detail: `${gt(s.approvalMatrix)} level(s), ${rows(s.approvalMatrix).filter((r) => r.active).length} active`,
      status: statusOf(
        gt(s.approvalMatrix) > 0 && anyActive(s.approvalMatrix),
        gt(s.approvalMatrix) > 0
      )
    },
    {
      key: 'approvalRules',
      label: 'Approval Rules',
      detail: `${rows(s.approvalRules).filter((r) => r.enabled).length} enabled rule(s) — sequential / parallel, delegation, escalation`,
      status: statusOf(
        rows(s.approvalRules).some((r) => r.enabled && gt(r.steps) > 0),
        gt(s.approvalRules) > 0
      )
    },
    {
      key: 'budget',
      label: 'Budget Control',
      detail: s.budgetControl?.enabled
        ? `${rows(s.budgetControl?.budgets).filter((b) => b.active).length} active budget(s)`
        : 'Disabled',
      status: statusOf(
        s.budgetControl?.enabled === true && rows(s.budgetControl?.budgets).some((b) => b.active),
        s.budgetControl?.enabled === true || gt(s.budgetControl?.budgets) > 0
      )
    },
    {
      key: 'matching',
      label: '3-Way Matching',
      detail: s.matching?.enabled
        ? `Require full match: ${s.matching?.requireMatchToApprove ? 'Yes' : 'No'} · ±${s.matching?.tolerances?.valuePct ?? 2}% value tolerance`
        : 'Disabled',
      status: statusOf(
        s.matching?.enabled === true,
        !!s.matching && Object.keys(s.matching.tolerances || {}).length > 0
      )
    },
    {
      key: 'tax',
      label: 'Tax Configuration',
      detail: `${gt(s.taxRates)} tax(es), ${gstRates.length} active GST`,
      status: statusOf(gstRates.some((t) => Number(t.rate) > 0), anyActive(s.taxRates))
    },
    {
      key: 'currency',
      label: 'Currency Settings',
      detail: `Base: ${cur.defaultCurrency || '—'} · ${gt(currencies)} currencies configured`,
      status: statusOf(
        !!cur.defaultCurrency && gt(currencies) > 0 && currencies.some((c) => c.code === cur.defaultCurrency),
        !!cur.defaultCurrency
      )
    },
    {
      key: 'exchangeRates',
      label: 'Exchange Rates',
      detail: `${validRates.length} of ${gt(s.exchangeRates)} valid rates`,
      status: statusOf(validRates.length > 1, validRates.length > 0)
    },
    {
      key: 'payment',
      label: 'Payment Terms',
      detail: `${rows(s.paymentTerms).filter((p) => p.active).length} active of ${gt(s.paymentTerms)}`,
      status: statusOf(gt(s.paymentTerms) > 0 && anyActive(s.paymentTerms), gt(s.paymentTerms) > 0)
    },
    {
      key: 'company',
      label: 'Company Details',
      detail: co.name ? `${co.name}${co.gstin ? '' : ' (GSTIN missing)'}` : 'No company name set',
      status: statusOf(!!(co.name && co.gstin && co.address), !!co.name)
    },
    {
      key: 'numbering',
      label: 'Document Numbering',
      detail: `${NUMBERING_DOC_TYPES.length} sequences, ${NUMBERING_DOC_TYPES.length - numberKeys.length} missing`,
      status: statusOf(NUMBERING_DOC_TYPES.every((k) => s.numbering?.[k]), numberKeys.length > 0)
    },
    {
      key: 'workflow',
      label: 'Workflow Config',
      detail: `${wfDocs.length} document workflow(s)`,
      status: statusOf(['PR', 'RFQ', 'PO', 'Invoice'].every((d) => s.workflow?.[d]), wfDocs.length > 0)
    },
    {
      key: 'procurementDefaults',
      label: 'Procurement Defaults',
      detail: `Currency: ${pd.defaultCurrency || '—'} · Terms: ${pd.defaultPaymentTerms || '—'} · Tax: ${pd.defaultTax || '—'}`,
      status: statusOf(
        !!(pd.defaultCurrency && pd.defaultTax && pd.defaultPaymentTerms),
        !!pd.defaultCurrency || !!pd.defaultTax || !!pd.defaultPaymentTerms
      )
    },
    {
      key: 'notifications',
      label: 'Notifications',
      detail: `${nRules.filter((n) => n.enabled).length} active rule(s)`,
      status: statusOf(nRules.some((n) => n.enabled), nRules.length > 0)
    },
    {
      key: 'logistics',
      label: 'Logistics Defaults',
      detail: `Warehouse: ${ld.defaultWarehouse || '—'}`,
      status: statusOf(!!(ld.defaultWarehouse && ld.receivingLocation), !!ld.defaultWarehouse)
    },
    {
      key: 'pdf',
      label: 'Document/PDF Config',
      detail: `Page: ${pdf.pageSize || '—'} · Footer: ${pdf.footerText ? 'set' : 'missing'}`,
      status: statusOf(!!(pdf.pageSize && pdf.footerText), !!pdf.pageSize)
    },
    {
      key: 'terms',
      label: 'Terms & Conditions',
      detail: `${terms.filter((t) => t.active).length} active template(s)`,
      status: statusOf(gt(terms) > 0 && anyActive(terms), gt(terms) > 0)
    }
  ];

  const configured = checks.filter((c) => c.status === 'configured').length;
  const partial = checks.filter((c) => c.status === 'partial').length;
  const total = checks.length;
  const percentage = Math.round((configured / total) * 100);

  return {
    percentage,
    checks,
    configured,
    partial,
    total,
    status: configured >= Math.ceil(total * 0.8) ? 'healthy' : percentage >= 50 ? 'warning' : 'incomplete'
  };
}

/* ================================================================== */
/*  PUBLIC SERVICE API                                                 */
/* ================================================================== */

/** Read the persisted settings, migrating in any missing defaults (new
 *  numbering sequences etc.) so stored blobs always stay complete. */
export function readSettings() {
  const raw = settingsStore.all;
  const normalized = ensureNumberingEntries(raw);
  if (normalized !== raw) settingsStore.persist(normalized);
  return normalized;
}

export const settingsService = {
  async getSettings() {
    await delay();
    return clone(readSettings());
  },

  /**
   * The notification rules the BACKEND is enforcing. Empty when the server has
   * never been given a rule set (first run) — callers keep their local draft
   * in that case instead of blanking the grid.
   */
  async getServerNotificationRules() {
    return fetchNotificationRulesFromServer();
  },

  /** Mirrors the rules to the backend (ADMIN / SETTINGS_MANAGE). */
  async saveServerNotificationRules(rules) {
    return pushNotificationRulesToServer(rules);
  },

  async updateSettings(patch = {}, changedBy = 'Admin User') {
    await delay();
    const current = readSettings();
    const auditEntries = recordAudit(current, patch, changedBy);
    const merged = ensureNumberingEntries(mergeSettings(current, { ...patch, auditHistory: [...auditEntries, ...(current.auditHistory || [])].slice(0, 200) }));
    settingsStore.persist(merged);
    return clone(merged);
  },

  async resetSettings() {
    await delay();
    const seed = settingsSeed();
    settingsStore.persist(seed);
    return clone(seed);
  },

  async getSetting(section) {
    await delay();
    return clone(settingsStore.all[section]);
  },

  async updateSetting(section, value, changedBy = 'Admin User') {
    await delay();
    const current = settingsStore.all;
    const auditEntries = recordAudit(current, { [section]: value }, changedBy);
    const merged = {
      ...current,
      [section]: value,
      auditHistory: [...auditEntries, ...(current.auditHistory || [])].slice(0, 200)
    };
    settingsStore.persist(merged);
    return clone(merged);
  },

  async getConfigHealth() {
    await delay();
    return calculateHealth(readSettings());
  },

  async getAuditHistory(limit = 50) {
    await delay();
    return clone((settingsStore.all.auditHistory || []).slice(0, limit));
  },

  async exportSettings() {
    await delay();
    const exportable = { ...settingsStore.all };
    delete exportable.auditHistory;
    return JSON.stringify(exportable, null, 2);
  },

  async importSettings(jsonString) {
    await delay();
    let imported;
    try { imported = JSON.parse(jsonString); } catch { throw new Error('Invalid JSON format'); }
    if (!imported || typeof imported !== 'object') throw new Error('Settings must be a JSON object');
    const requiredKeys = ['company', 'defaults', 'currencySettings'];
    const missing = requiredKeys.filter((k) => !imported[k]);
    if (missing.length > 0) throw new Error(`Missing required sections: ${missing.join(', ')}`);
    const current = settingsStore.all;
    const merged = mergeSettings(current, imported);
    settingsStore.persist(merged);
    return clone(merged);
  },

  async resetNumbering(docType) {
    await delay();
    const current = settingsStore.all;
    const cfg = current.numbering?.[docType];
    if (!cfg) throw new Error(`Unknown document type: ${docType}`);
    const numbering = engineResetSequence(current.numbering, docType);
    return this.updateSetting('numbering', numbering);
  },

  validateApprovalMatrix(matrix) {
    const errors = [];
    if (!Array.isArray(matrix) || matrix.length === 0) { errors.push('At least one approval level is required'); return errors; }
    if (matrix.filter((r) => r.active).length === 0) errors.push('At least one active approval level is required');
    matrix.forEach((row) => {
      if (row.minAmount < 0) errors.push(`Level ${row.level}: Minimum amount cannot be negative`);
      if (row.maxAmount < 0) errors.push(`Level ${row.level}: Maximum amount cannot be negative`);
      if (row.maxAmount > 0 && row.minAmount > row.maxAmount) errors.push(`Level ${row.level}: Minimum must be ≤ Maximum`);
      if (row.slaDays < 0) errors.push(`Level ${row.level}: SLA days cannot be negative`);
    });
    const sorted = [...matrix].sort((a, b) => a.minAmount - b.minAmount);
    for (let idx = 1; idx < sorted.length; idx++) {
      if (sorted[idx - 1].maxAmount > 0 && sorted[idx].minAmount <= sorted[idx - 1].maxAmount) {
        errors.push(`Overlapping range: Level ${sorted[idx - 1].level} and Level ${sorted[idx].level}`);
      }
    }
    return errors;
  }
};

/* ================================================================== */
/*  SYNCHRONOUS ACCESSORS                                              */
/* ================================================================== */
const CURRENCY_PREFS_DEFAULTS = {
  defaultCurrency: 'INR',
  symbolPosition: 'before',
  decimalPlaces: 2,
  thousandsSeparator: true
};

export function getCurrencyPrefs() {
  const all = readSettings();
  const stored = all?.currencySettings || {};
  return {
    defaultCurrency: stored.defaultCurrency || all?.defaults?.currency || CURRENCY_PREFS_DEFAULTS.defaultCurrency,
    symbolPosition: stored.symbolPosition || CURRENCY_PREFS_DEFAULTS.symbolPosition,
    decimalPlaces: Number.isFinite(Number(stored.decimalPlaces)) ? Number(stored.decimalPlaces) : CURRENCY_PREFS_DEFAULTS.decimalPlaces,
    thousandsSeparator: stored.thousandsSeparator !== undefined ? Boolean(stored.thousandsSeparator) : CURRENCY_PREFS_DEFAULTS.thousandsSeparator,
    decimalSeparator: stored.decimalSeparator || '.',
    dateFormat: stored.dateFormat || 'dd-MMM-yyyy'
  };
}

export function getDefaultCurrency() {
  return getCurrencyPrefs().defaultCurrency;
}

export function getApprovalLevel(amount) {
  const matrix = readSettings()?.approvalMatrix || [];
  const numAmount = Number(amount) || 0;
  return matrix.filter((r) => r.active).sort((a, b) => a.minAmount - b.minAmount)
    .find((r) => r.maxAmount === 0 ? numAmount >= r.minAmount : numAmount >= r.minAmount && numAmount <= r.maxAmount) || null;
}

export function getActivePaymentTerms() {
  return (readSettings()?.paymentTerms || []).filter((p) => p.active);
}

export function getActiveTaxRates() {
  return (readSettings()?.taxRates || []).filter((t) => t.active);
}

export function getCompanyDetails() {
  return readSettings()?.company || {};
}

export function getPdfDefaults() {
  return readSettings()?.pdfDefaults || {};
}

export function getProcurementDefaults() {
  return readSettings()?.procurementDefaults || {};
}

export function getNumberingConfig(docType) {
  return getSequence(readSettings()?.numbering, docType);
}

/** Maps the prefix a generator was called with to the settings numbering
 *  section key. Kept here so utils/services can share ONE mapping. */
export const NUMBERING_DOC_KEY_BY_PREFIX = {
  PR: 'PR',
  RFQ: 'RFQ',
  QT: 'Quotation',
  PO: 'PO',
  MFR: 'Packing',
  SHP: 'Shipment',
  GRN: 'GRN',
  QC: 'Inspection',
  INV: 'Inventory Movement',
  VINV: 'Vendor Invoice',
  PAY: 'Payment',
  ADV: 'Payment Advice',
  CN: 'Credit Note',
  DN: 'Debit Note'
};

/**
 * Compute the next number for a sequence through the central engine
 * and persist the updated counter + duplicate-prevention ledger.
 * Returns { number, sequence }.
 */
export function issueNextNumber(docType, existing = []) {
  const current = readSettings();
  const { number, sequence } = engineComputeNext(current?.numbering, docType, { existing });
  const numbering = engineRecordIssued(current.numbering, docType, number);
  settingsStore.persist({ ...current, numbering });
  return { number, sequence };
}

/**
 * Record that a document number has been issued so the numbering
 * panel's counter always tracks the highest real sequence (persisted).
 * No-op when the doc type has no numbering config.
 */
export function recordNumberIssued(docType, docNumber) {
  const current = readSettings();
  const numbering = engineRecordIssued(current?.numbering, docType, docNumber);
  if (numbering === current?.numbering) return getSequence(current?.numbering, docType);
  settingsStore.persist({ ...current, numbering });
  return getSequence(numbering, docType);
}

/** Reset a sequence's counter + ledger (per-row Reset action). */
export function resetNumberingSequence(docType) {
  const current = readSettings();
  const numbering = engineResetSequence(current?.numbering, docType);
  settingsStore.persist({ ...current, numbering });
  return getSequence(numbering, docType);
}

/** Default GST rate (%) applied to new line items — derived from the
 *  configured default tax (defaults.tax / procurementDefaults.defaultTax,
 *  e.g. "18%"), falling back to the first active GST rate, then 18. */
export function getDefaultTaxRate() {
  const s = readSettings();
  const label = String(
    s?.defaults?.tax || s?.procurementDefaults?.defaultTax || ''
  );
  const match = /(\d+(?:\.\d+)?)/.exec(label);
  if (match) return Number(match[1]);
  const gst = (s?.taxRates || []).find((t) => t.active && t.type === 'GST' && Number(t.rate) > 0);
  return gst ? Number(gst.rate) : 18;
}

/** Configured workflow stages for a document type (e.g. 'PO'), or null. */
export function getWorkflowConfig(docType) {
  return readSettings()?.workflow?.[docType] || null;
}

export function getLogisticsDefaults() {
  return readSettings()?.logisticsDefaults || {};
}

export function getNotificationRules() {
  return readSettings()?.notificationRules || [];
}

/** Content of the default active Terms & Conditions template, or ''. */
export function getDefaultTermsContent() {
  const terms = (readSettings()?.termsAndConditions || []).filter((t) => t.active !== false);
  const def = terms.find((t) => t.isDefault) || terms[0];
  return def?.content || '';
}

/**
 * Purchase notification rules — the ONE settings section the server enforces.
 *
 * Every other section in this document is a browser-local draft. Notification
 * rules decide whether the BACKEND creates a notification, who receives it and
 * when it is reminded/escalated, so the page mirrors them to
 * `/purchase/notifications/rules` (app_settings) on save and reads them back on
 * load. Without that mirror the grid would only be decoration.
 */
export async function fetchNotificationRulesFromServer() {
  const res = await api.get('/purchase/notifications/rules');
  const rules = res?.data?.data;
  return Array.isArray(rules) ? rules : [];
}

/**
 * Mirrors the configured rules to the backend. Resolves to the rules the
 * server persisted (it validates event labels and repeat values).
 *
 * Only an ADMIN can write them (SETTINGS_MANAGE); callers that are not ADMIN
 * keep the local draft and should say so instead of implying enforcement.
 */
export async function pushNotificationRulesToServer(rules) {
  const payload = (Array.isArray(rules) ? rules : []).map((rule) => ({
    id: rule.id,
    event: rule.event,
    enabled: rule.enabled !== false,
    recipientRole: rule.recipientRole || '',
    reminderAfter: Number(rule.reminderAfter) || 0,
    escalateAfter: Number(rule.escalateAfter) || 0,
    repeatInterval: rule.repeatInterval || 'once'
  }));
  const res = await api.put('/purchase/notifications/rules', { rules: payload });
  const saved = res?.data?.data;
  return Array.isArray(saved) ? saved : payload;
}

/** Company profile for print documents — the configured company merged
 *  over a minimal fallback so letterheads never render blank fields. */
export function getPrintCompany() {
  const co = readSettings()?.company || {};
  return {
    name: co.name || 'Vishak Engineering Pvt Ltd',
    address: co.address || 'Plot 12, MIDC Industrial Area, Pune, Maharashtra 411026',
    gstin: co.gstin || '',
    phone: co.phone || '',
    email: co.email || '',
    logo: typeof co.logo === 'string' ? co.logo : ''
  };
}

export { CURRENCY_PREFS_DEFAULTS, calculateHealth };

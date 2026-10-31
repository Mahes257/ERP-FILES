/**
 * purchase/services/invoicePrintDesign.js
 * ------------------------------------------------------------------
 * Purchase Invoice print-design snapshot + saved document templates.
 *
 * An invoice's "design" is presentation-only metadata — company logo,
 * signature images, field visibility, and the vendor snapshot shown
 * on the document. It is persisted SEPARATELY from the transactional
 * invoice record so Approved / Paid invoices can still be restyled
 * for printing without ever rewriting workflow data.
 *
 * Templates are plain saved designs (no transactional values) kept in
 * localStorage so one design can be reapplied across invoices.
 * ------------------------------------------------------------------
 */
import { clone, readStorage, writeStorage } from './base';

const INV_TEMPLATES_KEY = 'prm.invoicePrintTemplates';

/** Signature layouts an invoice document can render. */
export const SIGNATURE_LAYOUTS = {
  WORKFLOW: 'workflow',
  VENDOR_BUYER: 'vendorbuyer'
};

export const SIGNATURE_ROLES = {
  WORKFLOW: ['preparedBy', 'verifiedBy', 'approvedBy'],
  VENDOR_BUYER: ['vendor', 'buyer']
};

/** Default design every invoice document renders when nothing is configured. */
export const DEFAULT_INVOICE_PRINT_DESIGN = {
  visibility: {
    amountInWords: true,
    notes: true,
    termsAndConditions: true,
    paymentInfo: true,
    poReference: true,
    grnReference: true,
    vendorGstin: true,
    vendorInvoiceNo: true,
    paymentStatus: true,
    paymentDate: true,
    paymentMethod: true,
    threeWayMatch: true,
    footer: true,
    tdsRetention: true
  },
  signatureLayout: SIGNATURE_LAYOUTS.WORKFLOW,
  logo: '',
  printTemplateId: '',
  /* Vendor snapshot shown on the document. Invoice-specific copy — edits
     here NEVER touch the vendor master. */
  vendor: {
    name: '',
    address: '',
    city: '',
    state: '',
    country: '',
    gstin: '',
    phone: '',
    email: '',
    contact: ''
  },
  signatures: {
    preparedBy: { image: '', name: '', designation: '' },
    verifiedBy: { image: '', name: '', designation: '' },
    approvedBy: { image: '', name: '', designation: '' },
    vendor: { image: '', name: '', designation: '' },
    buyer: { image: '', name: '', designation: '' }
  },
  /* Document layout preferences */
  layout: {
    pageSize: 'A4',
    orientation: 'portrait',
    marginTop: '10mm',
    marginBottom: '10mm',
    marginLeft: '10mm',
    marginRight: '10mm',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: '10px',
    headerSize: '16px',
    bodySize: '10px',
    accentColor: '#0B4A3D',
    borderColor: '#e2e8f0',
    headerStyle: 'standard',
    layoutDensity: 'standard'
  }
};

/** Deep-merges a raw design onto the defaults so partial payloads are safe. */
export function normalizeInvoicePrintDesign(input = {}) {
  const design = clone(DEFAULT_INVOICE_PRINT_DESIGN);
  if (!input || typeof input !== 'object') return design;

  design.visibility = {
    ...design.visibility,
    ...(input.visibility && typeof input.visibility === 'object' ? input.visibility : {})
  };
  design.signatureLayout = SIGNATURE_ROLES[input.signatureLayout]
    ? input.signatureLayout
    : design.signatureLayout;
  design.logo = typeof input.logo === 'string' ? input.logo : design.logo;
  design.printTemplateId = typeof input.printTemplateId === 'string' ? input.printTemplateId : '';

  if (input.vendor && typeof input.vendor === 'object') {
    const vendor = input.vendor;
    Object.keys(design.vendor).forEach((key) => {
      design.vendor[key] = typeof vendor[key] === 'string' ? vendor[key] : design.vendor[key];
    });
  }

  if (input.signatures && typeof input.signatures === 'object') {
    Object.keys(design.signatures).forEach((role) => {
      const entry = input.signatures[role];
      if (entry && typeof entry === 'object') {
        design.signatures[role] = {
          image: typeof entry.image === 'string' ? entry.image : '',
          name: typeof entry.name === 'string' ? entry.name : '',
          designation: typeof entry.designation === 'string' ? entry.designation : ''
        };
      }
    });
  }

  if (input.layout && typeof input.layout === 'object') {
    Object.keys(design.layout).forEach((key) => {
      if (typeof input.layout[key] === 'string') {
        design.layout[key] = input.layout[key];
      }
    });
  }

  return design;
}

/* ------------------------------------------------------------------ */
/*  Saved document templates (localStorage)                            */
/* ------------------------------------------------------------------ */

function readTemplates() {
  const list = readStorage(INV_TEMPLATES_KEY);
  return Array.isArray(list) ? list : [];
}

function writeTemplates(list) {
  writeStorage(INV_TEMPLATES_KEY, list);
}

export const invoicePrintTemplateStore = {
  all() {
    return readTemplates();
  },

  save({ name = '', design = {} } = {}) {
    const label = String(name || '').trim();
    if (!label) return null;
    const normalized = normalizeInvoicePrintDesign(design);
    /* Templates are reusable — they never capture the invoice's vendor snapshot. */
    const stored = { ...normalized, vendor: clone(DEFAULT_INVOICE_PRINT_DESIGN.vendor) };
    const templates = readTemplates();
    const existing = templates.find((t) => t.name.toLowerCase() === label.toLowerCase());
    const now = new Date().toISOString();
    const template = existing
      ? { ...existing, name: label, design: stored, updatedAt: now }
      : {
          id: `inv-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: label,
          design: stored,
          createdAt: now,
          updatedAt: now
        };
    const next = existing
      ? templates.map((t) => (t.id === template.id ? template : t))
      : [template, ...templates];
    writeTemplates(next);
    return template;
  },

  apply(id, baseDesign = {}) {
    const template = readTemplates().find((t) => t.id === id);
    if (!template) return null;
    const templateDesign = normalizeInvoicePrintDesign(template.design);
    const merged = normalizeInvoicePrintDesign(baseDesign);
    Object.keys(templateDesign).forEach((key) => {
      if (key === 'vendor') return;
      merged[key] = templateDesign[key];
    });
    merged.printTemplateId = id;
    return merged;
  },

  remove(id) {
    writeTemplates(readTemplates().filter((t) => t.id !== id));
  },

  clear() {
    writeTemplates([]);
  }
};

export default {
  SIGNATURE_LAYOUTS,
  SIGNATURE_ROLES,
  DEFAULT_INVOICE_PRINT_DESIGN,
  normalizeInvoicePrintDesign,
  invoicePrintTemplateStore
};

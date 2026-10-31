/**
 * purchase/services/poPrintDesign.js
 * ------------------------------------------------------------------
 * Purchase Order print-design snapshot + saved document templates.
 *
 * A PO's "design" is presentation-only metadata — company/buyer logo,
 * signature images, field visibility, signature layout and the supplier
 * snapshot shown on the document. It is persisted SEPARATELY from the
 * transactional PO record (via purchaseOrderService.savePrintDesign) so
 * Approved / Released orders can still be restyled for printing without
 * ever rewriting workflow data, and it can never touch amounts.
 *
 * Templates are plain saved designs (no transactional values) kept in
 * localStorage so one design can be reapplied across POs.
 * ------------------------------------------------------------------ */
import { clone, readStorage, writeStorage } from './base';
import DEFAULT_DOCUMENT_ASSETS from '../assets/defaultDocumentAssets.json' with { type: 'json' };
const DEFAULT_LOGO_DATA_URL = typeof DEFAULT_DOCUMENT_ASSETS === 'object' && DEFAULT_DOCUMENT_ASSETS?.logo ? DEFAULT_DOCUMENT_ASSETS.logo : '';
const DEFAULT_SELLER_SIGNATURE_DATA_URL = typeof DEFAULT_DOCUMENT_ASSETS === 'object' && DEFAULT_DOCUMENT_ASSETS?.sellerSignature ? DEFAULT_DOCUMENT_ASSETS.sellerSignature : '';

const PO_TEMPLATES_KEY = 'prm.poPrintTemplates';

/** Signature layouts a PO document can render. */
export const SIGNATURE_LAYOUTS = {
  WORKFLOW: 'workflow',
  SELLER_BUYER: 'sellerbuyer'
};

export const SIGNATURE_ROLES = {
  WORKFLOW: ['preparedBy', 'checkedBy', 'approvedBy'],
  SELLER_BUYER: ['seller', 'buyer']
};

/** Default design every PO document renders when nothing is configured. */
export const DEFAULT_PO_PRINT_DESIGN = {
  visibility: {
    amountInWords: true,
    notes: true,
    deliveryPayment: true,
    termsAndConditions: true,
    supplierCodeOfConduct: true,
    footer: true,
    seller: true,
    buyer: true
  },
  signatureLayout: SIGNATURE_LAYOUTS.SELLER_BUYER,
  logo: DEFAULT_LOGO_DATA_URL,
  printTemplateId: '',
  /* Supplier snapshot shown on the document. A PO-specific copy — edits
     here NEVER touch the vendor master (see §18: supplier information
     comes from the existing vendor master and stays PO-local). */
  supplier: {
    name: '',
    address: '',
    city: '',
    state: '',
    gstin: '',
    phone: '',
    email: '',
    contact: ''
  },
  signatures: {
    preparedBy: { image: '', name: '', designation: '' },
    checkedBy: { image: '', name: '', designation: '' },
    approvedBy: { image: '', name: '', designation: '' },
    seller: { image: DEFAULT_SELLER_SIGNATURE_DATA_URL, name: '', designation: '' },
    buyer: { image: '', name: '', designation: '' }
  }
};

/** Deep-merges a raw design onto the defaults so partial payloads are safe. */
export function normalizePrintDesign(input = {}) {
  const design = clone(DEFAULT_PO_PRINT_DESIGN);
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

  if (input.supplier && typeof input.supplier === 'object') {
    const supplier = input.supplier;
    Object.keys(design.supplier).forEach((key) => {
      design.supplier[key] = typeof supplier[key] === 'string' ? supplier[key] : design.supplier[key];
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
  return design;
}

/* ------------------------------------------------------------------ */
/*  Saved document templates (localStorage)                            */
/* ------------------------------------------------------------------ */

function readTemplates() {
  const list = readStorage(PO_TEMPLATES_KEY);
  return Array.isArray(list) ? list : [];
}

function writeTemplates(list) {
  writeStorage(PO_TEMPLATES_KEY, list);
}

export const poPrintTemplateStore = {
  /** All saved templates, newest first. */
  all() {
    return readTemplates();
  },

  /**
   * Saves a template from a design + a display name. Transactional
   * values are never stored — the template keeps the layout, branding
   * and visibility choices only, always reusable on another PO.
   */
  save({ name = '', design = {} } = {}) {
    const label = String(name || '').trim();
    if (!label) return null;
    const normalized = normalizePrintDesign(design);
    /* Templates are reusable across POs — they never capture the PO's
       supplier snapshot or logo (both are document-specific). */
    const stored = { ...normalized, supplier: clone(DEFAULT_PO_PRINT_DESIGN.supplier) };
    const templates = readTemplates();
    const existing = templates.find((t) => t.name.toLowerCase() === label.toLowerCase());
    const now = new Date().toISOString();
    const template = existing
      ? { ...existing, name: label, design: stored, updatedAt: now }
      : {
          id: `po-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    const templateDesign = normalizePrintDesign(template.design);
    const merged = normalizePrintDesign(baseDesign);
    Object.keys(templateDesign).forEach((key) => {
      if (key === 'supplier') return;
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

export const PO_PRINT_HEADER_LABELS = {
  poTitle: 'PURCHASE ORDER',
  orderNo: '',
  date: '',
  prRef: '',
  deliveryDate: '',
  contactPerson: '',
  phone: '',
  email: ''
};

export default {
  SIGNATURE_LAYOUTS,
  SIGNATURE_ROLES,
  DEFAULT_PO_PRINT_DESIGN,
  normalizePrintDesign,
  poPrintTemplateStore,
  PO_PRINT_HEADER_LABELS
};

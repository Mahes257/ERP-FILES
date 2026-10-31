/**
 * purchase/utils/sourceNavigation.js
 * ------------------------------------------------------------------
 * Centralized route resolver for document ↔ business record linking.
 *
 * Maps every document stage and source type to the correct ERP page
 * route. Used by:
 *   • PurchaseDocuments — "Open Source" / "Print" actions
 *   • SourceDocumentsDrawer — documents section inside source records
 *   • Any future component that needs to navigate to a source record
 *
 * Single source of truth — never duplicate route maps.
 * ------------------------------------------------------------------
 */
import { DOCUMENT_STAGE } from '../constants';

/**
 * Stage → base route (without ID) for list/detail navigation.
 * Every entry maps to an existing route in purchaseRoutes.jsx.
 */
const STAGE_ROUTES = {
  [DOCUMENT_STAGE.PR]:          '/purchase/requisition',
  [DOCUMENT_STAGE.RFQ]:         '/purchase/rfq',
  [DOCUMENT_STAGE.QUOTATION]:   '/purchase/rfq/quotations',
  [DOCUMENT_STAGE.PCS]:         '/purchase/rfq/price-comparative-statement',
  [DOCUMENT_STAGE.NEGOTIATION]: '/purchase/rfq/negotiation',
  [DOCUMENT_STAGE.NFA]:         '/purchase/rfq/approval',
  [DOCUMENT_STAGE.SELECTION]:   '/purchase/rfq/technical-evaluation',
  [DOCUMENT_STAGE.PO]:          '/purchase/orders',
  [DOCUMENT_STAGE.GRN]:         '/purchase/logistics/grn',
  [DOCUMENT_STAGE.INVOICE]:     '/purchase/invoices',
  [DOCUMENT_STAGE.PAYMENT]:     '/purchase/invoices/payment-advice',
  'Vendor Management':          '/purchase/vendors'
};

/**
 * Stage → print route suffix (appended to base + /{sourceId}).
 */
const STAGE_PRINT_SUFFIX = {
  [DOCUMENT_STAGE.PR]:          '/print',
  [DOCUMENT_STAGE.RFQ]:         '/print',
  [DOCUMENT_STAGE.QUOTATION]:   '',
  [DOCUMENT_STAGE.PCS]:         '',
  [DOCUMENT_STAGE.NEGOTIATION]: '',
  [DOCUMENT_STAGE.NFA]:         '',
  [DOCUMENT_STAGE.SELECTION]:   '',
  [DOCUMENT_STAGE.PO]:          '/print',
  [DOCUMENT_STAGE.GRN]:         '',
  [DOCUMENT_STAGE.INVOICE]:     '',
  [DOCUMENT_STAGE.PAYMENT]:     ''
};

/**
 * Stage → human-readable label for the source link.
 */
const STAGE_LABELS = {
  [DOCUMENT_STAGE.PR]:          'Purchase Requisition',
  [DOCUMENT_STAGE.RFQ]:         'RFQ',
  [DOCUMENT_STAGE.QUOTATION]:   'Quotation',
  [DOCUMENT_STAGE.PCS]:         'Price Comparative Statement',
  [DOCUMENT_STAGE.NEGOTIATION]: 'Negotiation',
  [DOCUMENT_STAGE.NFA]:         'Approval Note',
  [DOCUMENT_STAGE.SELECTION]:   'Technical Evaluation',
  [DOCUMENT_STAGE.PO]:          'Purchase Order',
  [DOCUMENT_STAGE.GRN]:         'Goods Receipt',
  [DOCUMENT_STAGE.INVOICE]:     'Invoice',
  [DOCUMENT_STAGE.PAYMENT]:     'Payment Advice'
};

/**
 * Source type key → base route (used when stage is not set but sourceType is).
 * Maps the documentRegistration.js DOC_TYPE_MAP keys to routes.
 */
const SOURCE_TYPE_ROUTES = {
  PR:                  '/purchase/requisition',
  RFQ:                 '/purchase/rfq',
  QUOTATION:           '/purchase/rfq/quotations',
  TECHNICAL_EVALUATION: '/purchase/rfq/technical-evaluation',
  PO:                  '/purchase/orders',
  SUPPLIER_ACK:        '/purchase/orders',
  INVOICE:             '/purchase/invoices',
  NFA:                 '/purchase/rfq/approval',
  GRN:                 '/purchase/logistics/grn',
  REPORT:              '/purchase/reports',
  VENDOR:              '/purchase/vendors'
};

/**
 * Resolve the navigation route for a document record.
 *
 * @param {Object} doc - Document record from the repository
 * @returns {{ route: string, label: string, canNavigate: boolean }}
 */
export function resolveSourceRoute(doc) {
  if (!doc) return { route: '', label: '', canNavigate: false };

  const stage = doc.stage || '';
  const sourceId = doc.sourceId || '';
  const sourceType = doc.sourceType || '';

  /* Try stage-based routing first */
  let base = STAGE_ROUTES[stage];

  /* Fallback to sourceType-based routing */
  if (!base && sourceType) {
    base = SOURCE_TYPE_ROUTES[sourceType];
  }

  if (!base) return { route: '', label: STAGE_LABELS[stage] || stage, canNavigate: false };

  /* GRN uses grnNo instead of id in the URL */
  if (stage === DOCUMENT_STAGE.GRN && doc.sourceLabel) {
    return {
      route: `${base}/${doc.sourceLabel}`,
      label: STAGE_LABELS[stage] || stage,
      canNavigate: true
    };
  }

  /* If we have a sourceId, navigate to the detail page */
  if (sourceId) {
    return {
      route: `${base}/${sourceId}`,
      label: STAGE_LABELS[stage] || stage,
      canNavigate: true
    };
  }

  /* No sourceId — navigate to the list page */
  return {
    route: base,
    label: STAGE_LABELS[stage] || stage,
    canNavigate: true
  };
}

/**
 * Resolve the print route for a document record.
 *
 * @param {Object} doc - Document record from the repository
 * @returns {{ route: string, canPrint: boolean }}
 */
export function resolvePrintRoute(doc) {
  if (!doc) return { route: '', canPrint: false };

  const stage = doc.stage || '';
  const sourceId = doc.sourceId || '';
  const base = STAGE_ROUTES[stage];

  if (!base) return { route: '', canPrint: false };

  const suffix = STAGE_PRINT_SUFFIX[stage] || '';

  /* GRN uses grnNo */
  if (stage === DOCUMENT_STAGE.GRN && doc.sourceLabel) {
    return {
      route: `${base}/${doc.sourceLabel}${suffix}`,
      canPrint: Boolean(suffix)
    };
  }

  if (sourceId && suffix) {
    return {
      route: `${base}/${sourceId}${suffix}`,
      canPrint: true
    };
  }

  return { route: '', canPrint: false };
}

/**
 * Get a list of documents linked to a specific source record.
 *
 * @param {Object[]} allDocuments - All documents from the repository
 * @param {string} sourceId - The source record ID
 * @param {string} [stage] - Optional stage filter
 * @returns {Object[]} Filtered documents
 */
export function getDocumentsForSource(allDocuments, sourceId, stage) {
  if (!allDocuments || !sourceId) return [];
  return allDocuments.filter((doc) => {
    if (doc.sourceId !== sourceId) return false;
    if (stage && doc.stage !== stage) return false;
    return doc.recordState === 'active';
  });
}

export { STAGE_ROUTES, STAGE_PRINT_SUFFIX, STAGE_LABELS, SOURCE_TYPE_ROUTES };

/**
 * purchase/utils/sourceNavigation.test.js
 * ------------------------------------------------------------------
 * Tests for document ↔ business record linking and navigation.
 *
 * Proves: document stage → correct ERP page route
 * Proves: source navigation resolver handles all source types
 * Proves: documents for source filtering works correctly
 * ------------------------------------------------------------------
 */
import { describe, it, expect } from 'vitest';
import { DOCUMENT_STAGE } from '../constants';
import {
  resolveSourceRoute,
  resolvePrintRoute,
  getDocumentsForSource,
  STAGE_ROUTES,
  STAGE_LABELS,
  SOURCE_TYPE_ROUTES
} from './sourceNavigation';

/* ================================================================== */
/*  STAGE_ROUTES constants                                             */
/* ================================================================== */
describe('STAGE_ROUTES', () => {
  it('has routes for all standard stages', () => {
    expect(STAGE_ROUTES[DOCUMENT_STAGE.PR]).toBe('/purchase/requisition');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.RFQ]).toBe('/purchase/rfq');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.QUOTATION]).toBe('/purchase/rfq/quotations');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.PCS]).toBe('/purchase/rfq/price-comparative-statement');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.NEGOTIATION]).toBe('/purchase/rfq/negotiation');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.NFA]).toBe('/purchase/rfq/approval');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.SELECTION]).toBe('/purchase/rfq/technical-evaluation');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.PO]).toBe('/purchase/orders');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.GRN]).toBe('/purchase/logistics/grn');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.INVOICE]).toBe('/purchase/invoices');
    expect(STAGE_ROUTES[DOCUMENT_STAGE.PAYMENT]).toBe('/purchase/invoices/payment-advice');
  });

  it('every route starts with /purchase/', () => {
    for (const [stage, route] of Object.entries(STAGE_ROUTES)) {
      expect(route, `${stage} route should start with /purchase/`).toMatch(/^\/purchase\//);
    }
  });
});

/* ================================================================== */
/*  STAGE_LABELS                                                       */
/* ================================================================== */
describe('STAGE_LABELS', () => {
  it('has labels for all standard stages', () => {
    expect(STAGE_LABELS[DOCUMENT_STAGE.PR]).toBe('Purchase Requisition');
    expect(STAGE_LABELS[DOCUMENT_STAGE.RFQ]).toBe('RFQ');
    expect(STAGE_LABELS[DOCUMENT_STAGE.PO]).toBe('Purchase Order');
    expect(STAGE_LABELS[DOCUMENT_STAGE.INVOICE]).toBe('Invoice');
    expect(STAGE_LABELS[DOCUMENT_STAGE.NFA]).toBe('Approval Note');
    expect(STAGE_LABELS[DOCUMENT_STAGE.GRN]).toBe('Goods Receipt');
  });
});

/* ================================================================== */
/*  SOURCE_TYPE_ROUTES                                                 */
/* ================================================================== */
describe('SOURCE_TYPE_ROUTES', () => {
  it('maps source type keys to routes', () => {
    expect(SOURCE_TYPE_ROUTES.PR).toBe('/purchase/requisition');
    expect(SOURCE_TYPE_ROUTES.RFQ).toBe('/purchase/rfq');
    expect(SOURCE_TYPE_ROUTES.PO).toBe('/purchase/orders');
    expect(SOURCE_TYPE_ROUTES.INVOICE).toBe('/purchase/invoices');
    expect(SOURCE_TYPE_ROUTES.NFA).toBe('/purchase/rfq/approval');
    expect(SOURCE_TYPE_ROUTES.VENDOR).toBe('/purchase/vendors');
  });
});

/* ================================================================== */
/*  resolveSourceRoute                                                 */
/* ================================================================== */
describe('resolveSourceRoute', () => {
  it('PR → Requisition detail page', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.PR,
      sourceId: 'PR-001'
    });
    expect(result.route).toBe('/purchase/requisition/PR-001');
    expect(result.label).toBe('Purchase Requisition');
    expect(result.canNavigate).toBe(true);
  });

  it('RFQ → RFQ detail page', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.RFQ,
      sourceId: 'RFQ-001'
    });
    expect(result.route).toBe('/purchase/rfq/RFQ-001');
    expect(result.label).toBe('RFQ');
    expect(result.canNavigate).toBe(true);
  });

  it('PO → Purchase Order detail page', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.PO,
      sourceId: 'PO-001'
    });
    expect(result.route).toBe('/purchase/orders/PO-001');
    expect(result.label).toBe('Purchase Order');
    expect(result.canNavigate).toBe(true);
  });

  it('Invoice → Invoice detail page', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.INVOICE,
      sourceId: 'INV-001'
    });
    expect(result.route).toBe('/purchase/invoices/INV-001');
    expect(result.label).toBe('Invoice');
    expect(result.canNavigate).toBe(true);
  });

  it('NFA → Approval detail page', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.NFA,
      sourceId: 'NFA-001'
    });
    expect(result.route).toBe('/purchase/rfq/approval/NFA-001');
    expect(result.label).toBe('Approval Note');
    expect(result.canNavigate).toBe(true);
  });

  it('GRN → Logistics detail page using grnNo', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.GRN,
      sourceId: 'GRN-001',
      sourceLabel: 'GRN-2026-001'
    });
    expect(result.route).toBe('/purchase/logistics/grn/GRN-2026-001');
    expect(result.canNavigate).toBe(true);
  });

  it('Technical Evaluation → Technical Evaluation detail', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.SELECTION,
      sourceId: 'RFQ-001'
    });
    expect(result.route).toBe('/purchase/rfq/technical-evaluation/RFQ-001');
    expect(result.canNavigate).toBe(true);
  });

  it('Quotation → Quotations list (no sourceId navigation)', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.QUOTATION,
      sourceId: ''
    });
    expect(result.route).toBe('/purchase/rfq/quotations');
    expect(result.canNavigate).toBe(true);
  });

  it('falls back to sourceType when stage is not set', () => {
    const result = resolveSourceRoute({
      stage: '',
      sourceType: 'PO',
      sourceId: 'PO-001'
    });
    expect(result.route).toBe('/purchase/orders/PO-001');
    expect(result.canNavigate).toBe(true);
  });

  it('returns canNavigate=false for unknown stage and sourceType', () => {
    const result = resolveSourceRoute({
      stage: 'UNKNOWN',
      sourceType: 'UNKNOWN',
      sourceId: 'X'
    });
    expect(result.canNavigate).toBe(false);
  });

  it('navigates to list page when sourceId is missing', () => {
    const result = resolveSourceRoute({
      stage: DOCUMENT_STAGE.PO,
      sourceId: ''
    });
    expect(result.route).toBe('/purchase/orders');
    expect(result.canNavigate).toBe(true);
  });

  it('handles null doc gracefully', () => {
    const result = resolveSourceRoute(null);
    expect(result.canNavigate).toBe(false);
    expect(result.route).toBe('');
  });
});

/* ================================================================== */
/*  resolvePrintRoute                                                  */
/* ================================================================== */
describe('resolvePrintRoute', () => {
  it('PR → print page', () => {
    const result = resolvePrintRoute({
      stage: DOCUMENT_STAGE.PR,
      sourceId: 'PR-001'
    });
    expect(result.route).toBe('/purchase/requisition/PR-001/print');
    expect(result.canPrint).toBe(true);
  });

  it('RFQ → print page', () => {
    const result = resolvePrintRoute({
      stage: DOCUMENT_STAGE.RFQ,
      sourceId: 'RFQ-001'
    });
    expect(result.route).toBe('/purchase/rfq/RFQ-001/print');
    expect(result.canPrint).toBe(true);
  });

  it('PO → print page', () => {
    const result = resolvePrintRoute({
      stage: DOCUMENT_STAGE.PO,
      sourceId: 'PO-001'
    });
    expect(result.route).toBe('/purchase/orders/PO-001/print');
    expect(result.canPrint).toBe(true);
  });

  it('Invoice → no print route', () => {
    const result = resolvePrintRoute({
      stage: DOCUMENT_STAGE.INVOICE,
      sourceId: 'INV-001'
    });
    expect(result.canPrint).toBe(false);
  });

  it('NFA → no print route', () => {
    const result = resolvePrintRoute({
      stage: DOCUMENT_STAGE.NFA,
      sourceId: 'NFA-001'
    });
    expect(result.canPrint).toBe(false);
  });

  it('returns canPrint=false for unknown stage', () => {
    const result = resolvePrintRoute({
      stage: 'UNKNOWN',
      sourceId: 'X'
    });
    expect(result.canPrint).toBe(false);
  });

  it('returns canPrint=false for null doc', () => {
    const result = resolvePrintRoute(null);
    expect(result.canPrint).toBe(false);
  });
});

/* ================================================================== */
/*  getDocumentsForSource                                              */
/* ================================================================== */
describe('getDocumentsForSource', () => {
  const testDocs = [
    { docId: '1', sourceId: 'PO-001', stage: 'Purchase Order', recordState: 'active', name: 'PO PDF' },
    { docId: '2', sourceId: 'PO-001', stage: 'Purchase Order', recordState: 'active', name: 'Acknowledgement' },
    { docId: '3', sourceId: 'PO-001', stage: 'Purchase Order', recordState: 'deleted', name: 'Deleted doc' },
    { docId: '4', sourceId: 'RFQ-001', stage: 'RFQ', recordState: 'active', name: 'RFQ PDF' },
    { docId: '5', sourceId: 'INV-001', stage: 'Purchase Invoice', recordState: 'active', name: 'Invoice PDF' }
  ];

  it('returns all active documents for a source', () => {
    const result = getDocumentsForSource(testDocs, 'PO-001');
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.sourceId === 'PO-001')).toBe(true);
    expect(result.every((d) => d.recordState === 'active')).toBe(true);
  });

  it('filters by stage when provided', () => {
    const result = getDocumentsForSource(testDocs, 'PO-001', 'Purchase Order');
    expect(result).toHaveLength(2);
  });

  it('excludes deleted documents', () => {
    const result = getDocumentsForSource(testDocs, 'PO-001');
    expect(result.every((d) => d.recordState === 'active')).toBe(true);
  });

  it('returns empty for unknown sourceId', () => {
    const result = getDocumentsForSource(testDocs, 'UNKNOWN');
    expect(result).toHaveLength(0);
  });

  it('returns empty for null input', () => {
    expect(getDocumentsForSource(null, 'PO-001')).toHaveLength(0);
    expect(getDocumentsForSource(testDocs, null)).toHaveLength(0);
  });

  it('RFQ source returns RFQ documents', () => {
    const result = getDocumentsForSource(testDocs, 'RFQ-001');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('RFQ PDF');
  });

  it('Invoice source returns invoice documents', () => {
    const result = getDocumentsForSource(testDocs, 'INV-001');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Invoice PDF');
  });
});

/* ================================================================== */
/*  Source → Document → Navigation integration                         */
/* ================================================================== */
describe('Source → Document → Navigation integration', () => {
  it('PO document navigates to PO detail page', () => {
    const doc = { stage: DOCUMENT_STAGE.PO, sourceId: 'PO-123', sourceType: 'pdf' };
    const { route, canNavigate } = resolveSourceRoute(doc);
    expect(canNavigate).toBe(true);
    expect(route).toBe('/purchase/orders/PO-123');
  });

  it('PR document navigates to PR detail page', () => {
    const doc = { stage: DOCUMENT_STAGE.PR, sourceId: 'PR-456', sourceType: 'pdf' };
    const { route, canNavigate } = resolveSourceRoute(doc);
    expect(canNavigate).toBe(true);
    expect(route).toBe('/purchase/requisition/PR-456');
  });

  it('RFQ document navigates to RFQ detail page', () => {
    const doc = { stage: DOCUMENT_STAGE.RFQ, sourceId: 'RFQ-789', sourceType: 'pdf' };
    const { route, canNavigate } = resolveSourceRoute(doc);
    expect(canNavigate).toBe(true);
    expect(route).toBe('/purchase/rfq/RFQ-789');
  });

  it('Invoice document navigates to Invoice detail page', () => {
    const doc = { stage: DOCUMENT_STAGE.INVOICE, sourceId: 'INV-101', sourceType: 'pdf' };
    const { route, canNavigate } = resolveSourceRoute(doc);
    expect(canNavigate).toBe(true);
    expect(route).toBe('/purchase/invoices/INV-101');
  });

  it('NFA document navigates to Approval detail page', () => {
    const doc = { stage: DOCUMENT_STAGE.NFA, sourceId: 'NFA-202', sourceType: 'pdf' };
    const { route, canNavigate } = resolveSourceRoute(doc);
    expect(canNavigate).toBe(true);
    expect(route).toBe('/purchase/rfq/approval/NFA-202');
  });

  it('GRN document navigates to GRN detail page using grnNo', () => {
    const doc = { stage: DOCUMENT_STAGE.GRN, sourceId: 'GRN-303', sourceLabel: 'GRN-2026-303', sourceType: 'pdf' };
    const { route, canNavigate } = resolveSourceRoute(doc);
    expect(canNavigate).toBe(true);
    expect(route).toBe('/purchase/logistics/grn/GRN-2026-303');
  });

  it('PO print navigates to PO print page', () => {
    const doc = { stage: DOCUMENT_STAGE.PO, sourceId: 'PO-123' };
    const { route, canPrint } = resolvePrintRoute(doc);
    expect(canPrint).toBe(true);
    expect(route).toBe('/purchase/orders/PO-123/print');
  });

  it('PR print navigates to PR print page', () => {
    const doc = { stage: DOCUMENT_STAGE.PR, sourceId: 'PR-456' };
    const { route, canPrint } = resolvePrintRoute(doc);
    expect(canPrint).toBe(true);
    expect(route).toBe('/purchase/requisition/PR-456/print');
  });

  it('all routes match existing purchaseRoutes.jsx paths', () => {
    /* Verify every STAGE_ROUTES value is a valid route prefix */
    const validPrefixes = [
      '/purchase/requisition',
      '/purchase/rfq',
      '/purchase/orders',
      '/purchase/logistics',
      '/purchase/invoices',
      '/purchase/vendors',
      '/purchase/reports'
    ];
    for (const [stage, route] of Object.entries(STAGE_ROUTES)) {
      const matches = validPrefixes.some((p) => route.startsWith(p));
      expect(matches, `${stage} route ${route} should match a valid prefix`).toBe(true);
    }
  });
});

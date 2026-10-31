/**
 * purchase/pages/approval/nfaCreateSelection.test.js
 * ------------------------------------------------------------------
 * Tests for the Technical Evaluation → Approval navigation fix:
 *
 *   Technical Evaluation → [Proceed to Approval] → Create Approval
 *   Note with the SAME RFQ pre-selected via ?rfqId=<current-rfq-id>.
 *
 *   A. approvalCreateRoute builds /purchase/rfq/approval/new?rfqId=<id>
 *   B. selectInitialRfqId selects the exact RFQ when ?rfqId matches
 *   C. selectInitialRfqId preserves the default candidate behaviour
 *      (candidates[0]) when there is no rfqId query parameter
 *   D. an invalid / ineligible rfqId never silently selects
 *      candidates[0] — the page shows the validation state instead
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvalCreateRoute, sameRfqId, selectInitialRfqId } from '../../utils/approvalCreateFlow';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CANDIDATES = [
  { rfqId: 'RFQ-2026-0001', rfqNo: 'RFQ-2026-0001', title: 'Hydraulic hoses and couplings', supplier: 'Tata Steel Ltd' },
  { rfqId: 'RFQ-2026-0003', rfqNo: 'RFQ-2026-0003', title: 'SS pipes for pneumatic lines', supplier: 'JSW Steel' }
];

/* ═══════════════════════════════════════════════════════════════════ */
/*  A. Proceed to Approval → /purchase/rfq/approval/new?rfqId=<id>     */
/* ═══════════════════════════════════════════════════════════════════ */
describe('approvalCreateRoute — Technical Evaluation → Approval Note create', () => {
  it('A. builds /purchase/rfq/approval/new?rfqId=<current-rfq-id>', () => {
    expect(approvalCreateRoute('RFQ-2026-0001')).toBe('/purchase/rfq/approval/new?rfqId=RFQ-2026-0001');
  });

  it('A. uses the CURRENT RFQ id — never a hard-coded RFQ or supplier', () => {
    const rfqId = 'RFQ-2026-0042';
    const route = approvalCreateRoute(rfqId);
    expect(route.startsWith('/purchase/rfq/approval/new?rfqId=')).toBe(true);
    expect(route).toContain(encodeURIComponent(rfqId));
    expect(route).not.toBe('/purchase/rfq/approval');
    expect(route).not.toMatch(/supplier/i);
  });

  it('A. the create route is NOT the generic Approval Flow list route', () => {
    expect(approvalCreateRoute('RFQ-2026-0001')).not.toBe('/purchase/rfq/approval');
    expect(approvalCreateRoute('RFQ-2026-0001')).toMatch(/^\/purchase\/rfq\/approval\/new\?rfqId=/);
  });

  it('A. the /purchase/rfq/approval/new route is registered in purchaseRoutes', () => {
    const routesPath = path.resolve(__dirname, '../../routes/purchaseRoutes.jsx');
    const content = fs.readFileSync(routesPath, 'utf-8');
    expect(content).toContain('path="rfq/approval/new"');
    /* The existing routes must remain untouched. */
    expect(content).toContain('path="rfq/approval"');
    expect(content).toContain('path="rfq/approval/:id"');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  B/C/D. selectInitialRfqId — pre-selecting the Source RFQ           */
/* ═══════════════════════════════════════════════════════════════════ */
describe('selectInitialRfqId — pre-selecting the Source RFQ', () => {
  it('B. selects the exact RFQ when ?rfqId matches a candidate', () => {
    expect(selectInitialRfqId(CANDIDATES, 'RFQ-2026-0001')).toBe('RFQ-2026-0001');
    expect(selectInitialRfqId(CANDIDATES, 'RFQ-2026-0003')).toBe('RFQ-2026-0003');
  });

  it('B. matches by rfqId, so a non-first candidate is selected too', () => {
    expect(selectInitialRfqId(CANDIDATES, 'RFQ-2026-0003')).toBe('RFQ-2026-0003');
    expect(selectInitialRfqId(CANDIDATES, 'RFQ-2026-0003')).not.toBe('RFQ-2026-0001');
  });

  it('C. without an rfqId defaults to the first eligible candidate', () => {
    expect(selectInitialRfqId(CANDIDATES)).toBe('RFQ-2026-0001');
    expect(selectInitialRfqId(CANDIDATES, '')).toBe('RFQ-2026-0001');
    expect(selectInitialRfqId(CANDIDATES, '   ')).toBe('RFQ-2026-0001');
  });

  it('D. an ineligible rfqId returns "" — never silently selecting candidates[0]', () => {
    expect(selectInitialRfqId(CANDIDATES, 'RFQ-2026-9999')).toBe('');
    expect(selectInitialRfqId(CANDIDATES, 'not-a-real-id')).toBe('');
  });

  it('D. an RFQ that already has an NFA (absent from candidates) is not replaced', () => {
    /* RFQ-2026-0002 already has a note, so it is not among the candidates. */
    expect(selectInitialRfqId(CANDIDATES, 'RFQ-2026-0002')).toBe('');
  });

  it('handles empty candidate lists', () => {
    expect(selectInitialRfqId([], 'RFQ-2026-0001')).toBe('');
    expect(selectInitialRfqId([])).toBe('');
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  B'. the REAL candidate shape — numeric rfq.id vs string ?rfqId=     */
/*                                                                     */
/*  getNfaCandidates() builds candidates from the RFQ store, where      */
/*  rfq.id is a NUMBER, while the query parameter / <select> value is   */
/*  ALWAYS a string. Strict equality therefore never matched, so a       */
/*  legitimately eligible RFQ (?rfqId=5) was reported as ineligible and  */
/*  the create page rendered "No Eligible RFQs".                        */
/* ═══════════════════════════════════════════════════════════════════ */
const NUMERIC_CANDIDATES = [
  { rfqId: 5, rfqNo: 'RFQ-2026-0037', title: 'E2E APPROVAL FLOW TEST', supplier: 'TechVision Engineering Solutions' },
  { rfqId: 3, rfqNo: 'RFQ-2026-0027', title: 'TEST RFQ DATA FLOW', supplier: 'TechVision Engineering Solutions' }
];

describe('selectInitialRfqId — real numeric candidate ids (rfq.id)', () => {
  it("B'. a numeric candidate is selected from the string ?rfqId param", () => {
    expect(selectInitialRfqId(NUMERIC_CANDIDATES, '5')).toBe('5');
    expect(selectInitialRfqId(NUMERIC_CANDIDATES, '3')).toBe('3');
  });

  it("B'. a non-first numeric candidate is selected too", () => {
    expect(selectInitialRfqId(NUMERIC_CANDIDATES, '3')).toBe('3');
    expect(selectInitialRfqId(NUMERIC_CANDIDATES, '3')).not.toBe('5');
  });

  it("C'. without an rfqId the first numeric candidate is the default", () => {
    expect(selectInitialRfqId(NUMERIC_CANDIDATES)).toBe('5');
    expect(selectInitialRfqId(NUMERIC_CANDIDATES, '')).toBe('5');
  });

  it("D'. an ineligible numeric id still returns '' — never candidates[0]", () => {
    expect(selectInitialRfqId(NUMERIC_CANDIDATES, '9999')).toBe('');
  });

  it('sameRfqId compares across number/string without matching empties', () => {
    expect(sameRfqId(5, '5')).toBe(true);
    expect(sameRfqId('5', 5)).toBe(true);
    expect(sameRfqId(5, 5)).toBe(true);
    expect(sameRfqId(5, '6')).toBe(false);
    expect(sameRfqId(5, ' 5 ')).toBe(true);
    /* undefined/'' must never match an absent id — that is what made the
       create page show the validation state for no reason. */
    expect(sameRfqId(undefined, '')).toBe(false);
    expect(sameRfqId(null, '5')).toBe(false);
    expect(sameRfqId(5, '')).toBe(false);
  });
});
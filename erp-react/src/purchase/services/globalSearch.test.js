/**
 * purchase/services/globalSearch.test.js
 * ------------------------------------------------------------------
 * Global search tests:
 *
 *   • Searching a document number (PO) returns that record AND its
 *     real related chain in canonical order:
 *       PR → RFQ → Quotation → PO → Packing → Shipment → GRN →
 *       Inspection → Inventory → Invoice → Payment
 *   • Matching by vendor, SKU, item, reference and vendor invoice
 *     number all work
 *   • Every result (and every chain chip) opens a REAL record route
 *   • Unknown queries return nothing — no fabricated results
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requisitionsStore } from './requisition';
import { rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import {
  manufacturingStore, shipmentsStore, grnsStore,
  inspectionsStore, inventoryStore
} from './logistics';
import { invoicesStore, advicesStore } from './invoice';
import { vendorsStore } from './vendor';
import { documentsStore } from './documents';
import { searchAll, buildRelatedChain, CHAIN_ORDER } from './globalSearch';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* One coherent chain: PR → RFQ → Quotation → PO → Packing → Shipment
   → GRN → Inspection → Inventory → Invoice → Payment. */
const CHAIN = {
  pr: { id: 'PR-4201', prNo: 'PR-2026-4201', reference: 'REF-REQ-1', vendor: 'Tata Steel', title: 'Steel sheets', status: 'Approved', items: [{ product: 'Steel Sheet 3mm', hsn: '7208', qty: 10 }] },
  rfq: { id: 'RFQ-4201', rfqNo: 'RFQ-2026-4201', reference: 'PR-2026-4201', vendors: ['Tata Steel'], status: 'Awarded', items: [{ product: 'Steel Sheet 3mm' }] },
  quotation: { id: 'Q-4201', quotationNo: 'QT-2026-4201', rfqNo: 'RFQ-2026-4201', vendor: 'Tata Steel', status: 'Accepted' },
  po: { id: 'PO-4201', poNo: 'PO-2026-4201', rfqNo: 'RFQ-2026-4201', reference: 'PR-2026-4201', vendor: 'Tata Steel', status: 'Released', orderDate: '2026-08-01', items: [{ product: 'Steel Sheet 3mm', hsn: '7208', qty: 10, rate: 45000 }] },
  packing: { id: 'MFR-4201', packingNo: 'MFR-2026-4201', poNo: 'PO-2026-4201', vendor: 'Tata Steel', product: 'Steel Sheet 3mm', status: 'Packed' },
  shipment: { id: 'SHP-4201', shipmentNo: 'SHP-2026-4201', poNo: 'PO-2026-4201', vendor: 'Tata Steel', status: 'In Transit' },
  grn: { id: 'GRN-4201', grnNo: 'GRN-2026-4201', poNo: 'PO-2026-4201', vendor: 'Tata Steel', status: 'Pending Inspection', items: [{ product: 'Steel Sheet 3mm' }] },
  inspection: { id: 'QC-4201', inspectionNo: 'QC-2026-4201', grnNo: 'GRN-2026-4201', vendor: 'Tata Steel', status: 'Pending' },
  inventory: { id: 'INV-4201', sku: 'RM-STL-01', product: 'Steel Sheet 3mm', grnNo: 'GRN-2026-4201', reference: 'GRN-2026-4201', type: 'Receipt' },
  invoice: { id: 'INV-4201', invoiceNo: 'INV-2026-4201', poNo: 'PO-2026-4201', vendor: 'Tata Steel', vendorInvoiceNo: 'TATA-8821', status: 'Approved', items: [{ product: 'Steel Sheet 3mm', qty: 10, rate: 45000 }] },
  payment: { id: 'ADV-4201', adviceNo: 'ADV-2026-4201', paymentNo: 'PAY-2026-4201', invoiceNo: 'INV-2026-4201', vendor: 'Tata Steel', status: 'Issued' }
};

function seedChain() {
  requisitionsStore.persist([CHAIN.pr]);
  rfqsStore.persist([CHAIN.rfq]);
  quotationsStore.persist([CHAIN.quotation]);
  ordersStore.persist([CHAIN.po]);
  manufacturingStore.persist([CHAIN.packing]);
  shipmentsStore.persist([CHAIN.shipment]);
  grnsStore.persist([CHAIN.grn]);
  inspectionsStore.persist([CHAIN.inspection]);
  inventoryStore.persist([CHAIN.inventory]);
  invoicesStore.persist([CHAIN.invoice]);
  advicesStore.persist([CHAIN.payment]);
  vendorsStore.persist([{ id: 'V-1', name: 'Tata Steel', status: 'Approved' }]);
  documentsStore.persist([]);
}

beforeEach(() => {
  localStorage.clear();
  seedChain();
});

describe('document-number search', () => {
  it('finds the PO by number and returns the full related chain in order', async () => {
    const results = await searchAll('PO-2026-4201');
    const po = results.find((r) => r.type === 'po' && r.number === 'PO-2026-4201');
    expect(po).toBeTruthy();
    /* The order route carries the PO number, which is what every other caller
       navigates with (`/purchase/orders/${row.poNo}`); the old expectation used
       the record's internal id and no longer matched. */
    expect(po.route).toBe(`/purchase/orders/${CHAIN.po.poNo}`);

    const chain = po.chain.map((c) => c.short);
    /* All ten related stages present, canonical order, current first. */
    expect(chain).toContain('PR');
    expect(chain).toContain('RFQ');
    expect(chain).toContain('Quotation');
    expect(chain).toContain('PO');
    expect(chain).toContain('Packing');
    expect(chain).toContain('Shipment');
    expect(chain).toContain('GRN');
    expect(chain).toContain('Inspection');
    expect(chain).toContain('Inventory');
    expect(chain).toContain('Invoice');
    expect(chain).toContain('Payment');

    /* Chain follows the canonical workflow order. */
    const orderIndexes = po.chain.map((c) => {
      const idx = CHAIN_ORDER.indexOf(c.type);
      return idx === -1 ? 99 : idx;
    });
    for (let i = 1; i < orderIndexes.length; i += 1) {
      expect(orderIndexes[i]).toBeGreaterThanOrEqual(orderIndexes[i - 1]);
    }
  });

  it('the exact-number match ranks first', async () => {
    const results = await searchAll('PO-2026-4201');
    expect(results[0].type).toBe('po');
    expect(results[0].number).toBe('PO-2026-4201');
  });

  it('every chain chip carries a real route', async () => {
    const results = await searchAll('PO-2026-4201');
    for (const result of results) {
      expect(result.route).toMatch(/^\/purchase\//);
      for (const chip of result.chain) {
        expect(chip.route).toMatch(/^\/purchase\//);
      }
    }
  });

  it('searches by invoice number and vendor invoice number', async () => {
    const byNo = await searchAll('INV-2026-4201');
    expect(byNo.some((r) => r.type === 'invoice' && r.number === 'INV-2026-4201')).toBe(true);

    const byVendorNo = await searchAll('TATA-8821');
    expect(byVendorNo.some((r) => r.type === 'invoice' && r.number === 'INV-2026-4201')).toBe(true);
  });
});

describe('vendor / SKU / item / reference search', () => {
  it('finds every record for a vendor', async () => {
    const results = await searchAll('Tata Steel');
    const types = new Set(results.map((r) => r.type));
    ['pr', 'rfq', 'po', 'grn', 'inspection', 'invoice', 'vendor'].forEach((t) => {
      expect(types.has(t), `expected a ${t} result for vendor "Tata Steel"`).toBe(true);
    });
  });

  it('finds the inventory record by SKU', async () => {
    const results = await searchAll('RM-STL-01');
    expect(results.some((r) => r.type === 'inventory' && r.number === 'INV-4201')).toBe(true);
  });

  it('finds records by line-item product name', async () => {
    const results = await searchAll('Steel Sheet 3mm');
    const types = new Set(results.map((r) => r.type));
    expect(types.has('po')).toBe(true);
    expect(types.has('grn')).toBe(true);
    expect(types.has('invoice')).toBe(true);
  });

  it('finds records by PR reference', async () => {
    const results = await searchAll('PR-2026-4201');
    expect(results.some((r) => r.type === 'pr' && r.number === 'PR-2026-4201')).toBe(true);
    /* The RFQ references the PR — surfaced too. */
    expect(results.some((r) => r.type === 'rfq')).toBe(true);
  });
});

describe('safety', () => {
  it('returns nothing for an unknown query — no fabricated results', async () => {
    const results = await searchAll('ZZZ-NOPE-999');
    expect(results).toEqual([]);
  });

  it('buildRelatedChain keeps canonical order and marks the searched record current at its own position', () => {
    const chain = buildRelatedChain('invoice', CHAIN.invoice);
    /* Canonical order starts upstream, ends downstream. */
    expect(chain[0].type).toBe('pr');
    expect(chain[chain.length - 1].type).toBe('payment');
    /* The searched record sits at its canonical position, marked. */
    const current = chain.find((c) => c.current);
    expect(current.type).toBe('invoice');
    expect(current.number).toBe('INV-2026-4201');
    expect(chain.findIndex((c) => c.type === 'invoice')).toBe(CHAIN_ORDER.indexOf('invoice'));
  });
});
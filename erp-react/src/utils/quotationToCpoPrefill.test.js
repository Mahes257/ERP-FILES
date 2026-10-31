/**
 * src/utils/quotationToCpoPrefill.test.js
 * ---------------------------------------------------------------------------
 * Quotation → Customer Purchase Order: "Convert to Customer Purchase Order"
 * opens the EXISTING CPO create form (`/sales-orders/new?fromQuotation=<id>`)
 * pre-filled from the quotation's persisted record.
 *
 *   MAPPING   the shared mapper (`quotationToCpoForm` / `quotationToCpoItems`)
 *             copies only fields both documents share — client, references,
 *             addresses, currency, tax type, terms, and every item's
 *             description / sku / drawing / material / HSN / UOM / qty / rate /
 *             discount / GST — and never invents values.
 *   WIRING    both quotation entry points (list row menu + Overview header)
 *             navigate to that route, and the CPO form records the conversion
 *             reference only on SAVE (opening the page creates nothing).
 *
 * Run: npx vitest run src/utils/quotationToCpoPrefill.test.js
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  quotationCpoTaxType,
  quotationToCpoForm,
  quotationToCpoItems
} from './quotationToCpoPrefill';

const root = join(import.meta.dirname, '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const CONFIG = 'src/config/salesPageConfigs.jsx';
const FORM = 'src/pages/sales/SalesOrderFormPage.jsx';

const quotation = (overrides = {}) => ({
  id: 42,
  quotationNo: 'QTN-2026-000042(1)',
  quotationDate: '2026-10-01',
  clientId: 7,
  clientName: 'Acme Industrial Works',
  contactPerson: 'Ravi Kumar',
  email: 'ravi@acme.example',
  phone: '+91 98765 43210',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  billingAddress: '12 Industrial Estate, Coimbatore 641021',
  shippingAddress: 'Plot 4, SIDCO, Hosur 635126',
  gstin: '33ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  currency: 'INR',
  taxType: 'CGST + SGST',
  paymentTerms: '30 Days',
  deliveryTerms: '6-8 weeks',
  salesPerson: 'Nithya R',
  terms: 'Payment 30 days from invoice date.',
  remarks: 'Please inspect material on arrival.',
  hsnView: 'true',
  discount: 500,
  charges: 250,
  status: 'draft',
  items: [
    {
      id: 1,
      description: 'Hydraulic press frame assembly',
      sku: 'VT-HP-001',
      drawingNo: 'DRG-7781',
      material: 'MS Fabricated',
      leadTime: '6 weeks',
      hsn: '8462',
      uom: 'NOS',
      qty: 3,
      rate: 1828,
      discountPct: 5,
      gstRate: 18,
      netAmount: 5209.8,
      total: 6147.56
    },
    {
      id: 2,
      description: 'Ram cylinder bracket',
      sku: 'VT-RC-002',
      hsn: '8412',
      uom: 'NOS',
      qty: 12,
      rate: 2450.75,
      discountPct: 0,
      gstRate: 18,
      netAmount: 29409,
      total: 34702.62
    }
  ],
  ...overrides
});

describe('Quotation → CPO · form pre-fill', () => {
  it('references the quotation by its CHAIN BASE number (never a revision suffix)', () => {
    const form = quotationToCpoForm(quotation());
    expect(form.qtnRef).toBe('QTN-2026-000042');
    expect(form.leadNo).toBe('');
  });

  it('copies the client, contact and address details the CPO form shows', () => {
    const form = quotationToCpoForm(quotation());
    expect(form.clientId).toBe(7);
    expect(form.clientName).toBe('Acme Industrial Works');
    expect(form.contactPerson).toBe('Ravi Kumar');
    expect(form.email).toBe('ravi@acme.example');
    expect(form.phone).toBe('+91 98765 43210');
    expect(form.city).toBe('Coimbatore');
    expect(form.state).toBe('Tamil Nadu');
    expect(form.billingAddress).toBe('12 Industrial Estate, Coimbatore 641021');
    expect(form.shippingAddress).toBe('Plot 4, SIDCO, Hosur 635126');
    expect(form.gstin).toBe('33ABCDE1234F1Z5');
    expect(form.pan).toBe('ABCDE1234F');
  });

  it('falls back to the quotation address for shipping when it has no separate one', () => {
    const form = quotationToCpoForm(quotation({ shippingAddress: '', billingAddress: 'Only billing' }));
    expect(form.shippingAddress).toBe('Only billing');
  });

  it('copies currency, terms, remarks, executive and the flat discount / charges', () => {
    const form = quotationToCpoForm(quotation());
    expect(form.currency).toBe('INR');
    expect(form.paymentTerms).toBe('30 Days');
    expect(form.deliveryTerms).toBe('6-8 weeks');
    expect(form.salesExecutive).toBe('Nithya R');
    expect(form.terms).toBe('Payment 30 days from invoice date.');
    expect(form.remarks).toBe('Please inspect material on arrival.');
    expect(form.discountPct).toBe(500);
    expect(form.charges).toBe(250);
  });

  it('maps the quotation tax wording onto the CPO tax types', () => {
    expect(quotationCpoTaxType(quotation({ taxType: 'IGST' }))).toBe('IGST');
    expect(quotationCpoTaxType(quotation({ taxType: 'IGST 18%' }))).toBe('IGST');
    expect(quotationCpoTaxType(quotation({ taxType: 'CGST + SGST' }))).toBe('CGST + SGST');
    expect(quotationCpoTaxType(quotation({ taxType: 'GST' }))).toBe('CGST + SGST');
  });

  it('keeps the HSN display option and never invents CPO-only fields', () => {
    const form = quotationToCpoForm(quotation());
    expect(form.hsnView).toBe(true);
    // CPO-only values stay independent of the quotation.
    expect(form.soNo).toBeUndefined();
    expect(form.customerPo).toBeUndefined();
    expect(form.releaseMethod).toBeUndefined();
    expect(form.status).toBeUndefined();
  });

  it('treats an empty quotation as an empty pre-fill instead of throwing', () => {
    const form = quotationToCpoForm();
    expect(form.qtnRef).toBe('');
    expect(form.clientName).toBe('');
    expect(form.currency).toBe('INR');
    expect(form.discountPct).toBe('');
    expect(quotationToCpoItems()).toEqual([]);
  });
});

describe('Quotation → CPO · item pre-fill', () => {
  it('maps every shared item field, in the quotation order', () => {
    const rows = quotationToCpoItems(quotation());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      productId: null,
      productName: 'Hydraulic press frame assembly',
      description: 'Hydraulic press frame assembly',
      sku: 'VT-HP-001',
      drawingNo: 'DRG-7781',
      material: 'MS Fabricated',
      delivery: '6 weeks',
      hsn: '8462',
      unit: 'NOS',
      qty: 3,
      rate: 1828,
      discountPct: 5,
      gstRate: 18
    });
    expect(rows[1].description).toBe('Ram cylinder bracket');
    expect(rows[1].qty).toBe(12);
    expect(rows[1].rate).toBe(2450.75);
  });

  it('does not copy computed amounts — the CPO recalculates them itself', () => {
    const [row] = quotationToCpoItems(quotation());
    expect(row.amount).toBeUndefined();
    expect(row.total).toBeUndefined();
    expect(row.netAmount).toBeUndefined();
  });

  it('drops design-only rows and keeps real items editable', () => {
    const rows = quotationToCpoItems(
      quotation({
        items: [
          { rowType: 'description', description: 'Section heading' },
          { description: 'Real item', qty: 1, rate: 10, gstRate: 18 }
        ]
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Real item');
  });

  it('defaults a missing quantity/rate the way the CPO grid does', () => {
    const [row] = quotationToCpoItems(quotation({ items: [{ description: 'No numbers' }] }));
    expect(row.qty).toBe(1);
    expect(row.rate).toBe(0);
    expect(row.gstRate).toBe(0);
    expect(row.unit).toBe('');
  });
});

describe('Quotation → CPO · routing and persistence wiring', () => {
  it('the quotation list row menu opens the CPO create form with the quotation id', () => {
    const source = read(CONFIG);
    expect(source).toMatch(/navigate\?\.\(`\/sales-orders\/new\?fromQuotation=\$\{row\.id\}`\)/);
  });

  it('the quotation Overview header opens the same CPO create form', () => {
    const source = read(CONFIG);
    expect(source).toMatch(/action: \(\) => navigate\(`\/sales-orders\/new\?fromQuotation=\$\{doc\.id\}`\)/);
  });

  it('the CPO form pre-fills from ?fromQuotation=<id> without saving anything', () => {
    const source = read(FORM);
    expect(source).toMatch(/searchParams\.get\('fromQuotation'\)/);
    expect(source).toMatch(/quotationToCpoForm\(quotation\)/);
    expect(source).toMatch(/quotationToCpoItems\(quotation\)/);
    // Loading the quotation must never create a CPO.
    const start = source.indexOf("searchParams.get('fromQuotation')");
    const loadBlock = source.slice(start, source.indexOf('handleClientCreated'));
    expect(loadBlock).not.toMatch(/salesOrderService\.create/);
  });

  it('the conversion reference is recorded only after the CPO is saved', () => {
    const source = read(FORM);
    const saveBlock = source.slice(source.indexOf('const save = async'), source.indexOf('const convertRow'));
    expect(saveBlock).toMatch(/quotationService\.postAction\(sourceQuotationIdRef\.current, 'conversion-reference'/);
    expect(saveBlock).toMatch(/target: 'sales-order'/);
    expect(saveBlock).toMatch(/number: no/);
    // ...and the new CPO is the one created by the user's own Save (the same
    // payload/draft arguments; Save & Continue additionally asks the form to
    // own a rejected save via saveOptions).
    expect(saveBlock).toMatch(/salesOrderService\.create\(payload, draft, saveOptions\)/);
    expect(saveBlock).toMatch(/const saveOptions = \{ suppressGlobalError: preview \}/);
  });
});

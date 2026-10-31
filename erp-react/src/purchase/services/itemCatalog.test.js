/**
 * purchase/services/itemCatalog.test.js
 * ------------------------------------------------------------------
 * ERP Item / Product Master — tests for the full schema, normalisation
 * of legacy records, auto-fill payloads, UOM conversion, dedupe and
 * active/inactive behaviour.
 * ------------------------------------------------------------------ */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeItem,
  getActiveItems,
  getAllItems,
  getItemByCode,
  searchItems,
  itemToLine,
  convertQuantity,
  addItem,
  updateItem,
  removeItem,
  hardDeleteItem
} from './itemCatalog';

describe('normalizeItem — full ERP schema', () => {
  it('fills every ERP field with the canonical shape', () => {
    const item = normalizeItem({
      itemCode: 'CVL-OPC',
      product: 'OPC 43 cement',
      category: 'Consumables',
      hsn: '2523',
      uom: 'Ton',
      stockUom: 'Kg',
      uomConversion: { factor: 1000 },
      tax: 28,
      standardRate: 380,
      preferredVendors: ['UltraTech'],
      leadTimeDays: 5,
      minStock: 10,
      reorderLevel: 20,
      warehouse: 'Central Store',
      batchTracking: true,
      serialTracking: false,
      active: true
    });
    expect(item).toMatchObject({
      itemCode: 'CVL-OPC',
      product: 'OPC 43 cement',
      category: 'Consumables',
      hsn: '2523',
      uom: 'Ton',
      stockUom: 'Kg',
      uomConversion: { factor: 1000 },
      tax: 28,
      standardRate: 380,
      preferredVendors: ['UltraTech'],
      leadTimeDays: 5,
      minStock: 10,
      reorderLevel: 20,
      warehouse: 'Central Store',
      batchTracking: true,
      serialTracking: false,
      active: true
    });
    expect(item.id).toBeTruthy();
  });

  it('normalises legacy minimal records so existing data keeps working', () => {
    const legacy = normalizeItem({ itemCode: 'VFD-15KW', product: 'VFD drive 15 kW', uom: 'Nos', standardRate: 14500 }, 3);
    expect(legacy.category).toBe('');
    expect(legacy.hsn).toBe('');
    expect(legacy.tax).toBe(0);
    expect(legacy.stockUom).toBe('Nos');           /* defaults to purchase UOM */
    expect(legacy.uomConversion).toBeNull();
    expect(legacy.preferredVendors).toEqual([]);
    expect(legacy.leadTimeDays).toBe(0);
    expect(legacy.batchTracking).toBe(false);
    expect(legacy.serialTracking).toBe(false);
    expect(legacy.active).toBe(true);
    expect(legacy.id).toBe('seed-4');              /* deterministic seed id */
  });

  it('keeps an item inactive when explicitly flagged', () => {
    expect(normalizeItem({ active: false }).active).toBe(false);
    expect(normalizeItem({ active: 0 }).active).toBe(false);
  });
});

describe('item master lookups', () => {
  it('getAllItems returns the full seeded catalog with ERP fields', () => {
    const all = getAllItems();
    expect(all.length).toBeGreaterThan(20);
    const item = all.find((i) => i.itemCode === 'CVL-OPC');
    expect(item).toBeTruthy();
    expect(item.stockUom).toBe('Kg');
    expect(item.uomConversion.factor).toBe(1000);
    expect(item.tax).toBe(28);
  });

  it('getActiveItems excludes inactive entries', () => {
    const active = getActiveItems();
    expect(active.every((i) => i.active)).toBe(true);
  });

  it('getItemByCode matches SKU or exact product name (case-insensitive)', () => {
    expect(getItemByCode('hr-3mm').itemCode).toBe('HR-3MM');
    expect(getItemByCode('Hot rolled steel sheet 3mm (IS 2062 E250)').itemCode).toBe('HR-3MM');
    expect(getItemByCode('no-such-item')).toBeNull();
    expect(getItemByCode('')).toBeNull();
  });

  it('searchItems matches SKU, name, description, category, HSN and preferred vendor', () => {
    expect(searchItems('VFD-15KW').length).toBeGreaterThan(0);
    expect(searchItems('SafetyPlus').every((i) => (i.preferredVendors || []).includes('SafetyPlus India'))).toBe(true);
    expect(searchItems('consu').every((i) => (i.category || '').toLowerCase().includes('consu') || (i.description || '').toLowerCase().includes('consu'))).toBe(true);
  });
});

describe('itemToLine — document auto-fill payload', () => {
  it('maps the master onto a line-item row used by PR/RFQ/PO forms', () => {
    const line = itemToLine(getItemByCode('VFD-15KW'));
    expect(line).toMatchObject({
      product: 'VFD drive 15 kW',
      category: 'Electrical & Automation',
      hsn: '8504',
      uom: 'Nos',
      rate: 14500,
      gstRate: 18
    });
  });

  it('never returns undefined fields for an empty item', () => {
    const line = itemToLine({});
    expect(line).toMatchObject({ product: '', category: '', hsn: '', uom: 'Nos', rate: 0, gstRate: 0 });
  });
});

describe('convertQuantity — purchase → stock UOM', () => {
  const tonne = normalizeItem({
    itemCode: 'CVL-TMT',
    product: 'TMT bar 16mm',
    uom: 'Ton',
    stockUom: 'Kg',
    uomConversion: { factor: 1000 }
  });

  it('converts using the configured factor when a separate stock UOM exists', () => {
    expect(convertQuantity(tonne, 2, 'Ton')).toBe(2000);
  });

  it('leaves quantity unchanged when no conversion is configured', () => {
    const plain = normalizeItem({ itemCode: 'X', product: 'X', uom: 'Nos' });
    expect(convertQuantity(plain, 5, 'Nos')).toBe(5);
    expect(convertQuantity(plain, 5)).toBe(5);
  });

  it('leaves quantity unchanged when stock UOM equals purchase UOM', () => {
    const same = normalizeItem({ itemCode: 'Y', product: 'Y', uom: 'Kg', stockUom: 'Kg', uomConversion: { factor: 1000 } });
    expect(convertQuantity(same, 5, 'Kg')).toBe(5);
  });

  it('does not convert when the caller passes a different UOM', () => {
    expect(convertQuantity(tonne, 2, 'Nos')).toBe(2);
  });

  it('rounds to 4 decimals to avoid float drift', () => {
    const weird = normalizeItem({ itemCode: 'Z', product: 'Z', uom: 'Dozen', stockUom: 'Nos', uomConversion: { factor: 12 } });
    expect(convertQuantity(weird, 0.3333, 'Dozen')).toBe(3.9996);
  });
});

describe('add/update/remove — dedupe and integrity', () => {
  beforeEach(() => {
    localStorage.removeItem('purchase.itemCatalog.v1');
  });

  it('addItem persists a new ERP item and rejects duplicate SKUs', () => {
    const r1 = addItem({ itemCode: 'TEST-01', product: 'Test item one', tax: 18, preferredVendors: 'Acme, Beta' });
    expect(r1.ok).toBe(true);
    expect(r1.item.preferredVendors).toEqual(['Acme', 'Beta']);
    expect(r1.item.active).toBe(true);

    const dup = addItem({ itemCode: 'test-01', product: 'Duplicate' });
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/already exists/);
  });

  it('updateItem merges a patch and re-normalises', () => {
    const added = addItem({ itemCode: 'TEST-02', product: 'Test item two' }).item;
    const r = updateItem(added.id, { standardRate: 99, batchTracking: true, stockUom: 'Kg', uomConversion: { factor: 2 } });
    expect(r.ok).toBe(true);
    expect(r.item.standardRate).toBe(99);
    expect(r.item.batchTracking).toBe(true);
    expect(r.item.stockUom).toBe('Kg');
    expect(r.item.uomConversion.factor).toBe(2);
  });

  it('updateItem rejects renaming to another item SKU', () => {
    const a = addItem({ itemCode: 'TEST-A', product: 'A' }).item;
    addItem({ itemCode: 'TEST-B', product: 'B' });
    const r = updateItem(a.id, { itemCode: 'TEST-B' });
    expect(r.ok).toBe(false);
  });

  it('removeItem soft-deletes; hardDeleteItem removes non-seed items', () => {
    const added = addItem({ itemCode: 'TEST-03', product: 'Test item three' }).item;
    const soft = removeItem(added.id);
    expect(soft.item.active).toBe(false);
    expect(getAllItems().find((i) => i.id === added.id).active).toBe(false);
    expect(getActiveItems().find((i) => i.id === added.id)).toBeUndefined();

    const hard = hardDeleteItem(added.id);
    expect(hard.ok).toBe(true);
    expect(getAllItems().find((i) => i.id === added.id)).toBeUndefined();
  });

  it('hardDeleteItem refuses to delete seed items', () => {
    const seed = getAllItems().find((i) => String(i.id).startsWith('seed-'));
    const r = hardDeleteItem(seed.id);
    expect(r.ok).toBe(false);
  });

  it('addItem validates required SKU and name', () => {
    expect(addItem({ product: 'no sku' }).ok).toBe(false);
    expect(addItem({ itemCode: 'NO-NAME' }).ok).toBe(false);
  });

  it('legacy records persisted under the old shape survive reads', () => {
    /* Simulate a v1 localStorage payload without ERP fields. */
    localStorage.setItem('purchase.itemCatalog.v1', JSON.stringify([
      { itemCode: 'OLD-1', product: 'Old item', uom: 'Nos', standardRate: 10 }
    ]));
    const all = getAllItems();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ itemCode: 'OLD-1', product: 'Old item', uom: 'Nos', tax: 0, active: true });
    expect(all[0].stockUom).toBe('Nos');
  });
});
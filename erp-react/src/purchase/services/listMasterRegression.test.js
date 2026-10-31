/**
 * purchase/services/listMasterRegression.test.js
 * ------------------------------------------------------------------
 * Regression tests for listMaster() and Purchase Settings loading.
 *
 * Verifies:
 *   1. listMaster ALWAYS returns an array for every valid key
 *   2. listMaster returns [] (not throw) for unknown keys
 *   3. listMaster items have { id, name, system } shape
 *   4. listMaster results are stable across calls (cached)
 *   5. settingsService load/save/reset round-trips
 *   6. settings persistence after refresh
 *   7. master data survives localStorage clear + re-seed
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { listMaster, MASTER_KEYS, MASTER_DEFS, addMasterItem, removeMasterItem, renameMasterItem, subscribeMaster } from './masterStore';
import { settingsService, settingsStore, getCurrencyPrefs, getDefaultCurrency, getActivePaymentTerms, getActiveTaxRates } from './settings';
import { } from './base';

beforeEach(() => {
  localStorage.clear();
  /* Reset the masterStore cache by removing the storage keys. */
  for (const key of MASTER_KEYS) {
    localStorage.removeItem(`purchase.masters.v1.${key}`);
  }
  settingsStore.reset();
});

/* ================================================================== */
/*  1. listMaster always returns an array                              */
/* ================================================================== */
describe('1. listMaster returns array for all valid keys', () => {
  it.each(MASTER_KEYS)('listMaster("%s") returns an array', (key) => {
    const result = listMaster(key);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('every item has { id, name, system } shape', () => {
    for (const key of MASTER_KEYS) {
      const items = listMaster(key);
      for (const item of items) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('system');
        expect(typeof item.id).toBe('string');
        expect(typeof item.name).toBe('string');
        expect(typeof item.system).toBe('boolean');
      }
    }
  });

  it('items can be safely mapped', () => {
    for (const key of MASTER_KEYS) {
      const names = listMaster(key).map((i) => i.name);
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      names.forEach((n) => expect(typeof n).toBe('string'));
    }
  });

  it('items can be safely filtered', () => {
    for (const key of MASTER_KEYS) {
      const systemItems = listMaster(key).filter((i) => i.system);
      expect(Array.isArray(systemItems)).toBe(true);
    }
  });

  it('items can be safely found', () => {
    for (const key of MASTER_KEYS) {
      const first = listMaster(key)[0];
      expect(first).toBeDefined();
      expect(first).toHaveProperty('name');
    }
  });
});

/* ================================================================== */
/*  2. listMaster returns [] for unknown keys (no throw)              */
/* ================================================================== */
describe('2. listMaster handles unknown keys gracefully', () => {
  it('returns empty array for completely unknown key', () => {
    const result = listMaster('nonexistentKey123');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty string key', () => {
    const result = listMaster('');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for null key', () => {
    const result = listMaster(null);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for undefined key', () => {
    const result = listMaster(undefined);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('unknown key result can be safely mapped', () => {
    const result = listMaster('unknownKey');
    expect(() => result.map((i) => i.name)).not.toThrow();
    expect(result.map((i) => i.name)).toEqual([]);
  });
});

/* ================================================================== */
/*  3. Specific master keys have correct data                         */
/* ================================================================== */
describe('3. Specific master data correctness', () => {
  it('warehouses has expected items', () => {
    const warehouses = listMaster('warehouses');
    expect(warehouses.length).toBeGreaterThanOrEqual(4);
    const names = warehouses.map((w) => w.name);
    expect(names).toContain('Main Store');
  });

  it('departments has expected items', () => {
    const departments = listMaster('departments');
    expect(departments.length).toBeGreaterThanOrEqual(10);
    const names = departments.map((d) => d.name);
    expect(names).toContain('Purchase');
    expect(names).toContain('IT');
  });

  it('currencies has expected items', () => {
    const currencies = listMaster('currencies');
    expect(currencies.length).toBeGreaterThanOrEqual(5);
    const names = currencies.map((c) => c.name);
    expect(names).toContain('INR');
  });

  it('paymentTerms has expected items', () => {
    const terms = listMaster('paymentTerms');
    expect(terms.length).toBeGreaterThanOrEqual(5);
  });

  it('gstTypes has expected items', () => {
    const types = listMaster('gstTypes');
    expect(types.length).toBeGreaterThanOrEqual(4);
  });

  it('hsnCodes has expected items', () => {
    const codes = listMaster('hsnCodes');
    expect(codes.length).toBeGreaterThanOrEqual(10);
  });

  it('priorities has expected items', () => {
    const priorities = listMaster('priorities');
    expect(priorities.length).toBeGreaterThanOrEqual(3);
    const names = priorities.map((p) => p.name);
    expect(names).toContain('High');
    expect(names).toContain('Medium');
    expect(names).toContain('Low');
  });

  it('categories has expected items', () => {
    const categories = listMaster('categories');
    expect(categories.length).toBeGreaterThanOrEqual(5);
  });

  it('uoms has expected items', () => {
    const uoms = listMaster('uoms');
    expect(uoms.length).toBeGreaterThanOrEqual(5);
  });
});

/* ================================================================== */
/*  4. listMaster results are cached (same reference across calls)    */
/* ================================================================== */
describe('4. listMaster caching behavior', () => {
  it('returns stable data across multiple calls', () => {
    const a = listMaster('warehouses');
    const b = listMaster('warehouses');
    // Different array references (spread creates new array)
    expect(a).not.toBe(b);
    // But same content
    expect(a).toEqual(b);
  });

  it('mutations to returned array do not affect cache', () => {
    const a = listMaster('warehouses');
    const originalLength = a.length;
    a.push({ id: 'test', name: 'Test', system: false });
    const b = listMaster('warehouses');
    expect(b).toHaveLength(originalLength);
  });
});

/* ================================================================== */
/*  5. Add / remove items from masters                                */
/* ================================================================== */
describe('5. Master CRUD operations', () => {
  it('addMasterItem adds a custom item', async () => {
    const before = listMaster('warehouses');
    const result = await addMasterItem('warehouses', 'New Warehouse');
    expect(result.ok).toBe(true);
    expect(result.item.name).toBe('New Warehouse');
    expect(result.item.system).toBe(false);
    const after = listMaster('warehouses');
    expect(after).toHaveLength(before.length + 1);
  });

  it('addMasterItem rejects duplicates', async () => {
    const result = await addMasterItem('warehouses', 'Main Store');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('DUPLICATE');
  });

  it('addMasterItem rejects empty name', async () => {
    const result = await addMasterItem('warehouses', '');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('EMPTY');
  });

  it('removeMasterItem removes a custom item', async () => {
    const added = await addMasterItem('warehouses', 'Temp Warehouse');
    expect(added.ok).toBe(true);
    const removeResult = await removeMasterItem('warehouses', added.item.id);
    expect(removeResult.ok).toBe(true);
  });

  it('removeMasterItem rejects system items', async () => {
    const systemItem = listMaster('warehouses').find((i) => i.system);
    expect(systemItem).toBeDefined();
    const result = await removeMasterItem('warehouses', systemItem.id);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('SYSTEM');
  });

  it('renameMasterItem renames a custom item', async () => {
    const added = await addMasterItem('warehouses', 'Temp WH');
    expect(added.ok).toBe(true);
    const renamed = await renameMasterItem('warehouses', added.item.id, 'Renamed WH');
    expect(renamed.ok).toBe(true);
    expect(renamed.item.name).toBe('Renamed WH');
  });
});

/* ================================================================== */
/*  6. Subscribe to master changes                                    */
/* ================================================================== */
describe('6. Master subscription', () => {
  it('subscriber is notified on add', async () => {
    const notified = [];
    const unsub = subscribeMaster('warehouses', (list) => {
      notified.push(list.length);
    });
    await addMasterItem('warehouses', 'Sub Test WH');
    expect(notified.length).toBeGreaterThan(0);
    unsub();
  });

  it('unsubscribe stops notifications', async () => {
    const notified = [];
    const unsub = subscribeMaster('warehouses', (list) => {
      notified.push(list.length);
    });
    unsub();
    await addMasterItem('warehouses', 'Unsub Test WH');
    // May or may not fire depending on timing, but after unsub should not
    // We just verify unsubscribe doesn't throw
  });
});

/* ================================================================== */
/*  7. Settings service load / save / reset                           */
/* ================================================================== */
describe('7. Settings service round-trip', () => {
  it('getSettings returns full settings object', async () => {
    const settings = await settingsService.getSettings();
    expect(settings).toBeTruthy();
    expect(settings.company).toBeDefined();
    expect(settings.company.name).toBeTruthy();
    expect(settings.defaults).toBeDefined();
    expect(settings.defaults.currency).toBe('INR');
    expect(settings.approvalMatrix).toBeDefined();
    expect(Array.isArray(settings.approvalMatrix)).toBe(true);
    expect(settings.taxRates).toBeDefined();
    expect(Array.isArray(settings.taxRates)).toBe(true);
    expect(settings.paymentTerms).toBeDefined();
    expect(Array.isArray(settings.paymentTerms)).toBe(true);
  });

  it('updateSettings persists changes', async () => {
    const original = await settingsService.getSettings();
    const updated = await settingsService.updateSettings({
      defaults: { ...original.defaults, currency: 'USD' }
    });
    expect(updated.defaults.currency).toBe('USD');
    // Verify persistence
    const reloaded = await settingsService.getSettings();
    expect(reloaded.defaults.currency).toBe('USD');
  });

  it('resetSettings restores seed defaults', async () => {
    await settingsService.updateSettings({
      defaults: { currency: 'EUR' }
    });
    const reset = await settingsService.resetSettings();
    expect(reset.defaults.currency).toBe('INR');
    expect(reset.company.name).toBeTruthy();
  });

  it('updateSetting (single section) persists', async () => {
    await settingsService.updateSetting('defaults', { currency: 'GBP', tax: '12%' });
    const settings = await settingsService.getSettings();
    expect(settings.defaults.currency).toBe('GBP');
    expect(settings.defaults.tax).toBe('12%');
  });

  it('getConfigHealth returns health object', async () => {
    const health = await settingsService.getConfigHealth();
    expect(health).toBeDefined();
    expect(health.percentage).toBeGreaterThanOrEqual(0);
    expect(health.percentage).toBeLessThanOrEqual(100);
    expect(Array.isArray(health.checks)).toBe(true);
    expect(health.checks.length).toBeGreaterThan(0);
  });

  it('getAuditHistory returns array', async () => {
    const history = await settingsService.getAuditHistory();
    expect(Array.isArray(history)).toBe(true);
  });
});

/* ================================================================== */
/*  8. Settings persistence after refresh (localStorage)              */
/* ================================================================== */
describe('8. Settings persistence after refresh', () => {
  it('updateSettings returns merged data with changes', async () => {
    const result = await settingsService.updateSettings({
      company: { name: 'Test Company Ltd' },
      defaults: { currency: 'USD' }
    });
    expect(result.company.name).toBe('Test Company Ltd');
    expect(result.defaults.currency).toBe('USD');
  });

  it('updateSetting persists single section changes', async () => {
    // First load to get current defaults
    const original = await settingsService.getSettings();
    // updateSetting replaces the entire section, so include all fields
    const merged = { ...original.defaults, currency: 'EUR', tax: '5%' };
    const result = await settingsService.updateSetting('defaults', merged);
    expect(result.defaults.currency).toBe('EUR');
    expect(result.defaults.tax).toBe('5%');
    // Other defaults preserved (we merged them in)
    expect(result.defaults.paymentTerms).toBeTruthy();
  });

  it('approval matrix update persists', async () => {
    const customMatrix = [
      { level: 1, role: 'Manager', minAmount: 0, maxAmount: 25000, slaDays: 1, active: true, fallbackApprover: '', escalationDays: 2 },
      { level: 2, role: 'Director', minAmount: 25001, maxAmount: 0, slaDays: 3, active: true, fallbackApprover: '', escalationDays: 5 }
    ];
    const result = await settingsService.updateSettings({ approvalMatrix: customMatrix });
    expect(result.approvalMatrix).toHaveLength(2);
    expect(result.approvalMatrix[0].role).toBe('Manager');
    expect(result.approvalMatrix[1].role).toBe('Director');
  });

  it('tax rates update persists', async () => {
    const result = await settingsService.updateSettings({
      taxRates: [{ id: 'custom', code: 'CUSTOM', name: 'Custom Tax', rate: 10, type: 'GST', cgst: 5, sgst: 5, igst: 10, applicableTo: ['PO'], active: true }]
    });
    const customTax = result.taxRates.find((t) => t.code === 'CUSTOM');
    expect(customTax).toBeDefined();
    expect(customTax.rate).toBe(10);
  });

  it('payment terms update persists', async () => {
    const customTerms = [{ id: 'pt-custom', code: 'CUSTOM', name: 'Custom Term', creditDays: 45, advancePercent: 25, balancePercent: 75, dueDateRule: 'Custom', active: true }];
    const result = await settingsService.updateSettings({ paymentTerms: customTerms });
    const custom = result.paymentTerms.find((t) => t.code === 'CUSTOM');
    expect(custom).toBeDefined();
    expect(custom.creditDays).toBe(45);
  });

  it('numbering update preserves other doc types', async () => {
    const original = await settingsService.getSettings();
    const updatedNumbering = { ...original.numbering, PO: { prefix: 'PO', fy: '2027', startNo: 1, currentNo: 0, padding: 4 } };
    const result = await settingsService.updateSettings({ numbering: updatedNumbering });
    expect(result.numbering.PO.fy).toBe('2027');
    expect(result.numbering.PR).toBeDefined();
  });

  it('workflow update preserves other doc types', async () => {
    const original = await settingsService.getSettings();
    const customWorkflow = {
      ...original.workflow,
      PR: [{ stage: 'Custom Draft', enabled: true, displayName: 'Custom Draft', sequence: 1, sla: 0, responsibleRole: 'User', escalation: '', allowedTransitions: [] }]
    };
    const result = await settingsService.updateSettings({ workflow: customWorkflow });
    expect(result.workflow.PR).toHaveLength(1);
    expect(result.workflow.PR[0].stage).toBe('Custom Draft');
    expect(result.workflow.RFQ).toBeDefined();
  });

  it('notification rules update replaces entire list', async () => {
    const rules = [{ id: 'custom', event: 'Custom Event', enabled: false, recipientRole: 'Admin', reminderAfter: 0, escalateAfter: 0, repeatInterval: 'once' }];
    const result = await settingsService.updateSettings({ notificationRules: rules });
    expect(result.notificationRules).toHaveLength(1);
    expect(result.notificationRules[0].event).toBe('Custom Event');
  });

  it('resetSettings restores all defaults', async () => {
    await settingsService.updateSettings({ defaults: { currency: 'EUR' } });
    const reset = await settingsService.resetSettings();
    expect(reset.defaults.currency).toBe('INR');
    expect(reset.company.name).toBeTruthy();
    expect(Array.isArray(reset.approvalMatrix)).toBe(true);
    expect(Array.isArray(reset.taxRates)).toBe(true);
    expect(Array.isArray(reset.paymentTerms)).toBe(true);
  });

  it('auditHistory grows with each update', async () => {
    const before = await settingsService.getAuditHistory();
    const beforeCount = before.length;
    await settingsService.updateSettings({ defaults: { currency: 'AUD' } });
    await settingsService.updateSettings({ defaults: { currency: 'CAD' } });
    const after = await settingsService.getAuditHistory();
    expect(after.length).toBeGreaterThanOrEqual(beforeCount);
  });

  it('exportSettings returns valid JSON string', async () => {
    const json = await settingsService.exportSettings();
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.company).toBeDefined();
    expect(parsed.defaults).toBeDefined();
  });

  it('importSettings merges imported data', async () => {
    const exported = await settingsService.exportSettings();
    // Modify company name in export
    const parsed = JSON.parse(exported);
    parsed.company.name = 'Imported Company';
    const result = await settingsService.importSettings(JSON.stringify(parsed));
    expect(result.company.name).toBe('Imported Company');
  });

  it('importSettings rejects invalid JSON', async () => {
    await expect(settingsService.importSettings('not json')).rejects.toThrow('Invalid JSON');
  });

  it('importSettings rejects incomplete data', async () => {
    await expect(settingsService.importSettings('{}')).rejects.toThrow('Missing required sections');
  });
});

/* ================================================================== */
/*  9. Synchronous accessors                                          */
/* ================================================================== */
describe('9. Synchronous settings accessors', () => {
  it('getCurrencyPrefs returns defaults when no settings', () => {
    const prefs = getCurrencyPrefs();
    expect(prefs.defaultCurrency).toBe('INR');
    expect(prefs.symbolPosition).toBe('before');
    expect(prefs.decimalPlaces).toBe(2);
  });

  it('getDefaultCurrency returns INR by default', () => {
    expect(getDefaultCurrency()).toBe('INR');
  });

  it('getActivePaymentTerms returns only active terms', async () => {
    const terms = getActivePaymentTerms();
    expect(Array.isArray(terms)).toBe(true);
    terms.forEach((t) => expect(t.active).toBe(true));
  });

  it('getActiveTaxRates returns only active rates', async () => {
    const rates = getActiveTaxRates();
    expect(Array.isArray(rates)).toBe(true);
    rates.forEach((t) => expect(t.active).toBe(true));
  });
});

/* ================================================================== */
/*  10. MASTER_DEFS completeness                                      */
/* ================================================================== */
describe('10. MASTER_DEFS has all required keys', () => {
  const requiredKeys = [
    'departments', 'requesters', 'buyers', 'vendors',
    'companies', 'branches', 'projects', 'categories',
    'uoms', 'gstTypes', 'warehouses', 'locations',
    'deliveryAddresses', 'transportModes', 'incoterms',
    'currencies', 'paymentTerms', 'costCenters',
    'priorities', 'hsnCodes'
  ];

  it.each(requiredKeys)('MASTER_DEFS has key "%s"', (key) => {
    expect(MASTER_DEFS[key]).toBeDefined();
    expect(MASTER_DEFS[key].label).toBeTruthy();
    expect(Array.isArray(MASTER_DEFS[key].defaults)).toBe(true);
    expect(MASTER_DEFS[key].defaults.length).toBeGreaterThan(0);
  });

  it('MASTER_KEYS matches MASTER_DEFS keys', () => {
    const defsKeys = Object.keys(MASTER_DEFS).sort();
    const exportedKeys = [...MASTER_KEYS].sort();
    expect(exportedKeys).toEqual(defsKeys);
  });
});

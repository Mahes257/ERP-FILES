/**
 * Sales Settings — Configuration Health.
 *
 * The Overview scores the SAVED settings document, so these tests pin the two
 * things that regressed for Company / Organization:
 *
 *   1. a valid saved configuration (document-detail flags on, overrides empty)
 *      must score 11 of 11 / 100% — the optional bank-account and invoice-footer
 *      overrides must never gate the section;
 *   2. a genuinely empty section (every detail off, both overrides blank or
 *      whitespace) must still report "Needs attention" — with a hint that says
 *      what is missing — so the percentage is never faked.
 */
import { describe, it, expect } from 'vitest';
import salesSettingsService from './salesSettingsService';

const company = (h) => h.checks.find((c) => c.key === 'company');

/** A Company section with every Sales-document detail switched off. */
const allDetailsOff = {
  showCompanyHeader: false,
  showGSTIN: false,
  showPAN: false,
  letterheadEnabled: false,
  defaultBankAccount: '',
  invoiceFooter: ''
};

describe('Sales Settings · configuration health', () => {
  it('scores the default saved configuration as 11 of 11 sections — 100%', () => {
    const h = salesSettingsService.getConfigHealth({});
    expect(h.total).toBe(11);
    expect(h.configured).toBe(11);
    expect(h.percentage).toBe(100);
    expect(h.status).toBe('healthy');
    expect(company(h).configured).toBe(true);
    expect(company(h).hint).toBeUndefined();
  });

  it('reports Company / Organization as incomplete only when nothing identifies the company', () => {
    const h = salesSettingsService.getConfigHealth({ companyPreferences: allDetailsOff });
    expect(company(h).configured).toBe(false);
    expect(company(h).hint).toMatch(/bank account/i);
    // Exactly one section is missing, so the Overview stays honest at 10/11.
    expect(h.configured).toBe(10);
    expect(h.percentage).toBe(91);
    expect(h.status).toBe('warning');
  });

  it('still accepts a default bank account on its own, with every detail switched off', () => {
    const h = salesSettingsService.getConfigHealth({
      companyPreferences: { ...allDetailsOff, defaultBankAccount: 'HDFC 50100 1234 5678' }
    });
    expect(company(h).configured).toBe(true);
    expect(h.percentage).toBe(100);
  });

  it('still accepts an invoice footer on its own, with every detail switched off', () => {
    const h = salesSettingsService.getConfigHealth({
      companyPreferences: { ...allDetailsOff, invoiceFooter: 'Goods once sold are not returnable.' }
    });
    expect(company(h).configured).toBe(true);
    expect(h.percentage).toBe(100);
  });

  it('treats whitespace-only overrides as empty', () => {
    const h = salesSettingsService.getConfigHealth({
      companyPreferences: { ...allDetailsOff, defaultBankAccount: '   ', invoiceFooter: '\n\t ' }
    });
    expect(company(h).configured).toBe(false);
    expect(h.percentage).toBe(91);
  });

  it('accepts a single enabled document detail (letterhead) as configured', () => {
    const h = salesSettingsService.getConfigHealth({
      companyPreferences: { ...allDetailsOff, letterheadEnabled: true }
    });
    expect(company(h).configured).toBe(true);
    expect(h.percentage).toBe(100);
  });

  it('keeps the other sections derived from their own saved values', () => {
    const h = salesSettingsService.getConfigHealth({
      taxSettings: { taxRates: [{ name: 'GST 18', rate: 18, active: true, default: false }] }
    });
    const tax = h.checks.find((c) => c.key === 'tax');
    // An active rate without a default is still incomplete — the health score is
    // never reduced to a length check.
    expect(tax.configured).toBe(false);
    expect(h.percentage).toBe(91);
  });
});

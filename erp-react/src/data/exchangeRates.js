/**
 * src/data/exchangeRates.js
 * ------------------------------------------------------------------
 * Seed Exchange Rate master for the Purchase Requisition module.
 *
 * INR (Indian Rupee) is the system base currency. Every amount is
 * calculated and stored in INR; the rates below convert a stored INR
 * value into a display currency:
 *
 *     Display = INR ÷ rate        e.g. 15000 INR ÷ 86.25 = $173.91
 *
 * Each entry carries { code, rate, effectiveDate } where `rate` is the
 * number of Indian Rupees per 1 unit of that currency:
 *     1 USD = ₹86.25 · 1 EUR = ₹99.40 · 1 AED = ₹23.49 · ...
 *
 * These are the DEFAULT rates. They are editable at runtime from the
 * Purchase → Settings → Exchange Rates master page; the persisted
 * overrides live in the purchase settings store and are served by
 * `purchase/services/exchangeRates.js` (getExchangeRate / convertFromBase,
 * which is the swap point if a live rates API is wired up later).
 * Currencies without an entry simply render at 1:1 (no conversion).
 * ------------------------------------------------------------------
 */
export const BASE_CURRENCY = 'INR';

export const EXCHANGE_RATES = [
  { code: 'INR', rate: 1, effectiveDate: '2026-01-01' },
  { code: 'USD', rate: 86.25, effectiveDate: '2026-01-01' },
  { code: 'EUR', rate: 99.4, effectiveDate: '2026-01-01' },
  { code: 'AED', rate: 23.49, effectiveDate: '2026-01-01' },
  { code: 'GBP', rate: 115.2, effectiveDate: '2026-01-01' },
  { code: 'JPY', rate: 0.58, effectiveDate: '2026-01-01' }
];

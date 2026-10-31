/**
 * purchase/services/exchangeRates.js
 * ------------------------------------------------------------------
 * Exchange Rate master service for the Purchase module. INR is the
 * system base currency; every amount is stored in INR and converted
 * only for display:
 *
 *     Display = INR ÷ rate        e.g. 15000 INR ÷ 86.25 = $173.91
 *
 * Rates are persisted inside the purchase settings store (so they can
 * be edited from Settings → Exchange Rates) and default to the seed in
 * src/data/exchangeRates.js. The synchronous accessors below back the
 * whole module — changing a rate here instantly re-renders every
 * converted amount without touching stored values.
 * ------------------------------------------------------------------
 */
import { BASE_CURRENCY, EXCHANGE_RATES } from '../../data/exchangeRates';
import { clone, delay, todayLocal } from './base';
import { settingsService, settingsStore } from './settings';

export { BASE_CURRENCY };

/** Persisted rate list, falling back to the seed master. */
function readRates() {
  const stored = settingsStore.all?.exchangeRates;
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return EXCHANGE_RATES;
}

/** Look up an exchange-rate entry by ISO code (case-insensitive). */
export function getExchangeRate(code) {
  const key = String(code || '').trim().toUpperCase();
  return readRates().find((entry) => entry?.code === key) || null;
}

/**
 * Converts a stored INR amount into the display currency:
 * Display = INR ÷ rate. Currencies without a rate convert at 1:1.
 */
export function convertFromBase(amountINR, code) {
  const entry = getExchangeRate(code);
  const rate = entry && entry.rate > 0 ? Number(entry.rate) : 1;
  return (Number(amountINR) || 0) / rate;
}

/** Syncs the legacy `settings.currencies[].rate` values with the master. */
function syncCurrencyRates(rates) {
  const rateMap = {};
  rates.forEach((entry) => {
    rateMap[entry.code] = entry.rate;
  });
  return (settingsStore.all?.currencies || []).map((c) => ({
    ...c,
    rate: rateMap[c.code] != null ? rateMap[c.code] : c.rate
  }));
}

/** Normalises + validates a rate list before persisting. */
function normalizeRates(rates) {
  const seen = new Set();
  const out = [];
  (Array.isArray(rates) ? rates : []).forEach((entry) => {
    const code = String(entry?.code || '').trim().toUpperCase();
    const rate = Number(entry?.rate);
    if (!code || !Number.isFinite(rate) || rate <= 0 || seen.has(code)) return;
    seen.add(code);
    out.push({
      code,
      /* INR is the fixed base — its rate is always exactly 1. */
      rate: code === 'INR' ? 1 : Math.round(rate * 10000) / 10000,
      effectiveDate: entry?.effectiveDate || todayLocal()
    });
  });
  if (!seen.has('INR')) {
    out.unshift({ code: 'INR', rate: 1, effectiveDate: todayLocal() });
  }
  return out;
}

/** Sorts the master with INR (base) first, then alphabetical. */
function sortRates(list) {
  return [...list].sort((a, b) =>
    a.code === BASE_CURRENCY ? -1 : b.code === BASE_CURRENCY ? 1 : String(a.code).localeCompare(String(b.code))
  );
}

export const exchangeRateService = {
  /** Returns the persisted exchange-rate master (INR first). */
  async getRates() {
    await delay();
    return clone(sortRates(readRates()));
  },

  /** Replaces the whole master (add / update / delete via the page). */
  async saveRates(rates) {
    await delay();
    const normalized = normalizeRates(rates);
    await settingsService.updateSettings({
      exchangeRates: normalized,
      currencies: syncCurrencyRates(normalized)
    });
    return clone(sortRates(normalized));
  },

  /** Resets the master back to the seed rates in src/data/exchangeRates.js. */
  async resetRates() {
    await delay();
    const seed = EXCHANGE_RATES.map((entry) => ({ ...entry }));
    await settingsService.updateSettings({
      exchangeRates: seed,
      currencies: syncCurrencyRates(seed)
    });
    return clone(seed);
  }
};

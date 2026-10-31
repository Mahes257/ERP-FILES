import exchangeRateService from '../services/exchangeRateService';
import { normalizeQuotation, serializeQuotation } from './salesHelpers';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Recalculate a SAVED quotation with the LATEST exchange rates.
 *
 * Existing documents must retain the exchange rate used when they were created
 * — this is only invoked when the user explicitly chooses
 * "Recalculate with Latest Exchange Rates". Monetary values (item rates,
 * charges, freight, insurance) are converted by latestRate / storedRate; the
 * stored exchangeRate + baseCurrency are updated to match. Percent-based values
 * (discount %, GST %) and non-monetary fields are untouched; the backend
 * recomputes every total from the converted item rates.
 */
export async function recalculateQuotationRates(doc, service) {
  const res = await exchangeRateService.getLatest();
  const d = res?.data ?? res ?? {};
  const rates = d.rates && typeof d.rates === 'object' ? d.rates : {};
  const base = d.base || 'INR';
  const cur = doc.currency || 'INR';

  const storedRate = Number(doc.exchangeRate);
  const latestRate = cur === base ? 1 : Number(rates[cur]);
  if (!Number.isFinite(storedRate) || storedRate <= 0 || !Number.isFinite(latestRate) || latestRate <= 0) {
    throw new Error(`Exchange rate unavailable for ${cur}`);
  }
  const factor = latestRate / storedRate;

  const norm = normalizeQuotation(doc);
  const items = (Array.isArray(norm.items) ? norm.items : []).map((it) => ({
    ...it,
    unit: it.unit || it.uom || '',
    uom: it.uom || it.unit || '',
    rate: round2(Number(it.rate || 0) * factor)
  }));

  const payload = serializeQuotation(
    {
      ...norm,
      charges: round2(Number(norm.charges || 0) * factor),
      freight: round2(Number(norm.freight || 0) * factor),
      insurance: round2(Number(norm.insurance || 0) * factor),
      exchangeRate: latestRate,
      baseCurrency: base
    },
    items
  );

  await service.update(doc.id, payload);
  return { currency: cur, base, oldRate: storedRate, newRate: latestRate };
}

export { round2 as roundCurrency2 };

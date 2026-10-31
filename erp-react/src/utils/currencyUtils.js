/**
 * Shared currency symbol map and lookup.
 *
 * Every formatting function in the ERP resolves the currency symbol from this
 * single source of truth — never from a hardcoded '₹' or '$'.
 */

export const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: 'CN¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  HKD: 'HK$',
  NZD: 'NZ$',
  AED: 'AED',
  SAR: 'SAR',
  QAR: 'QAR',
  KWD: 'KWD',
  BHD: 'BHD',
  OMR: 'OMR',
  LKR: 'LKR',
  NPR: 'NPR',
  PKR: 'PKR',
  BDT: '৳',
  PHP: '₱',
  IDR: 'Rp',
  KRW: '₩',
  THB: '฿',
  MYR: 'RM',
  TRY: '₺',
  RUB: '₽',
  ZAR: 'R',
  BRL: 'R$',
  MXN: 'Mex$',
  CHF: 'CHF',
  SEK: 'SEK',
  NOK: 'NOK',
  DKK: 'DKK',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  ILS: '₪',
  VND: '₫',
  EGP: 'EGP',
  NGN: '₦',
  KES: 'KES',
  ZMW: 'ZMW',
  MAD: 'MAD'
};

/**
 * Return the display symbol for a currency code.
 * Falls back to `${code} ` for codes not in the map.
 * Returns '₹' when no code is provided (INR is the ERP default).
 */
export function currencySymbol(code) {
  if (!code) return '₹';
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

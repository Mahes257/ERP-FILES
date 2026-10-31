/**
 * pdfText — text hygiene and column fitting for the programmatic (jsPDF) PDFs.
 * ---------------------------------------------------------------------------
 * ROOT CAUSE OF THE "SPACED OUT" NUMBERS
 *
 * jsPDF's built-in fonts (helvetica / times / courier) only carry the WinAnsi
 * character set, and this jsPDF build renders every character outside plain
 * ASCII as an unmapped byte. Two things follow:
 *
 *   • the glyph is drawn as a placeholder box (the rupee sign showed up as `�`), and
 *   • jsPDF stops writing the run as one text object: it falls back to placing
 *     EVERY character separately, which leaves a visible gap between digits —
 *     `₹1,828.00` printed as `� 1 , 8 2 8 . 0 0`.
 *
 * So every string that reaches a PDF text call is normalised here first:
 * the currency sign becomes its ISO code (`₹` → `Rs `, `€` → `EUR `), typographic
 * punctuation becomes ASCII, accented letters are folded, and anything still
 * unencodable is dropped instead of being drawn as a box. The same module also
 * measures columns, so numeric cells are wide enough for their longest value and
 * are never broken across characters by the table layout.
 */

import { CURRENCY_SYMBOLS } from './quotationPrintUtils';

const CURRENCY_FALLBACK = {
  '\u20b9': 'Rs ', // ₹
  '\u20ac': 'EUR ', // €
  '\u00a3': 'GBP ', // £
  '\u00a5': 'JPY ', // ¥
  '\u00a2': 'c ', // ¢
  '\u20a8': 'Rs ' // ₨
};

const PUNCTUATION = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201a': "'",
  '\u201b': "'",
  '\u2032': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u201f': '"',
  '\u2033': '"',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2015': '-',
  '\u2212': '-',
  '\u2043': '-',
  '\u00b7': '-',
  '\u2022': '-',
  '\u2026': '...',
  '\u00d7': 'x',
  '\u00a0': ' ',
  '\u2007': ' ',
  '\u2009': ' ',
  '\u202f': ' ',
  '\u200b': ''
};

/** Make any string safe to draw with jsPDF's built-in fonts. */
export function pdfSafe(value) {
  if (value == null) return '';
  let text = typeof value === 'string' ? value : String(value);
  // Accented letters (Müller → Muller) instead of a placeholder box.
  text = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  text = text.replace(/[\u20b9\u20ac\u00a3\u00a5\u00a2\u20a8]/g, (ch) => CURRENCY_FALLBACK[ch] || ch);
  text = text.replace(/[\u2018-\u201f\u2032\u2033\u2010-\u2015\u2212\u2043\u00b7\u2022\u2026\u00d7\u00a0\u2007\u2009\u202f\u200b]/g, (ch) => {
    const mapped = PUNCTUATION[ch];
    return mapped == null ? '' : mapped;
  });
  // Anything else outside ASCII cannot be encoded by the standard fonts.
  return text.replace(/[^\t\n\x20-\x7e]/g, '');
}

/** Currency symbol used by the HTML/print surfaces (browser fonts render it). */
export function currencySymbol(currency = 'INR') {
  const code = String(currency || 'INR').toUpperCase();
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

/**
 * Money text with two decimals and Indian grouping — the same precision the
 * View/Preview item grids display (`₹1,828.00`), so a download never rounds a
 * rate/tax/total that the screen shows with paise.
 */
export function docMoney(value, currency = 'INR') {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '-' : '';
  const body = Math.abs(safe).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${sign}${currencySymbol(currency)}${body}`;
}

/** Money text for jsPDF: the INR/EUR/… sign becomes an encodable prefix. */
export function pdfMoney(value, currency = 'INR') {
  return pdfSafe(docMoney(value, currency));
}

/** Width of a string in PDF points at the given font size. */
export function measureText(pdf, text, { fontSize = 8, bold = false } = {}) {
  const previous = pdf.getFont();
  const previousSize = pdf.getFontSize();
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(fontSize);
  const width = pdf.getStringUnitWidth(String(text ?? '')) * fontSize;
  pdf.setFont(previous.fontName || 'helvetica', previous.fontStyle || 'normal');
  pdf.setFontSize(previousSize);
  return width;
}

/**
 * Natural column widths for a table: every column is at least as wide as its
 * widest header/cell (so amounts never wrap or lose characters), and the
 * flexible column (the description) takes the remaining page width. The font
 * size steps down only when the fixed columns genuinely do not fit.
 *
 * @returns {{ widths: number[], fontSize: number }}
 */
export function fitTableColumns(
  pdf,
  { heads = [], rows = [], flexIndex = -1, minFlex = 110, padding = 3.6, fontSizes = [8, 7.5, 7, 6.5, 6], maxWidth } = {}
) {
  const available = maxWidth || pdf.internal.pageSize.getWidth() - 80;
  let widths = heads.map(() => 0);
  let fontSize = fontSizes[0];

  for (const size of fontSizes) {
    fontSize = size;
    widths = heads.map(((label, i) => {
      const headWidth = measureText(pdf, label, { fontSize: size, bold: true });
      const bodyWidth = rows.reduce(
        (max, row) => Math.max(max, measureText(pdf, row[i], { fontSize: size })),
        0
      );
      return Math.max(headWidth, bodyWidth) + padding * 2 + 1;
    }));
    const fixedTotal = widths.reduce((sum, w, i) => (i === flexIndex ? sum : sum + w), 0);
    if (flexIndex < 0 || fixedTotal + minFlex <= available) break;
  }

  if (flexIndex >= 0) {
    const fixedTotal = widths.reduce((sum, w, i) => (i === flexIndex ? sum : sum + w), 0);
    widths[flexIndex] = Math.max(minFlex, available - fixedTotal);
    const total = widths.reduce((a, b) => a + b, 0);
    if (total > available) {
      // Only the text column gives up space — numeric columns stay readable.
      widths[flexIndex] = Math.max(70, widths[flexIndex] - (total - available));
    }
  }

  return { widths, fontSize };
}

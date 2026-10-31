import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { docMoney, fitTableColumns, measureText, pdfMoney, pdfSafe } from './pdfText';

/**
 * Regression tests for the Sales PDF formatting layer.
 *
 * The reported bug: amounts printed with a gap between every character
 * (`₹ 1 , 8 2 8 . 0 0`) and columns that could not hold their values.
 * Cause: characters outside the PDF built-in font encoding (the rupee sign,
 * typographic punctuation) make jsPDF place each character separately, and
 * the item table sized its columns from the header text only.
 */
describe('pdfSafe', () => {
  it('turns currency signs into encodable ASCII prefixes', () => {
    expect(pdfSafe('\u20b91,828.00')).toBe('Rs 1,828.00');
    expect(pdfSafe('\u20ac1.828,00')).toBe('EUR 1.828,00');
    expect(pdfSafe('$1,828.00')).toBe('$1,828.00');
  });

  it('replaces typographic punctuation with ASCII equivalents', () => {
    expect(pdfSafe('\u2212 500')).toBe('- 500');
    expect(pdfSafe('Remarks \u2014 done')).toBe('Remarks - done');
    expect(pdfSafe('\u201cQuoted\u201d')).toBe('"Quoted"');
  });

  it('folds accents and drops anything the built-in fonts cannot encode', () => {
    expect(pdfSafe('M\u00fcller')).toBe('Muller');
    expect(pdfSafe('Ok \u2705')).toBe('Ok ');
    expect(pdfSafe(null)).toBe('');
  });

  it('leaves ordinary numbers untouched', () => {
    expect(pdfSafe('1,828.00')).toBe('1,828.00');
  });
});

describe('money formatting', () => {
  it('keeps two decimals and Indian grouping', () => {
    expect(docMoney(1828)).toBe('\u20b91,828.00');
    expect(docMoney(123456.5)).toBe('\u20b91,23,456.50');
    expect(pdfMoney(1828)).toBe('Rs 1,828.00');
  });

  it('keeps the sign in front of the symbol', () => {
    expect(docMoney(-849.46)).toBe('-\u20b9849.46');
    expect(pdfMoney(-849.46)).toBe('-Rs 849.46');
  });

  it('falls back to zero for values that are not numbers', () => {
    expect(docMoney(undefined)).toBe('\u20b90.00');
    expect(docMoney('not-a-number')).toBe('\u20b90.00');
  });
});

describe('fitTableColumns', () => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const available = pdf.internal.pageSize.getWidth() - 80;

  it('gives every numeric column at least its natural width', () => {
    const heads = ['S.No', 'QTY', 'ITEM DESCRIPTION', 'RATE', 'TOTAL'];
    const rows = [
      ['1', '3', 'Hydraulic press frame assembly with a long description', 'Rs 1,828.00', 'Rs 6,147.56'],
      ['2', '12', 'Ram cylinder bracket', 'Rs 2,450.75', 'Rs 34,702.62']
    ];
    const { widths, fontSize } = fitTableColumns(pdf, { heads, rows, flexIndex: 2, maxWidth: available });

    expect(widths).toHaveLength(heads.length);
    const padding = 3.6 * 2 + 1;
    heads.forEach((head, index) => {
      if (index === 2) return;
      const needed = Math.max(
        measureText(pdf, head, { fontSize, bold: true }),
        ...rows.map((row) => measureText(pdf, row[index], { fontSize }))
      ) + padding;
      expect(widths[index]).toBeGreaterThanOrEqual(needed - 0.01);
    });
    // The description takes the rest of the content width.
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(available + 0.5);
    expect(widths[2]).toBeGreaterThan(100);
  });

  it('shrinks the font instead of squeezing many numeric columns', () => {
    const heads = ['#', 'QTY', 'UOM', 'HSN', 'DESCRIPTION', 'RATE', 'DISC %', 'TAXABLE', 'CGST', 'SGST', 'TOTAL'];
    const rows = [
      ['1', '3', 'NOS', '8462', 'A description', 'Rs 1,828.00', '5%', 'Rs 5,209.80', 'Rs 468.88', 'Rs 468.88', 'Rs 6,147.56']
    ];
    const { widths, fontSize } = fitTableColumns(pdf, { heads, rows, flexIndex: 4, maxWidth: available });
    expect(fontSize).toBeLessThanOrEqual(8);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(available + 0.5);
  });
});

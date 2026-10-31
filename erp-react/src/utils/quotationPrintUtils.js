/**
 * Quotation Preview / Print / PDF helpers.
 *
 * Pure formatting + WYSIWYG capture utilities used by the Quotation Preview
 * page. They never change business calculations — they only format the stored
 * values for display and export the exact on-screen A4 document.
 */

// ===== Currency metadata =====

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

// Currency names used in "Amount In Words" (plural form follows the amount).
export const CURRENCY_WORDS = {
  INR: { name: 'Indian Rupee', plural: 'Indian Rupees', paise: 'Paise' },
  USD: { name: 'United States Dollar', plural: 'United States Dollars', paise: 'Cents' },
  EUR: { name: 'Euro', plural: 'Euros', paise: 'Cents' },
  GBP: { name: 'Pound Sterling', plural: 'Pounds Sterling', paise: 'Pence' },
  AED: { name: 'UAE Dirham', plural: 'UAE Dirhams', paise: 'Fils' },
  SGD: { name: 'Singapore Dollar', plural: 'Singapore Dollars', paise: 'Cents' },
  AUD: { name: 'Australian Dollar', plural: 'Australian Dollars', paise: 'Cents' },
  CAD: { name: 'Canadian Dollar', plural: 'Canadian Dollars', paise: 'Cents' },
  JPY: { name: 'Japanese Yen', plural: 'Japanese Yen', paise: 'Sen' },
  CNY: { name: 'Chinese Yuan', plural: 'Chinese Yuan', paise: 'Fen' },
  HKD: { name: 'Hong Kong Dollar', plural: 'Hong Kong Dollars', paise: 'Cents' },
  NZD: { name: 'New Zealand Dollar', plural: 'New Zealand Dollars', paise: 'Cents' },
  SAR: { name: 'Saudi Riyal', plural: 'Saudi Riyals', paise: 'Halala' },
  QAR: { name: 'Qatari Riyal', plural: 'Qatari Riyals', paise: 'Dirham' },
  KWD: { name: 'Kuwaiti Dinar', plural: 'Kuwaiti Dinars', paise: 'Fils' },
  BHD: { name: 'Bahraini Dinar', plural: 'Bahraini Dinars', paise: 'Fils' },
  OMR: { name: 'Omani Rial', plural: 'Omani Rials', paise: 'Baisa' },
  LKR: { name: 'Sri Lankan Rupee', plural: 'Sri Lankan Rupees', paise: 'Cents' },
  NPR: { name: 'Nepalese Rupee', plural: 'Nepalese Rupees', paise: 'Paisa' },
  PKR: { name: 'Pakistani Rupee', plural: 'Pakistani Rupees', paise: 'Paisa' },
  BDT: { name: 'Bangladeshi Taka', plural: 'Bangladeshi Taka', paise: 'Paisa' },
  PHP: { name: 'Philippine Peso', plural: 'Philippine Pesos', paise: 'Centavos' },
  IDR: { name: 'Indonesian Rupiah', plural: 'Indonesian Rupiah', paise: 'Sen' },
  KRW: { name: 'South Korean Won', plural: 'South Korean Won', paise: 'Jeon' },
  THB: { name: 'Thai Baht', plural: 'Thai Baht', paise: 'Satang' },
  MYR: { name: 'Malaysian Ringgit', plural: 'Malaysian Ringgit', paise: 'Sen' },
  TRY: { name: 'Turkish Lira', plural: 'Turkish Lira', paise: 'Kurus' },
  RUB: { name: 'Russian Ruble', plural: 'Russian Rubles', paise: 'Kopeck' },
  ZAR: { name: 'South African Rand', plural: 'South African Rand', paise: 'Cents' },
  BRL: { name: 'Brazilian Real', plural: 'Brazilian Reais', paise: 'Centavos' },
  MXN: { name: 'Mexican Peso', plural: 'Mexican Pesos', paise: 'Centavos' }
};

export function currencySymbol(code) {
  if (!code) return '₹';
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

// ===== Number formatting =====

function localeFor(numberFormat) {
  return String(numberFormat || 'Indian').toLowerCase() === 'standard' ? 'en-US' : 'en-IN';
}

/**
 * Format a monetary value with the selected currency symbol and number format.
 * e.g. formatAmount(123456.78, 'INR', 'Indian') => "₹1,23,456.78"
 */
export function formatAmount(value, { currency = 'INR', numberFormat = 'Indian', decimals = 2 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${currencySymbol(currency)}0.00`;
  const num = n.toLocaleString(localeFor(numberFormat), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  const sym = currencySymbol(currency);
  const spacer = /[A-Za-z]/.test(sym) ? ' ' : '';
  return `${sym}${spacer}${num}`;
}

/**
 * Format a plain number (quantity, GST %, rate etc.) with the selected number
 * format. No currency symbol.
 */
export function formatNumber(value, numberFormat = 'Indian', decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(localeFor(numberFormat), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// ===== Amount in words =====

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function two(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}

function three(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return (h ? `${ONES[h]} Hundred${r ? ' ' : ''}` : '') + (r ? two(r) : '');
}

function wordsIndian(n) {
  if (n === 0) return 'Zero';
  if (n < 1000) return three(n);
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  let s = '';
  if (crore) s += `${wordsIndian(crore)} Crore`;
  if (lakh) s += `${s ? ' ' : ''}${wordsIndian(lakh)} Lakh`;
  if (thousand) s += `${s ? ' ' : ''}${three(thousand)} Thousand`;
  if (rest) s += `${s ? ' ' : ''}${three(rest)}`;
  return s;
}

function wordsStandard(n) {
  if (n === 0) return 'Zero';
  if (n < 1000) return three(n);
  const units = [
    ['Trillion', 1000000000000],
    ['Billion', 1000000000],
    ['Million', 1000000],
    ['Thousand', 1000]
  ];
  let s = '';
  let rest = n;
  for (const [name, value] of units) {
    if (rest >= value) {
      const q = Math.floor(rest / value);
      rest %= value;
      s += `${s ? ' ' : ''}${wordsStandard(q)} ${name}`;
    }
  }
  if (rest) s += `${s ? ' ' : ''}${three(rest)}`;
  return s;
}

/**
 * Convert an amount to words in the selected currency and number system.
 * e.g. formatAmountInWords(1250, 'INR', 'Indian') =>
 *      "One Thousand Two Hundred Fifty Indian Rupees Only"
 */
export function formatAmountInWords(amount, currency = 'INR', numberFormat = 'Indian') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? 'Minus ' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const paise = Math.round((abs - whole) * 100);
  const toWords = String(numberFormat || 'Indian').toLowerCase() === 'standard' ? wordsStandard : wordsIndian;
  const meta = CURRENCY_WORDS[currency] || {};
  const curWord = meta.plural || `${currency} Dollars`;
  const paiseWord = meta.paise || 'Cents';

  let text = `${sign}${toWords(whole)} ${curWord}`;
  if (paise > 0) text += ` And ${toWords(paise)} ${paiseWord}`;
  return `${text} Only`;
}

// ===== WYSIWYG PDF capture =====
//
// Captures the exact on-screen A4 sheet element and slices it into A4 pages so
// the PDF matches the preview (and therefore the print layout). The sheet is
// cloned into an off-screen fixed-size A4 holder so the capture is always a
// true 210x297mm layout — identical to the print output even when the on-screen
// container is narrower than A4.

import { stampLetterheadIntoClone, buildLetterheadNode } from './letterheadPrintUtils';

export async function captureSheetToPdf(element, { filename = 'quotation' } = {}) {
  if (!element) throw new Error('Preview not ready');
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf')
  ]);

  // Build an off-screen holder pinned at exactly A4 (210mm) width. The print
  // stylesheet uses the same dimensions, so PDF === print === on-screen preview.
  const holder = document.createElement('div');
  holder.style.cssText = [
    'position: fixed',
    'left: -100000px',
    'top: 0',
    'width: 210mm',
    'height: auto',
    'background: #fff',
    'z-index: -1'
  ].join(';');

  const clone = element.cloneNode(true);
  clone.style.width = '210mm';
  clone.style.maxWidth = '210mm';
  clone.style.minHeight = '297mm';
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.border = 'none';
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(async (img) => {
      if (!img.complete) {
        await new Promise((done) => {
          img.onload = done;
          img.onerror = done;
        });
      }
      if (img.decode) {
        try {
          await img.decode();
        } catch {
          // The loaded image is still usable when decode is unsupported.
        }
      }
    }));

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    // ---- Case 1: the complete document already fits one A4 page. ---------
    if (imgH <= pageH + 0.5) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgW, imgH, undefined, 'FAST');
      pdf.save(`${filename}.pdf`);
      return;
    }

    // ---- Case 2: dynamic multi-page with content-aware page breaks. ------
    // The document grows to as many A4 pages as its content needs (1 page if
    // it fits, 2/3/4+ as required) — nothing is force-fit onto one page and
    // nothing is clipped. Page breaks are computed from the ACTUAL rendered
    // heights of the content blocks:
    //   • atomic blocks (.rounded-md sections and .keep-together pairs) stay
    //     whole — a section is never cut in half;
    //   • the splittable item table (.proforma-item-table) breaks only at
    //     whole-item-row boundaries, and its header (bar + thead) is repeated
    //     on every continuation page — the header is never orphaned at the
    //     bottom of a page with the first row pushed to the next page.
    const scaleCanvas = canvas.width / clone.offsetWidth; // canvas px per CSS px
    const sheetTop = clone.getBoundingClientRect().top;
    const pageHpx = (297 / 210) * clone.offsetWidth * scaleCanvas;

    // Letterhead: measure the sheet's own letterhead so every continuation
    // page reserves its height at the top and gets it drawn on top.
    const lhCtx = stampLetterheadIntoClone(clone, { scaleCanvas, sheetTop });
    const lhReserve = lhCtx.lhHpx || 0;

    const rectPx = (el) => {
      const r = el.getBoundingClientRect();
      return { top: (r.top - sheetTop) * scaleCanvas, bottom: (r.bottom - sheetTop) * scaleCanvas };
    };

    // Leaf content blocks: .rounded-md / .keep-together elements that do not
    // contain another such block (inner sections, not their pair wrappers).
    // Splittable item tables are included even when a module does not wrap them
    // in a .rounded-md section (Profit Workout), otherwise a long table is not
    // a break unit and its rows are cut off by the next section's break.
    const blockEls = Array.from(clone.querySelectorAll('.rounded-md, .keep-together, .proforma-item-table'));
    const contained = new Set();
    blockEls.forEach((el) => {
      blockEls.forEach((o) => {
        if (o !== el && el.contains(o)) contained.add(o);
      });
    });
    const leaves = blockEls.filter((el) => !contained.has(el));

    // Build break units. Pair wrappers (.keep-together) group their inner
    // sections into ONE unit when the whole pair fits a page, so e.g.
    // Bank + Terms + Totals stay together; oversized pairs fall back to their
    // individual sections.
    const units = [];
    const pairGroups = new Map();
    const splittable = [];
    leaves.forEach((el) => {
      const r = rectPx(el);
      if (r.bottom - r.top < 2) return;
      const pair = el.closest('.keep-together');
      if (el.classList.contains('proforma-item-table')) {
        // Splittable item table: the section bar + thead are glued to the
        // first item row; following rows are indivisible units of their own.
        const thead = el.querySelector('thead');
        const tfoot = el.querySelector('tfoot');
        const rows = Array.from(el.querySelectorAll('tbody tr'));
        const tfootBottom = tfoot ? rectPx(tfoot).bottom : null;
        if (thead && rows.length > 0) {
          const fr = rectPx(rows[0]);
          // The totals footer belongs with the final item row: it must never
          // be orphaned on a page without the row it totals.
          const firstBottom = rows.length === 1 && tfootBottom
            ? Math.max(fr.bottom, tfootBottom)
            : fr.bottom;
          units.push({ top: r.top, bottom: firstBottom });
          rows.slice(1).forEach((row, index, rest) => {
            const rr = rectPx(row);
            const isLast = index === rest.length - 1;
            units.push({
              top: rr.top,
              bottom: isLast && tfootBottom ? Math.max(rr.bottom, tfootBottom) : rr.bottom
            });
          });
          splittable.push({ headTop: r.top, headBottom: rectPx(thead).bottom, bottom: r.bottom });
          return;
        }
      }
      if (pair) {
        const g = pairGroups.get(pair) || { leaves: [], minTop: r.top, maxBottom: r.bottom };
        g.leaves.push({ top: r.top, bottom: r.bottom });
        g.minTop = Math.min(g.minTop, r.top);
        g.maxBottom = Math.max(g.maxBottom, r.bottom);
        pairGroups.set(pair, g);
        return;
      }
      units.push({ top: r.top, bottom: r.bottom });
    });
    pairGroups.forEach((g) => {
      if (g.maxBottom - g.minTop <= pageHpx * 0.98) {
        units.push({ top: g.minTop, bottom: g.maxBottom });
      } else {
        g.leaves.forEach((l) => units.push(l));
      }
    });
    units.sort((a, b) => a.top - b.top || a.bottom - b.bottom);

    // Place units on pages: a unit stays on the current page while its BOTTOM
    // fits; the first unit that would straddle the boundary starts the next
    // page. Because the item-table header is glued to the first row, an orphan
    // "header at the bottom of page 1" is impossible — the whole table section
    // moves to the next page instead. Rows / sections never split.
    // Repeated table header height for a page that starts inside the table.
    const headerPxAt = (top) => {
      const t = splittable.find((s) => top > s.headTop + 1 && top < s.bottom - 1);
      return t ? Math.round(t.headBottom - t.headTop) : 0;
    };

    const breaks = [0];
    let pageTop = 0;
    let firstPage = true;
    let guard = 0;
    for (let i = 0; i < units.length && guard++ < 100000; ) {
      // Continuation pages carry the repeated letterhead, and pages that start
      // inside the item table also carry its repeated header. Both consume
      // usable height and must be reserved here — otherwise the last row on
      // each continuation page is cropped at the bottom.
      const headPx = firstPage ? 0 : headerPxAt(pageTop);
      const avail = firstPage ? pageHpx : pageHpx - lhReserve - headPx;
      const pageFloor = pageTop + avail;
      const u = units[i];
      if (u.bottom <= pageFloor) {
        i += 1;
        continue;
      }
      if (u.top > pageFloor) {
        // The next unit starts below the usable area. End this page at the
        // page floor, not at the far-away unit top, so the cropped segment
        // can never exceed A4 height.
        breaks.push(pageFloor);
        pageTop = pageFloor;
        firstPage = false;
      } else if (u.top > pageTop + 1) {
        breaks.push(u.top);
        pageTop = u.top;
        firstPage = false;
      } else {
        // A single unit taller than a full page — hard-slice (pathological
        // case such as one oversized image row); every other break lands on a
        // clean section / row boundary.
        const hard = pageFloor;
        breaks.push(hard);
        pageTop = hard;
        firstPage = false;
      }
    }
    breaks.push(canvas.height);

    // Crop each page from the master canvas; when a page starts inside the
    // splittable item table, repeat its header (bar + thead) at the top.
    const pages = [];
    for (let b = 0; b < breaks.length - 1; b += 1) {
      const top = Math.round(breaks[b]);
      const bottom = Math.round(breaks[b + 1]);
      if (bottom - top < 2) continue;
      const cont = splittable.find((t) => top > t.headTop + 1 && top < t.bottom - 1);
      const headPx = cont ? Math.round(cont.headBottom - cont.headTop) : 0;
      // Continuation pages reserve the top band for the repeated letterhead;
      // an in-table continuation also reserves the repeated table header.
      const offset = b === 0 ? 0 : lhReserve + headPx;
      const page = document.createElement('canvas');
      page.width = canvas.width;
      // Every PDF page is a real A4 page. The captured segment is placed below
      // the repeated letterhead/header without stretching or cropping it.
      page.height = Math.round(pageHpx);
      const ctx = page.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
      if (cont) {
        ctx.drawImage(
          canvas, 0, Math.round(cont.headTop), canvas.width, headPx,
          0, lhReserve, canvas.width, headPx
        );
      }
      ctx.drawImage(canvas, 0, top, canvas.width, bottom - top, 0, offset, canvas.width, bottom - top);
      pages.push(page);
    }

    // Render the live letterhead markup once to an off-screen image so it can
    // be drawn at the top of every continuation page.
    let lhImg = null;
    let lhH = 0;
    if (lhCtx.lhNode) {
      try {
        const { node, host, root } = buildLetterheadNode();
        host.style.cssText = 'position:fixed;left:-100000px;top:0;width:210mm;background:#fff;z-index:-1;';
        host.style.display = 'block';
        // Two frames so React mounts and the webfont/layout settles.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const scaleLh = canvas.width / 794; // match the sheet capture density (210mm @96dpi ≈ 794px)
        const lhCanvas = await html2canvas(node, {
          scale: scaleLh,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        });
        lhImg = lhCanvas.toDataURL('image/jpeg', 0.95);
        lhH = (lhCanvas.height * pageW) / lhCanvas.width;
        root.unmount();
        host.remove();
      } catch {
        lhImg = null;
      }
    }

    pages.forEach((page, i) => {
      if (i > 0) pdf.addPage();
      const h = (page.height * pageW) / page.width;
      pdf.addImage(page.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, h, undefined, 'FAST');
      if (i > 0 && lhImg) {
        // Draw the repeated letterhead over the reserved band at the top.
        pdf.addImage(lhImg, 'JPEG', 0, 0, pageW, lhH, undefined, 'FAST');
      }
    });

    pdf.save(`${filename}.pdf`);
  } finally {
    document.body.removeChild(holder);
  }
}

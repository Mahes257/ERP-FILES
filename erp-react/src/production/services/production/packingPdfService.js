import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ensureBoxes, boxTotals, DEFAULT_DECLARATION } from '../../data/packing';
import { formatDate } from '../../utils/format';

// ============================================================
// A4 page constants
// ============================================================
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 28;
export const CONTENT_W = PAGE_W - MARGIN * 2;
const CENTER = PAGE_W / 2;
const BLACK = rgb(0, 0, 0);
const GRAY_BG = rgb(0.949, 0.949, 0.949);
const GREEN_BG = rgb(0.851, 0.918, 0.824);
const LINE_W = 0.6;

// Font sizes
const TITLE_SIZE = 18;
const HDR_LABEL = 9;
const HDR_VALUE = 9;
const SHIP_LABEL = 8.5;
const SHIP_VALUE = 8.5;
const TBL_SIZE = 7.5;
const TBL_HDR = 7;
const DECL_SIZE = 8;
const SIGN_SIZE = 10;

const lineH = (s) => Math.round(s * 1.25 * 10) / 10;
const norm = (v) => String(v ?? '').trim();
const has = (v) => norm(v) !== '';
const fmtNum = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};
const toNos = (u) => {
  const s = norm(u).toUpperCase();
  if (!s || s === 'PCS' || s === 'PC' || s === 'PIECES' || s === 'PIECE') return 'NOS';
  return s;
};
const pluralize = (count, word) => {
  const w = norm(word).toUpperCase() || 'PACKAGES';
  if (count === 1) return `1 ${w}`;
  if (/(S|X|Z)$/.test(w)) return `${count} ${w}ES`;
  return `${count} ${w}S`;
};

// ============================================================
// Drawing helpers
// ============================================================
function topY(top) { return PAGE_H - top; }
function noDesc(font, size) { return font.heightAtSize(size, { descender: false }); }

function drawText(page, ctx, text, x, top, size, opts = {}) {
  const font = opts.bold ? ctx.helvB : ctx.helv;
  const t = String(text ?? '');
  if (!t) return;
  page.drawText(t, {
    x,
    y: topY(top) - noDesc(font, size),
    size,
    font,
    color: opts.color || BLACK,
  });
}

function drawCentered(page, ctx, text, xCenter, top, size, opts = {}) {
  const font = opts.bold ? ctx.helvB : ctx.helv;
  const w = font.widthOfTextAtSize(text, size);
  drawText(page, ctx, text, xCenter - w / 2, top, size, opts);
}

function wrap(text, font, size, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxW) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrapLines(text, font, size, maxW) {
  const out = [];
  String(text || '').split('\n').forEach((para) => {
    wrap(para, font, size, maxW).forEach((l) => out.push(l));
  });
  return out.length ? out : [''];
}

function drawBox(page, x0, x1, top0, top1) {
  page.drawRectangle({
    x: x0, y: topY(top1), width: x1 - x0, height: top1 - top0,
    borderColor: BLACK, borderWidth: LINE_W,
  });
}

function fillRect(page, x0, x1, top0, top1, color) {
  page.drawRectangle({
    x: x0, y: topY(top1), width: x1 - x0, height: top1 - top0, color,
  });
}

function hLine(page, x0, x1, top) {
  page.drawLine({
    start: { x: x0, y: topY(top) }, end: { x: x1, y: topY(top) },
    thickness: LINE_W, color: BLACK,
  });
}

function vLine(page, x, top0, top1) {
  page.drawLine({
    start: { x, y: topY(top0) }, end: { x, y: topY(top1) },
    thickness: LINE_W, color: BLACK,
  });
}

// ============================================================
// Build packing data
// ============================================================
export function buildPackingListData(record) {
  const rec = ensureBoxes(record);
  const boxes = Array.isArray(rec.packingBoxes) ? rec.packingBoxes : [];
  const items = [];
  let sno = 0;
  let totalQty = 0;
  let totalNet = 0;
  let totalGross = 0;

  boxes.forEach((box) => {
    const bt = boxTotals(box);
    const pkg = norm(box.packageType) || 'WOODEN BOX';
    const dims = has(box.length) && has(box.width) && has(box.height)
      ? `(${norm(box.length)}*${norm(box.width)}*${norm(box.height)})` : '';
    const packingWeight = Number(box.packingWeight) || 0;
    const marks = norm(box.marksNos) || norm(box.marks);
    const boxItems = Array.isArray(box.items) ? box.items : [];

    boxItems.forEach((it) => {
      sno += 1;
      const net = Number(it.netWeight) || 0;
      let gross = 0;
      if (bt.net > 0) gross = net + (packingWeight * net) / bt.net;
      else if (boxItems.length > 0) gross = packingWeight / boxItems.length;
      const qty = Number(it.quantity) || 0;
      items.push({ sno, box, item: it, net, gross, qty, unit: it.unit || 'Pcs', pkg, dims, marks });
      totalQty += qty;
      totalNet += net;
      totalGross += gross;
    });
  });

  return {
    rec, boxes, items,
    totals: { boxes: boxes.length, items: items.length, qty: totalQty, net: totalNet, gross: totalGross },
  };
}

export function itemDescriptionLines(item) {
  const lines = [];
  if (has(item.description)) {
    lines.push(...norm(item.description).split(/\n+/).map((l) => l.trim()).filter(Boolean));
  }
  if (has(item.partNumber)) lines.push(norm(item.partNumber));
  if (has(item.manufacturer)) lines.push(norm(item.manufacturer));
  if (has(item.hsCode)) lines.push(`HS code ${norm(item.hsCode)}`);
  if (has(item.countryOfOrigin)) lines.push(`Country of origin: ${norm(item.countryOfOrigin)}`);
  return lines;
}

// ============================================================
// PAGE 1 — HEADER
// ============================================================
function renderPageOne(ctx, data) {
  const { rec } = data;
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  const pad = 6;
  const colW = CONTENT_W / 2;

  // Title
  const titleTop = 40;
  const titleH = 28;
  drawBox(page, MARGIN, PAGE_W - MARGIN, titleTop, titleTop + titleH);
  drawCentered(page, ctx, 'PACKING LIST', CENTER,
    titleTop + (titleH - noDesc(ctx.helvB, TITLE_SIZE)) / 2 + 1, TITLE_SIZE, { bold: true });

  const mainTop = titleTop + titleH;

  // Invoice string
  const invoiceStr = has(rec.invoiceNo)
    ? `${norm(rec.invoiceNo)}${has(rec.invoiceDate) ? ` & ${formatDate(rec.invoiceDate)}` : ''}`
    : `${norm(rec.id)} & ${formatDate(rec.packingDate)}`;

  // Order string
  const orderStr = has(rec.contractNumber)
    ? `Contract No: ${norm(rec.contractNumber)}${has(rec.contractDate) ? ` & ${formatDate(rec.contractDate)}` : ''}`
    : has(rec.buyerOrderNumber)
      ? `${norm(rec.buyerOrderNumber)}${has(rec.buyerOrderDate) ? ` & ${formatDate(rec.buyerOrderDate)}` : ''}`
      : '—';

  const rightRows = [
    { label: 'INVOICE NO & DATE', value: invoiceStr },
    { label: "BUYER'S ORDER NO & DATE", value: orderStr },
    { label: "EXPORTER'S REF:", value: norm(rec.exporterRef) },
    { label: 'GSTIN NO:', value: norm(rec.gstin) },
    { label: 'PAN:', value: norm(rec.pan) },
  ];

  // Left exporter block height
  const leftInnerW = colW - pad * 2;
  const leftHeight = (() => {
    let h = lineH(11) + 4;
    if (has(rec.exporterAddress))
      h += wrap(rec.exporterAddress, ctx.helv, HDR_VALUE, leftInnerW).length * lineH(HDR_VALUE) + 2;
    if (has(rec.exporterEmail)) h += lineH(HDR_VALUE) + 2;
    if (has(rec.exporterPhone)) h += lineH(HDR_VALUE) + 2;
    return h + 6;
  })();

  // Right side row heights
  const rowHs = rightRows.map((r) => {
    const lw = ctx.helvB.widthOfTextAtSize(`${r.label} `, HDR_LABEL);
    const aw = colW - pad * 2 - lw - 6;
    if (!has(r.value)) return lineH(HDR_LABEL) + 6;
    const vl = wrap(r.value, ctx.helv, HDR_VALUE, Math.max(20, aw));
    return Math.max(lineH(HDR_LABEL) + 6, 6 + vl.length * lineH(HDR_VALUE) + 4);
  });

  const rightSum = rowHs.reduce((a, b) => a + b, 0);
  const headerBlockH = Math.max(leftHeight, rightSum);

  drawBox(page, MARGIN, PAGE_W - MARGIN, mainTop, mainTop + headerBlockH);
  vLine(page, CENTER, mainTop, mainTop + headerBlockH);

  // Label row
  const labelRowH = 18;
  drawText(page, ctx, 'EXPORTER / MANUFACTURER', MARGIN + pad, mainTop + 5, HDR_LABEL, { bold: true });
  drawText(page, ctx, 'INVOICE NO & DATE', CENTER + pad, mainTop + 5, HDR_LABEL, { bold: true });
  hLine(page, MARGIN, PAGE_W - MARGIN, mainTop + labelRowH);

  // Left: Exporter
  let lt = mainTop + labelRowH + 4;
  if (has(rec.exporterName)) {
    drawText(page, ctx, norm(rec.exporterName), MARGIN + pad, lt, 11, { bold: true });
    lt += lineH(11) + 2;
  }
  if (has(rec.exporterAddress)) {
    wrap(rec.exporterAddress, ctx.helv, HDR_VALUE, leftInnerW).forEach((ln) => {
      drawText(page, ctx, ln, MARGIN + pad, lt, HDR_VALUE);
      lt += lineH(HDR_VALUE);
    });
    lt += 2;
  }
  if (has(rec.exporterEmail)) {
    drawText(page, ctx, `Email: ${norm(rec.exporterEmail)}`, MARGIN + pad, lt, HDR_VALUE);
    lt += lineH(HDR_VALUE) + 2;
  }
  if (has(rec.exporterPhone)) {
    drawText(page, ctx, `Phone: ${norm(rec.exporterPhone)}`, MARGIN + pad, lt, HDR_VALUE);
  }

  // Right: Invoice/Order details
  let rt = mainTop + labelRowH;
  rightRows.forEach((row, i) => {
    const rh = rowHs[i];
    const lw = ctx.helvB.widthOfTextAtSize(`${row.label} `, HDR_LABEL);
    drawText(page, ctx, row.label, CENTER + pad, rt + 4, HDR_LABEL, { bold: true });
    if (has(row.value)) {
      const valX = CENTER + pad + lw + 4;
      const valW = colW - pad * 2 - lw - 4;
      wrap(row.value, ctx.helv, HDR_VALUE, Math.max(20, valW)).forEach((ln, li) => {
        drawText(page, ctx, ln, valX, rt + 4 + li * lineH(HDR_VALUE), HDR_VALUE);
      });
    }
    hLine(page, CENTER, PAGE_W - MARGIN, rt + rh);
    rt += rh;
  });

  // Consignee / Buyer
  const consigneeTop = mainTop + headerBlockH;
  const consigneeParas = [norm(rec.buyerAddress)].filter(Boolean);
  const consigneeH = (() => {
    let h = lineH(10) + 6;
    consigneeParas.forEach((p) => {
      h += wrap(p, ctx.helv, HDR_VALUE, leftInnerW).length * lineH(HDR_VALUE) + 2;
    });
    return Math.max(60, h + 6);
  })();
  const buyerOtherH = (() => {
    let h = lineH(HDR_LABEL) + 6;
    if (has(rec.buyerOtherName)) h += lineH(HDR_VALUE) + 2;
    if (has(rec.buyerOtherAddress))
      h += wrap(rec.buyerOtherAddress, ctx.helv, HDR_VALUE, colW - pad * 2).length * lineH(HDR_VALUE);
    return Math.max(40, h + 6);
  })();
  const consigneeBlockH = Math.max(consigneeH, buyerOtherH);

  drawBox(page, MARGIN, PAGE_W - MARGIN, consigneeTop, consigneeTop + consigneeBlockH);
  vLine(page, CENTER, consigneeTop, consigneeTop + consigneeBlockH);

  let cTop = consigneeTop + 4;
  if (has(rec.buyerName)) {
    drawText(page, ctx, norm(rec.buyerName), MARGIN + pad, cTop, 10, { bold: true });
    cTop += lineH(10) + 2;
  }
  if (has(rec.buyerAddress)) {
    consigneeParas.forEach((p) => {
      wrap(p, ctx.helv, HDR_VALUE, leftInnerW).forEach((ln) => {
        drawText(page, ctx, ln, MARGIN + pad, cTop, HDR_VALUE);
        cTop += lineH(HDR_VALUE);
      });
      cTop += 2;
    });
  }

  drawText(page, ctx, 'BUYER (IF OTHER THAN CONSIGNEE)', CENTER + pad, consigneeTop + 4, HDR_LABEL, { bold: true });
  let btnTop = consigneeTop + 16;
  if (has(rec.buyerOtherName)) {
    drawText(page, ctx, norm(rec.buyerOtherName), CENTER + pad, btnTop, HDR_VALUE, { bold: true });
    btnTop += lineH(HDR_VALUE) + 1;
  }
  if (has(rec.buyerOtherAddress)) {
    wrap(rec.buyerOtherAddress, ctx.helv, HDR_VALUE, colW - pad * 2).forEach((ln) => {
      drawText(page, ctx, ln, CENTER + pad, btnTop, HDR_VALUE);
      btnTop += lineH(HDR_VALUE);
    });
  }

  // Shipping details
  const shipTop = consigneeTop + consigneeBlockH;
  const shipLabelW = (t) => ctx.helvB.widthOfTextAtSize(`${t}: `, SHIP_LABEL);
  const shipValH = (label, value) => {
    const lw = shipLabelW(label);
    const aw = colW - pad * 2 - lw - 6;
    if (!has(value)) return lineH(SHIP_LABEL) + 6;
    const lines = wrap(norm(value), ctx.helv, SHIP_VALUE, Math.max(20, aw));
    return Math.max(lineH(SHIP_LABEL) + 6, 6 + lines.length * lineH(SHIP_VALUE) + 2);
  };

  const bands = [
    { left: [['COUNTRY OF ORIGIN OF GOODS', rec.countryOfOrigin]], right: [['COUNTRY OF FINAL DESTINATION', rec.countryOfFinalDestination]] },
    { left: [['PRE-CARRIAGE BY', rec.preCarriageBy]], right: [['HS CODE', rec.hsCode], ['COMMODITY', rec.commodity]] },
    { left: [['PLACE OF RECEIPT', rec.placeOfReceipt]], right: [['PORT OF DISCHARGE', rec.portOfDischarge], ['PLACE OF DELIVERY', rec.placeOfDelivery]] },
    { left: [['VESSEL / FLIGHT NO', rec.vesselFlight]], right: [['TERMS OF DELIVERY', rec.termsOfDelivery]] },
    { left: [['PORT OF LOADING', rec.portOfLoading]], right: [['PAYMENT TERMS', rec.paymentTerms]] },
  ];

  const bandHs = bands.map((b) => {
    const lh = b.left.reduce((a, [l, v]) => a + shipValH(l, v), 0) + 6;
    const rh = b.right.reduce((a, [l, v]) => a + shipValH(l, v), 0) + 6;
    return Math.max(24, lh, rh);
  });

  const shipH = bandHs.reduce((a, b) => a + b, 0);
  drawBox(page, MARGIN, PAGE_W - MARGIN, shipTop, shipTop + shipH);
  vLine(page, CENTER, shipTop, shipTop + shipH);

  let btt = shipTop;
  bands.forEach((band, i) => {
    const bh = bandHs[i];
    let lTop = btt + 3;
    band.left.forEach(([label, value]) => {
      const lw = shipLabelW(label);
      const aw = colW - pad * 2 - lw - 6;
      drawText(page, ctx, `${label}:`, MARGIN + pad, lTop, SHIP_LABEL, { bold: true });
      if (has(value)) {
        const valX = MARGIN + pad + lw + 4;
        wrap(norm(value), ctx.helv, SHIP_VALUE, Math.max(20, aw)).forEach((ln, li) => {
          drawText(page, ctx, ln, valX, lTop + li * lineH(SHIP_VALUE), SHIP_VALUE);
        });
      }
    });
    let rTop = btt + 3;
    band.right.forEach(([label, value]) => {
      const lw = shipLabelW(label);
      const aw = colW - pad * 2 - lw - 6;
      drawText(page, ctx, `${label}:`, CENTER + pad, rTop, SHIP_LABEL, { bold: true });
      if (has(value)) {
        const valX = CENTER + pad + lw + 4;
        wrap(norm(value), ctx.helv, SHIP_VALUE, Math.max(20, aw)).forEach((ln, li) => {
          drawText(page, ctx, ln, valX, rTop + li * lineH(SHIP_VALUE), SHIP_VALUE);
        });
      }
    });
    if (i < bands.length - 1) hLine(page, MARGIN, PAGE_W - MARGIN, btt + bh);
    btt += bh;
  });
}

// ============================================================
// PAGE 2+ — PACKING TABLE
// ============================================================
const PACK_COLS = [36, 80, 95, 170, 55, 60, 52.28];
const PACK_XS = (() => {
  const xs = [MARGIN];
  PACK_COLS.forEach((w) => xs.push(xs[xs.length - 1] + w));
  return xs;
})();

const TBL_LH = Math.round(TBL_SIZE * 1.2 * 10) / 10;
const TBL_ROW_MIN = 20;
const TBL_HDR_H = 28;
const BODY_MAX = PAGE_H - 30;

function cellLinesH(lines) {
  return lines.length * TBL_LH + (lines.length ? 6 : 8);
}

function drawTableHeader(page, ctx, top) {
  drawBox(page, PACK_XS[0], PACK_XS[7], top, top + TBL_HDR_H);
  fillRect(page, PACK_XS[0], PACK_XS[7], top, top + TBL_HDR_H, GRAY_BG);
  const hdrs = [
    ['S.NO'], ['MARKS & NOS', '/ CONTAINER NO'], ['NO & KIND', 'OF PKGS'],
    ['DESCRIPTION', 'OF GOODS'], ['QTY'], ['NET WT', '(KGS)'], ['GROSS WT', '(KGS)'],
  ];
  hdrs.forEach((ls, i) => {
    const xc = (PACK_XS[i] + PACK_XS[i + 1]) / 2;
    const totalH = ls.length * TBL_LH;
    let y = top + (TBL_HDR_H - totalH) / 2;
    ls.forEach((lb) => {
      drawCentered(page, ctx, lb, xc, y, TBL_HDR, { bold: true });
      y += TBL_LH;
    });
  });
}

function itemRowHeight(ctx, it, descJoined) {
  const descW = PACK_COLS[3] - 8;
  const descL = wrapLines(descJoined, ctx.helv, TBL_SIZE, Math.max(TBL_SIZE * 2, descW));
  const marksL = it.marks ? wrapLines(it.marks, ctx.helv, TBL_SIZE, PACK_COLS[1] - 8) : [''];
  const pkgText = `${it.pkg}${it.dims ? ` ${it.dims}` : ''}`.trim();
  const pkgL = wrapLines(pkgText, ctx.helv, TBL_SIZE, PACK_COLS[2] - 8);
  return Math.max(TBL_ROW_MIN, cellLinesH(descL), cellLinesH(marksL), cellLinesH(pkgL), TBL_LH * 2 + 6);
}

function drawItemRow(page, ctx, it, top, rowH) {
  drawBox(page, PACK_XS[0], PACK_XS[7], top, top + rowH);
  for (let i = 1; i < 7; i++) vLine(page, PACK_XS[i], top, top + rowH);

  const midY = top + (rowH - TBL_LH) / 2;

  // S.NO
  drawCentered(page, ctx, String(it.sno), (PACK_XS[0] + PACK_XS[1]) / 2, midY, TBL_SIZE);

  // MARKS
  if (it.marks) {
    const marksL = wrapLines(it.marks, ctx.helv, TBL_SIZE, PACK_COLS[1] - 8);
    marksL.forEach((ln, li) => {
      drawText(page, ctx, ln, PACK_XS[1] + 4, top + 4 + li * TBL_LH, TBL_SIZE);
    });
  }

  // NO & KIND OF PKGS
  const pkgText = `${it.pkg}${it.dims ? ` ${it.dims}` : ''}`.trim();
  const pkgL = wrapLines(pkgText, ctx.helv, TBL_SIZE, PACK_COLS[2] - 8);
  const pkgTotalH = pkgL.length * TBL_LH;
  let pkgY = top + (rowH - pkgTotalH) / 2;
  pkgL.forEach((ln) => {
    drawText(page, ctx, ln, PACK_XS[2] + 4, pkgY, TBL_SIZE);
    pkgY += TBL_LH;
  });

  // DESCRIPTION OF GOODS
  const descJoined = it.desc.join('\n');
  const descLines = wrapLines(descJoined, ctx.helv, TBL_SIZE, PACK_COLS[3] - 8);
  descLines.forEach((ln, li) => {
    drawText(page, ctx, ln, PACK_XS[3] + 4, top + 4 + li * TBL_LH, TBL_SIZE);
  });

  // QTY
  drawCentered(page, ctx, it.count, (PACK_XS[4] + PACK_XS[5]) / 2, midY, TBL_SIZE);
  drawCentered(page, ctx, toNos(it.unit), (PACK_XS[4] + PACK_XS[5]) / 2, midY + TBL_LH, TBL_SIZE);

  // NET WEIGHT
  drawCentered(page, ctx, fmtNum(it.net), (PACK_XS[5] + PACK_XS[6]) / 2, midY, TBL_SIZE);

  // GROSS WEIGHT
  drawCentered(page, ctx, fmtNum(it.gross), (PACK_XS[6] + PACK_XS[7]) / 2, midY, TBL_SIZE);
}

function renderPackingPages(ctx, data) {
  const { rec, items, totals, boxes } = data;

  const rows = items.map((it) => {
    const descJoined = itemDescriptionLines(it.item).join('\n') || '—';
    const desc = itemDescriptionLines(it.item);
    return {
      ...it, desc, descJoined,
      count: fmtNum(it.qty),
      pkgWord: norm(it.pkg) || 'PACKAGE',
      rowH: itemRowHeight(ctx, it, descJoined),
    };
  });

  let page = null;
  let bodyTop = 0;

  const startNewPage = () => {
    page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    drawTableHeader(page, ctx, MARGIN);
    bodyTop = MARGIN + TBL_HDR_H;
  };

  startNewPage();

  rows.forEach((it) => {
    const remaining = BODY_MAX - bodyTop;
    if (it.rowH > remaining && bodyTop > MARGIN + TBL_HDR_H + 10) startNewPage();
    drawItemRow(page, ctx, it, bodyTop, it.rowH);
    bodyTop += it.rowH;
  });

  // Total row
  const pkgWords = pluralize(totals.boxes, boxes?.[0]?.packageType || 'WOODEN BOX');
  const totalRowH = 20;
  if (bodyTop + totalRowH > BODY_MAX) startNewPage();

  drawBox(page, PACK_XS[0], PACK_XS[7], bodyTop, bodyTop + totalRowH);
  fillRect(page, PACK_XS[0], PACK_XS[7], bodyTop, bodyTop + totalRowH, GRAY_BG);
  for (let i = 1; i < 7; i++) vLine(page, PACK_XS[i], bodyTop, bodyTop + totalRowH);

  const totalMid = bodyTop + (totalRowH - TBL_LH) / 2;
  drawText(page, ctx, 'TOTAL', PACK_XS[1] + 4, totalMid, TBL_SIZE, { bold: true });
  drawText(page, ctx, pkgWords, PACK_XS[2] + 4, totalMid, TBL_SIZE, { bold: true });
  drawText(page, ctx, `${totals.items} ${totals.items === 1 ? 'ITEM' : 'ITEMS'}`, PACK_XS[3] + 4, totalMid, TBL_SIZE, { bold: true });
  const totalQtyStr = totals.qty > 0 ? `${fmtNum(totals.qty)} ${toNos(boxes?.[0]?.items?.[0]?.unit)}` : '';
  drawText(page, ctx, totalQtyStr, PACK_XS[4] + 4, totalMid, TBL_SIZE, { bold: true });
  drawText(page, ctx, fmtNum(totals.net), PACK_XS[5] + 4, totalMid, TBL_SIZE, { bold: true });
  drawText(page, ctx, fmtNum(totals.gross), PACK_XS[6] + 4, totalMid, TBL_SIZE, { bold: true });
  bodyTop += totalRowH + 12;

  // Weight summary
  const wRowH = 16;
  const wHeaderH = 18;
  if (bodyTop + wRowH * boxes.length + wHeaderH + 20 > BODY_MAX) startNewPage();

  hLine(page, MARGIN, PAGE_W - MARGIN, bodyTop);
  drawText(page, ctx, 'NET / GROSS WEIGHT', MARGIN + 4, bodyTop + 2, 9, { bold: true });
  bodyTop += 16;

  const wXs = [MARGIN, MARGIN + PACK_COLS[0], MARGIN + PACK_COLS[0] + PACK_COLS[1],
    MARGIN + PACK_COLS[0] + PACK_COLS[1] + PACK_COLS[5]];
  const wRight = MARGIN + PACK_COLS[0] + PACK_COLS[1] + PACK_COLS[5] + PACK_COLS[6];

  drawBox(page, MARGIN, wRight, bodyTop, bodyTop + wHeaderH);
  ['BOX NO', 'MARKS & NOS / CONTAINER NO', 'NET (KGS)', 'GROSS (KGS)'].forEach((lb, i) => {
    const w = i < 3 ? wXs[i + 1] - wXs[i] : wRight - wXs[i];
    const lines = wrapLines(lb, ctx.helvB, TBL_SIZE, Math.max(TBL_SIZE * 2, w - 6));
    const totalH = lines.length * TBL_LH;
    let y = bodyTop + (wHeaderH - totalH) / 2;
    lines.forEach((ln) => {
      drawText(page, ctx, ln, wXs[i] + 3, y, TBL_SIZE, { bold: true });
      y += TBL_LH;
    });
  });
  bodyTop += wHeaderH;

  boxes.forEach((box, bi) => {
    const bt = boxTotals(box);
    drawBox(page, MARGIN, wRight, bodyTop, bodyTop + wRowH);
    drawCentered(page, ctx, String(bi + 1), (wXs[0] + wXs[1]) / 2, bodyTop + 4, TBL_SIZE);
    drawText(page, ctx, norm(box.marksNos) || norm(box.marks) || '—', wXs[1] + 4, bodyTop + 4, TBL_SIZE);
    drawCentered(page, ctx, fmtNum(bt.net), (wXs[2] + wXs[3]) / 2, bodyTop + 4, TBL_SIZE);
    drawCentered(page, ctx, fmtNum(bt.gross), (wXs[3] + wRight) / 2, bodyTop + 4, TBL_SIZE);
    bodyTop += wRowH;
  });
  bodyTop += 10;

  // Declaration
  const declText = norm(rec.declarationText) || norm(rec.declaration) || DEFAULT_DECLARATION;
  const declLines = wrapLines(declText, ctx.helv, DECL_SIZE, CONTENT_W - 16);
  const declTitleH = 20;
  const declBodyH = declLines.length * lineH(DECL_SIZE) + 10;
  const declH = declTitleH + declBodyH + 6;

  if (bodyTop + declH + 20 > BODY_MAX) startNewPage();

  drawBox(page, MARGIN, PAGE_W - MARGIN, bodyTop, bodyTop + declH);
  fillRect(page, MARGIN, PAGE_W - MARGIN, bodyTop, bodyTop + declTitleH, GREEN_BG);
  drawCentered(page, ctx, 'DECLARATION', CENTER, bodyTop + (declTitleH - noDesc(ctx.helvB, 9)) / 2, 9, { bold: true });
  declLines.forEach((ln, li) => {
    drawText(page, ctx, ln, MARGIN + 8, bodyTop + declTitleH + 6 + li * lineH(DECL_SIZE), DECL_SIZE);
  });
  bodyTop += declH + 14;

  // Signature
  const sigBlockW = 180;
  const sigBlockX = PAGE_W - MARGIN - sigBlockW;
  const exporter = norm(rec.exporterName) || 'EXPORTER';

  drawText(page, ctx, `For ${exporter}`, sigBlockX, bodyTop, SIGN_SIZE, { bold: true });

  // Signature image
  const img = rec.signatureImage;
  if (typeof img === 'string' && img.startsWith('data:image')) {
    try {
      const [, b64] = img.split(',');
      const imgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      let embedded;
      if (img.includes('png')) embedded = ctx.doc.embedPng(imgBytes);
      else embedded = ctx.doc.embedJpg(imgBytes);
      const scale = Math.min(100 / embedded.width, 50 / embedded.height, 1);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      page.drawImage(embedded, {
        x: sigBlockX + sigBlockW - w,
        y: topY(bodyTop + 12) - noDesc(ctx.helv, 9) - h,
        width: w, height: h,
      });
    } catch (e) { /* ignore */ }
  }

  drawText(page, ctx, 'Authorized Signatory', sigBlockX, bodyTop + 68, 9);
}

// ============================================================
// Main exports
// ============================================================
export async function generatePackingListPdf(record) {
  const data = buildPackingListData(record);
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx = { doc, helv, helvB };
  renderPageOne(ctx, data);
  renderPackingPages(ctx, data);
  return doc.save();
}

export async function downloadPackingListPdf(record, filename) {
  const bytes = await generatePackingListPdf(record);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `Packing_List_${record?.id || 'PL'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return url;
}

export async function printPackingListPdf(record) {
  const bytes = await generatePackingListPdf(record);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow.print();
    } catch (e) {
      window.open(url, '_blank');
    }
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 5000);
  };
}

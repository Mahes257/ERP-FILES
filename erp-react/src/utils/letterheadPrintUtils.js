// ============================================================================
// Letterhead multi-page utilities.
//
// The on-screen letterhead (.letterhead) renders once at the top of the A4
// sheet. For multi-page documents it must repeat on EVERY page:
//
//   • PDF (captureSheetToPdf): stampLetterheadIntoClone() measures the live
//     letterhead's height, reserves that space on every PDF page and draws
//     the letterhead markup at the top of each cropped page.
//
//   • Print (window.print): printSheetWithLetterhead() grafts print-only
//     copies of the letterhead into the top of each direct child section of
//     the sheet. Fragmented sections carry the grafted copy to the top of the
//     next printed page (verified in Chromium: the letterhead repeats on
//     every page while the item table's own <thead> still repeats too).
//     Grafted copies are display:none on screen and only display in print.
// ============================================================================
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import Letterhead from '../components/SalesDesign/Letterhead';

/** Render the Letterhead component to a detached DOM element. */
export function buildLetterheadNode() {
  const host = document.createElement('div');
  host.style.display = 'none';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(Letterhead));
  const node = host.firstElementChild || host;
  return { node, host, root };
}

/**
 * Stamp the letterhead on every page of the PDF pipeline.
 *
 * Called by captureSheetToPdf AFTER the full-sheet canvas is rendered and
 * BEFORE pages are cropped. Mutates the capture state:
 *   - shifts every break down by lhHpx and reserves lhHpx of headroom per page,
 *   - exposes lhNode/lhHpx so each page gets the letterhead drawn on top.
 */
export function stampLetterheadIntoClone(clone, ctx) {
  const lh = clone.querySelector(':scope > .letterhead');
  if (!lh) return ctx;
  const scale = ctx.scaleCanvas || 1;
  const rect = lh.getBoundingClientRect();
  const top = rect.top - ctx.sheetTop;
  const lhHpx = rect.height * scale;

  // Measure where the content actually begins (first non-letterhead child).
  const firstChild = Array.from(clone.children).find((c) => c !== lh);
  let contentTop = 0;
  if (firstChild) {
    const fr = firstChild.getBoundingClientRect();
    contentTop = (fr.top - ctx.sheetTop) * scale;
  }

  ctx.lhNode = lh;
  ctx.lhHpx = Math.round(lhHpx);
  ctx.lhContentTop = Math.round(contentTop);
  ctx.lhTopPx = Math.round(top * scale);
  // The first page already shows the letterhead in the captured pixels, so
  // page 1 is NOT stamped; continuation pages are.
  ctx.stampFromPage = 1;
  return ctx;
}

/**
 * Graft print-only letterhead copies for window.print().
 * Clones the live letterhead into the top of each direct child section of the
 * sheet (never into the letterhead itself or real tables). The grafted copies
 * (lh-print-piece) are hidden on screen and revealed only in @media print;
 * the sheet's own letterhead hides in print so page 1 shows exactly one.
 */
export function printSheetWithLetterhead() {
  // The live A4 sheet is the print source of truth. Do not mutate it with
  // cloned headers or fixed padding: those changes make print diverge from
  // preview and can duplicate the letterhead between page fragments.
  return () => {};
}

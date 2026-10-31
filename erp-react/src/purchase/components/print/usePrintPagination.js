/**
 * purchase/components/print/usePrintPagination.js
 * ------------------------------------------------------------------
 * Reusable measurement-driven pagination hook for ALL Purchase print pages.
 *
 * Replaces the ~80 lines of identical boilerplate that every print page
 * previously duplicated (refs, collectMeasures, measurement useEffect,
 * re-measurement useEffect, body class, sheetRefs).
 *
 * Usage:
 *
 *   const { pages, sheetRefs, measureRef, topRef, runningRef,
 *           tableHeadRef, tbodyRef, bottomRef, footRef } =
 *     usePrintPagination(data, rows.length);
 *
 *   // Measurement phase (pages === null):
 *   //   <div className="pr-measure" ref={measureRef}>
 *   //     <section className="pr-sheet"> ... empty sheet ... </section>
 *   //     <div ref={topRef}> first-page header </div>
 *   //     <div ref={runningRef}> running header for page 2+ </div>
 *   //     <div ref={tableHeadRef}> table thead </div>
 *   //     <div> table with tbody ref={tbodyRef} </div>
 *   //     <div ref={bottomRef}> notes/summary/signatures </div>
 *   //     <div ref={footRef}> footer </div>
 *   //   </div>
 *
 *   // Render phase (pages !== null):
 *   //   pages.map((page, i) =>
 *   //     <section className="pr-sheet" ref={(el) => sheetRefs.register(el, i + 1)}>
 *   //       ... header ... table rows ... bottom ... footer ...
 *   //     </section>
 *   //   )
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { paginatePrint } from '../../utils/printPagination';

/**
 * @param {any}    data      — loaded document data (triggers measurement on change)
 * @param {number} rowCount  — number of item rows (triggers re-measurement on change)
 * @returns pagination state + refs
 */
export function usePrintPagination(data, rowCount = 0) {
  const [pages, setPages] = useState(null);

  /* ── Refs ── */
  const measureRef = useRef(null);
  const topRef = useRef(null);
  const runningRef = useRef(null);
  const tableHeadRef = useRef(null);
  const tbodyRef = useRef(null);
  const bottomRef = useRef(null);
  const footRef = useRef(null);
  const sheetRefsMap = useRef({});

  /* Register/unregister sheet DOM nodes for PDF export. Stable object so
     consumers can call sheetRefs.register(el, page) from ref callbacks.
     The map ref is only read inside the callbacks, never during render. */
  const sheetRefs = useMemo(() => ({
    register(el, pageNum) {
      if (el) sheetRefsMap.current[pageNum] = el;
      else delete sheetRefsMap.current[pageNum];
    },
    getAll() {
      return Object.keys(sheetRefsMap.current)
        .map(Number)
        .sort((a, b) => a - b)
        .map((key) => sheetRefsMap.current[key])
        .filter(Boolean);
    },
  }), []);

  /* ── Body class for @media print ── */
  useEffect(() => {
    document.body.classList.add('pr-print-page');
    return () => document.body.classList.remove('pr-print-page');
  }, []);

  /* ── Measurement function ── */
  const collectMeasures = useCallback(() => {
    const sheet = measureRef.current;
    const inner = sheet?.querySelector('.pr-sheet-inner');
    const innerStyle = inner ? getComputedStyle(inner) : null;
    const SAFETY_BUFFER = 14;
    const contentHeight =
      (sheet?.clientHeight || 0) -
      (innerStyle ? parseFloat(innerStyle.paddingTop) + parseFloat(innerStyle.paddingBottom) : 0) -
      (footRef.current?.offsetHeight || 0) -
      SAFETY_BUFFER;

    return {
      contentHeight: Math.max(0, contentHeight),
      topHeight: topRef.current?.offsetHeight || 0,
      runningHeight: runningRef.current?.offsetHeight || 0,
      tableHeadHeight: tableHeadRef.current?.offsetHeight || 0,
      bottomHeight: bottomRef.current?.offsetHeight || 0,
      rowHeights: Array.from(
        /* .pr-empty-row = placeholder rows (PrintTable empty message),
           .pr-totals-row = summary rows rendered by documents that put
           a totals row inside the measured table (e.g. PCS). Neither
           participates in pagination, so measured rows map exactly
           onto the document's item rows. */
        tbodyRef.current?.querySelectorAll('tr:not(.pr-empty-row):not(.pr-totals-row)') || []
      ).map((tr) => tr.offsetHeight),
    };
  }, []);

  /* ── Trigger measurement after data loads ── */
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const run = async () => {
      try { await (document.fonts?.ready ?? Promise.resolve()); } catch { /* ok */ }
      requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          setPages(paginatePrint(collectMeasures()));
        } catch {
          setPages([]);
        }
      });
    };
    run();
    return () => { cancelled = true; };
  }, [data, collectMeasures]);

  /* ── Re-measure when row count changes ── */
  useEffect(() => {
    if (!data || pages === null) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        setPages(paginatePrint(collectMeasures()));
      } catch { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [rowCount, data, pages === null, collectMeasures]);

  return {
    pages,
    sheetRefs,
    measureRef,
    topRef,
    runningRef,
    tableHeadRef,
    tbodyRef,
    bottomRef,
    footRef,
    collectMeasures,
  };
}

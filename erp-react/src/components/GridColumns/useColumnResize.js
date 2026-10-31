/**
 * useColumnResize.js — drag-to-resize for any grid column.
 * ------------------------------------------------------------------
 * Attaches a resize handle to a column header. Dragging the handle widens or
 * narrows the column live (pointer events, so mouse + touch + pen all work),
 * clamped to a sensible minimum so a column can never be squeezed into an
 * unreadable sliver, and a maximum so it can always be made readable again.
 *
 * Alignment: the caller renders the SAME widths into a <colgroup>, so header
 * and body cells always line up; the table is given a min-width equal to the
 * sum of the visible widths, and the grid scrolls horizontally INSIDE its own
 * container (`overflow-x: auto`) — never the page.
 *
 * Persistence: on release the final width is committed through onChange(),
 * which writes it to the grid configuration (document JSON or the
 * MySQL-backed grid config store).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clampColumnWidth } from '../../utils/gridColumns';

export default function useColumnResize({ columns, onChange }) {
  const [liveWidths, setLiveWidths] = useState({});
  const [resizingId, setResizingId] = useState(null);
  const dragRef = useRef(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setResizingId(null);
    setLiveWidths({});
    if (!drag) return;
    // Commit the final width to the column configuration.
    const next = (columnsRef.current || []).map((c) =>
      c.id === drag.id ? { ...c, width: drag.width } : c
    );
    if (onChange) onChange(next);
  }, [onChange]);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = (e.touches ? e.touches[0].clientX : e.clientX) - drag.startX;
    const width = clampColumnWidth(drag.startWidth + delta);
    drag.width = width;
    setLiveWidths((prev) => ({ ...prev, [drag.id]: width }));
  }, []);

  useEffect(() => {
    const move = (e) => onPointerMove(e);
    const up = () => endDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [onPointerMove, endDrag]);

  /**
   * Width currently rendered for a column (live value while dragging).
   * `undefined` means "auto" — the column has never been resized, so the
   * table's own layout decides (used by auto-layout grids such as the CRM
   * lists, which keep their existing proportions until the user drags).
   */
  const widthOf = useCallback(
    (col) => {
      const live = liveWidths[col?.id];
      if (live != null) return live;
      return col?.width != null ? clampColumnWidth(col.width) : undefined;
    },
    [liveWidths]
  );

  /** Spread onto the resize handle element inside a column header. */
  const resizerProps = useCallback((col) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
      const startWidth = rect ? rect.width : widthOf(col);
      dragRef.current = { id: col.id, startX: e.clientX, startWidth, width: startWidth };
      setResizingId(col.id);
    },
    onMouseDown: (e) => {
      // Fallback for browsers without PointerEvent support.
      if (typeof window !== 'undefined' && 'PointerEvent' in window) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
      const startWidth = rect ? rect.width : widthOf(col);
      dragRef.current = { id: col.id, startX: e.clientX, startWidth, width: startWidth };
      setResizingId(col.id);
    }
  }), [widthOf]);

  /** Total rendered width of the given columns — drives the table min-width. */
  const totalWidth = useCallback(
    (cols, extra = 0) => (cols || []).reduce((sum, c) => sum + (Number(widthOf(c)) || 0), extra),
    [widthOf]
  );

  return { widthOf, resizerProps, totalWidth, resizingId, liveWidths };
}

/**
 * ColumnResizer — the drag handle rendered at the right edge of a column
 * header. Place it inside the <th> (the cell becomes the drag anchor) and pass
 * the resize controller returned by useColumnResize.
 *
 * The header cell must be `position: relative` (class `grid-resizable-th`) so
 * the handle sits on the column boundary.
 */
export default function ColumnResizer({ column, resize, className = '' }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${column.label} column`}
      title="Drag to resize column"
      className={`grid-col-resizer ${resize.resizingId === column.id ? 'grid-col-resizer-active' : ''} ${className}`}
      {...resize.resizerProps(column)}
      /* A real drag ends with a click on the handle (it stays under the
         cursor). Swallow it so resizing a column never also triggers the
         header's click action (e.g. sorting). */
      onClick={(e) => e.stopPropagation()}
    />
  );
}

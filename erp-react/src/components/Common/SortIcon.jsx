/**
 * Sort indicator for every sortable column header in the ERP.
 *
 * ONE symbol, everywhere: `⇅`.
 * ---------------------------------------------------------------------
 * The rule is deliberately fixed so no module can drift — no ˄/˅, no ↕,
 * no ⇵, no pair of separate up/down icons and no custom connecting-line
 * SVG. Every list page reads `Column Name ⇅` identically.
 *
 * The glyph stays on the column-name line, inherits the header's own
 * typography/colour (`currentColor`) and is only emphasised — full
 * opacity — on the column the list is currently sorted by. Sorting
 * itself is untouched; this is presentation only, and the direction is
 * still exposed to assistive tech through `aria-sort` on the <th>.
 *
 * Styles: `.erp-sort-ind` in styles/sticky-data-grid.css.
 */
export default function SortIcon({ active = false }) {
  return (
    <span
      className={`erp-sort-ind${active ? ' is-active' : ''}`}
      aria-hidden="true"
    >
      ⇅
    </span>
  );
}

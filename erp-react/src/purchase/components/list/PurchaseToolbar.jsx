/**
 * purchase/components/list/PurchaseToolbar.jsx
 * ------------------------------------------------------------------
 * Shared list toolbar (pr-toolbar / pr-toolbar-left / pr-toolbar-right,
 * styled by cpr-list.css), extracted from the Purchase Requisition
 * list. The caller passes `left` (filter/clear/refresh buttons) and
 * `right` (search + export + columns dropdowns) nodes; `count` is the
 * page-info string rendered at the right edge.
 * ------------------------------------------------------------------
 */
export default function PurchaseToolbar({ left, right, count }) {
  return (
    <div className="pr-toolbar">
      <div className="pr-toolbar-left">{left}</div>
      <div className="pr-toolbar-right">
        {right}
        {count && <span className="toolbar-count">{count}</span>}
      </div>
    </div>
  );
}
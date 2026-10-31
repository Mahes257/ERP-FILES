/**
 * purchase/components/list/PurchaseSegmentedTabs.jsx
 * ------------------------------------------------------------------
 * Shared segmented pill control for WORKFLOW status tabs only
 * (e.g. Pending · Approved · Rejected in the PR Approval Center,
 * Pending Review · Reviewed · Returned in Technical Review).
 *
 * Uses the same markup and CSS classes as the master Purchase
 * Requisition List's lifecycle segmented control (segmented-control /
 * segmented-option / tab-count, styled by cpr-list.css +
 * requisition-list-polish.css), so border radius, shadows, colors,
 * typography, hover and active states are identical.
 *
 * NOTE: The Purchase Requisition List's own lifecycle tabs (All
 * Requisitions · Active · Archived · Deleted) are intentionally NOT
 * rendered through this component — they stay inline in the master
 * page. This component is only for workflow pages.
 * ------------------------------------------------------------------
 */
export default function PurchaseSegmentedTabs({ tabs = [], activeKey, onSelect, ariaLabel = 'Status' }) {
  return (
    <div className="segmented-control" role="tablist" aria-label={ariaLabel}>
      {tabs.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={activeKey === item.key}
          className={`segmented-option ${activeKey === item.key ? 'active' : ''}`}
          onClick={() => onSelect && onSelect(item.key)}
        >
          {item.label} <span className="tab-count">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

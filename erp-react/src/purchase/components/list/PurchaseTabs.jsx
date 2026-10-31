/**
 * purchase/components/list/PurchaseTabs.jsx
 * ------------------------------------------------------------------
 * Shared underline status tabs (pr-tabs / pr-tab / tab-count, styled
 * by cpr-list.css), extracted from the Purchase Requisition list.
 *
 * Renders a row of tabs with label + optional count. An optional
 * leading "All" tab mirrors the master list; each tab reports its key
 * through onSelect immediately.
 * ------------------------------------------------------------------
 */
export default function PurchaseTabs({ all, tabs = [], activeKey, onSelect, ariaLabel = 'Status' }) {
  const isAllActive = activeKey === all?.key || (all && !tabs.some((t) => t.key === activeKey));
  return (
    <div className="pr-tabs" role="tablist" aria-label={ariaLabel}>
      {all && (
        <button
          type="button"
          role="tab"
          aria-selected={isAllActive}
          className={`pr-tab client-tab ${isAllActive ? 'active' : ''}`}
          onClick={() => onSelect && onSelect(all.key)}
        >
          {all.label} <span className="tab-count">{all.count}</span>
        </button>
      )}
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeKey === tab.key}
          className={`pr-tab ${activeKey === tab.key ? 'active' : ''}`}
          onClick={() => onSelect && onSelect(tab.key)}
        >
          {tab.label} <span className="tab-count">{tab.count !== undefined ? tab.count : 0}</span>
        </button>
      ))}
    </div>
  );
}
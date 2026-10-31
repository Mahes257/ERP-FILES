/**
 * ModuleHubLayout — shared layout for all ERP module hub pages.
 *
 * Wraps a fixed header (page header + tab navigation) above a scrollable
 * content area. Every Hub page (CRM, CPR, Sales Execution, Marketing,
 * Customer Purchase Orders) uses this to get identical sticky-header
 * scrolling behaviour without duplicating layout logic.
 *
 * Usage:
 *   <ModuleHubLayout header={<> ...breadcrumb / header / tabs...</>}>
 *     <ActiveComponent />
 *   </ModuleHubLayout>
 */
export default function ModuleHubLayout({ header, children }) {
  return (
    <div className="module-hub">
      {/* ===== FIXED HEADER ===== */}
      <div className="module-hub-header">
        {header}
      </div>

      {/* ===== SCROLLABLE CONTENT ===== */}
      <div className="module-hub-content">
        {children}
      </div>
    </div>
  );
}

/**
 * Navigation helpers for Sales/Marketing modules.
 *
 * - openInNewTab: opens a route in a new browser tab (for Create actions)
 * - openRecordInNewTab: opens a specific record detail in a new tab
 * - buildRecordHref: returns the full URL for a record (for <a href> elements
 *   that support Ctrl+Click / Middle Click natively)
 */

/**
 * Open a path in a new browser tab.
 * Used by Create/Add/New buttons so the list page stays open.
 */
export function openInNewTab(path) {
  if (!path) return;
  window.open(path, '_blank', 'noopener,noreferrer');
}

/**
 * Deep links into the CPR hub (/cprs).
 *
 * CprHub renders CPR / CPR Technical Verification / Cost Workout / Profit
 * Workout / CPR Reports and tracks the active tab in the URL (?tab=), so these
 * are the only paths that open a specific tab WITH the hub header + tab nav.
 *
 * Every "back to the <tab> list" affordance in the module must use these
 * instead of the standalone routes (/cost-workouts, /profit-workouts), which
 * render the same table without the hub chrome.
 */
export const CPR_HUB_TABS = {
  cpr: '/cprs',
  'tech-verification': '/cprs?tab=tech-verification',
  'cost-workout': '/cprs?tab=cost-workout',
  'profit-workout': '/cprs?tab=profit-workout',
  reports: '/cprs?tab=reports'
};

/**
 * Deep links into the Sales Execution hub (/sales).
 *
 * SalesExecHub renders Quotations / Sales Contracts / Customer Purchase
 * Orders / Proforma Invoices / Delivery Challans / Invoices / Credit Notes /
 * Payment Receipts and tracks the active tab in the URL (?tab=), so these are
 * the only paths that open a specific tab WITH the hub breadcrumb, page header
 * and module tab nav.
 *
 * Every "back to the <tab> list" affordance in the module must use these
 * instead of the standalone routes (/quotations, /sales-contracts, ...), which
 * render the same table without the hub chrome.
 */
export const SALES_EXEC_HUB_TABS = {
  quotations: '/sales?tab=quotations',
  salesContracts: '/sales?tab=salesContracts',
  customerPO: '/sales?tab=customerPO',
  proformaInvoices: '/sales?tab=proformaInvoices',
  deliveryChallans: '/sales?tab=deliveryChallans',
  invoices: '/sales?tab=invoices',
  creditNotes: '/sales?tab=creditNotes',
  paymentReceipts: '/sales?tab=paymentReceipts'
};

/**
 * Build the full absolute URL for a route path.
 * Works whether the app is served from root or a sub-path.
 */
export function buildRecordHref(path) {
  if (!path) return '#';
  // Use the current origin so <a href> links work with Ctrl+Click / Middle Click
  return path;
}

/**
 * Handler for record-number clicks.
 * - Left click (no modifier): navigate in current tab (via React Router)
 * - Ctrl/Cmd + Click: open in new tab
 * - Middle click: browser default (new tab)
 *
 * Returns a click handler to attach to a clickable element.
 */
export function recordClickHandler(navigate, path, e) {
  if (!e) {
    navigate(path);
    return;
  }
  // Ctrl/Cmd + Click → new tab (let the browser handle it via <a href>)
  // Middle mouse button → new tab (browser default)
  // Regular left click → current tab
  const isModified = e.ctrlKey || e.metaKey || e.button === 1;
  if (isModified) {
    // Don't prevent default — let the browser open in new tab
    return;
  }
  e.preventDefault();
  navigate(path);
}

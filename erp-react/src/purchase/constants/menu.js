// Purchase module sidebar data — ported from the legacy js/sidebar.js
// "Purchase" menu tree into the self-contained src/purchase package.
// Each entry has a stable `key` used for local highlight state and a
// `href` consumed by the main-project AppLayout (PURCHASE_CATEGORIES).
//
// The sidebar shows ONLY top-level headings — no expandable sub-menus.
// Sub-sections (e.g. RFQ List, Follow-ups, Quotations) are accessible
// via in-page tab navigation on the RFQ & Quotations workspace page.
//
// Keys are stable across label changes — the sidebar count hook
// (usePurchaseSidebarCounts) addresses keys by key, so renaming a
// label never breaks its badge.

export const PURCHASE_CATEGORIES = [
  { key: 'purchase-dashboard', label: 'Dashboard', icon: 'PieChart', href: '/purchase/dashboard' },
  { key: 'work-queue', label: 'Work Queue', icon: 'ListTodo', href: '/purchase/work-queue', countKey: 'work-queue' },
  { key: 'purchase-requisition', label: 'Purchase Requisition', icon: 'ClipboardList', href: '/purchase/requisition', countKey: 'purchase-requisition' },
  { key: 'vendor-management', label: 'Vendor Management', icon: 'Building2', href: '/purchase/vendors', countKey: 'vendor-list' },
  { key: 'rfq-quotations', label: 'RFQ & Quotations', icon: 'Mail', href: '/purchase/rfq', countKey: 'rfq-list' },
  { key: 'purchase-orders', label: 'Purchase Orders', icon: 'FileText', href: '/purchase/orders', countKey: 'po-list' },
  { key: 'logistics', label: 'Logistics', icon: 'Truck', href: '/purchase/logistics', countKey: 'logistics' },
  { key: 'purchase-invoices', label: 'Purchase Invoice', icon: 'Receipt', href: '/purchase/invoices', countKey: 'invoices' },
  { key: 'purchase-documents', label: 'Documents', icon: 'FolderOpen', href: '/purchase/documents', countKey: 'vendor-documents' },
  { key: 'purchase-reports', label: 'Reports', icon: 'BarChart3', href: '/purchase/reports' },
  { key: 'purchase-settings', label: 'Settings', icon: 'Settings', href: '/purchase/settings' },
];

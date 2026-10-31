/**
 * purchase/constants/moduleTabs.js
 * ------------------------------------------------------------------
 * Tab configurations for every Purchase module that uses in-page
 * tab navigation. Each module maps to an array of tab objects with:
 *
 *   key        – sidebar badge key (matches usePurchaseSidebarCounts)
 *   label      – full tab label (medium+ screens)
 *   shortLabel – compact label (mobile / narrow)
 *   href       – route to navigate to
 *   icon       – lucide-react icon component
 *
 * The key values MUST match the COUNTED_LEAF_KEYS in
 * usePurchaseSidebarCounts so the badge counts work correctly.
 *
 * RFQ & Quotations tabs are defined in RfqTabNav.jsx (the original
 * reference) — they are NOT duplicated here.
 * ------------------------------------------------------------------
 */
import {
  ClipboardList, ClipboardCheck,
  Building2, FileText, BarChart3,
  FileCheck2, FileSearch,
  Truck, PackageCheck, Ship, ShieldCheck, Package,
  Receipt, FileCheck, CreditCard, Wallet, FileOutput, FilePen,
  BarChart3 as BarChart3Icon, TrendingUp, Users, LineChart,
  Settings,
} from 'lucide-react';

/* ─────────────────────── Purchase Requisition ─────────────────────── */
const REQUISITION_TABS = [
  { key: 'pr-list', label: 'PR List', shortLabel: 'PR List', href: '/purchase/requisition', icon: ClipboardList },
  { key: 'pr-tech-spec', label: 'Technical Specification Review', shortLabel: 'Tech Spec Review', href: '/purchase/requisition/tech-spec', icon: ClipboardCheck },
];

/* ─────────────────────── Vendor Management ───────────────────────── */
const VENDOR_TABS = [
  { key: 'vendor-list', label: 'Vendor List', shortLabel: 'Vendors', href: '/purchase/vendors', icon: Building2 },
  { key: 'vendor-documents', label: 'Vendor Sourcing', shortLabel: 'Sourcing', href: '/purchase/vendors/documents', icon: FileText },
  { key: 'vendor-performance', label: 'Vendor Performance', shortLabel: 'Performance', href: '/purchase/vendors/performance', icon: BarChart3 },
  { key: 'vendor-reports', label: 'Vendor Reports', shortLabel: 'Reports', href: '/purchase/vendors/reports', icon: TrendingUp },
];

/* ─────────────────────── Purchase Orders ─────────────────────────── */
const ORDER_TABS = [
  { key: 'po-list', label: 'PO List', shortLabel: 'PO List', href: '/purchase/orders', icon: FileCheck2 },
  { key: 'po-approval', label: 'Approval', shortLabel: 'Approval', href: '/purchase/orders/approval', icon: ShieldCheck },
  { key: 'po-released-ack', label: 'Released Orders & Supplier Acknowledgement', shortLabel: 'Released Orders', href: '/purchase/orders/released', icon: FileSearch },
];

/* ─────────────────────── Logistics ───────────────────────────────── */
const LOGISTICS_TABS = [
  { key: 'logistics-manufacturing', label: 'Manufacturing / Packing', shortLabel: 'Manufacturing', href: '/purchase/logistics/manufacturing', icon: PackageCheck },
  { key: 'logistics-shipment', label: 'Shipment Tracking', shortLabel: 'Shipment', href: '/purchase/logistics/shipment', icon: Ship },
  { key: 'logistics-grn', label: 'Goods Receipt / GRN', shortLabel: 'GRN', href: '/purchase/logistics/grn', icon: Package },
  { key: 'logistics-quality', label: 'Quality Inspection', shortLabel: 'Quality', href: '/purchase/logistics/quality', icon: ShieldCheck },
  { key: 'logistics-inventory', label: 'Inventory Update', shortLabel: 'Inventory', href: '/purchase/logistics/inventory', icon: Truck },
];

/* ─────────────────────── Purchase Invoice ────────────────────────── */
const INVOICE_TABS = [
  { key: 'invoice-list', label: 'Invoice List', shortLabel: 'Invoices', href: '/purchase/invoices', icon: Receipt },
  { key: 'invoice-three-way', label: '3-Way Matching', shortLabel: '3-Way Match', href: '/purchase/invoices/three-way-matching', icon: FileCheck },
  { key: 'invoice-payment-approval', label: 'Payment Approval', shortLabel: 'Pay Approval', href: '/purchase/invoices/payment-approval', icon: CreditCard },
  { key: 'invoice-vendor-payment', label: 'Vendor Payment', shortLabel: 'Vendor Pay', href: '/purchase/invoices/vendor-payment', icon: Wallet },
  { key: 'invoice-payment-advice', label: 'Payment Advice', shortLabel: 'Pay Advice', href: '/purchase/invoices/payment-advice', icon: FileOutput },
  { key: 'invoice-notes', label: 'Credit / Debit Notes', shortLabel: 'Notes', href: '/purchase/invoices/notes', icon: FilePen },
];

/* ─────────────────────── Reports ─────────────────────────────────── */
const REPORTS_TABS = [
  { key: 'reports-dashboard', label: 'Reports Dashboard', shortLabel: 'Dashboard', href: '/purchase/reports/dashboard', icon: BarChart3Icon },
  { key: 'reports-insights', label: 'Advanced Reports', shortLabel: 'Advanced', href: '/purchase/reports/insights', icon: LineChart },
  { key: 'reports-spend', label: 'Spend Analysis', shortLabel: 'Spend', href: '/purchase/reports/spend-analysis', icon: TrendingUp },
  { key: 'reports-vendor', label: 'Vendor Analysis', shortLabel: 'Vendor Analysis', href: '/purchase/reports/vendor-analysis', icon: Users },
  { key: 'reports-procurement', label: 'Procurement Analytics', shortLabel: 'Analytics', href: '/purchase/reports/procurement', icon: LineChart },
];

/* ─────────────────────── Settings ────────────────────────────────── */
const SETTINGS_TABS = [
  { key: 'settings-main', label: 'Purchase Settings', shortLabel: 'Settings', href: '/purchase/settings', icon: Settings },
];

/**
 * All module tab configurations, keyed by the module identifier
 * used by <ModuleTabNav module="..." />.
 */
export const MODULE_TABS = {
  requisition: REQUISITION_TABS,
  vendors: VENDOR_TABS,
  orders: ORDER_TABS,
  logistics: LOGISTICS_TABS,
  invoices: INVOICE_TABS,
  reports: REPORTS_TABS,
  settings: SETTINGS_TABS,
};

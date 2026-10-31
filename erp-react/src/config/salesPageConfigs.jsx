import {
  AlertCircle,
  Archive as ArchiveIcon,
  BadgeCheck,
  Ban,
  Banknote,
  AlertTriangle,
  Zap,
  CheckCheck as CheckCheckIcon,
  CheckCircle2,
  ClipboardList as ClipboardListIcon,
  Clock,
  Copy,
  Eye as EyeIcon,
  FileDown,
  FileSpreadsheet,
  FileText,
  GitBranch as GitBranchIcon,
  Handshake,
  History as HistoryIcon,
  IndianRupee,
  Layers as LayersIcon,
  Link2 as Link2Icon,
  Mail,
  MessageCircle,
  PackageCheck,
  Paperclip as PaperclipIcon,
  Pencil,
  PenLine,
  Printer,
  RefreshCw,
  Repeat,
  RotateCcw,
  ScanSearch,
  Send,
  Tag,
  Trash2,
  Truck,
  Undo2,
  Wallet
} from 'lucide-react';
import useSalesModule from '../hooks/useSalesModule';
import DocRevisionCell from '../components/SalesTable/DocRevisionCell';
import SalesStatusBadge from '../components/SalesTable/SalesStatusBadge';
import { recalculateQuotationRates } from '../utils/quotationCurrency';
import quotationService from '../services/quotationService';
import salesContractService from '../services/salesContractService';
import salesOrderService from '../services/salesOrderService';
import deliveryChallanService from '../services/deliveryChallanService';
import proformaInvoiceService from '../services/proformaInvoiceService';
import invoiceService from '../services/invoiceService';
import paymentReceiptService from '../services/paymentReceiptService';
import creditNoteService from '../services/creditNoteService';
import {
  CREDIT_NOTE_STATUSES,
  DELIVERY_CHALLAN_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_RECEIPT_STATUSES,
  PROFORMA_INVOICE_STATUSES,
  QUOTATION_STATUSES,
  SALES_CONTRACT_STATUSES,
  SALES_EXECUTIVES,
  SALES_ORDER_STATUSES,
  SOURCE_LABELS
} from '../constants/salesConstants';
import {
  cpoNo,
  emailDocument,
  whatsappDocument,
  normalizeCreditNote,
  normalizeDeliveryChallan,
  normalizeInvoice,
  normalizePaymentReceipt,
  normalizeProformaInvoice,
  normalizeQuotation,
  normalizeSalesContract,
  normalizeSalesOrder
} from '../utils/salesHelpers';
import { buildExportInvoicePrintHtml, buildSalesPrintHtml, exportSalesDocumentPdf } from '../utils/salesPrintUtils';
import ProductionTimeline from '../components/ProductionTimeline/ProductionTimeline';
import { formatDate, formatINR } from '../utils/leadHelpers';
// Canonical "Back to List" targets — the hub deep links (see the doc block on
// SALES_EXEC_HUB_TABS): a module's list WITH the Sales Execution breadcrumb,
// page header and tab nav, never the bare standalone route.
import { SALES_EXEC_HUB_TABS } from '../utils/navigationHelpers';

const money = (value) => formatINR(value);

// ERP-exact stat-card grid (see .sales-kpi-grid in index.css): 5 equal
// columns on desktop, so the 8-box modules (Sales Orders, Delivery Challans,
// Proforma Invoices, Invoices, Credit Notes) lay out 5 × 2 and Payment
// Receipts (6 boxes) lays out 5 + 1. Modules without this flag keep the
// shared SalesKpiCards default grid, so Sales Contracts stays untouched.
const KPI_GRID_ERP = 'pr-kpi-grid';

// KPI card: statusValue is the backend status string used for both the card
// lookup (stats[statusValue]) and the status filter (statusMap key).
// The stats endpoint keys are space-stripped (e.g. 'pendingreview',
// 'inprogress', 'intransit', 'pendingapproval'), so the count lookup
// normalizes the key first; single-word statuses are unaffected.
function statusKpi(statusValue, label, icon, color) {
  const statsKey = statusValue.replace(/\s+/g, '');
  return {
    key: statusValue,
    label,
    valueOf: (s) => s?.[statsKey] ?? s?.[statusValue] ?? 0,
    icon,
    color
  };
}

// NOTE: the useHook options below (statusMap / searchKeys / extraParams) are
// defined as module-level constants so their identity never changes between
// renders. Passing inline literals would give buildParams a new identity on
// every render and re-fire the load effect endlessly (infinite loading loop).

// Display status label -> backend status value (used by the status filter).
const QTN_STATUS_VALUES = {
  'Draft': 'draft',
  'Submitted': 'submitted',
  'Sent': 'sent',
  'Accepted': 'accepted',
  'Rejected': 'rejected',
  'Negotiation': 'negotiation',
  'Expired': 'expired',
  'Cancelled': 'cancelled',
  'Converted': 'converted'
};
const SC_STATUS_VALUES = {
  'Draft': 'draft',
  'Submitted': 'submitted',
  'Under Review': 'under review',
  'Approved': 'approved',
  'Active': 'active',
  'Completed': 'completed',
  'Cancelled': 'cancelled'
};
const SO_STATUS_VALUES = {
  'Draft': 'draft',
  'Pending Review': 'pending review',
  'Approved': 'approved',
  'In Progress': 'in progress',
  'Completed': 'completed',
  'Cancelled': 'cancelled'
};
const DC_STATUS_VALUES = {
  'Draft': 'draft',
  'Packed': 'packed',
  'Dispatched': 'dispatched',
  'In Transit': 'in transit',
  'Delivered': 'delivered',
  'Accepted': 'accepted',
  'Cancelled': 'cancelled'
};
const PI_STATUS_VALUES = {
  'Draft': 'draft',
  'Sent': 'sent',
  'Paid': 'paid',
  'Overdue': 'overdue',
  'Accepted': 'accepted',
  'Expired': 'expired',
  'Converted': 'converted',
  'Cancelled': 'cancelled'
};
const INV_STATUS_VALUES = {
  'Draft': 'draft',
  'Issued': 'issued',
  'Sent': 'sent',
  'Partial': 'partial',
  'Paid': 'paid',
  'Overdue': 'overdue',
  'Cancelled': 'cancelled'
};
const PR_STATUS_VALUES = {
  'Draft': 'draft',
  'Received': 'received',
  'Partial': 'partial',
  'Completed': 'completed',
  'Cancelled': 'cancelled'
};
const CN_STATUS_VALUES = {
  'Draft': 'draft',
  'Pending Approval': 'pending approval',
  'Approved': 'approved',
  'Issued': 'issued',
  'Adjusted': 'adjusted',
  'Refunded': 'refunded',
  'Cancelled': 'cancelled'
};
// The ONLY Credit Note statuses the backend persists through
// POST /credit-notes/{id}/status — CreditNoteService.normalizeStatus maps
// every other value straight to 'draft'. The Kanban board must not offer a
// move to Refunded / Adjusted / Cancelled / Rejected, because that would
// silently write 'draft' instead of the status the user picked.
const CN_WRITABLE_STATUSES = ['draft', 'pending approval', 'approved', 'issued'];
// Kanban move targets, taken from the module's own status list so the labels
// can never drift from the Status filter values.
const CN_KANBAN_MOVE_TARGETS = CREDIT_NOTE_STATUSES.filter((opt) =>
  CN_WRITABLE_STATUSES.includes(opt.toLowerCase())
);

// ===== Module hook option constants (stable identities) =====
const QTN_STATUS_MAP = {
  all: '',
  draft: 'draft',
  submitted: 'submitted',
  sent: 'sent',
  accepted: 'accepted',
  negotiation: 'negotiation',
  rejected: 'rejected',
  expired: 'expired',
  converted: 'converted',
  cancelled: 'cancelled'
};
const QTN_SEARCH_KEYS = ['no', 'client', 'lead'];
const QTN_EXTRA_PARAMS = {
  client: 'client',
  salesPerson: 'salesPerson',
  validTill: 'validTill',
  // Follow-up / PO summary filters — resolved server-side (see QuotationService
  // buildSpecification) from the real followups / sales_orders records.
  followUpStatus: 'followUpStatus',
  poStatus: 'poStatus'
};

// Real follow-up statuses (the fu_status master list) + "No Follow-up" which
// maps to the backend's `none` filter. Labels are what the user picks, values
// are what the backend understands.
const QTN_FOLLOWUP_STATUSES = [
  { value: 'none', label: 'No Follow-up' },
  { value: 'Open', label: 'Open' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Rescheduled', label: 'Rescheduled' },
  { value: 'Missed', label: 'Missed' },
  { value: 'Cancelled', label: 'Cancelled' }
];

// PO Status values map straight onto the linked Customer Purchase Order's own
// status (sales_orders.status); `released`/`none` are the quotation-level
// existence states shown in the list and on the Overview page.
const QTN_PO_STATUSES = [
  { value: 'none', label: 'Not Released' },
  { value: 'released', label: 'Released' },
  { value: 'draft', label: 'PO Draft' },
  { value: 'pending review', label: 'PO Pending Review' },
  { value: 'approved', label: 'PO Approved' },
  { value: 'in progress', label: 'PO In Progress' },
  { value: 'cancelled', label: 'Cancelled' }
];

const SC_STATUS_MAP = {
  all: '',
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
  active: 'active'
};
const SC_SEARCH_KEYS = ['no', 'client'];
const SC_EXTRA_PARAMS = { client: 'client' };

const SO_STATUS_MAP = {
  all: '',
  draft: 'draft',
  'pending review': 'pending review',
  approved: 'approved',
  'in progress': 'in progress',
  completed: 'completed',
  cancelled: 'cancelled'
};
const SO_SEARCH_KEYS = ['no', 'client', 'lead'];
const SO_EXTRA_PARAMS = { client: 'client' };

const DC_STATUS_MAP = {
  all: '',
  draft: 'draft',
  packed: 'packed',
  dispatched: 'dispatched',
  'in transit': 'in transit',
  delivered: 'delivered',
  accepted: 'accepted',
  cancelled: 'cancelled'
};
const DC_SEARCH_KEYS = ['no', 'client'];
const DC_EXTRA_PARAMS = { client: 'client' };

const PI_STATUS_MAP = {
  all: '',
  draft: 'draft',
  sent: 'sent',
  paid: 'paid',
  overdue: 'overdue',
  converted: 'converted',
  cancelled: 'cancelled'
};
const PI_SEARCH_KEYS = ['no', 'client'];
const PI_EXTRA_PARAMS = { client: 'client' };

const INV_STATUS_MAP = {
  all: '',
  draft: 'draft',
  issued: 'issued',
  sent: 'sent',
  partial: 'partial',
  paid: 'paid',
  overdue: 'overdue',
  cancelled: 'cancelled'
};
const INV_SEARCH_KEYS = ['no', 'client'];
const INV_EXTRA_PARAMS = { client: 'client' };

const PR_STATUS_MAP = {
  all: '',
  draft: 'draft',
  received: 'received',
  partial: 'partial',
  completed: 'completed',
  cancelled: 'cancelled'
};
const PR_SEARCH_KEYS = ['no', 'client'];
const PR_EXTRA_PARAMS = { client: 'client' };

const CN_STATUS_MAP = {
  all: '',
  draft: 'draft',
  'pending approval': 'pending approval',
  approved: 'approved',
  issued: 'issued',
  adjusted: 'adjusted',
  refunded: 'refunded',
  cancelled: 'cancelled'
};
const CN_SEARCH_KEYS = ['no', 'client'];
const CN_EXTRA_PARAMS = { client: 'client' };

// ===== Quotations =====
/**
 * The Quotations list's Reference PR No. column.
 *
 * Exported because the page's one-time stored-configuration upgrade (a
 * configuration saved while the column was hidden by default) has to recognise
 * the OLD label and write the CURRENT one — one source of truth for both.
 */
export const REFERENCE_PR_NO_COLUMN = 'referencePrNo';
/** Current header label. */
export const REFERENCE_PR_NO_LABEL = 'Reference PR No.';
/** The label this column shipped with before it was shown by default. */
export const REFERENCE_PR_NO_LEGACY_LABEL = 'Reference PR No';

export const quotationListConfig = {
  service: quotationService,
  moduleKey: 'quotation',
  title: 'Quotation',
  titlePlural: 'Quotations',
  icon: FileText,
  newLabel: 'New Quotation',
  listRoute: '/quotations',
  newRoute: '/quotations/new',
  viewRoute: (row) => `/quotations/${row.id}/view`,
  editRoute: (row) => `/quotations/${row.id}/edit`,
  searchPlaceholder: 'Search Quotation No, Client, Sales Person...',
  tableMinWidth: 1000,
  useHook: () =>
    useSalesModule({
      service: quotationService,
      moduleKey: 'quotation',
      statusMap: QTN_STATUS_MAP,
      statusValueMap: QTN_STATUS_VALUES,
      searchKeys: QTN_SEARCH_KEYS,
      extraParams: QTN_EXTRA_PARAMS
    }),
  // Default table layout: Checkbox · Quotation No · Quotation Date · Client ·
  // Reference PR No · Sales Person · Items · Amount · Valid Until · Status ·
  // Follow-up Status · PO Status · Created · Actions. There is deliberately NO
  // serial-number column. Created By remains available through the existing
  // Manage Columns panel (hidden by default) so its data stays reachable.
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    {
      key: 'quotationNo',
      label: 'Quotation No',
      width: 160,
      sortable: true,
      mandatory: true,
      // Revisions are surfaced inside the Quotation No cell itself: the number
      // expands into the full revision chain (original + every historical
      // revision) fetched lazily on click. Selecting a revision opens its exact
      // historical data. Rows without revisions render as plain text.
      render: (row, navigate) => (
        <DocRevisionCell
          row={row}
          navigate={navigate}
          getDoc={(id) => quotationService.get(id)}
          viewRoute={(rev) => `/quotations/${rev.id}/view`}
          numberField="quotationNo"
        />
      )
    },
    { key: 'quotationDate', label: 'Quotation Date', width: 110, sortable: true },
    { key: 'clientName', label: 'Client', width: 200, sortable: true },
    {
      // The quotation's real source PR reference (Quotation.referencePrNo — the
      // CPR's own Reference PR No. when it was raised from a CPR, or the number
      // registered by "+ Add New Reference PR No." otherwise). It is shown by
      // default: the badge keeps the two origins readable in the list, and rows
      // without a reference render '—'. Still fully configurable through Manage
      // Columns (rename / reorder / hide / resize).
      key: REFERENCE_PR_NO_COLUMN,
      label: REFERENCE_PR_NO_LABEL,
      width: 150,
      sortable: true,
      render: (row) => {
        const ref = row.referencePrNo || row.reference;
        if (!ref) return '\u2014';
        const fromCpr = row.referencePrSource === 'CPR' || !!row.cprId;
        const source = row.referencePrSource
          ? (fromCpr ? 'CPR' : 'Direct')
          : (fromCpr ? 'CPR' : null);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{ref}</span>
            {source && (
              <span
                style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                  background: fromCpr ? '#E7F4EF' : '#FFF4E5',
                  color: fromCpr ? '#0B4A3D' : '#B45309',
                  border: `1px solid ${fromCpr ? '#BBDCCE' : '#F3D9AE'}`
                }}
              >
                {source}
              </span>
            )}
          </span>
        );
      }
    },
    { key: 'salesPerson', label: 'Sales Person', width: 140 },
    { key: 'items', label: 'Items', width: 70, align: 'center', render: (row) => (Array.isArray(row.items) ? row.items.length : row.itemsCount ?? '—') },
    { key: 'grandTotal', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'validUntil', label: 'Valid Until', width: 110 },
    { key: 'status', label: 'Status', width: 150, mandatory: true },
    {
      // Real quotation follow-up status (followups.quotationId → latest active
      // follow-up). The cell links into the existing quotation Follow-ups tab.
      key: 'followUpStatus',
      label: 'Follow-up Status',
      width: 150
    },
    {
      // Real Customer Purchase Order state — 'released' once a CPO exists for
      // the quotation (same rule the Overview uses), 'cancelled' when that CPO
      // is cancelled, otherwise 'Not Released'.
      key: 'poStatus',
      label: 'PO Status',
      width: 160
    },
    { key: 'createdAt', label: 'Created', width: 110, render: (row) => <span className="text-slate-500">{formatDate(row.createdAt)}</span> },
    {
      // Real author of the quotation's earliest audit entry (sales_history).
      // Kept configurable (hidden by default) — the required default layout
      // lists Created, not Created By.
      key: 'createdBy',
      label: 'Created By',
      width: 170,
      hidden: true
    },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'Total Quotations', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: FileText, color: '#2563EB' },
    statusKpi('draft', 'Draft', PenLine, '#f59e0b'),
    statusKpi('submitted', 'Submitted', Send, '#0B4A3D'),
    statusKpi('sent', 'Sent', Send, '#2563EB'),
    statusKpi('accepted', 'Accepted', CheckCircle2, '#10b981'),
    statusKpi('negotiation', 'Negotiation', Handshake, '#d97706'),
    statusKpi('rejected', 'Rejected', Ban, '#dc2626'),
    statusKpi('expired', 'Expired', Clock, '#ef4444'),
    statusKpi('converted', 'Converted', Repeat, '#8b5cf6'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af'),
    { key: 'totalvalue', label: 'Total Value', valueOf: (s) => money(s?.totalAmt ?? 0), icon: IndianRupee, color: '#059669' }
  ],
  filters: [
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'salesPerson', label: 'Sales Person', type: 'select', options: SALES_EXECUTIVES, masterKey: 'sales_executives' },
    { key: 'status', label: 'Status', type: 'select', options: QUOTATION_STATUSES },
    { key: 'followUpStatus', label: 'Follow-up Status', type: 'select', options: QTN_FOLLOWUP_STATUSES },
    { key: 'poStatus', label: 'PO Status', type: 'select', options: QTN_PO_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' },
    { key: 'validTill', label: 'Valid Till', type: 'date' },
    { key: 'minAmount', label: 'Min Amount', type: 'number' },
    { key: 'maxAmount', label: 'Max Amount', type: 'number' }
  ],
  // ERP quotations.js _actionMenu: headed sections QUOTATION / DOCUMENTS /
  // CONVERSION / STATUS. Conversion eligibility is driven by ACTUAL CONVERSION
  // HISTORY, never by the generic quotation status: every non-archived /
  // non-deleted quotation keeps the CONVERSION section as long as at least one
  // target document has NOT been created yet. Each downstream target is gated
  // independently by its own convertedToX flag — an already-used target is
  // never offered twice while the remaining targets stay available (a
  // "converted" quotation can still convert to targets it has not been
  // converted to). The rule is a pure function of the record's own state, so
  // every quotation in the same eligibility state gets exactly the same
  // conversion options.
  rowMenu: (row) => {
    const status = String(row.status || '').toLowerCase();
    // Historical revisions are read-only: only View/Preview/Print/PDF remain.
    const isHistorical = row.latestRevision === false;
    if (status === 'archived') {
      const archivedItems = [
        { heading: true, label: 'QUOTATION' },
        { key: 'view', label: 'View', icon: EyeIcon },
        { key: 'preview', label: 'Preview', icon: ScanSearch }
      ];
      if (!isHistorical) {
        archivedItems.push({ key: 'edit', label: 'Edit', icon: PenLine });
        archivedItems.push(
          { divider: true },
          { heading: true, label: 'STATUS' },
          { key: 'restore', label: 'Restore to Active', icon: RotateCcw },
          { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
        );
      }
      return archivedItems;
    }
    const terminal = status === 'converted' || status === 'cancelled' || status === 'deleted';
    const conversion = [];
    // Explicit guard (mirrors headerActions): archived returns early above, but
    // keep the condition explicit so the two menus can never drift apart.
    if (!isHistorical && status !== 'archived' && status !== 'deleted') {
      if (!row.convertedToSo) conversion.push({ key: 'convert', label: 'Convert to Customer Purchase Order', icon: PackageCheck });
      if (!row.convertedToPi) conversion.push({ key: 'convertPi', label: 'Convert to Proforma Invoice', icon: FileText });
      if (!row.convertedToDc) conversion.push({ key: 'convertDc', label: 'Convert to Delivery Challan', icon: Truck });
      if (!row.convertedToInvoice) conversion.push({ key: 'convertInv', label: 'Convert to Invoice', icon: Wallet });
      if (!row.convertedToCn) conversion.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText });
      if (!row.convertedToPr) conversion.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote });
    }
    const items = [
      { heading: true, label: 'QUOTATION' },
      { key: 'view', label: 'View', icon: EyeIcon },
      { key: 'preview', label: 'Preview', icon: ScanSearch },
      ...(!isHistorical ? [{ key: 'edit', label: 'Edit', icon: PenLine }] : []),
      ...(!isHistorical && !terminal ? [{ key: 'duplicate', label: 'Duplicate', icon: Copy }] : []),
      { divider: true },
      { heading: true, label: 'DOCUMENTS' },
      { key: 'pdf', label: 'Download PDF', icon: FileDown },
      { key: 'email', label: 'Email', icon: Mail }
    ];
    if (conversion.length) {
      items.push({ divider: true }, { heading: true, label: 'CONVERSION' }, ...conversion);
    }
    if (!isHistorical) {
      items.push(
        { divider: true },
        { heading: true, label: 'STATUS' },
        ...(terminal ? [] : [{ key: 'changeStatus', label: 'Change Status', icon: Tag }]),
        { key: 'archive', label: 'Archive', icon: ArchiveIcon },
        { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
      );
    }
    return items;
  },
  // Fallback used only when rowMenu is absent; QuotationListPage prefers
  // rowMenu above (all 7 gated targets). This mirrors the ERP quotations list
  // menu's single "Convert to Sales Order" option with the same eligibility.
  rowActions: (row) => {
    const items = [];
    const status = String(row.status || '').toLowerCase();
    // Same eligibility as the headed rowMenu / view page: conversion history
    // (convertedToX flags) decides availability, never the generic status.
    if (status !== 'deleted' && !row.convertedToSo) {
      items.push({ key: 'convert', label: 'Convert to Customer Purchase Order', icon: PackageCheck });
    }
    items.push(
      { key: 'pdf', label: 'Download PDF', icon: FileDown },
      { key: 'email', label: 'Email', icon: Mail },
      { key: 'changeStatus', label: 'Change Status', icon: Tag }
    );
    return items;
  },
  onRowAction: (key, row, hook, navigate) => {
    if (key === 'convertSc') {
      // Conversion endpoint creates the Sales Contract from this quotation and
      // returns the target document; the list page navigates to it.
      return runAction(hook, row.id, 'convert-sales-contract', `${row.quotationNo} converted to sales contract`);
    }
    if (key === 'convert') {
      // OPEN the Customer Purchase Order create form with this quotation's
      // data pre-filled (the same flow the Quotation Overview header uses).
      // Nothing is persisted here: the CPO only exists once the user saves the
      // form, so merely opening (or refreshing) the page never creates one.
      navigate?.(`/sales-orders/new?fromQuotation=${row.id}`);
      return undefined;
    }
    if (key === 'convertPi') return runAction(hook, row.id, 'convert-proforma', `${row.quotationNo} converted to proforma invoice`);
    if (key === 'convertDc') return runAction(hook, row.id, 'convert-delivery-challan', `${row.quotationNo} converted to delivery challan`);
    if (key === 'convertInv') return runAction(hook, row.id, 'convert-invoice', `${row.quotationNo} converted to invoice`);
    if (key === 'convertCn') return runAction(hook, row.id, 'convert-credit-note', `${row.quotationNo} converted to credit note`);
    if (key === 'convertPr') return runAction(hook, row.id, 'convert-payment-receipt', `${row.quotationNo} converted to payment receipt`);
    if (key === 'email') return emailDocument(row, 'quotation', 'Quotation');
    if (key === 'pdf') return exportSalesDocumentPdf(row, 'Quotation', 'quotation', `${row.quotationNo || 'quotation'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

export const quotationViewConfig = {
  service: quotationService,
  moduleKey: 'quotation',
  title: 'Quotation',
  label: 'quotation',
  // "Back to List" (and the not-found / post-archive return) opens the
  // Quotations list INSIDE the Sales Execution hub — /sales with the
  // Quotations tab selected — i.e. the canonical list with the hub
  // breadcrumb, page header and module tab nav. Not /quotations, which
  // renders the same table without any of that chrome.
  listRoute: SALES_EXEC_HUB_TABS.quotations,
  // Opens a SPECIFIC version (the record's own id), which is what the revision
  // chain and the version comparison navigate with.
  viewRoute: (record) => `/quotations/${record.id}/view`,
  editRoute: (doc) => `/quotations/${doc.id}/edit`,
  dateKey: 'quotationDate',
  normalize: normalizeQuotation,
  // ERP quotation-view: Back, Edit, Print, Email, Archive (no duplicate/share/pdf/delete in header)
  viewHeaderActions: ['edit', 'print', 'email', 'archive'],
  // ERP quotation-view tabs: Overview, Timeline, Activity Log, Attachments, Linked Documents, Version History, Approval History
  viewTabs: [
    { key: 'overview', label: 'Overview', icon: LayersIcon, count: null },
    { key: 'timeline', label: 'Timeline', icon: HistoryIcon, count: null },
    { key: 'activities', label: 'Activity Log', icon: ClipboardListIcon, count: null },
    { key: 'attachments', label: 'Attachments', icon: PaperclipIcon, count: null },
    { key: 'linked-documents', label: 'Linked Documents', icon: Link2Icon, count: null },
    { key: 'version-history', label: 'Version History', icon: GitBranchIcon, count: null },
    { key: 'approval-history', label: 'Approval History', icon: CheckCheckIcon, count: null }
  ],
  addressCards: true,
  showItemsInOverview: true,
  generalRows: (doc) => [
    ['Quotation No', <strong key="n">{doc.quotationNo}</strong>],
    ['Date', formatDate(doc.quotationDate)],
    ['Valid Till', formatDate(doc.validUntil)],
    ['Reference PR No', (() => {
      // The PR reference may be CPR-backed or created directly on the quotation.
      const ref = doc.referencePrNo || doc.reference;
      if (!ref) return '—';
      if (doc.referencePrSource === 'CPR' || doc.cprId) return `${ref} (CPR Reference)`;
      if (doc.referencePrSource === 'DIRECT') return `${ref} (Direct PR Reference)`;
      return ref;
    })()],
    ['Sales Person', doc.salesPerson || '—'],
    ['Currency', doc.currency || '—']
  ],
  linkedDocs: (doc) => {
    const links = [];
    if (doc.leadNo) links.push({ label: 'Lead', value: doc.leadNo });
    if (doc.sourceCw) links.push({ label: 'Cost Workout', value: doc.sourceCw });
    if (doc.sourceCpr) links.push({ label: 'CPR', value: doc.sourceCpr });
    if (doc.convertedToSc) links.push({ label: 'Sales Contract', value: doc.convertedToSc });
    if (doc.convertedToSo) links.push({ label: 'Customer Purchase Order', value: cpoNo(doc.convertedToSo) });
    if (doc.convertedToPi) links.push({ label: 'Proforma Invoice', value: doc.convertedToPi });
    if (doc.convertedToDc) links.push({ label: 'Delivery Challan', value: doc.convertedToDc });
    if (doc.convertedToInvoice) links.push({ label: 'Invoice', value: doc.convertedToInvoice });
    if (doc.convertedToCn) links.push({ label: 'Credit Note', value: doc.convertedToCn });
    if (doc.convertedToPr) links.push({ label: 'Payment Receipt', value: doc.convertedToPr });
    return links;
  },
  headerActions: (doc, { runAction, navigate, toast }) => {
    const actions = [];
    const status = String(doc.status || '').toLowerCase();
    if ((status === 'draft' || status === 'rejected') && !doc.convertedToSo) {
      actions.push({ key: 'send', label: 'Send', icon: Send, style: 'primary', action: () => runAction(() => quotationService.postAction(doc.id, 'send'), `${doc.quotationNo} sent to client`) });
    }
    // Conversion availability is driven by ACTUAL CONVERSION HISTORY (the
    // convertedToX refs), never by the generic status — a "converted"
    // quotation can still convert to targets it has not been converted to yet.
    const convertible = status !== 'archived' && status !== 'deleted';
    if (convertible) {
      if (!doc.convertedToSo) {
        // Opens the EXISTING Customer Purchase Order create form with this
        // quotation pre-filled (client, refs, items, rates, taxes, addresses,
        // terms). The CPO is persisted only when the user saves that form —
        // opening or refreshing it never creates a record.
        actions.push({ key: 'convert', label: 'Convert to Customer Purchase Order', icon: PackageCheck, style: 'green', action: () => navigate(`/sales-orders/new?fromQuotation=${doc.id}`) });
      }
      if (!doc.convertedToPi) {
        actions.push({ key: 'convertPi', label: 'Convert to Proforma Invoice', icon: FileText, style: 'secondary', action: () => runConvert(quotationService, doc.id, 'convert-proforma', `${doc.quotationNo} converted to proforma invoice`, navigate, toast) });
      }
      if (!doc.convertedToDc) {
        actions.push({ key: 'convertDc', label: 'Convert to Delivery Challan', icon: Truck, style: 'secondary', action: () => runConvert(quotationService, doc.id, 'convert-delivery-challan', `${doc.quotationNo} converted to delivery challan`, navigate, toast) });
      }
      if (!doc.convertedToInvoice) {
        actions.push({ key: 'convertInv', label: 'Convert to Invoice', icon: Wallet, style: 'secondary', action: () => runConvert(quotationService, doc.id, 'convert-invoice', `${doc.quotationNo} converted to invoice`, navigate, toast) });
      }
      if (!doc.convertedToCn) {
        actions.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText, style: 'secondary', action: () => runConvert(quotationService, doc.id, 'convert-credit-note', `${doc.quotationNo} converted to credit note`, navigate, toast) });
      }
      if (!doc.convertedToPr) {
        actions.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote, style: 'secondary', action: () => runConvert(quotationService, doc.id, 'convert-payment-receipt', `${doc.quotationNo} converted to payment receipt`, navigate, toast) });
      }
    }
    // Live exchange-rate support: saved quotations keep the rate used at
    // creation; the user can explicitly recalculate with the latest rates.
    const hasRates = doc.currency && Number(doc.exchangeRate) > 0;
    if (hasRates && status !== 'deleted' && status !== 'archived') {
      actions.push({
        key: 'recalc',
        label: 'Recalculate with Latest Rates',
        icon: RefreshCw,
        style: 'ghost',
        action: () =>
          runAction(
            () => recalculateQuotationRates(doc, quotationService),
            `${doc.quotationNo || 'Quotation'} recalculated with latest exchange rates`
          )
      });
    }
    return actions;
  },
  printHtml: (doc) => buildSalesPrintHtml(doc, 'Quotation', 'quotation'),
  exportPdf: (doc) => exportSalesDocumentPdf(doc, 'Quotation', 'quotation', `${doc.quotationNo || 'quotation'}-${new Date().toISOString().slice(0, 10)}`)
};

// ===== Sales Contracts =====
export const salesContractListConfig = {
  service: salesContractService,
  moduleKey: 'salesContract',
  title: 'Sales Contract',
  titlePlural: 'Sales Contracts',
  icon: FileSpreadsheet,
  newLabel: 'New Sales Contract',
  listRoute: '/sales-contracts',
  newRoute: '/sales-contracts/new',
  viewRoute: (row) => `/sales-contracts/${row.id}`,
  designRoute: (row) => `/sales-contracts/design?id=${row.id}`,
  editRoute: (row) => `/sales-contracts/${row.id}/edit`,
  searchPlaceholder: 'Search Contract No, Client, Amount, Status...',
  tableMinWidth: 1000,
  useHook: () =>
    useSalesModule({
      service: salesContractService,
      moduleKey: 'salesContract',
      statusMap: SC_STATUS_MAP,
      statusValueMap: SC_STATUS_VALUES,
      searchKeys: SC_SEARCH_KEYS,
      extraParams: SC_EXTRA_PARAMS
    }),
  // Simplified list: only Customer Name | Contract No | Date | Validity |
  // Current Status | Actions. Contact / PO Ref / Amount / Source SO exist in
  // the underlying data but are intentionally NOT rendered as columns here.
  columns: [
    { key: 'scNo', label: 'Contract No', width: 170, sortable: true, mandatory: true },
    { key: 'clientName', label: 'Customer Name', width: 220, sortable: true, mandatory: true },
    { key: 'contractDate', label: 'Date', width: 110, sortable: true },
    { key: 'validity', label: 'Validity', width: 140, sortable: true },
    { key: 'status', label: 'Current Status', width: 170, mandatory: true },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All Contracts', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: FileSpreadsheet, color: '#0B4A3D' },
    { key: 'totalvalue', label: 'Total Amount', valueOf: (s) => money(s?.totalAmt ?? 0), icon: IndianRupee, color: '#ec4899' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('submitted', 'Submitted', Clock, '#0B4A3D'),
    statusKpi('approved', 'Approved', CheckCircle2, '#16a34a'),
    statusKpi('active', 'Active', BadgeCheck, '#0B4A3D'),
    statusKpi('completed', 'Completed', CheckCircle2, '#059669'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af')
  ],
  filters: [
    { key: 'no', label: 'Contract No', type: 'text', placeholder: 'Search number...' },
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'status', label: 'Status', type: 'select', options: SALES_CONTRACT_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ],
  rowActions: (row) => {
    const items = [];
    const status = String(row.status || '').toLowerCase();
    if (status === 'draft') items.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
    // Sales Execution conversion chain — only valid downstream targets, gated
    // per target by its own convertedToX flag (never by the generic status).
    // ERP sales-contracts.js: only ACTIVE or APPROVED contracts can convert.
    const conversion = [];
    if ((status === 'approved' || status === 'active') && status !== 'archived' && status !== 'deleted') {
      if (!row.convertedToSo) conversion.push({ key: 'convert', label: 'Convert to Customer Purchase Order', icon: PackageCheck });
      if (!row.convertedToPi) conversion.push({ key: 'convertPi', label: 'Convert to Proforma Invoice', icon: FileText });
      if (!row.convertedToDc) conversion.push({ key: 'convertDc', label: 'Convert to Delivery Challan', icon: Truck });
      if (!row.convertedToInvoice) conversion.push({ key: 'convertInv', label: 'Convert to Invoice', icon: Wallet });
      if (!row.convertedToCn) conversion.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText });
      if (!row.convertedToPr) conversion.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote });
    }
    if (conversion.length) items.push({ heading: true, label: 'CONVERSION' }, ...conversion);
    items.push({ key: 'email', label: 'Email', icon: Mail }, { key: 'print', label: 'Print', icon: Printer }, { key: 'pdf', label: 'PDF', icon: FileDown });
    return items;
  },
  onRowAction: (key, row, hook) => {
    if (key === 'approve') return runAction(hook, row.id, 'approve', `${row.scNo} approved`);
    if (key === 'convert') return runAction(hook, row.id, 'convert-sales-order', `${row.scNo} converted to customer purchase order`);
    if (key === 'convertPi') return runAction(hook, row.id, 'convert-proforma', `${row.scNo} converted to proforma invoice`);
    if (key === 'convertDc') return runAction(hook, row.id, 'convert-delivery-challan', `${row.scNo} converted to delivery challan`);
    if (key === 'convertInv') return runAction(hook, row.id, 'convert-invoice', `${row.scNo} converted to invoice`);
    if (key === 'convertCn') return runAction(hook, row.id, 'convert-credit-note', `${row.scNo} converted to credit note`);
    if (key === 'convertPr') return runAction(hook, row.id, 'convert-payment-receipt', `${row.scNo} converted to payment receipt`);
    if (key === 'email') return emailDocument(row, 'salesContract', 'Sales Contract');
    if (key === 'print') return openPrint(buildSalesPrintHtml(row, 'Sales Contract', 'salesContract'));
    if (key === 'pdf') return exportSalesDocumentPdf(row, 'Sales Contract', 'salesContract', `${row.scNo || 'contract'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

export const salesContractViewConfig = {
  service: salesContractService,
  moduleKey: 'salesContract',
  title: 'Sales Contract',
  label: 'sales contract',
  listRoute: '/sales-contracts',
  // Opens a SPECIFIC version (the record's own id) — the route the revision
  // chain and the version comparison navigate with.
  viewRoute: (record) => `/sales-contracts/${record.id}`,
  designRoute: (doc) => `/sales-contracts/design?id=${doc.id}`,
  editRoute: (doc) => `/sales-contracts/${doc.id}/edit`,
  dateKey: 'contractDate',
  normalize: normalizeSalesContract,
  // ERP sales-contract-view header actions: Edit, PDF, Print, Convert, Back
  viewHeaderActions: ['edit', 'print', 'pdf', 'email', 'share', 'whatsapp', 'archive', 'delete'],
  generalRows: (doc) => [
    ['SC No', <strong key="n">{doc.scNo}</strong>],
    ['Customer PO', doc.poRef || '—'],
    ['Date', formatDate(doc.contractDate)],
    ['Lead No', doc.leadNo || '—'],
    ['Quotation Ref', doc.qtnRef || '—'],
    ['Sales Executive', doc.salesExecutive || '—'],
    ['Payment Terms', doc.paymentTerms || '—'],
    ['Delivery Terms', doc.deliveryTerms || '—'],
    ['Contract Validity', formatDate(doc.validity)],
    ['Contract Duration', doc.duration || '—'],
    ['Warranty Terms', doc.warranty || '—']
  ],
  linkedDocs: (doc) => {
    const links = [];
    if (doc.qtnRef) links.push({ label: 'Quotation', value: doc.qtnRef });
    if (doc.leadNo) links.push({ label: 'Lead', value: doc.leadNo });
    if (doc.convertedToSo) links.push({ label: 'Customer Purchase Order', value: cpoNo(doc.convertedToSo) });
    if (doc.convertedToPi) links.push({ label: 'Proforma Invoice', value: doc.convertedToPi });
    if (doc.convertedToDc) links.push({ label: 'Delivery Challan', value: doc.convertedToDc });
    if (doc.convertedToInvoice) links.push({ label: 'Invoice', value: doc.convertedToInvoice });
    if (doc.convertedToCn) links.push({ label: 'Credit Note', value: doc.convertedToCn });
    if (doc.convertedToPr) links.push({ label: 'Payment Receipt', value: doc.convertedToPr });
    return links;
  },
  headerActions: (doc, { runAction, navigate, toast }) => {
    const actions = [];
    const status = String(doc.status || '').toLowerCase();
    if (status === 'draft') {
      // Submit for Approval: moves the contract into 'submitted' (a neutral
      // state — NOT Pending Approval; the SC pending-approval count uses the
      // literal 'under review' state). Only shown for the current revision
      // (SalesViewPage gates headerActions on !isHistorical). Calls the
      // existing changeStatus backend endpoint.
      actions.push({ key: 'submit', label: 'Submit for Approval', icon: Send, style: 'primary', action: () => runAction(() => salesContractService.changeStatus(doc.id, 'submitted'), `${doc.scNo} submitted for approval`) });
      actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2, style: 'approve', action: () => runAction(() => salesContractService.postAction(doc.id, 'approve'), `${doc.scNo} approved`) });
    }
    if ((status === 'approved' || status === 'active') && status !== 'archived' && status !== 'deleted') {
      if (!doc.convertedToSo) {
        actions.push({ key: 'convert', label: 'Convert to Customer Purchase Order', icon: PackageCheck, style: 'green', action: () => runConvert(salesContractService, doc.id, 'convert-sales-order', `${doc.scNo} converted to customer purchase order`, navigate, toast) });
      }
      if (!doc.convertedToPi) {
        actions.push({ key: 'convertPi', label: 'Convert to Proforma Invoice', icon: FileText, style: 'secondary', action: () => runConvert(salesContractService, doc.id, 'convert-proforma', `${doc.scNo} converted to proforma invoice`, navigate, toast) });
      }
      if (!doc.convertedToDc) {
        actions.push({ key: 'convertDc', label: 'Convert to Delivery Challan', icon: Truck, style: 'secondary', action: () => runConvert(salesContractService, doc.id, 'convert-delivery-challan', `${doc.scNo} converted to delivery challan`, navigate, toast) });
      }
      if (!doc.convertedToInvoice) {
        actions.push({ key: 'convertInv', label: 'Convert to Invoice', icon: Wallet, style: 'secondary', action: () => runConvert(salesContractService, doc.id, 'convert-invoice', `${doc.scNo} converted to invoice`, navigate, toast) });
      }
      if (!doc.convertedToCn) {
        actions.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText, style: 'secondary', action: () => runConvert(salesContractService, doc.id, 'convert-credit-note', `${doc.scNo} converted to credit note`, navigate, toast) });
      }
      if (!doc.convertedToPr) {
        actions.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote, style: 'secondary', action: () => runConvert(salesContractService, doc.id, 'convert-payment-receipt', `${doc.scNo} converted to payment receipt`, navigate, toast) });
      }
    }
    return actions;
  },
  printHtml: (doc) => buildSalesPrintHtml(doc, 'Sales Contract', 'salesContract'),
  exportPdf: (doc) => exportSalesDocumentPdf(doc, 'Sales Contract', 'salesContract', `${doc.scNo || 'contract'}-${new Date().toISOString().slice(0, 10)}`)
};

// ===== Sales Orders =====
export const salesOrderListConfig = {
  service: salesOrderService,
  moduleKey: 'salesOrder',
  title: 'Customer Purchase Order',
  titlePlural: 'Customer Purchase Orders',
  icon: PackageCheck,
  newLabel: 'New Customer Purchase Order',
  listRoute: '/sales-orders',
  newRoute: '/sales-orders/new',
  viewRoute: (row) => `/sales-orders/${row.id}`,
  designRoute: (row) => `/sales-orders/design?id=${row.id}`,
  editRoute: (row) => `/sales-orders/${row.id}/edit`,
  searchPlaceholder: 'Search Order No, Client, PO No...',
  tableMinWidth: 1000,
  // Sales Orders list supports a List/Kanban presentation toggle. Only this
  // module sets the flag; the shared SalesListPage renders the toggle + board
  // only when it is true.
  kanban: true,
  kpiGridClassName: KPI_GRID_ERP,
  useHook: () =>
    useSalesModule({
      service: salesOrderService,
      moduleKey: 'salesOrder',
      statusMap: SO_STATUS_MAP,
      statusValueMap: SO_STATUS_VALUES,
      searchKeys: SO_SEARCH_KEYS,
      extraParams: SO_EXTRA_PARAMS
    }),
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    { key: 'soNo', label: 'CPO No', width: 160, sortable: true, mandatory: true },
    { key: 'clientName', label: 'Client', width: 200, sortable: true },
    { key: 'contactPerson', label: 'Contact', width: 150 },
    { key: 'customerPo', label: 'PO Ref', width: 140 },
    { key: 'items', label: 'Items', width: 80, align: 'center', render: (row) => row.itemsCount ?? (Array.isArray(row.items) ? row.items.length : '—') },
    { key: 'orderDate', label: 'Date', width: 110, sortable: true },
    { key: 'deliveryDate', label: 'Due Date', width: 110, render: (row) => formatDate(row.deliveryDate) || '—' },
    { key: 'grandTotal', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'status', label: 'Status', width: 140, mandatory: true },
    { key: 'scRef', label: 'SC Ref', width: 130, render: (row) => row.scRef || '—' },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All Orders', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: PackageCheck, color: '#0B4A3D' },
    { key: 'totalvalue', label: 'Total Amount', valueOf: (s) => money(s?.totalAmt ?? 0), icon: IndianRupee, color: '#ec4899' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('pending review', 'Pending Review', Clock, '#d97706'),
    statusKpi('approved', 'Approved', CheckCircle2, '#16a34a'),
    statusKpi('in progress', 'In Progress', Clock, '#0B4A3D'),
    statusKpi('completed', 'Completed', CheckCheckIcon, '#059669'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af')
  ],
  filters: [
    { key: 'no', label: 'Order No', type: 'text', placeholder: 'Search number...' },
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'status', label: 'Status', type: 'select', options: SALES_ORDER_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ],
  rowActions: (row) => {
    const items = [];
    const status = String(row.status || '').toLowerCase();
    if (status === 'draft') {
      items.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
      items.push({ key: 'cancel', label: 'Cancel Order', icon: Ban });
    }
    // Sales Execution conversion chain — only valid downstream targets, gated
    // per target by its own convertedToX flag. ERP salesorders.js shows these
    // for every non-converted/non-cancelled order; a converted SO can still
    // convert to targets it has not been converted to yet, while cancelled
    // orders never convert (ERP gate).
    const conversion = [];
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      if (!row.convertedToProforma) {
        conversion.push({ key: 'proforma', label: 'Convert to Proforma Invoice', icon: FileText });
      }
      /* Packing is not a conversion of the CPO: it produces a separate
         document that neither consumes nor flags the CPO, so it is offered
         regardless of whether a Proforma Invoice exists already. */
      conversion.push({ key: 'packingList', label: 'Generate Packing List', icon: PackageCheck });
      if (!row.convertedToDc) conversion.push({ key: 'dc', label: 'Convert to Delivery Challan', icon: Truck });
      if (!row.convertedToInv) conversion.push({ key: 'invoice', label: 'Convert to Invoice', icon: Wallet });
      if (!row.convertedToCn) conversion.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText });
      if (!row.convertedToPr) conversion.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote });
    }
    if (conversion.length) items.push({ heading: true, label: 'CONVERSION' }, ...conversion);
    items.push({ key: 'email', label: 'Email', icon: Mail }, { key: 'print', label: 'Print', icon: Printer }, { key: 'pdf', label: 'PDF', icon: FileDown });
    return items;
  },
  onRowAction: (key, row, hook, navigate) => {
    // Convert to Proforma Invoice opens the Proforma Invoice CREATE form with
    // this CPO already selected (?so=<id> — the form's existing source-document
    // prefill: customer block, line items, source reference). It must NOT post
    // /convert-proforma: that endpoint persists a Proforma Invoice and marks the
    // CPO converted before the user has reviewed anything. Saving stays with
    // the user (Save Draft / Save & Submit on the form).
    if (key === 'proforma') {
      navigate(`/proforma-invoices/new?so=${row.id}`);
      return undefined;
    }
    /* Generate Packing List opens the EXISTING Production Packing List create
       form with this CPO as its source (?so=<id> — the form reads the CPO and
       prefills the fields it owns). It must NOT post a conversion: this action
       used to run /convert-proforma, which persisted a Proforma Invoice and
       flagged the CPO as converted before the user had reviewed anything.
       Nothing is written until the user clicks Save Packing List. */
    if (key === 'packingList') {
      navigate(`/production/packing/new?so=${row.id}`);
      return undefined;
    }
    const actions = {
      approve: ['approve', `${cpoNo(row.soNo)} approved`],
      cancel: ['cancel', `${cpoNo(row.soNo)} cancelled`],
      dc: ['generate-delivery-challan', `${cpoNo(row.soNo)} delivery challan generated`],
      invoice: ['convert-invoice', `${cpoNo(row.soNo)} converted to invoice`],
      convertCn: ['convert-credit-note', `${cpoNo(row.soNo)} converted to credit note`],
      convertPr: ['convert-payment-receipt', `${cpoNo(row.soNo)} converted to payment receipt`]
    };
    if (actions[key]) return runAction(hook, row.id, actions[key][0], actions[key][1]);
    if (key === 'email') return emailDocument(row, 'salesOrder', 'Customer Purchase Order');
    if (key === 'print') return openPrint(buildSalesPrintHtml(row, 'Customer Purchase Order', 'salesOrder'));
    if (key === 'pdf') return exportSalesDocumentPdf(row, 'Customer Purchase Order', 'salesOrder', `${cpoNo(row.soNo) || 'order'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

export const salesOrderViewConfig = {
  service: salesOrderService,
  moduleKey: 'salesOrder',
  title: 'Customer Purchase Order',
  label: 'customer purchase order',
  listRoute: '/sales-orders',
  viewRoute: (record) => `/sales-orders/${record.id}`,
  designRoute: (doc) => `/sales-orders/design?id=${doc.id}`,
  editRoute: (doc) => `/sales-orders/${doc.id}/edit`,
  dateKey: 'orderDate',
  normalize: normalizeSalesOrder,
  generalRows: (doc) => [
    ['CPO No', <strong key="n">{cpoNo(doc.soNo)}</strong>],
    ['Customer PO', doc.customerPo || '—'],
    ['Order Date', formatDate(doc.orderDate)],
    ['Lead No', doc.leadNo || '—'],
    ['Quotation Ref', doc.qtnRef || '—'],
    ['Contract Ref', doc.scRef || '—'],
    ['Sales Executive', doc.salesExecutive || '—'],
    ['Payment Terms', doc.paymentTerms || '—'],
    ['Delivery Terms', doc.deliveryTerms || '—'],
    ['Delivery Date', formatDate(doc.deliveryDate)],
    // Release & Procurement Method — real sales_orders columns, shown here
    // (as well as in their own card) so the General Information block stays
    // the single place every order-level value is visible.
    ['Release Method', doc.releaseMethod || '—'],
    ['Release Required', doc.releaseRequired || '—'],
    ['Action Type', doc.actionType || '—'],
    ['Participation Required', doc.participationRequired || '—']
  ],
  // E-Actions / Participation are NOT embedded in the CPO view — they live on
  // the dedicated E-Actions page under Customer Purchase Orders.
  // The Customer Purchase Order Overview is the complete CPO summary: summary
  // tiles, Items with their persisted Manage Columns, Release & Procurement,
  // instructions, terms, remarks and attachments.
  overviewComplete: true,
  /**
   * Extra Overview cards contributed by the module: the complete Release &
   * Procurement Method block and the Action / Release Instructions.
   *
   * Every value is a real sales_orders column read off the record itself.
   * E-Actions / Participation are NOT part of the CPO view any more — nothing
   * here is derived from E-Action rows.
   */
  overviewExtra: (doc, ctx = {}) => {
    const releaseRows = [
      ['Release Method', doc.releaseMethod],
      ['Release Required', doc.releaseRequired],
      ['Action Type', doc.actionType],
      ['Release Date', doc.releaseDate ? formatDate(doc.releaseDate) : ''],
      ['Release to Department', doc.releaseToDepartment],
      ['Participation Required', doc.participationRequired],
      ['Assigned To', doc.assignedTo],
      ['Department / Team', doc.departmentTeam],
      ['Action Deadline', doc.actionDeadline ? formatDate(doc.actionDeadline) : '']
    ].filter(([, value]) => value != null && String(value).trim() !== '' && value !== '—');

    const hasRelease = true;
    const hasInstructions = Boolean(doc.actionInstructions);
    const hasActionRemarks = Boolean(doc.actionRemarks);
    const canEdit = Boolean(ctx.editRoute) && ctx.isHistorical !== true;
    const openEdit = () => ctx.navigate && ctx.editRoute(doc);

    return (
      <>
        {(hasRelease || hasActionRemarks) && (
          <div className="prm-card prm-card-body">
            <div className="flex items-start justify-between gap-3">
              <h3 className="prm-card-title">
                <Zap className="w-4 h-4" />
                Release &amp; Procurement Method
              </h3>
              {canEdit && (
                <button
                  type="button"
                  onClick={openEdit}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-slate-200 bg-surface text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0B4A3D] transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
            {releaseRows.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">No release / procurement details recorded on this order.</p>
            ) : null}
            {releaseRows.map(([label, value]) => (
              <div key={label} className="flex py-1.5 text-[13px] border-b border-slate-100 last:border-b-0">
                <span className="w-[170px] shrink-0 text-slate-500 font-medium text-xs">{label}</span>
                <span className="text-slate-700 font-medium flex-1">{value}</span>
              </div>
            ))}
            {hasActionRemarks && (
              <div className="pt-2 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                <span className="block font-bold text-slate-700 mb-0.5">Action Remarks</span>
                {doc.actionRemarks}
              </div>
            )}
          </div>
        )}
        {hasInstructions && (
          <div className="prm-card prm-card-body">
            <div className="flex items-start justify-between gap-3">
              <h3 className="prm-card-title">
                <AlertTriangle className="w-4 h-4" />
                Action / Release Instructions
              </h3>
              {canEdit && (
                <button
                  type="button"
                  onClick={openEdit}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-slate-200 bg-surface text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0B4A3D] transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
            <div className="mt-1 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{doc.actionInstructions}</div>
          </div>
        )}
      </>
    );
  },
  linkedDocs: (doc) => {
    const links = [];
    if (doc.leadNo) links.push({ label: 'Lead', value: doc.leadNo });
    if (doc.qtnRef) links.push({ label: 'Quotation', value: doc.qtnRef });
    if (doc.scRef) links.push({ label: 'Sales Contract', value: doc.scRef });
    if (doc.convertedToDc) links.push({ label: 'Delivery Challan', value: doc.convertedToDc });
    if (doc.convertedToProforma) links.push({ label: 'Proforma Invoice', value: doc.convertedToProforma });
    if (doc.convertedToInv) links.push({ label: 'Invoice', value: doc.convertedToInv });
    if (doc.convertedToCn) links.push({ label: 'Credit Note', value: doc.convertedToCn });
    if (doc.convertedToPr) links.push({ label: 'Payment Receipt', value: doc.convertedToPr });
    return links;
  },
  headerActions: (doc, { runAction, navigate, toast }) => {
    const actions = [];
    const status = String(doc.status || '').toLowerCase();
    if (status === 'draft') {
      // Submit for Approval: moves the order into the existing pending-review
      // state (the SO pending-approval count uses 'pending review'). Only shown
      // for the current revision; calls the existing changeStatus endpoint.
      actions.push({ key: 'submit', label: 'Submit for Approval', icon: Send, style: 'primary', action: () => runAction(() => salesOrderService.changeStatus(doc.id, 'pending review'), `${cpoNo(doc.soNo)} submitted for approval`) });
      actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2, style: 'approve', action: () => runAction(() => salesOrderService.postAction(doc.id, 'approve'), `${cpoNo(doc.soNo)} approved`) });
      actions.push({ key: 'cancel', label: 'Cancel Order', icon: Ban, style: 'danger', action: () => runAction(() => salesOrderService.postAction(doc.id, 'cancel'), `${cpoNo(doc.soNo)} cancelled`) });
    }
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      // EVERY conversion on the CPO view follows the same established pattern
      // as CPO → Proforma: open the destination's CREATE form with the CPO
      // prefilled (?so=<id> — the shared SalesFormPage source prefill) and let
      // the user review/edit and save. Nothing is created, numbered or linked
      // by the click itself: the old one-click conversions persisted a draft
      // destination document (and marked the CPO converted) before the user had
      // seen it, which is exactly what the Proforma flow was changed to avoid.
      if (!doc.convertedToDc) {
        actions.push({ key: 'dc', label: 'Generate Delivery Challan', icon: Truck, style: 'secondary', action: () => navigate(`/delivery-challans/new?so=${doc.id}`) });
      }
      if (!doc.convertedToProforma) {
        // Opens the pre-filled Proforma Invoice create form (?so=<id>) — the
        // conversion is never persisted until the user saves the form (same
        // behaviour as the CPO list's Convert to Proforma Invoice action).
        actions.push({ key: 'proforma', label: 'Convert to Proforma', icon: FileText, style: 'secondary', action: () => navigate(`/proforma-invoices/new?so=${doc.id}`) });
        // Packing List documents are Proforma Invoice records in this ERP, with
        // their own document identity selected by ?docType=packing-list (the
        // Packing List module's own New route). Same prefill, no write. The
        // ?so param must come before ?docType for the form to read both.
        actions.push({ key: 'packingList', label: 'Generate Packing List', icon: PackageCheck, style: 'secondary', action: () => navigate(`/proforma-invoices/new?docType=packing-list&so=${doc.id}`) });
      }
      if (!doc.convertedToInv) {
        actions.push({ key: 'invoice', label: 'Convert to Invoice', icon: Wallet, style: 'green', action: () => navigate(`/invoices/new?so=${doc.id}`) });
      }
      if (!doc.convertedToCn) {
        actions.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText, style: 'secondary', action: () => navigate(`/credit-notes/new?so=${doc.id}`) });
      }
      if (!doc.convertedToPr) {
        actions.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote, style: 'secondary', action: () => navigate(`/payment-receipts/new?so=${doc.id}`) });
      }
    }
    return actions;
  },
  // Document Workflow: renders the Draft → Corrected → Signed → Submitted
  // document lifecycle inside the Linked Documents section. Only Sales Orders
  // sets this flag (Sales Contracts renders the component directly).
  documentWorkflow: true,
  // Production Timeline tab: tracks Purchase Orders (internal/external) against
  // the order's production lifecycle. Frontend-only demo data — no backend.
  // SO No is the document identifier (PO No is intentionally not shown).
  extraTabs: [{ key: 'production-timeline', label: 'Production Timeline', icon: Truck, count: null }],
  renderTab: (tab) =>
    tab === 'production-timeline' ? <ProductionTimeline docNoKey="soNo" docNoLabel="CPO No" /> : null,
  printHtml: (doc) => buildSalesPrintHtml(doc, 'Customer Purchase Order', 'salesOrder'),
  exportPdf: (doc) => exportSalesDocumentPdf(doc, 'Customer Purchase Order', 'salesOrder', `${cpoNo(doc.soNo) || 'order'}-${new Date().toISOString().slice(0, 10)}`)
};

// ===== Delivery Challans =====
export const deliveryChallanListConfig = {
  service: deliveryChallanService,
  moduleKey: 'deliveryChallan',
  title: 'Delivery Challan',
  titlePlural: 'Delivery Challans',
  icon: Truck,
  newLabel: 'New Delivery Challan',
  listRoute: '/delivery-challans',
  newRoute: '/delivery-challans/new',
  viewRoute: (row) => `/delivery-challans/${row.id}`,
  designRoute: (row) => `/delivery-challans/design?id=${row.id}`,
  editRoute: (row) => `/delivery-challans/${row.id}/edit`,
  searchPlaceholder: 'Search Challan No, Client, CPO Ref...',
  tableMinWidth: 1000,
  kpiGridClassName: KPI_GRID_ERP,
  useHook: () =>
    useSalesModule({
      service: deliveryChallanService,
      moduleKey: 'deliveryChallan',
      statusMap: DC_STATUS_MAP,
      statusValueMap: DC_STATUS_VALUES,
      searchKeys: DC_SEARCH_KEYS,
      extraParams: DC_EXTRA_PARAMS
    }),
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    { key: 'dcNo', label: 'DC No', width: 160, sortable: true, mandatory: true },
    { key: 'clientName', label: 'Client', width: 200, sortable: true },
    { key: 'transportCompany', label: 'Transport', width: 160 },
    { key: 'vehicleNumber', label: 'Vehicle', width: 120 },
    { key: 'dcDate', label: 'Date', width: 110, sortable: true },
    { key: 'grandTotal', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'status', label: 'Status', width: 140, mandatory: true },
    { key: 'soRef', label: 'CPO Ref', width: 130, render: (row) => cpoNo(row.soRef) || '—' },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All DCs', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: Truck, color: '#0B4A3D' },
    { key: 'totalvalue', label: 'Total Amount', valueOf: (s) => money(s?.totalAmt ?? 0), icon: IndianRupee, color: '#ec4899' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('packed', 'Packed', PackageCheck, '#15803d'),
    statusKpi('dispatched', 'Dispatched', Truck, '#0B4A3D'),
    statusKpi('in transit', 'In Transit', Truck, '#0B4A3D'),
    statusKpi('delivered', 'Delivered', CheckCircle2, '#16a34a'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af')
  ],
  filters: [
    { key: 'no', label: 'Challan No', type: 'text', placeholder: 'Search number...' },
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'status', label: 'Status', type: 'select', options: DELIVERY_CHALLAN_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ],
  rowActions: (row) => {
    const items = [];
    const status = String(row.status || '').toLowerCase();
    if (!['converted', 'cancelled', 'deleted', 'archived'].includes(status)) {
      items.push({ key: 'accept', label: 'Accept Document', icon: CheckCircle2 });
    }
    // Sales Execution conversion chain — only valid downstream targets, gated
    // per target by its own convertedToX flag (never by the generic status):
    // a converted DC can still convert to targets it has not been converted to,
    // while cancelled challans never convert (ERP deliverychallans.js gate).
    const conversion = [];
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      if (!row.convertedToInvoice) conversion.push({ key: 'convert', label: 'Convert to Invoice', icon: Wallet });
      if (!row.convertedToCn) conversion.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText });
      if (!row.convertedToPr) conversion.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote });
    }
    if (conversion.length) items.push({ heading: true, label: 'CONVERSION' }, ...conversion);
    items.push({ key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }, { key: 'email', label: 'Email', icon: Mail }, { key: 'print', label: 'Print', icon: Printer }, { key: 'pdf', label: 'PDF', icon: FileDown });
    return items;
  },
  onRowAction: (key, row, hook) => {
    if (key === 'accept') return hook.changeStatus(row.id, 'accepted').then(() => ({ ok: true, message: `${row.dcNo} accepted` }));
    if (key === 'convert') return runAction(hook, row.id, 'convert-invoice', `${row.dcNo} converted to invoice`);
    if (key === 'convertCn') return runAction(hook, row.id, 'convert-credit-note', `${row.dcNo} converted to credit note`);
    if (key === 'convertPr') return runAction(hook, row.id, 'convert-payment-receipt', `${row.dcNo} converted to payment receipt`);
    if (key === 'whatsapp') return whatsappDocument(row, 'deliveryChallan', 'Delivery Challan');
    if (key === 'email') return emailDocument(row, 'deliveryChallan', 'Delivery Challan');
    if (key === 'print') return openPrint(buildSalesPrintHtml(row, 'Delivery Challan', 'deliveryChallan'));
    if (key === 'pdf') return exportSalesDocumentPdf(row, 'Delivery Challan', 'deliveryChallan', `${row.dcNo || 'challan'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

export const deliveryChallanViewConfig = {
  service: deliveryChallanService,
  moduleKey: 'deliveryChallan',
  title: 'Delivery Challan',
  label: 'delivery challan',
  listRoute: '/delivery-challans',
  viewRoute: (record) => `/delivery-challans/${record.id}`,
  designRoute: (doc) => `/delivery-challans/design?id=${doc.id}`,
  editRoute: (doc) => `/delivery-challans/${doc.id}/edit`,
  dateKey: 'dcDate',
  normalize: normalizeDeliveryChallan,
  generalRows: (doc) => [
    ['Challan No', <strong key="n">{doc.dcNo}</strong>],
    ['CPO Ref', cpoNo(doc.soRef) || '—'],
    ['Contract Ref', doc.scRef || '—'],
    ['Challan Date', formatDate(doc.dcDate)],
    ['Transport Company', doc.transportCompany || '—'],
    ['Vehicle Number', doc.vehicleNumber || '—'],
    ['Driver Name', doc.driverName || '—'],
    ['LR Number', doc.lrNumber || '—'],
    ['E-Way Bill', doc.ewayBill || '—'],
    ['Dispatch Date', formatDate(doc.dispatchDate)],
    ['Expected Delivery', formatDate(doc.deliveryDate)]
  ],
  linkedDocs: (doc) => {
    const links = [];
    if (doc.soRef) links.push({ label: 'Customer Purchase Order', value: cpoNo(doc.soRef) });
    if (doc.scRef) links.push({ label: 'Sales Contract', value: doc.scRef });
    if (doc.convertedToInvoice) links.push({ label: 'Invoice', value: doc.convertedToInvoice });
    if (doc.convertedToCn) links.push({ label: 'Credit Note', value: doc.convertedToCn });
    if (doc.convertedToPr) links.push({ label: 'Payment Receipt', value: doc.convertedToPr });
    return links;
  },
  headerActions: (doc, { runAction, navigate, toast }) => {
    const actions = [];
    const status = String(doc.status || '').toLowerCase();
    // Conversion eligibility is driven by ACTUAL CONVERSION HISTORY (the
    // convertedToX refs), never by the generic status — a converted DC can
    // still convert to targets it has not been converted to yet, while
    // cancelled challans never convert (ERP deliverychallans.js gate).
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      if (!doc.convertedToInvoice) {
        actions.push({ key: 'convert', label: 'Generate Invoice', icon: Wallet, style: 'green', action: () => runConvert(deliveryChallanService, doc.id, 'convert-invoice', `${doc.dcNo} converted to invoice`, navigate, toast) });
      }
      if (!doc.convertedToCn) {
        actions.push({ key: 'convertCn', label: 'Convert to Credit Note', icon: FileText, style: 'secondary', action: () => runConvert(deliveryChallanService, doc.id, 'convert-credit-note', `${doc.dcNo} converted to credit note`, navigate, toast) });
      }
      if (!doc.convertedToPr) {
        actions.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote, style: 'secondary', action: () => runConvert(deliveryChallanService, doc.id, 'convert-payment-receipt', `${doc.dcNo} converted to payment receipt`, navigate, toast) });
      }
    }
    // Status/communication actions keep the ERP deliverychallans.js gate.
    if (!['converted', 'cancelled', 'deleted', 'archived'].includes(status)) {
      actions.push({ key: 'accept', label: 'Accept Document', icon: CheckCircle2, style: 'secondary', action: () => runAction(() => deliveryChallanService.changeStatus(doc.id, 'accepted'), `${doc.dcNo} accepted`) });
      actions.push({ key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, style: 'ghost', action: () => whatsappDocument(doc, 'deliveryChallan', 'Delivery Challan') });
    }
    return actions;
  },
  printHtml: (doc) => buildSalesPrintHtml(doc, 'Delivery Challan', 'deliveryChallan'),
  exportPdf: (doc) => exportSalesDocumentPdf(doc, 'Delivery Challan', 'deliveryChallan', `${doc.dcNo || 'challan'}-${new Date().toISOString().slice(0, 10)}`)
};

// ===== Proforma Invoices =====
export const proformaInvoiceListConfig = {
  service: proformaInvoiceService,
  moduleKey: 'proformaInvoice',
  title: 'Proforma Invoice',
  titlePlural: 'Proforma Invoices',
  icon: FileText,
  newLabel: 'New Proforma Invoice',
  listRoute: '/proforma-invoices',
  newRoute: '/proforma-invoices/new',
  viewRoute: (row) => `/proforma-invoices/${row.id}`,
  designRoute: (row) => `/proforma-invoices/design?id=${row.id}`,
  editRoute: (row) => `/proforma-invoices/${row.id}/edit`,
  searchPlaceholder: 'Search Proforma No, Client, Ref...',
  tableMinWidth: 1000,
  kpiGridClassName: KPI_GRID_ERP,
  useHook: () =>
    useSalesModule({
      service: proformaInvoiceService,
      moduleKey: 'proformaInvoice',
      statusMap: PI_STATUS_MAP,
      statusValueMap: PI_STATUS_VALUES,
      searchKeys: PI_SEARCH_KEYS,
      extraParams: PI_EXTRA_PARAMS
    }),
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    { key: 'piNo', label: 'PI No', width: 160, sortable: true, mandatory: true },
    { key: 'clientName', label: 'Client', width: 200, sortable: true },
    { key: 'piDate', label: 'Date', width: 110, sortable: true },
    { key: 'grandTotal', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'status', label: 'Status', width: 140, mandatory: true },
    // Shows the Delivery Challan this Proforma Invoice was dispatched by, in
    // either direction: the challan it was generated from (source = DC) or the
    // challan created from it via the Convert to Delivery Challan action.
    { key: 'dcRef', label: 'DC Ref', width: 130, render: (row) => (row.convertedToDc || (String(row.source || '') === 'dc' || String(row.source || '').toLowerCase().includes('challan') ? row.sourceRef || '—' : '—')) },
    { key: 'soRef', label: 'CPO Ref', width: 130, render: (row) => (String(row.source || '') === 'so' || String(row.source || '').toLowerCase().includes('sales order') ? cpoNo(row.sourceRef) || '—' : '—') },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All PI', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: FileText, color: '#0B4A3D' },
    { key: 'totalvalue', label: 'Total Amount', valueOf: (s) => money(s?.totalAmt ?? 0), icon: IndianRupee, color: '#ec4899' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('sent', 'Sent', Send, '#0B4A3D'),
    statusKpi('paid', 'Paid', CheckCircle2, '#16a34a'),
    statusKpi('overdue', 'Overdue', AlertCircle, '#dc2626'),
    statusKpi('converted', 'Converted', Repeat, '#8b5cf6'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af')
  ],
  filters: [
    { key: 'no', label: 'Proforma No', type: 'text', placeholder: 'Search number...' },
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'status', label: 'Status', type: 'select', options: PROFORMA_INVOICE_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ],
  rowActions: (row) => {
    const items = [];
    const status = String(row.status || '').toLowerCase();
    if (status === 'draft' || status === 'accepted') items.push({ key: 'send', label: 'Send', icon: Send });
    // Proforma Invoice conversions. Convert to Invoice is the fulfilment step
    // (a Proforma Invoice's downstream document), Convert to Delivery Challan
    // is the dispatch step — the same pair the CPO and Sales Contract lists
    // offer. Availability is driven by each target's OWN conversion reference
    // (convertedToInvoice / convertedToDc), never by the generic status, so a
    // Proforma Invoice that was already dispatched can still be invoiced and
    // vice-versa. The backend refuses a second Delivery Challan and returns the
    // existing Invoice, so no duplicate document can be produced.
    const conversion = [];
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      conversion.push({ key: 'convert', label: 'Convert to Invoice', icon: Wallet });
      // Hidden once the challan exists: this ERP dispatches a Proforma Invoice in
      // one Delivery Challan (the backend refuses a second one), so the action
      // must not stay on offer after the conversion.
      if (!row.convertedToDc) {
        conversion.push({ key: 'convertDc', label: 'Convert to Delivery Challan', icon: Truck });
      }
    }
    if (conversion.length) items.push({ heading: true, label: 'CONVERSION' }, ...conversion);
    items.push({ key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }, { key: 'email', label: 'Email', icon: Mail }, { key: 'print', label: 'Print', icon: Printer }, { key: 'pdf', label: 'PDF', icon: FileDown });
    return items;
  },
  onRowAction: (key, row, hook, navigate) => {
    if (key === 'send') return runAction(hook, row.id, 'send', `${row.piNo} sent`);
    if (key === 'convert') return runAction(hook, row.id, 'convert-invoice', `${row.piNo} converted to invoice`);
    // Convert to Delivery Challan opens the Delivery Challan form with this
    // Proforma Invoice as its source; the challan itself is written only when
    // the user saves the reviewed form (POST /proforma-invoices/{id}/delivery-
    // challans), which also marks this Proforma Invoice converted. Opening the
    // action therefore persists nothing.
    if (key === 'convertDc') return navigate?.(`/delivery-challans/new?fromPi=${row.id}`);
    if (key === 'whatsapp') return whatsappDocument(row, 'proformaInvoice', 'Proforma Invoice');
    if (key === 'email') return emailDocument(row, 'proformaInvoice', 'Proforma Invoice');
    if (key === 'print') return openPrint(buildSalesPrintHtml(row, 'Proforma Invoice', 'proformaInvoice'));
    if (key === 'pdf') return exportSalesDocumentPdf(row, 'Proforma Invoice', 'proformaInvoice', `${row.piNo || 'proforma'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

// Packing List — sub-branch under Customer Purchase Orders. Consumes the
// EXISTING Proforma Invoice records (same service + hook as the Proforma
// Invoice list): every saved/converted Proforma Invoice appears here with its
// Contract No, Appendix / PO No, items and quantities. Rows open the real PI.
export const packingListConfig = {
  service: proformaInvoiceService,
  moduleKey: 'proformaInvoice',
  title: 'Packing List',
  titlePlural: 'Packing List',
  icon: PackageCheck,
  // Packing List documents are Proforma Invoice records in this ERP; the New
  // flow reuses the existing Proforma Invoice create page (same layout) with
  // the document identity switched to Packing List via ?docType=packing-list.
  newLabel: 'New Packing List',
  listRoute: '/sales-orders/packing-list',
  newRoute: '/proforma-invoices/new?docType=packing-list',
  viewRoute: (row) => `/proforma-invoices/${row.id}`,
  designRoute: (row) => `/packing-lists/design?id=${row.id}`,
  editRoute: (row) => `/proforma-invoices/${row.id}/edit?docType=packing-list`,
  searchPlaceholder: 'Search PI No, Client, Contract No...',
  tableMinWidth: 1180,
  kpiGridClassName: KPI_GRID_ERP,
  useHook: () =>
    useSalesModule({
      service: proformaInvoiceService,
      moduleKey: 'proformaInvoice',
      statusMap: PI_STATUS_MAP,
      statusValueMap: PI_STATUS_VALUES,
      searchKeys: PI_SEARCH_KEYS,
      extraParams: PI_EXTRA_PARAMS
    }),
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    { key: 'piDate', label: 'Date', width: 110, sortable: true, render: (row) => formatDate(row.piDate) || '—' },
    { key: 'piNo', label: 'PI No', width: 150, sortable: true, mandatory: true },
    { key: 'clientName', label: 'Customer', width: 200, sortable: true },
    { key: 'contractNo', label: 'Contract No', width: 150, render: (row) => row.contractNo || '—' },
    { key: 'appendixPoNo', label: 'Appendix / PO No', width: 150, render: (row) => row.appendixPoNo || '—' },
    { key: 'items', label: 'Items', width: 80, align: 'center', render: (row) => row.itemsCount ?? (Array.isArray(row.items) ? row.items.length : '—') },
    { key: 'totalQty', label: 'Qty', width: 90, align: 'right', render: (row) => (row.totalQty != null && row.totalQty !== '' ? Number(row.totalQty) : '—') },
    { key: 'grandTotal', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'status', label: 'Status', width: 120, mandatory: true },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All PIs', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: FileText, color: '#0B4A3D' },
    { key: 'totalvalue', label: 'Total Amount', valueOf: (s) => money(s?.totalAmt ?? 0), icon: IndianRupee, color: '#ec4899' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('sent', 'Sent', Send, '#0B4A3D'),
    statusKpi('paid', 'Paid', CheckCircle2, '#16a34a'),
    statusKpi('overdue', 'Overdue', AlertCircle, '#dc2626'),
    statusKpi('converted', 'Converted', Repeat, '#8b5cf6'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af')
  ],
  filters: [
    { key: 'no', label: 'PI No', type: 'text', placeholder: 'Search number...' },
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'status', label: 'Status', type: 'select', options: PROFORMA_INVOICE_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ]
};

export const proformaInvoiceViewConfig = {
  service: proformaInvoiceService,
  moduleKey: 'proformaInvoice',
  title: 'Proforma Invoice',
  label: 'proforma invoice',
  listRoute: '/proforma-invoices',
  viewRoute: (record) => `/proforma-invoices/${record.id}`,
  designRoute: (doc) => `/proforma-invoices/design?id=${doc.id}`,
  editRoute: (doc) => `/proforma-invoices/${doc.id}/edit`,
  dateKey: 'piDate',
  normalize: normalizeProformaInvoice,
  generalRows: (doc) => [
    ['Proforma No', <strong key="n">{doc.piNo}</strong>],
    ['Proforma Date', formatDate(doc.piDate)],
    ['Contract No', doc.contractNo || '—'],
    ['Appendix / PO No', doc.appendixPoNo || '—'],
    ['Reference No', doc.referenceNo || '—'],
    ['Valid Till', formatDate(doc.validTill)],
    ['Source', SOURCE_LABELS[doc.source] || doc.source || '—'],
    ['Source Ref', doc.sourceRef || '—']
  ],
  linkedDocs: (doc) => {
    const links = [];
    if (doc.sourceRef) links.push({ label: 'Source', value: doc.sourceRef });
    if (doc.convertedToSo) links.push({ label: 'Customer Purchase Order', value: cpoNo(doc.convertedToSo) });
    if (doc.convertedToInvoice) links.push({ label: 'Invoice', value: doc.convertedToInvoice });
    if (doc.convertedToDc) links.push({ label: 'Delivery Challan', value: doc.convertedToDc });
    if (doc.convertedToCn) links.push({ label: 'Credit Note', value: doc.convertedToCn });
    if (doc.convertedToPr) links.push({ label: 'Payment Receipt', value: doc.convertedToPr });
    return links;
  },
  headerActions: (doc, { runAction, navigate, toast }) => {
    const actions = [];
    const status = String(doc.status || '').toLowerCase();
    if ((status === 'draft' || status === 'accepted') && !doc.convertedToInvoice) {
      actions.push({ key: 'send', label: 'Send', icon: Send, style: 'primary', action: () => runAction(() => proformaInvoiceService.postAction(doc.id, 'send'), `${doc.piNo} sent to client`) });
    }
    // Same conversion pair as the list's Actions menu: the fulfilment step
    // (Invoice) and the dispatch step (Delivery Challan), each gated by its OWN
    // conversion reference so one does not hide the other.
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      if (!doc.convertedToInvoice) {
        actions.push({ key: 'convert', label: 'Convert to Invoice', icon: Wallet, style: 'green', action: runConvert(proformaInvoiceService, doc.id, 'convert-invoice', `${doc.piNo} converted to invoice`, navigate, toast) });
      }
      if (!doc.convertedToDc) {
        // Opens the Delivery Challan CREATE form prefilled from this Proforma
        // Invoice (?fromPi=<id>) — same behaviour as the list's Actions menu.
        // Nothing is persisted here: the challan (and this Proforma Invoice's
        // converted status) is written only when the user saves that form.
        actions.push({ key: 'convertDc', label: 'Convert to Delivery Challan', icon: Truck, style: 'secondary', action: () => navigate(`/delivery-challans/new?fromPi=${doc.id}`) });
      }
      actions.push({ key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, style: 'ghost', action: () => whatsappDocument(doc, 'proformaInvoice', 'Proforma Invoice') });
    }
    return actions;
  },
  printHtml: (doc) => buildSalesPrintHtml(doc, 'Proforma Invoice', 'proformaInvoice'),
  exportPdf: (doc) => exportSalesDocumentPdf(doc, 'Proforma Invoice', 'proformaInvoice', `${doc.piNo || 'proforma'}-${new Date().toISOString().slice(0, 10)}`)
};

// ===== Invoices =====
export const invoiceListConfig = {
  service: invoiceService,
  moduleKey: 'invoice',
  title: 'Invoice',
  titlePlural: 'Invoices',
  icon: Wallet,
  newLabel: 'New Invoice',
  listRoute: '/invoices',
  newRoute: '/invoices/new',
  viewRoute: (row) => `/invoices/${row.id}`,
  designRoute: (row) => `/invoices/design?id=${row.id}`,
  editRoute: (row) => `/invoices/${row.id}/edit`,
  searchPlaceholder: 'Search Invoice No, Client, Ref...',
  tableMinWidth: 1000,
  kpiGridClassName: KPI_GRID_ERP,
  useHook: () =>
    useSalesModule({
      service: invoiceService,
      moduleKey: 'invoice',
      statusMap: INV_STATUS_MAP,
      statusValueMap: INV_STATUS_VALUES,
      searchKeys: INV_SEARCH_KEYS,
      extraParams: INV_EXTRA_PARAMS
    }),
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    { key: 'invoiceNo', label: 'Invoice No', width: 160, sortable: true, mandatory: true },
    { key: 'clientName', label: 'Client', width: 200, sortable: true },
    { key: 'invoiceDate', label: 'Date', width: 110, sortable: true },
    { key: 'grandTotal', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'dueDate', label: 'Due Date', width: 110 },
    { key: 'status', label: 'Status', width: 140, mandatory: true },
    { key: 'piRef', label: 'PI Ref', width: 130, render: (row) => (String(row.source || '') === 'pi' || String(row.source || '').toLowerCase().includes('proforma') ? row.sourceRef || '—' : '—') },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: Wallet, color: '#0B4A3D' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('issued', 'Issued', BadgeCheck, '#0B4A3D'),
    statusKpi('sent', 'Sent', Send, '#0B4A3D'),
    statusKpi('partial', 'Partial', Clock, '#D97706'),
    statusKpi('paid', 'Paid', CheckCircle2, '#16a34a'),
    statusKpi('overdue', 'Overdue', AlertCircle, '#dc2626'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af')
  ],
  filters: [
    { key: 'no', label: 'Invoice No', type: 'text', placeholder: 'Search number...' },
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ],
  rowActions: (row) => {
    const items = [];
    const status = String(row.status || '').toLowerCase();
    if (status === 'draft' || status === 'sent') {
      items.push({ key: 'send', label: 'Send', icon: Send });
      items.push({ key: 'markpaid', label: 'Mark Paid', icon: CheckCircle2 });
    }
    // Exact conversion chain (Proforma Invoice → Invoice → Credit Note →
    // Payment Receipt): the ONLY downstream conversion for an Invoice is
    // Convert to Credit Note. Duplicate conversion is prevented by the backend —
    // an already-converted Invoice returns its existing Credit Note.
    const conversion = [];
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      conversion.push({ key: 'creditnote', label: 'Convert to Credit Note', icon: FileText });
    }
    if (conversion.length) items.push({ heading: true, label: 'CONVERSION' }, ...conversion);
    items.push({ key: 'email', label: 'Email', icon: Mail }, { key: 'print', label: 'Print', icon: Printer }, { key: 'pdf', label: 'PDF', icon: FileDown });
    return items;
  },
  onRowAction: (key, row, hook) => {
    const actions = {
      send: ['send', `${row.invoiceNo} sent`],
      markpaid: ['mark-paid', `${row.invoiceNo} marked paid`],
      creditnote: ['convert-credit-note', `${row.invoiceNo} converted to credit note`]
    };
    if (actions[key]) return runAction(hook, row.id, actions[key][0], actions[key][1]);
    if (key === 'email') return emailDocument(row, 'invoice', 'Invoice');
    // Export / SEZ invoices print their professional A4 EXPORT INVOICE document
    // (currency-aware totals, declaration, consignee/buyer, shipment details).
    const isExportInv = ['export', 'sez'].includes(String(row.invoiceType || ''));
    if (key === 'print') return openPrint(isExportInv ? buildExportInvoicePrintHtml(row, row.items || []) : buildSalesPrintHtml(row, 'Invoice', 'invoice'));
    if (key === 'pdf') return isExportInv
      ? openPrint(buildExportInvoicePrintHtml(row, row.items || []))
      : exportSalesDocumentPdf(row, 'Invoice', 'invoice', `${row.invoiceNo || 'invoice'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

export const invoiceViewConfig = {
  service: invoiceService,
  moduleKey: 'invoice',
  title: 'Invoice',
  label: 'invoice',
  listRoute: '/invoices',
  viewRoute: (record) => `/invoices/${record.id}`,
  designRoute: (doc) => `/invoices/design?id=${doc.id}`,
  editRoute: (doc) => `/invoices/${doc.id}/edit`,
  dateKey: 'invoiceDate',
  normalize: normalizeInvoice,
  generalRows: (doc) => {
    const rows = [
      ['Invoice No', <strong key="n">{doc.invoiceNo}</strong>],
      ['Invoice Date', formatDate(doc.invoiceDate)],
      ['Due Date', formatDate(doc.dueDate)],
      ['Reference No', doc.referenceNo || '—'],
      ['Source', SOURCE_LABELS[doc.source] || doc.source || '—'],
      ['Source Ref', doc.sourceRef || '—']
    ];
    // Export / SEZ invoices surface their export references + parties.
    if (['export', 'sez'].includes(String(doc.invoiceType || ''))) {
      rows.splice(3, 0,
        ['Contract No', doc.contractNo || '—'],
        ['Contract Date', formatDate(doc.contractDate)],
        ['Appendix No', doc.appendixNo || '—'],
        ["Exporter's Ref", doc.exporterRef || '—'],
        ['PO No', doc.poNo || '—'],
        ['Currency', doc.currency || '—']);
      rows.push(['Consignee', doc.consigneeName || '—'], ['Country of Origin', doc.countryOfOrigin || '—']);
    }
    return rows;
  },
  linkedDocs: (doc) => {
    const links = [];
    if (doc.sourceRef) links.push({ label: 'Source', value: doc.sourceRef });
    if (doc.convertedToReceipt) links.push({ label: 'Payment Receipt', value: doc.convertedToReceipt });
    if (doc.convertedToCreditNote) links.push({ label: 'Credit Note', value: doc.convertedToCreditNote });
    return links;
  },
  headerActions: (doc, { runAction, navigate, toast }) => {
    const actions = [];
    const status = String(doc.status || '').toLowerCase();
    if (status === 'draft' || status === 'sent') {
      actions.push({ key: 'send', label: 'Send', icon: Send, style: 'primary', action: () => runAction(() => invoiceService.postAction(doc.id, 'send'), `${doc.invoiceNo} sent to client`) });
      actions.push({ key: 'markpaid', label: 'Mark Paid', icon: CheckCircle2, style: 'approve', action: () => runAction(() => invoiceService.postAction(doc.id, 'mark-paid'), `${doc.invoiceNo} marked paid`) });
    }
    // Exact conversion chain: the ONLY downstream conversion for an Invoice is
    // Convert to Credit Note.
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      if (!doc.convertedToCreditNote) {
        actions.push({ key: 'creditnote', label: 'Convert to Credit Note', icon: FileText, style: 'secondary', action: runConvert(invoiceService, doc.id, 'convert-credit-note', `${doc.invoiceNo} converted to credit note`, navigate, toast) });
      }
    }
    return actions;
  },
  printHtml: (doc) => (['export', 'sez'].includes(String(doc.invoiceType || ''))
    ? buildExportInvoicePrintHtml(doc, doc.items || [])
    : buildSalesPrintHtml(doc, 'Invoice', 'invoice')),
  exportPdf: (doc) => (['export', 'sez'].includes(String(doc.invoiceType || ''))
    ? openPrint(buildExportInvoicePrintHtml(doc, doc.items || []))
    : exportSalesDocumentPdf(doc, 'Invoice', 'invoice', `${doc.invoiceNo || 'invoice'}-${new Date().toISOString().slice(0, 10)}`))
};

// ===== Payment Receipts =====
export const paymentReceiptListConfig = {
  service: paymentReceiptService,
  moduleKey: 'paymentReceipt',
  title: 'Payment Receipt',
  titlePlural: 'Payment Receipts',
  icon: Banknote,
  newLabel: 'New Payment Receipt',
  listRoute: '/payment-receipts',
  newRoute: '/payment-receipts/new',
  viewRoute: (row) => `/payment-receipts/${row.id}`,
  designRoute: (row) => `/payment-receipts/design?id=${row.id}`,
  editRoute: (row) => `/payment-receipts/${row.id}/edit`,
  searchPlaceholder: 'Search Receipt No, Client, Invoice Ref...',
  tableMinWidth: 900,
  kpiGridClassName: KPI_GRID_ERP,
  useHook: () =>
    useSalesModule({
      service: paymentReceiptService,
      moduleKey: 'paymentReceipt',
      statusMap: PR_STATUS_MAP,
      statusValueMap: PR_STATUS_VALUES,
      searchKeys: PR_SEARCH_KEYS,
      extraParams: PR_EXTRA_PARAMS
    }),
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    { key: 'receiptNo', label: 'Receipt No', width: 160, sortable: true, mandatory: true },
    { key: 'clientName', label: 'Customer', width: 200, sortable: true },
    { key: 'paymentDate', label: 'Date', width: 110, sortable: true },
    { key: 'amount', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'paymentMode', label: 'Mode', width: 130 },
    { key: 'invoiceRef', label: 'Invoice Ref', width: 130 },
    { key: 'status', label: 'Status', width: 130, mandatory: true },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: Banknote, color: '#0B4A3D' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('received', 'Received', CheckCircle2, '#16a34a'),
    statusKpi('partial', 'Partial', Clock, '#D97706'),
    statusKpi('completed', 'Completed', CheckCircle2, '#059669'),
    statusKpi('cancelled', 'Cancelled', Ban, '#dc2626')
  ],
  filters: [
    { key: 'no', label: 'Receipt No', type: 'text', placeholder: 'Search number...' },
    { key: 'client', label: 'Customer', type: 'text', placeholder: 'Search customer...' },
    { key: 'status', label: 'Status', type: 'select', options: PAYMENT_RECEIPT_STATUSES },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ],
  rowActions: () => [
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'print', label: 'Print', icon: Printer },
    { key: 'pdf', label: 'PDF', icon: FileDown }
  ],
  onRowAction: (key, row) => {
    if (key === 'email') return emailDocument(row, 'paymentReceipt', 'Payment Receipt');
    if (key === 'print') return openPrint(buildSalesPrintHtml(row, 'Payment Receipt', 'paymentReceipt'));
    if (key === 'pdf') return exportSalesDocumentPdf(row, 'Payment Receipt', 'paymentReceipt', `${row.receiptNo || 'receipt'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

export const paymentReceiptViewConfig = {
  service: paymentReceiptService,
  moduleKey: 'paymentReceipt',
  title: 'Payment Receipt',
  label: 'payment receipt',
  listRoute: '/payment-receipts',
  viewRoute: (record) => `/payment-receipts/${record.id}`,
  designRoute: (doc) => `/payment-receipts/design?id=${doc.id}`,
  editRoute: (doc) => `/payment-receipts/${doc.id}/edit`,
  dateKey: 'paymentDate',
  showItems: false,
  normalize: normalizePaymentReceipt,
  generalRows: (doc) => [
    ['Receipt No', <strong key="n">{doc.receiptNo}</strong>],
    ['Payment Date', formatDate(doc.paymentDate)],
    ['Payment Mode', doc.paymentMode || '—'],
    ['Bank Name', doc.bankName || '—'],
    ['Branch', doc.branch || '—'],
    ['Cheque / Tx No', doc.chequeTx || '—'],
    ['Reference No', doc.referenceNo || '—'],
    ['Source', SOURCE_LABELS[doc.source] || doc.source || '—'],
    ['Invoice Ref', doc.invoiceRef || '—']
  ],
  linkedDocs: (doc) => {
    const links = [];
    if (doc.invoiceRef) links.push({ label: 'Invoice', value: doc.invoiceRef });
    return links;
  },
  printHtml: (doc) => buildSalesPrintHtml(doc, 'Payment Receipt', 'paymentReceipt'),
  exportPdf: (doc) => exportSalesDocumentPdf(doc, 'Payment Receipt', 'paymentReceipt', `${doc.receiptNo || 'receipt'}-${new Date().toISOString().slice(0, 10)}`)
};

// ===== Credit Notes =====
export const creditNoteListConfig = {
  service: creditNoteService,
  moduleKey: 'creditNote',
  title: 'Credit Note',
  titlePlural: 'Credit Notes',
  icon: FileText,
  newLabel: 'New Credit Note',
  listRoute: '/credit-notes',
  newRoute: '/credit-notes/new',
  viewRoute: (row) => `/credit-notes/${row.id}`,
  designRoute: (row) => `/credit-notes/design?id=${row.id}`,
  editRoute: (row) => `/credit-notes/${row.id}/edit`,
  searchPlaceholder: 'Search CN Number, Customer, Invoice Number, Terms...',
  // Sum of the default column widths below, so the linked-document columns are
  // never squashed: the table scrolls horizontally inside its card (sticky
  // document number / actions), exactly like the other Sales Execution lists.
  tableMinWidth: 2120,
  // Credit Notes list supports the same List/Kanban presentation toggle as
  // Sales Orders and Sales Contracts: the shared SalesListPage renders the
  // toggle + board from this module's OWN status values (the Status filter
  // options below), so every column is a real Credit Note status and every
  // loaded record has a column — never an invented state.
  kanban: true,
  kanbanMoveTargets: CN_KANBAN_MOVE_TARGETS,
  // Card fields follow the Sales Contracts board: document number as the card
  // title, customer under it, then the Credit Note's source document, date,
  // amount and reason. Everything comes from the list row already loaded by
  // this page — no extra fetch, no mock data.
  kanbanCard: (row) => ({
    title: row.cnNo || `#${row.id}`,
    subtitle: row.clientName || '—',
    // Stacked lines, like the Sales Contract card's meta block — a source
    // reference such as INV-2026-000005 never has to wrap inside a narrow
    // two-column cell.
    layout: 'stack',
    fields: [
      ['Source', row.sourceRef || '—'],
      ['Date', formatDate(row.cnDate)],
      ['Amount', formatINR(row.grandTotal, row.currency)],
      ['Reason', row.reason || '—']
    ]
  }),
  kpiGridClassName: KPI_GRID_ERP,
  useHook: () =>
    useSalesModule({
      service: creditNoteService,
      moduleKey: 'creditNote',
      statusMap: CN_STATUS_MAP,
      statusValueMap: CN_STATUS_VALUES,
      searchKeys: CN_SEARCH_KEYS,
      extraParams: CN_EXTRA_PARAMS
    }),
  columns: [
    { key: 'checkbox', label: '', width: 48, always: true },
    { key: 'cnNo', label: 'Credit Note No', width: 170, sortable: true, mandatory: true },
    { key: 'cnDate', label: 'Date', width: 110, sortable: true },
    { key: 'clientName', label: 'Customer', width: 200, sortable: true },
    // ===== Linked-document columns (all real values, never placeholders) ====
    // CPO No. is the Customer Purchase Order the credit note traces back to,
    // carried by the note's own payload (the backend resolves it through the
    // linked source document) and displayed through the shared cpoNo() label,
    // exactly like the CPO list and view render an order number. No linked CPO
    // means no cell value — an unrelated document number is never shown.
    // Sortable: the backend sorts the WHOLE filtered set on this resolved value
    // (never on a stored stand-in), so the order matches the cells on screen.
    { key: 'cpoNo', label: 'CPO No.', width: 150, sortable: true, render: (row) => (row.cpoNo ? cpoNo(row.cpoNo) : '—') },
    { key: 'sourceRef', label: 'Source Document', width: 170 },
    { key: 'sourceDate', label: 'Original Invoice Date', width: 150 },
    // Dispatch date comes from the linked Delivery Challan (the document that
    // owns it); the credit note stores none of its own. Sortable on that
    // resolved dispatch date, with unlinked rows (—) always last.
    { key: 'dispatchDate', label: 'Dispatch Date', width: 130, sortable: true, render: (row) => formatDate(row.dispatchDate) || '—' },
    // Destination Reached Date is the credit note's own column — no other
    // document in the chain records it, so it is entered on the note itself and
    // sorts on its real column.
    { key: 'destinationReachedDate', label: 'Destination Reached Date', width: 165, sortable: true, render: (row) => formatDate(row.destinationReachedDate) || '—' },
    // Terms are the credit note's own stored text (carried over from the source
    // document on conversion and editable in the form). Long text is clipped to
    // the column width with the full value in the cell tooltip.
    {
      key: 'terms',
      label: 'Terms',
      width: 180,
      sortable: true,
      render: (row) => (row.terms
        ? <span className="block max-w-[170px] truncate" title={row.terms}>{row.terms}</span>
        : '—')
    },
    // Due Date is the linked invoice's due date (else the linked CPO's delivery
    // date, which the CPO module itself presents as its due date) — resolved by
    // the backend and sorted on that resolved date, never on a local guess.
    { key: 'dueDate', label: 'Due Date', width: 110, sortable: true, render: (row) => formatDate(row.dueDate) || '—' },
    // Due Date Exceeded: the backend's authoritative overdue flag — due date
    // passed AND the amount still outstanding (a settled credit note or a fully
    // paid source invoice is never overdue). Rendered with the shared status
    // pill so the list reads like every other status cell.
    {
      key: 'dueDateExceeded',
      label: 'Due Date Exceeded',
      width: 150,
      // Sortable on the resolved flag: ascending puts the not-yet-due rows
      // first, descending puts the overdue ones first. Rows with no due date at
      // all (no flag) sort last in both directions.
      sortable: true,
      render: (row) => <SalesStatusBadge status={row.dueDateExceeded ? 'Overdue' : 'Not Overdue'} />
    },
    { key: 'grandTotal', label: 'Amount', width: 130, align: 'right', sortable: true },
    { key: 'status', label: 'Status', width: 150, mandatory: true },
    { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
  ],
  kpis: [
    { key: 'all', label: 'All', valueOf: (s) => s?.total ?? s?.all ?? 0, icon: FileText, color: '#0B4A3D' },
    statusKpi('draft', 'Draft', PenLine, '#6b7280'),
    statusKpi('pending approval', 'Pending', Clock, '#d97706'),
    statusKpi('approved', 'Approved', CheckCircle2, '#16a34a'),
    statusKpi('issued', 'Issued', BadgeCheck, '#0B4A3D'),
    statusKpi('adjusted', 'Adjusted', CheckCircle2, '#a16207'),
    statusKpi('refunded', 'Refunded', Undo2, '#9333ea'),
    statusKpi('cancelled', 'Cancelled', Ban, '#9ca3af')
  ],
  filters: [
    { key: 'status', label: 'Status', type: 'select', options: CREDIT_NOTE_STATUSES },
    { key: 'client', label: 'Customer', type: 'text', placeholder: 'Search customer...' },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ],
  rowActions: (row) => {
    const items = [];
    const status = String(row.status || '').toLowerCase();
    if (status === 'draft' || status === 'pending approval') items.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
    if (status === 'approved') items.push({ key: 'issue', label: 'Issue', icon: BadgeCheck });
    // Exact conversion chain (Proforma Invoice → Invoice → Credit Note →
    // Payment Receipt): the ONLY downstream conversion for a Credit Note is
    // Convert to Payment Receipt (Payment Receipt is the end of the chain).
    // Duplicate conversion is prevented by the backend — an already-converted
    // Credit Note returns its existing Payment Receipt.
    const conversion = [];
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      conversion.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote });
    }
    if (conversion.length) items.push({ heading: true, label: 'CONVERSION' }, ...conversion);
    items.push({ key: 'email', label: 'Email', icon: Mail }, { key: 'print', label: 'Print', icon: Printer }, { key: 'pdf', label: 'PDF', icon: FileDown });
    return items;
  },
  onRowAction: (key, row, hook) => {
    const actions = {
      approve: ['approve', `${row.cnNo} approved`],
      issue: ['issue', `${row.cnNo} issued`],
      convertPr: ['convert-payment-receipt', `${row.cnNo} converted to payment receipt`]
    };
    if (actions[key]) return runAction(hook, row.id, actions[key][0], actions[key][1]);
    if (key === 'email') return emailDocument(row, 'creditNote', 'Credit Note');
    if (key === 'print') return openPrint(buildSalesPrintHtml(row, 'Credit Note', 'creditNote'));
    if (key === 'pdf') return exportSalesDocumentPdf(row, 'Credit Note', 'creditNote', `${row.cnNo || 'credit-note'}-${new Date().toISOString().slice(0, 10)}`);
    return undefined;
  }
};

export const creditNoteViewConfig = {
  service: creditNoteService,
  moduleKey: 'creditNote',
  title: 'Credit Note',
  label: 'credit note',
  // A Credit Note has no discount, so the item table's (always zero) Discount
  // row is omitted; a legacy note that stored a real discount still shows it.
  hideZeroDiscountRow: true,
  listRoute: '/credit-notes',
  viewRoute: (record) => `/credit-notes/${record.id}`,
  designRoute: (doc) => `/credit-notes/design?id=${doc.id}`,
  editRoute: (doc) => `/credit-notes/${doc.id}/edit`,
  dateKey: 'cnDate',
  normalize: normalizeCreditNote,
  generalRows: (doc) => [
    ['Credit Note No', <strong key="n">{doc.cnNo}</strong>],
    ['Credit Note Date', formatDate(doc.cnDate)],
    // Linked-document values (CPO No. / Dispatch Date / Due Date / Due Date
    // Exceeded) are resolved by the backend from the documents this credit note
    // points at; Destination Reached Date is the note's own date. Missing
    // values read as the shared empty-value dash.
    ['CPO No.', doc.cpoNo ? cpoNo(doc.cpoNo) : '—'],
    ['Source', SOURCE_LABELS[doc.source] || doc.source || '—'],
    ['Source Document', doc.sourceRef || '—'],
    ['Original Invoice Date', formatDate(doc.sourceDate)],
    ['Dispatch Date', formatDate(doc.dispatchDate)],
    ['Destination Reached Date', formatDate(doc.destinationReachedDate)],
    ['Due Date', formatDate(doc.dueDate)],
    ['Due Date Exceeded', <SalesStatusBadge key="dd" status={doc.dueDateExceeded ? 'Overdue' : 'Not Overdue'} />],
    ['Reason', doc.reason || '—'],
    ['Credit / Adjustment Amount', money(doc.refundAmount ?? 0)],
    ['Settlement Method', doc.settlementMethod || '—'],
    ['Return Qty', doc.returnQty ?? '—'],
    ['Inventory Impact', doc.inventoryImpact || '—']
  ],
  linkedDocs: (doc) => {
    const links = [];
    if (doc.sourceRef) links.push({ label: 'Source', value: doc.sourceRef });
    if (doc.convertedToPr) links.push({ label: 'Payment Receipt', value: doc.convertedToPr });
    return links;
  },
  headerActions: (doc, { runAction, navigate, toast }) => {
    const actions = [];
    const status = String(doc.status || '').toLowerCase();
    if (status === 'draft') {
      // Submit for Approval: moves the credit note into the existing pending
      // state ('pending approval' — the CN pending-approval count uses it).
      // Only shown for the current revision; calls the existing changeStatus
      // endpoint.
      actions.push({ key: 'submit', label: 'Submit for Approval', icon: Send, style: 'primary', action: () => runAction(() => creditNoteService.changeStatus(doc.id, 'pending approval'), `${doc.cnNo} submitted for approval`) });
    }
    if (status === 'draft' || status === 'pending approval') {
      actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2, style: 'approve', action: () => runAction(() => creditNoteService.postAction(doc.id, 'approve'), `${doc.cnNo} approved`) });
    }
    if (status === 'approved') {
      actions.push({ key: 'issue', label: 'Issue', icon: BadgeCheck, style: 'green', action: () => runAction(() => creditNoteService.postAction(doc.id, 'issue'), `${doc.cnNo} issued`) });
    }
    // Exact conversion chain: the ONLY downstream conversion for a Credit Note
    // is Convert to Payment Receipt (the end of the chain).
    if (status !== 'archived' && status !== 'deleted' && status !== 'cancelled') {
      actions.push({ key: 'convertPr', label: 'Convert to Payment Receipt', icon: Banknote, style: 'secondary', action: () => runConvert(creditNoteService, doc.id, 'convert-payment-receipt', `${doc.cnNo} converted to payment receipt`, navigate, toast) });
    }
    return actions;
  },
  printHtml: (doc) => buildSalesPrintHtml(doc, 'Credit Note', 'creditNote'),
  exportPdf: (doc) => exportSalesDocumentPdf(doc, 'Credit Note', 'creditNote', `${doc.cnNo || 'credit-note'}-${new Date().toISOString().slice(0, 10)}`)
};

// ===== Shared helper for row actions =====
// Calls the hook's mutation wrapper (which refreshes the list on success) and
// returns a promise the list page resolves into a toast. Conversion actions
// also carry the backend ConversionResult (target module + id + number) so the
// list page can navigate to the newly created document.
function runAction(hook, id, action, message) {
  return hook.postAction(id, action).then((res) =>
    res?.ok
      ? { ok: true, message: res?.data?.data?.message || message, result: res?.data?.data }
      : { ok: false, error: res?.error || { message: 'Action failed' } }
  );
}

// Backend ConversionResult.module -> target edit route builder. Used by both
// the list page (via runAction result) and the view page header actions.
// Routes point to the EDIT page so the user can review/modify before saving.
const CONVERT_VIEW_ROUTES = {
  quotation: (id) => `/quotations/${id}/view`,
  'sales-contract': (id) => `/sales-contracts/${id}`,
  'sales-order': (id) => `/sales-orders/${id}/edit`,
  'proforma-invoice': (id) => `/proforma-invoices/${id}`,
  'delivery-challan': (id) => `/delivery-challans/${id}`,
  invoice: (id) => `/invoices/${id}`,
  'credit-note': (id) => `/credit-notes/${id}`,
  'payment-receipt': (id) => `/payment-receipts/${id}`
};

export function convertRoute(result) {
  const builder = CONVERT_VIEW_ROUTES[result?.module];
  return builder && result?.id ? builder(result.id) : null;
}

// View-page conversion action: posts the conversion, toasts, then navigates to
// the newly created target document (ConversionResult carries module + id).
function runConvert(service, docId, action, message, navigate, toast) {
  return async () => {
    try {
      const res = await service.postAction(docId, action);
      const conv = res?.data;
      if (conv?.id) {
        toast.success(conv?.message || message);
        const route = convertRoute(conv);
        if (route) navigate(route);
        return res;
      }
      toast.error(res?.message || 'Conversion failed');
    } catch (err) {
      toast.error(err?.message || 'Conversion failed');
    }
    return undefined;
  };
}

function openPrint(html) {
  const win = window.open('', '_blank', 'width=1000,height=750');
  if (!win) return { ok: false, error: { message: 'Popup blocked. Please allow pop-ups to print.' } };
  win.document.open();
  win.document.write(html);
  win.document.close();
  return { ok: true, message: 'Print preview opened' };
}


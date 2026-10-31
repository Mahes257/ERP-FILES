/**
 * Shared view helpers for the Documents module.
 *
 * The Documents list (pages/Documents.jsx) and the standardized document
 * preview (pages/DocumentPreview.jsx) must agree on WHERE a stored document
 * opens and HOW its badges/file kind are presented, so both live here once
 * instead of being duplicated per page.
 *
 * Destinations per document:
 *   • Record route  — the business record that owns the document (View page).
 *   • Preview route — the module's dedicated design/preview workspace, when the
 *                     module owns one (Sales Execution, CPR, Workouts, ...).
 *   • Standard preview page — the Documents module's own document preview
 *                     (`/documents/:id/preview`), used for every module that
 *                     has no dedicated design workspace (CRM records) so
 *                     "View / Preview" always lands on a document preview.
 */
import { Briefcase, Globe, Lock, Package, Shield, Users } from 'lucide-react';

/**
 * Repository scope the Documents module is viewed with. The list, its KPI
 * strip and the preview page's document picker all pass the same value, so
 * they always describe the same Sales-only dataset.
 */
export const DOCUMENT_SCOPE = 'sales';

/**
 * Unwrap the ApiResponse envelope (`{ success, message, data }`) that the
 * document endpoints return, falling back to the raw payload for the calls
 * that already resolve to the entity. Both document pages need this, so it
 * lives here instead of being re-inlined per call site.
 */
export function payloadOf(result) {
  const data = result?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : result;
}

/* ─── Module → record View route ───
 *
 * One centralized mapping from the document's `module` metadata to the
 * EXISTING View page of the business record that owns the document. Keys are
 * canonicalized (lower-case, alphanumerics only) so legacy/mixed-case strings
 * already present in the repository ("salesContract", "Follow-up", "QC")
 * resolve to the same entry without duplicating routes.
 *
 * Only real routes declared in App.jsx are listed. A module with no record
 * View page must NOT be pointed at a list/report or an edit form — it is left
 * unmapped so the UI hides "Open Related Record" instead of opening the wrong
 * page.
 */
export const MODULE_RECORD_ROUTES = {
  lead: (id) => `/leads/${id}`,
  client: (id) => `/clients/${id}`,
  customer: (id) => `/clients/${id}`,
  followup: (id) => `/followups/${id}`,
  cpr: (id) => `/cprs/${id}`,
  cprtechnicalverification: (id) => `/cpr/technical-verification?id=${id}`,
  costworkout: (id) => `/cost-workouts/${id}`,
  profitworkout: (id) => `/profit-workouts/${id}`,
  quotation: (id) => `/quotations/${id}/view`,
  vendorquotation: (id) => `/quotations/${id}/view`,
  salescontract: (id) => `/sales-contracts/${id}`,
  customerpurchaseorder: (id) => `/sales-orders/${id}`,
  salesorder: (id) => `/sales-orders/${id}`,
  purchaseorder: (id) => `/sales-orders/${id}`,
  proformainvoice: (id) => `/proforma-invoices/${id}`,
  deliverychallan: (id) => `/delivery-challans/${id}`,
  invoice: (id) => `/invoices/${id}`,
  creditnote: (id) => `/credit-notes/${id}`,
  paymentreceipt: (id) => `/payment-receipts/${id}`,
  productionorder: (id) => `/production/orders/${id}`,
  workorder: (id) => `/production/orders/${id}`,
  model: (id) => `/production/models/${id}`,
  drawing: (id) => `/production/drawings/${id}`,
  qc: (id) => `/production/quality/${id}`,
  qualityinspection: (id) => `/production/quality/${id}`,
  packinglist: (id) => `/production/packing/${id}/preview`,
  technicalverification: (id) => `/production/technical-verification/${id}`,
  marketingvisit: (id) => `/marketing/visits?visitId=${id}`
};

/* ─── Module → design/preview workspace route ───
 *
 * Only modules that OWN a dedicated document design workspace are listed.
 *
 * CRM-owned document types (lead, client, follow-up) are deliberately absent:
 * their document is the stored generated file, which the Documents module's
 * own standardized preview page renders (`/documents/:id/preview`) — they have
 * no design workspace, so pointing them at a CRM record page would drop the
 * user out of the document-preview experience entirely.
 */
export const MODULE_PREVIEW_ROUTES = {
  costworkout: (id) => `/cost-workouts/design?id=${id}`,
  profitworkout: (id) => `/profit-workouts/design?id=${id}`,
  quotation: (id) => `/quotations/design?id=${id}`,
  vendorquotation: (id) => `/quotations/design?id=${id}`,
  salescontract: (id) => `/sales-contracts/design?id=${id}`,
  customerpurchaseorder: (id) => `/sales-orders/design?id=${id}`,
  salesorder: (id) => `/sales-orders/design?id=${id}`,
  purchaseorder: (id) => `/sales-orders/design?id=${id}`,
  proformainvoice: (id) => `/proforma-invoices/design?id=${id}`,
  deliverychallan: (id) => `/delivery-challans/design?id=${id}`,
  invoice: (id) => `/invoices/design?id=${id}`,
  creditnote: (id) => `/credit-notes/design?id=${id}`,
  paymentreceipt: (id) => `/payment-receipts/design?id=${id}`,
  cpr: (id) => `/cprs/design?id=${id}`,
  cprtechnicalverification: (id) => `/cpr/technical-verification?id=${id}`,
  packinglist: (id) => `/production/packing/${id}/preview`,
  productionorder: (id) => `/production/orders/${id}`,
  workorder: (id) => `/production/orders/${id}`,
  model: (id) => `/production/models/${id}`,
  drawing: (id) => `/production/drawings/${id}`,
  qc: (id) => `/production/quality/${id}`,
  qualityinspection: (id) => `/production/quality/${id}`,
  technicalverification: (id) => `/production/technical-verification/${id}`,
  marketingvisit: (id) => `/marketing/visits?visitId=${id}`
};

/* ─── Module → download route ───
 * Same as MODULE_PREVIEW_ROUTES but with ?pdf=1 to trigger auto-download
 * on Design pages that support it. */
export const MODULE_DOWNLOAD_ROUTES = {
  costworkout: (id) => `/cost-workouts/design?id=${id}&pdf=1`,
  profitworkout: (id) => `/profit-workouts/design?id=${id}&pdf=1`,
  quotation: (id) => `/quotations/design?id=${id}&pdf=1`,
  vendorquotation: (id) => `/quotations/design?id=${id}&pdf=1`,
  salescontract: (id) => `/sales-contracts/design?id=${id}&pdf=1`,
  customerpurchaseorder: (id) => `/sales-orders/design?id=${id}&pdf=1`,
  salesorder: (id) => `/sales-orders/design?id=${id}&pdf=1`,
  purchaseorder: (id) => `/sales-orders/design?id=${id}&pdf=1`,
  proformainvoice: (id) => `/proforma-invoices/design?id=${id}&pdf=1`,
  deliverychallan: (id) => `/delivery-challans/design?id=${id}&pdf=1`,
  invoice: (id) => `/invoices/design?id=${id}&pdf=1`,
  creditnote: (id) => `/credit-notes/design?id=${id}&pdf=1`,
  paymentreceipt: (id) => `/payment-receipts/design?id=${id}&pdf=1`,
  packinglist: (id) => `/production/packing/${id}/preview`
};

/**
 * Modules that only have a module-level page (reports, boards, trackers) and
 * no per-record View page. Used when the document carries no record id.
 */
export const MODULE_PAGE_ROUTES = {
  cprreport: () => '/cprs/reports',
  costworkoutreport: () => '/cost-workouts',
  profitworkoutreport: () => '/profit-workouts',
  quotationreport: () => '/quotations/report',
  contractreport: () => '/sales/reports',
  customerporeport: () => '/sales/reports',
  qcreport: () => '/production/quality',
  packingreport: () => '/production/packing',
  proformainvoicereport: () => '/sales/reports',
  deliverychallanreport: () => '/sales/reports',
  invoicereport: () => '/sales/reports',
  creditnotereport: () => '/sales/reports',
  paymentreceiptreport: () => '/sales/reports',
  salesperformancereport: () => '/sales/reports',
  revenuereport: () => '/sales/reports',
  outstandingpaymentreport: () => '/sales/reports',
  technicalverificationreport: () => '/cpr/technical-verification',
  marketingexpense: () => '/marketing/expenses',
  marketingtravelplan: () => '/marketing/travel-planners',
  marketingmap: () => '/marketing/map',
  qform: () => '/marketing/q-forms',
  marketingvisit: () => '/marketing/visits',
  productiontracker: () => '/sales-orders/production-tracker',
  qc: () => '/production/quality',
  packinglist: () => '/production/packing',
  dispatch: () => '/production/dispatch',
  drawing: () => '/production/drawings',
  model: () => '/production/models',
  workorder: () => '/production/orders',
  productionorder: () => '/production/orders',
  technicalverification: () => '/production/technical-verification',
  cprtechnicalverification: () => '/cpr/technical-verification'
};

/** Canonical lookup key for a module string: 'Sales Contract' === 'salesContract'. */
export function moduleKey(mod) {
  return String(mod || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Existing View route for the record that owns a document, or null when this
 * ERP has no matching page. The record route always wins; the page route is
 * only used for module-level documents such as reports.
 */
export function getModuleRoute(mod, recordId) {
  const key = moduleKey(mod);
  if (!key) return null;
  const id = Number(recordId);
  const hasRecordId = Number.isFinite(id) && id > 0;
  const recordFn = MODULE_RECORD_ROUTES[key];
  if (hasRecordId && recordFn) return recordFn(id);
  const pageFn = MODULE_PAGE_ROUTES[key];
  return pageFn ? pageFn() : null;
}

/**
 * The module's own design/preview workspace route, or null when the module has
 * none (CRM document types) or the document carries no usable record id.
 */
export function getModulePreviewRoute(mod, recordId) {
  const key = moduleKey(mod);
  if (!key) return null;
  const id = Number(recordId);
  if (!(Number.isFinite(id) && id > 0)) return null;
  const previewFn = MODULE_PREVIEW_ROUTES[key];
  return previewFn ? previewFn(id) : null;
}

/** True when the Actions menu can offer "Open Related Record" for this row. */
export function canOpenRelatedRecord(doc) {
  return Boolean(getModuleRoute(doc?.module, doc?.relatedRecordId));
}

/** True when the module itself owns a document design workspace. */
export function canPreviewViaSourceModule(doc) {
  return Boolean(getModulePreviewRoute(doc?.module, doc?.relatedRecordId));
}

/* ─── Presentation meta shared by the list and the preview page ─── */

/**
 * Visibility values supported by the Documents backend
 * (com.vishatech.erp.entity.DocumentVisibility) — single source of truth for
 * the badge in the listing AND in the preview page. Order matches the enum.
 */
export const VISIBILITY_META = {
  ADMIN_ONLY: { label: 'Admin Only', className: 'doc-badge doc-badge-red', icon: Shield },
  SALES_TEAM_ONLY: { label: 'Sales Team', className: 'doc-badge doc-badge-purple', icon: Users },
  ACCOUNTS_TEAM_ONLY: { label: 'Accounts Team', className: 'doc-badge doc-badge-cyan', icon: Briefcase },
  PURCHASE_TEAM_ONLY: { label: 'Purchase Team', className: 'doc-badge doc-badge-orange', icon: Package },
  TEAM_ONLY: { label: 'Team Only', className: 'doc-badge doc-badge-amber', icon: Lock },
  CUSTOMER: { label: 'Customer', className: 'doc-badge doc-badge-blue', icon: Globe },
  BOTH: { label: 'Both', className: 'doc-badge doc-badge-green', icon: Users }
};

export function getVisibilityBadge(visibility) {
  return VISIBILITY_META[visibility] || VISIBILITY_META.TEAM_ONLY;
}

/**
 * True while a repository row is in neither terminal state.
 *
 * This mirrors the backend's own active-row rule exactly
 * (`DocumentRepositoryEntryRepository.ACTIVE_FILTER`: status is neither
 * `deleted` — the trash — nor `archived`). The module-scoped listing that backs
 * Inside ERP already applies it in SQL, so an archived or trashed document
 * leaves that list by itself. The unscoped listing the Local Doc folder reads
 * deliberately returns the whole repository, so the page applies the same rule
 * to that set — otherwise a document deleted from Local Doc would keep showing
 * up there after its row had been moved to the trash.
 */
export function isActiveDocument(doc) {
  const status = String(doc?.status || '').toLowerCase();
  return status !== 'deleted' && status !== 'archived';
}

/** Lifecycle status chip (same wording/colours as the Documents table). */
export function getStatusBadge(status) {
  const config = {
    generated: { label: 'Generated', className: 'doc-badge doc-badge-green' },
    uploaded: { label: 'Uploaded', className: 'doc-badge doc-badge-blue' },
    pending: { label: 'Pending', className: 'doc-badge doc-badge-amber' },
    archived: { label: 'Archived', className: 'doc-badge doc-badge-gray' },
    deleted: { label: 'Deleted', className: 'doc-badge doc-badge-red' }
  };
  return config[status] || config.generated;
}

/**
 * How a stored file can be rendered in-page. PDFs and images render natively,
 * plain text is shown as text, and everything else (DOCX/XLSX/STEP/STL/...) has
 * no inline renderer, so it gets an explicit "preview unavailable" state while
 * Download keeps serving the real bytes.
 */
export function resolvePreviewKind(mimeType, fileName) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('text/')) return 'text';
  const ext = (String(fileName || '').match(/\.([A-Za-z0-9]{1,8})$/) || [])[1]?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['txt', 'csv', 'log', 'md', 'json', 'xml'].includes(ext)) return 'text';
  return 'unsupported';
}

/** The standardized Documents preview page for a stored document. */
export function documentPreviewRoute(doc) {
  return doc?.id ? `/documents/${doc.id}/preview` : null;
}

/**
 * Where "View / Preview" opens for a document:
 *
 *   module with a design workspace → that workspace (the reference experience)
 *   any other document type       → the Documents module's own preview page
 *
 * Never a record page and never an empty result: opening a document always
 * lands on a document preview.
 */
export function previewRouteFor(doc) {
  return getModulePreviewRoute(doc?.module, doc?.relatedRecordId) || documentPreviewRoute(doc);
}

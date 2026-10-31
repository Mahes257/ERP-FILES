/**
 * versionDiff.js — the ONE comparison layer behind Sales version history.
 * ------------------------------------------------------------------------
 * Every Sales document (Quotation, Sales Contract, Customer Purchase Order,
 * Proforma Invoice, Delivery Challan, Invoice, Credit Note, Payment Receipt)
 * keeps its history as a chain of IMMUTABLE revision rows: an edit never
 * overwrites a version, it copies the current row into a new one and appends
 * `(N)` to the document number (see RevisionSupport / DocRevisionCell).
 *
 * That means the snapshots already exist and are already served by the module
 * detail endpoint — `GET /{module}/{id}` returns the exact stored data of THAT
 * revision, `revisions` lists the whole chain. Nothing has to be reconstructed,
 * so this module owns no persistence and no API: it is a pure function over the
 * two snapshots the view pages already fetch.
 *
 * It answers the only question a reader of a revision has: what changed
 * between the selected version and the version immediately before it?
 *
 *   · fields      → added / modified / removed, with the previous and the
 *                   selected value
 *   · line items  → added / removed / modified rows
 *
 * Two rules keep the output honest:
 *
 *   1. REVISION METADATA IS NOT A CHANGE. Creating a revision necessarily
 *      changes the document number, the revision number, its date and the
 *      chain pointers, and the read model recomputes derived columns (item
 *      count, total qty, the linked CPO's status …) on every request. Showing
 *      those would bury the one real edit under a list of artifacts, so they
 *      are excluded (see DEFAULT_IGNORED_FIELDS). They stay visible in the
 *      document header and in the revision chain itself.
 *
 *   2. NOTHING IS INVENTED. A value that is absent on one side is reported as
 *      added or removed rather than guessed, empty and null compare equal, and
 *      numbers compare by value (0 == 0.00) so a scale difference is never
 *      reported as a change.
 *
 * Comparison is by no means a substitute for the stored history: the
 * field-level `edit_history` timeline (EditHistoryTimeline) remains the audit
 * record of WHO made each edit.
 */

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

/**
 * Field name → the label the reader sees. These are the labels the Sales view
 * pages and the document PDFs already use, so a change indicator sits next to a
 * field the user recognises; anything not listed falls back to the field name
 * split into words, so a new column never renders as a raw identifier.
 */
export const DOC_FIELD_LABELS = {
  documentNo: 'Document No',
  quotationNo: 'Quotation No',
  cwNo: 'Cost Workout No',
  pwNo: 'Profit Workout No',
  scNo: 'Sales Contract No',
  soNo: 'CPO No',
  piNo: 'Proforma Invoice No',
  dcNo: 'Delivery Challan No',
  invoiceNo: 'Invoice No',
  cnNo: 'Credit Note No',
  receiptNo: 'Payment Receipt No',
  quotationDate: 'Quotation Date',
  contractDate: 'Contract Date',
  orderDate: 'Order Date',
  piDate: 'Proforma Date',
  dcDate: 'Delivery Challan Date',
  invoiceDate: 'Invoice Date',
  cnDate: 'Credit Note Date',
  receiptDate: 'Receipt Date',
  validUntil: 'Valid Till',
  validity: 'Validity',
  dueDate: 'Due Date',
  paymentDueDate: 'Payment Due Date',
  destinationReachedDate: 'Destination Reached Date',
  sourceDate: 'Source Date',
  deliveryDate: 'Delivery Date',
  dispatchedThrough: 'Dispatched Through',
  clientName: 'Client',
  client: 'Client',
  clientId: 'Client',
  contactPerson: 'Contact Person',
  email: 'Email',
  phone: 'Phone',
  gstin: 'GSTIN',
  pan: 'PAN',
  address: 'Address',
  city: 'City',
  state: 'State',
  pin: 'PIN',
  country: 'Country',
  billingAddress: 'Billing Address',
  billingCity: 'Billing City',
  billingState: 'Billing State',
  billingPin: 'Billing PIN',
  shippingAddress: 'Shipping Address',
  shippingCity: 'Shipping City',
  shippingState: 'Shipping State',
  shippingPin: 'Shipping PIN',
  shipSameAsBill: 'Ship to Same as Billing',
  fromCompany: 'From Company',
  fromName: 'From Name',
  salesPerson: 'Sales Person',
  status: 'Status',
  reason: 'Reason',
  reasonDetail: 'Reason Detail',
  source: 'Source',
  sourceRef: 'Source Reference',
  settlementMethod: 'Settlement Method',
  inventoryImpact: 'Inventory Impact',
  taxType: 'Tax Type',
  currency: 'Currency',
  exchangeRate: 'Exchange Rate',
  baseCurrency: 'Base Currency',
  numberFormat: 'Number Format',
  paymentTerms: 'Payment Terms',
  terms: 'Terms & Conditions',
  remarks: 'Remarks',
  referencePrNo: 'Reference PR No',
  reference: 'Reference',
  referencePrSource: 'Reference PR Source',
  leadNo: 'Lead No',
  // CRM record fields (Lead / Client / Follow-up) — the snapshots stored in
  // `record_revisions` use the entity's own attribute names.
  name: 'Name',
  businessName: 'Business Name',
  clientCode: 'Client Code',
  alias: 'Alias',
  clientType: 'Client Type',
  businessType: 'Business Type',
  industry: 'Industry',
  taxId: 'Tax ID',
  title: 'Title',
  website: 'Website',
  secondaryName: 'Secondary Contact',
  secondaryEmail: 'Secondary Email',
  secondaryPhone: 'Secondary Phone',
  secondaryDesignation: 'Secondary Designation',
  internalNotes: 'Internal Notes',
  creditLimit: 'Credit Limit',
  openingBalance: 'Opening Balance',
  mapNo: 'Map No',
  category: 'Category',
  stage: 'Stage',
  leadStage: 'Lead Stage',
  owner: 'Owner',
  assignedTo: 'Assigned To',
  assignTo: 'Assigned To',
  executive: 'Executive',
  value: 'Expected Value',
  expectedValue: 'Expected Value',
  followupDate: 'Follow-up Date',
  nextFollowupDate: 'Next Follow-up Date',
  lastFollowUpDate: 'Last Follow-up Date',
  outcome: 'Outcome',
  discussionSummary: 'Discussion Summary',
  currentStatus: 'Current Status',
  mode: 'Mode',
  time: 'Time',
  pincode: 'Pincode',
  cprNo: 'CPR No',
  prNo: 'CPR No',
  prDate: 'PR Date',
  department: 'Department',
  requestedBy: 'Requested By',
  requiredDate: 'Required Date',
  quotationDeadline: 'Quotation Deadline',
  extendedDeadline: 'Extended Deadline',
  priority: 'Priority',
  project: 'Project',
  currentStage: 'Current Stage',
  approvalStatus: 'Approval Status',
  sourceLead: 'Source Lead',
  costWorkout: 'Cost Workout',
  profitPercent: 'Profit %',
  convertedToQtn: 'Converted Quotation',
  gst: 'GST',
  vendor: 'Vendor',
  company: 'Company',
  itemColumns: 'Item Column Configuration',
  sourceCpr: 'CPR',
  sourceCw: 'Cost Workout',
  releaseMethod: 'Release Method',
  subTotal: 'Sub Total',
  discount: 'Discount',
  discountPct: 'Discount %',
  cgstTotal: 'CGST Total',
  sgstTotal: 'SGST Total',
  taxTotal: 'Tax Total',
  charges: 'Charges',
  freight: 'Freight',
  insurance: 'Insurance',
  roundOff: 'Round Off',
  grandTotal: 'Grand Total',
  receivedAmount: 'Received Amount',
  balanceAmount: 'Balance Amount',
  paymentMethod: 'Payment Method',
  paymentMode: 'Payment Mode',
  referenceNo: 'Reference No',
  chequeNo: 'Cheque / UTR No',
  bankName: 'Bank Name',
  signatureType: 'Signature Type',
  signatureLabel: 'Signature Label',
  hsnView: 'HSN View',
  displayUnit: 'Display UOM',
  taxSummary: 'Tax Summary',
  hidePlace: 'Hide Place of Supply',
  hsnSummary: 'HSN Summary',
  descFull: 'Full Description',
  hideSubtotal: 'Hide Subtotal',
  showSku: 'Show Item Code',
  serial: 'Serial No',
  batch: 'Batch',
  additionalInfo: 'Additional Information',
  contactEmail: 'Contact Email',
  contactPhone: 'Contact Phone',
  convertedToSo: 'Converted → Customer Purchase Order',
  convertedToPi: 'Converted → Proforma Invoice',
  convertedToSc: 'Converted → Sales Contract',
  convertedToDc: 'Converted → Delivery Challan',
  convertedToInvoice: 'Converted → Invoice',
  convertedToCn: 'Converted → Credit Note',
  convertedToPr: 'Converted → Payment Receipt',
  customFields: 'Custom Field',
  // E-Action / Participation fields (record snapshots use the entity names).
  participantTeam: 'Participant / Team',
  assignedAction: 'Assigned Action',
  cpoReference: 'CPO Reference',
  cpoNo: 'Customer Purchase Order',
  requestedOn: 'Requested On',
  startedOn: 'Started On',
  completedOn: 'Completed On',
  result: 'Result',
  customFieldsJson: 'Custom Fields'
};

/** Item field name → label, reusing the grid's own column wording where it has one. */
export const ITEM_FIELD_LABELS = {
  description: 'Description',
  uom: 'UOM',
  qty: 'Qty',
  rate: 'Rate',
  discountPct: 'Discount %',
  discountAmount: 'Discount Amount',
  gstRate: 'GST %',
  taxPct: 'Tax %',
  grossAmount: 'Gross Amount',
  netAmount: 'Net Amount',
  taxable: 'Taxable Amount',
  cgst: 'CGST',
  sgst: 'SGST',
  igst: 'IGST',
  total: 'Total',
  amount: 'Amount',
  hsnCode: 'HSN',
  hsn: 'HSN',
  itemCode: 'Item Code',
  sku: 'Item Code',
  drawingNo: 'Drawing No',
  material: 'Material',
  manufacturer: 'Manufacturer',
  countryOfOrigin: 'Country of Origin',
  marksNos: 'Marks & Nos / Container No',
  noKindPkgs: 'No. & Kind of Pkgs',
  netWeight: 'Net Weight (KGS)',
  grossWeight: 'Gross Weight (KGS)',
  leadTime: 'Lead Time',
  serialNo: 'Serial No',
  batchNo: 'Batch No'
};

/* ------------------------------------------------------------------ *
 * Ignore policy
 * ------------------------------------------------------------------ */

/**
 * Fields that are never reported as a version change.
 *
 *  · revision plumbing — id / revision / revisionOf / revisionDate /
 *    latestRevision: set BY the act of creating the revision, identical for
 *    every revision and already shown in the chain table.
 *  · audit stamps — createdAt / updatedAt / archivedAt / deletedAt /
 *    restoredAt / createdBy: when and by whom, not what.
 *  · nested collections — items / attachments / timeline / history /
 *    revisions / followUps: line items are compared separately and row by row,
 *    the rest are records ABOUT the document rather than document content.
 *  · derived columns — itemsCount / totalQty / date / versionNumber and the
 *    linked-CPO and follow-up columns: resolved on read from other tables, so
 *    they can differ between two requests for the SAME revision. Comparing
 *    them would report a change the user never made.
 */
export const DEFAULT_IGNORED_FIELDS = new Set([
  // revision plumbing
  'id',
  'revision',
  'revisionOf',
  'revisionDate',
  'latestRevision',
  // The document number is the revision marker: `update()` always rebuilds it
  // as `BASE(N)` from the chain, so it differs on every revision by
  // construction and can never be hand-edited into a meaningful change. It is
  // shown in the header and in the chain table instead.
  'documentNo',
  'number',
  'quotationNo',
  'scNo',
  'soNo',
  'piNo',
  'dcNo',
  'invoiceNo',
  'cnNo',
  'receiptNo',
  'cwNo',
  'pwNo',
  // audit stamps
  'version',
  'createdAt',
  'updatedAt',
  'archivedAt',
  'deletedAt',
  'restoredAt',
  'createdBy',
  'updatedBy',
  // nested collections (items are compared separately)
  'items',
  'attachments',
  'timeline',
  'history',
  'revisions',
  'followUps',
  'descriptionRows',
  // derived / resolved columns
  'date',
  'itemsCount',
  'totalQty',
  'versionNumber',
  'latestVersion',
  'poStatus',
  'poRawStatus',
  'poNo',
  'poId',
  'followUpStatus',
  'followUpDate',
  'followUpCount'
]);

/** Item fields that are row identity/plumbing, not content. */
export const ITEM_IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'descriptionRows']);

/* ------------------------------------------------------------------ *
 * Value handling
 * ------------------------------------------------------------------ */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?/;

function isEmptyValue(value) {
  return value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '');
}

function looksNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed);
}

/**
 * True when two snapshot values are the SAME business value.
 *
 * Numbers compare by value (0 == 0.00 == "0", 1.50 == "1.5"), booleans by
 * their text form, everything else by trimmed text ignoring case (an enum is
 * stored as `NEW` in a snapshot but rendered `New` by a read model — the same
 * business value); empty/null/undefined all mean "no value" and compare equal.
 * This is what stops a BigDecimal scale or a null-vs-empty-string difference
 * from being reported as an edit.
 */
export function sameValue(a, b) {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (isEmptyValue(a) || isEmptyValue(b)) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  if (looksNumeric(a) && looksNumeric(b)) return Number(a) === Number(b);
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Human-readable form of a snapshot value for the comparison UI. */
export function displayValue(value) {
  if (isEmptyValue(value)) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }
  const text = String(value).trim();
  if (looksNumeric(text) && /^-?\d+\.\d+$/.test(text)) return String(Number(text));
  if (ISO_DATE_RE.test(text)) {
    const iso = text.replace(' ', 'T');
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      return text.length <= 10
        ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }
  return text;
}

/**
 * Additional wordings the SAME field wears on a different surface.
 *
 * The comparison panel always prints the canonical label; these aliases exist
 * so a changed field can also be tied to the row a particular view page
 * renders. Only exact (normalised) matches are honoured, so an alias can never
 * tint a row that did not actually change.
 */
export const DOC_FIELD_ALIASES = {
  clientName: ['Client Name'],
  client: ['Client Name'],
  pin: ['Pincode'],
  billingPin: ['Billing Pincode'],
  validUntil: ['Price Validity'],
  validity: ['Valid Till'],
  deliveryTerms: ['Lead Time'],
  sourceCpr: ['CPR No', 'CPR'],
  sourceCw: ['Cost Workout'],
  leadNo: ['Lead No'],
  subTotal: ['Total (Before Tax)', 'Subtotal'],
  cgstTotal: ['CGST'],
  sgstTotal: ['SGST'],
  taxTotal: ['IGST', 'Tax Total'],
  charges: ['Freight / Charges', 'Freight & Charges'],
  referencePrNo: ['Reference PR No'],
  destinationReachedDate: ['Destination Reached'],
  receivedAmount: ['Amount Received'],
  balanceAmount: ['Balance Due'],
  chequeNo: ['Cheque No', 'UTR No'],
  paymentMethod: ['Mode of Payment'],
  remarks: ['Internal Remarks'],
  deliveryDate: ['Expected Delivery Date'],
  orderDate: ['CPO Date'],
  cnDate: ['Credit Note Date'],
  invoiceDate: ['Invoice Date'],
  receiptDate: ['Receipt Date'],
  piDate: ['Proforma Date'],
  dcDate: ['Challan Date'],
  scNo: ['Contract No'],
  soNo: ['Customer Purchase Order No'],
  quoteTerms: ['Terms']
};

/** Every label a field answers to — canonical first. */
export function fieldLabelAliases(field, { item = false } = {}) {
  const primary = fieldLabel(field, { item });
  if (item || String(field).includes('.')) return [primary];
  const extra = DOC_FIELD_ALIASES[field] || [];
  return [primary, ...extra];
}

/** `referencePrNo` → `Reference Pr No` (only used when no label is mapped). */
function fallbackLabel(field) {
  return String(field)
    .replace(/\./g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Label for a field. Nested keys (`customFields.batchNo`) keep the parent label
 * in front so the reader knows where the value lives.
 */
export function fieldLabel(field, { item = false } = {}) {
  const path = String(field).split('.');
  const table = item ? ITEM_FIELD_LABELS : DOC_FIELD_LABELS;
  const labels = path.map((part, index) => {
    if (index > 0) return table[part] || fallbackLabel(part);
    return table[part] || fallbackLabel(part);
  });
  return labels.join(' · ');
}

/**
 * Label → lookup key. Labels are matched ignoring case, spaces and punctuation
 * so a field label can be tied to the row the view page renders even when the
 * two word themselves slightly differently ("Reference PR No" vs
 * "Reference Pr No").
 */
export function labelKey(label) {
  return String(label == null ? '' : label)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/* ------------------------------------------------------------------ *
 * Flattening
 * ------------------------------------------------------------------ */

function isPlainObject(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.getPrototypeOf(value) !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Flattens a snapshot object into `path → value` pairs.
 *
 * Nested plain objects (a document's `customFields`, an item's
 * `customFields`/dimensions) are addressed by their full path so a change to
 * one nested key is reported as that key — "Custom Fields · Batch No" — instead
 * of an opaque "Custom Fields changed". Arrays and other objects are kept as a
 * single value and compared as a whole.
 */
export function flattenSnapshot(source, { ignored = new Set(), prefix = '' } = {}) {
  const out = new Map();
  if (!source || typeof source !== 'object') return out;
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!prefix && ignored.has(key)) continue;
    if (isPlainObject(value)) {
      const nested = flattenSnapshot(value, { ignored, prefix: path });
      // An empty nested object carries no value of its own.
      nested.forEach((v, k) => out.set(k, v));
      continue;
    }
    out.set(path, value);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Field comparison
 * ------------------------------------------------------------------ */

/**
 * Field-level differences between two snapshots, most meaningful first.
 *
 * `added`    — the value exists in the selected version only
 * `removed`  — the value existed in the previous version only
 * `modified` — both hold a value and they differ
 */
export function diffFields(previous, selected, { ignored = DEFAULT_IGNORED_FIELDS, item = false } = {}) {
  const before = flattenSnapshot(previous, { ignored });
  const after = flattenSnapshot(selected, { ignored });
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes = [];
  keys.forEach((key) => {
    const oldValue = before.get(key);
    const newValue = after.get(key);
    if (sameValue(oldValue, newValue)) return;
    const oldEmpty = isEmptyValue(oldValue);
    const newEmpty = isEmptyValue(newValue);
    changes.push({
      field: key,
      label: fieldLabel(key, { item }),
      type: oldEmpty ? 'added' : newEmpty ? 'removed' : 'modified',
      previousValue: displayValue(oldValue),
      selectedValue: displayValue(newValue)
    });
  });
  return dedupeChanges(changes).sort(
    (a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label)
  );
}

/**
 * Collapses changes that are the same change under two names.
 *
 * The Sales read model mirrors a few values on purpose — the document view's
 * normalizer carries `client` alongside `clientName`, for instance — so one
 * business edit would otherwise be listed twice. Two changes are the same only
 * when the label AND the type AND both values match, so a genuine second change
 * to another field is never swallowed.
 */
function dedupeChanges(changes) {
  const seen = new Set();
  const out = [];
  changes.forEach((change) => {
    const signature = [change.label, change.type, change.previousValue, change.selectedValue].join('\u001f');
    if (seen.has(signature)) return;
    seen.add(signature);
    out.push(change);
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * Line-item comparison
 * ------------------------------------------------------------------ */

/**
 * Identity of a line item across revisions.
 *
 * A revision copies the item rows into new rows, so their database ids differ
 * between versions and cannot be used to pair them. The business identity is
 * used instead — item code, then SKU, then description — and rows that share an
 * identity are paired in order. An identity that appears only on one side is
 * reported as added or removed, never silently matched to an unrelated row.
 */
export function itemIdentity(item) {
  if (!item || typeof item !== 'object') return '';
  const raw = item.itemCode ?? item.sku ?? item.code ?? item.description ?? item.name ?? item.product;
  return String(raw ?? '').trim().toLowerCase();
}

function itemLabel(item) {
  const name = item?.description ?? item?.name ?? item?.product ?? item?.itemCode ?? item?.sku;
  return String(name ?? '').trim() || 'Line item';
}

function groupByIdentity(items) {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const key = itemIdentity(item) || `#${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

/**
 * Line-item differences between two revisions.
 *
 * `added`    — a row present in the selected version but not the previous one
 * `removed`  — a row present in the previous version but not the selected one
 * `modified` — the same row on both sides whose fields changed
 */
export function diffItems(previousItems, selectedItems, { ignored = ITEM_IGNORED_FIELDS } = {}) {
  const before = groupByIdentity(previousItems);
  const after = groupByIdentity(selectedItems);
  const added = [];
  const removed = [];
  const modified = [];

  after.forEach((selectedRows, key) => {
    const previousRows = before.get(key) || [];
    selectedRows.forEach((selectedRow, index) => {
      const previousRow = previousRows[index];
      if (!previousRow) {
        added.push({ key, label: itemLabel(selectedRow), item: selectedRow });
        return;
      }
      const changes = diffFields(previousRow, selectedRow, { ignored, item: true });
      if (changes.length > 0) {
        modified.push({ key, label: itemLabel(selectedRow), changes });
      }
    });
  });

  before.forEach((previousRows, key) => {
    const selectedRows = after.get(key) || [];
    previousRows.forEach((previousRow, index) => {
      if (selectedRows[index]) return;
      removed.push({ key, label: itemLabel(previousRow), item: previousRow });
    });
  });

  return {
    added,
    removed,
    modified,
    previousCount: Array.isArray(previousItems) ? previousItems.length : 0,
    selectedCount: Array.isArray(selectedItems) ? selectedItems.length : 0
  };
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

/**
 * Compares two immutable revision snapshots.
 *
 * @param {object} previous the immediately preceding saved version
 * @param {object} selected the version being viewed
 */
export function compareRevisionSnapshots(previous, selected, options = {}) {
  const fields = diffFields(previous, selected, options);
  const items = diffItems(previous?.items, selected?.items, options);
  return {
    fields,
    items,
    fieldCount: fields.length,
    itemCount: items.added.length + items.removed.length + items.modified.length,
    hasChanges: fields.length > 0 || items.added.length + items.removed.length + items.modified.length > 0
  };
}

/**
 * Label → change lookup for tinting the document's own rows.
 *
 * Only exact (normalised) label matches come back, so a row is tinted strictly
 * when its own field is one of the changed fields; an unmatched change still
 * appears in the comparison panel, it just is not pinned to a row.
 */
export function changeByLabel(comparison) {
  const fields = comparison?.fields || [];
  const map = new Map();
  // Canonical labels first, so a field's own label can never be shadowed by
  // another field's alias.
  fields.forEach((change) => {
    const key = labelKey(change.label);
    if (key && !map.has(key)) map.set(key, change);
  });
  fields.forEach((change) => {
    fieldLabelAliases(change.field).slice(1).forEach((label) => {
      const key = labelKey(label);
      if (key && !map.has(key)) map.set(key, change);
    });
  });
  return map;
}

/** How many changes a single revision introduced (for the chain table). */
export function changeCount(comparison) {
  if (!comparison) return 0;
  return (comparison.fieldCount || 0) + (comparison.itemCount || 0);
}

/* ------------------------------------------------------------------ *
 * Revision chain helpers
 * ------------------------------------------------------------------ */

/**
 * The chain oldest → newest. The backend already returns it in that order, but
 * sorting here keeps the predecessor lookup correct for any caller that built
 * the list itself.
 */
export function sortRevisionChain(revisions) {
  return [...(Array.isArray(revisions) ? revisions : [])].sort(
    (a, b) => (Number(a?.revision) || 0) - (Number(b?.revision) || 0)
  );
}

/**
 * Strips a trailing `(N)` revision suffix to recover the chain's base document
 * number — mirrors the backend `RevisionSupport.baseNumber()`, so a chain row
 * that carries no `number` can still be labelled against its base.
 */
export function baseNumber(number) {
  const text = String(number == null ? '' : number);
  const open = text.lastIndexOf('(');
  if (open > 0 && text.endsWith(')')) {
    const inner = text.slice(open + 1, -1);
    if (/^\d+$/.test(inner)) return text.slice(0, open);
  }
  return text;
}

/** The chain entry the given record id belongs to, or null. */
export function chainEntryFor(revisions, id) {
  if (id == null) return null;
  const target = String(id);
  return sortRevisionChain(revisions).find((rev) => String(rev?.id) === target) || null;
}

/** The latest (current) entry of the chain, or null. */
export function currentChainEntry(revisions) {
  const chain = sortRevisionChain(revisions);
  return chain.find((rev) => rev?.latestRevision) || chain[chain.length - 1] || null;
}

/**
 * The immediately preceding SAVED version of `id` — the revision one number
 * lower, or null when `id` is the original document (there is nothing before
 * the original). A gap in the chain returns whatever precedes it, so a chain
 * that lost a row still compares against real saved data instead of guessing.
 */
export function previousChainEntry(revisions, id) {
  const chain = sortRevisionChain(revisions);
  const index = chain.findIndex((rev) => String(rev?.id) === String(id));
  if (index <= 0) return null;
  return chain[index - 1];
}

/**
 * The direction of the comparison, e.g. `Revision 2 compared with Revision 1`.
 * Returns null when there is nothing to compare against (the Original version),
 * which is the caller's cue to show an explicit "nothing precedes this
 * version" message instead of an empty difference list.
 */
export function comparisonDirection(selectedRevision, previousRevision) {
  if (!previousRevision) return null;
  const versionLabel = (rev) => {
    const number = Number(rev?.revision) || 0;
    return number === 0 ? 'Original' : `Revision ${number}`;
  };
  return `${versionLabel(selectedRevision)} compared with ${versionLabel(previousRevision)}`;
}

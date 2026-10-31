import api from '../api/axiosInstance';
import { MAX_ATTACHMENT_SIZE } from './attachmentStorage';

/**
 * bulkUpload.js
 *
 * Shared engine for the "Bulk Upload" flow behind every module's New ▼ menu.
 *
 * Flow (per module):
 *   1. User picks one or more business documents (.csv / .xlsx / .xls / .pdf).
 *   2. Tabular files are parsed into rows (xlsx) and each row is mapped to the
 *      module's creation-form fields via a synonym table. PDFs are scanned with
 *      a best-effort text extractor ("Invoice No: 123" → invoiceNo, ...).
 *   3. Records are deduped against each other and (best-effort) against
 *      existing records via the module's list endpoint.
 *   4. The queue is stored in sessionStorage; the module's creation page picks
 *      it up, pre-fills the existing form, and the user reviews/corrects it and
 *      clicks the EXISTING Save button. Nothing is ever saved automatically.
 *
 * Sales Contracts are the exception: extraction runs on the backend
 * (POST /sales-contracts/bulk/extract — PDFBox/POI) so uploaded contracts are
 * parsed server-side and ONLY customer name, contract number, contract date
 * and validity are returned. Everything after extraction (review → confirm →
 * existing Save button) stays the same.
 *
 * That endpoint is asynchronous, because parsing a batch of documents is real
 * work: it answers 202 Accepted with a jobId and the parsing runs on a bounded
 * background worker instead of holding an HTTP request open. This module polls
 * GET /sales-contracts/bulk/extract/{jobId} until the job reports COMPLETED
 * (results) or FAILED (a safe reason), so the caller still receives exactly the
 * same list of extraction results it always did.
 */

// ---------------------------------------------------------------------------
// Background extraction job polling
// ---------------------------------------------------------------------------

/**
 * Wait for a bulk-extraction job to finish and return its results.
 *
 * The server parses the batch on a background worker (see the module header) and
 * reports QUEUED / PROCESSING while it runs. Polling starts as soon as the 202
 * arrives, so a fast batch is usually collected on the first attempt.
 *
 * @param {number|string} jobId job returned by the upload
 * @returns {Promise<Array>} the same extraction-result list the synchronous
 *   endpoint used to return
 */
async function pollExtractionJob(jobId, { intervalMs = 1200, timeoutMs = 180000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await api.get(`/sales-contracts/bulk/extract/${jobId}`);
    const job = res?.data?.data || {};
    if (job.status === 'COMPLETED') {
      if (!Array.isArray(job.results)) {
        // Never report "nothing found" for a job that produced no usable result.
        throw new Error('Extraction finished without results — please try again.');
      }
      return job.results;
    }
    if (job.status === 'FAILED') {
      throw new Error(job.error || 'Extraction failed on the server');
    }
    if (Date.now() >= deadline) {
      throw new Error('Extraction is taking longer than expected — try again in a moment.');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ---------------------------------------------------------------------------
// Field-synonym matching helpers
// ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function field(key, label, match) {
  return { key, label, match: match.map(norm) };
}

function matchField(fields, header) {
  const h = norm(header);
  if (!h) return null;
  return fields.find((f) => f.match.includes(h)) || null;
}

// Document keywords used to detect which ERP module a document belongs to.
const MODULE_KEYWORDS = [
  { key: 'creditNote', words: ['credit note', 'credit-note', 'creditnote'] },
  { key: 'paymentReceipt', words: ['payment receipt', 'payment-receipt', 'paymentreceipt', 'receipt no'] },
  { key: 'deliveryChallan', words: ['delivery challan', 'delivery-challan', 'deliverychallan', 'challan'] },
  { key: 'proformaInvoice', words: ['proforma invoice', 'proforma-invoice', 'proforma', 'pro-forma'] },
  { key: 'invoice', words: ['invoice', 'tax invoice', 'bill of supply'] },
  { key: 'salesOrder', words: ['sales order', 'sales-order', 'salesorder', 'order no', 'purchase order'] },
  { key: 'salesContract', words: ['sales contract', 'sales-contract', 'contract no', 'agreement'] },
  { key: 'quotation', words: ['quotation', 'quote', 'quotation no', 'estimate'] },
  { key: 'costworkout', words: ['cost workout', 'cost-workout', 'cost sheet'] },
  { key: 'profitworkout', words: ['profit workout', 'profit-workout'] },
  { key: 'cpr', words: ['purchase request', 'pr no', 'customer purchase request'] },
  { key: 'lead', words: ['lead', 'prospect'] }
];

// ---------------------------------------------------------------------------
// Per-module field maps
// ---------------------------------------------------------------------------

const LEAD_FIELDS = [
      field('businessName', 'Business / Company Name', ['business name', 'company name', 'company', 'name', 'customer', 'customer name', 'organization', 'organisation', 'party', 'bill to']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'contact number', 'phone no', 'phone number']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('industry', 'Industry', ['industry', 'sector', 'vertical', 'business type']),
      field('website', 'Website', ['website', 'web', 'url', 'web site']),
      field('leadSource', 'Lead Source', ['lead source', 'source', 'source name', 'enquiry source']),
      field('expectedValue', 'Expected Value', ['expected value', 'expected value inr', 'value', 'amount', 'estimated value', 'deal value']),
      field('country', 'Country', ['country']),
      field('state', 'State', ['state', 'province', 'region']),
      field('city', 'City', ['city', 'town']),
      field('pincode', 'Pincode', ['pincode', 'pin code', 'pin', 'postal code', 'zip', 'zipcode']),
      field('address', 'Address', ['address', 'street', 'street address', 'address line', 'street address line']),
      field('designation', 'Designation', ['designation', 'title', 'job title', 'role']),
      field('owner', 'Lead Owner', ['owner', 'assigned to', 'assignedto', 'sales person', 'salesperson', 'executive', 'lead owner']),
      field('notes', 'Notes', ['notes', 'remarks', 'comment', 'comments', 'note']),
      field('internalNotes', 'Internal Notes', ['internal notes', 'internal note', 'private notes'])
];

const CRM = {
  lead: {
    title: 'Lead',
    createRoute: '/leads/new',
    dedupeKeys: ['email', 'phone'],
    fields: LEAD_FIELDS
  },
  client: {
    title: 'Client',
    createRoute: '/clients/new',
    dedupeKeys: ['email', 'phone'],
    fields: [
      field('businessName', 'Business Name', ['business name', 'company name', 'company', 'name', 'customer', 'customer name', 'client name', 'party', 'bill to']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'contact number', 'phone no', 'phone number']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('industry', 'Industry', ['industry', 'sector', 'vertical']),
      field('website', 'Website', ['website', 'web', 'url']),
      field('gstin', 'GSTIN', ['gstin', 'gst', 'gst no', 'gst number', 'gstin no']),
      field('pan', 'PAN', ['pan', 'pan no', 'pan number', 'income tax pan']),
      field('clientType', 'Client Type', ['client type', 'type', 'customer type', 'segment']),
      field('taxTreatment', 'Tax Treatment', ['tax treatment', 'tax type', 'taxation type']),
      field('country', 'Country', ['country']),
      field('state', 'State', ['state', 'province', 'region']),
      field('city', 'City', ['city', 'town']),
      field('postalCode', 'Postal Code', ['postal code', 'pincode', 'pin code', 'pin', 'zip', 'zipcode']),
      field('streetAddress', 'Street Address', ['street address', 'address', 'street', 'address line', 'billing address']),
      field('salesPerson', 'Sales Person', ['sales person', 'salesperson', 'owner', 'executive', 'assigned to']),
      field('category', 'Category', ['category', 'client category', 'group']),
      field('status', 'Status', ['status']),
      field('currency', 'Currency', ['currency']),
      field('paymentTerms', 'Payment Terms', ['payment terms', 'terms', 'credit terms']),
      field('creditLimit', 'Credit Limit', ['credit limit', 'credit', 'limit']),
      field('notes', 'Notes', ['notes', 'remarks', 'comment', 'comments', 'note'])
    ]
  },
  followup: {
    title: 'Follow-up',
    createRoute: '/followups/new',
    dedupeKeys: ['email', 'phone'],
    fields: [
      field('customer', 'Customer / Company', ['customer', 'company', 'company name', 'business name', 'client', 'name', 'party']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'contact number', 'phone no', 'phone number']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('source', 'Source', ['source', 'lead source', 'enquiry source']),
      field('industry', 'Industry', ['industry', 'sector', 'vertical']),
      field('executive', 'Executive', ['executive', 'owner', 'sales person', 'salesperson', 'assigned to', 'lead owner']),
      field('address', 'Address', ['address', 'street address', 'street']),
      field('mode', 'Mode', ['mode', 'follow up mode', 'followup mode']),
      field('followupDate', 'Follow-up Date', ['follow up date', 'followup date', 'date', 'due date', 'next date']),
      field('priority', 'Priority', ['priority']),
      field('currentStatus', 'Status', ['status', 'current status']),
      field('outcome', 'Outcome', ['outcome']),
      field('discussionSummary', 'Discussion Summary', ['discussion summary', 'summary', 'discussion', 'details']),
      field('customerFeedback', 'Customer Feedback', ['customer feedback', 'feedback']),
      field('requirement', 'Requirement', ['requirement', 'requirements', 'need']),
      field('nextFollowupDate', 'Next Follow-up Date', ['next follow up date', 'next followup date', 'next date', 'followup next']),
      field('reminder', 'Reminder', ['reminder']),
      field('reminderType', 'Reminder Type', ['reminder type'])
    ]
  },
  contact: {
    title: 'Contact',
    createRoute: '/leads/new',
    dedupeKeys: ['email', 'phone'],
    fields: LEAD_FIELDS
  }
};

const PURCHASE_REQ = {
  cpr: {
    title: 'CPR',
    createRoute: '/cprs/new',
    dedupeKeys: ['prNo'],
    fields: [
      field('prNo', 'PR Number', ['pr no', 'pr number', 'cpr no', 'cpr number', 'purchase request no', 'reference no']),
      field('prDate', 'Date', ['date', 'pr date', 'request date']),
      field('department', 'Department', ['department', 'dept']),
      field('requestedBy', 'Requested By', ['requested by', 'requestedby', 'requester', 'requestor', 'raised by']),
      field('requiredDate', 'Required Date', ['required date', 'required by', 'need by', 'delivery date']),
      field('priority', 'Priority', ['priority']),
      field('status', 'Status', ['status']),
      field('clientName', 'Client Name', ['client name', 'customer name', 'customer', 'client', 'company', 'business name', 'party', 'bill to']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'phone no', 'phone number']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('company', 'Company', ['company', 'company name', 'firm']),
      field('gst', 'GST', ['gst', 'gstin', 'gst no', 'gst number']),
      field('pan', 'PAN', ['pan', 'pan no', 'pan number']),
      field('project', 'Project', ['project', 'project name', 'site']),
      field('billingAddress', 'Billing Address', ['billing address', 'bill to address', 'address']),
      field('shippingAddress', 'Shipping Address', ['shipping address', 'ship to address', 'delivery address', 'consignee']),
      field('remarks', 'Remarks', ['remarks', 'notes', 'note', 'comments', 'description'])
    ]
  }
};

const WORKOUT = {
  costworkout: {
    title: 'Cost Workout',
    createRoute: '/cost-workouts/new',
    dedupeKeys: ['cwNo'],
    fields: [
      field('cwNo', 'CW Number', ['cw no', 'cw number', 'cost workout no', 'reference no']),
      field('cwDate', 'Date', ['date', 'cw date', 'workout date']),
      field('status', 'Status', ['status']),
      field('preparedBy', 'Prepared By', ['prepared by', 'preparedby', 'prepared', 'by']),
      field('customerName', 'Customer Name', ['customer name', 'customer', 'client name', 'client', 'company', 'business name', 'party']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'phone no', 'phone number']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('company', 'Company', ['company', 'company name', 'firm']),
      field('gst', 'GST', ['gst', 'gstin', 'gst no', 'gst number']),
      field('pan', 'PAN', ['pan', 'pan no', 'pan number']),
      field('cprRef', 'CPR Reference', ['cpr ref', 'cpr reference', 'cpr no', 'pr no', 'pr reference']),
      field('department', 'Department', ['department', 'dept']),
      field('billingAddress', 'Billing Address', ['billing address', 'bill to address', 'address']),
      field('shippingAddress', 'Shipping Address', ['shipping address', 'ship to address', 'delivery address']),
      field('remarks', 'Remarks', ['remarks', 'notes', 'note', 'comments'])
    ]
  },
  profitworkout: {
    title: 'Profit Workout',
    createRoute: '/profit-workouts/new',
    dedupeKeys: ['pwNo'],
    fields: [
      field('pwNo', 'PW Number', ['pw no', 'pw number', 'profit workout no', 'reference no']),
      field('pwDate', 'Date', ['date', 'pw date', 'workout date']),
      field('status', 'Status', ['status']),
      field('preparedBy', 'Prepared By', ['prepared by', 'preparedby', 'prepared', 'by']),
      field('customerName', 'Customer Name', ['customer name', 'customer', 'client name', 'client', 'company', 'business name', 'party']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'phone no', 'phone number']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('company', 'Company', ['company', 'company name', 'firm']),
      field('gst', 'GST', ['gst', 'gstin', 'gst no', 'gst number']),
      field('pan', 'PAN', ['pan', 'pan no', 'pan number']),
      field('cprRef', 'CPR Reference', ['cpr ref', 'cpr reference', 'cpr no', 'pr no', 'pr reference']),
      field('department', 'Department', ['department', 'dept']),
      field('billingAddress', 'Billing Address', ['billing address', 'bill to address', 'address']),
      field('shippingAddress', 'Shipping Address', ['shipping address', 'ship to address', 'delivery address']),
      field('remarks', 'Remarks', ['remarks', 'notes', 'note', 'comments'])
    ]
  }
};

const SALES_COMMON = [
  field('clientName', 'Client Name', ['client name', 'customer name', 'customer', 'client', 'company', 'company name', 'business name', 'name', 'party', 'bill to', 'consignee']),
  field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn', 'attention']),
  field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'phone no', 'phone number']),
  field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
  field('address', 'Address', ['address', 'street', 'street address', 'address line', 'billing address']),
  field('city', 'City', ['city', 'town']),
  field('state', 'State', ['state', 'province', 'region']),
  field('pin', 'PIN', ['pin', 'pincode', 'pin code', 'postal code', 'zip', 'zipcode']),
  field('country', 'Country', ['country']),
  field('gstin', 'GSTIN', ['gstin', 'gst', 'gst no', 'gst number', 'gstin no']),
  field('pan', 'PAN', ['pan', 'pan no', 'pan number']),
  field('billingAddress', 'Billing Address', ['billing address', 'bill to address', 'bill to']),
  field('billingCity', 'Billing City', ['billing city', 'bill city']),
  field('billingState', 'Billing State', ['billing state', 'bill state']),
  field('billingPin', 'Billing PIN', ['billing pin', 'billing pincode', 'bill pin', 'bill postal code']),
  field('shippingAddress', 'Shipping Address', ['shipping address', 'ship to address', 'ship to', 'delivery address', 'consignee address']),
  field('shippingCity', 'Shipping City', ['shipping city', 'ship city']),
  field('shippingState', 'Shipping State', ['shipping state', 'ship state']),
  field('shippingPin', 'Shipping PIN', ['shipping pin', 'shipping pincode', 'ship pin']),
  field('paymentTerms', 'Payment Terms', ['payment terms', 'payment', 'terms', 'credit terms']),
  field('deliveryTerms', 'Delivery Terms', ['delivery terms', 'delivery', 'shipping terms', 'incoterms']),
  field('salesPerson', 'Sales Person', ['sales person', 'salesperson', 'owner', 'executive', 'assigned to', 'prepared by']),
  field('notes', 'Notes', ['notes', 'remarks', 'comments', 'comment', 'note', 'additional info', 'additional information']),
  field('internalNotes', 'Internal Notes', ['internal notes', 'internal note', 'private notes'])
];

const SALES = {
  quotation: {
    title: 'Quotation',
    createRoute: '/quotations/new',
    dedupeKeys: ['quotationNo'],
    fields: [
      field('quotationNo', 'Quotation No', ['quotation no', 'quotation number', 'quote no', 'quote number', 'qtn no', 'qtn', 'estimate no']),
      field('reference', 'Reference', ['reference', 'ref', 'ref no', 'rfq no', 'rfq']),
      field('quotationDate', 'Quotation Date', ['quotation date', 'quote date', 'date', 'quotation dt']),
      field('validUntil', 'Valid Till', ['valid till', 'valid until', 'validity', 'validity date', 'expiry date', 'expires']),
      field('leadNo', 'Lead No', ['lead no', 'lead number', 'lead']),
      field('poRef', 'PO Reference', ['po no', 'po number', 'po ref', 'po reference', 'customer po']),
      ...SALES_COMMON
    ]
  },
  salesContract: {
    title: 'Sales Contract',
    createRoute: '/sales-contracts/new',
    dedupeKeys: ['scNo'],
    fields: [
      field('scNo', 'SC Number', ['sc no', 'sc number', 'contract no', 'contract number', 'sales contract no']),
      field('poRef', 'Customer PO', ['po no', 'po number', 'po ref', 'po reference', 'customer po', 'po']),
      field('contractDate', 'Contract Date', ['contract date', 'sc date', 'date', 'agreement date']),
      field('leadNo', 'Lead No', ['lead no', 'lead number', 'lead']),
      field('qtnRef', 'Quotation Ref', ['quotation ref', 'quotation no', 'qtn ref', 'quote no', 'qtn no']),
      ...SALES_COMMON
    ]
  },
  salesOrder: {
    title: 'Customer Purchase Order',
    createRoute: '/sales-orders/new',
    dedupeKeys: ['soNo'],
    fields: [
      field('soNo', 'CPO Number', ['so no', 'so number', 'order no', 'order number', 'sales order no', 'customer order no']),
      field('poRef', 'Customer PO', ['po no', 'po number', 'po ref', 'po reference', 'customer po', 'po']),
      field('orderDate', 'Order Date', ['order date', 'so date', 'date', 'sales order date']),
      field('deliveryDate', 'Delivery Date', ['delivery date', 'delivered by', 'expected delivery', 'need by']),
      field('contractRef', 'Contract Ref', ['contract ref', 'contract no', 'sc no', 'sc reference']),
      field('qtnRef', 'Quotation Ref', ['quotation ref', 'quotation no', 'qtn ref', 'quote no', 'qtn no']),
      field('leadNo', 'Lead No', ['lead no', 'lead number', 'lead']),
      ...SALES_COMMON
    ]
  },
  deliveryChallan: {
    title: 'Delivery Challan',
    createRoute: '/delivery-challans/new',
    dedupeKeys: ['dcNo'],
    fields: [
      field('dcNo', 'DC Number', ['dc no', 'dc number', 'challan no', 'challan number', 'delivery challan no']),
      field('dcDate', 'DC Date', ['dc date', 'challan date', 'date']),
      field('dispatchDate', 'Dispatch Date', ['dispatch date', 'dispatch', 'despatch date']),
      field('deliveryDate', 'Delivery Date', ['delivery date', 'expected delivery', 'delivered by']),
      field('poRef', 'Customer PO', ['po no', 'po number', 'po ref', 'po reference', 'customer po']),
      field('soRef', 'SO Ref', ['so no', 'so ref', 'so reference', 'sales order no', 'order no']),
      field('vehicleNo', 'Vehicle No', ['vehicle no', 'vehicle number', 'vehicle', 'truck no', 'lorry no']),
      field('transporter', 'Transporter', ['transporter', 'transport', 'carrier', 'courier']),
      ...SALES_COMMON
    ]
  },
  proformaInvoice: {
    title: 'Proforma Invoice',
    createRoute: '/proforma-invoices/new',
    dedupeKeys: ['piNo'],
    fields: [
      field('piNo', 'PI Number', ['pi no', 'pi number', 'proforma no', 'proforma invoice no']),
      field('piDate', 'PI Date', ['pi date', 'proforma date', 'date', 'invoice date']),
      field('validUntil', 'Valid Till', ['valid till', 'valid until', 'validity', 'validity date', 'expiry date']),
      field('poRef', 'Customer PO', ['po no', 'po number', 'po ref', 'po reference', 'customer po']),
      field('qtnRef', 'Quotation Ref', ['quotation ref', 'quotation no', 'qtn ref', 'quote no', 'qtn no']),
      ...SALES_COMMON
    ]
  },
  invoice: {
    title: 'Invoice',
    createRoute: '/invoices/new',
    dedupeKeys: ['invoiceNo'],
    fields: [
      field('invoiceNo', 'Invoice No', ['invoice no', 'invoice number', 'inv no', 'inv number', 'bill no', 'bill number']),
      field('invoiceDate', 'Invoice Date', ['invoice date', 'inv date', 'date', 'bill date']),
      field('dueDate', 'Due Date', ['due date', 'payment due', 'due on']),
      field('poRef', 'Customer PO', ['po no', 'po number', 'po ref', 'po reference', 'customer po']),
      field('soRef', 'SO Ref', ['so no', 'so ref', 'so reference', 'sales order no', 'order no']),
      field('dcRef', 'DC Ref', ['dc no', 'dc ref', 'dc reference', 'challan no', 'delivery challan no']),
      ...SALES_COMMON
    ]
  },
  paymentReceipt: {
    title: 'Payment Receipt',
    createRoute: '/payment-receipts/new',
    dedupeKeys: ['receiptNo'],
    fields: [
      field('receiptNo', 'Receipt No', ['receipt no', 'receipt number', 'rcpt no', 'payment receipt no']),
      field('receiptDate', 'Receipt Date', ['receipt date', 'date', 'payment date', 'received on']),
      field('amount', 'Amount', ['amount', 'amount received', 'received amount', 'paid amount', 'total', 'amount inr']),
      field('paymentMode', 'Payment Mode', ['payment mode', 'mode', 'payment method', 'mode of payment']),
      field('reference', 'Reference', ['reference', 'ref', 'ref no', 'transaction ref', 'cheque no', 'cheque number']),
      field('bankName', 'Bank Name', ['bank name', 'bank', 'drawn on']),
      field('transactionId', 'Transaction ID', ['transaction id', 'txn id', 'transaction no', 'utr', 'utr no', 'utr number']),
      field('clientName', 'Customer Name', ['customer name', 'customer', 'client name', 'client', 'company', 'company name', 'business name', 'name', 'party']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'phone no']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('notes', 'Notes', ['notes', 'remarks', 'comment', 'comments', 'note'])
    ]
  },
  creditNote: {
    title: 'Credit Note',
    createRoute: '/credit-notes/new',
    dedupeKeys: ['cnNo'],
    fields: [
      field('cnNo', 'CN Number', ['cn no', 'cn number', 'credit note no', 'credit note number']),
      field('cnDate', 'CN Date', ['cn date', 'credit note date', 'date']),
      field('reference', 'Reference', ['reference', 'ref', 'ref no', 'invoice ref', 'invoice no']),
      field('reason', 'Reason', ['reason', 'reason for credit', 'credit reason', 'remarks']),
      field('clientName', 'Customer Name', ['customer name', 'customer', 'client name', 'client', 'company', 'company name', 'business name', 'name', 'party']),
      field('contactPerson', 'Contact Person', ['contact person', 'contact name', 'contact', 'person', 'attn']),
      field('phone', 'Phone', ['phone', 'mobile', 'tel', 'telephone', 'contact no', 'phone no']),
      field('email', 'Email', ['email', 'e mail', 'mail', 'email id', 'emailid', 'email address']),
      field('gstin', 'GSTIN', ['gstin', 'gst', 'gst no', 'gst number']),
      field('pan', 'PAN', ['pan', 'pan no', 'pan number']),
      field('address', 'Address', ['address', 'billing address', 'street address']),
      field('notes', 'Notes', ['notes', 'remarks', 'comment', 'comments', 'note'])
    ]
  }
};

export const BULK_MODULES = {
  ...CRM,
  ...PURCHASE_REQ,
  ...WORKOUT,
  ...SALES
};

export function getModule(moduleKey) {
  return BULK_MODULES[moduleKey] || null;
}

// ---------------------------------------------------------------------------
// Item-row extraction (line items for sales-style documents)
// ---------------------------------------------------------------------------

const ITEM_COLS = [
  { key: 'productName', match: ['product', 'productname', 'item', 'itemname', 'particulars', 'material', 'service', 'description', 'name', 'productdescription'] },
  { key: 'description', match: ['description', 'item description', 'particulars'] },
  { key: 'hsn', match: ['hsn', 'hsncode', 'hsnno', 'sac', 'sac code'] },
  { key: 'unit', match: ['unit', 'uom', 'unitofmeasure'] },
  { key: 'qty', match: ['qty', 'quantity', 'qtyno'] },
  { key: 'rate', match: ['rate', 'unitprice', 'price', 'rateperunit', 'valueperunit'] },
  { key: 'gstRate', match: ['gst', 'gstrate', 'gstpercent', 'tax', 'taxrate'] },
  { key: 'discountPct', match: ['discount', 'discountpercent', 'disc'] },
  { key: 'amount', match: ['amount', 'total', 'linetotal', 'subtotal', 'value', 'gross'] }
];

export function deriveItemRows(rawRow) {
  const entries = Object.entries(rawRow || {});
  if (entries.length === 0) return [];
  const get = (col) => {
    const found = entries.find(([h]) => col.match.includes(norm(h)));
    return found ? found[1] : '';
  };
  const product = String(get(ITEM_COLS[0]) || '').trim();
  const qtyRaw = get(ITEM_COLS[4]);
  const rateRaw = get(ITEM_COLS[5]);
  const amountRaw = get(ITEM_COLS[8]);
  const hasItemSignal = product && (qtyRaw !== '' || rateRaw !== '' || amountRaw !== '');
  if (!hasItemSignal) return [];
  const qty = Number(qtyRaw) || 1;
  const rate = Number(rateRaw) || 0;
  const discountPct = Number(get(ITEM_COLS[7])) || 0;
  // Derive the line amount when the document omits it, so prefilled item rows
  // show correct totals (qty × rate after discount).
  const amount = Number(amountRaw) || Math.round(qty * rate * (1 - discountPct / 100) * 100) / 100;
  return [
    {
      productName: product,
      description: String(get(ITEM_COLS[1]) || '') || product,
      hsn: String(get(ITEM_COLS[2]) || ''),
      unit: String(get(ITEM_COLS[3]) || ''),
      qty,
      rate,
      gstRate: Number(get(ITEM_COLS[6])) || 0,
      discountPct,
      amount
    }
  ];
}

// ---------------------------------------------------------------------------
// File-size limit & streaming reads
// ---------------------------------------------------------------------------

/**
 * Maximum size permitted for a SINGLE bulk-uploaded document (2 GB per file).
 * Single source of truth: the app-wide per-file limit in attachmentStorage.js
 * (bulk upload shares the same 2 GB cap as every attachment upload zone).
 */
export const MAX_BULK_FILE_SIZE = MAX_ATTACHMENT_SIZE; // 2 GB

/**
 * Files above this size are technically accepted but warn the user that
 * in-browser extraction of very large spreadsheets/PDFs may be slow or fail
 * (the parser must materialise the bytes once). Extraction is honest, never
 * silent — the file is still processed and progress is shown.
 */
export const BULK_LARGE_FILE_WARN_BYTES = 200 * 1024 * 1024; // 200 MB

/** Human-readable label for the 2 GB per-file limit. */
export const MAX_BULK_FILE_SIZE_LABEL = '2 GB';

/**
 * Returns an Error when a single file exceeds the 2 GB per-file limit,
 * otherwise null. Exact message required by the spec — never silent.
 */
export function getBulkFileSizeError(file) {
  if (file && Number(file?.size) > MAX_BULK_FILE_SIZE) {
    const error = new Error('File size exceeds the maximum allowed limit of 2 GB.');
    error.name = 'BulkFileSizeLimitError';
    return error;
  }
  return null;
}

const STREAM_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB slices

/**
 * Reads a File/Blob in bounded 8 MB slices instead of one giant FileReader, so
 * a multi-GB document never freezes the tab: every slice yields to the event
 * loop (progress bars/cancel buttons keep repainting), progress is reported as
 * { bytesRead, total }, and an AbortSignal (or { aborted: true } duck object)
 * cancels the read between slices.
 *
 * Returns a Blob whose parts reference the read chunks without copying; callers
 * materialize it once via arrayBuffer() when a parser needs the bytes, so the
 * document is never duplicated in memory unnecessarily.
 */
export async function streamFileBytes(file, { onProgress, signal } = {}) {
  const total = Number(file?.size) || 0;
  if (total === 0) return new Blob([]);
  const parts = [];
  let offset = 0;
  while (offset < total) {
    if (signal?.aborted) {
      const err = new Error('Upload cancelled');
      err.name = 'AbortError';
      throw err;
    }
    const end = Math.min(offset + STREAM_CHUNK_SIZE, total);
    const chunk = await file.slice(offset, end).arrayBuffer();
    parts.push(chunk);
    offset = end;
    if (typeof onProgress === 'function') onProgress({ bytesRead: offset, total });
    // Let the UI repaint progress and honour the cancel button.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Blob(parts, { type: file.type });
}

// ---------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------

async function parseWorkbookRows(file, { onProgress, signal } = {}) {
  const XLSX = await import('xlsx');
  const blob = await streamFileBytes(file, { onProgress, signal });
  onProgress?.({ phase: 'parsing' });
  const buf = await blob.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const out = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
    if (Array.isArray(rows) && rows.length > 0) out.push({ sheet: name, rows });
  }
  return out;
}

/**
 * Best-effort PDF text extraction (works for simple/text-based PDFs that store
 * text with Tj/TJ operators — common for ERP/print exports). Binary/compressed
 * streams are skipped gracefully; the file is still kept as a reference.
 */
export function extractPdfText(arrayBuffer) {
  try {
    const str = new TextDecoder('latin1').decode(arrayBuffer);
    const chunks = [];
    const re = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    let m;
    while ((m = re.exec(str))) {
      const raw = m[1] != null ? m[1] : m[2];
      const cleaned = raw
        .replace(/\\([nrtbf()\\])/g, (_c, esc) => (esc === 'n' ? '\n' : esc === 'r' ? ' ' : esc === 't' ? ' ' : esc))
        .replace(/\)\s*\(/g, '');
      chunks.push(cleaned);
    }
    const text = chunks.join(' ').replace(/\s+/g, ' ').trim();
    return text.length > 20 ? text : '';
  } catch {
    return '';
  }
}

function kvFromText(text) {
  // "Label: value" lines for typical invoice/quote documents.
  const out = {};
  const labelRe = /([A-Za-z][A-Za-z0-9 &/()\-.]{2,40}?)\s*[:#-]\s*([^\n\r|;]{1,80})/g;
  let m;
  while ((m = labelRe.exec(text))) {
    const label = m[1].trim();
    const value = m[2].trim();
    if (label && value && !/^(page|www|http)/i.test(value)) {
      out[label] = value;
      if (Object.keys(out).length > 40) break;
    }
  }
  return out;
}

// Formats the extraction engine can actually parse in the browser.
const PARSEABLE = { csv: 1, xlsx: 1, xls: 1, pdf: 1 };
// Formats the picker accepts but that have no browser-side text extractor
// (DOC/DOCX/JPEG/JPG/PNG). They are accepted, never silently dropped — each
// one surfaces an explicit reason in the skipped list.
const ACCEPTED_TYPES = { ...PARSEABLE, doc: 1, docx: 1, jpg: 1, jpeg: 1, png: 1 };

// Form fields that hold dates — XLSX returns date cells as serial numbers, so
// these are converted to YYYY-MM-DD before they reach the form.
const DATE_FIELDS = new Set([
  'prDate', 'requiredDate', 'cwDate', 'pwDate', 'quotationDate', 'validUntil',
  'contractDate', 'orderDate', 'dcDate', 'dispatchDate', 'deliveryDate',
  'piDate', 'invoiceDate', 'dueDate', 'receiptDate', 'cnDate', 'followupDate',
  'nextFollowupDate', 'expectedCloseDate'
]);

function normalizeDateValue(fieldKey, value) {
  if (!DATE_FIELDS.has(fieldKey)) return value;
  const raw = Number(value);
  if (Number.isFinite(raw) && raw > 20000 && raw < 60000) {
    // Excel serial date → YYYY-MM-DD (1900 date system).
    const ms = Math.round((raw - 25569) * 86400000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return value;
}

/**
 * Turn uploaded files into per-module records.
 *
 * opts (all optional):
 *   onProgress(fileName, { phase: 'reading'|'parsing', percent }) — streaming
 *     read progress so the UI can show a live percentage per file.
 *   shouldAbort(fileName) → boolean — polled between stream slices; returning
 *     true throws an AbortError for that file (cancelled, not an error).
 *
 * Returns { records, skipped } where each record is:
 *   { id, fileName, source: 'sheet'|'pdf', values: {fieldKey: value}, items: [], raw: rowObject, text? }
 */
export async function buildRecords(moduleKey, files, { onProgress, shouldAbort } = {}) {
  const mod = getModule(moduleKey);
  const records = [];
  const skipped = [];
  if (!mod) return { records, skipped };

  // Sales Contracts are extracted server-side (real document parsing — PDF,
  // Word, Excel — returning exactly the four targeted fields). All other
  // modules keep the existing browser-side path untouched.
  if (moduleKey === 'salesContract') {
    return buildSalesContractRecords(files, { onProgress });
  }

  for (const file of Array.from(files || [])) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ACCEPTED_TYPES[ext]) {
      skipped.push({ file: file.name, reason: `Unsupported file type (.${ext || 'unknown'}) — use CSV, Excel, PDF, DOC, DOCX, JPG, JPEG or PNG` });
      continue;
    }
    // 2 GB per-file cap — enforced here as well as in the picker, so an
    // oversized file can never slip through silently.
    const sizeErr = getBulkFileSizeError(file);
    if (sizeErr) {
      skipped.push({ file: file.name, reason: sizeErr.message });
      continue;
    }
    if (!PARSEABLE[ext]) {
      skipped.push({ file: file.name, reason: 'This file type cannot be auto-extracted in the browser — use CSV, Excel or PDF for automatic form fill' });
      continue;
    }
    // Live signal the UI can flip to abort this file mid-stream.
    const abortSignal = {
      get aborted() {
        return typeof shouldAbort === 'function' ? shouldAbort(file.name) : false;
      }
    };
    const report = (info) => {
      if (typeof onProgress !== 'function') return;
      const percent =
        info.phase === 'parsing'
          ? 100
          : info.total
            ? Math.min(100, Math.round((info.bytesRead / info.total) * 100))
            : 0;
      onProgress(file.name, { phase: info.phase || 'reading', percent });
    };
    try {
      if (ext === 'pdf') {
        const blob = await streamFileBytes(file, { onProgress: report, signal: abortSignal });
        report({ phase: 'parsing' });
        const buf = await blob.arrayBuffer();
        const text = extractPdfText(buf);
        const kv = kvFromText(text);
        const values = {};
        const seen = new Set();
        Object.entries(kv).forEach(([label, value]) => {
          const f = matchField(mod.fields, label);
          if (f && !seen.has(f.key)) {
            seen.add(f.key);
            values[f.key] = normalizeDateValue(f.key, value);
          }
        });
        // Fall back to free text scan for name/phone/email.
        if (!values.clientName && !values.businessName && !values.customerName) {
          const emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
          if (emailMatch) values.email = emailMatch[0];
          const phoneMatch = text.match(/\+?\d{10,12}/);
          if (phoneMatch) values.phone = phoneMatch[0];
        }
        if (Object.keys(values).length === 0) {
          // Nothing extractable (e.g. scanned/compressed PDF) — keep the file
          // as a reference but never queue an empty record.
          skipped.push({
            file: file.name,
            reason: 'No readable text found — please fill the form manually or use CSV/Excel'
          });
        } else {
          records.push({
            id: `${file.name}-${records.length}`,
            fileName: file.name,
            source: 'pdf',
            text,
            values,
            items: [],
            raw: {}
          });
        }
      } else {
        const sheets = await parseWorkbookRows(file, { onProgress: report, signal: abortSignal });
        if (sheets.length === 0) {
          skipped.push({ file: file.name, reason: 'No data rows found' });
          continue;
        }
        let rowCount = 0;
        sheets.forEach(({ sheet, rows }) => {
          rows.forEach((rawRow) => {
            const values = {};
            Object.keys(rawRow).forEach((header) => {
              const f = matchField(mod.fields, header);
              if (f && rawRow[header] !== '' && rawRow[header] != null) {
                if (!(f.key in values)) values[f.key] = String(rawRow[header]).trim();
              }
            });
            if (Object.keys(values).length === 0) return; // empty/irrelevant row
            Object.keys(values).forEach((k) => {
              values[k] = normalizeDateValue(k, values[k]);
            });
            const items = deriveItemRows(rawRow);
            rowCount += 1;
            records.push({
              id: `${file.name}-${rowCount}`,
              fileName: file.name,
              source: 'sheet',
              sheet,
              values,
              items,
              raw: rawRow
            });
          });
        });
        if (rowCount === 0) skipped.push({ file: file.name, reason: 'No mapped fields recognised' });
      }
    } catch (err) {
      // A user-cancelled read is not an error — the modal surfaces it as its
      // own "Cancelled" status, so it never lands in the skipped/error list.
      if (err?.name === 'AbortError') continue;
      skipped.push({ file: file.name, reason: err?.message || 'Could not read the file' });
    }
  }

  return { records, skipped };
}

// ---------------------------------------------------------------------------
// Sales Contract bulk extraction (backend, targeted 4 fields)
// ---------------------------------------------------------------------------

// Backend field → Sales Contract form field mapping. Exactly four fields —
// nothing else is ever extracted or pre-filled (requirement: no over-extract).
const SC_EXTRACT_FIELDS = [
  { apiKey: 'customerName', formKey: 'clientName', label: 'Customer Name' },
  { apiKey: 'scNo', formKey: 'scNo', label: 'Contract Number' },
  { apiKey: 'contractDate', formKey: 'contractDate', label: 'Contract Date' },
  { apiKey: 'validity', formKey: 'validity', label: 'Validity' }
];

/**
 * Extracts the four targeted Sales Contract fields via the backend document-
 * extraction endpoint. One request per batch (no per-file request churn); each
 * file is processed independently on the server.
 */
async function buildSalesContractRecords(files, { onProgress } = {}) {
  const records = [];
  const skipped = [];
  const accepted = [];

  for (const file of Array.from(files || [])) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ACCEPTED_TYPES[ext]) {
      skipped.push({ file: file.name, reason: `Unsupported file type (.${ext || 'unknown'}) — use CSV, Excel, PDF, DOC, DOCX, JPG, JPEG or PNG` });
      continue;
    }
    const sizeErr = getBulkFileSizeError(file);
    if (sizeErr) {
      skipped.push({ file: file.name, reason: sizeErr.message });
      continue;
    }
    accepted.push(file);
  }

  if (accepted.length === 0) return { records, skipped };

  // Keep the UI honest during the round trip.
  if (typeof onProgress === 'function') {
    accepted.forEach((f) => onProgress(f.name, { phase: 'parsing', percent: 100 }));
  }

  const formData = new FormData();
  accepted.forEach((f) => formData.append('files', f));

  let results;
  try {
    // Explicit multipart content type — the app's standard FormData pattern
    // (see leadService.addAttachment) so this axios build doesn't JSON-serialize
    // the FormData into an empty object.
    const res = await api.post('/sales-contracts/bulk/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    const job = res?.data?.data;
    if (Array.isArray(job)) {
      // A backend that still extracts inline answers with the results directly.
      results = job;
    } else if (job?.jobId) {
      results = await pollExtractionJob(job.jobId);
    } else {
      throw new Error(res?.data?.message || 'Unexpected extraction response');
    }
    if (!Array.isArray(results)) {
      throw new Error('Extraction finished without results');
    }
  } catch (err) {
    // Whole batch failed — surface a clear per-file reason (never silent).
    const message = err?.response?.data?.message || err?.message || 'Extraction failed on the server';
    accepted.forEach((f) => skipped.push({ file: f.name, reason: message }));
    return { records, skipped };
  }

  results.forEach((result) => {
    const fileName = result?.fileName || 'document';
    const values = {};
    const review = [];
    SC_EXTRACT_FIELDS.forEach(({ apiKey, formKey, label }) => {
      const f = result?.[apiKey] || { value: '', status: 'notDetected' };
      values[formKey] = typeof f.value === 'string' ? f.value : '';
      review.push({ key: formKey, label, status: f.status || 'notDetected' });
    });
    records.push({
      id: `${fileName}-${records.length}`,
      fileName,
      source: 'backend',
      text: typeof result?.text === 'string' ? result.text.slice(0, 3000) : '',
      values,
      items: [],
      raw: {},
      _reviewFields: review
    });
  });

  // Defensive: every accepted file must map to a result.
  const returned = new Set(results.map((r) => r?.fileName));
  accepted.forEach((f) => {
    if (!returned.has(f.name)) skipped.push({ file: f.name, reason: 'No extraction result returned for this file' });
  });

  return { records, skipped };
}

// ---------------------------------------------------------------------------
// Module detection & duplicate handling
// ---------------------------------------------------------------------------

export function detectDocumentModule(text = '') {
  const t = String(text || '').toLowerCase();
  for (const { key, words } of MODULE_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return key;
  }
  return null;
}

export function dedupeWithin(moduleKey, records) {
  const mod = getModule(moduleKey);
  if (!mod || !mod.dedupeKeys?.length) return records;
  const seen = new Map();
  return records.map((r) => {
    const keyParts = mod.dedupeKeys.map((k) => norm(r.values?.[k])).filter(Boolean);
    if (keyParts.length === 0) return r;
    const sig = keyParts.join('|');
    const dup = seen.get(sig);
    if (dup) return { ...r, _dup: true };
    seen.set(sig, r.id);
    return r;
  });
}

/**
 * Best-effort duplicate check against existing records using the module's
 * list service (skipped silently when the service/endpoint is unavailable).
 */
export async function checkExistingDuplicates(moduleKey, records, listService) {
  const mod = getModule(moduleKey);
  if (!mod || !mod.dedupeKeys?.length || !listService || typeof listService.list !== 'function') {
    return records.map((r) => ({ ...r, _existing: false }));
  }
  try {
    const res = await listService.list({ page: 0, size: 200 });
    const rows = Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : res?.content || res?.data?.content || [];
    const existingSigs = new Set(
      rows.map((row) => mod.dedupeKeys.map((k) => norm(row[k])).filter(Boolean).join('|')).filter(Boolean)
    );
    if (existingSigs.size === 0) return records.map((r) => ({ ...r, _existing: false }));
    return records.map((r) => {
      const sig = mod.dedupeKeys.map((k) => norm(r.values?.[k])).filter(Boolean).join('|');
      return { ...r, _existing: Boolean(sig && existingSigs.has(sig)) };
    });
  } catch {
    return records.map((r) => ({ ...r, _existing: false }));
  }
}

// ---------------------------------------------------------------------------
// sessionStorage queue — used by the creation forms to pre-fill
// ---------------------------------------------------------------------------

const queueKey = (moduleKey) => `vishak:bulk:${moduleKey}`;

const QUEUE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours — stale queues are dropped

export function saveBulkQueue(moduleKey, records) {
  try {
    // Store only what the creation form needs (values/items/fileName) — raw
    // rows and PDF text can be large and would waste sessionStorage space.
    const slim = (records || []).map((r) => ({
      id: r.id,
      fileName: r.fileName,
      source: r.source,
      values: r.values || {},
      items: Array.isArray(r.items) ? r.items : []
    }));
    sessionStorage.setItem(
      queueKey(moduleKey),
      JSON.stringify({ records: slim, index: 0, savedAt: Date.now() })
    );
    return true;
  } catch {
    return false;
  }
}

export function getBulkQueue(moduleKey) {
  try {
    const raw = sessionStorage.getItem(queueKey(moduleKey));
    if (!raw) return null;
    const q = JSON.parse(raw);
    if (!Array.isArray(q?.records) || q.records.length === 0) return null;
    // Expire abandoned queues so they never unexpectedly pre-fill a form later.
    if (q.savedAt && Date.now() - q.savedAt > QUEUE_MAX_AGE_MS) {
      sessionStorage.removeItem(queueKey(moduleKey));
      return null;
    }
    return q;
  } catch {
    return null;
  }
}

export function clearBulkQueue(moduleKey) {
  try {
    sessionStorage.removeItem(queueKey(moduleKey));
  } catch {
    /* ignore */
  }
}

export function advanceBulkQueue(moduleKey) {
  try {
    const q = getBulkQueue(moduleKey);
    if (!q) return null;
    const nextIndex = Math.min(q.index + 1, q.records.length - 1);
    const next = { ...q, index: nextIndex };
    sessionStorage.setItem(queueKey(moduleKey), JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

export function activeBulkRecord(moduleKey) {
  const q = getBulkQueue(moduleKey);
  if (!q) return null;
  const record = q.records[q.index] || q.records[0];
  return { record, index: q.index, total: q.records.length, queue: q };
}

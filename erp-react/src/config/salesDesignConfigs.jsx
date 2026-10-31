// ============================================================================
// Sales Document Preview — per-module configuration.
//
// ONE shared workspace component (SalesDocumentDesign) renders every Sales
// Execution document as a Quotation-Preview-style live A4 editor. Only the
// document identity/content changes — the layout, toolbar, right panel, edit
// mode, PDF/print pipeline and calculation engine are shared.
//
// The field schema for the right-panel Content tab is REUSED from the module's
// own create/edit form config (SALES_FORM_CONFIGS) so the preview never drifts
// from the forms. Saving reuses the same SERIALIZERS + service.update the forms
// use, and totals reuse computeTotals — the single calculation engine.
// ============================================================================
import { SALES_FORM_CONFIGS } from './salesFormConfigs';
import { SERIALIZERS } from '../utils/salesHelpers';
import { formatDate } from '../utils/leadHelpers';
import salesContractService from '../services/salesContractService';
import salesOrderService from '../services/salesOrderService';
import deliveryChallanService from '../services/deliveryChallanService';
import proformaInvoiceService from '../services/proformaInvoiceService';
import invoiceService from '../services/invoiceService';
import paymentReceiptService from '../services/paymentReceiptService';
import creditNoteService from '../services/creditNoteService';

// Modules whose documents may never be edited from the preview once they reach
// a terminal / posted state. Mirrors the SalesViewPage header edit gate.
const READ_ONLY_STATUSES = ['cancelled', 'deleted', 'archived', 'converted', 'completed'];

function fmt(v) {
  if (!v) return '';
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? formatDate(v) : v;
}

function companyFrom(form) {
  return {
    title: 'From',
    name: form.companyName || '',
    address: form.companyAddress || '',
    gstin: form.companyGstin || '',
    pan: form.companyPan || '',
    email: form.email || '',
    phone: form.phone || '',
    state: form.companyState || ''
  };
}

function exporterFrom(form) {
  return {
    title: 'Exporter / Manufacturer',
    name: form.exporterName || form.companyName || '',
    address: form.exporterAddress || form.companyAddress || '',
    gstin: form.gstin || '',
    pan: form.pan || '',
    email: form.exporterEmail || '',
    phone: form.exporterPhone || ''
  };
}

function supplierFrom(form) {
  // SC / CPO / DC do not persist company identity — the ERP prints these on the
  // company letterhead, so the sheet shows the branded supplier block only.
  return {
    title: 'Supplier',
    name: form.fromCompany || form.companyName || '',
    address: form.fromAddress || form.companyAddress || '',
    gstin: form.fromGstin || '',
    pan: form.fromPan || '',
    email: form.fromEmail || '',
    phone: form.fromPhone || ''
  };
}

function customerLines(form) {
  return [
    form.contactPerson ? ['Contact', form.contactPerson] : null,
    form.city ? ['City', form.city] : null,
    form.state ? ['State', form.state] : null,
    form.gstin ? ['GSTIN', form.gstin] : null,
    form.pan ? ['PAN', form.pan] : null,
    form.email ? ['Email', form.email] : null,
    form.phone ? ['Phone', form.phone] : null,
    form.billingAddress ? ['Bill To', form.billingAddress] : null,
    form.shippingAddress && form.shippingAddress !== form.billingAddress
      ? ['Ship To', form.shippingAddress]
      : null
  ].filter(Boolean);
}

function meta(name, value) {
  return value ? [name, value] : null;
}

function baseMeta(form, extra) {
  return [
    meta('Customer PO Ref', form.poRef || form.customerPo),
    meta('Quotation Ref', form.qtnRef),
    meta('Lead No', form.leadNo),
    ...extra
  ].filter(Boolean);
}

// ===== Sales Contract =====
export const salesContractDesignConfig = {
  moduleKey: 'salesContract',
  title: 'Sales Contract',
  pageTitle: 'Sales Contract Preview',
  pageSubtitle: 'Design, preview, print and share the sales contract',
  docTitle: 'SALES CONTRACT',
  service: salesContractService,
  formConfig: SALES_FORM_CONFIGS.salesContract,
  serializer: SERIALIZERS.salesContract,
  listRoute: '/sales-contracts',
  viewRoute: (doc) => `/sales-contracts/${doc.id}`,
  numberLabel: 'SC No',
  dateLabel: 'SC Date',
  partyLabel: 'Client',
  fromBlock: supplierFrom,
  taxRows: true,
  showChargesRow: true,
  showWords: true,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  // ERP sales-contract print: Sub Total / CGST / SGST / Discount / Grand Total.
  headerMeta: (form) => [
    meta('Customer PO', form.poRef),
    meta('Quotation Ref', form.qtnRef),
    meta('Currency', form.currency),
    meta('Validity', fmt(form.validity)),
    meta('Duration', form.duration),
    meta('Lead No', form.leadNo)
  ],
  sheetInfoBoxes: (form) => [
    {
      title: 'Contract Terms',
      rows: [
        meta('Payment Terms', form.paymentTerms),
        meta('Delivery Terms', form.deliveryTerms),
        meta('Validity', fmt(form.validity)),
        meta('Duration', form.duration),
        meta('Warranty', form.warranty),
        meta('Sales Executive', form.salesExecutive)
      ]
    },
    {
      title: 'Scope & Exclusions',
      rows: [
        meta('Scope of Supply', form.scope),
        meta('Exclusions', form.exclusions),
        meta('Commercial Terms', form.commercialTerms),
        meta('Remarks', form.remarks)
      ]
    }
  ]
};

// ===== Customer Purchase Order (Sales Order) =====
export const salesOrderDesignConfig = {
  moduleKey: 'salesOrder',
  title: 'Customer Purchase Order',
  pageTitle: 'Customer Purchase Order Preview',
  pageSubtitle: 'Design, preview, print and share the customer purchase order',
  docTitle: 'CUSTOMER PURCHASE ORDER',
  service: salesOrderService,
  formConfig: SALES_FORM_CONFIGS.salesOrder,
  serializer: SERIALIZERS.salesOrder,
  listRoute: '/sales-orders',
  viewRoute: (doc) => `/sales-orders/${doc.id}`,
  numberLabel: 'CPO No',
  dateLabel: 'Order Date',
  partyLabel: 'Bill To',
  fromBlock: supplierFrom,
  taxRows: true,
  showChargesRow: true,
  showWords: true,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  headerMeta: (form) => [
    meta('Customer PO', form.customerPo),
    meta('Quotation Ref', form.qtnRef),
    meta('Contract Ref', form.scRef),
    meta('Lead No', form.leadNo),
    meta('Delivery Date', fmt(form.deliveryDate))
  ],
  sheetInfoBoxes: (form) => [
    {
      title: 'Order Terms',
      rows: [
        meta('Payment Terms', form.paymentTerms),
        meta('Delivery Terms', form.deliveryTerms),
        meta('Delivery Date', fmt(form.deliveryDate)),
        meta('Sales Executive', form.salesExecutive)
      ]
    }
  ]
};

// ===== Delivery Challan =====
export const deliveryChallanDesignConfig = {
  moduleKey: 'deliveryChallan',
  title: 'Delivery Challan',
  pageTitle: 'Delivery Challan Preview',
  pageSubtitle: 'Design, preview, print and share the delivery challan',
  docTitle: 'DELIVERY CHALLAN',
  service: deliveryChallanService,
  formConfig: SALES_FORM_CONFIGS.deliveryChallan,
  serializer: SERIALIZERS.deliveryChallan,
  listRoute: '/delivery-challans',
  viewRoute: (doc) => `/delivery-challans/${doc.id}`,
  numberLabel: 'DC No',
  dateLabel: 'DC Date',
  partyLabel: 'Consignee / Bill To',
  fromBlock: supplierFrom,
  itemColumns: 'basic',
  taxRows: false,
  showChargesRow: false,
  showWords: false,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  headerMeta: (form) => [
    meta('CPO Ref', form.soRef),
    meta('Contract Ref', form.scRef)
  ],
  sheetInfoBoxes: (form) => [
    {
      title: 'Transport Details',
      rows: [
        meta('Transport Company', form.transportCompany),
        meta('Vehicle No', form.vehicleNumber),
        meta('Driver', form.driverName ? `${form.driverName}${form.driverPhone ? ` (${form.driverPhone})` : ''}` : ''),
        meta('LR No', form.lrNumber),
        meta('E-Way Bill', form.ewayBill),
        meta('Dispatch Date', fmt(form.dispatchDate)),
        meta('Expected Delivery', fmt(form.deliveryDate))
      ]
    }
  ]
};

// ===== Proforma Invoice =====
export const proformaInvoiceDesignConfig = {
  moduleKey: 'proformaInvoice',
  title: 'Proforma Invoice',
  pageTitle: 'Proforma Invoice Preview',
  pageSubtitle: 'Design, preview, print and share the proforma invoice',
  docTitle: 'PROFORMA INVOICE',
  service: proformaInvoiceService,
  formConfig: SALES_FORM_CONFIGS.proformaInvoice,
  serializer: SERIALIZERS.proformaInvoice,
  listRoute: '/proforma-invoices',
  viewRoute: (doc) => `/proforma-invoices/${doc.id}`,
  // EDIT opens the existing Proforma Invoice edit form — the preview stays a
  // document view (editing never happens inline on the preview).
  editRoute: (doc) => `/proforma-invoices/${doc.id}/edit`,
  numberLabel: 'Proforma No',
  dateLabel: 'Proforma Date',
  partyLabel: 'Buyer',
  fromBlock: exporterFrom,
  taxRows: true,
  showChargesRow: true,
  showWords: true,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  headerMeta: (form) => [
    meta('Contract No', form.contractNo),
    meta('Appendix / PO No', form.appendixPoNo),
    meta('Reference No', form.referenceNo),
    meta('Valid Till', fmt(form.validTill)),
    meta('Source', form.sourceRef || form.source)
  ],
  sheetInfoBoxes: (form) => [
    {
      title: 'Shipping / Export Details',
      rows: [
        meta('Country of Origin', form.countryOfOrigin),
        meta('Country of Destination', form.countryOfFinalDestination),
        meta('Pre-Carriage By', form.preCarriageBy),
        meta('Place of Receipt', form.placeOfReceipt),
        meta('Vessel / Flight', form.vesselFlightNo),
        meta('Port of Loading', form.portOfLoading),
        meta('Port of Discharge', form.portOfDischarge),
        meta('Place of Delivery', form.placeOfDelivery),
        meta('HS Code', form.hsCode),
        meta('Commodity', form.commodity),
        meta('Terms of Delivery', form.termsOfDelivery),
        meta('Payment Terms', form.paymentTerms)
      ]
    }
  ]
};

// ===== Packing List (dedicated preview) =====
// Packing List documents are Proforma Invoice records; the preview consumes the
// SAME record / service / serializer as the Create Packing List form and
// renders it as a customer-facing A4 PACKING LIST. The page is a document
// VIEW — EDIT opens the existing Packing List edit form (config.editRoute),
// never a second editing system.
export const packingListDesignConfig = {
  moduleKey: 'packingList',
  title: 'Packing List',
  pageTitle: 'Packing List Preview',
  pageSubtitle: 'Preview, print and download the packing list',
  docTitle: 'PACKING LIST',
  service: proformaInvoiceService,
  formConfig: SALES_FORM_CONFIGS.packingList,
  serializer: SERIALIZERS.proformaInvoice,
  listRoute: '/sales-orders/packing-list',
  viewRoute: (doc) => `/proforma-invoices/${doc.id}`,
  editRoute: (doc) => `/proforma-invoices/${doc.id}/edit?docType=packing-list`,
  numberLabel: 'Packing List No',
  dateLabel: 'Packing List Date',
  partyLabel: 'Consignee',
  fromBlock: exporterFrom,
  taxRows: false,
  showChargesRow: false,
  showWords: false,
  roundOff: false,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  headerMeta: (form) => [
    meta('Contract No', form.contractNo),
    meta('Appendix No', form.appendixPoNo),
    meta('Invoice No', form.invoiceNo),
    meta('Reference No', form.referenceNo)
  ],
  sheetInfoBoxes: () => []
};

// ===== Invoice =====
export const invoiceDesignConfig = {
  moduleKey: 'invoice',
  title: 'Invoice',
  pageTitle: 'Export Invoice Preview',
  pageSubtitle: 'View, edit and print your export invoice',
  docTitle: 'EXPORT INVOICE',
  service: invoiceService,
  formConfig: SALES_FORM_CONFIGS.invoice,
  serializer: SERIALIZERS.invoice,
  listRoute: '/invoices',
  viewRoute: (doc) => `/invoices/${doc.id}`,
  numberLabel: 'Invoice No',
  dateLabel: 'Invoice Date',
  partyLabel: 'Bill To',
  fromBlock: companyFrom,
  taxRows: true,
  showChargesRow: true,
  showWords: true,
  roundOff: true,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  headerMeta: (form) => [
    meta('Due Date', fmt(form.dueDate)),
    meta('Reference No', form.referenceNo),
    meta('Source', form.sourceRef || form.source)
  ],
  sheetInfoBoxes: (form) => [
    {
      title: 'Payment',
      rows: [
        meta('Bank Name', form.bankName),
        meta('A/C No', form.bankAccount),
        meta('IFSC', form.bankIfsc),
        meta('Branch', form.bankBranch),
        meta('UPI', form.bankUpi),
        meta('Payment Terms', form.paymentTerms)
      ]
    }
  ]
};

// ===== Payment Receipt =====
export const paymentReceiptDesignConfig = {
  moduleKey: 'paymentReceipt',
  title: 'Payment Receipt',
  pageTitle: 'Payment Receipt Preview',
  pageSubtitle: 'Design, preview, print and share the payment receipt',
  docTitle: 'PAYMENT RECEIPT',
  service: paymentReceiptService,
  formConfig: SALES_FORM_CONFIGS.paymentReceipt,
  serializer: SERIALIZERS.paymentReceipt,
  listRoute: '/payment-receipts',
  viewRoute: (doc) => `/payment-receipts/${doc.id}`,
  numberLabel: 'Receipt No',
  dateLabel: 'Payment Date',
  partyLabel: 'Received From',
  fromBlock: companyFrom,
  isReceipt: true,
  showWords: true,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  headerMeta: (form) => [
    meta('Payment Mode', form.paymentMode),
    meta('Invoice Ref', form.invoiceRef),
    meta('Reference / UTR', form.referenceNo)
  ],
  sheetInfoBoxes: (form) => [
    {
      title: 'Payment Details',
      rows: [
        meta('Payment Mode', form.paymentMode),
        meta('Bank Name', form.bankName),
        meta('Branch', form.branch),
        meta('Cheque / Tx No', form.chequeTx),
        meta('Reference / UTR', form.referenceNo),
        meta('Invoice Ref', form.invoiceRef),
        meta('Source', form.source)
      ]
    }
  ]
};

// ===== Credit Note =====
export const creditNoteDesignConfig = {
  moduleKey: 'creditNote',
  title: 'Credit Note',
  pageTitle: 'Credit Note Preview',
  pageSubtitle: 'Design, preview, print and share the credit note',
  docTitle: 'CREDIT NOTE',
  service: creditNoteService,
  formConfig: SALES_FORM_CONFIGS.creditNote,
  serializer: SERIALIZERS.creditNote,
  listRoute: '/credit-notes',
  viewRoute: (doc) => `/credit-notes/${doc.id}`,
  numberLabel: 'CN No',
  dateLabel: 'CN Date',
  partyLabel: 'Bill To',
  fromBlock: companyFrom,
  taxRows: true,
  showChargesRow: true,
  showWords: true,
  // A Credit Note has no discount, so the preview / print / PDF sheet omits the
  // (always zero) Discount row instead of listing "Discount ₹0.00". A legacy
  // credit note that actually stored a discount still shows that row.
  hideZeroDiscountRow: true,
  signatureLabel: 'Authorized Signatory',
  readOnlyStatuses: READ_ONLY_STATUSES,
  headerMeta: (form) => [
    meta('Source', form.sourceRef || form.source),
    meta('Original Invoice Date', fmt(form.sourceDate)),
    meta('Settlement', form.settlementMethod),
    meta('Return Qty', form.returnQty)
  ],
  sheetInfoBoxes: (form) => [
    {
      title: 'Credit Details',
      rows: [
        meta('Reason', form.reason),
        meta('Reason Details', form.reasonDetail),
        meta('Refund Amount', form.refundAmount),
        meta('Return Quantity', form.returnQty),
        meta('Inventory Impact', form.inventoryImpact),
        meta('Settlement Method', form.settlementMethod),
        meta('Remarks', form.remarks)
      ]
    }
  ]
};

export const DESIGN_CONFIGS = {
  salesContract: salesContractDesignConfig,
  salesOrder: salesOrderDesignConfig,
  deliveryChallan: deliveryChallanDesignConfig,
  proformaInvoice: proformaInvoiceDesignConfig,
  packingList: packingListDesignConfig,
  invoice: invoiceDesignConfig,
  paymentReceipt: paymentReceiptDesignConfig,
  creditNote: creditNoteDesignConfig
};

export { customerLines };

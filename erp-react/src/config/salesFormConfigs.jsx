import {
  Banknote,
  Box,
  Building2,
  ClipboardList,
  FileText,
  Info,
  MapPin,
  PenLine,
  Settings,
  Ship,
  StickyNote,
  Truck,
  Users
} from 'lucide-react';
import { buildExportInvoicePrintHtml } from '../utils/salesPrintUtils';
import {
  BANK_TYPES,
  CITIES,
  CREDIT_NOTE_INVENTORY_IMPACT,
  CREDIT_NOTE_REASONS,
  CREDIT_NOTE_SOURCES,
  CREDIT_NOTE_STATUSES,
  DELIVERY_CHALLAN_STATUSES,
  DELIVERY_TERMS,
  DURATIONS,
  EXPORT_TAX_TREATMENTS,
  INVOICE_SOURCES,
  INVOICE_STATUSES,
  INVOICE_TYPES,
  NUMBER_FORMATS,
  PACKAGE_TYPES,
  PAYMENT_MODES,
  PAYMENT_RECEIPT_SOURCES,
  PAYMENT_RECEIPT_STATUSES,
  PAYMENT_TERMS,
  PROFORMA_INVOICE_STATUSES,
  PROFORMA_SOURCES,
  QUOTATION_STATUSES,
  SALES_CONTRACT_STATUSES,
  SALES_EXECUTIVES,
  SALES_ORDER_STATUSES,
  SIGNATURE_TYPES,
  STATES,
  TAX_TYPES,
  TRANSPORT_COMPANIES,
  WARRANTY
} from '../constants/salesConstants';

// Invoice Type visibility: export-specific sections render for Export / SEZ
// invoices only — the Domestic Invoice keeps the classic GST workflow.
const isExportType = (form) => ['export', 'sez'].includes(form?.invoiceType);

function companyFields() {
  return {
    title: 'Company Details',
    icon: Building2,
    fields: [
      { key: 'companyName', label: 'Company Name', type: 'text', grid: 'sm:col-span-2' },
      { key: 'companyAddress', label: 'Company Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
      { key: 'companyGstin', label: 'Company GSTIN', type: 'text' },
      { key: 'companyPan', label: 'Company PAN', type: 'text' },
      { key: 'companyState', label: 'Company State', type: 'select', options: STATES, masterKey: 'states' }
    ]
  };
}

export const SALES_FORM_CONFIGS = {
  quotation: {
    moduleKey: 'quotation',
    title: 'Quotation',
    docNoLabel: 'Quotation No',
    docNoKey: 'quotationNo',
    dateKey: 'quotationDate',
    showItems: true,
    showClient: true,
    showTotals: true,
    canSend: true,
    flatDiscount: true,
    showWords: true,
    statuses: QUOTATION_STATUSES,
    sections: [
      {
        title: 'Quotation Details',
        icon: Info,
        fields: [
          { key: 'quotationNo', label: 'Quotation No', type: 'text', placeholder: 'QTN-YYYY-XXXXXX', required: true },
          { key: 'reference', label: 'Reference', type: 'text', placeholder: 'e.g. RFQ-001' },
          { key: 'quotationDate', label: 'Quotation Date', type: 'date', required: true },
          { key: 'validUntil', label: 'Valid Till Date', type: 'date', required: true },
          { key: 'sourceCw', label: 'Source Cost Workout', type: 'select', dynamicSource: 'costWorkouts', placeholder: '-- None (Create from scratch) --' },
          { key: 'sourceCpr', label: 'Source CPR/PR', type: 'text', placeholder: 'Auto-filled from Cost Workout' },
          { key: 'leadNo', label: 'Lead No', type: 'text', placeholder: 'Lead number' },
          { key: 'salesPerson', label: 'Sales Person', type: 'select', options: SALES_EXECUTIVES, masterKey: 'sales_executives' }
        ]
      },
      {
        title: 'Quotation From',
        icon: Building2,
        fields: [
          { key: 'fromCompany', label: 'Company', type: 'select', options: ['VISHAK TECH'] },
          { key: 'fromName', label: 'Company Name', type: 'text' },
          { key: 'fromAddress', label: 'Address', type: 'text' },
          { key: 'fromGstin', label: 'GSTIN', type: 'text' },
          { key: 'fromPan', label: 'PAN', type: 'text' },
          { key: 'fromEmail', label: 'Email', type: 'email' },
          { key: 'fromPhone', label: 'Phone', type: 'text' }
        ]
      },
      {
        title: 'Quotation For',
        icon: Users,
        clientLookup: true,
        fields: [
          { key: 'clientId', label: 'Client ID', type: 'hidden' },
          { key: 'clientName', label: 'Client Name', type: 'text' },
          { key: 'contactPerson', label: 'Contact Person', type: 'text' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'address', label: 'Address', type: 'text' },
          { key: 'city', label: 'City', type: 'text' },
          { key: 'state', label: 'State', type: 'text' },
          { key: 'pin', label: 'PIN', type: 'text' },
          { key: 'country', label: 'Country', type: 'text' },
          { key: 'gstin', label: 'GSTIN', type: 'text' },
          { key: 'pan', label: 'PAN', type: 'text' }
        ]
      },
      {
        title: 'Billing Address',
        icon: MapPin,
        fields: [
          { key: 'billingAddress', label: 'Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
          { key: 'billingCity', label: 'City', type: 'text' },
          { key: 'billingState', label: 'State', type: 'text' },
          { key: 'billingPin', label: 'PIN', type: 'text' }
        ]
      },
      {
        title: 'Shipping Address',
        icon: Truck,
        fields: [
          { key: 'shipSameAsBill', label: 'Same as Billing', type: 'checkbox', grid: 'sm:col-span-2' },
          { key: 'shippingAddress', label: 'Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
          { key: 'shippingCity', label: 'City', type: 'text' },
          { key: 'shippingState', label: 'State', type: 'text' },
          { key: 'shippingPin', label: 'PIN', type: 'text' }
        ]
      },
      {
        title: 'Configure GST',
        icon: Settings,
        fields: [
          { key: 'taxType', label: 'Configure GST', type: 'select', options: TAX_TYPES },
          { key: 'currency', label: 'Currency', type: 'currency' },
          { key: 'numberFormat', label: 'Number Format', type: 'select', options: NUMBER_FORMATS.map((f) => f.label) }
        ]
      },
      {
        title: 'Commercial Terms',
        icon: ClipboardList,
        fields: [
          { key: 'paymentTerms', label: 'Payment Terms', type: 'text', placeholder: 'e.g. Net 30' },
          { key: 'deliveryTerms', label: 'Delivery Terms', type: 'text', placeholder: 'e.g. FOB - Bangalore' },
          { key: 'freight', label: 'Freight (₹)', type: 'number', min: 0, step: '0.01' },
          { key: 'insurance', label: 'Insurance (₹)', type: 'number', min: 0, step: '0.01' }
        ]
      },
      {
        title: 'Notes & Additional',
        icon: StickyNote,
        fields: [
          { key: 'remarks', label: 'Notes', type: 'textarea', rows: 2, grid: 'sm:col-span-2', placeholder: 'Customer notes...' },
          { key: 'additionalInfo', label: 'Additional Information', type: 'textarea', rows: 2, grid: 'sm:col-span-2', placeholder: 'Any additional info...' },
          { key: 'contactEmail', label: 'Contact Email', type: 'email' },
          { key: 'contactPhone', label: 'Contact Phone', type: 'text' }
        ]
      },
      {
        title: 'Terms & Conditions',
        icon: FileText,
        fields: [
          { key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 3, grid: 'sm:col-span-2', placeholder: 'e.g. Lead Time, Payment Terms, Delivery Terms, Warranty, Validity...' }
        ]
      },
      {
        title: 'Advanced Options',
        icon: Settings,
        fields: [
          { key: 'hsnView', label: 'HSN Column View', type: 'checkbox', grid: 'sm:col-span-1', defaultChecked: true },
          { key: 'displayUnit', label: 'Display Unit As', type: 'checkbox', grid: 'sm:col-span-1', defaultChecked: true },
          { key: 'taxSummary', label: 'Tax Summary Display', type: 'checkbox', grid: 'sm:col-span-1', defaultChecked: true },
          { key: 'hidePlace', label: 'Hide Place/Country of Supply', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'hsnSummary', label: 'Show HSN Summary', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'originalImages', label: 'Add Original Images', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'thumbnails', label: 'Show Thumbnails', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'descFull', label: 'Show Description Full Width', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'hideSubtotal', label: 'Hide Subtotal For Group Items', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'serial', label: 'Show Serial Numbers', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'batch', label: 'Display Batch Details', type: 'checkbox', grid: 'sm:col-span-1' },
          { key: 'showTotalPdf', label: 'Show Total In PDF', type: 'checkbox', grid: 'sm:col-span-1', defaultChecked: true }
        ]
      },
      {
        title: 'Signature & Attachments',
        icon: PenLine,
        fields: [
          { key: 'signatureType', label: 'Signature Type', type: 'select', options: SIGNATURE_TYPES },
          { key: 'signatureLabel', label: 'Signature Label', type: 'text', placeholder: 'e.g. Authorised Signatory' },
          { key: 'internalNotes', label: 'Internal Notes', type: 'textarea', rows: 2, grid: 'sm:col-span-2', placeholder: 'Internal notes (not visible to customer)...' }
        ]
      }
    ]
  },

  salesContract: {
    moduleKey: 'salesContract',
    title: 'Sales Contract',
    docNoLabel: 'Contract No',
    docNoKey: 'scNo',
    dateKey: 'contractDate',
    showItems: true,
    showClient: true,
    showTotals: true,
    statuses: SALES_CONTRACT_STATUSES,
    sections: [
      {
        title: 'Contract Details',
        icon: FileText,
        fields: [
          { key: 'scNo', label: 'SC No', type: 'text', placeholder: 'SC-YYYY-XXXXXX' },
          { key: 'poRef', label: 'Customer PO Number (Optional)', type: 'text' },
          { key: 'contractDate', label: 'SC Date', type: 'date' },
          { key: 'leadNo', label: 'Lead No', type: 'text' },
          { key: 'qtnRef', label: 'Quotation Ref', type: 'text' }
        ]
      },
      {
        title: 'Client Information',
        icon: Users,
        clientLookup: true,
        fields: [
          { key: 'clientId', label: 'Client ID', type: 'hidden' },
          { key: 'clientName', label: 'Client Name', type: 'text' },
          { key: 'contactPerson', label: 'Contact Person', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'city', label: 'City', type: 'select', options: CITIES, masterKey: 'cities' },
          { key: 'state', label: 'State', type: 'select', options: STATES, masterKey: 'states' },
          { key: 'gstin', label: 'GSTIN', type: 'text' },
          { key: 'pan', label: 'PAN', type: 'text' },
          { key: 'billingAddress', label: 'Billing Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
          { key: 'shippingAddress', label: 'Shipping Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
        ]
      },
      {
        title: 'Contract Terms',
        icon: Settings,
        fields: [
          { key: 'status', label: 'Status', type: 'select', options: SALES_CONTRACT_STATUSES },
          { key: 'currency', label: 'Currency', type: 'currency' },
          { key: 'paymentTerms', label: 'Payment Terms', type: 'select', options: PAYMENT_TERMS, masterKey: 'payment_terms' },
          { key: 'deliveryTerms', label: 'Delivery Terms', type: 'select', options: DELIVERY_TERMS, masterKey: 'delivery_terms' },
          { key: 'salesExecutive', label: 'Sales Executive', type: 'select', options: SALES_EXECUTIVES, masterKey: 'sales_executives' },
          { key: 'validity', label: 'Contract Validity', type: 'date' },
          { key: 'duration', label: 'Contract Duration', type: 'select', options: DURATIONS, masterKey: 'durations' },
          { key: 'warranty', label: 'Warranty Terms', type: 'select', options: WARRANTY, masterKey: 'warranty_terms' }
        ]
      },
      {
        title: 'Commercial & Scope',
        icon: ClipboardList,
        fields: [
          { key: 'commercialTerms', label: 'Commercial Terms', type: 'textarea', rows: 3, grid: 'sm:col-span-2' },
          { key: 'scope', label: 'Scope of Supply', type: 'textarea', rows: 3, grid: 'sm:col-span-2' },
          { key: 'exclusions', label: 'Exclusions', type: 'textarea', rows: 3, grid: 'sm:col-span-2' },
          { key: 'remarks', label: 'Remarks', type: 'textarea', rows: 3, grid: 'sm:col-span-2' }
        ]
      }
    ]
  },

  salesOrder: {
    moduleKey: 'salesOrder',
    title: 'Customer Purchase Order',
    docNoLabel: 'Order No',
    docNoKey: 'soNo',
    dateKey: 'orderDate',
    showItems: true,
    showClient: true,
    showTotals: true,
    statuses: SALES_ORDER_STATUSES,
    sections: [
      {
        title: 'Order Details',
        icon: ClipboardList,
        fields: [
          { key: 'soNo', label: 'Customer Purchase Order No', type: 'text', placeholder: 'CPO-YYYY-XXXXXX' },
          { key: 'customerPo', label: 'Customer PO', type: 'text' },
          { key: 'orderDate', label: 'Order Date', type: 'date' },
          { key: 'leadNo', label: 'Lead No', type: 'text' },
          { key: 'scRef', label: 'Sales Contract Ref', type: 'text' },
          { key: 'qtnRef', label: 'Quotation Ref', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: SALES_ORDER_STATUSES },
          { key: 'currency', label: 'Currency', type: 'currency' },
          { key: 'paymentTerms', label: 'Payment Terms', type: 'select', options: PAYMENT_TERMS, masterKey: 'payment_terms' },
          { key: 'salesExecutive', label: 'Sales Executive', type: 'select', options: SALES_EXECUTIVES, masterKey: 'sales_executives' },
          { key: 'deliveryDate', label: 'Delivery Date', type: 'date' },
          { key: 'deliveryTerms', label: 'Delivery Terms', type: 'select', options: DELIVERY_TERMS, masterKey: 'delivery_terms' }
        ]
      },
      {
        title: 'Client Information',
        icon: Users,
        clientLookup: true,
        fields: [
          { key: 'clientId', label: 'Client ID', type: 'hidden' },
          { key: 'clientName', label: 'Client Name', type: 'text' },
          { key: 'contactPerson', label: 'Contact Person', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'gstin', label: 'GSTIN', type: 'text' },
          { key: 'pan', label: 'PAN', type: 'text' },
          { key: 'city', label: 'City', type: 'select', options: CITIES, masterKey: 'cities' },
          { key: 'state', label: 'State', type: 'select', options: STATES, masterKey: 'states' },
          { key: 'billingAddress', label: 'Billing Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
          { key: 'shippingAddress', label: 'Shipping Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
        ]
      },
      {
        title: 'Notes',
        icon: StickyNote,
        fields: [
          { key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 3, grid: 'sm:col-span-2' },
          { key: 'remarks', label: 'Remarks', type: 'textarea', rows: 3, grid: 'sm:col-span-2' }
        ]
      }
    ]
  },

  deliveryChallan: {
    moduleKey: 'deliveryChallan',
    showAttachments: false,
    title: 'Delivery Challan',
    docNoLabel: 'Challan No',
    docNoKey: 'dcNo',
    dateKey: 'dcDate',
    showItems: true,
    showClient: true,
    showTotals: true,
    flatDiscount: true,
    clientCreate: true,
    // ERP DC auto-fills Dispatch Date (today) and Expected Delivery (+5 days).
    defaults: {
      dispatchDate: () => new Date().toISOString().split('T')[0],
      deliveryDate: () => new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]
    },
    // ERP delivery-challan-create.html places the Items table in the main
    // column after the Transport & Dispatch card (before Notes & Terms).
    itemsAfterIndex: 2,
    statuses: DELIVERY_CHALLAN_STATUSES,
    sections: [
      {
        title: 'Challan Details',
        icon: Truck,
        fields: [
          { key: 'dcNo', label: 'DC Number', type: 'text', placeholder: 'DC-YYYY-XXXXXX', required: true },
          { key: 'soRef', label: 'Customer Purchase Order', type: 'text', placeholder: 'Select CPO...' },
          { key: 'dcDate', label: 'Date', type: 'date', required: true },
          { key: 'scRef', label: 'Sales Contract Ref', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: DELIVERY_CHALLAN_STATUSES, required: true }
        ]
      },
      {
        title: 'Client Information',
        icon: Users,
        clientLookup: true,
        fields: [
          { key: 'clientId', label: 'Client ID', type: 'hidden' },
          { key: 'clientName', label: 'Customer Name', type: 'text' },
          { key: 'contactPerson', label: 'Contact Person', type: 'text' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'billingAddress', label: 'Billing Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
          { key: 'shippingAddress', label: 'Shipping Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
          { key: 'city', label: 'City', type: 'select', options: CITIES, masterKey: 'cities' },
          { key: 'state', label: 'State', type: 'select', options: STATES, masterKey: 'states' }
        ]
      },
      {
        title: 'Transport Details',
        icon: Ship,
        fields: [
          { key: 'transportCompany', label: 'Transport Company', type: 'select', options: TRANSPORT_COMPANIES, masterKey: 'transport_companies' },
          { key: 'vehicleNumber', label: 'Vehicle Number', type: 'text' },
          { key: 'driverName', label: 'Driver Name', type: 'text' },
          { key: 'driverPhone', label: 'Driver Phone', type: 'text' },
          { key: 'lrNumber', label: 'LR Number', type: 'text' },
          { key: 'ewayBill', label: 'E-Way Bill No', type: 'text' },
          { key: 'dispatchDate', label: 'Dispatch Date', type: 'date' },
          { key: 'deliveryDate', label: 'Expected Delivery', type: 'date' }
        ]
      },
      {
        title: 'Notes & Terms',
        icon: StickyNote,
        fields: [
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, grid: 'sm:col-span-2' },
          { key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 3, grid: 'sm:col-span-2' }
        ]
      }
    ]
  },

  proformaInvoice: {
    moduleKey: 'proformaInvoice',
    showAttachments: true,
    title: 'Proforma Invoice',
    docNoLabel: 'Proforma No',
    docNoKey: 'piNo',
    dateKey: 'piDate',
    showItems: true,
    showClient: true,
    showTotals: true,
    // ERP proforma-invoice-create.html: percentage discount (Discount % input +
    // Discount Amount display), single GST row in Totals, Status card in the
    // right sidebar, Item Details in the main column below the Proforma Invoice
    // Details card, Attachments as the last main-column section, footer =
    // Cancel / Save as Draft / Save & Submit (create) and Save Changes /
    // Update & Close (edit). No Send button on the create form (ERP has none).
    percentageDiscount: true,
    showSend: false,
    sidebarStatus: true,
    attachmentsInColumn: true,
    submitToView: true,
    // Export Proforma upgrade: the item grid follows the export-proforma
    // columns (Marks & Nos / Container No, No & Kind of Pkgs, Description of
    // Goods, Item Code, Drawing No, Material, HSN, Manufacturer, Country of
    // Origin, Qty, UOM, Unit Price / Total in the selected currency).
    itemsVariant: 'proformaExport',
    // Packing entries are stored as a JSON TEXT column (same as the Invoice).
    jsonFields: ['packingDetails'],
    // Create footer per the reference document: Cancel / Save as Draft /
    // Save & Submit (Save & New is not shown on the proforma create page).
    showSaveNew: false,
    footerLabels: {
      cancel: 'Cancel',
      draft: 'Save as Draft',
      createNew: 'Save & New',
      primaryCreate: 'Save & Submit',
      primaryEdit: 'Update & Close',
      secondaryEdit: 'Save Changes'
    },
    // ERP proforma-invoice-create.html shows no required asterisk on the
    // Customer field, and keeps the Status in a sidebar card (not a form field).
    clientRequired: false,
    clientLookupLabel: 'Customer',
    // ERP customer search placeholder (General Information).
    clientLookupPlaceholder: 'Search customer by Name, Code, GST, Phone, Email...',
    // ERP General Information shows no helper hint under the Customer field.
    clientLookupHint: '',
    // ERP default: shipping is same as billing ("Shipping address different from
    // billing" toggle unchecked). The checkbox is inverted in the UI, so the
    // form value (shipSameAsBill = same-as-billing) defaults to true. The
    // reference document's EXPORTER block and SHIPPING / EXPORT DETAILS values
    // pre-fill as EDITABLE defaults (company data where available) — never as
    // static text — and are overridable on every record.
    defaults: {
      // A new Proforma Invoice starts as a CLEAN EMPTY form — no sample /
      // demo content is injected (no company data, no shipment values, no
      // bank, no packing, no terms, no authorization). Only genuine system
      // behaviour remains: the document number is auto-generated, the date
      // defaults to today (emptyForm in SalesFormPage), and shipping defaults
      // to same-as-billing. Everything else is filled from the selected
      // customer / contract / CPO record or typed by the user.
      shipSameAsBill: () => true
    },
    // Invoice / Packing List creation must NEVER inherit previously-typed or
    // previously-viewed data. Disable the localStorage draft autosave/restore
    // for these document flows so a stale draft (from an earlier session or
    // the shared proformaInvoice draft key) can never re-inject content into
    // a fresh form. "Save as Draft" still works — it persists to the backend.
    draftPersistence: false,
    statuses: PROFORMA_INVOICE_STATUSES,
    // ERP proforma create: Item Details renders in the main column right below
    // the Proforma Invoice Details card (section index 0), before the Shipping
    // and Bank Details cards. Remarks + Terms & Conditions live in the right
    // sidebar (section.sidebar) below the Status card.
    itemsAfterIndex: 0,
    sections: [
      {
        // Main card: document header rows (Proforma No / Date, Contract No /
        // Date, Appendix No / Date, Exporter's Ref, Valid Till, Reference No),
        // the Customer Purchase Order selector, the Customer lookup +
        // auto-filled customer details, Source / Source Document, and the
        // EXPORTER / MANUFACTURER block (with GSTIN / PAN / State for exports).
        title: 'Proforma Invoice Details',
        icon: Info,
        clientLookup: true,
        fields: [
          // Header row 1: auto-generated readonly Proforma No + Proforma Date.
          { key: 'piNo', label: 'Proforma No', type: 'text', beforeLookup: true, readOnly: true, required: true },
          { key: 'piDate', label: 'Proforma Date', type: 'date', beforeLookup: true, required: true },
          // Header row 1 contd: Contract No (selectable from the existing Sales
          // Contracts — the selected contract auto-fills customer + consignee
          // details) + Contract Date.
          { key: 'contractNo', label: 'Contract No', type: 'select', beforeLookup: true, dynamicSource: 'salesContracts', placeholder: '-- Select Contract --', required: true },
          { key: 'contractDate', label: 'Contract Date', type: 'date', beforeLookup: true, required: true },
          // Header row 2: Appendix No / Appendix Date / Exporter's Ref.
          { key: 'appendixPoNo', label: 'Appendix No', type: 'text', beforeLookup: true, placeholder: 'Appendix / PO No', required: true },
          { key: 'appendixDate', label: 'Appendix Date', type: 'date', beforeLookup: true, required: true },
          { key: 'exporterRef', label: "Exporter's Ref", type: 'text', beforeLookup: true, placeholder: "Exporter's Reference" },
          // Header row 3: existing Reference No + Valid Till.
          { key: 'referenceNo', label: 'Reference No', type: 'text', beforeLookup: true, placeholder: 'PO / Reference No.' },
          { key: 'validTill', label: 'Valid Till', type: 'date', beforeLookup: true },
          // Header: Customer Purchase Order selector — the CPO is the source of
          // truth for ITEM DETAILS and customer details on the Proforma
          // Invoice. Selecting one loads the CPO's exact line items and fills
          // the customer block (see applySalesOrder). The linked CPO number is
          // persisted in the existing sourceRef field with source='so' (the
          // ERP's Source Document relationship), so the same value also shows
          // in the Source Document input below.
          { key: 'sourceRef', label: 'Customer Purchase Order', type: 'select', beforeLookup: true, dynamicSource: 'salesOrders', placeholder: '-- Select CPO --' },
          { key: 'clientId', label: 'Client ID', type: 'hidden' },
          // Customer area: Contact Person is editable; Email/Phone/Billing/
          // Shipping are auto-filled from the selected customer (shown after
          // selection, like the ERP grey chips).
          { key: 'contactPerson', label: 'Contact Person', type: 'text', placeholder: 'Contact person' },
          { key: 'email', label: 'Email', type: 'display', visible: (form) => !!form.clientName },
          { key: 'phone', label: 'Phone', type: 'display', visible: (form) => !!form.clientName },
          { key: 'billingAddress', label: 'Billing Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', visible: (form) => !!form.clientName },
          // ERP: "Shipping address different from billing" toggle (checked = the
          // shipping address DIFFERS from billing, i.e. shipSameAsBill = false).
          { key: 'shipSameAsBill', label: 'Shipping address different from billing', type: 'checkbox', invert: true, hideLabel: true, grid: 'sm:col-span-2', visible: (form) => !!form.clientName },
          // ERP: the Shipping Address field is hidden until the toggle is on.
          { key: 'shippingAddress', label: 'Shipping Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', visible: (form) => !!form.clientName && form.shipSameAsBill !== true },
          // Existing Reference Details fields kept in the same card.
          { key: 'source', label: 'Source', type: 'select', options: PROFORMA_SOURCES },
          { key: 'sourceRef', label: 'Source Document', type: 'text' }
        ],
        groups: [
          {
            // Reference document EXPORTER / MANUFACTURER block — pre-filled
            // with the ERP company default (VISHAK TECH GSTIN/PAN + registered
            // address / email / phone), fully editable so nothing here is
            // hard-coded.
            title: 'EXPORTER / MANUFACTURER',
            icon: Building2,
            fields: [
              { key: 'exporterName', label: 'Exporter Name', type: 'text', placeholder: 'Exporter / Manufacturer name', required: true },
              { key: 'exporterGstin', label: 'GSTIN', type: 'text', placeholder: 'e.g. 33GKFPS5025A2ZG' },
              { key: 'exporterPan', label: 'PAN', type: 'text', placeholder: 'e.g. GKFPS5025A' },
              { key: 'exporterState', label: 'State', type: 'select', options: STATES, masterKey: 'states', placeholder: 'Select State' },
              { key: 'exporterAddress', label: 'Exporter Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
              { key: 'exporterEmail', label: 'Email', type: 'email' },
              { key: 'exporterPhone', label: 'Phone', type: 'text' }
            ]
          }
        ]
      },
      {
        // Reference document BUYER (IF OTHER THAN CONSIGNEE) card — the
        // "Same as Consignee" checkbox copies the consignee details into the
        // buyer block (see handleBuyerSameAsConsignee).
        title: 'Buyer (If Other Than Consignee)',
        icon: Users,
        sideBySide: true,
        fields: [
          { key: 'buyerSameAsConsignee', label: 'Same as Consignee', type: 'checkbox', hideLabel: true, grid: 'sm:col-span-2' },
          { key: 'buyerName', label: 'Buyer Name', type: 'text', placeholder: 'Auto-filled from customer' },
          { key: 'buyerCountry', label: 'Country', type: 'country', grid: 'sm:col-span-1', placeholder: 'Select country' },
          { key: 'buyerAddress', label: 'Buyer Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
        ]
      },
      {
        // Reference document CONSIGNEE (SHIP TO) card — auto-filled from the
        // selected customer / contract and fully editable.
        title: 'Consignee (Ship To)',
        icon: Truck,
        sideBySide: true,
        fields: [
          { key: 'consigneeName', label: 'Consignee Name', type: 'text', placeholder: 'Auto-filled from customer', required: true },
          { key: 'consigneeCountry', label: 'Country', type: 'country', grid: 'sm:col-span-1', placeholder: 'Select country', required: true },
          { key: 'consigneeAddress', label: 'Consignee Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', required: true }
        ]
      },
      {
        // Reference document EXPORT & SHIPMENT DETAILS — full width.
        title: 'Export & Shipment Details',
        icon: Ship,
        fields: [
          { key: 'countryOfOrigin', label: 'Country of Origin of Goods', type: 'country', required: true },
          { key: 'countryOfFinalDestination', label: 'Country of Final Destination', type: 'country', required: true },
          { key: 'preCarriageBy', label: 'Pre-Carriage By', type: 'text', required: true, placeholder: 'ROAD / SEA / AIR' },
          { key: 'placeOfReceipt', label: 'Place of Receipt', type: 'text', required: true, placeholder: 'e.g. KAVINDAPADI' },
          { key: 'vesselFlightNo', label: 'Vessel / Flight No', type: 'text', required: true, placeholder: 'e.g. BY AIR' },
          { key: 'portOfLoading', label: 'Port of Loading', type: 'text', required: true, placeholder: 'e.g. CHENNAI' },
          { key: 'portOfDischarge', label: 'Port of Discharge', type: 'text', required: true, placeholder: 'e.g. CHENNAI' },
          { key: 'placeOfDelivery', label: 'Port of Delivery', type: 'text', required: true, placeholder: 'e.g. EKATERINBURG (SVX)' },
          { key: 'hsCode', label: 'Export HS Code', type: 'text', required: true, placeholder: 'e.g. 8412218008' },
          { key: 'commodity', label: 'Commodity', type: 'text', required: true, placeholder: 'e.g. CAST IRON PARTICAL' },
          { key: 'termsOfDelivery', label: 'Terms of Delivery / Incoterms', type: 'select', options: DELIVERY_TERMS, masterKey: 'delivery_terms', placeholder: 'FCA PORT - CHENNAI', required: true },
          { key: 'paymentTerms', label: 'Payment Terms', type: 'select', options: PAYMENT_TERMS, masterKey: 'payment_terms', placeholder: '50% PREPAYMENT & 50% AFTER DELIVERY', required: true },
          { key: 'currency', label: 'Currency', type: 'currency', required: true },
          { key: 'taxTreatment', label: 'Tax Treatment', type: 'select', options: EXPORT_TAX_TREATMENTS, grid: 'sm:col-span-1', required: true }
        ]
      },
      {
        // PACKING DETAILS — repeatable package entries (JSON TEXT column).
        // Paired with Bank Details (same as the Export Invoice layout).
        title: 'Packing Details',
        icon: Box,
        sideBySide: true,
        fields: [
          { key: 'packingDetails', label: 'Packing Details', type: 'listEditor', grid: 'sm:col-span-2', packageTypes: PACKAGE_TYPES }
        ]
      },
      {
        // BANK DETAILS — extended with SWIFT / BIC for export payments.
        title: 'Bank Details',
        icon: Banknote,
        sideBySide: true,
        fields: [
          { key: 'bankName', label: 'Bank Name', type: 'text' },
          { key: 'bankAccount', label: 'Account Number', type: 'text' },
          { key: 'bankSwift', label: 'SWIFT / BIC Code', type: 'text', placeholder: 'SWIFT code for export payments' },
          { key: 'bankIfsc', label: 'IFSC Code', type: 'text' },
          { key: 'bankBranch', label: 'Branch Name', type: 'text' },
          { key: 'bankType', label: 'Account Type', type: 'select', options: BANK_TYPES, masterKey: 'bank_types' },
          { key: 'bankUpi', label: 'UPI ID', type: 'text' },
          { key: 'bankAddress', label: 'Bank Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
        ]
      },
      {
        // TERMS & CONDITIONS — payment / delivery / export terms textarea.
        title: 'Terms & Conditions',
        icon: FileText,
        sideBySide: true,
        fields: [
          { key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 3, grid: 'sm:col-span-2', placeholder: 'Payment terms, delivery terms, warranty, export conditions...' }
        ]
      },
      {
        // AUTHORIZATION — authorized signatory + company stamp / seal.
        title: 'Authorization',
        icon: PenLine,
        sideBySide: true,
        fields: [
          { key: 'authorizedSignatory', label: 'Authorized Signatory', type: 'select', options: SIGNATURE_TYPES, masterKey: 'signature_types', placeholder: 'Authorized Signatory', required: true },
          { key: 'designation', label: 'Designation', type: 'text', placeholder: 'e.g. Director' },
          { key: 'place', label: 'Place', type: 'text', placeholder: 'e.g. Chennai' },
          { key: 'authorizationDate', label: 'Date', type: 'date' },
          { key: 'companyStamp', label: 'Company Stamp', type: 'stampUpload', grid: 'sm:col-span-2' }
        ]
      },
      {
        // Right-sidebar card (section.sidebar): Remarks textarea. Kept separate
        // from Terms & Conditions — never merged.
        title: 'Remarks',
        icon: StickyNote,
        sidebar: true,
        fields: [
          { key: 'notes', label: 'Remarks', type: 'textarea', rows: 3, grid: 'sm:col-span-2', placeholder: 'Enter remarks...' }
        ]
      }
    ]
  },

  invoice: {
    moduleKey: 'invoice',
    showAttachments: true,
    title: 'Export Invoice',
    docNoLabel: 'Invoice No',
    docNoKey: 'invoiceNo',
    dateKey: 'invoiceDate',
    showItems: true,
    showClient: true,
    showTotals: true,
    percentageDiscount: true,
    showWords: true,
    // ERP invoice-create.html: percentage discount (Discount % input + Discount
    // Amount display), single GST row in Totals, Status card in the right
    // sidebar, Attachments as the last main-column section, footer = Save Draft /
    // Save & New / Save & Finish (create) and Save Changes / Update & Close
    // (edit). No Send button on the create form (ERP has none).
    showSend: false,
    sidebarStatus: true,
    attachmentsInColumn: true,
    // Export Invoice upgrade: Item Details renders full-width in the main
    // column right after the Export & Shipment Details card (export) or right
    // below the Invoice Details card (domestic, original layout) — the Totals
    // card stays in the right sidebar.
    itemsAfterIndex: (form) => (isExportType(form) ? 3 : 0),
    // The item grid follows the Invoice Type: Export / SEZ invoices use the
    // export variant (Manufacturer / Country of Origin columns, currency rate &
    // total, no GST column), Domestic keeps the classic GST grid.
    itemsVariant: (form) => (isExportType(form) ? 'export' : 'invoice'),
    clientCreate: true,
    // ERP invoice: no required asterisk on the customer field; "Add New Customer"
    // (+) button next to the search (ERP opens clients.html?action=add).
    clientRequired: false,
    clientLookupLabel: 'Select Customer',
    clientLookupPlaceholder: 'Search customer by Name, Code, GST, Phone, Email...',
    clientLookupHint: '',
    // Export Invoice upgrade: render the Invoice Type selector + Preview button
    // in the page header (see SalesFormPage headerActions).
    headerActions: true,
    // Fields stored as JSON TEXT on the backend — parsed back on edit load.
    jsonFields: ['packingDetails'],
    // Preview button: generate the professional A4 EXPORT INVOICE document from
    // the CURRENT unsaved form state (nothing persisted, nothing saved).
    buildPreview: (form, items) => buildExportInvoicePrintHtml({ ...form }, items),
    // Export Invoice validation (runs after the shared client/items checks):
    // required exporter / buyer / consignee / origin / destination / currency,
    // at least one item, and sane quantity / rate values. Domestic invoices are
    // unaffected (their existing validation continues exactly as before).
    additionalValidation: (form, items, toast) => {
      if (!isExportType(form)) return true;
      if (!String(form.invoiceNo || '').trim()) {
        toast.error('Invoice No is required.');
        return false;
      }
      if (!form.invoiceDate) {
        toast.error('Invoice Date is required.');
        return false;
      }
      if (!String(form.companyName || '').trim()) {
        toast.error('Exporter Name is required.');
        return false;
      }
      if (!form.buyerName && !form.clientName) {
        toast.error('Please select or enter a Buyer (Bill To).');
        return false;
      }
      if (!form.consigneeName) {
        toast.error('Please select or enter a Consignee (Ship To).');
        return false;
      }
      if (!form.countryOfOrigin) {
        toast.error('Country of Origin of Goods is required.');
        return false;
      }
      if (!form.countryOfFinalDestination) {
        toast.error('Country of Final Destination is required.');
        return false;
      }
      if (!form.currency) {
        toast.error('Currency is required.');
        return false;
      }
      if (!Array.isArray(items) || items.length === 0) {
        toast.error('Add at least one item.');
        return false;
      }
      if (items.some((it) => Number(it.qty) <= 0)) {
        toast.error('Item quantity must be greater than zero.');
        return false;
      }
      if (items.some((it) => Number(it.rate) < 0)) {
        toast.error('Item rate cannot be negative.');
        return false;
      }
      return true;
    },
    footerLabels: {
      draft: 'Save Draft',
      createNew: 'Save & New',
      primaryCreate: 'Save & Finish',
      primaryEdit: 'Update & Close',
      secondaryEdit: 'Save Changes'
    },
    // "Save & Finish" keeps its established meaning (save, then back to the
    // list), so the document-opening action is offered alongside it: Save and
    // Continue persists the invoice and opens ITS View page (/invoices/:id).
    showSaveContinue: true,
    // ERP invoice-create.html defaults: a new Export Invoice starts as a
    // CLEAN EMPTY form — no sample / demo content is injected (no company
    // data, no exporter / shipment / destination / tax / bank / signatory
    // values). Only genuine system behaviour remains: the Invoice No is
    // auto-generated, the date defaults to today (emptyForm in
    // SalesFormPage), Invoice Type defaults to Export, the Source select
    // defaults to "Direct", Status = Draft and the totals are calculated
    // zeros. Everything else is filled from the selected customer / source
    // document or typed by the user.
    defaults: {
      invoiceType: () => 'export',
      source: () => 'Direct'
    },
    // See the Proforma Invoice note — new invoices must start genuinely
    // empty; no localStorage draft restore/persist for this flow.
    draftPersistence: false,
    statuses: INVOICE_STATUSES,
    // The Invoice create/edit page mirrors the Proforma Invoice layout
    // structure (shared SalesFormPage + same section pattern) upgraded for
    // export: ONE "Invoice Details" card with the document header rows
    // (Invoice No / Date, Contract No / Date, Appendix, Exporter's Ref, PO,
    // Due Date / Reference No), the customer lookup + auto-filled customer
    // chips, Source / Source Document, the EXPORTER / MANUFACTURER block;
    // BUYER (BILL TO) and CONSIGNEE (SHIP TO) cards side by side; Export &
    // Shipment Details full width; Item Details full width; Packing | Bank
    // Details; Terms & Conditions | Authorization; Attachments last in the
    // column; Totals / Status / Remarks in the right sidebar.
    sections: [
      {
        title: 'Invoice Details',
        icon: Info,
        clientLookup: true,
        fields: [
          // Invoice Type selector (top of the card, full width).
          { key: 'invoiceType', label: 'Invoice Type', type: 'select', options: INVOICE_TYPES, beforeLookup: true, grid: 'sm:col-span-2' },
          // Header rows: auto-generated readonly Invoice No + Invoice Date +
          // export reference rows (Contract / Appendix / Exporter's Ref / PO).
          { key: 'invoiceNo', label: 'Invoice No', type: 'text', beforeLookup: true, readOnly: true, required: true },
          { key: 'invoiceDate', label: 'Invoice Date', type: 'date', beforeLookup: true, required: true },
          { key: 'contractNo', label: 'Contract No', type: 'text', beforeLookup: true, placeholder: 'Contract number', visible: isExportType },
          { key: 'contractDate', label: 'Contract Date', type: 'date', beforeLookup: true, visible: isExportType },
          { key: 'appendixNo', label: 'Appendix No', type: 'text', beforeLookup: true, placeholder: 'Appendix / PO No', visible: isExportType },
          { key: 'appendixDate', label: 'Appendix Date', type: 'date', beforeLookup: true, visible: isExportType },
          { key: 'exporterRef', label: "Exporter's Ref", type: 'text', beforeLookup: true, placeholder: "Exporter's Reference", visible: isExportType },
          { key: 'poNo', label: 'PO No', type: 'text', beforeLookup: true, placeholder: 'PO No', visible: isExportType },
          { key: 'poDate', label: 'PO Date', type: 'date', beforeLookup: true, visible: isExportType },
          { key: 'dueDate', label: 'Due Date', type: 'date', beforeLookup: true },
          { key: 'referenceNo', label: 'Reference No', type: 'text', beforeLookup: true, placeholder: 'PO / Ref No.' },
          { key: 'clientId', label: 'Client ID', type: 'hidden' },
          // Customer area: auto-filled chips appear once a customer is selected.
          { key: 'contactPerson', label: 'Contact Person', type: 'text', placeholder: 'Contact person' },
          { key: 'gstin', label: 'Customer GSTIN', type: 'display', visible: (form) => !!form.clientName },
          { key: 'pan', label: 'PAN', type: 'display', visible: (form) => !!form.clientName },
          { key: 'email', label: 'Email', type: 'display', visible: (form) => !!form.clientName },
          { key: 'phone', label: 'Phone', type: 'display', visible: (form) => !!form.clientName },
          { key: 'billingAddress', label: 'Billing Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', visible: (form) => !!form.clientName },
          // Domestic-only shipping toggle (export uses the Consignee card).
          { key: 'shipSameAsBill', label: 'Shipping address different from billing', type: 'checkbox', invert: true, hideLabel: true, grid: 'sm:col-span-2', visible: (form) => !!form.clientName && form.invoiceType === 'domestic' },
          { key: 'shippingAddress', label: 'Shipping Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', visible: (form) => !!form.clientName && form.invoiceType === 'domestic' && form.shipSameAsBill !== true },
          // Source + Source Document (existing integration: loading a source
          // document auto-fills customer and item details).
          { key: 'source', label: 'Source', type: 'select', options: INVOICE_SOURCES },
          { key: 'sourceRef', label: 'Source Document', type: 'sourceSelect' }
        ],
        groups: [
          {
            // EXPORTER / MANUFACTURER block — mirrors the Proforma Invoice
            // layout; pre-filled from the ERP company defaults (VISHAK TECH)
            // and extended with Email / Phone / LUT ARN for exports.
            title: 'EXPORTER / MANUFACTURER',
            icon: Building2,
            fields: [
              { key: 'companyName', label: 'Exporter Name', type: 'text', placeholder: 'Company / Exporter name', required: true },
              { key: 'companyGstin', label: 'GSTIN', type: 'text' },
              { key: 'companyPan', label: 'PAN', type: 'text' },
              { key: 'companyState', label: 'State', type: 'select', options: STATES, masterKey: 'states' },
              { key: 'companyEmail', label: 'Email', type: 'email' },
              { key: 'companyPhone', label: 'Phone', type: 'text' },
              { key: 'lutArn', label: 'LUT ARN', type: 'text', placeholder: 'LUT ARN / Date', visible: isExportType },
              { key: 'companyAddress', label: 'Exporter Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
            ]
          }
        ]
      },
      {
        // ROW 2 — BUYER (BILL TO) card, auto-filled from the selected customer.
        // Export / SEZ only — domestic invoices keep the classic billing/shipping
        // fields inside the Invoice Details card.
        title: 'Buyer (Bill To)',
        icon: Users,
        visible: isExportType,
        sideBySide: true,
        fields: [
          { key: 'buyerName', label: 'Buyer', type: 'text', placeholder: 'Auto-filled from customer' },
          { key: 'buyerCountry', label: 'Country', type: 'country', grid: 'sm:col-span-1', placeholder: 'Select country' },
          { key: 'buyerAddress', label: 'Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', placeholder: 'Auto-filled from customer' }
        ]
      },
      {
        // ROW 2 — CONSIGNEE (SHIP TO) card with "Same as Buyer" toggle.
        title: 'Consignee (Ship To)',
        icon: Truck,
        visible: isExportType,
        sideBySide: true,
        fields: [
          { key: 'consigneeSameAsBuyer', label: 'Same as Buyer', type: 'checkbox', hideLabel: true, grid: 'sm:col-span-2' },
          { key: 'consigneeName', label: 'Consignee Name', type: 'text', placeholder: 'Auto-filled from customer' },
          { key: 'consigneeCountry', label: 'Country', type: 'country', grid: 'sm:col-span-1', placeholder: 'Select country' },
          { key: 'consigneeAddress', label: 'Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', placeholder: 'Auto-filled from customer' }
        ]
      },
      {
        // FULL WIDTH — EXPORT & SHIPMENT DETAILS (reference document).
        title: 'Export & Shipment Details',
        icon: Ship,
        visible: isExportType,
        fields: [
          { key: 'countryOfOrigin', label: 'Country of Origin of Goods', type: 'country', required: true },
          { key: 'countryOfFinalDestination', label: 'Country of Final Destination', type: 'country', required: true },
          { key: 'preCarriageBy', label: 'Pre-Carriage By', type: 'text', placeholder: 'ROAD / SEA / AIR' },
          { key: 'placeOfReceipt', label: 'Place of Receipt', type: 'text', placeholder: 'Place of receipt' },
          { key: 'vesselFlightNo', label: 'Vessel / Flight No', type: 'text', placeholder: 'Vessel / Flight No' },
          { key: 'portOfLoading', label: 'Port of Loading', type: 'text', placeholder: 'Port of loading' },
          { key: 'portOfDischarge', label: 'Port of Discharge', type: 'text', placeholder: 'Port of discharge' },
          { key: 'portOfDelivery', label: 'Port of Delivery', type: 'text', placeholder: 'Port of delivery' },
          { key: 'hsCode', label: 'Export HS Code', type: 'text', required: true, placeholder: 'Export HS code' },
          { key: 'commodity', label: 'Commodity', type: 'text', required: true, placeholder: 'Commodity' },
          { key: 'termsOfDelivery', label: 'Terms of Delivery / Incoterms', type: 'select', options: DELIVERY_TERMS, masterKey: 'delivery_terms', placeholder: 'Select incoterms' },
          { key: 'paymentTerms', label: 'Payment Terms', type: 'select', options: PAYMENT_TERMS, masterKey: 'payment_terms', placeholder: 'Select payment terms' },
          { key: 'currency', label: 'Currency', type: 'currency', required: true },
          { key: 'taxTreatment', label: 'Tax Treatment', type: 'select', options: EXPORT_TAX_TREATMENTS, grid: 'sm:col-span-1', required: true }
        ]
      },
      {
        // PACKING DETAILS — repeatable packing entries (JSON TEXT column).
        title: 'Packing Details',
        icon: Box,
        visible: isExportType,
        sideBySide: true,
        fields: [
          { key: 'packingDetails', label: 'Packing Details', type: 'listEditor', grid: 'sm:col-span-2', packageTypes: PACKAGE_TYPES }
        ]
      },
      {
        // BANK DETAILS — extended with SWIFT / BIC for international payments.
        // Pairs with Packing Details on export invoices; stays a single card
        // (original layout) on domestic invoices.
        title: 'Bank Details',
        icon: Banknote,
        sideBySide: isExportType,
        fields: [
          { key: 'bankName', label: 'Bank Name', type: 'text' },
          { key: 'bankAccount', label: 'Account Number', type: 'text' },
          { key: 'bankSwift', label: 'SWIFT / BIC Code', type: 'text', placeholder: 'SWIFT code for export payments' },
          { key: 'bankIfsc', label: 'IFSC Code', type: 'text' },
          { key: 'bankBranch', label: 'Branch Name', type: 'text' },
          { key: 'bankType', label: 'Account Type', type: 'select', options: BANK_TYPES, masterKey: 'bank_types' },
          { key: 'bankUpi', label: 'UPI ID', type: 'text' },
          { key: 'bankAddress', label: 'Bank Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
        ]
      },
      {
        // TERMS & CONDITIONS — bottom-left card paired with Authorization on
        // export invoices; stays in the right sidebar (original layout) on
        // domestic invoices.
        title: 'Terms & Conditions',
        icon: FileText,
        sideBySide: isExportType,
        sidebar: (form) => !isExportType(form),
        fields: [
          { key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 3, grid: 'sm:col-span-2', placeholder: 'Payment terms, delivery terms, warranty...' }
        ]
      },
      {
        // AUTHORIZATION — bottom-right card (paired with Terms). Export / SEZ only.
        title: 'Authorization',
        icon: PenLine,
        visible: isExportType,
        sideBySide: true,
        fields: [
          { key: 'authorizedSignatory', label: 'Authorized Signatory', type: 'text', placeholder: 'Signatory name' },
          { key: 'designation', label: 'Designation', type: 'text', placeholder: 'Designation' },
          { key: 'place', label: 'Place', type: 'text', placeholder: 'Place' },
          { key: 'authorizationDate', label: 'Date', type: 'date' }
        ]
      },
      {
        // Right-sidebar card (section.sidebar): Remarks textarea.
        title: 'Remarks',
        icon: StickyNote,
        sidebar: true,
        fields: [
          { key: 'notes', label: 'Remarks', type: 'textarea', rows: 3, grid: 'sm:col-span-2', placeholder: 'Enter remarks...' }
        ]
      }
    ]
  },

  paymentReceipt: {
    moduleKey: 'paymentReceipt',
    showAttachments: true,
    title: 'Payment Receipt',
    docNoLabel: 'Receipt No',
    docNoKey: 'receiptNo',
    dateKey: 'paymentDate',
    showItems: false,
    showClient: true,
    showTotals: false,
    statuses: PAYMENT_RECEIPT_STATUSES,
    // ERP payment-receipt-create.html: single-column dedicated page. These
    // options are scoped here (ERP is the authority for the form dropdowns)
    // without touching the shared PAYMENT_MODES / PAYMENT_RECEIPT_STATUSES
    // used by other modules and the list-page KPI filters.
    paymentModeOptions: ['Cash', 'Cheque', 'Bank Transfer', 'DD', 'Credit Card', 'UPI', 'Online', 'Other'],
    statusOptions: ['Draft', 'Received', 'Completed'],
    // ERP defaults: company details are pre-filled.
    defaults: {
      companyName: () => 'VISHAK TECH',
      companyAddress: () => '123, Industrial Area, Bangalore'
    },
    sections: [
      companyFields(),
      {
        title: 'Receipt Details',
        icon: Banknote,
        fields: [
          { key: 'receiptNo', label: 'Receipt Number', type: 'text', placeholder: 'Auto-generated (PR-YYYY-XXXXXX)', readOnly: true },
          { key: 'paymentDate', label: 'Payment Date', type: 'date' },
          { key: 'paymentMode', label: 'Payment Mode', type: 'select', options: PAYMENT_MODES },
          { key: 'bankName', label: 'Bank Name', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text' },
          { key: 'chequeTx', label: 'Cheque No / Transaction ID', type: 'text' },
          { key: 'referenceNo', label: 'Reference No / UTR', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: PAYMENT_RECEIPT_STATUSES }
        ]
      },
      {
        title: 'Invoice Reference',
        icon: Banknote,
        fields: [
          { key: 'source', label: 'Source', type: 'select', options: PAYMENT_RECEIPT_SOURCES },
          { key: 'invoiceRef', label: 'Invoice', type: 'select', options: PAYMENT_RECEIPT_SOURCES },
          { key: 'amount', label: 'Amount Received', type: 'number', required: true }
        ]
      },
      {
        title: 'Remarks',
        icon: StickyNote,
        fields: [
          { key: 'remarks', label: 'Remarks / Notes', type: 'textarea', rows: 3, grid: 'sm:col-span-2' }
        ]
      }
    ]
  },

  creditNote: {
    moduleKey: 'creditNote',
    showAttachments: true,
    title: 'Credit Note',
    docNoLabel: 'Credit Note No',
    docNoKey: 'cnNo',
    dateKey: 'cnDate',
    showItems: true,
    showClient: true,
    showTotals: true,
    // ERP credit-note-create.html: percentage discount (Discount % input + Discount
    // Amount display), single GST row in the embedded Totals panel inside the
    // Items card, Status is a select inside the Document Details card (not a
    // sidebar card), Items + Totals + Attachments all live in the single main
    // column (no sidebar). Footer = Save Draft / Save & New / Submit for Approval.
    percentageDiscount: true,
    showWords: true,
    sidebarStatus: false,
    attachmentsInColumn: true,
    itemsAfterIndex: 3,
    itemsVariant: 'creditNote',
    statuses: CREDIT_NOTE_STATUSES,
    // Status select options (task spec): Draft / Pending Approval / Approved /
    // Rejected / Issued.
    statusOptions: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Issued'],
    // ERP defaults: company details are pre-filled (like the ERP create page).
    defaults: {
      companyName: () => 'VISHAK TECH',
      companyAddress: () => 'Building No: 3, Venkateshwara Nagar, Kavindapadi, Tamil Nadu, India - 638455',
      companyState: () => 'Tamil Nadu',
      inventoryImpact: () => 'No Impact',
      taxType: () => 'CGST + SGST',
      currency: () => 'INR'
    },
    sections: [
      companyFields(),
      {
        title: 'Credit Note Details',
        icon: FileText,
        fields: [
          { key: 'cnNo', label: 'Credit Note Number', type: 'text', placeholder: 'Auto-generated (CN-YYYY-XXXXXX)', readOnly: true },
          { key: 'cnDate', label: 'Date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select', options: CREDIT_NOTE_STATUSES },
          { key: 'source', label: 'Source', type: 'select', options: CREDIT_NOTE_SOURCES },
          { key: 'sourceRef', label: 'Source Document', type: 'select', options: CREDIT_NOTE_SOURCES }
        ]
      },
      {
        title: 'Reason & Details',
        icon: FileText,
        fields: [
          { key: 'reason', label: 'Reason for Credit Note', type: 'select', options: CREDIT_NOTE_REASONS },
          { key: 'refundAmount', label: 'Refund Amount', type: 'number' },
          { key: 'returnQty', label: 'Return Quantity', type: 'number' },
          { key: 'inventoryImpact', label: 'Inventory Impact', type: 'select', options: CREDIT_NOTE_INVENTORY_IMPACT },
          { key: 'reasonDetail', label: 'Detailed Reason / Notes', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
        ]
      }
    ]
  }
};

// ===== PACKING LIST — Packing List documents are Proforma Invoice records ====
//
// The create/edit form keeps the Proforma Invoice API/service, serialization,
// attachments, customer/contract/CPO integrations and status flow, but the
// page is restructured for the actual Packing List document: Packing List
// Details (with Invoice No. & Date + Buyer's Order No. & Date), Exporter /
// Manufacturer, Buyer / Consignee, Package Details (marks, kind, dimensions,
// totals), packing-list-specific Item Details (no price / GST columns),
// Shipping / Export Information, Destination & Terms, Declaration, and the
// packing totals (Total Packages / Quantity / Net & Gross Weight) replace the
// monetary totals card. Picked by AddProformaInvoice/EditProformaInvoice when
// the route carries ?docType=packing-list.
SALES_FORM_CONFIGS.packingList = (() => {
  const base = SALES_FORM_CONFIGS.proformaInvoice;
  // A new Packing List starts as a CLEAN EMPTY form — no sample / demo
  // content is injected (no exporter data, no shipment / destination
  // values, no package data, no declaration, no signatory). Only genuine
  // system behaviour remains: the Packing List No is auto-generated, the
  // date defaults to today (emptyForm in SalesFormPage), Status = Draft,
  // the packing totals are calculated from the entered items / packages,
  // and shipping defaults to same-as-billing (base.defaults). Everything
  // else is filled from the selected customer / contract / CPO or typed by
  // the user.
  return {
    ...base,
    // Packing List identity + layout switches.
    title: 'Packing List',
    docNoLabel: 'Packing List No',
    // A packing list record is persisted in the shared Proforma Invoice model
    // and its established View page is /proforma-invoices/:id (the same record
    // route its list row opens). Without this the post-save view went to
    // /sales-orders/packing-list/:id, which has no route.
    recordBasePath: '/proforma-invoices',
    // No monetary columns / totals on a packing list.
    itemsVariant: 'packingList',
    percentageDiscount: false,
    showWords: false,
    showRoundOff: false,
    showSend: false,
    // Aggregates are auto-synced from the line items (see SalesFormPage).
    packingTotalsFromItems: true,
    // ERP packing-list layout: Packing List Details, Buyer/Consignee pair,
    // Package Details, then Item Details full-width (reference document
    // order), then Shipping / Export Information + Destination & Terms +
    // Declaration. Right sidebar: Totals (packing aggregates), Status,
    // Remarks, Terms & Conditions, Authorized Signatory.
    itemsAfterIndex: 3,
    sidebarStatus: true,
    attachmentsInColumn: true,
    footerLabels: {
      cancel: 'Cancel',
      draft: 'Save as Draft',
      createNew: 'Save & New',
      primaryCreate: 'Save & Submit',
      primaryEdit: 'Update & Close',
      secondaryEdit: 'Save Changes'
    },
    defaults: {
      ...base.defaults
    },
    // Packing List validation (runs after the shared client/items checks).
    additionalValidation: (form, items, toast) => {
      if (!String(form.piNo || '').trim()) {
        toast.error('Packing List No is required.');
        return false;
      }
      if (!form.piDate) {
        toast.error('Packing List Date is required.');
        return false;
      }
      if (!String(form.contractNo || '').trim()) {
        toast.error('Contract No is required.');
        return false;
      }
      if (!form.contractDate) {
        toast.error('Contract Date is required.');
        return false;
      }
      if (!String(form.exporterGstin || '').trim()) {
        toast.error('GSTIN No is required.');
        return false;
      }
      if (!String(form.exporterPan || '').trim()) {
        toast.error('PAN is required.');
        return false;
      }
      if (!String(form.consigneeName || '').trim()) {
        toast.error('Consignee Name is required.');
        return false;
      }
      if (!String(form.countryOfOrigin || '').trim()) {
        toast.error('Country of Origin of Goods is required.');
        return false;
      }
      if (!String(form.preCarriageBy || '').trim()) {
        toast.error('Pre-Carriage By is required.');
        return false;
      }
      if (!String(form.placeOfReceipt || '').trim()) {
        toast.error('Place of Receipt is required.');
        return false;
      }
      if (!String(form.vesselFlightNo || '').trim()) {
        toast.error('Vessel / Flight No is required.');
        return false;
      }
      if (!String(form.portOfLoading || '').trim()) {
        toast.error('Port of Loading is required.');
        return false;
      }
      if (!String(form.countryOfFinalDestination || '').trim()) {
        toast.error('Country of Final Destination is required.');
        return false;
      }
      if (!String(form.hsCode || '').trim()) {
        toast.error('HS Code is required.');
        return false;
      }
      if (!String(form.commodity || '').trim()) {
        toast.error('Commodity is required.');
        return false;
      }
      if (!String(form.portOfDischarge || '').trim()) {
        toast.error('Port of Discharge is required.');
        return false;
      }
      if (!String(form.placeOfDelivery || '').trim()) {
        toast.error('Place of Delivery is required.');
        return false;
      }
      if (!String(form.termsOfDelivery || '').trim()) {
        toast.error('Terms of Delivery is required.');
        return false;
      }
      if (!String(form.paymentTerms || '').trim()) {
        toast.error('Payment Terms is required.');
        return false;
      }
      if (!Array.isArray(items) || items.length === 0) {
        toast.error('Add at least one item.');
        return false;
      }
      if (items.some((it) => Number(it.qty) <= 0)) {
        toast.error('Item quantity must be greater than zero.');
        return false;
      }
      return true;
    },
    sections: [
      {
        // Main card: document header rows (Packing List No / Date, Contract No /
        // Date, Appendix, Exporter's Ref, GSTIN / PAN, Reference No, Valid Till),
        // the Customer Purchase Order selector, the Customer lookup + Contact
        // Person, Invoice No. & Date, Buyer's Order No. & Date, Source / Source
        // Document, and the EXPORTER / MANUFACTURER block.
        title: 'Packing List Details',
        icon: Info,
        clientLookup: true,
        fields: [
          // Header row 1: auto-generated readonly Packing List No + Date.
          { key: 'piNo', label: 'Packing List No', type: 'text', beforeLookup: true, readOnly: true, required: true },
          { key: 'piDate', label: 'Packing List Date', type: 'date', beforeLookup: true, required: true },
          // Header: Contract No (Sales Contracts selector) + Contract Date.
          { key: 'contractNo', label: 'Contract No', type: 'select', beforeLookup: true, dynamicSource: 'salesContracts', placeholder: '-- Select Contract --', required: true },
          { key: 'contractDate', label: 'Contract Date', type: 'date', beforeLookup: true, required: true },
          // Header row 2: Appendix No / Appendix Date / Exporter's Ref.
          { key: 'appendixPoNo', label: 'Appendix No', type: 'text', beforeLookup: true, placeholder: 'Appendix / PO No' },
          { key: 'appendixDate', label: 'Appendix Date', type: 'date', beforeLookup: true },
          { key: 'exporterRef', label: "Exporter's Ref", type: 'text', beforeLookup: true, placeholder: "Exporter's Reference" },
          // Header row 3: GSTIN No / PAN (exporter tax ids) + Reference No +
          // Valid Till.
          { key: 'exporterGstin', label: 'GSTIN No', type: 'text', beforeLookup: true, placeholder: 'GSTIN', required: true },
          { key: 'exporterPan', label: 'PAN', type: 'text', beforeLookup: true, placeholder: 'PAN', required: true },
          { key: 'referenceNo', label: 'Reference No', type: 'text', beforeLookup: true, placeholder: 'PO / Reference No.' },
          { key: 'validTill', label: 'Valid Till', type: 'date', beforeLookup: true },
          // Customer Purchase Order selector (existing CPO integration).
          { key: 'sourceRef', label: 'Customer Purchase Order', type: 'select', beforeLookup: true, dynamicSource: 'salesOrders', placeholder: '-- Select CPO --' },
          { key: 'clientId', label: 'Client ID', type: 'hidden' },
          // Contact Person (the Customer itself is the existing lookup above).
          { key: 'contactPerson', label: 'Contact Person', type: 'text', placeholder: 'Contact person' },
          // Reference rows: Invoice No. & Date + Buyer's Order No. & Date.
          { key: 'invoiceNo', label: 'Invoice No', type: 'text', placeholder: 'Invoice No.' },
          { key: 'invoiceDate', label: 'Invoice Date', type: 'date' },
          { key: 'buyersOrderNo', label: "Buyer's Order No", type: 'text', placeholder: "Buyer's Order No." },
          { key: 'buyersOrderDate', label: "Buyer's Order Date", type: 'date' },
          // Existing Source / Source Document integration.
          { key: 'source', label: 'Source', type: 'select', options: PROFORMA_SOURCES },
          { key: 'sourceRef', label: 'Source Document', type: 'text' }
        ],
        groups: [
          {
            // EXPORTER / MANUFACTURER block — pre-filled with the ERP company
            // default (VISHAK TECH) and fully editable.
            title: 'EXPORTER / MANUFACTURER',
            icon: Building2,
            fields: [
              { key: 'exporterName', label: 'Exporter Name', type: 'text', placeholder: 'Exporter / Manufacturer name', required: true },
              { key: 'exporterAddress', label: 'Exporter Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' },
              { key: 'exporterEmail', label: 'Email', type: 'email' },
              { key: 'exporterPhone', label: 'Phone', type: 'text' }
            ]
          }
        ]
      },
      {
        // BUYER card — separate from the consignee (reference: consignee may
        // differ from the buyer).
        title: 'Buyer',
        icon: Users,
        sideBySide: true,
        fields: [
          { key: 'buyerName', label: 'Buyer Name', type: 'text', placeholder: 'Auto-filled from customer' },
          { key: 'buyerAddress', label: 'Buyer Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2' }
        ]
      },
      {
        // CONSIGNEE card — auto-filled from the selected customer / contract.
        title: 'Consignee',
        icon: Truck,
        sideBySide: true,
        fields: [
          { key: 'consigneeName', label: 'Consignee Name', type: 'text', placeholder: 'Auto-filled from customer', required: true },
          { key: 'consigneeAddress', label: 'Consignee Address', type: 'textarea', rows: 2, grid: 'sm:col-span-2', required: true }
        ]
      },
      {
        // PACKAGE DETAILS — package-level summary (marks, kind, dimensions and
        // the aggregate totals that also drive the right-side Totals card).
        title: 'Package Details',
        icon: Box,
        fields: [
          { key: 'packageMarksNos', label: 'Marks & Nos / Container No', type: 'text', placeholder: 'Marks & Nos / Container No' },
          { key: 'packageNoKindPkgs', label: 'No. & Kind of Packages', type: 'text', placeholder: 'No. & kind of packages' },
          { key: 'packageDimensions', label: 'Package Dimensions (L × W × H)', type: 'text', placeholder: 'L × W × H in mm' },
          { key: 'totalPackages', label: 'Total Packages', type: 'number', min: 0, step: '1' },
          { key: 'totalQty', label: 'Total Quantity', type: 'number', min: 0, step: '1' },
          { key: 'netWeight', label: 'Net Weight (KGS)', type: 'number', min: 0, step: '0.01' },
          { key: 'grossWeight', label: 'Gross Weight (KGS)', type: 'number', min: 0, step: '0.01' }
        ]
      },
      {
        // SHIPPING / EXPORT INFORMATION — reference packing list block.
        // Paired side-by-side with Destination & Terms so the two small cards
        // fill the row instead of stacking full-width.
        title: 'Shipping / Export Information',
        icon: Ship,
        sideBySide: true,
        fields: [
          { key: 'countryOfOrigin', label: 'Country of Origin of Goods', type: 'country', required: true },
          { key: 'preCarriageBy', label: 'Pre-Carriage By', type: 'text', required: true, placeholder: 'ROAD / SEA / AIR' },
          { key: 'placeOfReceipt', label: 'Place of Receipt', type: 'text', required: true, placeholder: 'Place of receipt' },
          { key: 'vesselFlightNo', label: 'Vessel / Flight No', type: 'text', required: true, placeholder: 'Vessel / Flight No' },
          { key: 'portOfLoading', label: 'Port of Loading', type: 'text', required: true, placeholder: 'Port of loading' }
        ]
      },
      {
        // DESTINATION & TERMS — reference packing list block.
        title: 'Destination & Terms',
        icon: MapPin,
        sideBySide: true,
        fields: [
          { key: 'countryOfFinalDestination', label: 'Country of Final Destination', type: 'country', required: true },
          { key: 'hsCode', label: 'HS Code', type: 'text', required: true, placeholder: 'HS code' },
          { key: 'commodity', label: 'Commodity', type: 'text', required: true, placeholder: 'Commodity' },
          { key: 'portOfDischarge', label: 'Port of Discharge', type: 'text', required: true, placeholder: 'Port of discharge' },
          { key: 'placeOfDelivery', label: 'Place of Delivery', type: 'text', required: true, placeholder: 'Place of delivery' },
          { key: 'termsOfDelivery', label: 'Terms of Delivery', type: 'select', options: DELIVERY_TERMS, masterKey: 'delivery_terms', placeholder: 'Select incoterms', required: true },
          { key: 'paymentTerms', label: 'Payment Terms', type: 'select', options: PAYMENT_TERMS, masterKey: 'payment_terms', placeholder: 'Select payment terms', required: true }
        ]
      },
      {
        // DECLARATION — editable packing list declaration text.
        title: 'Declaration',
        icon: ClipboardList,
        fields: [
          { key: 'declaration', label: 'Declaration', type: 'textarea', rows: 3, grid: 'sm:col-span-2', required: true, placeholder: 'Enter the declaration text' }
        ]
      },
      {
        // Right-sidebar card: Remarks.
        title: 'Remarks',
        icon: StickyNote,
        sidebar: true,
        fields: [
          { key: 'notes', label: 'Remarks', type: 'textarea', rows: 3, grid: 'sm:col-span-2', placeholder: 'Enter remarks...' }
        ]
      },
      {
        // Right-sidebar card: Terms & Conditions.
        title: 'Terms & Conditions',
        icon: FileText,
        sidebar: true,
        fields: [
          { key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 3, grid: 'sm:col-span-2', placeholder: 'Enter terms and conditions...' }
        ]
      },
      {
        // Right-sidebar card: Authorized Signatory (For VISHAK TECH + signature
        // upload + label).
        title: 'Authorized Signatory',
        icon: PenLine,
        sidebar: true,
        fields: [
          { key: 'authorizedSignatory', label: 'Authorized Signatory', type: 'text', placeholder: 'Authorized Signatory' },
          { key: 'companyStamp', label: 'Signature Upload', type: 'stampUpload', grid: 'sm:col-span-2' }
        ]
      }
    ]
  };
})();

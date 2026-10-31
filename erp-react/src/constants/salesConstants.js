// ===== Shared Sales Execution constants (mirrors the original ERP dropdowns) =====

export const CITIES = [
  'Chennai',
  'Bangalore',
  'Mumbai',
  'Hyderabad',
  'Delhi',
  'Pune',
  'Ahmedabad',
  'Kolkata'
];

export const STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

export const PAYMENT_TERMS = ['30 Days', '45 Days', '60 Days', 'Advance', 'COD'];

export const DELIVERY_TERMS = [
  'Ex-Works',
  'FOB',
  'CIF',
  'CFR',
  'FOR',
  'Door Delivery',
  'Freight Paid',
  'Freight To Pay'
];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

// Invoice Type selector on the Invoice create/edit page: Domestic keeps the
// classic GST workflow, Export / SEZ unlock the export-specific sections.
export const INVOICE_TYPES = [
  { value: 'domestic', label: 'Domestic Invoice' },
  { value: 'export', label: 'Export Invoice' },
  { value: 'sez', label: 'SEZ Invoice' }
];

// Export tax treatment options (reference document uses LUT / Bond).
export const EXPORT_TAX_TREATMENTS = [
  'Export under LUT / Bond - Without IGST',
  'Export with IGST'
];

// Packing Details package types.
export const PACKAGE_TYPES = ['Wooden Box', 'Carton Box', 'Pallet', 'Crate', 'Drum', 'Bag', 'Bale', 'Other'];

// Configure GST options in the original ERP quotation form
export const TAX_TYPES = ['GST', 'IGST', 'CGST+SGST', 'VAT', 'No Tax'];

export const NUMBER_FORMATS = [
  { value: 'Indian', label: 'Indian (1,23,456.78)' },
  { value: 'Standard', label: 'Standard (123,456.78)' }
];

export const SIGNATURE_TYPES = ['Upload Signature', 'Use Signature Pad'];

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];

export const PRIORITIES = ['High', 'Medium', 'Low'];

export const SALES_EXECUTIVES = [
  'Kavya Krishnan',
  'Raghav Menon',
  'Divya Nair',
  'Arun Pillai',
  'Sneha Iyer',
  'Vikram Rao',
  'Priya Menon'
];

export const DURATIONS = [
  '1 Month',
  '3 Months',
  '6 Months',
  '1 Year',
  '2 Years',
  '3 Years',
  '5 Years'
];

export const WARRANTY = ['3 Months', '6 Months', '1 Year', '2 Years', '3 Years'];

// Transport companies in the original ERP delivery challan form
export const TRANSPORT_COMPANIES = ['Blue Dart', 'DTDC', 'VRL Logistics', 'Gati', 'Delhivery', 'Self', 'Other'];

/**
 * The kinds of signed paperwork a Sales Contract's Upload Documents panel can
 * file a document under:
 *
 *   E-Sign       — the digitally signed contract document
 *   Scanned Copy — a scan of the signed / physical contract
 *
 * The stored value IS the label (the backend keeps it on the attachment row),
 * so the attachment list shows exactly what the user picked. Other sales modules
 * pass no categories at all and keep uploading unlabelled attachments.
 */
export const SALES_CONTRACT_ATTACHMENT_CATEGORIES = ['E-Sign', 'Scanned Copy'];

// ===== Module statuses (from the original ERP list-page filters) =====

export const QUOTATION_STATUSES = [
  'Draft',
  'Sent',
  'Accepted',
  'Rejected',
  'Negotiation',
  'Expired',
  'Cancelled',
  'Converted'
];

export const SALES_CONTRACT_STATUSES = [
  'Draft',
  'Submitted',
  'Under Review',
  'Approved',
  'Active',
  'Completed',
  'Cancelled'
];

export const SALES_ORDER_STATUSES = [
  'Draft',
  'Pending Review',
  'Approved',
  'In Progress',
  'Completed',
  'Cancelled'
];

export const DELIVERY_CHALLAN_STATUSES = [
  'Draft',
  'Packed',
  'Dispatched',
  'In Transit',
  'Delivered',
  'Cancelled'
];

export const PROFORMA_INVOICE_STATUSES = [
  'Draft',
  'Sent',
  'Paid',
  'Overdue',
  'Accepted',
  'Expired',
  'Converted',
  'Cancelled'
];

export const INVOICE_STATUSES = [
  'Draft',
  'Issued',
  'Sent',
  'Partial',
  'Paid',
  'Overdue',
  'Cancelled'
];

export const PAYMENT_RECEIPT_STATUSES = ['Draft', 'Received', 'Partial', 'Completed', 'Cancelled'];

export const CREDIT_NOTE_STATUSES = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Rejected',
  'Issued',
  'Adjusted',
  'Refunded',
  'Cancelled'
];

// Settlement options for the credit / adjustment amount.
export const SETTLEMENT_METHODS = ['Adjust Against Invoice', 'Customer Credit', 'Refund'];

export const PAYMENT_MODES = ['Cash', 'Cheque', 'Bank Transfer', 'UPI', 'Card'];

export const CREDIT_NOTE_REASONS = [
  'Sales Return',
  'Rate Difference',
  'Tax Difference',
  'Post-Sale Discount',
  'Invoice Cancellation',
  'Damaged Goods',
  'Other'
];

export const CREDIT_NOTE_INVENTORY_IMPACT = ['No Impact', 'Return to Stock', 'Write Off'];

// Sources from the original ERP proforma / invoice / receipt / credit-note forms.
// IMPORTANT: option VALUES are the ERP short codes ('' = Direct, dc, so, pi, inv,
// pr) exactly as in the ERP HTML selects — the backend conversion flow persists
// those codes, so the edit form can pre-select the saved value. Labels are the
// display strings shown to the user.
export const PROFORMA_SOURCES = [
  { value: '', label: 'Direct' },
  { value: 'dc', label: 'From Delivery Challan' },
  { value: 'so', label: 'From Customer Purchase Order' }
];

export const INVOICE_SOURCES = [
  { value: '', label: 'Direct' },
  { value: 'pi', label: 'From Proforma Invoice' },
  { value: 'dc', label: 'From Delivery Challan' },
  // A Customer Purchase Order is a valid invoice source: the existing
  // one-click CPO → Invoice conversion stores source='so' + sourceRef=<CPO no>,
  // so the invoice form can carry the same reference when it is raised from a
  // CPO (prefilled, editable) instead of posting that conversion.
  { value: 'so', label: 'From Customer Purchase Order' }
];

export const PAYMENT_RECEIPT_SOURCES = [
  { value: '', label: 'Direct' },
  { value: 'inv', label: 'From Invoice' }
];

export const CREDIT_NOTE_SOURCES = [
  { value: '', label: 'Direct' },
  { value: 'inv', label: 'Invoice' },
  { value: 'so', label: 'Customer Purchase Order' }
];

// Human-readable label for any stored source value (short code, legacy display
// string, or the backend conversion code "quotation").
export const SOURCE_LABELS = {
  '': 'Direct',
  Direct: 'Direct',
  dc: 'From Delivery Challan',
  so: 'From Customer Purchase Order',
  pi: 'From Proforma Invoice',
  inv: 'From Invoice',
  pr: 'From Payment Receipt',
  quotation: 'From Quotation',
  'From Delivery Challan': 'From Delivery Challan',
  'From Sales Order': 'From Customer Purchase Order',
  'From Customer Purchase Order': 'From Customer Purchase Order',
  'From Proforma Invoice': 'From Proforma Invoice',
  'From Invoice': 'From Invoice',
  'From Payment Receipt': 'From Payment Receipt'
};

// Map any stored source value (short code or legacy display string) to the ERP
// short code used by the Source selects, so the edit form pre-selects the saved
// value regardless of how the record was created.
export function normalizeSourceValue(value) {
  if (value == null || value === '') return '';
  const byLabel = {
    Direct: '',
    'From Delivery Challan': 'dc',
    'From Sales Order': 'so',
    'From Customer Purchase Order': 'so',
    'From Proforma Invoice': 'pi',
    'From Invoice': 'inv',
    'From Payment Receipt': 'pr'
  };
  return byLabel[value] ?? value;
}

export const BANK_TYPES = ['Current Account', 'Savings Account', 'Overdraft'];

// ===== Generic utility options =====

export const UNITS = ['kg', 'ton', 'mtr', 'sqm', 'sheet', 'nos', 'pcs', 'set', 'box', 'roll'];

export const DOC_PREFIXES = {
  quotation: 'QTN',
  salesContract: 'SC',
  salesOrder: 'SO',
  deliveryChallan: 'DC',
  proformaInvoice: 'PI',
  invoice: 'INV',
  paymentReceipt: 'PR',
  creditNote: 'CN'
};

export const MODULE_LABELS = {
  quotation: 'Quotation',
  salesContract: 'Sales Contract',
  salesOrder: 'Customer Purchase Order',
  deliveryChallan: 'Delivery Challan',
  proformaInvoice: 'Proforma Invoice',
  invoice: 'Invoice',
  paymentReceipt: 'Payment Receipt',
  creditNote: 'Credit Note'
};

// ===== Complete international currency list (ISO codes + names) =====
// Displayed as "CODE - Name" in the currency dropdown and searchable by code or
// name. The selected value stored in the document remains the currency CODE, so
// the existing data model, formatting, GST and totals logic are untouched.
export const ALL_CURRENCIES = [
  { code: 'AFN', name: 'Afghan Afghani' },
  { code: 'ALL', name: 'Albanian Lek' },
  { code: 'AMD', name: 'Armenian Dram' },
  { code: 'AOA', name: 'Angolan Kwanza' },
  { code: 'ARS', name: 'Argentine Peso' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'AZN', name: 'Azerbaijani Manat' },
  { code: 'BAM', name: 'Bosnia and Herzegovina Convertible Mark' },
  { code: 'BBD', name: 'Barbadian Dollar' },
  { code: 'BDT', name: 'Bangladeshi Taka' },
  { code: 'BGN', name: 'Bulgarian Lev' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'BIF', name: 'Burundian Franc' },
  { code: 'BMD', name: 'Bermudian Dollar' },
  { code: 'BND', name: 'Brunei Dollar' },
  { code: 'BOB', name: 'Bolivian Boliviano' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'BSD', name: 'Bahamian Dollar' },
  { code: 'BTN', name: 'Bhutanese Ngultrum' },
  { code: 'BWP', name: 'Botswana Pula' },
  { code: 'BYN', name: 'Belarusian Ruble' },
  { code: 'BZD', name: 'Belize Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CDF', name: 'Congolese Franc' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CLP', name: 'Chilean Peso' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'COP', name: 'Colombian Peso' },
  { code: 'CRC', name: 'Costa Rican Colón' },
  { code: 'CUP', name: 'Cuban Peso' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'DJF', name: 'Djiboutian Franc' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'DOP', name: 'Dominican Peso' },
  { code: 'DZD', name: 'Algerian Dinar' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'ERN', name: 'Eritrean Nakfa' },
  { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'EUR', name: 'Euro' },
  { code: 'FJD', name: 'Fijian Dollar' },
  { code: 'FKP', name: 'Falkland Islands Pound' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'GEL', name: 'Georgian Lari' },
  { code: 'GHS', name: 'Ghanaian Cedi' },
  { code: 'GIP', name: 'Gibraltar Pound' },
  { code: 'GTQ', name: 'Guatemalan Quetzal' },
  { code: 'GYD', name: 'Guyanese Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'HNL', name: 'Honduran Lempira' },
  { code: 'HRK', name: 'Croatian Kuna' },
  { code: 'HTG', name: 'Haitian Gourde' },
  { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'ILS', name: 'Israeli New Shekel' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'IQD', name: 'Iraqi Dinar' },
  { code: 'IRR', name: 'Iranian Rial' },
  { code: 'ISK', name: 'Icelandic Krona' },
  { code: 'JMD', name: 'Jamaican Dollar' },
  { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'KHR', name: 'Cambodian Riel' },
  { code: 'KPW', name: 'North Korean Won' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'KZT', name: 'Kazakhstani Tenge' },
  { code: 'LAK', name: 'Lao Kip' },
  { code: 'LBP', name: 'Lebanese Pound' },
  { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'LYD', name: 'Libyan Dinar' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'MKD', name: 'Macedonian Denar' },
  { code: 'MMK', name: 'Myanmar Kyat' },
  { code: 'MNT', name: 'Mongolian Tögrög' },
  { code: 'MOP', name: 'Macanese Pataca' },
  { code: 'MUR', name: 'Mauritian Rupee' },
  { code: 'MVR', name: 'Maldivian Rufiyaa' },
  { code: 'MWK', name: 'Malawian Kwacha' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'MZN', name: 'Mozambican Metical' },
  { code: 'NAD', name: 'Namibian Dollar' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'NIO', name: 'Nicaraguan Córdoba' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'NPR', name: 'Nepalese Rupee' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'PAB', name: 'Panamanian Balboa' },
  { code: 'PEN', name: 'Peruvian Sol' },
  { code: 'PGK', name: 'Papua New Guinea Kina' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'PYG', name: 'Paraguayan Guarani' },
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'RON', name: 'Romanian Leu' },
  { code: 'RSD', name: 'Serbian Dinar' },
  { code: 'RUB', name: 'Russian Ruble' },
  { code: 'RWF', name: 'Rwandan Franc' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'SCR', name: 'Seychellois Rupee' },
  { code: 'SDG', name: 'Sudanese Pound' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'SLE', name: 'Sierra Leone Leone' },
  { code: 'SOS', name: 'Somali Shilling' },
  { code: 'SRD', name: 'Surinamese Dollar' },
  { code: 'SSP', name: 'South Sudanese Pound' },
  { code: 'STN', name: 'São Tomé and Príncipe Dobra' },
  { code: 'SYP', name: 'Syrian Pound' },
  { code: 'SZL', name: 'Eswatini Lilangeni' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'TJS', name: 'Tajikistani Somoni' },
  { code: 'TMT', name: 'Turkmenistani Manat' },
  { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'TOP', name: 'Tongan Paʻanga' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'TTD', name: 'Trinidad and Tobago Dollar' },
  { code: 'TWD', name: 'New Taiwan Dollar' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UAH', name: 'Ukrainian Hryvnia' },
  { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'USD', name: 'United States Dollar' },
  { code: 'UYU', name: 'Uruguayan Peso' },
  { code: 'UZS', name: 'Uzbekistani Som' },
  { code: 'VES', name: 'Venezuelan Bolívar' },
  { code: 'VND', name: 'Vietnamese Đồng' },
  { code: 'VUV', name: 'Vanuatu Vatu' },
  { code: 'WST', name: 'Samoan Tala' },
  { code: 'XAF', name: 'Central African CFA Franc' },
  { code: 'XCD', name: 'East Caribbean Dollar' },
  { code: 'XDR', name: 'Special Drawing Rights' },
  { code: 'XOF', name: 'West African CFA Franc' },
  { code: 'XPF', name: 'CFP Franc' },
  { code: 'YER', name: 'Yemeni Rial' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'ZWL', name: 'Zimbabwean Dollar' }
];

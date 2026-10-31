/**
 * purchase/validation/requisition.js
 * ------------------------------------------------------------------
 * Zod schemas for the Purchase Requisition form (React Hook Form +
 * zodResolver).
 * ------------------------------------------------------------------
 */
import { z } from 'zod';
import { UNITS } from '../constants';

/** Shared attachment record shape (uploaded + seeded attachments). */
export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  /* dataUrl OR one of the URL aliases must exist (server-backed
     attachments may arrive with only downloadUrl/fileUrl/storagePath). */
  dataUrl: z.string().optional(),
  /* optional URL aliases for server-backed attachments */
  downloadUrl: z.string().optional(),
  fileUrl: z.string().optional(),
  storagePath: z.string().optional(),
  /* upload metadata */
  uploadedAt: z.string().optional(),
  uploadedBy: z.string().optional()
});

export const purchaseItemSchema = z.object({
  itemCode: z.string().optional(),
  /* CPR-derived line details — optional so existing rows and every
     other document type using this schema are unaffected. */
  drawingNo: z.string().optional(),
  specification: z.string().optional(),
  /* Per-item attachments ({name, size, type, data}) transferred from the
     CPR item grid. */
  attachments: z.array(z.any()).optional(),
  product: z.string().min(2, 'Item description is required'),
  category: z.string().optional(),
  hsn: z.string().optional(),
  uom: z.string().optional(),
  qty: z.coerce.number().min(0.01, 'Quantity must be greater than 0'),
  rate: z.coerce.number().min(0.01, 'Rate must be greater than 0'),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').max(100, 'Discount cannot exceed 100%').optional(),
  gstRate: z.coerce.number().min(0, 'GST rate cannot be negative').max(100, 'GST rate cannot exceed 100%'),
  remarks: z.string().optional()
});

/** Rejects duplicate item descriptions within a document. */
export function uniqueItemDescriptions(items = []) {
  const seen = new Set();
  const duplicates = [];
  items.forEach((item, index) => {
    const key = String(item?.product || '').trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) duplicates.push(index);
    seen.add(key);
  });
  return duplicates;
}

export const purchaseRequestSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  /* PR Date — MUST be declared: zodResolver strips every field absent
     from this schema, so without it `date` was silently dropped from the
     API payload and the backend rejected creation with
     "Request date is required" (HTTP 400). Format is the <input type=date>
     wire format (yyyy-MM-dd), which the backend parses verbatim. */
  date: z
    .string()
    .min(1, 'PR Date is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'PR Date must use the YYYY-MM-DD format'),
  department: z.string().min(1, 'Department is required'),
  project: z.string().optional(),
  requester: z.string().min(1, 'Requester is required'),
  buyer: z.string().optional(),
  priority: z.string().optional(),
  currency: z.string().optional(),
  vendor: z.string().optional(),
  gstType: z.string().optional(),
  incoterm: z.string().optional(),
  transportMode: z.string().optional(),
  warehouse: z.string().optional(),
  costCenter: z.string().optional(),
  location: z.string().optional(),
  deliveryAddress: z.string().optional(),
  company: z.string().optional(),
  branch: z.string().optional(),
  /* PR Type — classifies the procurement as Capital, Operational, or
     Commercial. Optional so existing records without a type are unaffected. */
  prType: z.string().min(1, 'PR Type is required'),
  /* CPR-derived header details — all optional so the existing
     validation behaviour and messages are unchanged. `status` stays
     workflow-driven: the service layer decides the persisted status. */
  status: z.string().optional(),
  referencePrNo: z.string().optional(),
  quotationDeadline: z.string().optional(),
  extendedDeadline: z.string().optional(),
  expectedDate: z.string().min(1, 'Required date is required'),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').max(100, 'Discount cannot exceed 100%'),
  charges: z.coerce.number().min(0, 'Charges cannot be negative'),
  terms: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  remarks: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one item')
}).superRefine((values, ctx) => {
  if (
    values.date &&
    values.expectedDate &&
    values.expectedDate < values.date
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedDate'],
      message: 'Required date cannot be before PR date'
    });
  }
});

export const rfqItemSchema = z.object({
  product: z.string().min(2, 'Item description is required'),
  /* PR-origin fields — declared here so zod's default strip mode never
     drops them when an RFQ is saved from the form. `itemCode` is the
     link back to the originating PR line item. */
  itemCode: z.string().optional(),
  category: z.string().optional(),
  specification: z.string().optional(),
  requiredDate: z.string().optional(),
  hsn: z.string().optional(),
  uom: z.string().optional(),
  qty: z.coerce.number().min(0.01, 'Quantity must be greater than 0'),
  /* The shared PurchaseItemTable grid binds `rate`; RfqForm maps it back
     to the RFQ's stored `expectedRate` at save time (see cleanRfqItems).
     Validation rules and messages are unchanged. */
  rate: z.coerce.number().min(0, 'Estimated rate cannot be negative')
});

export const rfqSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  reference: z.string().optional(),
  /* Ownership / scope fields carried over from the linked PR — declared
     here (even though the form has no visible Project / Description
     inputs) so zod's default strip mode never drops them on save. */
  requester: z.string().optional(),
  project: z.string().optional(),
  description: z.string().optional(),
  vendorNames: z.array(z.string()).min(1, 'Select at least one vendor'),
  department: z.string().optional(),
  buyer: z.string().optional(),
  priority: z.string().optional(),
  validity: z.coerce.number({ invalid_type_error: 'Validity must be at least 1 day' }).int().min(1, 'Validity must be at least 1 day').optional(),
  dueDate: z.string().optional(),
  currency: z.string().optional(),
  incoterm: z.string().optional(),
  deliveryAddress: z.string().optional(),
  notes: z.string().optional(),
  commercialTerms: z.object({
    paymentTerms: z.string().optional(),
    deliveryTerms: z.string().optional(),
    warranty: z.string().optional(),
    taxRate: z.coerce.number().min(0, 'Tax rate cannot be negative').optional(),
    freight: z.string().optional(),
    insurance: z.string().optional()
  }).optional(),
  attachments: z.array(attachmentSchema).optional(),
  items: z.array(rfqItemSchema).min(1, 'Add at least one item')
});

export const purchaseOrderSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  vendor: z.string().min(1, 'Vendor is required'),
  reference: z.string().optional(),
  rfqNo: z.string().optional(),
  quotationNo: z.string().optional(),
  orderDate: z.string().optional(),
  expectedDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  currency: z.string().optional(),
  terms: z.string().optional(),
  gstType: z.string().optional(),
  incoterm: z.string().optional(),
  transportMode: z.string().optional(),
  warehouse: z.string().optional(),
  /* Budget-control dimensions — the same fields the approval rules and
     budget master condition on. Optional for backwards compatibility. */
  department: z.string().optional(),
  project: z.string().optional(),
  costCenter: z.string().optional(),
  location: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryInstructions: z.string().optional(),
  /* Commercial values carried forward from the upstream RFQ / quotation
     chain (NFA → PO conversion). Optional so the blank create form and
     every other consumer are unaffected; when present they persist on
     the PO so the converted order is a complete continuation of the
     approved record. */
  deliveryTerms: z.string().optional(),
  warranty: z.string().optional(),
  freight: z.coerce.number().min(0, 'Freight cannot be negative').optional(),
  insurance: z.coerce.number().min(0, 'Insurance cannot be negative').optional(),
  paymentTerms: z.any().nullable().optional(),
  paymentTermsRequired: z.boolean().optional(),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').max(100, 'Discount cannot exceed 100%'),
  charges: z.coerce.number().min(0, 'Charges cannot be negative'),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  vendorNotes: z.string().optional(),
  termsAndConditions: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one item')
});

/** Schema for a Purchase Invoice. */
export const invoiceSchema = z.object({
  vendor: z.string().min(1, 'Vendor is required'),
  vendorEmail: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  /* RULE: an invoice must reference a valid purchase order. */
  poNo: z.string().min(1, 'PO reference is required'),
  grnNo: z.string().optional(),
  /* RULE: the vendor's own invoice number is mandatory and may not
     repeat for the same vendor (enforced by the invoice service). */
  vendorInvoiceNo: z.string().min(1, 'Vendor invoice number is required'),
  vendorReference: z.string().optional(),
  invoiceType: z.string().optional(),
  invoiceNo: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  gst: z.coerce.number().min(0, 'GST cannot be negative'),
  gstType: z.string().optional(),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').optional(),
  charges: z.coerce.number().min(0, 'Charges cannot be negative').optional(),
  paymentMethod: z.string().optional(),
  paymentTerms: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        product: z.string(),
        hsn: z.string().optional(),
        uom: z.string().optional(),
        orderQty: z.coerce.number().optional(),
        received: z.coerce.number().optional(),
        qty: z.coerce.number(),
        rate: z.coerce.number(),
        discount: z.coerce.number().optional(),
        gstRate: z.coerce.number().optional()
      })
    )
    .optional(),
  attachments: z.array(attachmentSchema).optional()
});

/**
 * Required map coordinate with range + clear message. Pre-processing
 * turns null / undefined / empty-string into NaN so an untouched field
 * fails validation instead of coercing to 0.
 */
function requiredCoordinate(message, min, max) {
  return z.preprocess(
    (value) => (value === null || value === undefined || value === '' ? Number.NaN : Number(value)),
    z
      .number({ invalid_type_error: message })
      .refine((value) => Number.isFinite(value), message)
      .refine((value) => value >= min && value <= max, `Value must be between ${min} and ${max}`)
  );
}

/** Schema for a Vendor (registration + edit). */
export const vendorSchema = z.object({
  name: z.string().min(2, 'Vendor name is required'),
  /* Declared so the resolver keeps the field: zod strips keys that are
     not in the schema, which silently dropped the registration date
     from every create/update payload. */
  registrationDate: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  city: z.string().optional(),
  state: z.string().optional(),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().regex(/^[+0-9][0-9 ()-]{7,17}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  website: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Enter a valid 15-char GSTIN').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
  latitude: z.preprocess(
    (value) => (value === null || value === undefined || value === '' ? undefined : Number(value)),
    z.number().refine((value) => !Number.isFinite(value) || (value >= -90 && value <= 90), 'Value must be between -90 and 90').optional()
  ),
  longitude: z.preprocess(
    (value) => (value === null || value === undefined || value === '' ? undefined : Number(value)),
    z.number().refine((value) => !Number.isFinite(value) || (value >= -180 && value <= 180), 'Value must be between -180 and 180').optional()
  ),
  formattedAddress: z.string().optional(),
  googleMapsUrl: z.string().optional(),
  paymentTerms: z.string().optional(),
  currency: z.string().optional(),
  leadTimeDays: z.coerce.number().min(0, 'Lead time cannot be negative'),
  status: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  /* ── Supplier Master fields ──────────────────────────────────────── */
  /* Legal identity + operational status. */
  legalName: z.string().optional(),
  legalType: z.string().optional(),
  cin: z.string().optional(),
  incorporationDate: z.string().optional(),
  msmeRegNo: z.string().optional(),
  msmeType: z.string().optional(),
  active: z.boolean().optional(),
  /* Tax details. */
  tan: z.string().optional(),
  /* Categories beyond the primary one. */
  categories: z.array(z.string()).optional(),
  /* Credit limit — the supplier may carry a sanctioned credit limit in
     a currency with a due-day basis; utilisation is derived from the
     live invoice ledger. */
  creditLimit: z
    .object({
      amount: z.coerce.number().min(0, 'Credit limit cannot be negative').optional(),
      currency: z.string().optional(),
      days: z.coerce.number().min(0, 'Credit days cannot be negative').optional()
    })
    .optional(),
  /* Additional addresses / contacts — the registered office and primary
     contact live on the flat fields; these lists extend them. */
  addresses: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.string().optional(),
        line: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
        email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
        phone: z.string().optional(),
        isDefault: z.boolean().optional()
      })
    )
    .optional(),
  contacts: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1, 'Contact name is required').optional(),
        designation: z.string().optional(),
        role: z.string().optional(),
        email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
        phone: z.string().optional(),
        isPrimary: z.boolean().optional()
      })
    )
    .optional(),
  bankDetails: z
    .array(
      z.object({
        id: z.string().optional(),
        accountName: z.string().optional(),
        bankName: z.string().optional(),
        branch: z.string().optional(),
        accountNumber: z.string().optional(),
        ifsc: z.string().optional(),
        swift: z.string().optional(),
        currency: z.string().optional(),
        isDefault: z.boolean().optional()
      })
    )
    .optional(),
  contracts: z
    .array(
      z.object({
        id: z.string().optional(),
        contractNo: z.string().optional(),
        title: z.string().optional(),
        type: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        value: z.coerce.number().min(0, 'Contract value cannot be negative').optional(),
        currency: z.string().optional(),
        status: z.string().optional(),
        notes: z.string().optional()
      })
    )
    .optional()
});

/**
 * Schema for the RFQ Follow-up Create / Edit form. Mirrors the same
 * required fields the legacy modal enforced (RFQ, vendor, follow-up
 * date, assignee) with the same messages.
 */
export const rfqFollowUpSchema = z.object({
  rfqNo: z.string().min(1, 'Select the RFQ this follow-up is for.'),
  vendor: z.string().min(1, 'Vendor is required.'),
  type: z.string().min(1, 'Follow-up type is required.'),
  priority: z.string().optional(),
  followUpDate: z.string().min(1, 'Follow-up date is required.'),
  followUpTime: z.string().optional(),
  assignedTo: z.string().min(1, 'Assigned To is required.'),
  notes: z.string().optional(),
  reminder: z.boolean().optional()
});

export const defaultUom = UNITS[0];
export const defaultGstRate = 18;

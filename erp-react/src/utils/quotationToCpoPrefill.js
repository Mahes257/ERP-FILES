/**
 * utils/quotationToCpoPrefill.js
 * ---------------------------------------------------------------------------
 * Quotation → Customer Purchase Order (CPO) pre-fill.
 *
 * "Convert to Customer Purchase Order" opens the EXISTING CPO creation form
 * with the quotation's persisted data already filled in, so the user reviews
 * (and may still edit) everything before their own Save creates the CPO:
 *
 *   /sales-orders/new?fromQuotation=<quotation id>
 *
 * The mapping is deliberately one-way and value-for-value: it copies only the
 * fields both documents really share, and never touches CPO-only fields (CPO
 * number, Customer PO, release instructions, status) which stay independent.
 *
 * Calculations are NOT performed here: qty / rate / discount / GST are copied
 * as they are on the quotation, and the CPO form (and the backend's own
 * recalcTotals) compute the line and document totals exactly as they do for a
 * manually entered CPO.
 */
import { isHsnVisible } from './salesHelpers.js';
import { baseNumber } from './versionDiff.js';

const text = (value) => (value == null ? '' : String(value));

/**
 * CPO tax type for a quotation's tax type.
 *
 * The CPO form speaks "CGST + SGST" / "IGST" while a quotation may store a
 * generic "GST". Anything that is not explicitly IGST keeps the split-tax
 * wording, which is the split the quotation's own CGST/SGST totals use.
 */
export function quotationCpoTaxType(quotation = {}) {
  return /igst/i.test(text(quotation?.taxType)) ? 'IGST' : 'CGST + SGST';
}

/**
 * Header/client/terms fields of the CPO form that the quotation can supply.
 *
 * Keys are the CPO form's own field names (see SalesOrderFormPage), so the
 * caller can merge the result into its form state unchanged.
 */
export function quotationToCpoForm(quotation = {}) {
  const billingAddress = text(quotation?.billingAddress || quotation?.address);
  return {
    // Reference back to the source quotation (CPO form's read-only field). The
    // chain's base number is used, mirroring the backend conversion, so a
    // revision row never writes "QTN-…(2)" onto the CPO.
    qtnRef: baseNumber(text(quotation?.quotationNo)),
    leadNo: text(quotation?.leadNo),
    clientId: quotation?.clientId ?? '',
    clientName: text(quotation?.clientName || quotation?.client),
    contactPerson: text(quotation?.contactPerson),
    email: text(quotation?.email),
    phone: text(quotation?.phone),
    city: text(quotation?.billingCity || quotation?.city),
    state: text(quotation?.billingState || quotation?.state),
    billingAddress,
    shippingAddress: text(quotation?.shippingAddress || billingAddress),
    gstin: text(quotation?.gstin),
    pan: text(quotation?.pan),
    paymentTerms: text(quotation?.paymentTerms),
    deliveryTerms: text(quotation?.deliveryTerms),
    salesExecutive: text(quotation?.salesPerson || quotation?.salesExecutive),
    terms: text(quotation?.terms),
    remarks: text(quotation?.remarks),
    currency: text(quotation?.currency) || 'INR',
    taxType: quotationCpoTaxType(quotation),
    hsnView: isHsnVisible(quotation?.hsnView),
    // The CPO form's flat ₹ discount input and its charges input.
    discountPct: Number(quotation?.discount) || '',
    charges: Number(quotation?.charges) || ''
  };
}

/**
 * Item rows of the CPO grid, in the quotation's order.
 *
 * Only real line items are mapped (design-only description/group rows never
 * become CPO items), and only the item fields the CPO grid actually shows.
 * `amount` is left to the grid/backend calculation, exactly like a manual row.
 */
export function quotationToCpoItems(quotation = {}) {
  const items = Array.isArray(quotation?.items) ? quotation.items : [];
  return items
    .filter((item) => !item || !item.rowType || item.rowType === 'item')
    .map((item) => {
      const description = text(item?.description || item?.productName);
      return {
        productId: item?.productId ?? null,
        productName: text(item?.productName || item?.product || description),
        description,
        sku: text(item?.sku),
        drawingNo: text(item?.drawingNo),
        material: text(item?.material),
        delivery: text(item?.delivery || item?.leadTime),
        hsn: text(item?.hsn),
        unit: text(item?.unit || item?.uom),
        qty: item?.qty != null && item?.qty !== '' ? Number(item.qty) : 1,
        rate: Number(item?.rate) || 0,
        discountPct: Number(item?.discountPct) || 0,
        gstRate: Number(item?.gstRate) || 0
      };
    });
}

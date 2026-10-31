/**
 * utils/cpoItemConversion.js
 * ------------------------------------------------------------------
 * Customer Purchase Order (CPO) item → Work Order / Purchase Order.
 *
 * A CPO item stores what the user wants it turned into — 'WO' (Production
 * Work Order) or 'PO' (Purchase Order) — inside its own per-row custom
 * fields JSON (`sales_order_items.custom_fields_json`, the same column the
 * grid already uses for user-defined item columns). The choice therefore
 * persists with the item and comes back with the CPO; no schema change is
 * involved.
 *
 * This module owns the parts both destination forms share:
 *   - the reserved custom-field key and the two destinations,
 *   - a validated re-read of the PERSISTED CPO and the referenced item
 *     (the destination pages never trust the URL: they re-read the record
 *     from the API and refuse a stale / mismatched link),
 *   - the pre-fill builders for the real Work Order and Purchase Order
 *     forms.
 *
 * Nothing is converted here. The Work Order and the Purchase Order are
 * only ever created by their own module's existing create form + endpoint
 * when the user submits that form.
 */
import salesOrderService from '../services/salesOrderService';

/** Reserved item custom-field key holding the WO / PO choice. */
export const CPO_ITEM_CONVERT_KEY = 'convertTo';

/** The two supported destinations, with the real create-form route of each. */
export const CPO_CONVERT_TARGETS = {
  WO: { label: 'Work Order', route: '/production/orders/new' },
  PO: { label: 'Purchase Order', route: '/purchase/orders/new' }
};

/** Human label of a CPO number, falling back to its id. */
export function cpoRef(cpo) {
  return String(cpo?.soNo || (cpo?.id != null ? `#${cpo.id}` : '')).trim();
}

/**
 * The WO / PO choice stored on a CPO item: 'WO', 'PO' or '' when the user
 * has not selected anything (the value is never guessed from other fields).
 */
export function cpoItemTarget(item) {
  const raw = String((item?.customFields || {})[CPO_ITEM_CONVERT_KEY] ?? '')
    .trim()
    .toUpperCase();
  return raw === 'WO' || raw === 'PO' ? raw : '';
}

/** Every item of a CPO that carries a WO/PO choice, with its 1-based position. */
export function cpoItemsMarkedForConversion(cpo) {
  const items = Array.isArray(cpo?.items) ? cpo.items : [];
  return items
    .map((item, index) => ({ item, itemNumber: index + 1, target: cpoItemTarget(item) }))
    .filter((row) => !!row.target);
}

/** Query string carrying the PERSISTED CPO id + item id to a destination form. */
export function cpoConversionQuery(cpoId, itemId) {
  return new URLSearchParams({
    cpoId: String(cpoId ?? ''),
    itemId: String(itemId ?? '')
  }).toString();
}

/**
 * Read the persisted CPO and the referenced item back from the API.
 *
 * Resolves with `{ cpo, item, itemNumber, target }`; throws an Error whose
 * message is safe to show the user when the CPO, the item or the item's
 * saved WO/PO choice does not match what the link claims.
 *
 * @param {string|number} cpoId        persisted Sales Order (CPO) id
 * @param {string|number} itemId       persisted Sales Order ITEM id
 * @param {string}        expectedTarget 'WO' or 'PO' — the destination being opened
 */
export async function loadCpoItemConversion(cpoId, itemId, expectedTarget) {
  const wantedCpo = String(cpoId ?? '').trim();
  const wantedItem = String(itemId ?? '').trim();
  if (!wantedCpo || !wantedItem) {
    throw new Error(
      'This conversion link is missing the CPO or item id, so nothing can be pre-filled. '
      + 'Open the Customer Purchase Order and use Convert on the item again.'
    );
  }

  let cpo;
  try {
    // `suppressGlobalError`: this is an auxiliary lookup whose failure is
    // rendered here. Without it a link to a deleted CPO would replace the
    // whole (working) destination route with the app's global 404 page.
    const res = await salesOrderService.get(wantedCpo, { suppressGlobalError: true });
    cpo = res?.data ?? res ?? null;
  } catch (err) {
    throw new Error(
      err?.message ? `Customer Purchase Order could not be loaded: ${err.message}` : 'The Customer Purchase Order could not be loaded.',
      { cause: err }
    );
  }
  if (!cpo || cpo.id == null) {
    throw new Error(`Customer Purchase Order ${wantedCpo} was not found.`);
  }

  const items = Array.isArray(cpo.items) ? cpo.items : [];
  const index = items.findIndex((it) => String(it?.id) === wantedItem);
  if (index === -1) {
    throw new Error(
      `Item ${wantedItem} is not part of Customer Purchase Order ${cpoRef(cpo)} — it may have been removed or replaced.`
    );
  }

  const item = items[index];
  const itemNumber = index + 1;
  const target = cpoItemTarget(item);
  const wanted = String(expectedTarget || '').toUpperCase();
  if (wanted && target !== wanted) {
    const wantedLabel = CPO_CONVERT_TARGETS[wanted]?.label || wanted;
    throw new Error(
      target
        ? `Item ${itemNumber} of ${cpoRef(cpo)} is marked for a ${CPO_CONVERT_TARGETS[target]?.label || target}, not a ${wantedLabel}. `
          + 'Change the item\'s Convert To choice on the Customer Purchase Order and save it first.'
        : `Item ${itemNumber} of ${cpoRef(cpo)} has no WO/PO choice saved. `
          + `Set "Convert To" to ${wantedLabel} on that item, save the Customer Purchase Order, then convert.`
    );
  }

  return { cpo, item, itemNumber, target };
}

/** Positive whole quantity to seed the Work Order item, or 0 when it is not usable. */
function wholeQuantity(item) {
  const raw = Number(item?.qty);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

/**
 * Pre-fill for the Production Work Order create form (`/production/orders/new`)
 * from ONE persisted CPO item.
 *
 * The values match exactly what the Work Order form itself writes when the
 * user picks a CPO from its dropdown, so the saved Work Order keeps the real
 * CPO link (`production_orders.sales_order_id` = the CPO database id, plus
 * `sales_order_number`), and the item's own SKU / drawing number travel with
 * the production item. Everything stays editable before the user saves.
 */
export function workOrderPrefill(cpo, item, itemNumber) {
  const description = String(item?.description || '').trim();
  const qty = wholeQuantity(item);
  const rawQty = Number(item?.qty);
  const qtyNote = rawQty > 0 && qty !== rawQty
    ? ` CPO quantity is ${rawQty}${item?.uom ? ` ${item.uom}` : ''} — adjust the Work Order quantity if it needs to stay exact.`
    : '';

  return {
    salesOrderId: cpo.id != null ? String(cpo.id) : '',
    salesOrderNumber: cpo.soNo || '',
    customer: cpo.clientName || '',
    customerCode: cpo.clientId != null ? String(cpo.clientId) : '',
    dueDate: cpo.deliveryDate || '',
    remarks: `Raised from Customer Purchase Order ${cpoRef(cpo)}, item ${itemNumber}`
      + `${description ? `: ${description}` : ''}.${qtyNote}`,
    items: [
      {
        productName: description,
        productCode: item.sku || '',
        quantity: qty > 0 ? qty : '',
        patternNumber: '',
        drawingNumber: item.drawingNo || '',
        drawingRevision: '',
        batchNumber: ''
      }
    ]
  };
}

/**
 * Pre-fill for the Purchase Order create form (`/purchase/orders/new`) from ONE
 * persisted CPO item.
 *
 * `purchase_orders.reference` is reserved for the validated PR link (and
 * `prNo` must resolve to a live requisition), so the source CPO is recorded in
 * the PO's own notes field — free text the model already persists, returned by
 * the API and visible on the created order. The vendor stays empty on purpose:
 * a CPO names a customer, not a supplier, so the user selects the supplier.
 */
export function purchaseOrderPrefill(cpo, item, itemNumber) {
  const description = String(item?.description || '').trim();
  const qty = Number(item?.qty) || 0;
  const rate = Number(item?.rate) || 0;
  const qtyText = qty > 0 ? `${qty}${item?.uom ? ` ${item.uom}` : ''}` : 'not set on the CPO';

  return {
    title: description.slice(0, 200),
    vendor: '',
    reference: '',
    expectedDate: cpo.deliveryDate || '',
    currency: cpo.currency || '',
    gstType: cpo.taxType || '',
    terms: cpo.paymentTerms || '',
    internalNotes: 'Created from Customer Purchase Order '
      + `${cpoRef(cpo)}, item ${itemNumber}${description ? ` — ${description}` : ''}.`
      + ` CPO quantity: ${qtyText}${rate ? ` at ${rate}` : ''}.`
      + ' Review the supplier, rate, taxes and delivery dates before submitting.',
    items: [
      {
        itemCode: item.sku || '',
        product: description,
        category: '',
        hsn: item.hsn || '',
        uom: item.uom || 'Nos',
        qty: qty > 0 ? qty : '',
        rate,
        discount: Number(item.discountPct) || 0,
        gstRate: Number(item.gstRate) || 0,
        remarks: `CPO ${cpoRef(cpo)} item ${itemNumber}`
      }
    ]
  };
}

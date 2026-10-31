// ============================================================
// Sales Order (CPO) read model for the Production module.
//
// The Production module needs exactly two shapes from Sales:
//
//   1. the slim CPO option feed (GET /sales-orders/options) — id, CPO
//      number, customer, order date and item count — for the CPO picker
//      in the Work Order form and the CPO filter on the Orders list;
//   2. ONE full Sales Order (GET /sales-orders/{id}) — fetched on demand,
//      only by the screens that actually read its line items.
//
// The previous implementation looped over EVERY page of /sales-orders
// (each row carrying its items, attachments, timeline and history) and held
// the whole dataset in the browser. Both shapes are normalised here as pure
// functions so the context stays thin, the mapping lives in one place, and
// the behaviour is unit-testable without a browser.
// ============================================================

/** Unwrap the ERP ApiResponse envelope `{ success, message, data }`. */
export function unwrapApiData(payload) {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'object' && 'data' in payload) return payload.data ?? null;
  return payload;
}

/**
 * Normalise one slim CPO option row.
 *
 * `id` keeps the historical string identity the Production screens use as a
 * React key / select value, while `salesOrderId` carries the real Sales Order
 * database primary key used by `/sales-orders/{id}`.
 */
export function normalizeSalesOrderOption(raw) {
  if (!raw) return null;
  return {
    id: raw.id != null ? String(raw.id) : (raw.soNo || ''),
    salesOrderId: raw.id ?? null,
    salesOrderNumber: raw.soNo || raw.salesOrderNumber || '',
    customerName: raw.clientName || '',
    customerCode: raw.clientId != null ? String(raw.clientId) : '',
    orderDate: raw.orderDate || raw.date || '',
    itemCount: Number(raw.itemCount) || 0,
  };
}

/**
 * Normalise a FULL Sales Order (GET /sales-orders/{id}) including its line
 * items — the shape the Sales → Production link stats are computed from.
 */
export function normalizeSalesOrderDetail(raw) {
  if (!raw) return null;
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    ...normalizeSalesOrderOption(raw),
    itemCount: items.length,
    items: items.map((item, index) => ({
      id: item.id != null ? String(item.id) : `item-${index}`,
      itemNo: index + 1,
      productName: item.description || '',
      productCode: item.sku || '',
      description: item.description || '',
      quantity: item.qty || 0,
      rate: item.rate || 0,
      amount: item.netAmount || item.grossAmount || 0,
      unit: item.uom || 'Nos',
      hsn: item.hsn || '',
    })),
  };
}

/** Query params for the CPO option feed (only ever the search term). */
export function buildSalesOrderOptionsParams({ search } = {}) {
  const params = {};
  const term = typeof search === 'string' ? search.trim() : '';
  if (term) params.search = term;
  return params;
}

/**
 * Resolve a CPO reference to the real Sales Order id.
 *
 * Production Work Orders may hold the CPO number (legacy rows) or the numeric
 * id, so both are accepted. Returns null when the reference cannot be matched
 * to a Sales Order, so callers never fire a request for a non-existent id.
 */
export function resolveSalesOrderId(options = [], idOrNumber) {
  if (idOrNumber == null || idOrNumber === '') return null;
  const wanted = String(idOrNumber);
  const match = (Array.isArray(options) ? options : []).find(
    (option) =>
      option &&
      (String(option.id) === wanted ||
        (option.salesOrderId != null && String(option.salesOrderId) === wanted) ||
        option.salesOrderNumber === wanted)
  );
  if (match?.salesOrderId != null) return match.salesOrderId;
  if (match?.id != null && /^\d+$/.test(String(match.id))) return Number(match.id);
  return /^\d+$/.test(wanted) ? Number(wanted) : null;
}

/**
 * True when a saved CPO reference is NOT covered by the loaded option feed.
 *
 * The backend serves only the CURRENT row of each revision chain (see
 * SalesOrderService#latestPerChainPredicate, applied by /sales-orders and
 * /sales-orders/options alike), so a Work Order saved against a since-superseded
 * revision has no matching option and its picker would render blank. Callers
 * use this to decide whether that one CPO must be read by id.
 */
export function isCpoReferenceUnserved(options = [], idOrNumber) {
  if (idOrNumber == null || idOrNumber === '') return false;
  const wanted = String(idOrNumber);
  return !(Array.isArray(options) ? options : []).some(
    (option) =>
      option &&
      (String(option.id) === wanted ||
        (option.salesOrderId != null && String(option.salesOrderId) === wanted) ||
        option.salesOrderNumber === wanted)
  );
}

/**
 * Option list for a CPO picker.
 *
 * Returns the feed unchanged when it already covers `value`. Otherwise it adds
 * exactly ONE option for that reference — the CPO fetched by id when available
 * (`option`), else a fallback carrying the saved reference (`fallbackLabel`, or
 * the value itself) — so an already-saved relationship is always displayed
 * instead of a blank field, and the select keeps the original value. No other
 * historical revision becomes selectable, and a feed row can never duplicate.
 *
 * The fallback carries `itemCount: null`, which callers read as "no CPO data"
 * (so they neither print a fabricated item count nor claim 0 items).
 */
export function withLinkedCpoOption({ options = [], value, option, fallbackLabel } = {}) {
  const list = Array.isArray(options) ? options : [];
  const wanted = value == null ? '' : String(value).trim();
  if (!wanted || !isCpoReferenceUnserved(list, wanted)) return list;
  const fetched = option && String(option.id) === wanted ? option : null;
  const linked = fetched || {
    id: wanted,
    salesOrderId: null,
    salesOrderNumber: String(fallbackLabel || '').trim() || wanted,
    customerName: '',
    customerCode: '',
    orderDate: '',
    itemCount: null
  };
  return [linked, ...list];
}

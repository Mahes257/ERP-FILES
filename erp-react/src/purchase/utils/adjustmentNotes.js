/**
 * purchase/utils/adjustmentNotes.js
 * ------------------------------------------------------------------
 * Pure helpers for Credit / Debit Notes raised against an ORIGINAL
 * vendor invoice. Nothing here touches storage or services — safe for
 * forms, pages, the invoice service and unit tests.
 *
 * Money model
 * ------------------------------------------------------------------
 * A note has the same gross composition as an invoice line set:
 *   gross = (Σ qty × rate, minus discounts) + GST + charges + freight
 * and its GROSS value (tax included) is what moves the vendor ledger:
 *
 *   · Credit Note → buyer owes the vendor LESS by the note's gross
 *   · Debit Note  → buyer owes the vendor MORE by the note's gross
 *
 * Each invoice row carries a persisted summary of its APPROVED notes:
 *   invoice.adjustments = { credit, debit, net, count }
 * where net = debit − credit. `invoiceAdjustments()` normalises that
 * block (defaults to zeros) so legacy records behave unchanged.
 * ------------------------------------------------------------------
 */
import { ADJUSTMENT_NOTE_TYPE } from '../constants';
import { calcDocumentTotals, round2 } from './purchase';

/** +1 for a Debit Note, −1 for a Credit Note. */
export function noteTypeSign(noteType) {
  return String(noteType || '') === ADJUSTMENT_NOTE_TYPE.CREDIT ? -1 : 1;
}

/** True when a note is a Credit Note. */
export function isCreditNoteType(noteType) {
  return String(noteType || '') === ADJUSTMENT_NOTE_TYPE.CREDIT;
}

/**
 * Computes the money fields stored on a note from its payload, using
 * the SAME calcDocumentTotals used by the PO / invoice modules so a
 * note's totals always match how the module prices a line set.
 *
 * Line items drive the totals when present; otherwise the legacy
 * header-level amount + GST entry is preserved. Returns:
 *   { items, amount, gst, charges, freight, discount, roundOff,
 *     total, totals }
 * `total` is the gross value incl. tax — the value that adjusts the
 * vendor ledger.
 */
export function noteAmounts(payload = {}) {
  const discount = Number(payload.discount) || 0;
  const charges = Number(payload.charges) || 0;
  const freight = Number(payload.freight) || 0;

  const items =
    Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items.map((line) => ({
          ...line,
          qty: Number(line.qty) || 0,
          rate: Number(line.rate ?? line.price) || 0,
          discount: Number(line.discount) || 0,
          gstRate: Number(line.gstRate ?? line.gst) || 0
        }))
      : null;

  let amount;
  let gst;
  let roundOff = 0;
  let totals = null;
  if (!items) {
    amount = Number(payload.amount) || 0;
    gst = Number(payload.gst) || 0;
  } else {
    totals = calcDocumentTotals(items, discount, charges, payload.gstType || '');
    amount = totals.taxable;
    gst = totals.gstTotal;
    roundOff = totals.roundOff;
  }
  /* Freight rides on top of the document totals (never taxed); the
     header-entry path adds charges explicitly, exactly like the
     invoice amounts math. */
  const total = items
    ? round2((totals ? totals.total : amount + gst) + freight)
    : round2(amount + gst + charges + freight);

  return {
    items: items || [],
    amount,
    gst,
    charges,
    freight,
    discount,
    roundOff,
    total,
    totals
  };
}

/** Gross value (incl. tax) of a stored note — the ledger-moving amount. */
export function noteTotal(note = {}) {
  return noteAmounts(note).total;
}

/** The value a note moves the ledger by (negative for credit notes). */
export function noteLedgerValue(note = {}) {
  return round2(noteTypeSign(note.noteType) * noteTotal(note));
}

/**
 * Normalises the adjustments summary persisted on an invoice:
 *   invoice.adjustments = { credit, debit, net, count }
 * net = debit − credit. Absent / legacy rows default to zeros.
 */
export function invoiceAdjustments(invoice = {}) {
  const adj = invoice && typeof invoice.adjustments === 'object' && invoice.adjustments
    ? invoice.adjustments
    : {};
  const credit = round2(Number(adj.credit) || 0);
  const debit = round2(Number(adj.debit) || 0);
  return {
    credit,
    debit,
    net: round2(debit - credit),
    count: Math.max(0, Number(adj.count) || 0)
  };
}

/** Net payable an invoice is based on — stored netPayable when present,
 *  else the gross total (legacy rows). Never the adjusted value. */
export function basePayableOf(invoice = {}) {
  const hasNet =
    invoice.netPayable !== undefined &&
    invoice.netPayable !== null &&
    invoice.netPayable !== '';
  const base = hasNet ? Number(invoice.netPayable) : Number(invoice.total) || 0;
  return round2(base);
}

/**
 * Net payable AFTER approved notes: the original net payable plus the
 * net ledger movement (debit − credit), floored at zero.
 */
export function effectiveNetPayable(invoice = {}) {
  const { net } = invoiceAdjustments(invoice);
  return round2(Math.max(0, basePayableOf(invoice) + net));
}

/** Gross total (incl. tax) after approved notes — for consumers that
 *  price the invoice on its gross `total`. */
export function effectiveTotal(invoice = {}) {
  const { net } = invoiceAdjustments(invoice);
  return round2(Math.max(0, (Number(invoice.total) || 0) + net));
}

/** What the buyer still owes on an invoice after notes + payments. */
export function effectiveOutstanding(invoice = {}) {
  const payable = effectiveNetPayable(invoice);
  const paid = round2(Number(invoice.paidAmount) || 0);
  return round2(Math.max(0, payable - paid));
}

/** Vendor credit created when payments + credits exceed the net payable
 *  (the vendor owes the buyer money back / may set it off). */
export function vendorCreditBalance(invoice = {}) {
  const payable = effectiveNetPayable(invoice);
  const paid = round2(Number(invoice.paidAmount) || 0);
  return round2(Math.max(0, paid - payable));
}

/**
 * The balance a Credit Note may reduce an invoice by: its current
 * outstanding. Creating / approving a credit note for more than this
 * requires the explicit `allowExcess` override.
 */
export function creditCapacity(invoice = {}) {
  return effectiveOutstanding(invoice);
}

/**
 * dateInput.js — the value a sales <input type="date"> is allowed to hold.
 * ------------------------------------------------------------------
 * A native date input is NOT limited to a four-digit year: the HTML spec allows
 * years up to 275760, so typing `275760` into the year segment makes the input
 * report the value "275760-01-01". Left alone, that impossible date is stored on
 * the document (Quotation Date / Valid Till Date on the quotation form).
 *
 * Every sales date field therefore funnels its raw input through
 * `dateInputValue()`: only a value that really is a calendar date with a
 * four-digit year is accepted, and `MAX_DATE_INPUT` (the largest such date) is
 * passed to the input's own `max`, so the picker cannot leave the four-digit
 * range either. Nothing here is business-specific — no minimum date is imposed,
 * because a quotation may legitimately be dated in the past.
 *
 * This module is intentionally dependency-free (the same reasoning as
 * itemCustomFields.js) so `node --test` can cover the guard directly, and Vite
 * resolves it unchanged in the browser.
 */

/** The largest four-digit-year date — passed to date inputs as their `max`. */
export const MAX_DATE_INPUT = '9999-12-31';

const ISO_DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Is `value` a well-formed, real calendar date with a FOUR-digit year
 * (YYYY-MM-DD)?
 *
 *   '2026-10-16'    → true
 *   '275760-01-01'  → false  (six-digit year — the reported bug)
 *   '2026-02-30'    → false  (no such day)
 *   '2026-2-6'      → false  (not zero-padded)
 *   ''              → false  (an empty field is not a date)
 */
export function isValidDateInput(value) {
  const match = ISO_DATE_INPUT.exec(String(value ?? '').trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // setUTCFullYear AFTER construction: Date.UTC remaps years 0-99 onto
  // 1900-1999, which would make a real '0099-01-01' look invalid.
  const probe = new Date(Date.UTC(2000, month - 1, day));
  probe.setUTCFullYear(year);
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
}

/**
 * The value the form may keep for a date input:
 *
 *   · the trimmed value itself, when it is a real four-digit-year date
 *   · '' when the field was cleared (clearing a date stays possible)
 *   · `null` when the input must be REFUSED — the caller then keeps the value
 *     it already had instead of storing an impossible date
 */
export function dateInputValue(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return '';
  return isValidDateInput(raw) ? raw : null;
}

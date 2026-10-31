/**
 * sales/utils/salesDataEvents.js
 * ------------------------------------------------------------------
 * The Sales module's change notification, mirroring
 * purchase/services/base.js's PURCHASE_DATA_CHANGED_EVENT.
 *
 * Every successful Sales write made through salesServiceFactory (create /
 * update / delete / archive / restore / status / approve / duplicates /
 * attachments / workflow actions) dispatches it, so the sidebar's per-module
 * pending badges can refresh in place — no polling, no re-fetch per render.
 *
 * The constant lives in its own module so the service layer can import it
 * without pulling in the hook (and creating a require cycle).
 */

/** Window event dispatched after a successful Sales mutation. */
export const SALES_DATA_CHANGED_EVENT = 'erp:sales-data-changed';

/** Dispatch the event; a no-op outside the browser (SSR / tests). */
export function emitSalesDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SALES_DATA_CHANGED_EVENT));
}

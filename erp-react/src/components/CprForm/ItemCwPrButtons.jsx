import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../Common';
import technicalVerificationService from '../../services/technicalVerificationService';

/**
 * Item-row conversion actions (CW / PR).
 *
 * Both buttons execute the ERP's EXISTING item-level conversion workflow — the
 * same endpoints the Technical Verification page uses:
 *
 *   POST /cpr-technical-verifications/{id}/convert-to-cost-workout
 *   POST /cpr-technical-verifications/{id}/convert-to-purchase-requisition
 *
 * One verification row covers exactly ONE CPR item (cprItemId) and the backend
 * reads the real CPR item + CPR header itself, so the destination can never be
 * assembled (or corrupted) by the browser and sibling items are never carried
 * across. Both calls are idempotent, so a double click returns the record that
 * was created the first time instead of duplicating it.
 *
 * The row must exist in the database before it can be converted, so the flow is:
 *
 *   ensure the CPR is saved (draft)  →  resolve THIS row's persisted item and its
 *   verification row  →  convert  →  open the destination the backend returned.
 *
 * Nothing is computed or faked here: a success toast is only shown for a real
 * backend response, and a failure shows the backend's own message.
 */

const norm = (value) => String(value ?? '').trim().toLowerCase();

/**
 * The persisted CPR item behind this grid row.
 *
 * Grid rows carry local uids (never database ids), so the row is matched against
 * the items the save returned: an exact field match wins, otherwise the row at
 * the same position is used when its description matches, which is how the save
 * preserves order. Anything ambiguous resolves to null and the conversion is
 * refused rather than applied to the wrong item.
 */
function pickPersistedItem(localItem, rowIndex, savedItems) {
  if (!Array.isArray(savedItems) || savedItems.length === 0) return null;

  const sameFields = (candidate) =>
    norm(candidate.description) === norm(localItem.description)
    && norm(candidate.drawingNo) === norm(localItem.drawingNo)
    && Number(candidate.qty ?? 0) === Number(localItem.qty ?? 0)
    && norm(candidate.unit) === norm(localItem.unit)
    && Number(candidate.estimatedCost ?? 0) === Number(localItem.estimatedCost ?? 0);

  const exact = savedItems.filter(sameFields);
  if (exact.length === 1) return exact[0];

  const positional = savedItems[rowIndex];
  if (positional && norm(positional.description) === norm(localItem.description)) return positional;
  return null;
}

export default function ItemCwPrButtons({ item, itemIndex = 0, sourceForm, onEnsureSaved }) {
  const navigate = useNavigate();
  const toast = useToast();
  // Destination currently being converted ('CW' | 'PR' | null) — one conversion
  // at a time per row and both buttons disabled while it runs.
  const [converting, setConverting] = useState(null);

  const convert = async (destination) => {
    if (converting) return;
    const label = destination === 'CW' ? 'Cost Workout' : 'Purchase Requisition';

    // The row must be describable and persisted before anything is converted.
    if (!norm(item?.description)) {
      toast.warning('Enter the item description before converting this row');
      return;
    }

    setConverting(destination);
    try {
      // 1. Persist the CPR (draft) through the page's own save path so the row
      //    exists server-side. The page runs its existing validation first and
      //    returns null when the record is not ready — no conversion happens then.
      const saved = await onEnsureSaved?.();
      if (!saved?.id) return;

      // 2. Identify THIS row's persisted item.
      const persistedItem = pickPersistedItem(item, itemIndex, saved.items);
      if (!persistedItem?.id) {
        toast.error('This item could not be identified on the server. Save the CPR and try again.');
        return;
      }

      // 3. The backend carries every CPR item into Technical Verification itself
      //    (auto-creating the missing rows); we only need this item's row id.
      const rowsResponse = await technicalVerificationService.listByCpr(saved.id);
      const rows = Array.isArray(rowsResponse?.data)
        ? rowsResponse.data
        : (Array.isArray(rowsResponse) ? rowsResponse : []);
      const verificationRow = rows.find(
        (row) => Number(row.cprItemId) === Number(persistedItem.id)
      );
      if (!verificationRow?.id) {
        toast.error('This item has no Technical Verification record — conversion was not started.');
        return;
      }

      // 4. Execute the existing backend conversion for THAT verification row.
      const result = destination === 'CW'
        ? await technicalVerificationService.convertToCostWorkout(verificationRow.id)
        : await technicalVerificationService.convertToPurchaseRequisition(verificationRow.id);

      toast.success(result?.message || `Converted this item to ${label}.`);

      // 5. Open the record the backend created (or the existing one when the item
      //    had already been converted) so it can be reviewed and saved.
      if (result?.destinationId) {
        navigate(result.destination === 'CW'
          ? `/cost-workouts/${result.destinationId}/edit`
          : `/purchase/requisition/${result.destinationId}/edit`);
      }
    } catch (err) {
      // Real backend error (validation, permissions, failure) — surfaced as-is.
      toast.error(err?.message || `Failed to convert this item to ${label}`);
    } finally {
      setConverting(null);
    }
  };

  const CW_CLASS = 'px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded border border-[#0B4A3D]/40 bg-[#0B4A3D]/5 text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const PR_CLASS = 'px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded border border-slate-300 bg-surface text-slate-600 hover:text-[#0B4A3D] hover:border-[#0B4A3D]/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <span className="cpr-item-actions inline-flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          convert('CW');
        }}
        disabled={Boolean(converting)}
        title="Create a Cost Workout for this item and open it"
        aria-label={`Create a Cost Workout for item ${itemIndex + 1}`}
        aria-busy={converting === 'CW'}
        className={CW_CLASS}
      >
        {converting === 'CW' ? '…' : 'CW'}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          convert('PR');
        }}
        disabled={Boolean(converting)}
        title="Create a Purchase Requisition for this item and open it"
        aria-label={`Create a Purchase Requisition for item ${itemIndex + 1}`}
        aria-busy={converting === 'PR'}
        className={PR_CLASS}
      >
        {converting === 'PR' ? '…' : 'PR'}
      </button>
    </span>
  );
}

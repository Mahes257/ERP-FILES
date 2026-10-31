import { ArrowRight, ChevronLeft, Plus, Save, Send, X } from 'lucide-react';


/**
 * ERP standard creation-page action bar.
 *
 * Every Create/New page in the ERP uses this single footer so users always get
 * the same left/right action groups (the pattern already used by
 * Create Purchase Request):
 *
 *   LEFT                                   RIGHT
 *   [<- Back to List] [x Cancel] [Save Draft]      [+ Save & New] [Save] [Submit for Approval]
 *
 * Module awareness: a button only renders when its handler is supplied, so
 * modules without a draft/approval workflow simply do not show those buttons
 * (no invented Draft or Submit behaviour). `saveLabel` / `submitLabel` let a
 * module keep its own truthful wording (e.g. "Save & Continue", "Mark as
 * Received") while the bar structure, grouping, order and styling stay
 * identical everywhere.
 *
 * Pages whose header already carries a `Back to List` button (CPR, Cost
 * Workout, ...) pass `showBackToList={false}` so the action never appears twice.
 */
/**
 * All four action slots share ONE style — the shared `.erp-create-btn` class
 * defined in styles/erp-creation-actions.css (imported globally from main.jsx).
 * Every creation-page action button in the ERP (Back to List, Cancel,
 * Save Draft, Save & New, Save, Submit for Approval) is therefore solid ERP
 * green with white text and a white icon, from a single definition.
 *
 * The four keys are kept as separate exports so existing call sites, and any
 * module footer that wants the identical look, can keep referring to the
 * semantic slot they mean without duplicating the styling string.
 */
const BTN = 'erp-create-btn';

export const ACTION_BTN = {
  secondary: BTN,
  neutral: BTN,
  primary: BTN,
  approval: BTN,
};

export default function CreationActionBar({
  // LEFT group
  onBackToList,
  onCancel,
  onSaveDraft,
  backLabel = 'Back to List',
  cancelLabel = 'Cancel',
  draftLabel = 'Save Draft',
  showBackToList = true,
  showCancel = true,
  // RIGHT group
  onSaveNew,
  onSave,
  /** Optional "save, then open the saved record" action (e.g. CPR's
   *  Save and Continue → the record's preview). Sits between Save and
   *  Submit for Approval and only renders when its handler is supplied. */
  onSaveContinue,
  onSubmit,
  saveNewLabel = 'Save & New',
  saveLabel = 'Save',
  saveContinueLabel = 'Save and Continue',
  submitLabel = 'Submit for Approval',
  submitIcon: SubmitIcon = Send,
  // state
  /** Disables every action (e.g. a save request is in flight). */
  disabled = false,
  /** Disables only the mutating actions (draft/new/save/submit) while
   *  navigation stays available — used for read-only historical revisions. */
  locked = false,
  /** Extra element rendered at the end of the LEFT group (e.g. "Draft saved 2m ago"). */
  note = null,
  /** Extra element rendered at the start of the RIGHT group (module-specific
   *  secondary actions such as the invoice "Save Changes" button). */
  extraRight = null,
  className = '',
}) {
  const busy = disabled;
  const frozen = disabled || locked;
  const hasLeft = (showBackToList && onBackToList) || (showCancel && onCancel) || onSaveDraft || note;
  const hasRight = extraRight || onSaveNew || onSave || onSaveContinue || onSubmit;

  if (!hasLeft && !hasRight) return null;

  return (
    <div
      className={`sticky bottom-0 z-30 bg-surface border-t-2 border-slate-200 px-4 sm:px-6 py-3 mt-6 flex flex-wrap items-center justify-between gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] rounded-t-xl ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {showBackToList && onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            disabled={busy}
            className={ACTION_BTN.secondary}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> {backLabel}
          </button>
        )}
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={ACTION_BTN.secondary}
          >
            <X className="w-3.5 h-3.5" /> {cancelLabel}
          </button>
        )}
        {onSaveDraft && (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={frozen}
            className={ACTION_BTN.secondary}
          >
            <Save className="w-3.5 h-3.5" /> {draftLabel}
          </button>
        )}
        {note}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {extraRight}
        {onSaveNew && (
          <button
            type="button"
            onClick={onSaveNew}
            disabled={frozen}
            className={ACTION_BTN.neutral}
          >
            <Plus className="w-3.5 h-3.5" /> {saveNewLabel}
          </button>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={frozen}
            className={ACTION_BTN.primary}
          >
            <Save className="w-3.5 h-3.5" /> {saveLabel}
          </button>
        )}
        {onSaveContinue && (
          <button
            type="button"
            onClick={onSaveContinue}
            disabled={frozen}
            className={ACTION_BTN.neutral}
          >
            <ArrowRight className="w-3.5 h-3.5" /> {saveContinueLabel}
          </button>
        )}
        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={frozen}
            className={ACTION_BTN.approval}
          >
            <SubmitIcon className="w-3.5 h-3.5" /> {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}

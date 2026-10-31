/**
 * purchase/components/FormActions.jsx
 * ------------------------------------------------------------------
 * Enterprise sticky action footer for Purchase create/edit forms.
 * Modern SAP / Oracle / MS-Dynamics style bar:
 *
 *   LEFT   → Reset · Cancel                  (ghost)
 *   CENTER → Print · Export PDF              (ghost — rendered only
 *            once a document exists, e.g. edit mode, because a PR
 *            needs a valid number before it can be printed/exported)
 *   RIGHT  → Save Draft (secondary) · Save & New (secondary) ·
 *            Submit for Approval (green outline) ·
 *            Create / Save (solid green primary)
 *
 * Only renders the buttons the caller supplies via props.
 * ------------------------------------------------------------------
 */
import { FileDown, Printer, RotateCcw, Save, Send, X } from 'lucide-react';
import Button from './ui/Button';

export default function FormActions({
  submitting = false,
  draftSaving = false,
  submitLabel = 'Save',
  submitVariant = 'primary',
  draftLabel = 'Save Draft',
  showDraft = false,
  onDraft,
  onCancel,
  onReset,
  onPrint,
  onExportPdf,
  cancelLabel = 'Cancel',
  resetLabel = 'Reset',
  showSaveNew = false,
  onSaveNew,
  showSubmitApproval = false,
  onSubmitApproval
}) {
  return (
    <div className="erp-action-footer">
      {/* LEFT — ghost navigation actions */}
      <div className="erp-action-footer-zone erp-action-footer-left">
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset} icon={RotateCcw}>
            {resetLabel}
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} icon={X}>
            {cancelLabel}
          </Button>
        )}
      </div>

      {/* CENTER — document actions (rendered only when the document
          exists, e.g. edit mode: printing / exporting a requisition
          requires a valid PR number) */}
      {(onPrint || onExportPdf) && (
        <div className="erp-action-footer-zone erp-action-footer-center">
          {onPrint && (
            <Button variant="ghost" size="sm" onClick={onPrint} icon={Printer}>
              Print
            </Button>
          )}
          {onExportPdf && (
            <Button variant="ghost" size="sm" onClick={onExportPdf} icon={FileDown}>
              Export PDF
            </Button>
          )}
        </div>
      )}

      {/* RIGHT — primary submit actions */}
      <div className="erp-action-footer-zone erp-action-footer-right">
        {showDraft && onDraft && (
          <Button variant="secondary" size="sm" onClick={onDraft} loading={draftSaving} icon={Save} disabled={submitting}>
            {draftLabel}
          </Button>
        )}
        {showSaveNew && onSaveNew && (
          <Button variant="secondary" size="sm" onClick={onSaveNew} loading={draftSaving} icon={Save} disabled={submitting}>
            Save & New
          </Button>
        )}
        {showSubmitApproval && onSubmitApproval && (
          <Button variant="primary-outline" size="sm" onClick={onSubmitApproval} loading={submitting} icon={Send} disabled={draftSaving}>
            Submit for Approval
          </Button>
        )}
        <Button type="submit" variant={submitVariant} size="sm" loading={submitting} disabled={draftSaving}>
          {submitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

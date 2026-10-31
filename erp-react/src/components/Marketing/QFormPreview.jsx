import { ArrowLeft, FileText } from 'lucide-react';
import QuestionnaireForm from './QuestionnaireForm';

// ============================== Main Component ==============================
//
// Q Form Preview / Edit page.
//
// After "Save & Continue" this view opens the complete Q Form in the SAME
// ERP card layout as the create/edit form. It is intentionally editable —
// the user can review every section, edit values directly, and save changes.
//
// It does NOT duplicate the questionnaire content: it renders the existing
// QuestionnaireForm (single source of truth) in preview mode, so the content,
// tables, status and backend integration stay exactly the same as the form.
//
// ==============================

export default function QFormPreview({ formId, onClose }) {
  return (
    <div className="qf-preview-wrap qtn-create-page">
      <style>{PREVIEW_CSS}</style>

      {/* ===== Compact Preview/Edit utility bar ===== */}
      <div className="qf-preview-bar no-print">
        {/* Shared ERP detail-page action button (styles/erp-detail-actions.css) */}
        <button onClick={onClose} className="erp-detail-action">
          <ArrowLeft /> Back
        </button>
        <div className="qf-preview-note">
          <FileText size={14} />
          <span>
            <strong>Preview / Edit view</strong> — all entered values, tables and sections are shown below and
            remain editable. Use <strong>Save Changes</strong> to persist any change, or{' '}
            <strong>Save &amp; Continue</strong> to keep editing.
          </span>
        </div>
      </div>

      {/* ===== The full Q Form (editable, same card layout as the create page) ===== */}
      <QuestionnaireForm formId={formId} preview onClose={onClose} />
    </div>
  );
}

// ============================== CSS ==============================

const PREVIEW_CSS = `
.qf-preview-bar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 16px;
}
.qf-preview-note {
  display: flex; align-items: flex-start; gap: 9px; padding: 10px 16px; border-radius: 10px;
  background: #F0FDFA; border: 1px solid #CCFBF1; color: #115e59; font-size: 12px; font-weight: 500;
  flex: 1; min-width: 220px;
}
.qf-preview-note svg { flex-shrink: 0; margin-top: 1px; color: #0B4A3D; }

@media print {
  .no-print { display: none !important; }
  .qf-preview-bar { display: none !important; }
}
`;
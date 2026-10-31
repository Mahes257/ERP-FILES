import React from 'react';
import Icon from '../icons/Icon';
import './settings/SettingsFormPage.css';

/**
 * FormPageShell — in-flow "full page" chrome for a Production creation form.
 *
 * Dedicated create routes (e.g. /production/quality/new, /production/packing/new,
 * /production/casting/new) render their form as a normal block in the document
 * flow instead of inside the `Modal fullPage` overlay, which used to anchor
 * itself with a stale `--sidebar-width` token and left the list visible beside
 * it.
 *
 * Structure matches the established Production create-page pattern
 * (WorkOrderFormPage / DrawingFormPage / ModelFormPage) and is the same shell
 * SettingsFormModal renders for its `layout="page"` mode:
 *
 *   [ Page header: title + Close ]
 *   [ Card: form body (scrolls with the document) + footer actions ]
 *
 * `children` is the form body; `footer` holds Cancel / Save.
 */
export default function FormPageShell({ title, onClose, footer, children }) {
  return (
    <div className="settings-form-page">
      <div className="settings-form-page-header">
        <h1 className="settings-form-page-title">{title}</h1>
        <button
          type="button"
          className="settings-form-page-close"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="settings-form-page-card">
        <div className="settings-form-page-body">{children}</div>
        {footer && <div className="settings-form-page-footer">{footer}</div>}
      </div>
    </div>
  );
}

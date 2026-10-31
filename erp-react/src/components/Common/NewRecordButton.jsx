import { Plus } from 'lucide-react';
import { openInNewTab } from '../../utils/navigationHelpers';

/**
 * NewRecordButton — a single "+ New <label>" button shown in the page header.
 *
 * Clicking it DIRECTLY opens the module's creation route in a NEW browser tab
 * (no dropdown / popup), so the original list page stays open in the current
 * tab. Uses the existing ERP primary-button styling.
 */
export default function NewRecordButton({
  label = 'New',
  to,
  buttonClassName = 'erp-btn-primary',
  icon: Icon = Plus
}) {
  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={() => openInNewTab(to)}
      title={`Create New ${label}`}
    >
      <Icon className="w-4 h-4 stroke-[2.5]" />
      <span>New {label}</span>
    </button>
  );
}

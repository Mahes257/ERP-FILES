import ActionMenu from '../Common/ActionMenu';

/**
 * CprActionMenu — three-dot row actions menu used across the sales modules
 * (CPR, Cost Workout, Quotations, Sales Contracts, Sales Orders, Proforma
 * Invoices, Delivery Challans, Invoices, Credit Notes, Payment Receipts).
 *
 * Delegates to the shared portal-based ActionMenu so the dropdown is rendered
 * into document.body and is never clipped by the table / overflow wrapper /
 * viewport. API kept identical: items + onAction.
 */
export default function CprActionMenu({ items = [], onAction, keepTriggerColumnClear = false }) {
  return (
    <ActionMenu
      items={items}
      onAction={onAction}
      buttonLabel="Row actions"
      triggerClassName="erp-row-action-btn"
      menuClassName="bg-surface border border-slate-200 rounded-xl shadow-lg py-1.5 overflow-y-auto"
      keepTriggerColumnClear={keepTriggerColumnClear}
    />
  );
}

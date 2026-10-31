/**
 * purchase/components/list/PurchaseEmptyState.jsx
 * ------------------------------------------------------------------
 * Shared table empty state (cpr-empty, styled by cpr-list.css),
 * extracted from the Purchase Requisition list. Renders an icon,
 * title, optional message and optional action node.
 * ------------------------------------------------------------------
 */
export default function PurchaseEmptyState({ icon: Icon, iconSize = 48, title, message, action, className = '' }) {
  return (
    <div className={`cpr-empty ${className}`}>
      {Icon && <Icon size={iconSize} aria-hidden="true" />}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
/**
 * purchase/components/list/PurchaseSearch.jsx
 * ------------------------------------------------------------------
 * Shared list search input (pr-search-input, styled by cpr-list.css),
 * extracted from the Purchase Requisition list.
 * ------------------------------------------------------------------
 */
export default function PurchaseSearch({ id, value, onChange, placeholder = 'Search...', label = 'Search' }) {
  return (
    <input
      type="text"
      id={id}
      className="pr-search-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      aria-label={label}
      autoComplete="off"
    />
  );
}
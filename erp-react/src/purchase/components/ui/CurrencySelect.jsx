/**
 * purchase/components/ui/CurrencySelect.jsx
 * ------------------------------------------------------------------
 * ISO-4217 currency dropdown for the Purchase module (Requisition,
 * RFQ, Purchase Order, Invoice, Vendor, future modules).
 *
 * Rendered through EditableMasterSelect — the same CRUD dropdown used
 * by Payment Terms — so the trigger height, border radius, padding,
 * hover effect, font, spacing, animation and behaviours match exactly.
 *
 *   ✓ full ISO-4217 list seeded as read-only system values
 *     (src/data/currencies.js) — cannot be renamed or deleted
 *   ✓ default selection: INR — Indian Rupee (set by the form/service)
 *   ✓ search as you type + dynamic filtering (by code or name)
 *   ✓ clear selected value (×) back to the placeholder
 *   ✓ add new custom currency (+ Add "…") when typing an unknown code
 *   ✓ edit / delete custom currencies only (pencil / trash icons)
 *   ✓ stores the ISO code string ("INR", "USD", …) for system values
 *     and the typed name for custom values — existing records and
 *     services keep working unchanged
 *   ✓ keyboard support (↑/↓/Enter/Escape/Tab) from trigger and menu
 * ------------------------------------------------------------------
 */
import EditableMasterSelect from './EditableMasterSelect';
import { getCurrency } from '../../../data/currencies';

export default function CurrencySelect({
  value = '',
  onChange,
  placeholder = 'Select currency',
  searchable = true,
  clearable = true,
  disabled = false,
  error = false,
  id,
  ariaLabel = 'Currency',
  className = ''
}) {
  const formatLabel = (name) => {
    const entry = getCurrency(name);
    return entry ? `${entry.code} — ${entry.name}` : name;
  };

  return (
    <EditableMasterSelect
      masterKey="currencies"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchable={searchable}
      clearable={clearable}
      disabled={disabled}
      error={error}
      id={id}
      ariaLabel={ariaLabel}
      className={className}
      formatLabel={formatLabel}
    />
  );
}

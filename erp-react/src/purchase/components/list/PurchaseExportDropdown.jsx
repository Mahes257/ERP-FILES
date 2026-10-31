/**
 * purchase/components/list/PurchaseExportDropdown.jsx
 * ------------------------------------------------------------------
 * Shared export dropdown (PDF / Excel / CSV / Print), extracted from
 * the Purchase Requisition list markup (export-dropdown / export-btn /
 * export-menu, styled by cpr-list.css). Self-contained with outside
 * click close. Delegates each action to the provided onExport handler.
 * ------------------------------------------------------------------
 */
import { useRef, useState } from 'react';
import { Download, FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { PURCHASE_AREAS, areaForPath, allows } from '../../access/catalog';

function ChevronDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const ITEMS = [
  { key: 'pdf', label: 'Export PDF', icon: FileDown },
  { key: 'excel', label: 'Export Excel', icon: FileSpreadsheet },
  { key: 'csv', label: 'Export CSV', icon: FileText },
  { key: 'print', label: 'Print', icon: Printer }
];

export default function PurchaseExportDropdown({ onExport, buttonLabel = 'Export', area }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { permissions } = usePurchaseAccess();
  const areaKey = area || areaForPath(window.location.pathname);
  const definition = PURCHASE_AREAS.find((entry) => entry.key === areaKey);

  useClickOutside(ref, () => setOpen(false), open);

  // Export and Print are separate permissions: the button disappears when the
  // area's Export is OFF, and the Print entry disappears when its Print is OFF.
  // Export is produced in the browser from data the user already read, so this
  // control (with the backend's View gate) is the enforcement point for it.
  // An area that does not declare the action has no switch for it, so the
  // control is left exactly as it was rather than silently removed.
  const protects = (action) => Boolean(areaKey && definition && definition.actions.includes(action));
  const exportAllowed = !protects('export') || allows(permissions, areaKey, 'export');
  const printAllowed = !protects('print') || allows(permissions, areaKey, 'print');

  if (!exportAllowed) return null;

  const run = (key) => {
    setOpen(false);
    if (key === 'print' && !printAllowed) return;
    if (onExport) onExport(key);
  };

  return (
    <div className={`export-dropdown ${open ? 'open' : ''}`} ref={ref}>
      <button
        type="button"
        className="export-btn"
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Download size={13} /> Export <ChevronDownIcon />
      </button>
      {open && (
        <div className="export-menu">
          {ITEMS.filter((item) => item.key !== 'print' || printAllowed).map((item) => (
            <a
              key={item.key}
              href="#"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                run(item.key);
              }}
            >
              <item.icon size={16} /> {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
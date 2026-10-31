/**
 * purchase/components/list/PurchaseColumnsDropdown.jsx
 * ------------------------------------------------------------------
 * Shared column-visibility dropdown (col-vis-menu / colvis-* classes,
 * styled by cpr-list.css), extracted from the Purchase Requisition
 * list. Self-contained with outside click close. Supports a set of
 * pinned (locked) column keys that cannot be hidden.
 * ------------------------------------------------------------------
 */
import { useRef, useState } from 'react';
import { Columns3, Eye, Search } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

export default function PurchaseColumnsDropdown({
  columns = [],
  onToggleColumn,
  onShowAll,
  onHideAll,
  lockedKeys = ['prNo', 'actions']
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open);

  const filtered = columns.filter((col) => col.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="Manage columns"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Columns3 size={12} /> Columns
      </button>
      {open && (
        <div className="col-vis-menu show">
          <div className="colvis-dropdown-inner">
            <div className="colvis-search">
              <Search size={13} />
              <input
                type="text"
                className="colvis-search-input"
                placeholder="Search columns..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search columns"
              />
            </div>
            <div className="colvis-items-scroll">
              {filtered.map((col) => {
                const locked = lockedKeys.includes(col.key);
                return (
                  <label key={col.key} className="colvis-item">
                    <input
                      type="checkbox"
                      checked={col.visible !== false}
                      disabled={locked}
                      onChange={() => onToggleColumn(col.key)}
                    />
                    <span>{col.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="colvis-footer">
              <div className="colvis-actions-row">
                <button type="button" className="colvis-action-btn" onClick={onShowAll}>
                  <Eye size={12} /> Show All
                </button>
                <button type="button" className="colvis-action-btn" onClick={onHideAll}>
                  <Eye size={12} /> Hide All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
/**
 * purchase/components/list/PurchaseBulkToolbar.jsx
 * ------------------------------------------------------------------
 * Shared bulk action bar for Purchase list pages (bulk-action-bar /
 * bulk-count / bulk-actions, styled by cpr-list.css +
 * requisition-list-polish.css), extracted verbatim from the Purchase
 * Requisition List master markup.
 *
 * Renders the selection count plus action buttons using the shared
 * btn / btn-sm / btn-ghost classes — danger actions get
 * btn-bulk-danger, everything else btn-bulk-primary — so height,
 * padding, background, border radius, shadow, spacing, hover, disabled
 * state and entrance animation are identical on every list page.
 *
 * Actions can be split into a compact primary row plus a secondary
 * "More (⋮)" dropdown (portal-based ActionMenu, same component the
 * per-row action menus use) so the bar stays on a single line on all
 * desktop resolutions even with many actions:
 *   actions     [{ key, label, icon, danger? }]  primary, flat buttons
 *   moreActions [{ key, label, icon, danger? }]  secondary, in the menu
 *
 * Props:
 *   selectedCount  number of selected rows (drives the .visible state)
 *   actions        primary action buttons
 *   moreActions    optional secondary actions in the "More" dropdown
 *   onAction       fn(key) — invoked with the action key
 *   id             optional id for the bar (e.g. vendorBulkActionBar)
 * ------------------------------------------------------------------
 */
import { useState } from 'react';
import ActionMenu from '../../../components/Common/ActionMenu';

export default function PurchaseBulkToolbar({
  selectedCount = 0,
  actions = [],
  moreActions = [],
  onAction,
  id
}) {
  const [anchor, setAnchor] = useState(null);
  const hasMore = moreActions.length > 0;

  const run = (key) => {
    setAnchor(null);
    if (onAction) onAction(key);
  };

  return (
    <div className={`bulk-action-bar ${selectedCount > 0 ? 'visible' : ''}`} id={id}>
      <span className="bulk-count">
        <strong>{selectedCount}</strong> selected
      </span>
      <div className="bulk-actions">
        {actions.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`btn btn-sm btn-ghost ${item.danger ? 'btn-bulk-danger' : 'btn-bulk-primary'}`}
            onClick={() => run(item.key)}
          >
            {item.icon && <item.icon size={12} />} {item.label}
          </button>
        ))}
        {hasMore && (
          <div className="action-menu-wrap">
            <button
              type="button"
              className={`btn btn-sm btn-ghost btn-bulk-primary ${anchor ? 'open' : ''}`}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={Boolean(anchor)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setAnchor((prev) => (prev === e.currentTarget ? null : e.currentTarget));
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
              More
            </button>
            <ActionMenu
              items={moreActions}
              anchorEl={anchor}
              open={Boolean(anchor)}
              onClose={() => setAnchor(null)}
              onActionClick={(key) => run(key)}
              variant="cpr"
              menuLabel="More actions"
            />
          </div>
        )}
      </div>
    </div>
  );
}

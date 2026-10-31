import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreVertical } from 'lucide-react';

/**
 * ActionMenu — portal-based row/card actions menu.
 *
 * Renders the dropdown through ReactDOM.createPortal(document.body) so it is
 * never clipped by a table, tbody, overflow wrapper, scroll container, sticky
 * column or viewport edge. Position is computed from the trigger's
 * getBoundingClientRect() and flips up / toward the left when there is not
 * enough space below / on the right. Closes on outside click and Escape.
 *
 * Items support the shapes used across the app:
 *   - { key, label, icon, danger }        → action button
 *   - { key, label, icon, disabled, disabledReason } → unavailable action
 *     (rendered greyed out and not clickable, with the reason as tooltip)
 *   - { section: 'LEAD' } or { heading: true, label: 'LEAD' } → section heading
 *   - { divider: true }                   → divider
 *
 * The trigger is icon-only by default (row ⋮ menus). Pass `label` to render a
 * labelled trigger — `[⋯ More v]` — which is the standard overflow control in
 * the top action area of Detail / View pages. Pass `triggerClassName` to paint
 * it with the shared `.erp-detail-action` class.
 */
export default function ActionMenu({
  items = [],
  onAction,
  triggerClassName = '',
  menuClassName = '',
  buttonLabel = 'Row actions',
  label,
  icon: TriggerIcon = MoreVertical,
  // Opt-in: keep the trigger's own column free of the dropdown. Row lists whose
  // action button sits in a PINNED right-hand Actions column need this, because
  // a menu right-aligned to the trigger covers the action buttons of every row
  // below it — a click on those then lands on the open menu panel instead of
  // switching to that row's menu.
  keepTriggerColumnClear = false
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 320 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const MARGIN = 8;
  const GAP = 6;

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const menuWidth = menu?.offsetWidth || 240;
    const menuHeight = menu?.offsetHeight || 320;
    const maxW = Math.min(menuWidth, vw - 2 * MARGIN);

    // Vertical: below by default, flip above when there is not enough space.
    const spaceBelow = vh - rect.bottom - GAP;
    let top = rect.bottom + GAP;
    let maxHeight = spaceBelow;
    if (spaceBelow < Math.min(menuHeight, 320) && rect.top - GAP > spaceBelow) {
      top = Math.max(MARGIN, rect.top - Math.min(menuHeight, vh - 2 * MARGIN) - GAP);
      maxHeight = vh - top - MARGIN;
    }
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN));
    maxHeight = Math.max(120, Math.min(maxHeight, vh - top - MARGIN));

    // Horizontal: right-aligned by default, flip toward the left when the
    // dropdown would cross the left viewport edge.
    let left = rect.right - maxW;
    if (keepTriggerColumnClear) {
      // Align the dropdown's RIGHT edge to the trigger's LEFT edge (minus the
      // usual gap) so no part of it covers the trigger column. The rows'
      // action buttons therefore stay clickable while a menu is open, and one
      // click both closes this menu and opens the sibling row's.
      left = rect.left - maxW - GAP;
    }
    if (left < MARGIN) {
      left = rect.left;
      if (left + maxW > vw - MARGIN) left = vw - MARGIN - maxW;
    }
    left = Math.max(MARGIN, Math.min(left, vw - maxW - MARGIN));

    setPos({ top, left, maxHeight });
  }, [keepTriggerColumnClear]);

  const toggle = (e) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  const handleItemClick = (e, key, disabled) => {
    if (disabled) return;
    // The menu is portaled to document.body but it is still a React child,
    // so a click here would bubble to any React parent (e.g. a clickable
    // Kanban card) and trigger its onClick too. Stop it — the menu item's
    // action is the only thing a click inside the menu may do.
    e.stopPropagation();
    setOpen(false);
    onAction?.(key);
  };

  // Position after the portaled menu has mounted.
  useLayoutEffect(() => {
    if (!open) return undefined;
    positionMenu();
    const onResize = () => positionMenu();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, positionMenu]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close on any scroll (page or inner scroll container) so the fixed-position
  // menu never detaches from its trigger while the table/container scrolls.
  // Scrolls originating inside the menu itself (its own overflow-y scroll) are
  // ignored so the user can still scroll a tall menu.
  useEffect(() => {
    if (!open) return undefined;
    const insideMenuOrTrigger = (target) =>
      menuRef.current?.contains(target) || triggerRef.current?.contains(target);
    const onScroll = (e) => {
      if (insideMenuOrTrigger(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onScroll);
    };
  }, [open]);

  // Close on outside click / touch (document-level because the menu is portaled).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        <TriggerIcon className={label ? undefined : 'w-4 h-4'} />
        {label ? <span className="am-trigger-label">{label}</span> : null}
        {label ? <ChevronDown aria-hidden="true" /> : null}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={menuClassName}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              maxHeight: pos.maxHeight,
              minWidth: 200,
              zIndex: 2147483000,
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
              padding: '4px',
              overflowY: 'auto'
            }}
          >
            {items.map((item, index) => {
              const headingLabel = item.heading ? item.label : item.section;
              if (headingLabel) {
                return (
                  <div key={`section-${index}`} className="am-section-heading">
                    {headingLabel}
                  </div>
                );
              }
              if (item.divider) {
                return <div key={`divider-${index}`} className="am-divider" />;
              }
              const Icon = item.icon;
              const disabled = Boolean(item.disabled);
              return (
                <button
                  key={item.key ?? index}
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  aria-disabled={disabled || undefined}
                  title={disabled ? item.disabledReason : undefined}
                  onClick={(e) => handleItemClick(e, item.key, disabled)}
                  className={`am-item${item.danger ? ' am-item-danger' : ''}${disabled ? ' am-item-disabled' : ''}`}
                >
                  {Icon && <Icon className="am-item-icon" />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

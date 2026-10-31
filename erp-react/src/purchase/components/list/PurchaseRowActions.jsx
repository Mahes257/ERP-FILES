/**
 * purchase/components/list/PurchaseRowActions.jsx
 * ------------------------------------------------------------------
 * Purchase row-overflow ("three dot") action menu.
 *
 * The trigger button stays exactly where it was in the row, but the
 * menu itself is portaled to <body> and positioned in viewport
 * coordinates (`position: fixed`) so it is a true floating overlay:
 * it is no longer clipped by the table scroll container, the table
 * card (`overflow: hidden`) or the page scroll area, and it always
 * overlays surrounding content.
 *
 * Visuals are unchanged — the portaled host carries the `cpr-page`
 * scope class (plus the app-wide `action-menu-portal` print marker)
 * so the existing `.cpr-page .action-menu` / `.action-item` rules in
 * cpr-list.css style it exactly as before, and the menu is rendered
 * static inside its fixed host instead of `absolute` relative to the
 * cell.
 *
 * Positioning: right edges aligned with the trigger and a 4px gap,
 * mirroring the old in-cell geometry; the menu flips above the
 * trigger when the space below is too small, clamps to the viewport
 * edges, and becomes scrollable when neither side can fit it.
 *
 * Public API: ({ actions, onSelect, buttonLabel }).
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { PURCHASE_AREAS, areaForPath, allows } from '../../access/catalog';

/**
 * Row-menu key → the Purchase action it performs.
 *
 * The menus across the module use the same handful of keys; mapping them here
 * means a row action is gated once, centrally, instead of in every page. A key
 * that is not listed (a "view", a custom navigation) is left alone — it is not
 * a protected operation.
 */
const ACTION_FOR_KEY = {
  approve: 'approve',
  reject: 'reject',
  delete: 'delete',
  print: 'print',
  export: 'export',
  submit: 'submit',
  release: 'release',
  acknowledge: 'acknowledge',
  ack: 'acknowledge',
  convert: 'convert',
  evaluate: 'evaluate',
  award: 'award',
  close: 'close',
  cancel: 'cancel',
  complete: 'complete',
  receive: 'receive',
  match: 'match',
  rematch: 'match',
  pay: 'pay',
  download: 'download',
  upload: 'upload',
  duplicate: 'create',
  edit: 'edit'
};

/** Menu box width — must match `.cpr-page .action-menu { width: 240px }`. */
const MENU_WIDTH = 240;
/** Space between the trigger and the menu — matches the old `top: calc(100% + 4px)`. */
const MENU_GAP = 4;
/** Minimum breathing room kept against the viewport edges. */
const VIEWPORT_EDGE = 8;
/** Smallest scrollable height we will clamp a flipped menu to. */
const MIN_MENU_HEIGHT = 120;

export default function PurchaseRowActions({ actions = [], onSelect, buttonLabel = 'Row actions', area }) {
  const { permissions } = usePurchaseAccess();
  const areaKey = area || areaForPath(window.location.pathname);

  // Hide a menu item whose dedicated permission is OFF. View stays the route
  // gate; everything else is filtered per action so turning Delete off never
  // removes Approve, and a submodule's own area is used when the page is one.
  const visibleActions = useMemo(() => {
    if (!areaKey) return actions;
    return actions
      .filter((item) => {
        if (item.divider) return true;
        const action = ACTION_FOR_KEY[item.key];
        if (!action) return true;
        const definition = PURCHASE_AREAS.find((entry) => entry.key === areaKey);
        // An area that does not model this action has no switch for it, so the
        // item is left exactly as it was — the backend's own authority decides.
        if (definition && !definition.actions.includes(action)) return true;
        return allows(permissions, areaKey, action);
      })
      .filter((item, index, list) => {
        // Drop dividers that no longer separate anything.
        if (!item.divider) return true;
        const before = list.slice(0, index).some((entry) => !entry.divider);
        const after = list.slice(index + 1).some((entry) => !entry.divider);
        return before && after;
      });
  }, [actions, areaKey, permissions]);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  /** Last applied box — lets scroll/resize ignore no-op recomputations. */
  const lastPosRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  /**
   * Anchors the floating menu to the trigger button in viewport
   * coordinates. The first pass runs with an unmeasured height (h = 0)
   * and the layout effect re-runs it with the real height before the
   * browser paints, so the menu never jumps.
   *
   * Deliberately synchronous (no requestAnimationFrame): it must stay
   * exact even where frame callbacks are throttled, and it skips the
   * state update when the box has not actually moved.
   */
  const place = useCallback(() => {
    const trigger = wrapRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const height = menuRef.current ? menuRef.current.getBoundingClientRect().height : 0;

    // Right edges aligned with the trigger (was `right: 0` inside the cell).
    let left = rect.right - MENU_WIDTH;
    left = Math.min(Math.max(VIEWPORT_EDGE, left), Math.max(VIEWPORT_EDGE, vw - MENU_WIDTH - VIEWPORT_EDGE));

    // Vertical bands, always bounded by the viewport so the menu can never
    // end up half off-screen (the trigger itself may be partly outside it).
    const lowestTop = vh - VIEWPORT_EDGE;
    const belowTop = rect.bottom + MENU_GAP;
    const aboveEnd = Math.min(rect.top - MENU_GAP, lowestTop);
    const spaceBelow = Math.max(0, lowestTop - Math.max(belowTop, VIEWPORT_EDGE));
    const spaceAbove = Math.max(0, aboveEnd - VIEWPORT_EDGE);

    let top = Math.max(VIEWPORT_EDGE, belowTop);
    let maxHeight;

    if (height > 0 && height > spaceBelow) {
      if (height <= spaceAbove) {
        // Flip above the trigger — the whole menu fits there.
        top = aboveEnd - height;
      } else {
        // Neither side fits it whole: use the roomier side and scroll inside.
        maxHeight = Math.min(vh - 2 * VIEWPORT_EDGE, Math.max(MIN_MENU_HEIGHT, Math.max(spaceAbove, spaceBelow)));
        top = spaceAbove >= spaceBelow ? aboveEnd - maxHeight : belowTop;
        top = Math.min(Math.max(VIEWPORT_EDGE, top), Math.max(VIEWPORT_EDGE, lowestTop - maxHeight));
      }
    }

    const next = { top, left, maxHeight };
    const prev = lastPosRef.current;
    if (
      prev
      && Math.abs(prev.top - next.top) < 0.5
      && Math.abs(prev.left - next.left) < 0.5
      && prev.maxHeight === next.maxHeight
    ) {
      return;
    }
    lastPosRef.current = next;
    setPos(next);
  }, []);

  // Measure + position before paint so the menu does not flash unplaced.
  useLayoutEffect(() => {
    if (!open) {
      lastPosRef.current = null;
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const withinMenu = (target) => {
      const trigger = wrapRef.current;
      const menu = menuRef.current;
      if (trigger && trigger.contains(target)) return true;
      // The menu lives on <body>, so it is not inside the trigger wrapper.
      if (menu && menu.contains(target)) return true;
      return false;
    };

    const onDown = (e) => {
      if (!withinMenu(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };

    // Keep the menu glued to its trigger while the page or the table
    // scroll container moves, and drop it once the trigger is gone.
    const reposition = () => {
      const rect = wrapRef.current && wrapRef.current.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        close();
        return;
      }
      place();
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Capture phase: catches scrolls fired by inner containers too.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, close, place]);

  const handleAction = (key) => {
    close();
    onSelect && onSelect(key);
  };

  if (!visibleActions || visibleActions.length === 0) return null;

  return (
    <div className="action-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`action-menu-btn ${open ? 'open' : ''}`}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {open && createPortal(
        /* Fixed host: no layout ancestor can clip it. It carries the
           `cpr-page` design scope (so the existing menu styles apply)
           and the app-wide `action-menu-portal` marker (print rules). */
        <div
          className="action-menu-portal cpr-page"
          style={{
            position: 'fixed',
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : 0,
            zIndex: 99999,
          }}
        >
          {/* Clicks inside the menu must not reach the row: list pages that set
             `onRowClick` (GRN, Quality, Inventory) navigate on any row click, so
             a bubbled menu click would fire a row action AND the row navigation
             at once — the menu item closed over itself and the user was taken to
             the detail page instead of the modal/screen the action opens. */}
          <div
            ref={menuRef}
            className="action-menu"
            role="menu"
            style={{
              // The host already places the menu; keep it in flow inside it
              // instead of the in-cell `absolute / right: 0 / top: calc(100% + 4px)`.
              position: 'static',
              top: 'auto',
              right: 'auto',
              maxHeight: pos && pos.maxHeight ? pos.maxHeight : undefined,
              overflowY: pos && pos.maxHeight ? 'auto' : undefined,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {visibleActions.map((item, index) => {
              if (item.divider) {
                return <div key={`divider-${index}`} className="am-divider" />;
              }
              const Icon = item.icon;
              return (
                <button
                  key={item.key ?? index}
                  type="button"
                  role="menuitem"
                  onClick={() => handleAction(item.key)}
                  className={`action-item${item.danger ? ' text-danger' : ''}`}
                >
                  {Icon && <Icon />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * purchase/components/documentSubmenu.js
 * ------------------------------------------------------------------
 * Open-submenu registry for the nested "More Operations" popover.
 *
 * The nested submenu (DocumentOperationsMenu with a custom trigger) is
 * portaled to document.body, so it lives OUTSIDE the parent floating
 * Actions menu's DOM. A parent FloatingActionsMenu consults
 * `isInsideDocumentSubmenu` on mousedown so clicks inside the open
 * submenu are not treated as outside clicks — which would otherwise
 * close the parent menu before the submenu item's click can fire.
 *
 * Only one nested submenu can be open at a time (menus are exclusive),
 * so a single module-level reference is sufficient.
 * ------------------------------------------------------------------
 */
let openSubmenuNode = null;

export function registerDocumentSubmenu(node) {
  openSubmenuNode = node;
}

export function isInsideDocumentSubmenu(target) {
  return Boolean(openSubmenuNode) && openSubmenuNode.contains(target);
}

/* ─── Shared keyboard navigation for the portaled document menus ───
 *
 * Both the row Actions menu (FloatingActionsMenu) and the nested
 * "More Operations" submenu (DocumentOperationsMenu) support roving
 * arrow-key navigation: ArrowDown / ArrowUp move between items
 * (wrapping), Home / End jump to the first / last item, and the
 * focused item is executed with Enter / Space via the native button
 * behaviour. Escape is handled by each menu's own listener.
 * ------------------------------------------------------------------ */

function getMenuItems(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('button')).filter(
    (btn) => !btn.disabled && btn.getClientRects().length > 0
  );
}

/** Move focus inside `container` according to the pressed key. */
export function handleMenuKeyNav(event, container) {
  const key = event.key;
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
  const items = getMenuItems(container);
  if (items.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  let index = items.indexOf(document.activeElement);
  if (key === 'ArrowDown') index = index === -1 ? 0 : (index + 1) % items.length;
  else if (key === 'ArrowUp') index = index === -1 ? items.length - 1 : (index - 1 + items.length) % items.length;
  else if (key === 'Home') index = 0;
  else if (key === 'End') index = items.length - 1;
  items[index].focus();
}

/** Focus the first item when a menu opens (standard menu behaviour). */
export function focusFirstMenuItem(container) {
  const items = getMenuItems(container);
  items[0]?.focus();
}
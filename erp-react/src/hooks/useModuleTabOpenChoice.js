import { useCallback, useState } from 'react';

/**
 * useModuleTabOpenChoice — module-tab counterpart of the record-number
 * "Open in Existing Page / Open in New Tab" popover that the Leads list
 * (and the CPR/Sales list pages) already use.
 *
 * Clicking a module tab no longer navigates straight away: it opens the same
 * RecordOpenPopover anchored to the clicked tab, so the user can either switch
 * the current page or open the module's real route in a new browser tab.
 *
 * Usage:
 *   const { choice, requestOpen, close } = useModuleTabOpenChoice();
 *
 *   onClick={(e) => requestOpen(e, { label: tab.label, route: TAB_ROUTES[tab.key] },
 *                               () => setActiveTab(tab.key))}
 *
 *   <RecordOpenPopover
 *     open={choice !== null}
 *     recordType={choice?.label || ''}
 *     recordLabel={choice?.route || ''}
 *     route={choice?.route || '/'}
 *     onOpenExisting={choice?.onOpenExisting}
 *     onClose={close}
 *     anchorRef={choice?.anchorRef}
 *   />
 */
export default function useModuleTabOpenChoice() {
  const [choice, setChoice] = useState(null);

  const requestOpen = useCallback((event, { label, route }, onOpenExisting) => {
    // Capture the anchor synchronously — the synthetic event is not retained.
    const anchor = event?.currentTarget || event?.target || null;
    if (!anchor || !route) {
      onOpenExisting?.();
      return;
    }
    setChoice({ label, route, anchorRef: { current: anchor }, onOpenExisting });
  }, []);

  const close = useCallback(() => setChoice(null), []);

  return { choice, requestOpen, close };
}

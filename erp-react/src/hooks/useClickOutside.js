/**
 * useClickOutside.js
 * ------------------------------------------------------------------
 * Calls the provided handler when a pointer event occurs outside of
 * the referenced element(s). Powers dropdowns, menus and column panes.
 *
 * `refOrRefs` may be a single React ref or an array of refs.  When an
 * array is passed, a click INSIDE *any* of the listed refs is treated
 * as an "inside" click and the handler is NOT called.  This is needed
 * for portal-rendered popups whose DOM lives outside the trigger ref.
 * ------------------------------------------------------------------
 */
import { useEffect } from 'react';

export default function useClickOutside(refOrRefs, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const refs = Array.isArray(refOrRefs) ? refOrRefs : [refOrRefs];

    const handleClick = (event) => {
      for (const r of refs) {
        if (r && r.current && r.current.contains(event.target)) return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [refOrRefs, handler, enabled]);
}

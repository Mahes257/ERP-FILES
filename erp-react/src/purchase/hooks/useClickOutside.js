/**
 * purchase/hooks/useClickOutside.js
 * ------------------------------------------------------------------
 * Calls the provided handler when a pointer event occurs outside of
 * the referenced element. Powers dropdowns, menus and column panes.
 * ------------------------------------------------------------------
 */
import { useEffect } from 'react';

export default function useClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        handler(event);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [ref, handler, enabled]);
}

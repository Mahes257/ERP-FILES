/**
 * useDebounce.js
 * ------------------------------------------------------------------
 * Returns a debounced copy of a value. Used to avoid firing a
 * server request on every keystroke in the search box.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';

export default function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

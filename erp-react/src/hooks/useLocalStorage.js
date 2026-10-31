/**
 * useLocalStorage.js
 * ------------------------------------------------------------------
 * useState that persists to localStorage. Used for column
 * visibility / ordering preferences so the table layout survives
 * page reloads.
 * ------------------------------------------------------------------
 */
import { useState, useEffect } from 'react';

export default function useLocalStorage(key, initialValue) {
  const readValue = () => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  };

  const [value, setValue] = useState(readValue);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota / serialization errors — storage is best effort.
    }
  }, [key, value]);

  return [value, setValue];
}

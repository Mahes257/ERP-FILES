import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'erp-theme';
const THEME_TRANSITION_MS = 300;

const ThemeContext = createContext(null);

function getInitialTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }) {  const [theme, setTheme] = useState(getInitialTheme);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';

    root.classList.toggle('dark', isDark);

    if (!isFirstRender.current) {
      root.classList.add('theme-transition');
      const timer = window.setTimeout(() => root.classList.remove('theme-transition'), THEME_TRANSITION_MS);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // storage unavailable - theme still applies for this session
      }
      return () => window.clearTimeout(timer);
    }

    isFirstRender.current = false;
    return undefined;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      toggleTheme
    }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

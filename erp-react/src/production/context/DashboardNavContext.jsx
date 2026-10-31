import React, { createContext, useContext, useState, useCallback } from 'react';

// ============================================================
// Dashboard Navigation Context
//
// Allows the Production Dashboard to pass navigation state
// (status filter, stage, etc.) to destination module pages
// when the user clicks a KPI card, workflow stage, or pending
// action.  The destination page reads this context on mount,
// applies the filter, then clears it.
//
// Usage:
//   Dashboard:  navigateWith({ status: 'Pending' }) → navigate('/production/quality')
//   Quality:    const nav = useDashboardNav(); useEffect(() => { if (nav.status) setActiveTab(nav.status); clearNav(); }, []);
// ============================================================

const DashboardNavContext = createContext(null);

export function DashboardNavProvider({ children }) {
  const [nav, setNav] = useState(null);

  const navigateWith = useCallback((state) => {
    setNav(state);
  }, []);

  const clearNav = useCallback(() => {
    setNav(null);
  }, []);

  return (
    <DashboardNavContext.Provider value={{ nav, navigateWith, clearNav }}>
      {children}
    </DashboardNavContext.Provider>
  );
}

export function useDashboardNav() {
  return useContext(DashboardNavContext);
}

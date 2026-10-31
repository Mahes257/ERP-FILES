import React, { createContext, useContext, useState, useCallback } from 'react';
import { usePersistedState } from '../utils/storage';

const CurrentUserContext = createContext(null);

/**
 * CurrentUserProvider — tracks the logged-in user for role-based
 * access control (e.g., only Admin can approve Work Orders).
 *
 * The current user is persisted to localStorage so it survives refresh.
 * In a real app this would come from authentication; here it defaults
 * to the first Admin user or a placeholder.
 */
export function CurrentUserProvider({ children }) {
  const [currentUser, setCurrentUser] = usePersistedState('currentUser', {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@vishaktech.com',
    role: 'Admin',
    department: 'Administration',
  });

  const switchUser = useCallback((user) => {
    setCurrentUser(user);
  }, [setCurrentUser]);

  const isAdmin = currentUser?.role === 'Admin';
  const isProductionManager = currentUser?.role === 'Production Manager';

  return (
    <CurrentUserContext.Provider value={{ currentUser, switchUser, isAdmin, isProductionManager }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used within CurrentUserProvider');
  return ctx;
}

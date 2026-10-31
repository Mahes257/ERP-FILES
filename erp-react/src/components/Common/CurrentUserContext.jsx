/**
 * CurrentUserContext.jsx
 * ------------------------------------------------------------------
 * Tracks the logged-in user for role-based access control.
 * Mirrors the Production CurrentUserContext pattern.
 *
 * The current user is read from localStorage (set at login OR by the local
 * auto-login bootstrap) and exposes an `isAdmin` flag that controls approval
 * button visibility across Sales and Marketing modules.
 *
 * It also exposes `canDeleteSales` — the frontend mirror of the backend's
 * SALES_DELETE authority — so the Sales delete actions read as intent instead
 * of comparing roles inline at every call site.
 *
 * The value follows the stored session: it re-reads on the shared auth-state
 * event (fired by storeAuth/clearAuth) and on cross-tab storage changes, so a
 * session established after first paint — local auto-login, or a sign-out
 * followed by a new sign-in — is reflected instead of being frozen at mount.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AUTH_STATE_CHANGED_EVENT, getStoredUser } from '../../services/tokenStorage';
import { hasSalesDelete } from '../../utils/salesPermissions';

const CurrentUserContext = createContext(null);

export function CurrentUserProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const value = useMemo(() => {
    const role = user?.role || 'USER';
    const isAdmin = role === 'ADMIN';
    const isManager = role === 'MANAGER' || role === 'ADMIN';
    // Sales delete authority — SALES_DELETE. The rule itself lives in the one
    // shared mirror of the backend's role → permission map
    // (utils/salesPermissions), so the eight Sales document modules gate their
    // delete actions on ONE capability instead of comparing roles inline. UI
    // gate only — it never replaces the server-side check, which stays the sole
    // enforcement point.
    const canDeleteSales = hasSalesDelete(role);
    return { currentUser: user, isAdmin, isManager, role, canDeleteSales };
  }, [user]);

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used within CurrentUserProvider');
  return ctx;
}

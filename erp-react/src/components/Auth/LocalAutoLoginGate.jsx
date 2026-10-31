/**
 * LocalAutoLoginGate
 * ------------------------------------------------------------------
 * Boot-time bridge to the backend's local-development auto-login, exposed to
 * the rest of the app through {@link useLocalAutoLogin}.
 *
 * When there is no stored session, it asks the backend whether local
 * auto-login is available. The backend only says yes when the feature is
 * explicitly enabled on that server AND the caller is the local machine, so a
 * deployed instance always answers no and this component is a no-op there.
 *
 * On success it persists the REAL tokens and profile (nothing is fabricated).
 * It also tells the router whether local mode is active, which is what lets
 * `/signin` redirect to the Dashboard and logout return to the Dashboard
 * instead of a sign-in form — locally only. With the feature off, `enabled` is
 * false and every normal sign-in behaviour is unchanged.
 *
 * While the check is in flight it renders the loader instead of the route
 * tree, so the Sign-In page can never flash for a user who is about to be
 * signed in automatically.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageLoader from '../Common/PageLoader';
import api from '../../api/axiosInstance';
import authService, { isAuthenticated, storeAuth, storeTokens } from '../../services/authService';
import { LocalAutoLoginContext } from './localAutoLoginContext';

export default function LocalAutoLoginGate({ children }) {
  const [booted, setBooted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The route the app opened on. Held in a ref created on first render so the
  // boot effect can read it without depending on it (a later route change must
  // never re-trigger the boot-time sign-in).
  const bootPathRef = useRef(pathname);

  /** Exchanges the server's configured local account for a genuine session. */
  const signIn = useCallback(async () => {
    try {
      const payload = await authService.localAutoLogin();
      if (!payload?.token) return false;
      // Persist the genuine tokens first so /auth/me is authorized, then store
      // the profile the server reports for this account.
      storeTokens(payload.token, payload.refreshToken);
      let user = {
        email: payload.email,
        fullName: payload.fullName,
        role: payload.role
      };
      try {
        const { data } = await api.get('/auth/me', { suppressGlobalError: true });
        const profile = data?.data;
        if (profile?.email) {
          user = {
            email: profile.email,
            fullName: profile.fullName,
            role: profile.role
          };
        }
      } catch {
        // Best-effort: the login payload already carries the real profile.
      }
      storeAuth(payload.token, payload.refreshToken, user);
      setAuthenticated(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      // Asked even when a session already exists: the answer decides whether
      // /signin redirects and where logout goes.
      const status = await authService.localAutoLoginStatus();
      const available = Boolean(status?.enabled);
      if (cancelled) return;
      setEnabled(available);
      if (available && !isAuthenticated()) {
        const ok = await signIn();
        if (cancelled) return;
        if (ok && (bootPathRef.current === '/' || bootPathRef.current === '/signin')) {
          navigate('/dashboard', { replace: true });
        }
      }
      if (!cancelled) setBooted(true);
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, [signIn, navigate]);

  if (!booted) return <PageLoader />;
  return (
    <LocalAutoLoginContext.Provider value={{ enabled, authenticated, signIn }}>
      {children}
    </LocalAutoLoginContext.Provider>
  );
}

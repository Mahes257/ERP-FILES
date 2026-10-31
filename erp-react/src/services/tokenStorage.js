/**
 * Token storage for the ERP auth flow (Authorization-header JWT + refresh).
 *
 * SECURITY NOTE (see SECURITY_AUDIT.md §11): tokens live in localStorage —
 * this is the "Option A" design (Bearer header, no cookies). The access token
 * is short-lived (30 min) and the refresh token is rotated on every use.
 * Mitigations for the XSS exposure: strict CSP at the hosting layer, no
 * dangerouslySetInnerHTML with untrusted data, and no third-party scripts.
 * Migrating to HttpOnly cookies is documented as a future option; the app is
 * deliberately not left in a half-migrated state.
 */

const TOKEN_KEY = 'authToken';
const REFRESH_KEY = 'refreshToken';
const USER_KEY = 'authUser';
export const AUTH_STATE_CHANGED_EVENT = 'erp:auth-state-changed';

function notifyAuthStateChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
  }
}

function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

/** Stores tokens + user after login/register. */
export function storeAuth(token, refreshToken, user) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  notifyAuthStateChanged();
}

/** Updates both tokens after a silent refresh. */
export function storeTokens(token, refreshToken) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  // Legacy identity key from an older app version — cleared so a signed-out
  // session cannot leave a stale user behind for any consumer to pick up.
  localStorage.removeItem('auth_user');
  notifyAuthStateChanged();
}

export function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp * 1000 <= Date.now();
}

/**
 * A session is considered active while a usable access token exists OR a
 * refresh token exists (the access token may be expired — the Axios
 * interceptor refreshes transparently on the next request).
 */
export function isAuthenticated() {
  const token = getStoredToken();
  const refresh = getStoredRefreshToken();
  if (!token && !refresh) return false;
  if (token && !isTokenExpired(token)) return true;
  return Boolean(refresh);
}

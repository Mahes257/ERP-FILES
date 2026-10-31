import axios from 'axios';
import {
  clearAuth,
  getStoredRefreshToken,
  getStoredToken,
  isTokenExpired,
  storeTokens
} from '../services/tokenStorage';

// Creating a reusable axios instance pointing to your Java Spring Boot server.
// Same-origin (/v1) so the app works identically on localhost and the ngrok URL
// from any device; Vite dev-server proxy forwards /v1 to the backend.
//
// Timeouts: a global 30s cap ensures a stalled request can never hang a page
// forever (a hung request also occupies one of the browser's 6-connections-per-
// host slots, which would otherwise make every subsequent page buffer). File
// uploads and blob exports get a generous override below because a multi-GB
// upload legitimately takes minutes.
const DEFAULT_TIMEOUT_MS = 30 * 1000;      // normal JSON requests
const SLOW_REQUEST_TIMEOUT_MS = 30 * 60 * 1000; // multipart uploads / blob downloads (30 min for 2 GB files)

const api = axios.create({
  // Environment-driven API base (erp-react/.env → VITE_API_URL). Kept relative
  // (/v1) so the same-origin Vite proxy keeps working unchanged; falls back to
  // the historical default when the variable is absent.
  baseURL: import.meta.env.VITE_API_URL || '/v1',
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: attach the current JWT to every request.
// Proactively refreshes the token if expired so that no request ever goes out
// with an expired token (prevents the transient 401 flash).
api.interceptors.request.use(
  async (config) => {
    // Skip proactive refresh for auth endpoints — they are either the refresh
    // call itself (would deadlock) or login/register which don't need a token.
    const url = config.url || '';
    const isAuthEndpoint =
      url.startsWith('/auth/login') ||
      url.startsWith('/auth/register') ||
      url.startsWith('/auth/refresh') ||
      url.startsWith('/auth/logout');
    const token = isAuthEndpoint ? getStoredToken() : await ensureFreshToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Long-running transfers (multipart uploads, blob/PDF exports) must not be
    // cut off by the 30s global timeout.
    if (
      (typeof FormData !== 'undefined' && config.data instanceof FormData) ||
      config.responseType === 'blob'
    ) {
      config.timeout = SLOW_REQUEST_TIMEOUT_MS;
    }
    // CRITICAL for FormData: the instance default 'Content-Type: application/json'
    // header makes axios's transformRequest JSON-stringify the FormData
    // (formDataToJSON) — e.g. POST /models became {"model":{},"file":{}} and the
    // backend rejected it with "Work Order is required". Removing the header here
    // (before transformRequest runs) lets the multipart body pass through
    // untouched and the browser set the correct multipart boundary.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (typeof config.headers?.delete === 'function') {
        config.headers.delete('Content-Type');
      } else {
        delete config.headers['Content-Type'];
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Single-flight refresh: concurrent 401s AND proactive refreshes share one
// refresh call so that a burst of requests on page load never floods the
// refresh endpoint.
let refreshPromise = null;

async function performRefresh() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', { refreshToken })
      .then((res) => {
        const payload = res?.data?.data;
        if (payload?.token) {
          storeTokens(payload.token, payload.refreshToken);
          return payload.token;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Proactively refresh the access token when it is expired or about to expire.
 * Called from the request interceptor so no request ever goes out with an
 * expired token — eliminating the transient 401 flash that previously appeared
 * in the console during normal page loads and navigations.
 *
 * Buffer: 60 seconds before actual expiry to avoid a race where the token
 * expires between the check and the backend processing the request.
 */
const TOKEN_BUFFER_MS = 60 * 1000; // refresh 60 s before expiry

async function ensureFreshToken() {
  const token = getStoredToken();
  const refreshToken = getStoredRefreshToken();
  // No token at all — let the request go through unauthenticated; the
  // response interceptor will handle 401 if the endpoint requires auth.
  if (!token && !refreshToken) return null;
  // Check if the token needs refresh: expired, or expiring within the buffer.
  const needsRefresh = !token || isTokenExpired(token) || tokenExpiringSoon(token);
  if (!needsRefresh) return token;
  // Token is expired/expiring or missing but a refresh token exists — refresh.
  return performRefresh();
}

/** Returns true when the token will expire within TOKEN_BUFFER_MS. */
function tokenExpiringSoon(token) {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (!payload || typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 - TOKEN_BUFFER_MS <= Date.now();
  } catch {
    return true; // malformed — treat as expiring
  }
}

function forceSignOut() {
  clearAuth();
  if (window.location.pathname !== '/signin') {
    window.location.assign('/signin');
  }
}

function publishApiError(error) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('erp:api-error', { detail: error }));
  }
}

// Response Interceptor:
//  - 401 on a protected endpoint → refresh the access token once (silently)
//    and replay the request; if refresh fails, clear the session.
//  - 403 → authenticated but forbidden: surface the error without logging the
//    user out.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Aborted requests are expected during CRM filter changes, component
    // cleanup, and navigation. They are not connectivity failures and must
    // never be promoted to the global error page.
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const url = error.config?.url || '';
    const isAuthEndpoint =
      url.startsWith('/auth/login') ||
      url.startsWith('/auth/register') ||
      url.startsWith('/auth/refresh') ||
      url.startsWith('/auth/logout');

    if (status === 401 && !isAuthEndpoint && !error.config?._retried) {
      error.config._retried = true;
      const newToken = await performRefresh();
      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return api(error.config);
      }
      forceSignOut();
      return Promise.reject(error);
    }

    // 401 on the auth endpoints themselves (bad credentials / bad refresh
    // token) — let the caller handle it; the refresh flow never loops here.
    if (status === 401 && url.startsWith('/auth/refresh')) {
      forceSignOut();
      return Promise.reject(error);
    }

    // The global UI owns user-facing error rendering. Auth endpoints remain
    // caller-owned so login and refresh preserve their existing behavior.
    //
    // A request may also opt out with `config.suppressGlobalError`: an
    // auxiliary lookup whose failure the caller renders in place (a related
    // record that no longer exists, a source record behind a document). Such a
    // request must not replace a VALID, working route with the global error
    // page — it still rejects, so the caller keeps full control.
    if (!isAuthEndpoint && status !== 401 && !error.config?.suppressGlobalError) {
      publishApiError(error);
    }

    return Promise.reject(error);
  }
);

export default api;

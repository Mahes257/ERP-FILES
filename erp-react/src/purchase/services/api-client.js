/**
 * purchase/services/api-client.js
 * ------------------------------------------------------------------
 * Shared machinery for the Purchase module's service facades.
 *
 *   · getCurrentActor() — reads the logged-in JWT user (stored by
 *     authService) and normalises it to { id, name, email, role }.
 *     NO hardcoded users anywhere: every activity / audit entry built
 *     client-side for the API uses this actor.
 *
 *   · isNetworkError() — distinguishes "backend unreachable" from real
 *     API failures (404, 422, 500, …).
 *
 *   · withFallback(apiCall, mockCall) — the single choke point through
 *     which every Purchase API call passes. Behaviour is controlled by
 *     the VITE_PURCHASE_DATA_MODE environment variable:
 *
 *       "local" (default) — the mock/local service is used directly.
 *         No network request is made. The UI loads immediately from
 *         localStorage. This is the correct mode for frontend-only
 *         development and testing.
 *
 *       "api" — the real REST endpoint is called first. Falls back
 *         to the mock ONLY on network errors (backend unreachable /
 *         offline). Real API errors (4xx / 5xx) propagate to the UI.
 *
 * The service interfaces themselves never change — components keep
 * calling `requisitionService.getRequisitions(...)` etc. Switching
 * between local and API mode requires only the env var change; no
 * component or hook code needs modification.
 * ------------------------------------------------------------------
 */
import { getStoredToken, getStoredUser } from '../../services/authService';

/**
 * Data mode: "local" (default) uses mock services + localStorage;
 * "api" calls the real Spring Boot backend.
 *
 * Set via VITE_PURCHASE_DATA_MODE in .env or at build time.
 */
const DATA_MODE = import.meta.env?.VITE_PURCHASE_DATA_MODE || 'api';

export function isApiMode() {
  return DATA_MODE === 'api';
}

/**
 * Best-effort decode of the JWT payload (id/role claims) without
 * pulling in a JWT library.
 */
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

/**
 * Returns the current logged-in actor. Never returns a hardcoded user.
 * Falls back to { id: 'anonymous', name: 'Unknown', email: '', role: '' }
 * when no session is present (e.g. unauthenticated preview).
 */
export function getCurrentActor() {
  const user = getStoredUser() || {};
  const token = getStoredToken();
  const claims = token ? decodeJwtPayload(token) : null;

  const name =
    user.fullName ||
    user.name ||
    claims?.name ||
    claims?.fullName ||
    user.email ||
    'Unknown';

  const email = user.email || claims?.email || '';
  const role = user.role || claims?.role || claims?.authorities || '';
  const id = claims?.sub || claims?.userId || user.id || email;

  return {
    id: String(id || 'anonymous'),
    name: String(name),
    email: String(email),
    role: String(role)
  };
}

/** True when the failure is "backend unreachable" (network / timeout). */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED') return true;
  return !error.response; // no HTTP response at all → connection-level failure
}

/**
 * Service facade helper.
 *   apiCall  — async () => real REST payload
 *   mockCall — async () => existing local/mock implementation result
 *
 * In "local" mode (the default) the mockCall is returned directly —
 * no network request is attempted.  In "api" mode the real REST
 * endpoint is called first; on network errors (backend unreachable /
 * offline) the mockCall is used as a graceful fallback.
 *
 * This keeps the UI responsive in frontend-only testing while
 * preserving the full API pathway for future backend integration.
 */
export async function withFallback(apiCall, mockCall) {
  /* ----------------------------------------------------------------
     LOCAL mode (default for frontend-only development / testing).
     No network request — the local service resolves immediately.
     ---------------------------------------------------------------- */
  if (DATA_MODE !== 'api') {
    return mockCall();
  }

  /* ----------------------------------------------------------------
     API mode — real backend integration.
     Calls the REST endpoint first; falls back to mock on network
     errors only (4xx/5xx propagate to the UI as real errors).
     ---------------------------------------------------------------- */
  return apiCall();
}

/** Convenience: true when a JWT session exists (used to gate API calls). */
export function hasSession() {
  return Boolean(getStoredToken());
}

/**
 * Normalises a backend page payload into the { data, total, page,
 * pageSize, totalPages } shape the mock services return.
 * Accepts Spring Page<T>, plain arrays or { data, total } envelopes.
 */
export function normalizePage(payload) {
  if (payload && Array.isArray(payload.data)) {
    return {
      data: payload.data,
      total: payload.total ?? payload.data.length,
      page: payload.page ?? 1,
      pageSize: payload.pageSize ?? (payload.data.length || 10),
      totalPages: payload.totalPages ?? 1
    };
  }
  if (Array.isArray(payload)) {
    return { data: payload, total: payload.length, page: 1, pageSize: payload.length, totalPages: 1 };
  }
  const content = payload?.content || payload?.records || [];
  return {
    data: content,
    total: payload?.totalElements ?? payload?.total ?? content.length,
    page: (payload?.number ?? 0) + 1,
    pageSize: payload?.size ?? (content.length || 10),
    totalPages: payload?.totalPages ?? 1
  };
}

/**
 * Unwraps an ApiResponse<T> envelope ({ data, message, success }) → T.
 * Plain payloads pass through untouched.
 */
export function unwrapResponse(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload && 'message' in payload) {
    return payload.data;
  }
  return payload;
}

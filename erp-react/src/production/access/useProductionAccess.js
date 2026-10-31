/**
 * useProductionAccess
 * ------------------------------------------------------------------
 * Reads the signed-in user's effective Production permissions from the backend and
 * exposes `can(area, action)` for the UI.
 *
 * Security: this hook is a usability gate only. The backend re-checks every
 * Production API call (see ProductionAccessInterceptor) and is the only enforcement point.
 * The permissions are kept in memory for the tab's lifetime — never in
 * localStorage/sessionStorage — and are re-fetched on every app load, so a
 * refreshed page or a revoked permission is always re-evaluated.
 *
 * Fail closed: while loading, and on any load failure, `can()` answers false.
 * A route guard shows the loader while loading and an explicit error with a
 * retry when the permissions could not be read — it never falls back to "allow".
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';
import productionAccessService from '../../services/productionAccessService';
import { allows, canViewProduction, emptyPermissions } from './catalog';

const INITIAL = {
  status: 'idle', // idle | loading | ready | error
  permissions: emptyPermissions(),
  meta: null,
  error: null
};

let state = INITIAL;
let inflight = null;
const listeners = new Set();

function publish(next) {
  state = next;
  listeners.forEach((listener) => listener(state));
}

function load({ force = false } = {}) {
  if (!force && state.status === 'ready') return Promise.resolve(state);
  if (inflight) return inflight;
  // A forced refresh (after a save or reset) keeps the last good snapshot in
  // place: the route guard unmounts the page while the status is "loading",
  // which would drop the administrator's role/user selection mid-edit. The
  // first load, and a retry after a failure, still show the loader.
  if (state.status !== 'ready') publish({ ...state, status: 'loading', error: null });
  inflight = productionAccessService
    .getMyPermissions()
    .then((payload) => {
      // A missing payload is treated as "nothing granted", never as "allow".
      const permissions = payload?.permissions || emptyPermissions();
      publish({ status: 'ready', permissions, meta: payload, error: null });
      return state;
    })
    .catch((error) => {
      publish({ ...INITIAL, status: 'error', error });
      return state;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Re-read the current user's permissions (after a save, reset or sign-in). */
export function reloadProductionAccess() {
  return load({ force: true });
}

/** Drop the in-memory copy — call on sign-out so the next user starts clean. */
export function clearProductionAccess() {
  inflight = null;
  publish({ ...INITIAL, permissions: emptyPermissions() });
}

export function getProductionAccessState() {
  return state;
}

export function useProductionAccess() {
  const [snapshot, setSnapshot] = useState(state);

  useEffect(() => {
    const listener = (next) => setSnapshot(next);
    listeners.add(listener);
    // The first render already used the module state; only a fetch is needed.
    if (state.status === 'idle' || state.status === 'error') load();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const can = useCallback(
    (area, action = 'view') => allows(snapshot.permissions, area, action),
    [snapshot.permissions]
  );

  return {
    loading: snapshot.status === 'loading' || snapshot.status === 'idle',
    ready: snapshot.status === 'ready',
    failed: snapshot.status === 'error',
    error: snapshot.error,
    permissions: snapshot.permissions,
    meta: snapshot.meta,
    can,
    canViewProduction: canViewProduction(snapshot.permissions),
    reload: () => load({ force: true })
  };
}

export default useProductionAccess;

import { useCallback, useEffect, useRef, useState } from 'react';
import locationService from '../services/locationService';

/**
 * useLocationMaster — DB-backed cascading address options.
 *
 * The ERP stores country / state / city as NAMES on Leads, Clients, Customers
 * and sales documents, while the Location Master is keyed by id. These hooks
 * resolve a name to its master id through small shared caches and then load the
 * children from the API, so a City/Town list is always the complete master for
 * the selected state.
 *
 *   useGeoCountries()            -> { options, loading, error }
 *   useGeoStates(country)        -> { options, loading, error }
 *   useGeoCities(country, state) -> { options, loading, error, search }
 *
 * `options` are [{ value: name, id, enabled }] and `search(q)` performs a
 * server-side city search inside the resolved state (for large masters).
 */

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

// Shared lookups: country/state names → master ids, and per-state city lists.
let countriesCache = null;
const statesCache = new Map();
const citiesCache = new Map();

// Every mounted dropdown subscribes here, so a Location Master edit (made from
// the management modal) refreshes the open forms instead of waiting for a reload.
const changeListeners = new Set();

/** Drop cached lookups and tell every mounted dropdown to reload its options. */
export function clearLocationCaches() {
  countriesCache = null;
  statesCache.clear();
  citiesCache.clear();
  changeListeners.forEach((cb) => cb());
}

/** Subscribe to Location Master changes. Returns the unsubscribe function. */
export function subscribeLocationChanges(cb) {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

/** Re-render + re-read the master whenever it changes. */
function useLocationVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeLocationChanges(() => setVersion((v) => v + 1)), []);
  return version;
}

async function loadCountries() {
  if (!countriesCache) countriesCache = await locationService.getCountries();
  return countriesCache;
}

async function loadStates(countryId) {
  if (!statesCache.has(countryId)) statesCache.set(countryId, await locationService.getStates(countryId));
  return statesCache.get(countryId);
}

const IDLE = { options: [], loading: false, error: '' };

export function useGeoCountries() {
  const [state, setState] = useState({ options: [], loading: true, error: '' });
  const version = useLocationVersion();

  useEffect(() => {
    let cancelled = false;
    // Options stay on screen while a refresh (e.g. after a master edit) runs.
    loadCountries()
      .then((list) => { if (!cancelled) setState({ options: list, loading: false, error: '' }); })
      .catch((err) => {
        if (!cancelled) setState({ options: [], loading: false, error: err?.message || 'Unable to load countries' });
      });
    return () => { cancelled = true; };
  }, [version]);

  return state;
}

export function useGeoStates(country) {
  const [state, setState] = useState(IDLE);
  const version = useLocationVersion();

  useEffect(() => {
    const name = String(country || '').trim();
    if (!name) { setState(IDLE); return undefined; }
    let cancelled = false;
    setState({ options: [], loading: true, error: '' });

    (async () => {
      try {
        const countries = await loadCountries();
        const match = countries.find((c) => norm(c.value) === norm(name));
        if (!match) { if (!cancelled) setState(IDLE); return; }
        const list = await loadStates(match.id);
        if (!cancelled) setState({ options: list, loading: false, error: '' });
      } catch (err) {
        if (!cancelled) setState({ options: [], loading: false, error: err?.message || 'Unable to load states' });
      }
    })();

    return () => { cancelled = true; };
  }, [country, version]);

  return state;
}

export function useGeoCities(country, stateName) {
  const [state, setState] = useState(IDLE);
  const stateIdRef = useRef(null);
  const version = useLocationVersion();

  useEffect(() => {
    const c = String(country || '').trim();
    const s = String(stateName || '').trim();
    stateIdRef.current = null;
    if (!c || !s) { setState(IDLE); return undefined; }
    let cancelled = false;
    setState({ options: [], loading: true, error: '' });

    (async () => {
      try {
        const countries = await loadCountries();
        const co = countries.find((x) => norm(x.value) === norm(c));
        if (!co) { if (!cancelled) setState(IDLE); return; }
        const states = await loadStates(co.id);
        const se = states.find((x) => norm(x.value) === norm(s));
        if (!se) { if (!cancelled) setState(IDLE); return; }
        stateIdRef.current = se.id;

        if (!citiesCache.has(se.id)) citiesCache.set(se.id, await locationService.getCitiesByState(se.id));
        const cities = citiesCache.get(se.id);
        if (!cancelled) setState({ options: cities, loading: false, error: '' });
      } catch (err) {
        if (!cancelled) setState({ options: [], loading: false, error: err?.message || 'Unable to load cities' });
      }
    })();

    return () => { cancelled = true; };
  }, [country, stateName, version]);

  /** Server-side search inside the resolved state. Returns [{ value, id, enabled }]. */
  const search = useCallback(async (query) => {
    const id = stateIdRef.current;
    if (!id) return [];
    try {
      return await locationService.searchCitiesByState(id, query, 50);
    } catch {
      return [];
    }
  }, []);

  return { ...state, search };
}

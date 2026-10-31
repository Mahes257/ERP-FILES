import api from '../api/axiosInstance';

/**
 * locationService — the ONE frontend client for the centralized Location Master
 * (MySQL is the single source of truth; no location list is kept in the browser).
 *
 * Every address / location dropdown in the ERP must read from these calls, so a
 * state's City/Town list is always the COMPLETE master stored in the database
 * rather than a hand-maintained array.
 */

/** ApiResponse<T> unwrapping: tolerate both the envelope and a raw payload. */
function unwrap(res) {
  const body = res?.data;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    return body.data;
  }
  return body;
}

/** Map LocationOption rows to dropdown options: { value: name, id, enabled }. */
function toOptions(list) {
  return (Array.isArray(list) ? list : [])
    .filter((row) => row && row.name)
    .map((row) => ({
      value: row.name,
      id: row.id,
      status: row.status,
      enabled: !row.status || String(row.status).trim().toLowerCase() === 'active'
    }));
}

const MUTATION = { suppressGlobalError: true };

/** REST path segment per management level (used by the status toggle). */
const LEVEL_PATHS = { country: 'countries', state: 'states', district: 'districts', city: 'cities' };

/** Human-readable message for a failed Location Master request. */
export function locationApiError(err) {
  const status = err?.response?.status;
  if (status === 403) return 'Only an ADMIN can modify the Location Master';
  return err?.response?.data?.message || err?.message || 'The Location Master request failed';
}

const locationService = {
  async getCountries() {
    return toOptions(unwrap(await api.get('/locations/countries')));
  },

  async getStates(countryId) {
    if (!countryId) return [];
    return toOptions(unwrap(await api.get(`/locations/countries/${countryId}/states`)));
  },

  async getDistricts(stateId) {
    if (!stateId) return [];
    return toOptions(unwrap(await api.get(`/locations/states/${stateId}/districts`)));
  },

  async getCitiesByDistrict(districtId) {
    if (!districtId) return [];
    return toOptions(unwrap(await api.get(`/locations/districts/${districtId}/cities`)));
  },

  /** COMPLETE city/town master of one state (all districts merged, deduped). */
  async getCitiesByState(stateId) {
    if (!stateId) return [];
    return toOptions(unwrap(await api.get(`/locations/states/${stateId}/cities`)));
  },

  /** Server-side city search inside one state (large masters / type-ahead). */
  async searchCitiesByState(stateId, query, limit = 50) {
    if (!stateId) return [];
    return toOptions(unwrap(await api.get(`/locations/states/${stateId}/cities/search`, {
      params: { q: query || '', limit }
    })));
  },

  /** Backend validation of a full Country → State → District → City chain. */
  async validate({ countryId, stateId, districtId, cityId } = {}) {
    const res = await api.get('/locations/validate', {
      params: { countryId, stateId, districtId, cityId }
    });
    return unwrap(res);
  },

  // ===================== Admin reads (full rows, any level) ==================
  // Same records the dropdowns read, with ids/codes/status so the management
  // modal can edit them. Reads are authenticated like every other master read.

  async adminCountries() {
    return unwrap(await api.get('/locations/admin/countries'));
  },

  async adminStates(countryId) {
    if (!countryId) return [];
    return unwrap(await api.get(`/locations/admin/countries/${countryId}/states`));
  },

  async adminDistricts(stateId) {
    if (!stateId) return [];
    return unwrap(await api.get(`/locations/admin/states/${stateId}/districts`));
  },

  async adminCities(districtId) {
    if (!districtId) return [];
    return unwrap(await api.get(`/locations/admin/districts/${districtId}/cities`));
  },

  // ===================== Mutations (ADMIN only, server-enforced) ==============
  // Every mutation opts out of the global error page: a rejected save (403 for
  // a non-admin, 409 for a duplicate name) belongs in the modal next to the
  // field, not as a full-page error.

  async createCountry(payload) {
    return unwrap(await api.post('/locations/countries', payload, MUTATION));
  },

  async updateCountry(id, payload) {
    return unwrap(await api.put(`/locations/countries/${id}`, payload, MUTATION));
  },

  async createState(countryId, payload) {
    return unwrap(await api.post(`/locations/countries/${countryId}/states`, payload, MUTATION));
  },

  async updateState(id, payload) {
    return unwrap(await api.put(`/locations/states/${id}`, payload, MUTATION));
  },

  async createDistrict(stateId, payload) {
    return unwrap(await api.post(`/locations/states/${stateId}/districts`, payload, MUTATION));
  },

  async updateDistrict(id, payload) {
    return unwrap(await api.put(`/locations/districts/${id}`, payload, MUTATION));
  },

  async createCity(districtId, payload) {
    return unwrap(await api.post(`/locations/districts/${districtId}/cities`, payload, MUTATION));
  },

  async updateCity(id, payload) {
    return unwrap(await api.put(`/locations/cities/${id}`, payload, MUTATION));
  },

  /** Activate / deactivate one row at any level (soft — no record is removed). */
  async setStatus(level, id, status) {
    const path = LEVEL_PATHS[level];
    if (!path) throw new Error(`Unknown location level: ${level}`);
    return unwrap(await api.put(`/locations/${path}/${id}/status`, { status }, MUTATION));
  }
};

export default locationService;

import { geocodeBaseUrl, geocodeKey } from '../config/mapConfig';

// GeocodingService — turns an address/place name into { lat, lng }.
//
// Rules applied by consumers:
//   - If the ERP already stores coordinates, USE THEM (no geocoding).
//   - Results are cached in-memory so the same location is never geocoded
//     twice in a session.
//   - The provider is configurable via VITE_GEOCODE_BASE_URL / VITE_GEOCODE_KEY.
//   - A failed lookup returns null — callers must keep working without it.

const cache = new Map();

function cacheKey(address) {
  return String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function geocode(address) {
  if (!address || !String(address).trim()) return null;
  const key = cacheKey(address);
  if (cache.has(key)) return cache.get(key);

  const promise = (async () => {
    try {
      const params = new URLSearchParams({ format: 'json', limit: '1', q: String(address).trim() });
      if (geocodeKey()) params.set('key', geocodeKey());
      const res = await fetch(`${geocodeBaseUrl()}?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data[0] && data[0].lat && data[0].lon) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          label: data[0].display_name || address
        };
      }
      return null;
    } catch {
      return null;
    }
  })();

  cache.set(key, promise);
  return promise;
}

export function clearGeocodeCache() {
  cache.clear();
}
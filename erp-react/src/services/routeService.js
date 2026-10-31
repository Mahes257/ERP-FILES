import { routeBaseUrl } from '../config/mapConfig';

// RouteService — computes the ordered driving route between journey points.
//
// Provider is configurable via VITE_ROUTE_BASE_URL (OSRM-compatible API).
// Returns { geometry, distanceKm, durationMin } or null on any failure.
// Results are cached per point-sequence so the map never requests the same
// route twice in a session.

const cache = new Map();

function key(points) {
  return points
    .map(p => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`)
    .join('|');
}

export async function getRoute(points) {
  if (!points || points.length < 2) return null;
  const cacheKey = key(points);
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const coords = points.map(p => `${Number(p.lng)},${Number(p.lat)}`).join(';');
  const url = `${routeBaseUrl()}/${coords}?overview=full&geometries=geojson&steps=false`;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0];
        return {
          // GeoJSON LineString coordinates = [lng, lat] pairs
          coordinates: (route.geometry?.coordinates || []).filter(c => Array.isArray(c) && c.length >= 2),
          distanceKm: Math.round(((route.distance || 0) / 1000) * 100) / 100,
          durationMin: Math.round((route.duration || 0) / 60)
        };
      }
      return null;
    } catch {
      return null;
    }
  })();

  cache.set(cacheKey, promise);
  return promise;
}

export function clearRouteCache() {
  cache.clear();
}
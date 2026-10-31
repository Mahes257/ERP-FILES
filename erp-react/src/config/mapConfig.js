// Central map configuration — the Marketing Map reads these so the tile /
// routing / geocoding providers can be swapped via environment variables
// without touching the map component. Follows the project's VITE_* convention.
//
// MAP TILE PROVIDER (Leaflet / OpenStreetMap):
//   VITE_MAP_TILE_URL
//   Default: OpenStreetMap standard tiles.
//   Alternative: Stamen, CartoDB, MapTiler, self-hosted OSM tiles.
//
// ROUTING PROVIDER (OSM-compatible):
//   VITE_ROUTE_BASE_URL
//   Default: OSRM public demo server (development use only).
//   Production: self-hosted OSRM / Valhalla / GraphHopper backend URL.
//
// GEOCODING PROVIDER (optional API key supported):
//   VITE_GEOCODE_BASE_URL   Default: Nominatim (public, dev use only)
//   VITE_GEOCODE_KEY        Optional key for providers that require one.

const env = import.meta.env || {};

export function mapTileUrl() {
  return env.VITE_MAP_TILE_URL ||
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
}

export function mapTileAttribution() {
  return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
}

export function mapDefaultCenter() {
  // Centered on Tamil Nadu, India
  const lat = parseFloat(env.VITE_MAP_CENTER_LAT || '11.1271');
  const lng = parseFloat(env.VITE_MAP_CENTER_LNG || '78.0644');
  return [lat, lng];
}

export function mapDefaultZoom() {
  return parseInt(env.VITE_MAP_ZOOM || '7', 10);
}

export function geocodeBaseUrl() {
  return env.VITE_GEOCODE_BASE_URL || 'https://nominatim.openstreetmap.org/search';
}

export function geocodeKey() {
  return env.VITE_GEOCODE_KEY || '';
}

export function routeBaseUrl() {
  return env.VITE_ROUTE_BASE_URL || 'https://router.project-osrm.org/route/v1/driving';
}

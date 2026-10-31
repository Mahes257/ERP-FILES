import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mapTileUrl, mapTileAttribution, mapDefaultCenter, mapDefaultZoom } from '../config/mapConfig';

// Fix Leaflet default marker icon paths (webpack/vite bundling issue)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Thin Leaflet wrapper. The Marketing Map uses ONLY these helpers, so the
// rendering stack behind MapService can be replaced later without touching it.

export function hasLeaflet() {
  return true;
}

// Keep backward compatibility
export const hasMapLibre = hasLeaflet;

/**
 * Create a Leaflet map instance.
 * @param {HTMLElement} container
 * @param {Object} options - center [lat,lng], zoom
 * @returns {L.Map}
 */
export function createMap(container, { center, zoom } = {}) {
  const defaultCenter = center
    ? [center[1] || center[0], center[0]] // Handle [lng,lat] or [lat,lng]
    : mapDefaultCenter();
  const defaultZoom = zoom || mapDefaultZoom();

  const map = L.map(container, {
    center: defaultCenter,
    zoom: defaultZoom,
    zoomControl: false,
    attributionControl: true
  });

  // Add tile layer
  L.tileLayer(mapTileUrl(), {
    attribution: mapTileAttribution(),
    maxZoom: 19
  }).addTo(map);

  // Add zoom control to top-right
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Add scale control
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

  return map;
}

export function addControls(map) {
  // Controls are already added in createMap
}

/**
 * Add a custom marker with an SVG icon.
 * @param {L.Map} map
 * @param {Object} options - lng, lat, color, letter, size, zIndex, title
 * @returns {L.Marker}
 */
export function addMarker(map, { lng, lat, color = '#0B4A3D', letter = '', size = 34, zIndex = 10, title = '' }) {
  const icon = createCustomIcon(color, letter, size);
  const marker = L.marker([lat, lng], { icon, zIndexOffset: zIndex * 100 })
    .bindPopup('', { maxWidth: 340, className: 'erp-map-popup' });

  if (title) {
    marker.options.title = title;
  }

  marker.addTo(map);
  return marker;
}

/**
 * Create a custom Leaflet icon from an SVG circle with a letter.
 */
function createCustomIcon(color, letter = '', size = 34) {
  const circleR = size / 2 - 2;
  const fontSize = Math.round(size / 2.2);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${circleR}" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      ${letter ? `<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold" fill="#ffffff">${letter}</text>` : ''}
    </svg>
  `;
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return L.icon({
    iconUrl: dataUrl,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: 'erp-custom-marker'
  });
}

/**
 * Show a popup with HTML content on a marker.
 */
export function addPopup(map, { lng, lat, content, closeOnClick = true }) {
  const popup = L.popup({
    maxWidth: 340,
    closeOnClick,
    className: 'erp-map-popup'
  })
    .setLatLng([lat, lng])
    .setContent(content)
    .openOn(map);
  return popup;
}

/**
 * Draw a polyline (route) on the map.
 * @returns {string} Layer ID for later removal
 */
let layerSeq = 0;
export function drawPolyline(map, { coordinates, color = '#0B4A3D', width = 5, opacity = 0.85, dash = false }) {
  if (!coordinates || coordinates.length < 2) return null;
  layerSeq++;
  const id = `mm-line-${layerSeq}`;

  // coordinates are [lng, lat] pairs from GeoJSON
  const latLngs = coordinates
    .filter(c => Array.isArray(c) && c.length >= 2)
    .map(c => [c[1], c[0]]);

  if (latLngs.length < 2) return null;

  const polyline = L.polyline(latLngs, {
    color,
    weight: width,
    opacity,
    dashArray: dash ? [8, 4] : null,
    className: id
  }).addTo(map);

  // Store reference for cleanup
  polyline._mmId = id;
  return id;
}

/**
 * Remove previously drawn layers.
 */
const drawnLayers = new Map();
export function clearLayers(map, ids) {
  if (!ids) return;
  ids.forEach(id => {
    map.eachLayer(layer => {
      if (layer._mmId === id) {
        map.removeLayer(layer);
      }
    });
  });
  ids.length = 0;
}

// Override drawPolyline to track layers
const originalDrawPolyline = drawPolyline;
export function drawPolylineTracked(map, opts) {
  const id = originalDrawPolyline(map, opts);
  if (id) {
    map.eachLayer(layer => {
      if (layer._mmId === id) {
        drawnLayers.set(id, layer);
      }
    });
  }
  return id;
}

/**
 * Fit the map to contain all given points with padding.
 * @param {L.Map} map
 * @param {Array} points - [[lng, lat], ...]
 * @param {number} padding - pixels
 */
export function fitToPoints(map, points, padding = 60) {
  if (!points || points.length === 0) return;
  const validPoints = points.filter(p => p && p[0] != null && p[1] != null);
  if (validPoints.length === 0) return;

  // Leaflet expects [lat, lng]
  const latLngs = validPoints.map(p => [p[1], p[0]]);
  const bounds = L.latLngBounds(latLngs);
  map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 14 });
}

/**
 * Animate the map to a specific location.
 */
export function flyTo(map, lngLat, zoom = 12) {
  // lngLat is [lng, lat]
  map.flyTo([lngLat[1], lngLat[0]], zoom, { duration: 1.5 });
}

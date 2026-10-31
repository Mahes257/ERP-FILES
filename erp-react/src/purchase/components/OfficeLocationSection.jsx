/**
 * purchase/components/OfficeLocationSection.jsx
 * ------------------------------------------------------------------
 * Fully interactive enterprise office-location picker for the Vendor
 * Registration form (Leaflet + OpenStreetMap, frontend-only / mock-
 * friendly).
 *
 *   · Search Address      Nominatim place search (debounced) by
 *                         address, city, state, country, PIN, landmark
 *   · Editable map        click anywhere to place the marker; marker is
 *                         draggable; drag → coordinates + reverse
 *                         geocoded address update together
 *   · Current Location    browser geolocation → centres map, drops pin,
 *                         auto-fills coordinates and address
 *   · Locate Registered   geocodes the Registered Address card fields
 *   · Map controls        zoom, scroll-wheel zoom, double-click zoom,
 *                         drag, scale, fullscreen and a locate-me tool
 *   · Green ERP marker    branded divIcon pin, animated drop, popup
 *                         showing Vendor Office + lat/lng + address
 *   · Google Maps         open the pinned location / copy coordinates /
 *                         reset the marker
 *   · Coordinates         editable — typing new coordinates moves the
 *                         marker and re-syncs the address
 *   · Default view        India (20.5937, 78.9629) at zoom 5
 *
 * The section is fully controlled: the parent form (react-hook-form)
 * owns all fields and receives updates through `onLocationChange`, so
 * nothing here persists data — the form's submit writes them into the
 * vendor service (mock today, backend-ready field names `latitude` /
 * `longitude` / `formattedAddress` / `googleMapsUrl`).
 *
 * Optional `onZoomChange` observer: reports the live zoom (initial +
 * every zoomend). Additive only — the Vendor Location modal uses it to
 * render a "Current zoom level" readout; the edit form never passes it.
 *
 * Leaflet is loaded from the bundled `leaflet` npm package. Tiles and
 * geocoding come from the OpenStreetMap servers, so an internet
 * connection is required for map imagery / reverse geocoding; a
 * graceful banner is shown if tiles fail and coordinates still commit
 * when offline. Map geometry is kept in sync with layout changes via a
 * ResizeObserver (invalidateSize).
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertCircle, Copy, Crosshair, ExternalLink, Loader2, LocateFixed, MapPin, MapPinned, Maximize2, RotateCcw, Search, X
} from 'lucide-react';
import useDebounce from '../hooks/useDebounce';
import { Button, FormField, useToast } from './ui';
import { countries } from '../../data/countries';
import '../styles/office-location.css';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

/** Default map centre — India (per spec). */
const DEFAULT_CENTER = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;
/** Zoom applied when a pin is dropped from a zoomed-out view. */
const PLACE_ZOOM = 13;
/** Zoom when a location is resolved (current location / search). */
const RESOLVE_ZOOM = 15;

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/** Round to 6 decimal places (~11 cm precision) — standard for coords. */
function round6(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatCoord(value) {
  const num = toFinite(value);
  return num === null ? '' : num.toFixed(6);
}

/** Escapes a string for safe interpolation into Leaflet popup HTML. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function buildMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Matches a reverse-geocoded country against the shared country master. */
function matchCountry(raw, master) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const exact = master.find((name) => name.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  const fuzzy = master.find((name) => {
    const candidate = name.toLowerCase();
    return candidate.includes(lower) || lower.includes(candidate);
  });
  return fuzzy || trimmed;
}

/** Brand-green ERP map pin (Leaflet divIcon — no external image assets). */
function createPinIcon() {
  return L.divIcon({
    className: 'ol-pin-container',
    html:
      '<svg class="ol-pin" width="32" height="40" viewBox="0 0 32 40" aria-hidden="true">' +
      '  <defs><linearGradient id="olPinGrad" x1="0" y1="0" x2="0" y2="1">' +
      '    <stop offset="0%" stop-color="#0E6B58"/><stop offset="100%" stop-color="#0A4F44"/>' +
      '  </linearGradient></defs>' +
      '  <path d="M16 0C7.164 0 0 7.164 0 16c0 11.2 14.4 22.9 14.94 23.44.53.54 1.59.54 2.12 0C17.6 38.9 32 27.2 32 16 32 7.164 24.836 0 16 0z" fill="url(#olPinGrad)" stroke="#FFFFFF" stroke-width="2"/>' +
      '  <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>' +
      '  <circle cx="16" cy="16" r="3.4" fill="#0E6B58"/>' +
      '</svg>',
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -34]
  });
}

/** Popup content — Vendor Office title + coordinates + formatted address. */
function popupHtml(lat, lng, address) {
  return (
    '<div class="ol-popup">' +
    '  <div class="ol-popup-title">Vendor Office</div>' +
    '  <div class="ol-popup-row"><span>Latitude</span><b>' + formatCoord(lat) + '</b></div>' +
    '  <div class="ol-popup-row"><span>Longitude</span><b>' + formatCoord(lng) + '</b></div>' +
    '  <div class="ol-popup-addr' + (address ? '' : ' ol-popup-addr-muted') + '">' +
    (address ? escapeHtml(address) : 'Reverse geocoding address…') +
    '</div>' +
    '</div>'
  );
}

export default function OfficeLocationSection({
  latitude = null,
  longitude = null,
  formattedAddress = '',
  registeredAddress = {},
  error = '',
  onLocationChange = () => {},
  /* Optional live zoom observer — used by the read-only Vendor
     Location modal to render a "Current zoom level" readout. The
     edit form never passes it, so this stays additive. */
  onZoomChange
}) {
  const toast = useToast();

  const mapElRef = useRef(null);
  const mapWrapRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const locationChangeRef = useRef(onLocationChange);
  const zoomChangeRef = useRef(onZoomChange);
  const pendingPopupRef = useRef(null);
  const reverseTimerRef = useRef(null);
  const reverseAbortRef = useRef(null);

  /* Keep the latest write-back handler reachable from Leaflet callbacks
     (refs never go stale; assigned in an effect, not during render). */
  useEffect(() => {
    locationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    zoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [latDraft, setLatDraft] = useState(() => formatCoord(latitude));
  const [lngDraft, setLngDraft] = useState(() => formatCoord(longitude));
  const debouncedQuery = useDebounce(searchInput, 450);

  /* Editable coordinate drafts stay in sync with the controlled props. */
  useEffect(() => {
    queueMicrotask(() => setLatDraft(formatCoord(latitude)));
  }, [latitude]);

  useEffect(() => {
    queueMicrotask(() => setLngDraft(formatCoord(longitude)));
  }, [longitude]);

  /* ---- Reverse geocoding (throttled, abortable) ---- */
  const runReverseGeocode = useCallback(async (lat, lng) => {
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    try {
      const response = await fetch(
        `${NOMINATIM_REVERSE}?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { signal: controller.signal }
      );
      const data = await response.json();
      const addr = data?.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state_district || '';
      const state = addr.state || addr.state_district || '';
      const postalCode = addr.postcode || '';
      const country = matchCountry(addr.country || '', countries);
      const streetAddress = [addr.house_number, addr.road, addr.suburb, addr.neighbourhood]
        .filter(Boolean)
        .join(', ');
      const addressLine = data?.display_name || '';
      locationChangeRef.current({
        address: streetAddress,
        city,
        state,
        postalCode,
        country,
        formattedAddress: addressLine,
        googleMapsUrl: buildMapsUrl(lat, lng)
      });
      if (markerRef.current) {
        markerRef.current.setPopupContent(popupHtml(lat, lng, addressLine));
      }
    } catch (err) {
      /* Aborted → a newer request superseded this one; offline → the
         coordinates are already committed, address fields stay as-is. */
      if (err?.name !== 'AbortError' && markerRef.current) {
        markerRef.current.setPopupContent(popupHtml(lat, lng, 'Address unavailable offline'));
      }
    }
  }, []);

  const scheduleReverseGeocode = useCallback((lat, lng) => {
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    reverseTimerRef.current = setTimeout(() => {
      runReverseGeocode(lat, lng);
    }, 350);
  }, [runReverseGeocode]);

  /**
   * Central pin flow: commit coordinates (+ Google Maps URL) to the
   * form, queue a reverse geocode to fill the address fields, and flag
   * the popup to open once the controlled marker re-renders.
   */
  const handlePinDropped = useCallback((lat, lng, { address = null, reverse = true } = {}) => {
    pendingPopupRef.current = { address };
    locationChangeRef.current({
      latitude: lat,
      longitude: lng,
      googleMapsUrl: buildMapsUrl(lat, lng)
    });
    if (reverse) scheduleReverseGeocode(lat, lng);
  }, [scheduleReverseGeocode]);

  /* ---- Place search (debounced Nominatim lookup) ---- */
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 3) {
      queueMicrotask(() => {
        setResults([]);
        setSearching(false);
      });
      return undefined;
    }
    let cancelled = false;
    queueMicrotask(() => setSearching(true));
    fetch(`${NOMINATIM}?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  /* ---- Map lifecycle (once) ---- */
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return undefined;

    const initialLat = toFinite(latitude);
    const initialLng = toFinite(longitude);
    const hasPin = initialLat !== null && initialLng !== null;

    const map = L.map(mapElRef.current, {
      center: hasPin ? [initialLat, initialLng] : DEFAULT_CENTER,
      zoom: hasPin ? 14 : DEFAULT_ZOOM,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      zoomControl: true
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

    /* Click anywhere places the marker (no mode toggle needed). Clicking
       the existing pin re-opens its popup instead of re-pinning. */
    map.on('click', (event) => {
      const lat = round6(event.latlng.lat);
      const lng = round6(event.latlng.lng);
      const existing = markerRef.current;
      if (existing) {
        const current = existing.getLatLng();
        if (round6(current.lat) === lat && round6(current.lng) === lng) {
          existing.openPopup();
          return;
        }
      }
      handlePinDropped(lat, lng);
    });
    map.on('tileerror', () => setTilesFailed(true));

    /* Live zoom reporting (optional) — fires once with the initial
       zoom and again on every zoomend so the parent can render a
       "Current zoom level" readout. Handlers are torn down with
       map.off() below. */
    const reportZoom = () => zoomChangeRef.current?.(map.getZoom());
    reportZoom();
    map.on('zoomend', reportZoom);

    mapRef.current = map;

    /* Keep Leaflet in sync with layout changes and window resizes. */
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapElRef.current);
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      reverseAbortRef.current?.abort();
      pendingPopupRef.current = null;
      map.off();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Keep the marker in sync with the controlled coordinates ---- */
  useEffect(() => {
    const map = mapRef.current;
    const lat = toFinite(latitude);
    const lng = toFinite(longitude);
    if (!map) return;

    /* Coordinates cleared (e.g. Reset Marker / form Reset) → remove pin. */
    if (lat === null || lng === null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const position = [lat, lng];
    const pending = pendingPopupRef.current;

    if (!markerRef.current) {
      const marker = L.marker(position, {
        icon: createPinIcon(),
        draggable: true,
        title: 'Drag to reposition',
        riseOnHover: true
      }).addTo(map);
      marker.bindPopup(popupHtml(lat, lng, null), {
        className: 'ol-popup-wrap',
        closeButton: false,
        autoPan: true,
        autoPanPadding: [10, 10]
      });
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        handlePinDropped(round6(ll.lat), round6(ll.lng));
      });
      markerRef.current = marker;
    } else {
      const current = markerRef.current.getLatLng();
      if (round6(current.lat) !== lat || round6(current.lng) !== lng) {
        markerRef.current.setLatLng(position);
        markerRef.current.setIcon(createPinIcon()); /* replay drop animation */
      }
    }

    /* Open / refresh the popup when a pin was just placed by the user. */
    if (pending) {
      markerRef.current.setPopupContent(popupHtml(lat, lng, pending.address));
      markerRef.current.openPopup();
      pendingPopupRef.current = null;
    }

    /* Follow the pin; zoom in only when the user was at the country
       overview, otherwise preserve their current zoom level. */
    const zoom = map.getZoom() || DEFAULT_ZOOM;
    map.setView(position, zoom < 8 ? PLACE_ZOOM : zoom);
  }, [latitude, longitude, handlePinDropped]);

  /* ---- Actions ---- */
  const handleSelectResult = (item) => {
    const lat = round6(parseFloat(item.lat));
    const lng = round6(parseFloat(item.lon));
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const state = addr.state || addr.state_district || '';
    const postalCode = addr.postcode || '';
    const country = matchCountry(addr.country || '', countries);
    const streetAddress = [addr.house_number, addr.road, addr.suburb, addr.neighbourhood]
      .filter(Boolean)
      .join(', ');
    pendingPopupRef.current = { address: item.display_name || '' };
    locationChangeRef.current({
      latitude: lat,
      longitude: lng,
      address: streetAddress,
      city,
      state,
      postalCode,
      country,
      formattedAddress: item.display_name || '',
      googleMapsUrl: buildMapsUrl(lat, lng)
    });
    setSearchInput(item.display_name || '');
    setResults([]);
  };

  /** Browser geolocation — centres map, drops pin, fills address. */
  const locateCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation is not supported by this browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = round6(position.coords.latitude);
        const lng = round6(position.coords.longitude);
        handlePinDropped(lat, lng);
        mapRef.current?.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), RESOLVE_ZOOM), { duration: 0.9 });
        toast.success('Current location pinned on the map');
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error(err && err.code === 1
          ? 'Location permission denied — enable location access and try again'
          : 'Could not fetch your current location');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  /** Geocodes the Registered Address card fields and drops the pin. */
  const locateRegisteredAddress = async () => {
    const query = [registeredAddress.address, registeredAddress.city, registeredAddress.state]
      .filter((part) => String(part || '').trim())
      .join(', ')
      .trim();
    if (!query) {
      toast.error('Enter the registered address first');
      return;
    }
    setLocatingAddress(true);
    try {
      const response = await fetch(`${NOMINATIM}?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`);
      const data = await response.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (hit) {
        handlePinDropped(round6(parseFloat(hit.lat)), round6(parseFloat(hit.lon)));
        toast.success('Office location pinned from registered address');
      } else {
        toast.error('Could not locate the registered address');
      }
    } catch {
      toast.error('Address lookup failed — check your connection');
    } finally {
      setLocatingAddress(false);
    }
  };

  const openGoogleMaps = () => {
    const lat = toFinite(latitude);
    const lng = toFinite(longitude);
    if (lat === null || lng === null) {
      toast.error('Drop a pin first to open it in Google Maps');
      return;
    }
    window.open(buildMapsUrl(lat, lng), '_blank', 'noopener,noreferrer');
  };

  const copyCoordinates = async () => {
    const lat = toFinite(latitude);
    const lng = toFinite(longitude);
    if (lat === null || lng === null) {
      toast.error('Drop a pin first to copy coordinates');
      return;
    }
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Coordinates copied to clipboard');
    } catch {
      /* Clipboard API unavailable (non-secure context) — fallback. */
      try {
        const input = document.createElement('textarea');
        input.value = text;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        toast.success('Coordinates copied to clipboard');
      } catch {
        toast.error('Could not copy coordinates');
      }
    }
  };

  const resetMarker = () => {
    locationChangeRef.current({
      latitude: null,
      longitude: null,
      formattedAddress: '',
      googleMapsUrl: ''
    });
    setSearchInput('');
    setResults([]);
    toast.info('Marker cleared — click the map to place a new pin');
  };

  const toggleFullscreen = () => {
    const el = mapWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  };

  /** Commits manually edited coordinates → moves the marker + re-syncs. */
  const commitCoords = () => {
    const lat = parseFloat(latDraft);
    const lng = parseFloat(lngDraft);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLatDraft(formatCoord(latitude));
      setLngDraft(formatCoord(longitude));
      toast.error('Enter valid latitude and longitude');
      return;
    }
    if (lat < -90 || lat > 90) {
      toast.error('Latitude must be between -90 and 90');
      return;
    }
    if (lng < -180 || lng > 180) {
      toast.error('Longitude must be between -180 and 180');
      return;
    }
    handlePinDropped(round6(lat), round6(lng));
  };

  const clearSearch = () => {
    setSearchInput('');
    setResults([]);
  };

  const hasPin = toFinite(latitude) !== null && toFinite(longitude) !== null;

  return (
    <div className="ol-section space-y-4">
      {/* ---- Search Address ---- */}
      <div>
        <FormField label="Search Address" hint="Search by address, city, state, country, PIN code or landmark">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              className="purchase-form-input ol-search-input"
              placeholder="Search a city, street, landmark or PIN code"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setResults([]);
              }}
              aria-label="Search address"
              aria-expanded={results.length > 0}
              autoComplete="off"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Clear address search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {results.length > 0 && (
              <ul className="ol-search-results" role="listbox" aria-label="Address search results">
                {results.map((item, index) => (
                  <li key={`${item.place_id || index}-${index}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => handleSelectResult(item)}
                      className="ol-search-result"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#0A4F44] shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold text-slate-700 leading-snug">{item.display_name}</span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          {formatCoord(parseFloat(item.lat))}, {formatCoord(parseFloat(item.lon))}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FormField>
        {searching && (
          <div className="ol-search-loading">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Searching…
          </div>
        )}
      </div>

      {/* ---- Interactive map ---- */}
      <div ref={mapWrapRef} className="ol-map-wrap">
        <div
          ref={mapElRef}
          className="ol-map"
          role="region"
          aria-label="Interactive office location map. Click to place the marker, drag it to reposition, use the search or Locate Me tools."
        />
        {hasPin && (
          <span className="ol-coords-chip">
            {formatCoord(latitude)}, {formatCoord(longitude)}
          </span>
        )}
        {!hasPin && (
          <span className="ol-pin-hint">
            <Crosshair className="w-3.5 h-3.5" aria-hidden="true" /> Click the map to place the marker
          </span>
        )}
        {tilesFailed && (
          <span className="ol-map-banner">
            Map tiles unavailable — search and pin still work.
          </span>
        )}
        <div className="ol-map-tools">
          <button
            type="button"
            onClick={locateCurrentLocation}
            disabled={locating}
            className="ol-map-tool"
            title="Locate me"
            aria-label="Locate me"
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="ol-map-tool"
            title="Toggle fullscreen map"
            aria-label="Toggle fullscreen map"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ---- Validation message ---- */}
      {error && (
        <div className="ol-validation" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={locateCurrentLocation}
          loading={locating}
          icon={LocateFixed}
        >
          Use Current Location
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={locateRegisteredAddress}
          loading={locatingAddress}
          icon={MapPin}
        >
          Locate Registered Address
        </Button>
        <Button variant="ghost" size="sm" onClick={openGoogleMaps} icon={ExternalLink}>
          Open Google Maps
        </Button>
        <Button variant="ghost" size="sm" onClick={copyCoordinates} icon={Copy}>
          Copy Coordinates
        </Button>
        {hasPin && (
          <Button variant="ghost" size="sm" onClick={resetMarker} icon={RotateCcw}>
            Reset Marker
          </Button>
        )}
      </div>

      {/* ---- Synchronization readout ---- */}
      {hasPin && (
        <div className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-400">
          <MapPinned className="w-3.5 h-3.5 text-[#0A4F44]" aria-hidden="true" />
          Pin placed — drag it, edit the coordinates, or search to fine-tune
        </div>
      )}

      {/* ---- Coordinates (editable — keep in sync with the marker) ---- */}
      <div className={GRID}>
        <FormField label="Latitude" hint="Editable — the marker follows">
          <input
            type="text"
            inputMode="decimal"
            value={latDraft}
            onChange={(event) => setLatDraft(event.target.value)}
            onBlur={commitCoords}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitCoords();
            }}
            placeholder="e.g. 18.520400"
            className="purchase-form-input ol-coord-input"
            aria-label="Latitude"
          />
        </FormField>
        <FormField label="Longitude" hint="Editable — the marker follows">
          <input
            type="text"
            inputMode="decimal"
            value={lngDraft}
            onChange={(event) => setLngDraft(event.target.value)}
            onBlur={commitCoords}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitCoords();
            }}
            placeholder="e.g. 73.856700"
            className="purchase-form-input ol-coord-input"
            aria-label="Longitude"
          />
        </FormField>
        <FormField label="Formatted Address" hint="Reverse-geocoded from the marker — stored with the vendor" className="sm:col-span-2">
          <input
            type="text"
            readOnly
            value={formattedAddress}
            placeholder="Address will appear here once a pin is placed"
            className="purchase-form-input"
            aria-label="Formatted address"
          />
        </FormField>
      </div>
    </div>
  );
}

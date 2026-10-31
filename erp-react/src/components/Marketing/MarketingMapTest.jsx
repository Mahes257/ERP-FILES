import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, Trash2, Route, Navigation } from 'lucide-react';
import { useToast } from '../Common';
import { getRoute } from '../../services/routeService';
import { geocode } from '../../services/geocodingService';
import { mapTileUrl, mapTileAttribution } from '../../config/mapConfig';

// Fix Leaflet default marker icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

// ============================== Constants ==============================

const SAMPLE_LOCATIONS = [
  { name: 'Chennai', lat: 13.0827, lng: 80.2707, address: 'Chennai, Tamil Nadu, India' },
  { name: 'Ariyalur', lat: 11.1085, lng: 79.3182, address: 'Ariyalur, Tamil Nadu, India' },
  { name: 'Trichy', lat: 10.7905, lng: 78.7047, address: 'Tiruchirappalli, Tamil Nadu, India' },
  { name: 'Salem', lat: 11.6643, lng: 78.1460, address: 'Salem, Tamil Nadu, India' }
];

const STOP_COLORS = ['#136754', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function createColoredIcon(color, letter, size = 30) {
  const r = size / 2 - 2;
  const fs = Math.round(size / 2.2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${color}" stroke="#fff" stroke-width="2"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-family="Arial,sans-serif" font-weight="bold" fill="#fff">${letter}</text>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

// Map controller component to handle fitBounds
function MapController({ routeStops, routePolyline }) {
  const map = useMap();

  useEffect(() => {
    if (routeStops.length >= 2) {
      const bounds = L.latLngBounds(routeStops.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [routeStops, map]);

  return null;
}

// ============================== Main Component ==============================

export default function MarketingMapTest() {
  const toast = useToast();
  const mapRef = useRef(null);

  const [searchValue, setSearchValue] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [routeStops, setRouteStops] = useState([
    SAMPLE_LOCATIONS[0],
    SAMPLE_LOCATIONS[1],
    SAMPLE_LOCATIONS[2],
    SAMPLE_LOCATIONS[3]
  ]);
  const [routeResult, setRouteResult] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [calculating, setCalculating] = useState(false);

  // Calculate route
  const calculateRoute = useCallback(async () => {
    if (routeStops.length < 2) {
      toast.error('Need at least 2 stops to calculate a route');
      return;
    }
    setCalculating(true);
    try {
      const points = routeStops.map(s => ({ lat: s.lat, lng: s.lng }));
      const result = await getRoute(points);
      if (result) {
        setRouteCoords(result.coordinates || []);
        setRouteResult({
          distanceKm: result.distanceKm,
          durationMinutes: result.durationMin,
          durationText: `${Math.floor(result.durationMin / 60)}h ${result.durationMin % 60}m`
        });
      } else {
        toast.error('Unable to calculate route');
      }
    } catch (err) {
      toast.error('Route calculation failed: ' + (err.message || ''));
    } finally {
      setCalculating(false);
    }
  }, [routeStops, toast]);

  // Recalculate on stops change
  useEffect(() => {
    if (routeStops.length >= 2) {
      calculateRoute();
    }
  }, [routeStops, calculateRoute]);

  // Search location
  const handleSearch = useCallback(async () => {
    if (!searchValue.trim()) return;
    try {
      const result = await geocode(searchValue);
      if (result) {
        setSelectedPlace({
          name: result.label || searchValue,
          lat: result.lat,
          lng: result.lng,
          address: result.label || searchValue
        });
        toast.success(`Found: ${result.label || searchValue}`);
      } else {
        toast.error('Location not found');
      }
    } catch {
      toast.error('Search failed');
    }
  }, [searchValue, toast]);

  // Remove a stop
  const removeStop = (index) => {
    setRouteStops(prev => prev.filter((_, i) => i !== index));
  };

  // Add sample location as stop
  const addSampleStop = (sample) => {
    setRouteStops(prev => [...prev, { ...sample }]);
  };

  // Convert GeoJSON coordinates to Leaflet [lat, lng]
  const polylinePositions = routeCoords
    .filter(c => Array.isArray(c) && c.length >= 2)
    .map(c => [c[1], c[0]]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapPin size={20} className="text-blue-600" />
        <h2 className="text-base font-bold text-slate-800">Marketing Map Test</h2>
      </div>

      {/* Location Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Location Search</h3>
        <div className="flex gap-2">
          <input type="text" value={searchValue} onChange={e => setSearchValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search a location / plant..."
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" />
          <button onClick={handleSearch}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
            <Search size={12} /> Search
          </button>
        </div>
      </div>

      {/* Embedded Leaflet Map */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden" style={{ height: '500px' }}>
        <MapContainer
          center={[11.5, 79.5]}
          zoom={7}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          attributionControl={true}
        >
          <TileLayer url={mapTileUrl()} attribution={mapTileAttribution()} />
          <MapController routeStops={routeStops} />

          {/* Route polyline */}
          {polylinePositions.length >= 2 && (
            <Polyline positions={polylinePositions} color="#0B4A3D" weight={5} opacity={0.85} />
          )}

          {/* Stop markers */}
          {routeStops.map((stop, i) => (
            <Marker
              key={`stop-${i}-${stop.name}`}
              position={[stop.lat, stop.lng]}
              icon={createColoredIcon(STOP_COLORS[i % STOP_COLORS.length], String(i + 1))}
            >
              <Popup>
                <b>Stop {i + 1}: {stop.name}</b><br />
                {stop.address}
              </Popup>
            </Marker>
          ))}

          {/* Selected place marker */}
          {selectedPlace && (
            <Marker
              position={[selectedPlace.lat, selectedPlace.lng]}
              icon={createColoredIcon('#22c55e', '📍', 34)}
            >
              <Popup><b>{selectedPlace.name}</b><br />{selectedPlace.address}</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Selected Location */}
      {selectedPlace && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Selected Location</h3>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div><span className="text-slate-400">Place:</span> <span className="font-bold">{selectedPlace.name}</span></div>
            <div><span className="text-slate-400">Address:</span> <span className="font-bold">{selectedPlace.address}</span></div>
            <div><span className="text-slate-400">Latitude:</span> <span className="font-mono">{selectedPlace.lat.toFixed(6)}</span></div>
            <div><span className="text-slate-400">Longitude:</span> <span className="font-mono">{selectedPlace.lng.toFixed(6)}</span></div>
          </div>
        </div>
      )}

      {/* Route Test */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Route Test</h3>

        {/* Route stops */}
        <div className="space-y-1.5 mb-3">
          {routeStops.map((stop, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
              <span className="font-bold flex-1">{stop.name}</span>
              <span className="text-slate-400">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</span>
              <button onClick={() => removeStop(i)} className="p-1 rounded hover:bg-slate-100 text-rose-500 cursor-pointer">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Add sample stops */}
        <div className="flex gap-1 flex-wrap mb-3">
          {SAMPLE_LOCATIONS.filter(s => !routeStops.find(r => r.name === s.name)).map(s => (
            <button key={s.name} onClick={() => addSampleStop(s)}
              className="px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">
              + {s.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-3">
          <button onClick={calculateRoute} disabled={calculating}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50">
            <Route size={12} /> {calculating ? 'Calculating...' : 'Calculate Route'}
          </button>
        </div>

        {routeResult && (
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-lg font-bold text-slate-800">{routeResult.distanceKm} km</div>
              <div className="text-[10px] text-slate-400">Total Distance</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-lg font-bold text-slate-800">{routeResult.durationText}</div>
              <div className="text-[10px] text-slate-400">Estimated Travel Time</div>
            </div>
          </div>
        )}

        {/* Visual route */}
        <div className="mt-3 flex items-center gap-1 flex-wrap text-[11px]">
          {routeStops.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-300">→’</span>}
              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-bold">{s.name}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin, Route, Navigation, AlertTriangle, RefreshCw,
  Filter, Loader2, Search, ChevronDown, ChevronUp,
  Eye, Phone, Mail, Building2, Map, Clock, X, Users,
  Plus, Trash2, Save, Crosshair
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../Common';
import marketingService from '../../services/marketingService';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import { geocode } from '../../services/geocodingService';
import { getRoute, clearRouteCache } from '../../services/routeService';
import { mapTileUrl, mapTileAttribution, mapDefaultCenter, mapDefaultZoom } from '../../config/mapConfig';


// ============================== Leaflet Icon Fix ==============================

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

// ============================== Constants ==============================

const ENTITY_TYPES = [
  { key: '', label: 'All' },
  { key: 'customer', label: 'Customers' },
  { key: 'qform', label: 'Q Forms' },
  { key: 'travel_stop', label: 'Travel Registries' },
  { key: 'marketer', label: 'Marketers' },
  { key: 'marketing_location', label: 'Marketing Locations' }
];

const TYPE_COLORS = {
  customer: '#0B4A3D',
  qform: '#7c3aed',
  travel_stop: '#059669',
  marketer: '#0ea5e9',
  travel_planner: '#059669',
  marketing_location: '#f59e0b'
};

const TYPE_ICONS = {
  customer: 'C',
  qform: 'Q',
  travel_stop: 'T',
  travel_planner: 'T',
  marketer: 'M',
  marketing_location: 'L'
};

const STATUS_COLORS = {
  Active: '#d97706',
  Completed: '#059669',
  Planned: '#9CA3AF',
  Reached: '#0B4A3D',
  Cancelled: '#dc2626',
  Skipped: '#6B7280',
  Rescheduled: '#7c3aed',
  Online: '#059669',
  Recent: '#d97706',
  Offline: '#9CA3AF'
};

const LOCATION_TYPES = [
  { value: 'customer', label: 'Customer' },
  { value: 'lead', label: 'Lead' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'visit', label: 'Marketing Visit' },
  { value: 'other', label: 'Other' }
];

// ============================== Custom Icons ==============================

function createCustomIcon(color, letter, size = 34) {
  const circleR = size / 2 - 2;
  const fontSize = Math.round(size / 2.2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${circleR}" fill="${color}" stroke="#fff" stroke-width="2"/>
    ${letter ? `<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-family="Arial,sans-serif" font-weight="bold" fill="#fff">${letter}</text>` : ''}
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: 'erp-map-marker'
  });
}

const ICON_CACHE = {};
function getIcon(color, letter) {
  const key = `${color}-${letter}`;
  if (!ICON_CACHE[key]) ICON_CACHE[key] = createCustomIcon(color, letter);
  return ICON_CACHE[key];
}

const userLocationIcon = L.icon({
  iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38"><circle cx="19" cy="19" r="16" fill="#0ea5e9" stroke="#fff" stroke-width="3"/><circle cx="19" cy="19" r="6" fill="#fff"/></svg>`)}`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -19],
  className: 'erp-map-user-marker'
});

// ============================== Helpers ==============================

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}



// ============================== Map Event Hooks ==============================

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng); } });
  return null;
}

function MapRefForwarder({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map]);
  return null;
}

// ============================== Sub-components ==============================

function SummaryChip({ label, value, color }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[11px] font-bold text-slate-800">{value}</span>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-[11px]">
      {Icon && <Icon size={12} className="text-slate-400 mt-0.5 shrink-0" />}
      <span className="text-slate-400 shrink-0">{label}:</span>
      <span className="font-bold text-slate-700 break-words">{value}</span>
    </div>
  );
}

// ============================== Add Location Modal =========================

function AddLocationModal({ isOpen, onClose, onSave, mapRef, toast }) {
  const [form, setForm] = useState({
    locationName: '', address: '', city: '', state: '', pin: '',
    contactPerson: '', phone: '', marketingVisitReference: '', remarks: '',
    locationType: 'other', latitude: null, longitude: null
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const debounceRef = useRef(null);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setForm({
        locationName: '', address: '', city: '', state: '', pin: '',
        contactPerson: '', phone: '', marketingVisitReference: '', remarks: '',
        locationType: 'other', latitude: null, longitude: null
      });
      setSearchQuery('');
      setSearchResults([]);
      setPickMode(false);
    }
  }, [isOpen]);

  const handleSearch = useCallback((q) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 3) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ format: 'json', limit: '5', q: q.trim() });
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: { Accept: 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.map(r => ({
            label: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon)
          })));
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 500);
  }, []);

  const selectSearchResult = useCallback((r) => {
    setForm(prev => ({ ...prev, latitude: r.lat, longitude: r.lng, address: r.label }));
    setSearchResults([]);
    setSearchQuery('');
    if (mapRef.current) {
      mapRef.current.setView([r.lat, r.lng], 14);
    }
  }, [mapRef]);

  const handleMapClick = useCallback((latlng) => {
    if (pickMode) {
      setForm(prev => ({ ...prev, latitude: latlng.lat, longitude: latlng.lng }));
      setPickMode(false);
      toast.success(`Location picked: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
    }
  }, [pickMode, toast]);

  const handleSave = async () => {
    if (!form.locationName.trim()) { toast.error('Location name is required'); return; }
    if (!form.address.trim()) { toast.error('Address is required'); return; }
    if (form.latitude == null || form.longitude == null) {
      toast.error('Please pick a location on the map or search for an address');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
      toast.success('Marketing location saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save location');
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Plus size={16} className="text-[#0B4A3D]" /> Add Marketing Location
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 cursor-pointer"><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Location Type */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Location Type *</label>
            <select value={form.locationType} onChange={e => setForm(f => ({ ...f, locationType: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30">
              {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Location Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Location Name *</label>
            <input value={form.locationName} onChange={e => setForm(f => ({ ...f, locationName: e.target.value }))}
              placeholder="e.g. ABC Industries"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
          </div>

          {/* Address Search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Address * (Search or type)</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchQuery || form.address} onChange={e => { handleSearch(e.target.value); setForm(f => ({ ...f, address: e.target.value })); }}
                placeholder="Search address, city, place..."
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
              {searching && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-md max-h-40 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => selectSearchResult(r)}
                    className="w-full text-left px-3 py-2 text-[11px] text-slate-600 hover:bg-slate-50 border-b border-slate-100 last:border-0 cursor-pointer">
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* City / State / PIN */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">State</label>
              <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">PIN</label>
              <input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
          </div>

          {/* Contact Person / Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Contact Person</label>
              <input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
          </div>

          {/* Marketing Visit Reference / Remarks */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Marketing Visit Reference</label>
            <input value={form.marketingVisitReference} onChange={e => setForm(f => ({ ...f, marketingVisitReference: e.target.value }))}
              placeholder="e.g. MV-2026-001"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Remarks</label>
            <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30 resize-none" />
          </div>

          {/* Pick on Map */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500">
                Map Position {form.latitude != null && form.longitude != null
                  ? <span className="text-emerald-600">✔ {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</span>
                  : <span className="text-rose-500">— Not set</span>}
              </span>
              <button type="button" onClick={() => setPickMode(v => !v)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors
                  ${pickMode ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                <Crosshair size={12} /> {pickMode ? 'Click map to pick...' : 'Pick on Map'}
              </button>
            </div>
            {form.latitude != null && form.longitude != null && (
              <div className="h-48 rounded-lg overflow-hidden border border-slate-200">
                <MapContainer center={[form.latitude, form.longitude]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
                  <TileLayer url={mapTileUrl()} attribution={mapTileAttribution()} />
                  <Marker position={[form.latitude, form.longitude]} icon={createCustomIcon('#f59e0b', 'L')} />
                </MapContainer>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B4A3D] text-white hover:bg-[#0a3d32] cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Location
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================== Trip Form Modal ==============================

function TripFormModal({ isOpen, onClose, onSave, trip, onDelete, getTripColor }) {
  const [form, setForm] = useState({
    startingLocation: '', startLatitude: '', startLongitude: '',
    endingLocation: '', endLatitude: '', endLongitude: '',
    startDate: new Date().toISOString().slice(0, 10),
    startTime: '09:00', endDate: '', endTime: '',
    purpose: 'Marketing Visit', status: 'Draft', remarks: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (trip) {
      setForm({
        startingLocation: trip.startingLocation || '',
        startLatitude: trip.startLatitude != null ? String(trip.startLatitude) : '',
        startLongitude: trip.startLongitude != null ? String(trip.startLongitude) : '',
        endingLocation: trip.endingLocation || '',
        endLatitude: trip.endLatitude != null ? String(trip.endLatitude) : '',
        endLongitude: trip.endLongitude != null ? String(trip.endLongitude) : '',
        startDate: trip.startDate || new Date().toISOString().slice(0, 10),
        startTime: trip.startTime || '09:00',
        endDate: trip.endDate || '', endTime: trip.endTime || '',
        purpose: trip.purpose || 'Marketing Visit',
        status: trip.status || 'Draft',
        remarks: trip.remarks || ''
      });
    }
  }, [trip]);

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.startingLocation.trim()) { return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        startLatitude: form.startLatitude ? Number(form.startLatitude) : null,
        startLongitude: form.startLongitude ? Number(form.startLongitude) : null,
        endLatitude: form.endLatitude ? Number(form.endLatitude) : null,
        endLongitude: form.endLongitude ? Number(form.endLongitude) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  const isEdit = !!trip;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Route size={16} className="text-[#0B4A3D]" />
            {isEdit ? `Edit Registry ${trip.planNo || '#' + trip.id}` : 'New Registry'}
            {isEdit && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: getTripColor(trip) + '20', color: getTripColor(trip) }}>Route Color</span>}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 cursor-pointer"><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Start Location */}
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-bold text-emerald-600 mb-2">● START LOCATION</div>
            <div className="space-y-2">
              <input value={form.startingLocation} onChange={set('startingLocation')} placeholder="Start location name"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.startLatitude} onChange={set('startLatitude')} placeholder="Latitude" type="number" step="any"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
                <input value={form.startLongitude} onChange={set('startLongitude')} placeholder="Longitude" type="number" step="any"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
              </div>
            </div>
          </div>
          {/* Stop Location */}
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-bold text-rose-600 mb-2">● STOP LOCATION</div>
            <div className="space-y-2">
              <input value={form.endingLocation} onChange={set('endingLocation')} placeholder="Stop location name"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.endLatitude} onChange={set('endLatitude')} placeholder="Latitude" type="number" step="any"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
                <input value={form.endLongitude} onChange={set('endLongitude')} placeholder="Longitude" type="number" step="any"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
              </div>
            </div>
          </div>
          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={set('startDate')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Start Time</label>
              <input type="time" value={form.startTime} onChange={set('startTime')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">End Date</label>
              <input type="date" value={form.endDate} onChange={set('endDate')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">End Time</label>
              <input type="time" value={form.endTime} onChange={set('endTime')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30" />
            </div>
          </div>
          {/* Purpose + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Purpose</label>
              <select value={form.purpose} onChange={set('purpose')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30">
                {['Marketing Visit', 'Customer Visit', 'Plant Survey', 'Follow-up', 'Technical Discussion', 'Other'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Status</label>
              <select value={form.status} onChange={set('status')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30">
                {['Draft', 'Submitted', 'Approved', 'Active', 'Completed', 'Cancelled'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Remarks */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">Remarks</label>
            <textarea value={form.remarks} onChange={set('remarks')} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30 resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200">
          <div>
            {onDelete && (
              <button onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer">
                <Trash2 size={13} /> Delete Registry
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B4A3D] text-white hover:bg-[#0a3d32] cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {isEdit ? 'Update Registry' : 'Create Registry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================== Main Component ==============================

export default function MarketingMapPage() {
  // Map action permissions (UI gate; the backend enforces each request).
  const { can } = useMarketingAccess();
  const canAddLocation = can('map', 'create');
  const canAddTrip = can('travelRegistry', 'create');
  const canDeleteTrip = can('travelRegistry', 'delete');
  const toast = useToast();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const tripRouteLayersRef = useRef([]);
  const tripMarkersRef = useRef([]);

  const [locations, setLocations] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [tripFilter, setTripFilter] = useState('all');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [showTripForm, setShowTripForm] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [tripRoutes, setTripRoutes] = useState({}); // { tripId: { coordinates, distanceKm, durationMin } }

  // Deterministic color per trip ID — fallback if backend doesn't provide routeColor
  const TRIP_COLORS = ['#0B4A3D', '#dc2626', '#059669', '#7c3aed', '#d97706', '#0891b2', '#e11d48', '#4f46e5'];
  const getTripColor = (trip) => trip.routeColor || TRIP_COLORS[(trip.id || 0) % TRIP_COLORS.length];

  // Fetch locations from backend
  const fetchLocations = useCallback(async (type, search) => {
    setLoading(true);
    setLoadError('');
    try {
      const params = {};
      if (type) params.type = type;
      if (search) params.search = search;
      const res = await marketingService.getMapLocations(params);
      const list = res?.data || (Array.isArray(res) ? res : []);
      setLocations(list);
    } catch (err) {
      const msg = err?.message || 'Unable to load map locations.';
      setLoadError(msg);
      setLocations([]);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch travel plan journeys for map route visualization
  const fetchTrips = useCallback(async () => {
    try {
      const res = await marketingService.getMapJourneys();
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setTrips(list);
    } catch {
      setTrips([]);
    }
  }, []);

  // Register global trip click handler for Leaflet popup "View Details" buttons
  useEffect(() => {
    window.__tripClick = (tripId) => {
      const trip = (trips || []).find(t => t.id === tripId);
      if (trip) {
        setSelectedTrip(trip);
        if (mapRef.current && trip.startLatitude && trip.startLongitude) {
          mapRef.current.setView([Number(trip.startLatitude), Number(trip.startLongitude)], 12);
        }
      }
    };
    return () => { delete window.__tripClick; };
  }, [trips]);

  // Build ordered waypoints from a trip for OSRM routing
  const buildTripWaypoints = useCallback((trip) => {
    const points = [];
    if (trip.startLatitude && trip.startLongitude) {
      points.push({ lat: Number(trip.startLatitude), lng: Number(trip.startLongitude) });
    }
    const stops = [...(trip.stops || [])]
      .filter(s => s.latitude != null && s.longitude != null)
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    for (const s of stops) {
      points.push({ lat: Number(s.latitude), lng: Number(s.longitude) });
    }
    if (trip.endLatitude && trip.endLongitude) {
      const lastStop = stops[stops.length - 1];
      if (!lastStop || Number(lastStop.latitude) !== Number(trip.endLatitude) || Number(lastStop.longitude) !== Number(trip.endLongitude)) {
        points.push({ lat: Number(trip.endLatitude), lng: Number(trip.endLongitude) });
      }
    }
    return points;
  }, []);

  // Fetch OSRM road routes for all trips (background, parallel)
  useEffect(() => {
    if (!trips || trips.length === 0) return;
    let cancelled = false;

    const fetchAllTripRoutes = async () => {
      const newRoutes = {};
      const fetches = trips.map(async (trip) => {
        try {
          const waypoints = buildTripWaypoints(trip);
          if (waypoints.length < 2) return;
          const route = await getRoute(waypoints);
          if (route && !cancelled && route.coordinates && route.coordinates.length > 0) {
            newRoutes[trip.id] = route;
          }
        } catch { /* fall back to straight lines */ }
      });
      await Promise.allSettled(fetches);
      if (!cancelled && Object.keys(newRoutes).length > 0) {
        setTripRoutes(prev => ({ ...prev, ...newRoutes }));
      }
    };

    fetchAllTripRoutes();
    return () => { cancelled = true; };
  }, [trips, buildTripWaypoints]);

  // Initial load
  useEffect(() => {
    fetchLocations(typeFilter, searchQuery);
    fetchTrips();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search with debounce
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchLocations(typeFilter, debouncedSearch);
  }, [typeFilter, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit bounds when locations change
  useEffect(() => {
    if (!mapRef.current || locations.length === 0) return;
    const validPoints = locations
      .filter(l => l.latitude != null && l.longitude != null)
      .map(l => [Number(l.latitude), Number(l.longitude)]);
    if (validPoints.length === 0) return;
    if (myLocation) validPoints.push([myLocation.lat, myLocation.lng]);
    try {
      const bounds = L.latLngBounds(validPoints);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } catch { /* ignore */ }
  }, [locations]); // eslint-disable-line react-hooks/exhaustive-deps

  // My location
  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(loc);
        setLocating(false);
        if (mapRef.current) {
          mapRef.current.flyTo([loc.lat, loc.lng], 12, { duration: 1.5 });
          // Add user location marker
          if (userMarkerRef.current) {
            mapRef.current.removeLayer(userMarkerRef.current);
          }
          userMarkerRef.current = L.marker([loc.lat, loc.lng], { icon: userLocationIcon, zIndexOffset: 10000 })
            .bindPopup('<b>Your Location</b>')
            .addTo(mapRef.current);
        }
      },
      () => {
        setLocating(false);
        toast.error('Location permission was denied.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [toast]);

  // Filter trips — MUST be declared before fitAll which references it
  const filteredTrips = useMemo(() => {
    if (tripFilter === 'all') return trips;
    return trips.filter(t => t.status === tripFilter);
  }, [trips, tripFilter]);

  const fitAll = useCallback(() => {
    if (!mapRef.current) return;
    const points = [];
    // Include location markers
    locations
      .filter(l => l.latitude != null && l.longitude != null)
      .forEach(l => points.push([Number(l.latitude), Number(l.longitude)]));
    // Include trip start/end coordinates from ALL trips (not just filtered, for complete view)
    const allTrips = Array.isArray(trips) ? trips : [];
    allTrips.forEach(trip => {
      if (trip.startLatitude && trip.startLongitude) points.push([Number(trip.startLatitude), Number(trip.startLongitude)]);
      if (trip.endLatitude && trip.endLongitude) points.push([Number(trip.endLatitude), Number(trip.endLongitude)]);
      if (Array.isArray(trip.stops)) {
        trip.stops.forEach(s => {
          if (s.latitude && s.longitude) points.push([Number(s.latitude), Number(s.longitude)]);
        });
      }
    });
    if (myLocation) points.push([myLocation.lat, myLocation.lng]);
    if (points.length === 0) return;
    try {
      const bounds = L.latLngBounds(points);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } catch { /* ignore */ }
  }, [locations, myLocation, trips]);

  // Show route
  const showRoute = useCallback(async (loc) => {
    if (!myLocation) {
      toast.error('Set your current location first to see routes');
      return;
    }
    if (!loc.latitude || !loc.longitude) {
      toast.error('Location coordinates not available');
      return;
    }
    try {
      const route = await getRoute([
        { lat: myLocation.lat, lng: myLocation.lng },
        { lat: Number(loc.latitude), lng: Number(loc.longitude) }
      ]);
      if (route && mapRef.current) {
        // Clear existing route
        if (routeLayerRef.current) {
          mapRef.current.removeLayer(routeLayerRef.current);
        }
        const latLngs = route.coordinates
          .filter(c => Array.isArray(c) && c.length >= 2)
          .map(c => [c[1], c[0]]);
        if (latLngs.length >= 2) {
          routeLayerRef.current = L.polyline(latLngs, {
            color: '#0B4A3D', weight: 5, opacity: 0.85
          }).addTo(mapRef.current);
          mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [60, 60] });
        }
        setRouteInfo({ distance: route.distanceKm, duration: route.durationMin });
      } else {
        toast.error('Unable to calculate route');
      }
    } catch {
      toast.error('Route calculation failed');
    }
  }, [myLocation, toast]);

  // Clear route
  const clearRoute = useCallback(() => {
    if (routeLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    setRouteInfo(null);
  }, []);

  /**
   * Marker click → the existing Marketing Location detail page.
   *
   * The route carries the entity type plus the REAL backend id (MapLocationResponse.id,
   * which is the source row's primary key for every entity type), so the detail page
   * re-fetches the record itself instead of reusing map state. Customer markers keep
   * their dedicated ERP client page, which is the existing behaviour. */
  const openLocationDetail = useCallback((loc) => {
    if (!loc?.id) return;
    if (loc.type === 'customer' && loc.referenceId) {
      navigate(`/clients/${loc.referenceId}`);
      return;
    }
    navigate(`/marketing/locations/${encodeURIComponent(loc.type || 'marketing_location')}/${loc.id}`);
  }, [navigate]);

  // Save new marketing location
  const handleSaveLocation = useCallback(async (formData) => {
    await marketingService.createMarketingLocation(formData);
    fetchLocations(typeFilter, debouncedSearch);
  }, [fetchLocations, typeFilter, debouncedSearch]);

  // Delete marketing location
  const deleteLocation = useCallback(async (loc) => {
    if (!window.confirm(`Delete "${loc.name}"?`)) return;
    try {
      await marketingService.deleteMarketingLocation(loc.id);
      toast.success('Location deleted');
      fetchLocations(typeFilter, debouncedSearch);
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
    }
  }, [toast, fetchLocations, typeFilter, debouncedSearch]);

  // ---- Trip form handlers ----
  const handleSaveTrip = useCallback(async (formData) => {
    try {
      if (editingTrip) {
        await marketingService.updateTravelPlan(editingTrip.id, formData);
        toast.success('Registry updated');
      } else {
        await marketingService.createTravelPlan(formData);
        toast.success('Registry created');
      }
      setShowTripForm(false);
      setEditingTrip(null);
      fetchTrips();
    } catch (err) {
      toast.error(err?.message || 'Failed to save registry');
    }
  }, [editingTrip, toast, fetchTrips]);

  const handleDeleteTrip = useCallback(async (tripId) => {
    if (!window.confirm('Delete this registry?')) return;
    try {
      await marketingService.deleteTravelPlan(tripId);
      toast.success('Registry deleted');
      setSelectedTrip(null);
      fetchTrips();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete registry');
    }
  }, [toast, fetchTrips]);

  const handleEditTrip = useCallback((trip) => {
    setEditingTrip(trip);
    setShowTripForm(true);
  }, []);

  // Summary stats
  const stats = useMemo(() => {
    const counts = { customer: 0, qform: 0, travel_stop: 0, marketer: 0, marketing_location: 0 };
    locations.forEach(l => {
      const key = l.type === 'travel_planner' ? 'travel_stop' : l.type;
      if (counts[key] !== undefined) counts[key]++;
    });
    return counts;
  }, [locations]);

  // Build marker data for the map
  const markerData = useMemo(() => {
    return locations
      .filter(l => l.latitude != null && l.longitude != null)
      .map(l => ({
        ...l,
        lat: Number(l.latitude),
        lng: Number(l.longitude)
      }));
  }, [locations]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Map size={22} className="text-[#0B4A3D]" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">Marketing Map</h1>
            <p className="text-[11px] text-slate-400">Customers, Q Forms, Travel Registries, Marketers & Locations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAddTrip && (
            <button onClick={() => { setEditingTrip(null); setShowTripForm(true); }}
              className="flex items-center gap-1.5 px-3 h-[36px] rounded-lg text-xs font-bold bg-[#0B4A3D] text-white hover:bg-[#0a3d32] cursor-pointer">
              <Route size={14} /> Add Trip
            </button>
          )}
          {canAddLocation && (
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 h-[36px] rounded-lg text-xs font-bold bg-slate-700 text-white hover:bg-slate-800 cursor-pointer">
              <Plus size={14} /> Add Location
            </button>
          )}
          <button onClick={useMyLocation} disabled={locating}
            className="flex items-center gap-1.5 px-3 h-[36px] rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer disabled:opacity-50">
            <Navigation size={14} /> {locating ? 'Locating…' : 'My Location'}
          </button>
          <button onClick={fitAll}
            className="flex items-center gap-1.5 px-3 h-[36px] rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">
            <MapPin size={14} /> Fit All
          </button>
          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 h-[36px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${showFilters ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <Filter size={14} /> Filters
          </button>
          <button onClick={() => fetchLocations(typeFilter, debouncedSearch)}
            className="flex items-center gap-1.5 px-3 h-[36px] rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search location, customer, plant, city..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0B4A3D]/30"
            />
          </div>
        </div>
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap gap-1.5">
              {ENTITY_TYPES.map(t => (
                <button key={t.key} onClick={() => setTypeFilter(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    typeFilter === t.key
                      ? 'bg-[#0B4A3D] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {t.label}
                  {t.key && <span className="ml-1 opacity-60">({stats[t.key === 'travel_stop' ? 'travel_stop' : t.key] || 0})</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <SummaryChip label="Total" value={locations.length} color="#334155" />
        <SummaryChip label="Customers" value={stats.customer} color={TYPE_COLORS.customer} />
        <SummaryChip label="Q Forms" value={stats.qform} color={TYPE_COLORS.qform} />
        <SummaryChip label="Travel Stops" value={stats.travel_stop} color={TYPE_COLORS.travel_stop} />
        <SummaryChip label="Marketers" value={stats.marketer} color={TYPE_COLORS.marketer} />
        <SummaryChip label="Locations" value={stats.marketing_location} color={TYPE_COLORS.marketing_location} />
        {routeInfo && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
            <Route size={12} className="text-emerald-600" />
            <span className="text-[10px] text-emerald-700 font-bold">{routeInfo.distance} km · ~{routeInfo.duration} min</span>
            <button onClick={clearRoute} className="text-emerald-500 hover:text-emerald-700 cursor-pointer"><X size={12} /></button>
          </div>
        )}
      </div>

      {/* Trip Filter + Legend */}
      {trips.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500">Trip Routes ({filteredTrips.length}/{trips.length})</span>
            <div className="flex gap-1">
              {[{ key: 'all', label: 'All' }, { key: 'Draft', label: 'Draft' }, { key: 'Active', label: 'Active' }, { key: 'Completed', label: 'Completed' }, { key: 'Cancelled', label: 'Cancelled' }].map(f => (
                <button key={f.key} onClick={() => setTripFilter(f.key)}
                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                    tripFilter === f.key ? 'bg-[#0B4A3D] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>{f.label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredTrips.map(trip => (
              <button key={trip.id} onClick={() => {
                setSelectedTrip(trip);
                if (mapRef.current && trip.startLatitude && trip.startLongitude) {
                  mapRef.current.setView([Number(trip.startLatitude), Number(trip.startLongitude)], 12);
                }
              }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-all ${
                  selectedTrip?.id === trip.id
                    ? 'border-2 shadow-sm'
                    : 'border-slate-200 hover:shadow'
                }`}
                style={{ borderColor: selectedTrip?.id === trip.id ? getTripColor(trip) : undefined }}>
                <div className="w-3 h-2 rounded-sm" style={{ background: getTripColor(trip) }} />
                <span>{trip.planNo || `Trip #${trip.id}`}</span>
                <span className="text-slate-400">{trip.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map + Detail Panel */}
      <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden" style={{ height: '640px' }}>
        {/* Leaflet Map */}
        <MapContainer
          center={mapDefaultCenter()}
          zoom={mapDefaultZoom()}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={true}
        >
          <MapRefForwarder mapRef={mapRef} />
          <MapClickHandler onMapClick={() => {}} />
          <TileLayer url={mapTileUrl()} attribution={mapTileAttribution()} />

          {/* Entity Markers */}
          {markerData.map(loc => {
            const color = TYPE_COLORS[loc.type] || '#6B7280';
            const letter = TYPE_ICONS[loc.type] || '?';
            return (
              <Marker
                key={`${loc.type}-${loc.id}`}
                position={[loc.lat, loc.lng]}
                icon={getIcon(color, letter)}
                eventHandlers={{ click: () => openLocationDetail(loc) }}
              />
            );
          })}

          {/* Trip Routes — colored polylines through all stops with markers */}
          {filteredTrips.map(trip => {
            const startLat = trip.startLatitude ? Number(trip.startLatitude) : null;
            const startLng = trip.startLongitude ? Number(trip.startLongitude) : null;
            const endLat = trip.endLatitude ? Number(trip.endLatitude) : null;
            const endLng = trip.endLongitude ? Number(trip.endLongitude) : null;
            if (startLat == null || startLng == null) return null;
            const color = getTripColor(trip);
            const isSelected = selectedTrip?.id === trip.id;
            const tripPopup = `<div style="font-family:system-ui,sans-serif;min-width:180px;padding:2px">
              <div style="font-weight:700;font-size:12px;color:${color}">${trip.planNo || 'Trip #' + trip.id}</div>
              <div style="font-size:10px;color:#6B7280;margin-top:2px">${trip.startingLocation || 'Start'} →’ ${trip.endingLocation || 'Stop'}</div>
              <div style="font-size:10px;color:#9CA3AF">${trip.marketer || ''}</div>
              <div style="font-size:10px;margin-top:2px"><b style="color:${color}">${trip.status || 'Planned'}</b></div>
              ${trip.totalDistanceKm ? `<div style="font-size:9px;color:#9CA3AF">${trip.totalDistanceKm} km</div>` : ''}
              <div style="margin-top:4px"><button onclick="window.__tripClick&&window.__tripClick(${trip.id})" style="font-size:10px;color:${color};background:none;border:none;cursor:pointer;font-weight:600">View Details →’</button></div>
            </div>`;

            // Build polyline positions — always S →’ stops →’ E
            const osrmRoute = tripRoutes[trip.id];
            // Always compute sorted stops for marker rendering
            const stops = trip.stops || [];
            const sortedStops = [...stops]
              .filter(s => s.latitude != null && s.longitude != null)
              .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

            // Build the canonical S →’ stops →’ E waypoint list
            const waypoints = [[startLat, startLng]];
            for (const s of sortedStops) {
              waypoints.push([Number(s.latitude), Number(s.longitude)]);
            }
            if (endLat != null && endLng != null) {
              const lastStop = sortedStops[sortedStops.length - 1];
              if (!lastStop || Math.abs(Number(lastStop.latitude) - endLat) > 0.0001 || Math.abs(Number(lastStop.longitude) - endLng) > 0.0001) {
                waypoints.push([endLat, endLng]);
              }
            }

            let positions;
            if (waypoints.length >= 2) {
              // Prefer OSRM road route when available — but always ensure
              // the polyline starts at S and ends at E by prepending/appending
              if (osrmRoute && osrmRoute.coordinates && osrmRoute.coordinates.length > 2) {
                const osrmCoords = osrmRoute.coordinates.map(c => [c[1], c[0]]);
                // Snap: ensure first point matches S marker position
                const firstPt = osrmCoords[0];
                const lastPt = osrmCoords[osrmCoords.length - 1];
                if (Math.abs(firstPt[0] - startLat) > 0.001 || Math.abs(firstPt[1] - startLng) > 0.001) {
                  osrmCoords.unshift([startLat, startLng]);
                }
                if (endLat != null && endLng != null && (Math.abs(lastPt[0] - endLat) > 0.001 || Math.abs(lastPt[1] - endLng) > 0.001)) {
                  osrmCoords.push([endLat, endLng]);
                }
                positions = osrmCoords;
              } else {
                // Fallback: straight lines through waypoints
                positions = waypoints;
              }
            }
            if (!positions || positions.length < 2) return null;

            const startIcon = L.icon({
              iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="${color}" stroke="#fff" stroke-width="2"/><text x="14" y="18" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">S</text></svg>`)}`,
              iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
            });
            const endIcon = L.icon({
              iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="${color}" stroke="#fff" stroke-width="2"/><text x="14" y="18" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">E</text></svg>`)}`,
              iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
            });
            const stopIcon = (seq) => L.icon({
              iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="#fff" stroke="${color}" stroke-width="2"/><text x="11" y="15" text-anchor="middle" font-size="9" font-weight="bold" fill="${color}">${seq}</text></svg>`)}`,
              iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11]
            });

            return (
              <React.Fragment key={`trip-${trip.id}`}>
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: color,
                    weight: isSelected ? 5 : 3,
                    opacity: isSelected ? 0.9 : 0.6,
                    dashArray: trip.status === 'Draft' ? '8 6' : undefined
                  }}
                />
                <Marker position={[startLat, startLng]} icon={startIcon}>
                  <Popup maxWidth={250}><div dangerouslySetInnerHTML={{ __html: tripPopup }} /></Popup>
                </Marker>
                {sortedStops.map((s, i) => (
                  <Marker key={`stop-${trip.id}-${s.id}`} position={[Number(s.latitude), Number(s.longitude)]} icon={stopIcon(i + 1)}>
                    <Popup maxWidth={250}><div dangerouslySetInnerHTML={{ __html: `<div style="font-family:system-ui,sans-serif;padding:2px"><div style="font-weight:700;font-size:11px;color:${color}">${s.companyName || trip.planNo || 'Stop ' + (i + 1)}</div><div style="font-size:10px;color:#6B7280;margin-top:2px">${s.address || s.city || ''}</div><div style="font-size:10px;color:#9CA3AF;margin-top:1px">${s.status || 'Planned'}</div></div>` }} /></Popup>
                  </Marker>
                ))}
                {endLat != null && endLng != null && (
                  <Marker position={[endLat, endLng]} icon={endIcon}>
                    <Popup maxWidth={250}><div dangerouslySetInnerHTML={{ __html: tripPopup }} /></Popup>
                  </Marker>
                )}
              </React.Fragment>
            );
          })}

          {/* User location marker */}
          {myLocation && (
            <Marker position={[myLocation.lat, myLocation.lng]} icon={userLocationIcon} zIndexOffset={10000}>
              <Popup><b>Your Location</b></Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-20 pointer-events-none">
            <div className="flex items-center gap-2 bg-white rounded-lg px-4 py-2.5 shadow-lg border border-slate-200">
              <Loader2 size={16} className="animate-spin text-[#0B4A3D]" />
              <span className="text-xs font-bold text-slate-600">Loading locations...</span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {loadError && !loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white rounded-lg shadow-lg border border-rose-200 px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-500" />
            <span className="text-xs font-bold text-rose-600">{loadError}</span>
            <button onClick={() => setLoadError('')} className="ml-2 text-slate-400 hover:text-slate-600 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-md border border-slate-200 p-3 z-10">
          <div className="text-[10px] font-bold text-slate-500 mb-2">Legend</div>
          <div className="space-y-1">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2 text-[10px]">
                <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="text-slate-600 capitalize">{type === 'travel_stop' ? 'Travel Stop' : type === 'marketing_location' ? 'Marketing Location' : type}</span>
              </div>
            ))}
            {filteredTrips.length > 0 && (
              <>
                <div className="border-t border-slate-200 my-1" />
                <div className="text-[9px] font-bold text-slate-400 uppercase">Registry Routes</div>
                {filteredTrips.slice(0, 6).map(trip => (
                  <div key={trip.id} className="flex items-center gap-2 text-[10px]">
                    <div className="w-3 h-2 rounded-sm" style={{ background: getTripColor(trip) }} />
                    <span className="text-slate-600 truncate" style={{ maxWidth: 100 }}>{trip.planNo || `#${trip.id}`}</span>
                  </div>
                ))}
                {filteredTrips.length > 6 && <div className="text-[9px] text-slate-400">+{filteredTrips.length - 6} more</div>}
              </>
            )}
            {myLocation && (
              <>
                <div className="border-t border-slate-200 my-1" />
                <div className="flex items-center gap-2 text-[10px]">
                  <div className="w-3 h-3 rounded-full bg-sky-500" />
                  <span className="text-slate-600">Your location</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Location details open on the dedicated /marketing/locations/:type/:id page
            (marker click → navigate), so no floating overlay is rendered here. */}
        {/* Empty state */}
        {!loading && locations.length === 0 && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center">
              <MapPin size={36} className="text-slate-300 mx-auto mb-2" />
              <div className="text-xs font-bold text-slate-500">No locations found</div>
              <div className="text-[11px] text-slate-400 mt-1">Try adjusting filters or adding location data to records</div>
            </div>
          </div>
        )}
      </div>

      {/* Add Marketing Location Modal */}
      <AddLocationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveLocation}
        mapRef={mapRef}
        toast={toast}
      />

      {/* Trip Form Modal */}
      {showTripForm && (
        <TripFormModal
          isOpen={showTripForm}
          onClose={() => { setShowTripForm(false); setEditingTrip(null); }}
          onSave={handleSaveTrip}
          trip={editingTrip}
          onDelete={editingTrip && canDeleteTrip ? () => handleDeleteTrip(editingTrip.id) : null}
          getTripColor={getTripColor}
        />
      )}
    </div>
  );
}

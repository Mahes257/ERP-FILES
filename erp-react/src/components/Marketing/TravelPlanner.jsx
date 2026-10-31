import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MapPin, Plus, Save, Send, Check, X, Clock, Trash2, ArrowRight,
  Navigation, Calendar, FileText, ChevronDown, ChevronUp, AlertTriangle,
  Play, Square, Map, Filter, BarChart3, GripVertical,
  Users, CheckCircle
, ChevronRight, ScanSearch, Eye, Paperclip } from 'lucide-react';
import { useToast, ActionMenu, RecordPreviewModal } from '../Common';
import StatusBadge from '../Common/StatusBadge';
import SalesKpiCards from '../SalesTable/SalesKpiCards';
import { useNavigate } from 'react-router-dom';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import { useFormDraft } from '../../hooks/useFormDraft';
import { loadDraft as loadDraftRaw } from '../../utils/formPersistence';
import marketingService, { travelPlanAttachments } from '../../services/marketingService';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import PendingAttachments from '../SalesForm/PendingAttachments';
import SalesAttachments from '../SalesDetail/SalesAttachments';
import '../../pages/crm/crm-erp.css';
import './marketing-form-actions.css';

// ============================== Constants ==============================

// User-visible tab labels only — the tab KEYS (and the TAB_STATUS mapping
// below) are unchanged, so filtering and the server-side status params are
// exactly as before.
const PLAN_TABS = [
  { key: 'my-plans', label: 'My Registries' },
  { key: 'create', label: 'Create Registry' },
  { key: 'pending', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved Registries' },
  { key: 'active', label: 'Active Registries' },
  { key: 'upcoming', label: 'Upcoming Registries' },
  { key: 'completed', label: 'Completed Registries' },
  { key: 'cancelled', label: 'Cancelled' }
];

// Status filter per tab (server-side `status` param on /marketing/travel-plans).
// 'my-plans' / 'create' send no status -> all plans (scoped by role).
const TAB_STATUS = {
  pending: 'Submitted',
  approved: 'Approved',
  active: 'Active',
  upcoming: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

// KPI card key <-> tab key (used by SummaryDashboard clicks).
const KPI_TO_TAB = {
  totalPlans: 'my-plans',
  pendingApproval: 'pending',
  approvedPlans: 'approved',
  activeTrips: 'active',
  upcomingTrips: 'upcoming',
  completedTrips: 'completed',
  cancelledTrips: 'cancelled'
};
const TAB_TO_KPI = Object.fromEntries(Object.entries(KPI_TO_TAB).map(([k, v]) => [v, k]));

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const PURPOSES = ['Marketing Visit', 'Customer Visit', 'Plant Survey', 'Follow-up', 'Technical Discussion', 'Other'];

const STATUS_PILL = {
  Draft: 'bg-slate-100 text-slate-500 border-slate-200',
  Submitted: 'bg-[#E8F0EE] text-[#0B4A3D] border-blue-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  'Revision Required': 'bg-amber-50 text-amber-700 border-amber-200',
  Active: 'bg-violet-50 text-violet-700 border-violet-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-100 text-slate-400 border-slate-200'
};

const STOP_PILL = {
  Planned: 'bg-slate-100 text-slate-500 border-slate-200',
  Confirmed: 'bg-[#E8F0EE] text-[#0B4A3D] border-blue-200',
  Active: 'bg-violet-50 text-violet-700 border-violet-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  Rescheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  Skipped: 'bg-slate-100 text-slate-400 border-slate-200'
};

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16).replace('T', ' ');
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
const fmtDist = (v) => v != null ? `${Number(v).toFixed(1)} km` : '—';
const fmtTime = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function Pill({ status }) {
  return <StatusBadge status={status} />;
}

function parsePageResponse(response) {
  if (Array.isArray(response)) return { list: response, total: response.length };
  if (response?.content) return { list: response.content, total: response.totalElements ?? response.content.length };
  return { list: [], total: 0 };
}

// ============================== Module-level fetchers ==============================

async function fetchTravelPlans(setters, params) {
  const { setPlans, setTotal, setLoading } = setters;
  setLoading(true);
  try {
    const res = await marketingService.listTravelPlans(params);
    const parsed = parsePageResponse(res);
    setPlans(parsed.list);
    setTotal(parsed.total);
  } catch { setPlans([]); setTotal(0); }
  finally { setLoading(false); }
}

async function fetchTravelPlanSummary(setSummary) {
  try { const res = await marketingService.getTravelPlanSummary(); setSummary(res?.data || res); } catch { /* ignore */ }
}

// Registry attachments come from the shared attachment store. Same shape as
// fetchPlanDetail: the list endpoint returns the array directly.
async function fetchPlanAttachments(setAttachments, planId) {
  if (!planId) return;
  try {
    const res = await marketingService.getTravelPlanAttachments(planId);
    setAttachments(Array.isArray(res) ? res : (res?.content || []));
  } catch { setAttachments([]); }
}

async function fetchPlanDetail(setPlan, setLoading, planId, onError) {
  if (!planId) return;
  setLoading(true);
  try {
    const res = await marketingService.getTravelPlan(planId);
    setPlan(res?.data || res);
  } catch (err) { if (onError) onError(err?.message || 'Failed to load registry'); }
  finally { setLoading(false); }
}

// ============================== Summary Dashboard ==============================

function SummaryDashboard({ summary, activeKpi, onSelect }) {
  if (!summary) return null;
  const cards = [
    { key: 'totalPlans', label: 'Total Registries', value: summary.totalPlans, color: '#334155', icon: BarChart3 },
    { key: 'pendingApproval', label: 'Pending Approval', value: summary.pendingApproval, color: '#D97706', icon: Clock },
    { key: 'approvedPlans', label: 'Approved', value: summary.approvedPlans, color: '#16A34A', icon: CheckCircle },
    { key: 'activeTrips', label: 'Active Registries', value: summary.activeTrips, color: '#7C3AED', icon: Play },
    { key: 'upcomingTrips', label: 'Upcoming', value: summary.upcomingTrips, color: '#0891B2', icon: Calendar },
    { key: 'completedTrips', label: 'Completed', value: summary.completedTrips, color: '#2563EB', icon: Check },
    { key: 'cancelledTrips', label: 'Cancelled', value: summary.cancelledTrips, color: '#DC2626', icon: X }
  ];
  return <SalesKpiCards cards={cards} activeKpi={activeKpi} onSelect={onSelect} />;
}

// ============================== MapLibre GL Map Component ==========================

function TripMap({ plan, stops }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    import('../../services/mapService').then(({ createMap, addControls }) => {
      const map = createMap(mapContainerRef.current, {
        center: [79.5, 11.5],
        zoom: 7
      });
      addControls(map);
      mapInstanceRef.current = map;
      map.on('load', () => setMapReady(true));
    });
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  // Update markers and route when stops change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear existing markers and lines
    markersRef.current.forEach(m => { try { m.remove(); } catch { /* ignore */ } });
    markersRef.current = [];
    // Clear using mapService
    import('../../services/mapService').then(({ clearLayers, addMarker, fitToPoints, drawPolyline }) => {
      clearLayers(map, polylinesRef.current);
      polylinesRef.current = [];

      const activeStops = (stops || []).filter(s => s.status !== 'Cancelled');
      const points = [];
      const colors = ['#136754', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

      // Start marker
      if (plan?.startLatitude && plan?.startLongitude) {
        const lng = Number(plan.startLongitude);
        const lat = Number(plan.startLatitude);
        points.push([lng, lat]);
        const m = addMarker(map, { lng, lat, color: '#059669', letter: 'S', size: 30, zIndex: 10 });
        markersRef.current.push(m);
      }

      // Stop markers
      activeStops.forEach((s, i) => {
        if (s.latitude && s.longitude) {
          const lng = Number(s.longitude);
          const lat = Number(s.latitude);
          points.push([lng, lat]);
          const m = addMarker(map, {
            lng, lat,
            color: colors[i % colors.length],
            letter: String(i + 1),
            size: 30, zIndex: 10
          });
          markersRef.current.push(m);
        }
      });

      // End marker
      if (plan?.endLatitude && plan?.endLongitude) {
        const lng = Number(plan.endLongitude);
        const lat = Number(plan.endLatitude);
        points.push([lng, lat]);
        const m = addMarker(map, { lng, lat, color: '#dc2626', letter: 'E', size: 30, zIndex: 10 });
        markersRef.current.push(m);
      }

      if (points.length > 0) {
        fitToPoints(map, points, 50);
      }

      // Draw straight-line route through active stops
      if (points.length > 1) {
        const journeyStatusColors = {
          Draft: '#9CA3AF', Submitted: '#7c3aed', Approved: '#0B4A3D',
          Active: '#059669', Completed: '#0f766e', Cancelled: '#dc2626'
        };
        drawPolyline(map, {
          coordinates: points,
          color: journeyStatusColors[plan?.status] || '#0B4A3D',
          width: 4, opacity: 0.7, dash: true
        });
      }
    });
  }, [plan, stops, mapReady]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: '400px', borderRadius: '12px' }} />;
}

// ============================== Schedule View ==============================

function ScheduleView({ plan, stops }) {
  const activeStops = (stops || []).filter(s => s.status !== 'Cancelled');
  const sortedStops = [...activeStops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  return (
    <div className="space-y-0">
      {/* Start */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center">
          <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow" />
          <div className="w-0.5 h-8 bg-slate-200" />
        </div>
        <div className="pb-4">
          <div className="text-[10px] font-bold text-emerald-600 uppercase">Start</div>
          <div className="text-xs font-bold text-slate-800">{plan?.startingLocation || '—'}</div>
          <div className="text-[10px] text-slate-400">{fmtDate(plan?.startDate)} {plan?.startTime || ''}</div>
        </div>
      </div>

      {/* Stops */}
      {sortedStops.map((stop, i) => (
        <div key={stop.id || i} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full border-2 border-white shadow ${
              stop.status === 'Completed' ? 'bg-emerald-500' :
              stop.status === 'Active' ? 'bg-violet-500' :
              stop.status === 'Cancelled' ? 'bg-rose-400' :
              'bg-[#0B4A3D]'
            }`} />
            <div className="w-0.5 h-8 bg-slate-200" />
          </div>
          <div className={`pb-4 flex-1 ${stop.status === 'Cancelled' ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400">STOP {stop.sequence}</span>
              <Pill status={stop.status} map={STOP_PILL} />
              {stop.status === 'Cancelled' && <span className="text-[9px] text-rose-400 line-through">{stop.companyName}</span>}
            </div>
            {stop.status !== 'Cancelled' && (
              <>
                <div className="text-xs font-bold text-slate-800">{stop.companyName || 'Unnamed Plant'}</div>
                <div className="text-[10px] text-slate-400">{stop.address || stop.city || '—'}</div>
                <div className="flex items-center gap-3 mt-1 text-[10px]">
                  {stop.plannedArrivalTime && <span className="text-[#0B4A3D] font-bold">📍 {stop.plannedArrivalTime}</span>}
                  {stop.plannedDepartureTime && <span className="text-slate-400">→’ {stop.plannedDepartureTime}</span>}
                  {stop.expectedStayDurationMinutes && <span className="text-slate-400">({fmtTime(stop.expectedStayDurationMinutes)} stay)</span>}
                </div>
                {stop.contactPerson && <div className="text-[10px] text-slate-400 mt-0.5">👤 {stop.contactPerson}{stop.contactDesignation ? ` — ${stop.contactDesignation}` : ''}</div>}
                {stop.distanceFromPreviousKm != null && <div className="text-[10px] text-slate-400 mt-0.5">🚗— {fmtDist(stop.distanceFromPreviousKm)} · {fmtTime(stop.travelTimeFromPreviousMinutes)} drive</div>}
              </>
            )}
          </div>
        </div>
      ))}

      {/* End */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center">
          <div className="w-3 h-3 rounded-full bg-rose-500 border-2 border-white shadow" />
        </div>
        <div>
          <div className="text-[10px] font-bold text-rose-600 uppercase">End</div>
          <div className="text-xs font-bold text-slate-800">{plan?.endingLocation || '—'}</div>
          <div className="text-[10px] text-slate-400">{fmtDate(plan?.endDate)} {plan?.endTime || ''}</div>
        </div>
      </div>
    </div>
  );
}

// ============================== Plant Summary ==============================

function PlantSummary({ plan, stops }) {
  const activeStops = (stops || []).filter(s => s.status !== 'Cancelled');
  const completedStops = activeStops.filter(s => s.status === 'Completed');
  const pendingStops = activeStops.filter(s => s.status !== 'Completed');
  const cancelledStops = (stops || []).filter(s => s.status === 'Cancelled');
  const rescheduledStops = (stops || []).filter(s => s.status === 'Rescheduled');

  return (
    <div className="space-y-4">
      {/* Overall summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="text-center p-2 bg-slate-50 rounded"><div className="text-sm font-bold">{activeStops.length}</div><div className="text-[10px] text-slate-400">Total Plants</div></div>
        <div className="text-center p-2 bg-emerald-50 rounded"><div className="text-sm font-bold text-emerald-700">{completedStops.length}</div><div className="text-[10px] text-slate-400">Completed</div></div>
        <div className="text-center p-2 bg-[#E8F0EE] rounded"><div className="text-sm font-bold text-[#0B4A3D]">{pendingStops.length}</div><div className="text-[10px] text-slate-400">Pending</div></div>
        <div className="text-center p-2 bg-rose-50 rounded"><div className="text-sm font-bold text-rose-700">{cancelledStops.length}</div><div className="text-[10px] text-slate-400">Cancelled</div></div>
        <div className="text-center p-2 bg-amber-50 rounded"><div className="text-sm font-bold text-amber-700">{rescheduledStops.length}</div><div className="text-[10px] text-slate-400">Rescheduled</div></div>
        <div className="text-center p-2 bg-slate-50 rounded"><div className="text-sm font-bold">{fmtDist(plan?.totalDistanceKm)}</div><div className="text-[10px] text-slate-400">Total Distance</div></div>
      </div>

      {/* Plant details table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">#</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Plant</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Customer</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Location</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Contact</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Designation</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Phone</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Date</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Arrival</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Departure</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Purpose</th>
              <th className="px-2 py-1.5 text-left font-bold text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {(stops || []).map((s, i) => (
              <tr key={s.id || i} className={`border-b border-slate-100 ${s.status === 'Cancelled' ? 'opacity-50' : ''}`}>
                <td className="px-2 py-1.5 font-bold">{s.sequence}</td>
                <td className="px-2 py-1.5 font-bold">{s.companyName || '—'}{s.status === 'Cancelled' && ' ✖'}</td>
                <td className="px-2 py-1.5">{s.customerName || '—'}</td>
                <td className="px-2 py-1.5">{s.city || s.address?.slice(0, 30) || '—'}</td>
                <td className="px-2 py-1.5">{s.contactPerson || '—'}</td>
                <td className="px-2 py-1.5">{s.contactDesignation || '—'}</td>
                <td className="px-2 py-1.5">{s.contactPhone || '—'}</td>
                <td className="px-2 py-1.5">{fmtDate(s.plannedDate)}</td>
                <td className="px-2 py-1.5">{s.plannedArrivalTime || '—'}</td>
                <td className="px-2 py-1.5">{s.plannedDepartureTime || '—'}</td>
                <td className="px-2 py-1.5">{s.purposeOfVisit || '—'}</td>
                <td className="px-2 py-1.5"><Pill status={s.status} map={STOP_PILL} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================== Create/Edit Plan Form ==============================

function PlanForm({ plan, onSave, onSubmit, onCancel }) {
  // Attachment upload is its own permission (travelRegistry → Upload).
  const { can } = useMarketingAccess();
  const canUpload = can('travelRegistry', 'upload');
  const isEdit = Boolean(plan?.id);
  // ---- localStorage draft persistence ----
  const draftRestoredRef = useRef(false);
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    'marketing-travel', plan?.id || null,
    { isEdit, enabled: true, debounceMs: 500 }
  );
  const [form, setForm] = useState(() => {
    // Try to restore draft first
    const draft = !isEdit ? loadDraftRaw('marketing-travel', null) : null;
    const base = draft?.form || {};
    return {
      startDate: base.startDate || plan?.startDate || new Date().toISOString().slice(0, 10),
      startTime: base.startTime || plan?.startTime || '08:00',
      endDate: base.endDate || plan?.endDate || '',
      endTime: base.endTime || plan?.endTime || '',
      startingLocation: base.startingLocation || plan?.startingLocation || '',
      startLatitude: base.startLatitude || plan?.startLatitude || '',
      startLongitude: base.startLongitude || plan?.startLongitude || '',
      endingLocation: base.endingLocation || plan?.endingLocation || '',
      endLatitude: base.endLatitude || plan?.endLatitude || '',
      endLongitude: base.endLongitude || plan?.endLongitude || '',
      purpose: base.purpose || plan?.purpose || '',
      remarks: base.remarks || plan?.remarks || ''
    };
  });
  const [stops, setStops] = useState(() => {
    const draft = !isEdit ? loadDraftRaw('marketing-travel', null) : null;
    return draft?.stops || plan?.stops?.filter(s => s.status !== 'Cancelled') || [];
  });

  // Mark draft as restored
  useEffect(() => { draftRestoredRef.current = true; }, []);

  // Persist draft on changes
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    persistDraft({ form, stops });
  }, [form, stops, isEdit, persistDraft]);
  const [dragIdx, setDragIdx] = useState(null);

  // ---- Attachments ----------------------------------------------------
  // Files picked here are STAGED, never written to storage on their own: they
  // are uploaded right after the registry itself is saved, so a stored file (and
  // its row) can never exist without the registry it belongs to. Files already
  // attached to a saved registry are listed and managed on its detail view.
  const [stagedFiles, setStagedFiles] = useState([]);

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));
  const startRef = useRef(null);
  const endRef = useRef(null);
  const [geocoding, setGeocoding] = useState({ start: false, end: false });

  // Geocode a location name using the client-side geocoding service
  const geocodeLocation = useCallback(async (prefix, locationName) => {
    if (!locationName || locationName.trim().length < 3) return;
    setGeocoding(prev => ({ ...prev, [prefix]: true }));
    try {
      const { geocode } = await import('../../services/geocodingService');
      const result = await geocode(locationName);
      if (result) {
        setForm(prev => ({ ...prev, [prefix + 'Latitude']: result.lat, [prefix + 'Longitude']: result.lng }));
      }
    } catch { /* ignore geocoding failures */ }
    finally { setGeocoding(prev => ({ ...prev, [prefix]: false })); }
  }, []);

  const addStop = () => setStops(prev => [...prev, {
    sequence: prev.length + 1, companyName: '', customerName: '', googlePlaceId: '', address: '', state: '', district: '', city: '',
    latitude: '', longitude: '', plannedDate: form.startDate || '', plannedArrivalTime: '10:00', plannedDepartureTime: '12:00',
    expectedStayDurationMinutes: 120, appointmentStatus: 'Fixed', contactPerson: '', contactDesignation: '', contactPhone: '', contactEmail: '',
    purposeOfVisit: '', priority: 'Medium', remarks: '', status: 'Planned'
  }]);

  const updateStop = (i, field, val) => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const removeStop = (i) => setStops(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, sequence: idx + 1 })));
  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver = (e, i) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    setStops(prev => { const n = [...prev]; const [m] = n.splice(dragIdx, 1); n.splice(i, 0, m); return n.map((s, idx) => ({ ...s, sequence: idx + 1 })); });
    setDragIdx(i);
  };
  const handleDragEnd = () => setDragIdx(null);

  const buildPayload = () => ({
    ...form,
    startLatitude: form.startLatitude ? Number(form.startLatitude) : null,
    startLongitude: form.startLongitude ? Number(form.startLongitude) : null,
    endLatitude: form.endLatitude ? Number(form.endLatitude) : null,
    endLongitude: form.endLongitude ? Number(form.endLongitude) : null,
    stops: stops.map(s => ({ ...s, latitude: s.latitude ? Number(s.latitude) : null, longitude: s.longitude ? Number(s.longitude) : null }))
  });

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Registry Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1">Start Date *</label><input type="date" value={form.startDate} onChange={set('startDate')} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1">Start Time</label><input type="time" value={form.startTime} onChange={set('startTime')} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1">End Date</label><input type="date" value={form.endDate} onChange={set('endDate')} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1">End Time</label><input type="time" value={form.endTime} onChange={set('endTime')} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1">Starting Location * {geocoding.start && <span className="text-[9px] text-[#0B4A3D]">(geocoding...)</span>}</label><input ref={startRef} type="text" value={form.startingLocation} onChange={set('startingLocation')} onBlur={() => geocodeLocation('start', form.startingLocation)} placeholder="e.g. Erode" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1">Ending Location * {geocoding.end && <span className="text-[9px] text-[#0B4A3D]">(geocoding...)</span>}</label><input ref={endRef} type="text" value={form.endingLocation} onChange={set('endingLocation')} onBlur={() => geocodeLocation('end', form.endingLocation)} placeholder="e.g. Erode (return)" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1">Purpose *</label><select value={form.purpose} onChange={set('purpose')} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"><option value="">— Select —</option>{PURPOSES.map(p => <option key={p}>{p}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="block text-[11px] font-bold text-slate-500 mb-1">Remarks</label><textarea value={form.remarks} onChange={set('remarks')} rows={2} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs" /></div>
        </div>
      </div>

      {/* Plant stops */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Plant Stops ({stops.length})</h3>
          <button onClick={addStop} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B4A3D] text-white hover:bg-[#083D34] cursor-pointer"><Plus size={12} /> Add Plant</button>
        </div>
        {stops.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">No plants added yet. Click "Add Plant" to start.</div>
        ) : (
          <div className="space-y-3">
            {stops.map((stop, i) => (
              <div key={i} draggable onDragStart={() => handleDragStart(i)} onDragOver={(e) => handleDragOver(e, i)} onDragEnd={handleDragEnd}
                className={`border rounded-lg p-3 transition-colors ${dragIdx === i ? 'border-[#B8D4CC] bg-[#E8F0EE]' : 'border-slate-200 bg-slate-50/50'}`}>
                <div className="flex items-start gap-2">
                  <div className="flex items-center gap-1 pt-1 text-slate-400 cursor-grab">
                    <GripVertical size={14} />
                    <span className="text-[10px] font-bold bg-slate-200 rounded w-5 h-5 flex items-center justify-center">{stop.sequence}</span>
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Plant / Company *</label><input type="text" value={stop.companyName} onChange={e => updateStop(i, 'companyName', e.target.value)} placeholder="Plant name" className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Customer</label><input type="text" value={stop.customerName || ''} onChange={e => updateStop(i, 'customerName', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Contact Person</label><input type="text" value={stop.contactPerson || ''} onChange={e => updateStop(i, 'contactPerson', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Designation</label><input type="text" value={stop.contactDesignation || ''} onChange={e => updateStop(i, 'contactDesignation', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Phone</label><input type="text" value={stop.contactPhone || ''} onChange={e => updateStop(i, 'contactPhone', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Email</label><input type="email" value={stop.contactEmail || ''} onChange={e => updateStop(i, 'contactEmail', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Date</label><input type="date" value={stop.plannedDate || ''} onChange={e => updateStop(i, 'plannedDate', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Arrival</label><input type="time" value={stop.plannedArrivalTime || ''} onChange={e => updateStop(i, 'plannedArrivalTime', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Departure</label><input type="time" value={stop.plannedDepartureTime || ''} onChange={e => updateStop(i, 'plannedDepartureTime', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Stay (min)</label><input type="number" min="0" value={stop.expectedStayDurationMinutes || ''} onChange={e => updateStop(i, 'expectedStayDurationMinutes', Number(e.target.value))} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div className="sm:col-span-2"><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Address</label><input type="text" value={stop.address || ''} onChange={e => updateStop(i, 'address', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Purpose</label><input type="text" value={stop.purposeOfVisit || ''} onChange={e => updateStop(i, 'purposeOfVisit', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px]" /></div>
                    <div className="flex items-end gap-1">
                      <div className="flex-1"><label className="block text-[10px] font-bold text-slate-400 mb-0.5">Status</label><Pill status={stop.status} map={STOP_PILL} /></div>
                      {stop.status !== 'Cancelled' && <button onClick={() => removeStop(i)} className="p-1 rounded hover:bg-slate-100 text-rose-400 cursor-pointer mb-0.5"><Trash2 size={12} /></button>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Route Summary */}
      {plan?.totalDistanceKm != null && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Route Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-slate-50 rounded-lg"><div className="text-lg font-bold">{plan.activeStopsCount || 0}</div><div className="text-[10px] text-slate-400">Stops</div></div>
            <div className="text-center p-3 bg-slate-50 rounded-lg"><div className="text-lg font-bold">{fmtDist(plan.totalDistanceKm)}</div><div className="text-[10px] text-slate-400">Distance</div></div>
            <div className="text-center p-3 bg-slate-50 rounded-lg"><div className="text-lg font-bold">{fmtTime(plan.totalTravelTimeMinutes)}</div><div className="text-[10px] text-slate-400">Travel Time</div></div>
            <div className="text-center p-3 bg-slate-50 rounded-lg"><div className="text-lg font-bold">{plan.startDate && plan.endDate ? Math.ceil((new Date(plan.endDate) - new Date(plan.startDate)) / 86400000) + 1 : '—'}</div><div className="text-[10px] text-slate-400">Days</div></div>
          </div>
          <div className="mt-3 flex items-center gap-1 flex-wrap text-[11px]">
            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-bold">{plan.startingLocation || 'START'}</span>
            {stops.filter(s => s.status !== 'Cancelled').map((s, i) => (
              <span key={i} className="flex items-center gap-1"><ArrowRight size={12} className="text-slate-300" /><span className="px-2 py-1 bg-[#E8F0EE] text-[#0B4A3D] rounded font-bold">{s.companyName || `Stop ${s.sequence}`}</span></span>
            ))}
            <ArrowRight size={12} className="text-slate-300" />
            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-bold">{plan.endingLocation || 'END'}</span>
          </div>
        </div>
      )}

      {/* Attachments — stored in the shared ERP attachment pool */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attachments</h3>
          {stagedFiles.length > 0 && (
            <span className="text-[10px] font-bold text-amber-600">{stagedFiles.length} pending upload</span>
          )}
        </div>
        {canUpload ? (
          <>
            <PendingAttachments files={stagedFiles} onChange={setStagedFiles} />
            <p className="text-[10px] text-slate-400 mt-2">
              {plan?.id
                ? 'Files picked here are uploaded when you save this registry.'
                : 'Files picked here are uploaded as soon as this registry is created.'}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-slate-400">Attachment upload is not permitted for your Marketing access.</p>
        )}
      </div>

      {/* Actions — two-sided footer: LEFT Cancel / Save Draft, RIGHT Submit */}
      <div className="mkt-form-footer">
        <div className="mkt-form-footer-group">
          {onCancel && <button onClick={onCancel} className="erp-create-btn mkt-btn-secondary"><X size={13} /> Cancel</button>}
          {onSave && <button onClick={() => { clearFormDraft(); onSave(buildPayload(), stagedFiles); }} className="erp-create-btn"><Save size={13} /> Save Draft</button>}
        </div>
        <div className="mkt-form-footer-group">
          {onSubmit && <button onClick={() => { clearFormDraft(); onSubmit(buildPayload(), stagedFiles); }} className="erp-create-btn"><Send size={13} /> Submit for Approval</button>}
        </div>
      </div>
    </div>
  );
}

// ============================== Plan Detail View ==============================

function PlanDetail({ planId, onClose, onChanged }) {
  // Travel Registry action permissions (UI gate; the backend enforces).
  const { can } = useMarketingAccess();
  const canEdit = can('travelRegistry', 'edit');
  const canDelete = can('travelRegistry', 'delete');
  const canApprove = can('travelRegistry', 'approve');
  const canUpload = can('travelRegistry', 'upload');
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('details');
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [attachments, setAttachments] = useState([]);

  const loadAttachments = useCallback(
    () => fetchPlanAttachments(setAttachments, planId),
    [planId]
  );

  useEffect(() => { fetchPlanAttachments(setAttachments, planId); }, [planId]);

  const load = useCallback(() => {
    fetchPlanDetail(setPlan, setLoading, planId, (msg) => toast.error(msg));
  }, [planId, toast]);

  useEffect(() => {
    fetchPlanDetail(setPlan, setLoading, planId, (msg) => toast.error(msg));
  }, [planId, toast]);

  if (loading) return <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>;
  if (!plan) return <div className="text-center py-8 text-slate-400 text-sm">Registry not found</div>;

  const activeStops = (plan.stops || []).filter(s => s.status !== 'Cancelled');
  const cancelledStops = (plan.stops || []).filter(s => s.status === 'Cancelled');
  const isApproved = plan.status === 'Approved';
  const isActive = plan.status === 'Active';
  const isDraft = plan.status === 'Draft' || plan.status === 'Revision Required';
  const isSubmitted = plan.status === 'Submitted';

  const sections = [
    { key: 'details', label: 'Registry Details', icon: FileText },
    { key: 'schedule', label: 'Schedule', icon: Clock },
    { key: 'map', label: 'Map & Route', icon: Map },
    { key: 'plants', label: 'Plant Summary', icon: Users },
    { key: 'attachments', label: 'Attachments', icon: Paperclip },
    { key: 'approval', label: 'Approval', icon: Check },
    { key: 'history', label: 'History', icon: Calendar }
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800">{plan.planNo || `TP-${plan.id}`}</h2>
          <p className="text-[11px] text-slate-400">{plan.marketer} · {fmtDate(plan.startDate)} to {fmtDate(plan.endDate)} · {plan.purpose || ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pill status={plan.status} map={STATUS_PILL} />
          {isDraft && canDelete && (
            <button onClick={async () => {
              if (!confirm(`Delete ${plan.planNo || 'this travel registry'}? This cannot be undone.`)) return;
              try {
                await marketingService.deleteTravelPlan(plan.id);
                toast.success('Travel registry deleted');
                onChanged?.();
                onClose();
              } catch (e) { toast.error(e?.message || 'Failed to delete'); }
            }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 cursor-pointer">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Route visualization bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-1 flex-wrap text-[11px]">
          <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-bold">{plan.startingLocation || 'START'}</span>
          {activeStops.map((s, i) => (
            <span key={i} className="flex items-center gap-1">
              <ArrowRight size={12} className="text-slate-300" />
              <span className={`px-2 py-1 rounded font-bold ${s.status === 'Active' ? 'bg-violet-50 text-violet-700' : s.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#E8F0EE] text-[#0B4A3D]'}`}>
                {s.companyName || `Stop ${s.sequence}`}
              </span>
            </span>
          ))}
          <ArrowRight size={12} className="text-slate-300" />
          <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-bold">{plan.endingLocation || 'END'}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="text-center p-2 bg-slate-50 rounded"><div className="text-sm font-bold">{fmtDist(plan.totalDistanceKm)}</div><div className="text-[10px] text-slate-400">Distance</div></div>
          <div className="text-center p-2 bg-slate-50 rounded"><div className="text-sm font-bold">{fmtTime(plan.totalTravelTimeMinutes)}</div><div className="text-[10px] text-slate-400">Travel Time</div></div>
          <div className="text-center p-2 bg-slate-50 rounded"><div className="text-sm font-bold">{activeStops.length}</div><div className="text-[10px] text-slate-400">Active Stops</div></div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeSection === s.key ? 'bg-[#0B4A3D] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              <Icon size={12} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* Plan Details */}
      {activeSection === 'details' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Registry Details</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div><span className="text-slate-400">Start:</span> <span className="font-bold">{plan.startingLocation || '—'}</span></div>
            <div><span className="text-slate-400">End:</span> <span className="font-bold">{plan.endingLocation || '—'}</span></div>
            <div><span className="text-slate-400">Purpose:</span> <span className="font-bold">{plan.purpose || '—'}</span></div>
            <div><span className="text-slate-400">Start Date:</span> <span className="font-bold">{fmtDate(plan.startDate)} {plan.startTime || ''}</span></div>
            <div><span className="text-slate-400">End Date:</span> <span className="font-bold">{fmtDate(plan.endDate)} {plan.endTime || ''}</span></div>
            <div><span className="text-slate-400">Distance:</span> <span className="font-bold">{fmtDist(plan.totalDistanceKm)}</span></div>
            <div><span className="text-slate-400">Travel Time:</span> <span className="font-bold">{fmtTime(plan.totalTravelTimeMinutes)}</span></div>
            <div><span className="text-slate-400">Stops:</span> <span className="font-bold">{activeStops.length} active</span></div>
          </div>
          {plan.remarks && <div className="mt-3 text-[11px] text-slate-500"><span className="font-bold">Remarks:</span> {plan.remarks}</div>}
          {cancelledStops.length > 0 && (
            <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-2">
              <p className="text-[10px] font-bold text-rose-700">Cancelled Stops ({cancelledStops.length})</p>
              {cancelledStops.map(s => (
                <div key={s.id} className="text-[10px] text-rose-600 flex items-center gap-2">
                  <span className="line-through">{s.companyName}</span>
                  <span className="text-rose-400">·</span>
                  <span>{s.cancellationReason || 'No reason'}</span>
                  <span className="text-rose-400">·</span>
                  <span>{fmtDateTime(s.cancelledAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule */}
      {activeSection === 'schedule' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Schedule</h3>
          <ScheduleView plan={plan} stops={plan.stops} />
        </div>
      )}

      {/* Map & Route */}
      {activeSection === 'map' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 pb-0">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Map & Route</h3>
          </div>
          <TripMap plan={plan} stops={plan.stops} />
          {/* Route change warnings from snapshots */}
          {plan.routeSnapshots?.length > 1 && (
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowSnapshots(!showSnapshots)} className="flex items-center gap-1 text-[11px] font-bold text-slate-500 cursor-pointer">
                <AlertTriangle size={12} /> Route Changes ({plan.routeSnapshots.length - 1}) {showSnapshots ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showSnapshots && (
                <div className="mt-2 space-y-1.5">
                  {plan.routeSnapshots.slice(1).map(s => (
                    <div key={s.id} className="text-[10px] bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-3">
                      <span className="text-amber-600 font-bold">{fmtDateTime(s.calculatedAt)}</span>
                      <span>{s.triggerType}</span>
                      {s.distanceDifferenceKm != null && (
                        <span className={Number(s.distanceDifferenceKm) >= 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                          {Number(s.distanceDifferenceKm) >= 0 ? '+' : ''}{Number(s.distanceDifferenceKm).toFixed(1)} km
                        </span>
                      )}
                      <span>{fmtDist(s.totalDistanceKm)} · {fmtTime(s.totalTravelTimeMinutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plant Summary */}
      {activeSection === 'plants' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Plant Summary</h3>
          <PlantSummary plan={plan} stops={plan.stops} />
        </div>
      )}

      {/* Attachments — stored in the shared attachment pool, served back with the record */}
      {activeSection === 'attachments' && canUpload && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Attachments ({attachments.length})</h3>
          <SalesAttachments
            service={travelPlanAttachments}
            docId={plan.id}
            attachments={attachments}
            onChanged={loadAttachments}
            variant="table"
          />
        </div>
      )}

      {/* Approval */}
      {activeSection === 'approval' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Approval</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div><span className="text-slate-400">Status:</span> <Pill status={plan.status} map={STATUS_PILL} /></div>
              {plan.approvedBy && <div><span className="text-slate-400">Approved By:</span> <span className="font-bold">{plan.approvedBy}</span></div>}
              {plan.approvedAt && <div><span className="text-slate-400">Approved At:</span> <span className="font-bold">{fmtDateTime(plan.approvedAt)}</span></div>}
              {plan.rejectionReason && <div className="col-span-2"><span className="text-slate-400">Rejection Reason:</span> <span className="font-bold text-rose-600">{plan.rejectionReason}</span></div>}
              {plan.revisionComments && <div className="col-span-2"><span className="text-slate-400">Revision Comments:</span> <span className="font-bold text-amber-600">{plan.revisionComments}</span></div>}
            </div>
            {/* Actions */}
            <div className="mkt-action-scope flex gap-2 flex-wrap pt-3 border-t border-slate-200">
              {isDraft && canEdit && (
                <button onClick={async () => { try { await marketingService.submitTravelPlan(plan.id); await load(); toast.success('Submitted'); } catch (e) { toast.error(e?.message); } }}
                  className="erp-create-btn"><Send size={12} /> Submit for Approval</button>
              )}
              {isSubmitted && canApprove && (
                <>
                  <button onClick={async () => { try { await marketingService.approveTravelPlan(plan.id); await load(); toast.success('Approved'); } catch (e) { toast.error(e?.message); } }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"><Check size={12} /> Approve</button>
                  <button onClick={async () => { const r = prompt('Rejection reason:'); if (!r) return; try { await marketingService.rejectTravelPlan(plan.id, { rejectionReason: r }); await load(); toast.success('Rejected'); } catch (e) { toast.error(e?.message); } }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"><X size={12} /> Reject</button>
                </>
              )}
              {isApproved && canEdit && (
                <button onClick={async () => { try { await marketingService.startTrip(plan.id); await load(); toast.success('Trip started'); } catch (e) { toast.error(e?.message); } }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-violet-600 text-white hover:bg-violet-700 cursor-pointer"><Play size={12} /> Start Trip</button>
              )}
              {isActive && canEdit && (
                <>
                  <LocationTrackingButton planId={plan.id} planStatus={plan.status} />
                  <button onClick={async () => { if (!confirm('End this trip?')) return; try { await marketingService.endTrip(plan.id); await load(); toast.success('Trip completed'); } catch (e) { toast.error(e?.message); } }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-600 text-white hover:bg-slate-700 cursor-pointer"><Square size={12} /> End Trip</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {activeSection === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Change History ({plan.changeHistory?.length || 0})</h3>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {(plan.changeHistory || []).map(h => (
              <div key={h.id} className="flex items-start gap-3 text-[11px]">
                <span className="text-slate-400 whitespace-nowrap">{fmtDateTime(h.performedAt)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  h.action.includes('CANCEL') ? 'bg-rose-100 text-rose-600' :
                  h.action.includes('APPROV') ? 'bg-emerald-100 text-emerald-600' :
                  h.action.includes('REJECT') ? 'bg-rose-100 text-rose-600' :
                  h.action.includes('START') ? 'bg-violet-100 text-violet-600' :
                  h.action.includes('END') ? 'bg-slate-100 text-slate-600' :
                  h.action.includes('RESCHEDUL') ? 'bg-amber-100 text-amber-600' :
                  'bg-slate-100 text-slate-600'
                }`}>{h.action.replace(/_/g, ' ')}</span>
                <span className="text-slate-600 flex-1">{h.description}</span>
                <span className="text-slate-400">by {h.performedBy}</span>
              </div>
            ))}
            {(!plan.changeHistory || plan.changeHistory.length === 0) && (
              <p className="text-[11px] text-slate-400">No history recorded</p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => { onClose(); onChanged?.(); }} className="px-4 h-[36px] rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer">Close</button>
      </div>
    </div>
  );
}

// ============================== Location Tracking Button ========================

function LocationTrackingButton({ planId, planStatus }) {
  const toast = useToast();
  const [tracking, setTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);

  const stopTracking = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
    setLastUpdate(null);
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported by this browser');
      return;
    }

    // Get initial position immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation(pos),
      (err) => toast.error('Location access denied: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => sendLocation(pos),
      () => {}, // ignore errors on watch
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    setTracking(true);
  };

  const sendLocation = async (pos) => {
    try {
      await marketingService.submitLocation({
        travelPlanId: planId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        recordedAt: new Date(pos.timestamp).toISOString()
      });
      setLastUpdate(new Date());
    } catch { /* ignore individual failures */ }
  };

  // Cleanup on unmount (pure — no state updates while unmounting)
  useEffect(() => () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // Stop watchers when the trip is no longer active
  useEffect(() => {
    if (planStatus !== 'Active' && tracking) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [planStatus, tracking]);

  const activeTracking = tracking && planStatus === 'Active';

  if (planStatus !== 'Active') return null;

  return (
    <button onClick={tracking ? stopTracking : startTracking}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
        activeTracking
          ? 'bg-green-600 text-white hover:bg-green-700 animate-pulse'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'
      }`}>
      <Navigation size={12} />
      {activeTracking ? (
        <span>📍 Tracking {lastUpdate ? `since ${fmtDateTime(lastUpdate)}` : ''}</span>
      ) : 'Start Location Tracking'}
    </button>
  );
}

// ============================== Main Travel Planner ==============================

export default function TravelPlanner() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useMarketingAccess();
  const canCreate = can('travelRegistry', 'create');
  const [activeTab, setActiveTab] = useState('my-plans');
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size] = useState(15);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const allPageSelected = plans.length > 0 && plans.every((row) => selectedIds.includes(row.id));
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !plans.some((row) => row.id === id)));
    } else {
      const ids = new Set(selectedIds);
      plans.forEach((row) => ids.add(row.id));
      setSelectedIds([...ids]);
    }
  };
  const [editingPlan, setEditingPlan] = useState(null);
  const [summary, setSummary] = useState(null);
  // Read-only Preview (Actions ⋮ → Preview) — same UX as Quotations.
  const [previewPlan, setPreviewPlan] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterMarketer, setFilterMarketer] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const headerRowRef = useRef(null);
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey: 'planNo',
    visibleKeys: ['planNo', 'marketer', 'startDate', 'endDate', 'route', 'stops', 'distance', 'status', 'actions']
  });

  const loadPlans = useCallback(() => {
    const isUpcoming = activeTab === 'upcoming';
    fetchTravelPlans({ setPlans, setTotal, setLoading }, {
      page: page - 1, size, sort: 'createdAt,desc',
      search: search || undefined,
      marketer: filterMarketer || undefined,
      // Upcoming = Approved plans with start date >= today (same rule as the summary API)
      dateFrom: isUpcoming ? todayLocal() : (dateFrom || undefined),
      dateTo: isUpcoming ? undefined : (dateTo || undefined),
      status: TAB_STATUS[activeTab]
    });
  }, [page, size, search, activeTab, filterMarketer, dateFrom, dateTo]);

  const loadSummary = useCallback(() => {
    fetchTravelPlanSummary(setSummary);
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);
  useEffect(() => {
    fetchTravelPlanSummary(setSummary);
  }, []);

  // Staged create-form files are uploaded only once the registry exists (and,
  // for Save Draft / Submit, only after that save succeeded), so a failed save
  // never leaves a stored file behind. Uploads are reported per file: one bad
  // file never discards the others, nor the registry itself.
  const uploadStagedAttachments = async (planId, files) => {
    if (!planId || !files?.length) return;
    const results = await travelPlanAttachments.uploadMany(planId, files);
    const failed = results.filter(r => !r.ok);
    const uploaded = results.length - failed.length;
    if (failed.length === 0) toast.success(`${uploaded} attachment(s) uploaded`);
    else if (uploaded === 0) toast.error(failed[0].error?.message || 'Attachments failed to upload');
    else toast.warning(`${uploaded} attachment(s) uploaded, ${failed.length} failed`);
  };

  const handleSaveDraft = async (payload, files = []) => {
    try {
      let planId;
      if (editingPlan?.id) { await marketingService.saveTravelPlanDraft(editingPlan.id, payload); planId = editingPlan.id; toast.success('Draft saved'); }
      else { const res = await marketingService.createTravelPlan(payload); const data = res?.data || res; planId = data?.id; toast.success('Registry created'); }
      await uploadStagedAttachments(planId, files);
      setSelectedPlanId(planId); setEditingPlan(null);
      loadPlans(); loadSummary();
    } catch (err) { toast.error(err?.message || 'Failed to save'); }
  };

  const handleSubmit = async (payload, files = []) => {
    try {
      let planId;
      if (editingPlan?.id) { await marketingService.updateTravelPlan(editingPlan.id, payload); planId = editingPlan.id; }
      else { const res = await marketingService.createTravelPlan(payload); planId = res?.data?.id || res?.id; }
      await uploadStagedAttachments(planId, files);
      await marketingService.submitTravelPlan(planId);
      toast.success('Registry submitted for approval');
      setSelectedPlanId(planId); setEditingPlan(null); loadPlans(); loadSummary();
    } catch (err) { toast.error(err?.message || 'Failed to submit'); }
  };

  const totalPages = Math.ceil(total / size);

  return (
    <div className="purchase-page cpr-page">
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/marketing')}>Marketing</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span className="bc-current">Travel Registry</span>
      </nav>

      <div className="pr-page-header">
        <div className="pr-page-header-title">
          <h1>
            <MapPin size={22} />
            Marketing Travel Registry
          </h1>
          <p className="po-page-header-subtitle">Plan, schedule and track marketing travel routes and plant visits.</p>
        </div>
        <div className="pr-page-header-actions">
          <button onClick={() => setShowFilters(!showFilters)} className="erp-btn-secondary">
            <Filter size={14} /> Filters
          </button>
          <button onClick={() => { setEditingPlan(null); setSelectedPlanId(null); setActiveTab('create'); }}
            className="erp-btn-primary">
            <Plus size={14} /> New Travel Registry
          </button>
        </div>
      </div>

      <SummaryDashboard
        summary={summary}
        activeKpi={TAB_TO_KPI[activeTab] || null}
        onSelect={(key) => {
          const tab = KPI_TO_TAB[key];
          if (!tab) return;
          setActiveTab(tab);
          setPage(1);
          setSelectedPlanId(null);
          setEditingPlan(null);
        }}
      />

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Advanced Filters</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className="text-[10px] font-bold text-slate-400">Marketer</label><input type="text" value={filterMarketer} onChange={e => { setFilterMarketer(e.target.value); setPage(1); }} placeholder="Filter..." className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5" /></div>
            <div><label className="text-[10px] font-bold text-slate-400">From Date</label><input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5" /></div>
            <div><label className="text-[10px] font-bold text-slate-400">To Date</label><input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5" /></div>
            <div className="flex items-end"><button onClick={() => { setFilterMarketer(''); setDateFrom(''); setDateTo(''); setPage(1); }} className="text-[10px] font-bold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded cursor-pointer">Clear Filters</button></div>
          </div>
        </div>
      )}

      <div className="pr-tabs">
        {PLAN_TABS.filter(tab => tab.key !== 'create' || canCreate).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setPage(1); setSelectedPlanId(null); setEditingPlan(null); }}
            className={`pr-tab ${activeTab === tab.key ? 'active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {selectedPlanId ? (
        <PlanDetail planId={selectedPlanId} onClose={() => setSelectedPlanId(null)} onChanged={() => { loadPlans(); loadSummary(); }} />
      ) : activeTab === 'create' && canCreate ? (
        <PlanForm plan={editingPlan} onSave={handleSaveDraft} onSubmit={handleSubmit} onCancel={() => { setEditingPlan(null); setActiveTab('my-plans'); }} />
      ) : (
        <>
          <div className="pr-toolbar">
            <div className="pr-toolbar-left">
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by Registry No, Marketer, Location, Purpose..."
                className="pr-search-input" style={{ width: 360 }} />
            </div>
            <div className="pr-toolbar-right">
              <span className="toolbar-count">{total} plan(s)</span>
            </div>
          </div>
          <div className="pr-table-card">
            <div className="pr-table-wrap">
              <table className="pr-table sgrid sgrid-mkt pr-table-fixed" style={{ tableLayout: 'fixed', minWidth: 1320 }}>
                <colgroup>
                  <col style={{ width: 50 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 320 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead><tr ref={headerRowRef}>
                  <th className="checkbox-cell sgrid-pin sgrid-first" style={{ width: 50 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th data-sticky-key="planNo" data-sticky-col="true" className="sgrid-pin" style={{ left: stickyLeft }}>Registry No</th>
                  <th>Marketer</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Route</th>
                  <th>Stops</th>
                  <th>Distance</th>
                  <th>Status</th>
                  <th className="sgrid-pin-actions" style={{ textAlign: 'center' }}>Actions</th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={9} className="me-empty">Loading...</td></tr>
                  : plans.length === 0 ? <tr><td colSpan={9} className="me-empty">No travel registries found</td></tr>
                  : plans.map(p => (
                    <tr key={p.id} className={`${selectedIds.includes(p.id) ? 'is-selected' : ''} clickable group`} onClick={() => setSelectedPlanId(p.id)}>
                      <td className="checkbox-cell sgrid-pin sgrid-first" data-sticky-col="true">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(p.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                            )
                          }
                          aria-label={`Select ${p.planNo || p.id}`}
                        />
                      </td>
                      <td className="me-td-blue cell-id sgrid-pin" style={{ left: stickyLeft }} title={p.planNo || `TP-${p.id}`}>{p.planNo || `TP-${p.id}`}</td>
                      <td title={p.marketer || ''}>{p.marketer}</td>
                      <td className="cell-date">{fmtDate(p.startDate)}</td>
                      <td className="cell-date">{fmtDate(p.endDate)}</td>
                      <td className="me-td-muted" title={`${p.startingLocation || '—'} → ${p.endingLocation || '—'}`}>{p.startingLocation || '—'} → {p.endingLocation || '—'}</td>
                      <td>{p.activeStopsCount || 0}</td>
                      <td>{fmtDist(p.totalDistanceKm)}</td>
                      <td><Pill status={p.status} map={STATUS_PILL} /></td>
                      <td className="sgrid-pin-actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <ActionMenu
                          triggerClassName="erp-row-action-btn"
                          items={[
                            { key: 'preview', label: 'Preview', icon: ScanSearch },
                            { key: 'view', label: 'View Details', icon: Eye }
                          ]}
                          onAction={(key) => {
                            if (key === 'preview') setPreviewPlan(p);
                            else if (key === 'view') setSelectedPlanId(p.id);
                          }}
                          triggerClassName="erp-row-action-btn"
                          buttonLabel="Row actions"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <p className="me-td-muted" style={{ fontSize: 12 }}>Showing {(page - 1) * size + 1}—{Math.min(page * size, total)} of {total}</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="qtn-btn qtn-btn-secondary" style={{ height: 36, padding: '0 16px' }}>Prev</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 10px', fontSize: 12, fontWeight: 700, color: '#6B7280' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="qtn-btn qtn-btn-secondary" style={{ height: 36, padding: '0 16px' }}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== READ-ONLY PREVIEW (Actions ⋮ → Preview) ===== */}
      <RecordPreviewModal
        open={previewPlan !== null}
        onClose={() => setPreviewPlan(null)}
        title={previewPlan?.planNo || (previewPlan?.id != null ? `TP-${previewPlan.id}` : 'Travel Registry')}
        subtitle={previewPlan?.marketer ? `Marketer: ${previewPlan.marketer}` : ''}
        status={previewPlan?.status}
        sections={[
          {
            heading: 'Travel Registry',
            rows: [
              ['Marketer', previewPlan?.marketer],
              ['Start Date', previewPlan?.startDate],
              ['End Date', previewPlan?.endDate],
              ['Route', previewPlan?.startingLocation || previewPlan?.endingLocation ? `${previewPlan.startingLocation || '—'} → ${previewPlan.endingLocation || '—'}` : ''],
              ['Stops', previewPlan?.activeStopsCount],
              ['Total Distance', previewPlan?.totalDistanceKm != null ? `${previewPlan.totalDistanceKm} km` : ''],
              ['Status', previewPlan?.status]
            ]
          }
        ]}
        footer={
          previewPlan && (
            <>
              <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={() => setPreviewPlan(null)}>
                Close
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary po-btn-sm"
                onClick={() => { setSelectedPlanId(previewPlan.id); setPreviewPlan(null); }}
              >
                View Full Registry
              </button>
            </>
          )
        }
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, Plus,
  MapPin, Target, Phone,
  X, Eye, Edit3, Trash2, CheckCircle2, AlertCircle,
  ListFilter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../Common';
import marketingService from '../../services/marketingService';
import './marketing-calendar.css';
import '../../pages/crm/crm-erp.css';

// ============================== Constants ==============================

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const ACTIVITY_TYPES = [
  { key: 'visit', label: 'Visits', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: MapPin },
  { key: 'followup', label: 'Follow-ups', color: '#0B4A3D', bg: '#E8F0EE', border: '#B8D4CC', icon: Phone },
  { key: 'travel_plan', label: 'Travel Registries', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', icon: Target },
];

const ACTIVITY_MAP = Object.fromEntries(ACTIVITY_TYPES.map(t => [t.key, t]));

// ============================== Helpers ==============================

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function firstDayOfMonth(year, month) {
  // 0=Sun,1=Mon...6=Sat →’ convert to Mon=0 start
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function fmtTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

function isToday(year, month, day) {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;
}

function formatDateFull(y, m, d) {
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ============================== Mini Calendar ==============================

function MiniCalendar({ year, month, selectedDate, onSelect }) {
  const days = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  const prev = () => {
    if (month === 1) onSelect(year - 1, 12);
    else onSelect(year, month - 1);
  };
  const next = () => {
    if (month === 12) onSelect(year + 1, 1);
    else onSelect(year, month + 1);
  };

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div className="mc-mini">
      <div className="mc-mini-header">
        <button type="button" onClick={prev} className="mc-mini-nav"><ChevronLeft size={14} /></button>
        <span className="mc-mini-title">{MONTHS[month - 1]} {year}</span>
        <button type="button" onClick={next} className="mc-mini-nav"><ChevronRight size={14} /></button>
      </div>
      <div className="mc-mini-weekdays">
        {WEEKDAYS.map(w => <span key={w}>{w.slice(0, 2)}</span>)}
      </div>
      <div className="mc-mini-grid">
        {cells.map((d, i) => (
          <button
            key={i}
            type="button"
            className={`mc-mini-day${d == null ? ' empty' : ''}${isToday(year, month, d) ? ' today' : ''}${selectedDate === d ? ' selected' : ''}`}
            onClick={() => d && onSelect(year, month, d)}
            disabled={!d}
          >
            {d || ''}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================== Event Card (inside calendar cell) ==============================

function EventCard({ event, onClick }) {
  const type = ACTIVITY_MAP[event.type] || ACTIVITY_TYPES[0];
  const Icon = type.icon;
  return (
    <button
      type="button"
      className="mc-event"
      style={{ borderLeftColor: type.color, backgroundColor: type.bg }}
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      title={`${event.title} (${type.label})`}
    >
      <span className="mc-event-time">{fmtTime(event.time)}</span>
      <span className="mc-event-title">{event.title}</span>
      <span className="mc-event-type" style={{ color: type.color }}>{type.label}</span>
    </button>
  );
}

// ============================== Event Detail Panel ==============================

function EventDetailPanel({ event, onClose }) {
  const navigate = useNavigate();
  if (!event) return null;
  const type = ACTIVITY_MAP[event.type] || ACTIVITY_TYPES[0];
  const Icon = type.icon;

  return (
    <div className="mc-detail-panel">
      <div className="mc-detail-header">
        <div className="mc-detail-header-row">
          <Icon size={18} style={{ color: type.color }} />
          <span className="mc-detail-type" style={{ color: type.color }}>{type.label}</span>
          <button type="button" onClick={onClose} className="mc-detail-close"><X size={16} /></button>
        </div>
        <h3 className="mc-detail-title">{event.title}</h3>
      </div>

      <div className="mc-detail-body">
        <div className="mc-detail-field">
          <span className="mc-detail-label">Status</span>
          <span className="mc-detail-value">{event.status || '—'}</span>
        </div>
        <div className="mc-detail-field">
          <span className="mc-detail-label">Assigned To</span>
          <span className="mc-detail-value">{event.assignedTo || '—'}</span>
        </div>
        <div className="mc-detail-field">
          <span className="mc-detail-label">Date</span>
          <span className="mc-detail-value">{event.date || '—'}</span>
        </div>
        {event.time && (
          <div className="mc-detail-field">
            <span className="mc-detail-label">Time</span>
            <span className="mc-detail-value">{fmtTime(event.time)}</span>
          </div>
        )}
        {event.location && (
          <div className="mc-detail-field">
            <span className="mc-detail-label">Location</span>
            <span className="mc-detail-value">{event.location}</span>
          </div>
        )}
        {event.contactPerson && (
          <div className="mc-detail-field">
            <span className="mc-detail-label">Contact</span>
            <span className="mc-detail-value">{event.contactPerson}</span>
          </div>
        )}
      </div>

      <div className="mc-detail-actions">
        {event.type === 'visit' && event.entityId && (
          <>
            <button
              type="button"
              className="mc-action-btn primary"
              onClick={() => navigate(`/marketing/visits/${event.entityId}/edit`)}
            >
              <Edit3 size={14} /> Edit Visit
            </button>
            <button
              type="button"
              className="mc-action-btn secondary"
              onClick={() => navigate(`/marketing/visits/${event.entityId}/edit`)}
            >
              <CalendarDays size={14} /> Reschedule
            </button>
          </>
        )}
        {event.type !== 'visit' && event.linkPath && (
          <button
            type="button"
            className="mc-action-btn primary"
            onClick={() => navigate(event.linkPath)}
          >
            <Eye size={14} /> View Details
          </button>
        )}
      </div>
    </div>
  );
}

// ============================== Today's Activities ==============================

function TodaysActivities({ activities, onClickEvent }) {
  if (!activities.length) {
    return (
      <div className="mc-today-empty">
        <CalendarDays size={18} className="text-slate-300" />
        <span>No activities today</span>
      </div>
    );
  }

  return (
    <div className="mc-today-list">
      {activities.map(ev => {
        const type = ACTIVITY_MAP[ev.type] || ACTIVITY_TYPES[0];
        const Icon = type.icon;
        return (
          <button
            key={ev.id}
            type="button"
            className="mc-today-item"
            onClick={() => onClickEvent(ev)}
          >
            <span className="mc-today-time">{fmtTime(ev.time) || '—'}</span>
            <div className="mc-today-info">
              <span className="mc-today-name">{ev.title}</span>
              <span className="mc-today-type" style={{ color: type.color }}>
                <Icon size={11} /> {type.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================== Create Activity Dropdown ==============================

function CreateActivityDropdown({ selectedDate, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    { label: 'Visit', path: '/marketing/visits/new/edit', icon: MapPin },
    { label: 'Follow-up', path: '/marketing/follow-ups/new', icon: Phone },
  ];

  return (
    <div className="mc-create-dropdown" ref={ref}>
      <button type="button" className="mc-create-btn" onClick={() => setOpen(!open)}>
        <Plus size={15} /> Create Activity
      </button>
      {open && (
        <div className="mc-create-menu">
          {selectedDate && (
            <div className="mc-create-date">
              Selected: {formatDateFull(selectedDate.year, selectedDate.month, selectedDate.day)}
            </div>
          )}
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              className="mc-create-item"
              onClick={() => { onNavigate(item.path); setOpen(false); }}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================== Main Component ==============================

export default function MarketingCalendar() {
  const toast = useToast();
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(null);
  const [events, setEvents] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [detailEvent, setDetailEvent] = useState(null);

  // Filters (which activity types to show)
  const [filters, setFilters] = useState(() => {
    const init = {};
    ACTIVITY_TYPES.forEach(t => { init[t.key] = true; });
    return init;
  });

  const toggleFilter = (key) => setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  // Filtered events
  const filteredEvents = useMemo(() => events.filter(e => filters[e.type] !== false), [events, filters]);

  // Events grouped by date (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = {};
    filteredEvents.forEach(e => {
      const key = e.date; // already "YYYY-MM-DD" or similar
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [filteredEvents]);

  // Selected date string for detail panel
  const selectedDateStr = selectedDay
    ? `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedDayEvents = selectedDateStr ? (eventsByDate[selectedDateStr] || []) : [];

  // Fetch activities for the current month
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const [activities, today, monthSummary] = await Promise.all([
        marketingService.getCalendarActivities(year, month),
        marketingService.getCalendarToday(),
        marketingService.getCalendarSummary(year, month),
      ]);
      setEvents(Array.isArray(activities) ? activities : []);
      setTodayEvents(Array.isArray(today) ? today : []);
      setSummary(monthSummary || {});
    } catch (err) {
      console.error('Calendar fetch error:', err);
      toast.error('Unable to load calendar activities');
    } finally {
      setLoading(false);
    }
  }, [year, month, toast]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // Navigation
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
    setDetailEvent(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
    setDetailEvent(null);
  };
  const goToday = () => {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth() + 1);
    setSelectedDay(n.getDate());
  };

  // Calendar grid
  const days = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);
  const totalCells = Math.ceil((startDay + days) / 7) * 7;
  const gridCells = [];
  for (let i = 0; i < startDay; i++) gridCells.push({ empty: true });
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    gridCells.push({ day: d, dateStr, events: eventsByDate[dateStr] || [] });
  }
  while (gridCells.length < totalCells) gridCells.push({ empty: true });

  // Today's filtered events
  const todayFiltered = useMemo(() => {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return todayEvents.filter(e => filters[e.type] !== false);
  }, [todayEvents, filters]);

  return (
    <div className="purchase-page cpr-page">
      {/* Breadcrumb (Purchase PR design) */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/marketing')}>Marketing</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span className="bc-current">Calendar</span>
      </nav>

      {/* Page Header (Purchase PR design) */}
      <div className="pr-page-header">
        <div className="pr-page-header-title">
          <h1>
            <CalendarDays size={22} />
            Marketing Calendar
          </h1>
          <p className="po-page-header-subtitle">Manage visits, follow-ups, and travel registries across your team</p>
        </div>
      </div>

      <div className="mc-root">
      {/* Left Sidebar */}
      <aside className="mc-sidebar">
        <CreateActivityDropdown
          selectedDate={selectedDay ? { year, month, day: selectedDay } : null}
          onNavigate={(path) => navigate(path)}
        />

        <MiniCalendar
          year={year}
          month={month}
          selectedDate={selectedDay}
          onSelect={(y, m, d) => { setYear(y); setMonth(m); setSelectedDay(d); }}
        />

        {/* My Calendars */}
        <div className="mc-sidebar-section">
          <h4 className="mc-sidebar-heading">
            <ListFilter size={13} /> My Calendars
          </h4>
          <div className="mc-filters">
            {ACTIVITY_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <label key={t.key} className="mc-filter-row">
                  <input
                    type="checkbox"
                    checked={filters[t.key]}
                    onChange={() => toggleFilter(t.key)}
                    className="mc-filter-cb"
                    style={{ accentColor: t.color }}
                  />
                  <Icon size={13} style={{ color: t.color }} />
                  <span>{t.label}</span>
                  <span className="mc-filter-count">
                    {summary[t.key] || 0}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Today's Activities */}
        <div className="mc-sidebar-section mc-today-section">
          <h4 className="mc-sidebar-heading">
            <Clock size={13} /> Today's Activities
          </h4>
          <TodaysActivities activities={todayFiltered} onClickEvent={setDetailEvent} />
        </div>
      </aside>

      {/* Main Calendar */}
      <main className="mc-main">
        {/* Header */}
        <div className="mc-header">
          <div className="mc-header-nav">
            <button type="button" onClick={prevMonth} className="mc-nav-btn"><ChevronLeft size={18} /></button>
            <h2 className="mc-month-title">{MONTHS[month - 1]} {year}</h2>
            <button type="button" onClick={nextMonth} className="mc-nav-btn"><ChevronRight size={18} /></button>
          </div>
          <div className="mc-header-actions">
            <button type="button" onClick={goToday} className="mc-today-btn">Today</button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="mc-grid">
          {/* Weekday headers */}
          <div className="mc-grid-header">
            {WEEKDAYS.map(w => (
              <div key={w} className="mc-grid-header-cell">{w}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="mc-grid-body">
            {loading ? (
              <div className="mc-loading">
                <div className="mc-spinner" />
                <span>Loading activities…</span>
              </div>
            ) : (
              gridCells.map((cell, i) => {
                if (cell.empty) return <div key={i} className="mc-cell mc-cell--empty" />;
                const selected = selectedDay === cell.day;
                return (
                  <div
                    key={i}
                    className={`mc-cell${selected ? ' selected' : ''}${isToday(year, month, cell.day) ? ' today' : ''}`}
                    onClick={() => { setSelectedDay(cell.day); setDetailEvent(null); }}
                  >
                    <div className={`mc-cell-day${isToday(year, month, cell.day) ? ' is-today' : ''}`}>
                      {cell.day}
                    </div>
                    <div className="mc-cell-events">
                      {cell.events.slice(0, 3).map(ev => (
                        <EventCard key={ev.id} event={ev} onClick={setDetailEvent} />
                      ))}
                      {cell.events.length > 3 && (
                        <div className="mc-more">
                          +{cell.events.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Detail Panel (right side) */}
      {detailEvent && (
        <EventDetailPanel event={detailEvent} onClose={() => setDetailEvent(null)} />
      )}
    </div>
    </div>
  );
}

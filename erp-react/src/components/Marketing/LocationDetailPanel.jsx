import { useCallback, useEffect, useState, useRef } from 'react';
import {
  X, Building2, MapPin, Phone, Route, Users, CalendarDays,
  ChevronRight, ChevronLeft, Copy, ExternalLink, Camera, Share,
  Save as SaveIcon, AlertTriangle, Plus, Image as ImageIcon,
  Map, Globe, Tag, Layers, Info, Activity,
  MoreHorizontal, Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../Common';
import marketingService from '../../services/marketingService';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import './location-detail-panel.css';

// ============================== Helpers ==============================

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtINR(value) {
  if (value == null || value === '' || value === 0) return '₹0';
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ============================== Photo Carousel ==============================

function PhotoCarousel({ photos, onPhotoClick }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => { setActiveIndex(0); }, [photos]);

  const touchStart = useRef(null);
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStart.current == null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && activeIndex < photos.length - 1) setActiveIndex(i => i + 1);
      else if (diff < 0 && activeIndex > 0) setActiveIndex(i => i - 1);
    }
    touchStart.current = null;
  };

  if (photos.length === 0) {
    return (
      <div className="ldp-no-photos">
        <ImageIcon size={32} className="text-slate-300" />
        <span>No photos available</span>
      </div>
    );
  }

  return (
    <div className="ldp-carousel-wrap">
      <div className="ldp-carousel-container" ref={containerRef}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="ldp-carousel-track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {photos.map((img, i) => (
            <div key={img.id || i} className="ldp-carousel-slide">
              <img src={img.uri || img.url || img} alt={img.caption || `Photo ${i + 1}`}
                onClick={() => onPhotoClick?.(img)} draggable={false} />
            </div>
          ))}
        </div>
        {photos.length > 1 && (
          <>
            {activeIndex > 0 && (
              <button className="ldp-carousel-arrow left" onClick={(e) => { e.stopPropagation(); setActiveIndex(i => i - 1); }}>
                <ChevronLeft size={18} />
              </button>
            )}
            {activeIndex < photos.length - 1 && (
              <button className="ldp-carousel-arrow right" onClick={(e) => { e.stopPropagation(); setActiveIndex(i => i + 1); }}>
                <ChevronRight size={18} />
              </button>
            )}
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="ldp-carousel-indicators">
          {photos.map((_, i) => (
            <button key={i} className={`ldp-indicator ${i === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(i)} aria-label={`Photo ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================== Main Component ==============================

export default function LocationDetailPanel({ location, onClose, onRefresh }) {
  const toast = useToast();
  const navigate = useNavigate();

  const locationIdRef = useRef(null);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('visit-summary');
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  // The panel lives on the Map page, so its writes are the map area's actions.
  // UI gating only — the backend re-checks map.upload / map.delete.
  const { can: canMapAction } = useMarketingAccess();
  const canUploadPhoto = canMapAction('map', 'upload');
  const canDeleteMap = canMapAction('map', 'delete');

  const [updates, setUpdates] = useState([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesError, setUpdatesError] = useState('');

  const [aboutInfo, setAboutInfo] = useState(null);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutError, setAboutError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setSummary(null);
    setLoading(true);
    setLoadError('');
    setPhotoPreview(null);
    setUpdates([]);
    setUpdatesError('');
    setAboutInfo(null);
    setAboutError('');
    setActiveTab('visit-summary');
    locationIdRef.current = location?.id;
  }, [location?.id, location?.type]);

  const loadSummary = useCallback(() => {
    if (!location?.id) return;
    const currentId = location.id;
    const currentType = location.type || 'marketing_location';
    setLoading(true);
    setLoadError('');

    marketingService.getLocationSummary(currentId, currentType)
      .then(data => { if (locationIdRef.current === currentId) setSummary(data); })
      .catch(err => { if (locationIdRef.current === currentId) { setLoadError(err?.message || 'Unable to load location information.'); setSummary(null); } })
      .finally(() => { if (locationIdRef.current === currentId) setLoading(false); });
  }, [location?.id, location?.type]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const [photos, setPhotos] = useState([]);
  useEffect(() => {
    if (!location?.id) { setPhotos([]); return; }
    const currentId = location.id;
    const currentType = location.type || 'marketing_location';
    let cancelled = false;
    (async () => {
      try {
        const photoData = await marketingService.getEntityPhotos(currentId, currentType);
        if (!cancelled && locationIdRef.current === currentId) setPhotos(Array.isArray(photoData) ? photoData : []);
      } catch { if (!cancelled && locationIdRef.current === currentId) setPhotos([]); }
    })();
    return () => { cancelled = true; };
  }, [location?.id, location?.type]);

  useEffect(() => {
    if (activeTab !== 'updates' || !location?.id) return;
    const currentId = location.id;
    const currentType = location.type || 'marketing_location';
    setUpdatesLoading(true);
    setUpdatesError('');
    marketingService.getEntityUpdates(currentId, currentType)
      .then(data => { if (locationIdRef.current === currentId) setUpdates(Array.isArray(data) ? data : []); })
      .catch(err => { if (locationIdRef.current === currentId) { setUpdatesError(err?.message || 'Failed to load updates'); setUpdates([]); } })
      .finally(() => { if (locationIdRef.current === currentId) setUpdatesLoading(false); });
  }, [activeTab, location?.id, location?.type, reloadKey]);

  useEffect(() => {
    if (activeTab !== 'about' || !location?.id) return;
    const currentId = location.id;
    const currentType = location.type || 'marketing_location';
    setAboutLoading(true);
    setAboutError('');
    marketingService.getEntityAbout(currentId, currentType)
      .then(data => { if (locationIdRef.current === currentId) setAboutInfo(data); })
      .catch(err => { if (locationIdRef.current === currentId) { setAboutError(err?.message || 'Failed to load about information'); setAboutInfo(null); } })
      .finally(() => { if (locationIdRef.current === currentId) setAboutLoading(false); });
  }, [activeTab, location?.id, location?.type, reloadKey]);

  const handlePhotoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !location?.id) return;
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) { toast.error('Only PNG, JPG, and JPEG files are supported'); return; }
    setUploading(true);
    try {
      const result = await marketingService.uploadLocationPhoto(location.id, file, location.type);
      if (result) { setPhotos(prev => [...prev, result]); toast.success('Photo uploaded'); }
    } catch (err) { toast.error(err?.message || 'Failed to upload photo'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }, [location?.id, location?.type, toast]);

  const handlePhotoDelete = useCallback(async (photo, idx) => {
    if (!location?.id || !photo?.id) return;
    if (!window.confirm('Delete this photo?')) return;
    try {
      await marketingService.deleteLocationPhoto(location.id, photo.id, location.type);
      setPhotos(prev => prev.filter((_, i) => i !== idx));
      toast.success('Photo deleted');
    } catch (err) { toast.error(err?.message || 'Failed to delete photo'); }
  }, [location?.id, location?.type, toast]);

  const handleDirections = useCallback(() => {
    if (!location?.latitude || !location?.longitude) { toast.error('Location coordinates not available'); return; }
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const name = encodeURIComponent(location.name || 'Location');
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${name}`, '_blank');
  }, [location, toast]);

  const handleCall = useCallback(() => {
    const phone = location?.phone || summary?.lastVisit?.phone;
    if (phone) window.open(`tel:${phone}`, '_self');
    else toast.info('No phone number available for this location');
  }, [location, summary, toast]);

  const handleShare = useCallback(async () => {
    const shareData = { title: location?.name || 'Location Details', text: `${location?.name || ''}\n${location?.address || ''}`, url: window.location.href };
    if (navigator.share) { try { await navigator.share(shareData); } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`); toast.success('Location details copied to clipboard'); } catch { toast.info('Sharing not available on this device'); } }
  }, [location, toast]);

  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    if (!location?.id) return;
    const saved = JSON.parse(localStorage.getItem('mkt_saved_locations') || '[]');
    setIsSaved(saved.some(s => s.id === location.id && s.type === location.type));
  }, [location?.id, location?.type]);

  const handleSave = useCallback(() => {
    if (!location?.id) return;
    const saved = JSON.parse(localStorage.getItem('mkt_saved_locations') || '[]');
    const exists = saved.findIndex(s => s.id === location.id && s.type === location.type);
    if (exists >= 0) { saved.splice(exists, 1); setIsSaved(false); toast.info('Location removed from saved'); }
    else { saved.push({ id: location.id, type: location.type, name: location.name }); setIsSaved(true); toast.success('Location saved'); }
    localStorage.setItem('mkt_saved_locations', JSON.stringify(saved));
  }, [location, toast]);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e) => { if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setShowMoreMenu(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  const handleCopyCoords = useCallback(async () => {
    if (location?.latitude && location?.longitude) { try { await navigator.clipboard.writeText(`${location.latitude}, ${location.longitude}`); toast.success('Coordinates copied'); } catch { toast.error('Failed to copy coordinates'); } }
    setShowMoreMenu(false);
  }, [location, toast]);

  const handleOpenInMaps = useCallback(() => {
    if (!location?.latitude || !location?.longitude) { toast.error('Location coordinates not available'); return; }
    window.open(`https://www.google.com/maps/search/?api=1&query=${Number(location.latitude)},${Number(location.longitude)}`, '_blank');
    setShowMoreMenu(false);
  }, [location, toast]);

  const handleDeleteLocation = useCallback(async () => {
    if (!window.confirm(`Delete "${location?.name}"? This cannot be undone.`)) return;
    try { await marketingService.deleteMarketingLocation(location.id); toast.success('Location deleted'); setShowMoreMenu(false); onClose(); if (onRefresh) onRefresh(); }
    catch (err) { toast.error(err?.message || 'Failed to delete location'); }
  }, [location, toast, onClose, onRefresh]);

  const handleAddVisit = useCallback(() => {
    const params = new URLSearchParams();
    if (location?.name) params.set('company', location.name);
    if (location?.address) params.set('address', location.address);
    if (location?.city) params.set('city', location.city);
    if (location?.latitude) params.set('lat', String(location.latitude));
    if (location?.longitude) params.set('lng', String(location.longitude));
    if (location?.phone) params.set('phone', location.phone);
    if (location?.contactPerson) params.set('contact', location.contactPerson);
    navigate('/marketing');
  }, [location, navigate]);

  const handleOpenVisit = useCallback((visitId) => { navigate(`/marketing/visits/${visitId}/edit`); }, [navigate]);
  const handleViewVisitHistory = useCallback(() => { navigate('/marketing/visits'); }, [navigate]);

  const summary_ = summary;
  const lastVisit = summary_?.lastVisit;
  const upcomingVisit = summary_?.upcomingVisit;
  const totalVisits = summary_?.totalVisits || 0;
  const plannedVisits = summary_?.plannedVisits || 0;
  const completedVisits = summary_?.completedVisits || 0;
  const cancelledVisits = summary_?.cancelledVisits || 0;
  const assignedTo = summary_?.assignedTo || '';
  const totalExpenses = summary_?.totalExpenses || 0;
  const recentVisits = summary_?.recentVisits || [];

  const TYPE_LABELS = { customer: 'Customer', qform: 'Q Form Location', travel_stop: 'Travel Stop', marketing_location: 'Marketing Location', marketer: 'Marketer' };
  const typeLabel = TYPE_LABELS[location?.type] || location?.type || '';

  if (!location) return null;

  return (
    <>
      {/* Photo Preview Modal */}
      {photoPreview && (
        <div className="ldp-photo-preview-overlay" onClick={() => setPhotoPreview(null)}>
          <div className="ldp-photo-preview-content" onClick={e => e.stopPropagation()}>
            <button className="ldp-photo-preview-close" onClick={() => setPhotoPreview(null)}><X size={20} /></button>
            <img src={photoPreview.uri || photoPreview.url || photoPreview} alt={photoPreview.caption || ''} />
          </div>
        </div>
      )}

      {/* Floating card overlay */}
      <div className="ldp-card">
        {/* ===== PHOTO CAROUSEL ===== */}
        {photos.length > 0 && (
          <div className="ldp-photo-section">
            <PhotoCarousel photos={photos} onPhotoClick={(img) => setPhotoPreview(img)} />
          </div>
        )}

        {/* ===== HEADER ===== */}
        <div className="ldp-card-header">
          <div className="ldp-card-header-row">
            <span className="ldp-card-type">{typeLabel}</span>
            <button className="ldp-card-close" onClick={onClose} aria-label="Close details">
              <X size={18} />
            </button>
          </div>
          <h2 className="ldp-card-name">{location.name || 'Location Details'}</h2>
          {location.address && (
            <div className="ldp-card-address">
              <MapPin size={13} />
              <span>{location.address}</span>
            </div>
          )}
          {(location.status || location.city) && (
            <div className="ldp-card-meta-row">
              {location.status && <span className="ldp-card-status">{location.status}</span>}
              {location.city && <span className="ldp-card-city">{location.city}</span>}
            </div>
          )}
        </div>

        {/* ===== ACTION ROW ===== */}
        <div className="ldp-action-row">
          <button type="button" className="ldp-action-btn" onClick={handleDirections}>
            <Route size={16} /><span>Directions</span>
          </button>
          <button type="button" className="ldp-action-btn" onClick={handleCall}>
            <Phone size={16} /><span>Call</span>
          </button>
          <button type="button" className="ldp-action-btn" onClick={handleShare}>
            <Share size={16} /><span>Share</span>
          </button>
          <button type="button" className={`ldp-action-btn${isSaved ? ' saved' : ''}`} onClick={handleSave}>
            <SaveIcon size={16} /><span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>
          <div className="ldp-more-wrapper" ref={moreMenuRef}>
            <button type="button" className="ldp-action-btn" onClick={() => setShowMoreMenu(v => !v)}>
              <MoreHorizontal size={16} /><span>More</span>
            </button>
            {showMoreMenu && (
              <div className="ldp-more-dropdown">
                <button className="ldp-more-item" onClick={handleCopyCoords}><Copy size={14} /> Copy Coordinates</button>
                <button className="ldp-more-item" onClick={handleOpenInMaps}><ExternalLink size={14} /> Open in Maps</button>
                <button className="ldp-more-item" onClick={handleAddVisit}><CalendarDays size={14} /> Add Visit</button>
                {location?.type === 'marketing_location' && canDeleteMap && (
                  <button className="ldp-more-item danger" onClick={handleDeleteLocation}><Trash2 size={14} /> Delete Location</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="ldp-tabs">
          {[
            { key: 'visit-summary', label: 'VISIT SUMMARY' },
            { key: 'photos', label: 'PHOTOS' },
            { key: 'directory', label: 'DIRECTORY' },
            { key: 'updates', label: 'UPDATES' },
            { key: 'about', label: 'ABOUT' },
          ].map(tab => (
            <button key={tab.key}
              className={`ldp-tab-btn${activeTab === tab.key ? ' ldp-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== TAB PANEL ===== */}
        <div className="ldp-tab-panel">

          {/* --- Visit Summary Tab --- */}
          {activeTab === 'visit-summary' && (
            <div className="ldp-tab-content">
              {loading ? (
                <div className="ldp-loading-panel"><div className="ldp-spinner" /></div>
              ) : loadError ? (
                <div className="ldp-error-panel">
                  <AlertTriangle size={20} className="text-amber-500" />
                  <p>{loadError}</p>
                  <button className="ldp-retry-btn" onClick={loadSummary}>Retry</button>
                </div>
              ) : (
                <>
                  <div className="ldp-summary-card">
                    <div className="ldp-summary-row">
                      <span className="ldp-summary-label">Total Visits</span>
                      <span className="ldp-summary-value">{totalVisits}</span>
                    </div>
                    <div className="ldp-summary-row">
                      <span className="ldp-summary-label">Last Visit</span>
                      <span className="ldp-summary-value">{lastVisit?.scheduleDate ? fmtDate(lastVisit.scheduleDate) : '—'}</span>
                    </div>
                    <div className="ldp-summary-row">
                      <span className="ldp-summary-label">Last Visit Status</span>
                      <span className="ldp-summary-value ldp-status-text" data-status={lastVisit?.visitStatus || 'Planned'}>
                        {lastVisit?.visitStatus || 'Planned'}
                      </span>
                    </div>
                    <div className="ldp-summary-row">
                      <span className="ldp-summary-label">Upcoming Visit</span>
                      <span className="ldp-summary-value">{upcomingVisit?.scheduleDate ? fmtDate(upcomingVisit.scheduleDate) : '—'}</span>
                    </div>
                    <div className="ldp-summary-row">
                      <span className="ldp-summary-label">Assigned Marketer</span>
                      <span className="ldp-summary-value">{assignedTo || '—'}</span>
                    </div>
                    <div className="ldp-summary-row">
                      <span className="ldp-summary-label">Total Marketing Expenses</span>
                      <span className="ldp-summary-value ldp-expense-value">{fmtINR(totalExpenses)}</span>
                    </div>
                    <div className="ldp-visit-breakdown">
                      <div className="ldp-breakdown-item">
                        <span className="ldp-breakdown-dot" style={{ background: '#d97706' }} />
                        <span className="ldp-breakdown-label">Planned</span>
                        <span className="ldp-breakdown-count">{plannedVisits}</span>
                      </div>
                      <div className="ldp-breakdown-item">
                        <span className="ldp-breakdown-dot" style={{ background: '#059669' }} />
                        <span className="ldp-breakdown-label">Completed</span>
                        <span className="ldp-breakdown-count">{completedVisits}</span>
                      </div>
                      <div className="ldp-breakdown-item">
                        <span className="ldp-breakdown-dot" style={{ background: '#dc2626' }} />
                        <span className="ldp-breakdown-label">Cancelled</span>
                        <span className="ldp-breakdown-count">{cancelledVisits}</span>
                      </div>
                    </div>
                  </div>

                  <div className="ldp-recent-section">
                    <div className="ldp-recent-header">
                      <span className="ldp-recent-title">Recent Visits</span>
                      {recentVisits.length > 0 && (
                        <button className="ldp-view-all-btn" onClick={handleViewVisitHistory}>View All</button>
                      )}
                    </div>
                    {recentVisits.length === 0 ? (
                      <div className="ldp-empty-state">
                        <CalendarDays size={24} className="text-slate-300" />
                        <p>No visits recorded yet</p>
                      </div>
                    ) : (
                      <div className="ldp-recent-list">
                        {recentVisits.map((visit, i) => (
                          <div key={visit.id || i} className="ldp-recent-row" onClick={() => visit.id && handleOpenVisit(visit.id)}>
                            <div className="ldp-recent-left">
                              <span className="ldp-recent-date">{visit.scheduleDate ? fmtDate(visit.scheduleDate) : '—'}</span>
                              <span className="ldp-recent-status" data-status={visit.visitStatus || 'Planned'}>{visit.visitStatus || 'Planned'}</span>
                            </div>
                            <div className="ldp-recent-right">
                              <span className="ldp-recent-lead">{visit.marketer || visit.purpose || ''}</span>
                              <ChevronRight size={14} className="ldp-recent-arrow" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="ldp-add-visit-section">
                    <button className="ldp-add-visit-btn" onClick={handleAddVisit}>
                      <Plus size={14} /> Add Marketing Visit
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* --- Photos Tab --- */}
          {activeTab === 'photos' && (
            <div className="ldp-tab-content">
              <div className="ldp-photo-upload-row">
                <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                {canUploadPhoto && (
                  <>
                    <button className="ldp-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <Plus size={13} /> {uploading ? 'Uploading…' : 'Upload Photo'}
                    </button>
                    <span className="ldp-upload-hint">PNG, JPG or JPEG</span>
                  </>
                )}
              </div>
              {photos.length === 0 ? (
                <div className="ldp-empty-state">
                  <Camera size={24} className="text-slate-300" />
                  <p>No photos available for this location</p>
                  <p className="ldp-empty-hint">{canUploadPhoto ? 'Upload a photo using the button above' : 'No photos uploaded'}</p>
                </div>
              ) : (
                <div className="ldp-photo-gallery">
                  {photos.map((img, i) => (
                    <div key={img.id || i} className="ldp-gallery-item" onClick={() => setPhotoPreview(img)}>
                      <img src={img.uri || img.url || img} alt={img.caption || ''} />
                      <div className="ldp-gallery-overlay">
                        <span>{img.source || 'Photo'}</span>
                        {img.id && canDeleteMap && (
                          <button className="ldp-gallery-delete" onClick={(e) => { e.stopPropagation(); handlePhotoDelete(img, i); }}>×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* --- Directory Tab --- */}
          {activeTab === 'directory' && (
            <div className="ldp-tab-content">
              <div className="ldp-dir-card">
                <div className="ldp-dir-header">
                  <Building2 size={16} className="ldp-dir-icon" />
                  <span className="ldp-dir-name">{location.name || 'Location Details'}</span>
                </div>
                {location.address && (
                  <div className="ldp-dir-row">
                    <MapPin size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">Address</span>
                      <span className="ldp-dir-value">{location.address}</span>
                    </div>
                  </div>
                )}
                {location.phone && (
                  <div className="ldp-dir-row">
                    <Phone size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">Phone</span>
                      <span className="ldp-dir-value ldp-dir-link" onClick={handleCall}>{location.phone}</span>
                    </div>
                    <button className="ldp-dir-action" onClick={handleCall}>Call</button>
                  </div>
                )}
                {location.latitude && location.longitude && (
                  <div className="ldp-dir-row">
                    <MapPin size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">Coordinates</span>
                      <span className="ldp-dir-value">{Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}</span>
                    </div>
                    <button className="ldp-dir-action" onClick={handleCopyCoords}>Copy</button>
                  </div>
                )}
                {location.contactPerson && (
                  <div className="ldp-dir-row">
                    <Users size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">Contact Person</span>
                      <span className="ldp-dir-value">{location.contactPerson}</span>
                    </div>
                  </div>
                )}
                {location.customerName && (
                  <div className="ldp-dir-row">
                    <Building2 size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">ERP Customer</span>
                      <span className="ldp-dir-value">{location.customerName}</span>
                    </div>
                  </div>
                )}
                {location.referenceNumber && (
                  <div className="ldp-dir-row">
                    <Tag size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">Reference</span>
                      <span className="ldp-dir-value">{location.referenceNumber}</span>
                    </div>
                  </div>
                )}
                {location.city && (
                  <div className="ldp-dir-row">
                    <Map size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">City</span>
                      <span className="ldp-dir-value">{location.city}</span>
                    </div>
                  </div>
                )}
                {location.state && (
                  <div className="ldp-dir-row">
                    <Globe size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">State</span>
                      <span className="ldp-dir-value">{location.state}</span>
                    </div>
                  </div>
                )}
                {location.type && (
                  <div className="ldp-dir-row">
                    <Layers size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">Type</span>
                      <span className="ldp-dir-value">{typeLabel}</span>
                    </div>
                  </div>
                )}
                {location.plantName && (
                  <div className="ldp-dir-row">
                    <Building2 size={13} className="ldp-dir-icon" />
                    <div className="ldp-dir-content">
                      <span className="ldp-dir-label">Plant Name</span>
                      <span className="ldp-dir-value">{location.plantName}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- Updates Tab --- */}
          {activeTab === 'updates' && (
            <div className="ldp-tab-content">
              {updatesLoading ? (
                <div className="ldp-loading-panel"><div className="ldp-spinner" /></div>
              ) : updatesError ? (
                <div className="ldp-error-panel">
                  <AlertTriangle size={20} className="text-amber-500" />
                  <p>{updatesError}</p>
                  <button className="ldp-retry-btn" onClick={() => setReloadKey(k => k + 1)}>Retry</button>
                </div>
              ) : updates.length === 0 ? (
                <div className="ldp-empty-state">
                  <Activity size={24} className="text-slate-300" />
                  <p>No updates or activity recorded yet</p>
                  <p className="ldp-empty-hint">Updates appear here as visits and follow-ups are logged</p>
                </div>
              ) : (
                <div className="ldp-updates-list">
                  {updates.map((update, i) => (
                    <div key={update.id || i} className="ldp-update-item">
                      <div className="ldp-update-dot" style={{
                        background: update.type === 'visit' ? '#059669' : update.activityType === 'followup' ? '#0B4A3D' : '#7c3aed'
                      }} />
                      <div className="ldp-update-content">
                        <div className="ldp-update-header">
                          <span className="ldp-update-type">
                            {update.type === 'visit' ? `Visit — ${update.visitNo || ''}` : `${update.activityType === 'followup' ? 'Follow-up' : 'Extension'}`}
                          </span>
                          <span className="ldp-update-date">{fmtDate(update.date || update.createdAt)}</span>
                        </div>
                        {update.visitStatus && (
                          <span className="ldp-update-status" data-status={update.visitStatus}>{update.visitStatus}</span>
                        )}
                        {update.outcome && <div className="ldp-update-detail"><span className="ldp-update-label">Outcome:</span> {update.outcome}</div>}
                        {update.discussion && <div className="ldp-update-detail ldp-update-text">{update.discussion.length > 500 ? update.discussion.slice(0, 500) + '…' : update.discussion}</div>}
                        {update.remarks && <div className="ldp-update-detail ldp-update-text">{update.remarks.length > 500 ? update.remarks.slice(0, 500) + '…' : update.remarks}</div>}
                        {update.marketer && <div className="ldp-update-meta"><span>By: {update.marketer}</span></div>}
                        {update.followupType && <div className="ldp-update-meta"><span>Type: {update.followupType}</span>{update.status && <span> · Status: {update.status}</span>}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* --- About Tab --- */}
          {activeTab === 'about' && (
            <div className="ldp-tab-content">
              {aboutLoading ? (
                <div className="ldp-loading-panel"><div className="ldp-spinner" /></div>
              ) : aboutError ? (
                <div className="ldp-error-panel">
                  <AlertTriangle size={20} className="text-amber-500" />
                  <p>{aboutError}</p>
                  <button className="ldp-retry-btn" onClick={() => setReloadKey(k => k + 1)}>Retry</button>
                </div>
              ) : aboutInfo ? (
                <div className="ldp-about-card">
                  <div className="ldp-about-header">
                    <Info size={16} className="ldp-about-icon" />
                    <span className="ldp-about-title">Location Information</span>
                  </div>
                  {[
                    { label: 'Type', value: aboutInfo.typeLabel },
                    { label: aboutInfo.type === 'customer' ? 'Company Name' : aboutInfo.type === 'qform' ? 'Plant Name' : 'Location Name', value: aboutInfo.name },
                    { label: 'Address', value: aboutInfo.address },
                    { label: 'City', value: aboutInfo.city },
                    { label: 'State', value: aboutInfo.state },
                    { label: 'Pincode', value: aboutInfo.pincode },
                    { label: 'Phone', value: aboutInfo.phone },
                    { label: 'Email', value: aboutInfo.email },
                    { label: 'Contact Person', value: aboutInfo.contactPerson },
                    { label: 'Customer', value: aboutInfo.customerName },
                    { label: 'Location Category', value: aboutInfo.locationType },
                    { label: 'Status', value: aboutInfo.status },
                    { label: 'Coordinates', value: aboutInfo.latitude && aboutInfo.longitude ? `${Number(aboutInfo.latitude).toFixed(6)}, ${Number(aboutInfo.longitude).toFixed(6)}` : null },
                    { label: 'Marketer', value: aboutInfo.marketer },
                    { label: 'Client Code', value: aboutInfo.clientCode },
                    { label: 'Visit Reference', value: aboutInfo.marketingVisitReference },
                    { label: 'Remarks', value: aboutInfo.remarks },
                    { label: 'Created', value: aboutInfo.createdAt ? fmtDateTime(aboutInfo.createdAt) : null },
                    { label: 'Last Updated', value: aboutInfo.updatedAt ? fmtDateTime(aboutInfo.updatedAt) : null },
                  ].filter(row => row.value).map((row, i) => (
                    <div key={i} className="ldp-about-row">
                      <span className="ldp-about-label">{row.label}</span>
                      <span className="ldp-about-value">{row.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ldp-empty-state">
                  <Info size={24} className="text-slate-300" />
                  <p>No information available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

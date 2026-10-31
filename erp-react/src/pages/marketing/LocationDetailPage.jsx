import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, MapPin } from 'lucide-react';
import LocationDetailPanel from '../../components/Marketing/LocationDetailPanel';
import marketingService from '../../services/marketingService';
import useAsyncData from '../../hooks/useAsyncData';

/**
 * Standalone Marketing Location detail page.
 *
 * Destination for a Marketing Map marker click: the map navigates here with the
 * entity `type` and the REAL backend id (MapLocationResponse.id = the source
 * row's primary key), and this page re-fetches the record from the API. Map
 * state is never used as the source of truth, so opening Location B can never
 * show Location A's data.
 *
 * The detail UI itself is the existing reusable `LocationDetailPanel` — the same
 * component the map used to float over the map. Nothing is duplicated here; the
 * panel owns its own summary / photos / updates / about fetching.
 */

const TYPE_LABELS = {
  customer: 'Customer',
  qform: 'Q Form Location',
  travel_stop: 'Travel Stop',
  marketing_location: 'Marketing Location',
  marketer: 'Marketer'
};

export default function LocationDetailPage() {
  const { type, id } = useParams();
  const navigate = useNavigate();

  const locationType = type || 'marketing_location';
  const locationId = Number(id);
  const validId = Number.isFinite(locationId) && locationId > 0;

  /**
   * Loads the record straight from the API for the id in the URL.
   * `getEntityAbout` is the canonical full-record endpoint for every map entity
   * type; a marketing location additionally exposes the map reference (ML-<id>)
   * through the map endpoint. Both are existing APIs — nothing new was added.
   */
  const fetcher = useCallback(async () => {
    if (!validId) throw new Error('Invalid location URL.');

    const [about, mapRow] = await Promise.all([
      marketingService.getEntityAbout(locationId, locationType),
      locationType === 'marketing_location'
        ? marketingService
            .getMarketingLocation(locationId)
            .then((res) => res?.data ?? res)
            .catch(() => null)
        : Promise.resolve(null)
    ]);

    if (!about || (!about.name && !mapRow?.name)) {
      throw new Error('This location could not be found. It may have been removed.');
    }

    return {
      id: locationId,
      type: locationType,
      name: about.name || mapRow?.name || '',
      address: about.address || mapRow?.address || '',
      city: about.city || mapRow?.city || '',
      state: about.state || mapRow?.state || '',
      status: about.status || mapRow?.status || '',
      phone: about.phone || mapRow?.phone || '',
      email: about.email || mapRow?.email || '',
      contactPerson: about.contactPerson || mapRow?.contactPerson || '',
      customerName: about.customerName || mapRow?.customerName || '',
      plantName: about.plantName || mapRow?.plantName || '',
      referenceNumber: mapRow?.referenceNumber || '',
      latitude: about.latitude ?? mapRow?.latitude ?? null,
      longitude: about.longitude ?? mapRow?.longitude ?? null
    };
  }, [locationId, locationType, validId]);

  const { data: location, loading, error, refresh } = useAsyncData(fetcher, {
    fallbackData: null,
    deps: [locationId, locationType, validId]
  });

  /** Canonical destination — the ERP Marketing Map route, not history-only. */
  const backToMap = useCallback(() => navigate('/marketing/map'), [navigate]);

  const typeLabel = TYPE_LABELS[locationType] || locationType;

  return (
    <div className="ldp-page purchase-page cpr-page">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <span className="flex items-center gap-2">
            <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>
              Dashboard
            </button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <button type="button" className="bc-link" onClick={() => navigate('/marketing')}>
              Marketing
            </button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <button type="button" className="bc-link" onClick={backToMap}>
              Marketing Map
            </button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <span className="bc-current">{location?.name || typeLabel}</span>
          </span>
        </nav>
        <button type="button" className="erp-detail-action" onClick={backToMap}>
          <ArrowLeft /> Back to Map
        </button>
      </div>

      {loading ? (
        <div className="prm-card prm-card-body">
          <p className="text-xs text-slate-400 font-medium py-10 text-center">Loading location details…</p>
        </div>
      ) : error || !location ? (
        /* The error branch wins over any previously loaded record, so a failed
           fetch can never leave a different location's details on screen. */
        <div className="prm-card prm-card-body">
          <div className="py-10 text-center">
            <MapPin size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">
              {error?.message || 'Unable to load this location.'}
            </p>
            <div className="erp-detail-actions justify-center mt-4">
              <button type="button" className="erp-detail-action" onClick={refresh}>
                Retry
              </button>
              <button type="button" className="erp-detail-action" onClick={backToMap}>
                <ArrowLeft /> Back to Map
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Keyed by id so switching locations fully remounts the panel instead of
           reusing the previous record's photos / visits / summary state. */
        <LocationDetailPanel
          key={`${locationType}-${locationId}`}
          location={location}
          onClose={backToMap}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

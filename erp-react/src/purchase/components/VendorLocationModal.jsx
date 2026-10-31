/**
 * purchase/components/VendorLocationModal.jsx
 * ------------------------------------------------------------------
 * "Vendor Location" modal — read-only map view opened from the Vendor
 * Detail (Overview) page.
 *
 * Reuses the interactive Leaflet map from the Vendor Edit page
 * (OfficeLocationSection) verbatim — no map logic is duplicated here.
 * The section receives ONLY the stored location data:
 *
 *     latitude · longitude · formattedAddress
 *
 * Everything requirement 3 asks for comes from that reused section:
 * the vendor marker, zoom controls, coordinates chip, reverse-geocoded
 * address field, Copy Coordinates and Open Google Maps buttons are all
 * rendered inside the modal by the section itself.
 *
 * The single modal-specific addition is the live "Current zoom level"
 * readout, fed by the section's optional `onZoomChange` observer. That
 * observer is the only extra prop — it carries no location data and the
 * edit form never uses it, keeping the location-data contract at
 * exactly three props.
 *
 * The heavy Leaflet map only mounts while the modal is open: the Modal
 * renders its children only when `open` is true, and the host page
 * mounts this component lazily on demand — so the Overview page never
 * renders the map directly.
 *
 * NOTE: the embedded map stays interactive (click/drag/search) per the
 * "preserve existing map functionality" requirement; with no
 * write-back handler it only changes the local view and never persists
 * anything to the vendor record.
 * ------------------------------------------------------------------
 */
import { useState } from 'react';
import { MapPin, MapPinned } from 'lucide-react';
import { Button, Modal } from './ui';
import OfficeLocationSection from './OfficeLocationSection';

export default function VendorLocationModal({
  open,
  onClose,
  latitude = null,
  longitude = null,
  formattedAddress = ''
}) {
  /* Live zoom reported by the shared map (see onZoomChange). The map
     mounts fresh on every open, so this starts empty until the map
     reports its initial zoom. */
  const [zoom, setZoom] = useState(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#0A4F44]" aria-hidden="true" />
          Vendor Location
        </span>
      }
      maxWidth="max-w-3xl"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {/* Reused map from the Vendor Edit page — only location data flows in. */}
      <OfficeLocationSection
        latitude={latitude}
        longitude={longitude}
        formattedAddress={formattedAddress}
        onZoomChange={setZoom}
      />

      {/* Live zoom readout — reported by the shared map's zoomend. */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <MapPinned className="w-3.5 h-3.5 text-[#0A4F44]" aria-hidden="true" />
          Current Zoom Level
        </span>
        <span className="text-xs font-bold text-slate-800 font-mono">{zoom ?? '—'}</span>
      </div>
    </Modal>
  );
}

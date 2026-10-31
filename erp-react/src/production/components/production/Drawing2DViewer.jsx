import { useEffect, useMemo, useState } from 'react';
import Icon from '../icons/Icon';
import api from '../../../api/axiosInstance';
import {
  capabilityLabel,
  extensionLabel,
  previewMime,
  previewMode,
  previewUnavailableReason,
} from '../../utils/drawingFormats';

/**
 * Drawing2DViewer — in-app preview for a Production → Drawings record.
 *
 * Drawings-only: it never routes a 2D file into the 3D Models viewer and shares
 * nothing with the CAD conversion pipeline. The file is fetched through the
 * authenticated axios instance (the same way the list already does) so the
 * bearer token, not a public URL, authorises the read; the bytes are then
 * materialised as a local object URL with the file's real MIME type.
 *
 * Rendering is capability-driven (see utils/drawingFormats):
 *   document (PDF)          → embedded by the browser's own PDF engine
 *   image (SVG/PNG/JPG/…)   → <img> with zoom + scroll-to-pan
 *   anything else           → explicit "stored, no renderer" panel + download
 * A preview is never faked: if the platform cannot render the format, the panel
 * says so and offers the stored original instead.
 */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export default function Drawing2DViewer({ record, onClose, onDownload }) {
  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');
  const [objectUrl, setObjectUrl] = useState(null);
  const [zoom, setZoom] = useState(1);

  const mode = useMemo(() => previewMode(record), [record]);
  const ext = useMemo(() => extensionLabel(record), [record]);
  const canRender = mode !== 'download';

  useEffect(() => {
    /* Stored-only formats never fetch: renderBody() reports the capability
       directly, so there is no state to reset here. */
    if (!record?.id || !canRender) return undefined;
    let cancelled = false;

    (async () => {
      setState('loading');
      setErrorMessage('');
      setObjectUrl(null);
      try {
        const resp = await api.get(`/drawings/${record.id}/file`, { responseType: 'blob' });
        if (cancelled) return;
        const raw = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
        if (!raw || raw.size === 0) throw new Error('The stored file is empty.');
        /* Materialise with the format's real MIME type: the browser needs it to
           pick the PDF engine / image decoder (the endpoint serves a generic
           content type for non-image formats). */
        const mime = previewMime(record) || raw.type || 'application/octet-stream';
        const typed = raw.type === mime ? raw : new Blob([raw], { type: mime });
        const url = URL.createObjectURL(typed);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setObjectUrl(url);
        setZoom(1);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err?.response?.status === 404
          ? 'The drawing file was not found on the server.'
          : (err?.message || 'Failed to load the drawing file.'));
        setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [record, canRender]);

  /*
   * Release the blob once the DOM has moved on to the next URL (or the viewer
   * unmounts). Keying the cleanup on the URL itself means the <img>/<iframe>
   * never carries a src that has already been revoked — revoking early makes
   * the browser log a net::ERR_FILE_NOT_FOUND for the stale request.
   */
  useEffect(() => {
    if (!objectUrl) return undefined;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!record) return null;

  const zoomIn = () => setZoom((z) => ZOOM_STEPS.find((s) => s > z) ?? z);
  const zoomOut = () => setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? z);

  const renderBody = () => {
    if (!canRender) {
      return (
        <div className="dm-empty" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <Icon name="info" size={22} />
          <p style={{ marginTop: 10, fontWeight: 600 }}>No in-app preview for {ext}</p>
          <p style={{ marginTop: 6, opacity: 0.8, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            {previewUnavailableReason(record)}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => onDownload?.(record)}
          >
            <Icon name="download" size={13} /> Download {record.fileName || 'file'}
          </button>
        </div>
      );
    }

    if (state === 'loading') {
      return <div className="dm-empty" style={{ padding: 40 }}>Loading drawing…</div>;
    }

    if (state === 'error') {
      return (
        <div className="dm-empty" style={{ padding: 40 }}>
          <p style={{ fontWeight: 600 }}>Unable to open the drawing</p>
          <p style={{ marginTop: 6, opacity: 0.8 }}>{errorMessage}</p>
        </div>
      );
    }

    if (state !== 'ready' || !objectUrl) {
      return <div className="dm-empty" style={{ padding: 40 }}>Preparing preview…</div>;
    }

    if (mode === 'document') {
      return (
        <iframe
          title={`${record.drawingNumber || 'Drawing'} — ${record.fileName || ''}`}
          src={objectUrl}
          style={{ width: '100%', height: '72vh', border: 0, background: '#fff' }}
        />
      );
    }

    /* image: zoom with Ctrl-free buttons, pan through the container's scroll. */
    return (
      <div
        style={{
          height: '72vh',
          overflow: 'auto',
          background: '#eef1f4',
          display: 'block',
          textAlign: 'center',
        }}
      >
        <img
          src={objectUrl}
          alt={record.fileName || 'Drawing'}
          onError={() => {
            setErrorMessage('The browser could not decode this image.');
            setState('error');
          }}
          style={{
            width: `${zoom * 100}%`,
            maxWidth: 'none',
            display: 'inline-block',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(15,23,42,0.12)',
          }}
        />
      </div>
    );
  };

  return (
    <div
      className="dm-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="dm-modal" style={{ maxWidth: 1100, width: '94vw' }}>
        <div className="dm-modal-header">
          <div>
            <h3 style={{ margin: 0 }}>
              {record.drawingNumber || record.fileName || `Drawing #${record.id}`}
              <span className="badge" style={{ marginLeft: 8 }}>{ext}</span>
            </h3>
            <small style={{ opacity: 0.75 }}>
              {[record.drawingRevision || record.revision, record.workOrderNumber || record.workOrderId, capabilityLabel(record)]
                .filter(Boolean).join(' · ')}
            </small>
          </div>
          <button type="button" className="btn-icon" onClick={() => onClose?.()}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="dm-modal-body" style={{ padding: 0 }}>
          {renderBody()}
        </div>

        <div className="dm-modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 12 }}>
          {state === 'ready' && mode === 'image' && (
            <span style={{ marginRight: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={zoomOut} aria-label="Zoom out">−</button>
              <span style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={zoomIn} aria-label="Zoom in">+</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoom(1)}>Reset</button>
            </span>
          )}
          {state === 'ready' && mode === 'document' && (
            <a
              className="btn btn-ghost btn-sm"
              style={{ marginRight: 'auto' }}
              href={objectUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
          )}
          {canRender && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDownload?.(record)}>
              <Icon name="download" size={13} /> Download
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onClose?.()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

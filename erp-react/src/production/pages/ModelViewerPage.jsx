/**
 * ModelViewerPage — ERP host for the Mech R&D 3D viewer.
 *
 * The central 3D experience is the ACTUAL Mech R&D viewer implementation
 * (src/production/modelviewer/ModelDrawingViewer3D.jsx and its cad/* helpers),
 * copied from Mech-rnd.zip. It owns:
 *   - the Three.js scene, renderer, camera, OrbitControls and lighting
 *   - CAD parsing / geometry creation (OCCT WASM worker, GLB/GLTF/OBJ/STL)
 *   - camera fitting, standard views, wireframe, section cut and measurement
 *   - model hierarchy, part selection, hover highlighting and cleanup
 *
 * The ERP continues to own everything around it:
 *   - the /model-viewer route and application shell
 *   - authentication / authorization (all access goes through the
 *     authenticated axios instance — no public file URLs)
 *   - the model record and its metadata
 *   - the existing model file API (the original file is fetched through the
 *     authenticated download endpoint and handed to the viewer as a blob URL)
 *   - the server-side CAD conversion JOB for proprietary formats (submit,
 *     poll, cancel — never a synchronous wait)
 *
 * Format routing:
 *
 *   GLB / GLTF / OBJ / STL        → browser → three.js loaders          → scene
 *   STEP / STP / IGES / IGS / BREP → browser → OCCT WASM in a Worker   → scene
 *   SLDPRT / SLDASM / SAT         → POST /models/{id}/cad-conversion
 *                                   (202 { jobId }) → poll GET /cad-conversion/{jobId}
 *                                   → COMPLETED: authenticated GET /models/{id}/3d
 *                                   → GLB blob → the SAME Mech R&D viewer
 *                                   → FAILED/UNSUPPORTED: honest reason, no fake geometry
 *
 * The conversion itself runs in an ISOLATED CAD worker process behind the
 * ERP's JWT; this page never talks to any conversion server directly.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import ModelDrawingViewer3D from '../modelviewer/ModelDrawingViewer3D.jsx';
import './ModelViewer3DPage.css';
import './ModelViewerMechRndHost.css';

/* Formats the browser-only viewer renders with no server involved. */
const BROWSER_VIEWABLE_EXTS = new Set([
  'glb', 'gltf', 'obj', 'stl',            // direct three.js loaders
  'step', 'stp', 'iges', 'igs', 'brep',   // OCCT WASM worker
]);

/* Formats that need the server-side CAD conversion job (isolated worker). */
const SERVER_CONVERT_EXTS = new Set(['sldprt', 'sldasm', 'sat']);

/* Job states that keep the poll loop alive. Terminal states stop it. */
const ACTIVE_JOB_STATUSES = new Set(['QUEUED', 'PROCESSING']);

/* Poll cadence for an in-flight conversion job. Deliberately modest: state
   changes at most QUEUED → PROCESSING → terminal, so 2.5 s is plenty responsive
   without hammering the API (override with VITE_CAD_POLL_MS). */
const CAD_POLL_MS = Number(import.meta.env?.VITE_CAD_POLL_MS) > 0
  ? Number(import.meta.env.VITE_CAD_POLL_MS)
  : 2500;

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/* ApiResponse envelope → the user-safe message inside, if any. */
function apiMessage(err, fallback) {
  const data = err?.response?.data;
  return data?.message || data?.error || fallback;
}

/*
 * The ERP client publishes EVERY non-401 API error to a global provider that
 * replaces the whole page with an error page. The CAD job flow has expected
 * non-2xx answers ("no job yet", "preview not available"), so those statuses
 * are resolved locally instead:
 *   - 404 / 409  → expected state of this feature, handled inline
 *   - 403        → the viewer explains it in place
 *   - 401        → still rejected, so the global refresh/sign-out flow runs
 *   - 5xx / network → still rejected, so real outages keep their normal page
 */
const TOLERATED_STATUS = (status) =>
  (status >= 200 && status < 300) || status === 403 || status === 404 || status === 409;

export default function ModelViewerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [modelRecord, setModelRecord] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadState, setDownloadState] = useState('idle');

  // Server-side CAD conversion job state (SLDPRT / SLDASM / SAT).
  const [cadJob, setCadJob] = useState(null);
  const [cadBootstrapped, setCadBootstrapped] = useState(false);
  const [cadSubmitting, setCadSubmitting] = useState(false);
  const [cadError, setCadError] = useState(null);
  const cadPollingRef = useRef(false);

  // Backend capability state — the single source of truth for what the panel
  // may promise. Mirrors the Mech R&D reference behaviour, which pre-flights
  // the conversion service (GET /cad-api/health → isLocalConverterAvailable)
  // and distinguishes "engine not configured" from "server not running" from
  // "conversion failed" instead of showing one generic unsupported message.
  // The ERP equivalent is the authenticated GET /v1/cad-conversion/health.
  const [cadCapability, setCadCapability] = useState(null);

  const objectUrlRef = useRef(null);

  const fileType = (modelRecord?.fileType || '').toString().replace('.', '').toUpperCase();
  const extension = (modelRecord?.fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
    || fileType.toLowerCase();
  /* Proprietary formats → authenticated server conversion job (never faked). */
  const isServerCad = Boolean(extension) && SERVER_CONVERT_EXTS.has(extension);

  /* The BACKEND is the authority on whether a renderable preview exists. A model
     can be READY with NO cad_conversion_jobs row: the upload path converts
     in-process (ModelService.requestConversion) and that only updates
     models.conversion_status. Deciding the panel from the job table alone made
     it flap between "Model ready" and "needs a server-side conversion" for the
     same unchanged file, so the model's own status is a first-class signal. */
  const modelConversionStatus = String(modelRecord?.conversionStatus || '').toUpperCase();
  const modelPreviewReady = modelConversionStatus === 'READY';
  const convertedReady = modelPreviewReady || cadJob?.status === 'COMPLETED';

  // ── Resolve the ERP model record (by numeric id or model number) ──
  useEffect(() => {
    let cancelled = false;
    async function fetchModel() {
      setLoading(true);
      setError(null);
      try {
        const isNumericId = /^\d+$/.test(id);
        const url = isNumericId
          ? `/models/${id}`
          : `/models/by-model-number/${encodeURIComponent(id)}`;
        const resp = await api.get(url);
        const payload = resp.data;
        if (cancelled) return;
        if ((payload?.ok || payload?.success) && payload.data) {
          setModelRecord(payload.data);
        } else {
          setError('Model not found.');
        }
      } catch (err) {
        if (!cancelled) setError(`Failed to load model: ${err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) fetchModel();
    return () => { cancelled = true; };
  }, [id]);

  // ── Fetch the ACTUAL model file through the authenticated ERP API ──
  // The original bytes are re-used unchanged; a blob: object URL is handed to
  // the Mech R&D viewer so it never needs an unauthenticated/public URL.
  // Server-converted formats skip this: their ORIGINAL bytes are never rendered;
  // the converted GLB is fetched instead (see the COMPLETED effect below).
  useEffect(() => {
    if (!modelRecord?.id || isServerCad) return undefined;
    let cancelled = false;
    setFileUrl(null);
    (async () => {
      try {
        const resp = await api.get(`/models/${modelRecord.id}/download`, { responseType: 'blob' });
        if (cancelled) return;
        const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setFileUrl(url);
      } catch (err) {
        if (!cancelled) setError(`Failed to load the model file: ${err.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [modelRecord?.id, isServerCad]);

  // ── Bootstrap any existing conversion job (browser refresh / re-entry) ──
  // Resumes polling an in-flight job instead of submitting a duplicate one,
  // and reads the backend's capability state so the panel never promises a
  // conversion the server cannot actually perform.
  useEffect(() => {
    if (!isServerCad || !modelRecord?.id) return undefined;
    let cancelled = false;
    setCadBootstrapped(false);
    setCadJob(null);
    setCadError(null);
    setCadCapability(null);
    (async () => {
      try {
        // 200 with data:null means "this model has never been converted" — a
        // normal first visit, not an error. (The ERP client turns any non-401
        // API error into a full-page error, so the API answers 200 here.)
        const resp = await api.get(`/cad-conversion/model/${modelRecord.id}`, {
          validateStatus: TOLERATED_STATUS,
        });
        const job = resp.data?.data;
        if (!cancelled && job) setCadJob(job);
      } catch (err) {
        if (!cancelled && err.response?.status !== 404) {
          setCadError(apiMessage(err, 'Could not read the conversion status.'));
        }
      }
      try {
        // Capability comes from the backend (engine matrix + worker heartbeat),
        // never from the file extension. A refusal must survive a refresh: the
        // backend refuses admission without creating a job row, so without this
        // state the UI would flip back to a "Convert" button on every reload.
        const cap = await api.get('/cad-conversion/health', {
          validateStatus: TOLERATED_STATUS,
        });
        if (!cancelled) setCadCapability(cap.data?.data || null);
      } catch (err) {
        if (!cancelled) setCadCapability(null);
      } finally {
        if (!cancelled) setCadBootstrapped(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isServerCad, modelRecord?.id]);

  // ── Poll an in-flight job; stop on terminal states or unmount ──
  useEffect(() => {
    if (!isServerCad || !cadJob?.jobId || !ACTIVE_JOB_STATUSES.has(cadJob.status)) {
      return undefined;
    }
    let cancelled = false;
    cadPollingRef.current = true;
    const jobId = cadJob.jobId;

    async function tick() {
      if (cancelled || cadPollingRef.current === false) return;
      // One request in flight at a time: a slow response can never stack up.
      if (tick.busy) return;
      tick.busy = true;
      try {
        const resp = await api.get(`/cad-conversion/${jobId}`, {
          validateStatus: TOLERATED_STATUS,
        });
        const job = resp.data?.data;
        if (resp.status === 404) {
          // Job expired by retention — stop asking about it.
          if (!cancelled) setCadJob(null);
          cadPollingRef.current = false;
          return;
        }
        if (!cancelled && job) setCadJob(job);
      } catch (err) {
        // Transient failure (network/5xx): keep the last known state; the next
        // tick retries. Real outages still surface through the normal flow.
      } finally {
        tick.busy = false;
      }
    }

    const timer = setInterval(tick, CAD_POLL_MS);
    tick();
    return () => {
      cancelled = true;
      cadPollingRef.current = false;
      clearInterval(timer);
    };
  }, [isServerCad, cadJob?.jobId, cadJob?.status]);

  // ── Preview ready → fetch the converted GLB (authenticated) → viewer ──
  // Fires for a COMPLETED job OR for a model the backend already reports READY
  // (the upload path converts in-process and leaves no cad_conversion_jobs row,
  // so the job table alone must never decide whether a preview is shown).
  useEffect(() => {
    if (!isServerCad || !convertedReady || !modelRecord?.id) return undefined;
    let cancelled = false;
    setFileUrl(null);
    (async () => {
      try {
        const resp = await api.get(`/models/${modelRecord.id}/3d`, {
          responseType: 'blob',
          validateStatus: TOLERATED_STATUS,
        });
        if (cancelled) return;
        if (resp.status >= 400) {
          // Typed JSON error body (blob response type): 409 not-ready / 404
          // missing file — the model needs converting again.
          setCadError('The converted preview is no longer available. Convert the model again.');
          return;
        }
        const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setFileUrl(url);
        setCadError(null);
      } catch (err) {
        if (!cancelled) {
          setCadError(apiMessage(err,
            'The converted preview is no longer available. Convert the model again.'));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isServerCad, convertedReady, modelRecord?.id]);

  // Revoke the object URL on unmount so the blob is never leaked.
  useEffect(() => () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // ── Queue a conversion (never waits for the conversion itself) ──
  const submitConversion = useCallback(async () => {
    if (!modelRecord?.id) return;
    setCadSubmitting(true);
    setCadError(null);
    try {
      const resp = await api.post(`/models/${modelRecord.id}/cad-conversion`, null, {
        validateStatus: TOLERATED_STATUS,
      });
      if (resp.status >= 400) {
        // Tolerated 403/404/409: the API's own message explains it (e.g. a
        // missing model, or no permission to queue conversions).
        setCadError(resp.data?.message || 'The conversion could not be queued.');
        return;
      }
      const payload = resp.data?.data;
      if (payload && payload.jobId) {
        // 202 — queued; the poll loop takes over.
        setCadJob(payload);
      } else if (payload && payload.accepted === false) {
        // 200 with a refusal: engine unavailable / disabled / too large /
        // queue full — rendered inline, and the job list stays empty.
        setCadError(payload.message || 'The conversion could not be queued.');
      } else {
        setCadError(resp.data?.message || 'The conversion could not be queued.');
      }
    } catch (err) {
      // Real faults only (auth, validation, server error). Never a stack trace.
      setCadError(apiMessage(err, 'The conversion could not be queued.'));
    } finally {
      setCadSubmitting(false);
    }
  }, [modelRecord?.id]);

  // ── Cancel a job that has not started yet ──
  const cancelConversion = useCallback(async () => {
    if (!cadJob?.jobId) return;
    try {
      const resp = await api.post(`/cad-conversion/${cadJob.jobId}/cancel`);
      const job = resp.data?.data;
      if (job) setCadJob(job);
    } catch (err) {
      setCadError(apiMessage(err, 'The job could not be cancelled.'));
    }
  }, [cadJob?.jobId]);

  const handleDownload = useCallback(async () => {
    if (!modelRecord) return;
    setDownloadState('busy');
    try {
      const resp = await api.get(`/models/${modelRecord.id}/download`, { responseType: 'blob' });
      const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = modelRecord.fileName || `model-${modelRecord.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadState('done');
    } catch (err) {
      console.error('Download failed:', err);
      setDownloadState('error');
    }
  }, [modelRecord]);

  const handleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const handleClose = useCallback(() => {
    navigate('/production/models');
  }, [navigate]);

  /* File name handed to the viewer for a converted preview — must end in .glb
     so the Mech R&D viewer takes its direct three.js GLTFLoader path. */
  const convertedFileName = `${(modelRecord?.fileName || `model-${modelRecord?.id}`).replace(/\.[^.]+$/, '')}.glb`;

  /* True while the server-converted panel should show activity (not the viewer). */
  const cadPanelVisible = isServerCad && !fileUrl;
  const cadJobActive = Boolean(cadJob && ACTIVE_JOB_STATUSES.has(cadJob.status));
  const cadJobFailed = Boolean(cadJob && (cadJob.status === 'FAILED' || cadJob.status === 'CANCELLED'));

  /* Capability for THIS file's format, as declared by the backend
     (GET /cad-conversion/health → engines[ext] + workerOnline). One
     authoritative state instead of the UI guessing from the extension:
       - no capability read        → cannot promise anything
       - engine missing            → honest "engine not configured" state
       - engine present, worker off→ "service unavailable" state
       - both present              → "Convert to 3D Preview" is real. */
  const capEngine = cadCapability?.engines?.[extension] || null;
  const engineReady = Boolean(capEngine?.available);
  const workerOnline = Boolean(cadCapability?.workerOnline);
  const convertReady = engineReady && workerOnline;

  return (
    <div className="mv3d-page">
      {/* ═══ ERP SHELL TOOLBAR (model identity + page-level actions) ═══ */}
      <div className="mv3d-toolbar">
        <div className="mv3d-toolbar-left">
          <span className="mv3d-toolbar-title">3D Viewer</span>
          <span className="mv3d-separator" />
          {modelRecord && (
            <>
              <span className="mv3d-badge mv3d-badge-file" title="File name">
                {modelRecord.fileName || '—'}
              </span>
              {fileType && (
                <span className="mv3d-badge mv3d-badge-type" title="File type">{fileType}</span>
              )}
              <span className="mv3d-badge mv3d-badge-rev" title="Revision">
                {modelRecord.modelRevision || 'Rev A'}
              </span>
              {modelRecord.modelNumber && (
                <span className="mv3d-badge mv3d-badge-model" title="Model number">
                  {modelRecord.modelNumber}
                </span>
              )}
              {modelRecord.workOrderId && (
                <span className="mv3d-badge mv3d-badge-wo" title="Work order">
                  WO: {modelRecord.workOrderId}
                </span>
              )}
              {isServerCad && cadJob && (
                <span
                  className={`mv3d-badge ${cadJob.status === 'FAILED' || cadJob.status === 'CANCELLED'
                    ? 'mv3d-badge-type' : 'mv3d-badge-model'}`}
                  title="CAD conversion job status"
                >
                  {cadJob.status === 'COMPLETED' ? 'PREVIEW READY' : `CONVERSION: ${cadJob.status}`}
                </span>
              )}
            </>
          )}
        </div>
        <div className="mv3d-toolbar-right">
          <button
            type="button"
            className="mv3d-btn mv3d-btn-download"
            onClick={handleDownload}
            title="Download Original File"
          >
            {downloadState === 'busy' ? 'Downloading…' : 'Download'}
          </button>
          <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleFullscreen} title="Fullscreen">
            Full
          </button>
          <button type="button" className="mv3d-btn-close" onClick={handleClose} title="Close Viewer (Esc)">
            ×
          </button>
        </div>
      </div>

      {/* ═══ MECH-R&D VIEWER (central, owns rendering + engineering tools) ═══ */}
      <div className="mv3d-viewport mv3d-mr-host">
        {error && (
          <div className="mv3d-empty-viewport">
            <div className="mv3d-empty-icon">3D</div>
            <div className="mv3d-empty-text">Unable to Display 3D Model</div>
            <div className="mv3d-empty-detail">{error}</div>
            {modelRecord && (
              <div className="mv3d-empty-meta">
                <div className="mv3d-empty-row"><span>File:</span> <strong>{modelRecord.fileName}</strong></div>
                <div className="mv3d-empty-row"><span>Type:</span> <strong>{fileType || '—'}</strong></div>
                <div className="mv3d-empty-row"><span>Size:</span> <strong>{formatBytes(modelRecord.fileSize)}</strong></div>
              </div>
            )}
          </div>
        )}

        {/* ── SLDPRT / SLDASM / SAT: conversion job panel ───────────────── */}
        {!error && cadPanelVisible && modelRecord && (
          <div className="mv3d-empty-viewport">
            <div className="mv3d-empty-icon">3D</div>

            {!cadBootstrapped && (
              <>
                <div className="mv3d-spinner" />
                <div className="mv3d-empty-detail" style={{ marginTop: 10 }}>
                  Checking the conversion status…
                </div>
              </>
            )}

            {cadBootstrapped && cadJobActive && (
              <>
                <div className="mv3d-spinner" />
                <div className="mv3d-empty-text" style={{ color: '#e2e8f0' }}>
                  {cadJob.status === 'QUEUED' ? 'Conversion queued…' : 'Converting to a 3D preview…'}
                </div>
                <div className="mv3d-empty-detail">
                  The server is converting this file to GLB with its CAD engine. This runs
                  asynchronously in an isolated worker — you can leave this page and come back;
                  the job resumes here automatically.
                </div>
                <div className="mv3d-empty-meta">
                  <div className="mv3d-empty-row"><span>Job:</span> <strong>{cadJob.jobId?.slice(0, 8)}…</strong></div>
                  <div className="mv3d-empty-row"><span>Status:</span> <strong>{cadJob.status}</strong></div>
                  {cadJob.engine && (
                    <div className="mv3d-empty-row"><span>Engine:</span> <strong>{cadJob.engine}</strong></div>
                  )}
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  {cadJob.status === 'QUEUED' && (
                    <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={cancelConversion}>
                      Cancel
                    </button>
                  )}
                  <button type="button" className="mv3d-btn mv3d-btn-download" onClick={handleDownload}>
                    Download Original File
                  </button>
                </div>
              </>
            )}

            {cadBootstrapped && !cadJob && !cadError && !convertedReady && convertReady && (
              <>
                <div className="mv3d-empty-text" style={{ color: '#e2e8f0' }}>
                  {extension ? `.${extension.toUpperCase()}` : 'This file'} needs a server-side conversion
                </div>
                <div className="mv3d-empty-detail">
                  Proprietary CAD geometry cannot be decoded in the browser. The ERP converts this
                  file to a GLB preview on the server using an isolated CAD worker, then shows it in
                  the same 3D viewer. Nothing is faked and no placeholder model is ever displayed —
                  if the engine cannot read the file, you will see the real reason.
                </div>
                <div className="mv3d-empty-meta">
                  <div className="mv3d-empty-row"><span>File:</span> <strong>{modelRecord.fileName}</strong></div>
                  <div className="mv3d-empty-row"><span>Type:</span> <strong>{fileType || '—'}</strong></div>
                  <div className="mv3d-empty-row"><span>Size:</span> <strong>{formatBytes(modelRecord.fileSize)}</strong></div>
                  {modelRecord.modelNumber && (
                    <div className="mv3d-empty-row"><span>Model:</span> <strong>{modelRecord.modelNumber}</strong></div>
                  )}
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-download"
                    onClick={submitConversion}
                    disabled={cadSubmitting}
                    title="Queue a server-side conversion"
                  >
                    {cadSubmitting ? 'Queuing…' : 'Convert to 3D Preview'}
                  </button>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-tool"
                    onClick={handleDownload}
                    disabled={downloadState === 'busy'}
                  >
                    {downloadState === 'busy' ? 'Downloading…' : 'Download Original File'}
                  </button>
                  <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleClose}>
                    Close
                  </button>
                </div>
              </>
            )}

            {/* Engine not configured for this format — the backend's own reason,
                shown instead of a Convert button that could only be refused. */}
            {cadBootstrapped && !cadJob && !cadError && !convertedReady && !convertReady && cadCapability && !engineReady && (
              <>
                <div className="mv3d-empty-text" style={{ color: '#e2e8f0' }}>
                  3D conversion is currently unavailable because the CAD conversion engine is not configured.
                </div>
                <div className="mv3d-empty-detail">
                  {(capEngine?.message) || cadCapability?.cadmpeg?.message
                    || 'No conversion engine is configured on this server for this file format.'}
                </div>
                <div className="mv3d-empty-meta">
                  <div className="mv3d-empty-row"><span>File:</span> <strong>{modelRecord.fileName}</strong></div>
                  <div className="mv3d-empty-row"><span>Type:</span> <strong>{fileType || '—'}</strong></div>
                  <div className="mv3d-empty-row"><span>Size:</span> <strong>{formatBytes(modelRecord.fileSize)}</strong></div>
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-tool"
                    onClick={handleDownload}
                    disabled={downloadState === 'busy'}
                  >
                    {downloadState === 'busy' ? 'Downloading…' : 'Download Original File'}
                  </button>
                  <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleClose}>
                    Close
                  </button>
                </div>
              </>
            )}

            {/* Engine configured but the isolated worker is offline — offering
                Convert would only strand a QUEUED job no one will claim. */}
            {cadBootstrapped && !cadJob && !cadError && !convertedReady && !convertReady && cadCapability && engineReady && !workerOnline && (
              <>
                <div className="mv3d-empty-text" style={{ color: '#e2e8f0' }}>
                  3D conversion service is currently unavailable.
                </div>
                <div className="mv3d-empty-detail">
                  The conversion engine is configured, but the isolated CAD worker that runs it is
                  not reporting in. Start the CAD worker on the server, then reopen this page.
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-tool"
                    onClick={handleDownload}
                    disabled={downloadState === 'busy'}
                  >
                    {downloadState === 'busy' ? 'Downloading…' : 'Download Original File'}
                  </button>
                  <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleClose}>
                    Close
                  </button>
                </div>
              </>
            )}

            {/* Capability unknown (health endpoint unreachable): keep the button —
                the backend remains the authority and its refusal renders inline. */}
            {cadBootstrapped && !cadJob && !cadError && !convertedReady && !convertReady && !cadCapability && (
              <>
                <div className="mv3d-empty-text" style={{ color: '#e2e8f0' }}>
                  {extension ? `.${extension.toUpperCase()}` : 'This file'} needs a server-side conversion
                </div>
                <div className="mv3d-empty-detail">
                  Conversion availability could not be verified just now — attempting the
                  conversion will ask the server and show its real answer.
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-download"
                    onClick={submitConversion}
                    disabled={cadSubmitting}
                  >
                    {cadSubmitting ? 'Queuing…' : 'Convert to 3D Preview'}
                  </button>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-tool"
                    onClick={handleDownload}
                    disabled={downloadState === 'busy'}
                  >
                    {downloadState === 'busy' ? 'Downloading…' : 'Download Original File'}
                  </button>
                  <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleClose}>
                    Close
                  </button>
                </div>
              </>
            )}

            {cadBootstrapped && cadJobFailed && (
              <>
                <div className="mv3d-empty-text" style={{ color: '#fecaca' }}>
                  Conversion {cadJob.status === 'CANCELLED' ? 'cancelled' : 'failed'}
                </div>
                <div className="mv3d-empty-detail">
                  {cadJob.message || 'The CAD engine could not convert this file.'}
                </div>
                <div className="mv3d-empty-meta">
                  <div className="mv3d-empty-row"><span>File:</span> <strong>{modelRecord.fileName}</strong></div>
                  <div className="mv3d-empty-row"><span>Type:</span> <strong>{fileType || '—'}</strong></div>
                  <div className="mv3d-empty-row"><span>Job:</span> <strong>{cadJob.jobId?.slice(0, 8)}…</strong></div>
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-download"
                    onClick={submitConversion}
                    disabled={cadSubmitting}
                  >
                    {cadSubmitting ? 'Queuing…' : 'Try Conversion Again'}
                  </button>
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-tool"
                    onClick={handleDownload}
                    disabled={downloadState === 'busy'}
                  >
                    Download Original File
                  </button>
                  <button type="button" className="mv3d-btn mv3d-btn-tool" onClick={handleClose}>
                    Close
                  </button>
                </div>
              </>
            )}

            {/* Refusal (engine unavailable / disabled / too large) or a
                converted preview that could not be fetched. */}
            {cadError && (
              <div className="mv3d-empty-detail" style={{ marginTop: 12, color: '#fca5a5', maxWidth: 560 }}>
                {cadError}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {!cadJobFailed && !cadJobActive && (
                    <button
                      type="button"
                      className="mv3d-btn mv3d-btn-download"
                      onClick={submitConversion}
                      disabled={cadSubmitting}
                    >
                      {cadSubmitting ? 'Queuing…' : 'Retry Conversion'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="mv3d-btn mv3d-btn-tool"
                    onClick={handleDownload}
                    disabled={downloadState === 'busy'}
                  >
                    Download Original File
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!error && !isServerCad && !fileUrl && (
          <div className="mv3d-viewport-overlay">
            <div className="mv3d-spinner" />
            <div style={{ color: '#93c5fd', fontSize: 12 }}>
              {loading ? 'Loading model record…' : 'Loading model file…'}
            </div>
          </div>
        )}

        {/* Supported formats (and completed conversions) → the Mech R&D viewer:
            OCCT WASM worker for STEP/IGES/BREP, direct three.js loaders for
            GLB/GLTF/OBJ/STL — a converted preview arrives as a .glb blob. */}
        {!error && fileUrl && modelRecord && (
          <ModelDrawingViewer3D
            url={fileUrl}
            fileName={isServerCad ? convertedFileName : (modelRecord.fileName || `model-${modelRecord.id}`)}
            onDownload={handleDownload}
            downloadState={downloadState}
            onClose={handleClose}
            design={{
              name: modelRecord.itemName,
              projectId: modelRecord.workOrderId,
            }}
          />
        )}
      </div>
    </div>
  );
}

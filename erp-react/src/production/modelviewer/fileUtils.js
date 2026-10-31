/**
 * components/drawings/fileUtils.js
 * ---------------------------------------------------------------------------
 * Safe file helpers for the CAD / Drawings preview feature. No business
 * logic — purely presentation-level file handling utilities.
 *
 * Attachment contract (as produced by addAttachment / file pickers):
 *   { name, url, size?, type?, uploadedAt? }
 * `url` may be: an https(s) link, a blob:/objectURL, or a data: URL.
 * ---------------------------------------------------------------------------
 */

/* Detect a well-formed http(s) URL (used to separate links from ids/paths). */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/* Extension without the leading dot, lowercase, or '' if none. */
export function fileExtension(nameOrUrl = '') {
  const clean = String(nameOrUrl).split(/[?#]/)[0];
  const m = clean.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

/* Base file name from a URL path or a plain name — decodes URI parts. */
export function fileNameFromUrl(url = '') {
  try {
    const path = String(url).split(/[?#]/)[0];
    const last = path.substring(path.lastIndexOf('/') + 1);
    return last ? decodeURIComponent(last) : '';
  } catch {
    return '';
  }
}

/* Resolve the display name for an attachment, preserving extension. */
export function attachmentDisplayName(att = {}) {
  if (att.name) return String(att.name);
  const fromUrl = fileNameFromUrl(att.url || att.href || '');
  return fromUrl || 'drawing-file';
}

/* MIME type for an extension (only types the preview flow needs). */
const MIME_BY_EXT = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

export function mimeForExtension(ext) {
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/* -------------------------------------------------------------------------- */
/* File-type classification for the supported 2D drawing set                  */
/* -------------------------------------------------------------------------- */

export const DRAWING_FILE_KINDS = {
  PDF: 'pdf',
  IMAGE: 'image',
  DXF: 'dxf',
  MODEL_3D: '3d',
  CAD: 'cad',
  UNKNOWN: 'unknown',
};

const PDF_EXTS = ['pdf'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg'];
/* Real DXF rendering (dxf-parser → canvas), per the Designing reference. */
const DXF_EXTS = ['dxf'];
/* 3D formats renderable by the ported ModelDrawingViewer3D (browser-only):
   three.js-direct (glb/gltf/obj/stl) + OCCT WASM (step/stp/iges/igs/brep).
   SLDPRT/SLDASM and SAT have no browser renderer in this deployment (there is
   no CAD conversion server) and are handled by the ERP host's honest
   "3D browser preview is not available for this format" fallback. */
const MODEL_3D_EXTS = ['glb', 'gltf', 'obj', 'stl', 'step', 'stp', 'iges', 'igs', 'brep', 'sldprt', 'sldasm', 'sat'];
/* CAD formats with NO browser renderer (per the reference capability matrix).
   SLDDRW is a SolidWorks Drawing (2D) — not a 3D model. It requires
   conversion to PDF/SVG for browser preview; native rendering is not possible. */
const CAD_EXTS = ['dwg', 'slddrw'];

export function classifyDrawingFile(ext) {
  /* Detection is by EXTENSION and case-insensitive: browsers give SolidWorks
     files a generic MIME type, so the extension is authoritative
     (karthi.SLDPRT, KARTHI.sldprt, assembly.SLDASM, drawing.SLDDRW …). */
  const e = String(ext || '').toLowerCase();
  if (PDF_EXTS.includes(e)) return DRAWING_FILE_KINDS.PDF;
  if (IMAGE_EXTS.includes(e)) return DRAWING_FILE_KINDS.IMAGE;
  if (DXF_EXTS.includes(e)) return DRAWING_FILE_KINDS.DXF;
  if (MODEL_3D_EXTS.includes(e)) return DRAWING_FILE_KINDS.MODEL_3D;
  if (CAD_EXTS.includes(e)) return DRAWING_FILE_KINDS.CAD;
  return DRAWING_FILE_KINDS.UNKNOWN;
}

export const PREVIEW_SUPPORTED_EXTS = [...PDF_EXTS, ...IMAGE_EXTS, ...DXF_EXTS, ...MODEL_3D_EXTS];
export const MODEL_3D_EXTENSIONS = MODEL_3D_EXTS;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (n == null || isNaN(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* -------------------------------------------------------------------------- */
/* Object URL lifecycle (blob: previews must be revoked to avoid leaks)       */
/* -------------------------------------------------------------------------- */

export function createObjectUrl(blob) {
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function revokeObjectUrl(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}

/* -------------------------------------------------------------------------- */
/* Session drawing-file registry                                              */
/* -------------------------------------------------------------------------- */

/*
 * Application state stores attachments as plain objects ({ name, url, size…
 * }), so an uploaded File object would otherwise be garbage-collected and its
 * blob: URL would die mid-session. This registry keeps the ORIGINAL File
 * strongly referenced (in memory only — nothing is persisted or transformed),
 * so preview and download keep working for the whole session.
 */
const drawingFileStore = new Map();

export function storeDrawingFile(file) {
  const id = `DF-${Math.random().toString(36).slice(2, 10)}`;
  const objectUrl = createObjectUrl(file);
  drawingFileStore.set(id, { file, objectUrl });
  return { id, objectUrl };
}

export function getStoredDrawing(id) {
  return drawingFileStore.get(id) || null;
}

/* Best-effort live URL for an attachment: registry first, stored URL second. */
export function resolveObjectUrl(att) {
  if (!att) return null;
  if (att.fileId) {
    const entry = drawingFileStore.get(att.fileId);
    if (entry?.objectUrl) return entry.objectUrl;
  }
  return att.url || null;
}

/* -------------------------------------------------------------------------- */
/* Fetching (CORS-tolerant for preview purposes)                              */
/* -------------------------------------------------------------------------- */

/*
 * Fetch an attachment as a Blob. Returns { ok, blob?, objectUrl?, error? }.
 * Cross-origin CDNs without CORS headers still work for the DOWNLOAD path
 * (direct anchor) but not for in-page rendering; callers use `ok` to show
 * the error state instead of a broken viewer.
 */
export async function fetchFileFromUrl(url) {
  if (!url) return { ok: false, error: 'missing-url' };
  if (url.startsWith('blob:') || url.startsWith('data:')) return { ok: true, objectUrl: url };
  if (!isHttpUrl(url)) return { ok: false, error: 'invalid-url' };
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const objectUrl = createObjectUrl(blob);
    if (!objectUrl) return { ok: false, error: 'object-url-failed' };
    return { ok: true, blob, objectUrl };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'aborted' : 'network-error' };
  }
}

/* -------------------------------------------------------------------------- */
/* Download — keeps the ORIGINAL file name and extension                      */
/* -------------------------------------------------------------------------- */

function triggerAnchorDownload(href, fileName) {
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName || 'file';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    document.body.removeChild(a);
  });
}

/*
 * Download an attachment preserving its original file name + extension.
 * Strategy:
 *   1. blob:/data: URLs → anchor directly (full control of `download` name).
 *   2. Same-origin http(s) → fetch to blob, then anchor (guaranteed name).
 *   3. Cross-origin (no CORS) → anchor with url-derived name (browser may
 *      ignore `download` cross-origin; original name comes from the URL).
 */
export async function downloadAttachment(att = {}) {
  const name = attachmentDisplayName(att);
  const url = resolveObjectUrl(att);
  if (!url) {
    return { ok: false, error: 'No file is attached to this drawing record.' };
  }
  try {
    /* Uploaded this session → we hold the original File; serve it directly. */
    if (att.fileId) {
      triggerAnchorDownload(url, name);
      return { ok: true };
    }
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      triggerAnchorDownload(url, name);
      return { ok: true };
    }
    if (isHttpUrl(url)) {
      try {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const objUrl = createObjectUrl(blob);
        if (objUrl) {
          triggerAnchorDownload(objUrl, name);
          setTimeout(() => revokeObjectUrl(objUrl), 10000);
          return { ok: true };
        }
      } catch {
        /* CORS/network — fall through to direct anchor download */
      }
      triggerAnchorDownload(url, name);
      return { ok: true };
    }
    return { ok: false, error: 'The file reference is not a valid downloadable URL.' };
  } catch (err) {
    return { ok: false, error: err?.message || 'Download failed.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Fullscreen helpers (viewer header button)                                  */
/* -------------------------------------------------------------------------- */

export function enterFullscreen(el) {
  const req = el?.requestFullscreen || el?.webkitRequestFullscreen || el?.msRequestFullscreen;
  if (req) { try { req.call(el); } catch { /* ignore */ } }
}

export function exitFullscreen() {
  const ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (ex && document.fullscreenElement) { try { ex.call(document); } catch { /* ignore */ } }
}

export function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

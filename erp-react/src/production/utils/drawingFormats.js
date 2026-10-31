/**
 * drawingFormats.js — single source of truth for 2D drawing format handling in
 * Production → Drawings.
 *
 * Deliberately self-contained to this module: it shares nothing with the 3D
 * Models pipeline or its viewer. 2D drawings never leave this section.
 *
 * Capability is classified by what the PLATFORM can genuinely do, not by which
 * extensions are allowed to be uploaded:
 *
 *   document  PDF                → rendered in-app by the browser's own PDF engine
 *   image     SVG, PNG, JPG/JPEG, BMP → rendered in-app by the browser's image engine
 *   tiff      TIF, TIFF          → NO browser renderer → stored + downloadable
 *   cad       DWG, DXF, DGN      → no 2D CAD renderer/converter in this build
 *                                  (the 3D pipeline is not a 2D renderer) → stored
 *   plot      PLT, HPGL, HPG, CGM, EPS, AI → no vector/plot renderer → stored
 *
 * `previewMode(fileType)` returns 'document' | 'image' | 'download' so callers
 * never have to re-derive previewability and can never promise a preview that
 * the platform cannot produce.
 */

/* Uploadable 2D extensions — kept in sync with the backend
   DrawingService.ALLOWED_EXTENSIONS and DrawingFormPage.DRAWING_EXTENSIONS. */
export const DRAWING_EXTENSIONS = [
  '.pdf', '.dwg', '.dxf', '.dgn', '.plt', '.hpgl', '.hpg', '.cgm', '.eps', '.ai',
  '.svg', '.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.gif',
];

/** Browser-renderable raster/vector images. */
const IMAGE_EXTS = new Set(['svg', 'png', 'jpg', 'jpeg', 'bmp', 'gif']);
/** Rendered by the browser's built-in document engine. */
const DOCUMENT_EXTS = new Set(['pdf']);
/** No browser renderer (Chrome/Firefox cannot display TIFF). */
const TIFF_EXTS = new Set(['tif', 'tiff']);
/** 2D CAD formats — no 2D CAD renderer or converter exists in this build. */
const CAD_EXTS = new Set(['dwg', 'dxf', 'dgn']);
/** Plotter / technical vector graphics — no vector renderer exists here. */
const PLOT_EXTS = new Set(['plt', 'hpgl', 'hpg', 'cgm', 'eps', 'ai']);

/** MIME used when materialising an authenticated download as a local Blob. */
const MIME_BY_EXT = {
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/**
 * Resolve a record's 2D extension. Prefers the persisted fileType (the value
 * the backend validated and stored) and falls back to the file name so legacy
 * rows that only carry a name still route correctly.
 */
export function drawingExtension(record) {
  if (!record) return '';
  const raw = String(record.fileType || '').trim().toLowerCase();
  const fromType = raw.replace(/^\./, '');
  if (fromType) return fromType;
  const name = String(record.fileName || '');
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/**
 * How this drawing must be shown:
 *   'document' → in-app PDF view
 *   'image'    → in-app image view
 *   'download' → no renderer: stored + downloadable only
 */
export function previewMode(record) {
  const ext = drawingExtension(record);
  if (DOCUMENT_EXTS.has(ext)) return 'document';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'download';
}

/** True when the drawing can be rendered inside the application. */
export function canPreviewInApp(record) {
  return previewMode(record) !== 'download';
}

/** MIME for the in-app viewer's blob (null when the format has no renderer). */
export function previewMime(record) {
  return MIME_BY_EXT[drawingExtension(record)] || null;
}

/** Short badge text describing the real capability for this file. */
export function capabilityLabel(record) {
  const mode = previewMode(record);
  if (mode === 'document') return 'In-app preview (PDF)';
  if (mode === 'image') return 'In-app preview (image)';
  const ext = drawingExtension(record).toUpperCase();
  if (TIFF_EXTS.has(drawingExtension(record))) return 'Store + download only (TIFF)';
  if (CAD_EXTS.has(drawingExtension(record))) return `Store + download only (${ext} — no 2D CAD renderer)`;
  if (PLOT_EXTS.has(drawingExtension(record))) return `Store + download only (${ext} — no vector renderer)`;
  return 'Store + download only';
}

/**
 * The honest, user-facing explanation shown instead of a preview when the
 * platform has no renderer for the file. Never claims a preview.
 */
export function previewUnavailableReason(record) {
  const ext = drawingExtension(record).toUpperCase();
  if (TIFF_EXTS.has(drawingExtension(record))) {
    return `${ext} cannot be rendered by a web browser. The drawing is stored safely — download it to view it in an image application.`;
  }
  if (CAD_EXTS.has(drawingExtension(record))) {
    return `${ext} needs a 2D CAD renderer, which this deployment does not include. The drawing is stored safely — download it and open it in your CAD application.`;
  }
  if (PLOT_EXTS.has(drawingExtension(record))) {
    return `${ext} needs a vector/plot renderer, which this deployment does not include. The drawing is stored safely — download it and open it in your plot/CAD application.`;
  }
  return 'This file cannot be previewed in the application. The drawing is stored safely — download it to view it.';
}

/** Extension label for the UI (e.g. '.dwg' -> 'DWG'). */
export function extensionLabel(record) {
  const ext = drawingExtension(record);
  return ext ? ext.toUpperCase() : '—';
}

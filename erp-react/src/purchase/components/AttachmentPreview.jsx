/**
 * purchase/components/AttachmentPreview.jsx
 * ------------------------------------------------------------------
 * Enterprise Document Viewer for Purchase module.
 *
 * Single source of truth for ALL document previews across the module:
 *   AttachmentList, AttachmentManager, VendorDocuments, PurchaseDocuments
 *
 * Viewers:
 *   PDF           → embedded <iframe> with full toolbar:
 *                   page navigation, zoom in/out, fit width, fit page,
 *                   rotate, fullscreen, print, download, open-in-tab, close
 *   Image         → zoomable + rotatable image viewer:
 *                   zoom in/out, rotate, fullscreen, print, download
 *   TXT/JSON/CSV  → fetched + rendered inline (monospace <pre>)
 *   MP4/WEBM      → <video> player
 *   MP3/WAV       → <audio> player
 *
 * Everything else (XLS/XLSX, DOC/DOCX, PPT/PPTX, ZIP/RAR, …):
 *   Professional "Preview not available" panel with full file metadata,
 *   version info, source document reference, Download + Open externally.
 *
 * Guarantees:
 *   • Never shows a blank viewer
 *   • Never pretends a file is previewable when it's not
 *   • Shows clear "Preview unavailable" state with Download
 *   • Revokes temporary object URLs correctly
 *   • Handles missing/broken files gracefully
 *   • Handles large PDFs without freezing the page
 *   • Preserves existing attachments
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar, Clock, Download, ExternalLink, File, FileText,
  HardDrive, Maximize2, Minus, MoreHorizontal, Plus, Printer, RotateCcw,
  RotateCw, ZoomIn, ZoomOut
} from 'lucide-react';
import Modal from './ui/Modal';
import DocumentOperationsMenu from './DocumentOperationsMenu';
import { formatDate } from '../utils/helpers';
import {
  TYPE_TONES, canPreview, detectType, downloadAttachment,
  fileTypeLabel, formatSize, normalizeAttachment, resolveUrl
} from '../utils/attachmentFile';

/* ─── Constants ─── */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const clampZoom = (v) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));

/* ═══════════════════════════════════════════════════════════════════
   Helper: tiny toolbar button
   ═══════════════════════════════════════════════════════════════════ */
function ToolBtn({ onClick, disabled, label, children, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
        ${active
          ? 'bg-[#0B4A3D]/10 text-[#0B4A3D]'
          : 'text-slate-500 hover:text-[#0B4A3D] hover:bg-[#EDF7F4]'}`}
    >
      {children}
    </button>
  );
}

function ToolSep() {
  return <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />;
}

/* ═══════════════════════════════════════════════════════════════════
   PANEL: "Preview not available" — professional unsupported-file panel
   ═══════════════════════════════════════════════════════════════════ */
function UnsupportedPanel({ attachment, kind, onDownload, onOpenExternal }) {
  const att = normalizeAttachment(attachment) || {};
  const meta = TYPE_TONES[kind] || TYPE_TONES.other;
  const Icon = meta.Icon;
  const mime = att.type || att.mimeType || '—';
  const modified = att.uploadedAt || att.createdAt;

  const ext = String(att.name || '').split('.').pop()?.toLowerCase() || '';
  const canOpenExternally = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext) ||
    att.dataUrl?.startsWith('data:');

  const rows = [
    { Icon: File,       label: 'File name',    value: att.name || '—' },
    { Icon: FileText,   label: 'File type',    value: fileTypeLabel(att.name, kind) },
    { Icon: HardDrive,  label: 'File size',    value: formatSize(att.size) },
    { Icon: Calendar,   label: 'Modified',     value: modified ? formatDate(modified) : '—' },
    { Icon: FileText,   label: 'MIME type',    value: mime },
  ];

  /* Optional version / source rows when present on the record */
  if (att.version) {
    rows.push({ Icon: FileText, label: 'Version', value: `v${att.version}` });
  }
  if (att.sourceDocument || att.sourceLabel) {
    rows.push({ Icon: FileText, label: 'Source', value: att.sourceDocument || att.sourceLabel });
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <span
        className="p-4 rounded-2xl"
        style={{ background: meta.bg, color: meta.color }}
        aria-hidden="true"
      >
        <Icon className="w-9 h-9" />
      </span>
      <h4 className="mt-4 text-sm font-bold text-slate-800">Preview not available</h4>
      <p className="mt-1.5 text-xs text-slate-400 max-w-[360px] leading-relaxed">
        This file type ({fileTypeLabel(att.name, kind)}) can't be previewed in the browser.
        Download the file to open it in its native application.
      </p>

      <dl className="mt-6 w-full max-w-[420px] rounded-lg border border-slate-100 bg-slate-50/60 divide-y divide-slate-100 text-left">
        {rows.map(({ Icon: RowIcon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-2.5">
            <RowIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <dt className="w-24 shrink-0 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
              {label}
            </dt>
            <dd className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Download file
        </button>
        {canOpenExternally && (
          <button
            type="button"
            onClick={onOpenExternal}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] border border-[#0B4A3D]/30 hover:bg-[#EDF7F4] px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open externally
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PANEL: Missing / load-failure
   ═══════════════════════════════════════════════════════════════════ */
function UnavailablePanel({ missing, onDownload }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <span className="p-3.5 rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
        <File className="w-8 h-8" />
      </span>
      <h4 className="mt-4 text-sm font-bold text-slate-800">
        {missing ? 'No file content' : 'File unavailable'}
      </h4>
      <p className="mt-1 text-xs text-slate-400 max-w-[320px]">
        {missing
          ? 'This attachment has no file content attached to it.'
          : 'This file could not be loaded. It may have been moved or deleted.'}
      </p>
      {!missing && (
        <button
          type="button"
          onClick={onDownload}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline underline-offset-2 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Try downloading instead
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VIEWER: PDF — embedded iframe with full toolbar
   ═══════════════════════════════════════════════════════════════════ */
function PdfViewer({ url, fileName, onLoadError, attachment, onDownload, showOperations = true }) {
  const frameRef = useRef(null);
  const containerRef = useRef(null);
  const [pdfZoom, setPdfZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfError, setPdfError] = useState(false);
  const [pageInput, setPageInput] = useState('');

  /* Track fullscreen state */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const zoomIn = () => setPdfZoom((z) => Math.min(400, z + 25));
  const zoomOut = () => setPdfZoom((z) => Math.max(25, z - 25));
  const fitWidth = () => setPdfZoom(100);
  const fitPage = () => setPdfZoom(100);
  const rotateLeft = () => setRotation((r) => (r - 90) % 360);
  const rotateRight = () => setRotation((r) => (r + 90) % 360);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current) {
        await containerRef.current.requestFullscreen();
      }
    } catch { /* noop */ }
  }, []);

  const handlePrint = useCallback(() => {
    try {
      const iframe = frameRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.print();
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  }, []);

  const handleOpenInTab = useCallback(() => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  const handleGoToPage = useCallback(() => {
    const num = parseInt(pageInput, 10);
    if (num >= 1 && (!totalPages || num <= totalPages)) {
      setCurrentPage(num);
      setPageInput('');
    }
  }, [pageInput, totalPages]);

  /* Update page input when currentPage changes externally */
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: sync page input with external page state */
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleError = () => {
    setPdfError(true);
    onLoadError?.();
  };

  if (pdfError) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <span className="p-3.5 rounded-2xl bg-rose-50 text-rose-400" aria-hidden="true">
          <FileText className="w-8 h-8" />
        </span>
        <h4 className="mt-4 text-sm font-bold text-slate-800">PDF could not be loaded</h4>
        <p className="mt-1 text-xs text-slate-400 max-w-[320px]">
          The PDF file could not be rendered in the browser. Try downloading it instead.
        </p>
        <button
          type="button"
          onClick={onDownload}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> Download PDF
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
      {/* ── PDF Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-white border-b border-slate-200 flex-wrap">
        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <ToolBtn label="Previous page" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
            <Minus className="w-3.5 h-3.5" />
          </ToolBtn>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleGoToPage()}
              onBlur={handleGoToPage}
              className="w-10 text-center bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-[11px] font-bold text-slate-700 outline-none focus:border-[#0B4A3D]"
              aria-label="Page number"
            />
            <span className="text-slate-400">/</span>
            <span className="tabular-nums min-w-[20px]">{totalPages || '—'}</span>
          </div>
          <ToolBtn label="Next page" onClick={() => setCurrentPage((p) => (totalPages ? Math.min(totalPages, p + 1) : p + 1))} disabled={totalPages > 0 && currentPage >= totalPages}>
            <Plus className="w-3.5 h-3.5" />
          </ToolBtn>
        </div>

        <ToolSep />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <ToolBtn label="Zoom out" onClick={zoomOut} disabled={pdfZoom <= 25}>
            <ZoomOut className="w-3.5 h-3.5" />
          </ToolBtn>
          <span className="text-[11px] font-bold text-slate-600 tabular-nums w-12 text-center">
            {pdfZoom}%
          </span>
          <ToolBtn label="Zoom in" onClick={zoomIn} disabled={pdfZoom >= 400}>
            <ZoomIn className="w-3.5 h-3.5" />
          </ToolBtn>
        </div>

        <ToolSep />

        {/* Fit controls */}
        <ToolBtn label="Fit width" onClick={fitWidth} active={pdfZoom === 100}>
          <span className="text-[9px] font-bold leading-none">W</span>
        </ToolBtn>
        <ToolBtn label="Fit page" onClick={fitPage}>
          <span className="text-[9px] font-bold leading-none">F</span>
        </ToolBtn>

        <ToolSep />

        {/* Rotate */}
        <ToolBtn label="Rotate left" onClick={rotateLeft}>
          <RotateCcw className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Rotate right" onClick={rotateRight}>
          <RotateCw className="w-3.5 h-3.5" />
        </ToolBtn>

        <ToolSep />

        {/* Fullscreen */}
        <ToolBtn label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </ToolBtn>

        <div className="flex-1" />

        {/* Right-side actions */}
        <ToolBtn label="Print" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Download" onClick={onDownload}>
          <Download className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Open in new tab" onClick={handleOpenInTab}>
          <ExternalLink className="w-3.5 h-3.5" />
        </ToolBtn>
        {attachment && showOperations && (
          <DocumentOperationsMenu
            doc={attachment}
            compact
            trigger={
              <button type="button" title="Document operations" className="p-1.5 rounded-md text-slate-500 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
          />
        )}
      </div>

      {/* ── PDF iframe ── */}
      <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-2">
        <iframe
          ref={frameRef}
          key={`${url}-${rotation}`}
          src={url}
          title={fileName || 'PDF Viewer'}
          onError={handleError}
          onLoad={(e) => {
            /* Try to detect page count from the iframe.
               Cross-origin restrictions may prevent this — that's OK,
               the counter will just show "—". */
            try {
              const doc = e.target?.contentDocument;
              const pages = doc?.querySelectorAll?.('[data-page-number]');
              if (pages?.length) setTotalPages(pages.length);
            } catch { /* cross-origin — ignore */ }
          }}
          style={{
            transform: `scale(${pdfZoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'top center',
            width: rotation % 180 !== 0 ? 'calc(100vh - 120px)' : '100%',
            height: rotation % 180 !== 0 ? '100%' : 'calc(100vh - 120px)',
            border: 'none',
            background: 'white',
          }}
          className="rounded-md shadow-sm transition-transform duration-200"
        />
      </div>
    </div>
  );
}

/* Missing lucide icon */
function Minimize(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" {...props}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VIEWER: Image — zoomable + rotatable
   ═══════════════════════════════════════════════════════════════════ */
function ImageViewer({ url, fileName, onLoadError, attachment, onDownload, showOperations = true }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const frameRef = useRef(null);
  const containerRef = useRef(null);

  /* Wheel-to-zoom */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((prev) => clampZoom(prev - e.deltaY * 0.002));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, []);

  const zoomIn = () => setZoom((z) => clampZoom(z + 0.25));
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.25));
  const resetView = () => { setZoom(1); setRotation(0); };
  const rotateLeft = () => setRotation((r) => r - 90);
  const rotateRight = () => setRotation((r) => r + 90);

  const handleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current) {
        await containerRef.current.requestFullscreen();
      }
    } catch { /* noop */ }
  }, []);

  const handlePrint = useCallback(() => {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html><head><title>${fileName || 'Image'}</title>
        <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5}
        img{max-width:100%;max-height:100vh}</style></head>
        <body><img src="${url}" onload="setTimeout(()=>window.print(),200)" /></body></html>
      `);
    }
  }, [url, fileName]);

  if (loadFailed) {
    return (
      <UnavailablePanel missing={false} onDownload={onDownload} />
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
      {/* ── Image Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-white border-b border-slate-200">
        {/* Zoom */}
        <ToolBtn label="Zoom out" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
          <ZoomOut className="w-3.5 h-3.5" />
        </ToolBtn>
        <span className="text-[11px] font-bold text-slate-600 tabular-nums w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <ToolBtn label="Zoom in" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
          <ZoomIn className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Reset zoom" onClick={resetView} disabled={zoom === 1 && rotation === 0}>
          <span className="text-[9px] font-bold">1:1</span>
        </ToolBtn>

        <ToolSep />

        {/* Rotate */}
        <ToolBtn label="Rotate left" onClick={rotateLeft}>
          <RotateCcw className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Rotate right" onClick={rotateRight}>
          <RotateCw className="w-3.5 h-3.5" />
        </ToolBtn>

        <ToolSep />

        {/* Fullscreen */}
        <ToolBtn label="Fullscreen" onClick={handleFullscreen}>
          <Maximize2 className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="flex-1" />

        {/* Right actions */}
        <ToolBtn label="Print" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Download" onClick={onDownload}>
          <Download className="w-3.5 h-3.5" />
        </ToolBtn>
        {attachment && showOperations && (
          <DocumentOperationsMenu
            doc={attachment}
            compact
            trigger={
              <button type="button" title="Document operations" className="p-1.5 rounded-md text-slate-500 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
          />
        )}
      </div>

      {/* ── Image frame ── */}
      <div
        ref={frameRef}
        className="overflow-auto max-h-[60vh] flex items-center justify-center p-3 bg-slate-100/70"
      >
        <div
          className="min-w-full min-h-full flex items-center justify-center"
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transition: 'transform 0.15s ease' }}
        >
          <img
            src={url}
            alt={fileName || 'Attachment'}
            onError={() => { setLoadFailed(true); onLoadError?.(); }}
            onDoubleClick={() => setZoom((prev) => (prev === 1 ? 2 : 1))}
            className="max-w-full max-h-[56vh] object-contain rounded-md select-none"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VIEWER: Text
   ═══════════════════════════════════════════════════════════════════ */
function TextViewer({ url, fileName, kind }) {
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedFor = useRef(null);

  useEffect(() => {
    if (!url || fetchedFor.current === url) return undefined;
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((text) => {
        if (!cancelled) { fetchedFor.current = url; setTextContent(text); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setTextContent(null); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-200 bg-white">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Text preview</span>
        <span className="text-[10px] text-slate-400">{fileTypeLabel(fileName, kind)}</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 animate-spin" /> Loading file…
        </div>
      ) : textContent === null ? (
        <div className="flex items-center justify-center py-12 text-xs text-slate-400">
          Could not load file content.
        </div>
      ) : (
        <pre className="p-4 text-[12px] leading-relaxed font-mono text-slate-700 whitespace-pre-wrap break-words max-h-[56vh] overflow-auto">
          {textContent}
        </pre>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VIEWER: Video
   ═══════════════════════════════════════════════════════════════════ */
function VideoViewer({ url, onLoadError }) {
  const [loadFailed, setLoadFailed] = useState(false);
  if (loadFailed) return <UnavailablePanel missing={false} onDownload={() => {}} />;
  return (
    <video
      key={url}
      src={url}
      controls
      onError={() => { setLoadFailed(true); onLoadError?.(); }}
      className="w-full max-h-[64vh] rounded-lg border border-slate-200 bg-black"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VIEWER: Audio
   ═══════════════════════════════════════════════════════════════════ */
function AudioViewer({ url, fileName, kind, onLoadError }) {
  const meta = TYPE_TONES[kind] || TYPE_TONES.other;
  const Icon = meta.Icon;
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <span className="p-4 rounded-2xl" style={{ background: meta.bg, color: meta.color }} aria-hidden="true">
        <Icon className="w-9 h-9" />
      </span>
      <p className="mt-3 text-sm font-bold text-slate-800 truncate max-w-full">{fileName}</p>
      <audio key={url} src={url} controls onError={onLoadError} className="mt-4 w-full max-w-sm" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT: AttachmentPreview / DocumentViewer
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Enterprise document preview dialog.
 *
 * Props:
 *   open        — whether the dialog is visible (Modal semantics)
 *   attachment  — record { id, name, size, type, dataUrl|downloadUrl|…, uploadedAt|… }
 *   onClose     — close handler
 *   title       — optional dialog title (defaults to the file name)
 *   maxWidth    — optional modal width (defaults to max-w-3xl)
 *   showOperations — show the module document operations (⋯) menu inside the
 *                    PDF / image toolbars. Set to false for callers outside
 *                    the purchase document store, whose records are not
 *                    managed by those operations.
 */
export default function AttachmentPreview({
  open,
  attachment,
  onClose,
  title,
  maxWidth = 'max-w-3xl',
  showOperations = true
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState('');

  const att = normalizeAttachment(attachment);
  const kind = detectType(att?.name, att?.type);
  const url = resolveUrl(att);
  const missing = !url;
  const viewable = canPreview(kind);
  /* Reset loadFailed when attachment changes */
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: reset state when attachment prop changes */
  useEffect(() => {
    setLoadFailed(false);
    setDownloadNotice('');
  }, [att?.id, att?.name]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDownload = async () => {
    const ok = await downloadAttachment(att);
    setDownloadNotice(ok ? '' : 'This file could not be downloaded — it may have been moved or deleted.');
  };

  const handleOpenExternal = useCallback(() => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  const renderBody = () => {
    if (missing || loadFailed) {
      return <UnavailablePanel missing={missing} onDownload={handleDownload} />;
    }

    if (kind === 'pdf') {
      return (
        <PdfViewer
          url={url}
          fileName={att?.name}
          onLoadError={() => setLoadFailed(true)}
          attachment={att}
          onDownload={handleDownload}
          showOperations={showOperations}
        />
      );
    }

    if (kind === 'image') {
      return (
        <ImageViewer
          url={url}
          fileName={att?.name}
          onLoadError={() => setLoadFailed(true)}
          attachment={att}
          onDownload={handleDownload}
          showOperations={showOperations}
        />
      );
    }

    if (kind === 'video') {
      return <VideoViewer url={url} onLoadError={() => setLoadFailed(true)} />;
    }

    if (kind === 'audio') {
      return <AudioViewer url={url} fileName={att?.name} kind={kind} onLoadError={() => setLoadFailed(true)} />;
    }

    if (kind === 'text') {
      return <TextViewer url={url} fileName={att?.name} kind={kind} />;
    }

    if (viewable) {
      /* Generic viewable — embedded viewer */
      return (
        <iframe
          key={url}
          src={url}
          title={att?.name || 'Attachment'}
          onError={() => setLoadFailed(true)}
          className="w-full h-[64vh] rounded-lg border border-slate-200 bg-white"
        />
      );
    }

    /* Unsupported binary — professional panel with metadata + download */
    return (
      <UnsupportedPanel
        attachment={att}
        kind={kind}
        onDownload={handleDownload}
        onOpenExternal={handleOpenExternal}
      />
    );
  };

  /* The PDF and Image viewers have their own toolbars inside the
     modal, so we remove the footer Download for those kinds.
     For everything else, the footer Download remains. */
  const showFooter = !viewable || loadFailed || missing;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || att?.name || 'Attachment'}
      maxWidth={maxWidth}
      footer={
        showFooter ? (
          <button
            type="button"
            onClick={handleDownload}
            disabled={missing}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        ) : null
      }
    >
      {downloadNotice && (
        <p className="mb-3 text-[11px] font-semibold text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2" role="alert">
          {downloadNotice}
        </p>
      )}
      {renderBody()}
    </Modal>
  );
}

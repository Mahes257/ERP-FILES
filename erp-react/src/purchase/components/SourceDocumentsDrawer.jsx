/**
 * purchase/components/SourceDocumentsDrawer.jsx
 * ------------------------------------------------------------------
 * Reusable Documents section for Purchase source record views.
 *
 * Renders inside a card or drawer on PO View, RFQ View, PR View,
 * Invoice View, etc. Shows all documents linked to the current
 * source record with actions: Preview, Download, Print, Upload,
 * Version History, Open in Documents.
 *
 * Uses the shared AttachmentPreview viewer for all previews.
 * ------------------------------------------------------------------
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, ExternalLink, Eye, FolderOpen,
  Loader2, Printer
} from 'lucide-react';
import { useToast } from './ui';
import AttachmentPreview from './AttachmentPreview';
import {
  TYPE_TONES, detectType, downloadAttachment, formatSize, hasContent
} from '../utils/attachmentFile';
import { formatDate } from '../utils/helpers';
import { documentsStore } from '../services/documents';
import { resolveSourceRoute, resolvePrintRoute } from '../utils/sourceNavigation';

/**
 * SourceDocumentsDrawer — compact documents section for a source record.
 *
 * Props:
 *   sourceId   - The source record ID (PR id, RFQ id, PO id, etc.)
 *   stage      - The document stage (DOCUMENT_STAGE.PR, etc.)
 *   label      - Optional label override (e.g. "PO Documents")
 *   compact    - If true, renders as a compact card; if false, as a full section
 */
const SourceDocumentsDrawer = memo(function SourceDocumentsDrawer({
  sourceId,
  stage,
  label,
  compact = false
}) {
  const navigate = useNavigate();
  const toast = useToast();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);

  /* Load documents linked to this source */
  const loadDocuments = useCallback(() => {
    if (!sourceId) { setDocuments([]); setLoading(false); return; }
    setLoading(true);
    try {
      const all = documentsStore.all || [];
      const linked = all.filter((doc) => {
        if (doc.sourceId !== sourceId) return false;
        if (stage && doc.stage !== stage) return false;
        return doc.recordState === 'active';
      });
      setDocuments(linked);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [sourceId, stage]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  /* Handlers */
  const handlePreview = useCallback((doc) => {
    if (!doc.sourceUrl) {
      toast.info('No preview available for this document');
      return;
    }
    setPreviewDoc(doc);
  }, [toast]);

  const handleDownload = useCallback(async (doc) => {
    if (!doc.sourceUrl) {
      toast.info('No file to download');
      return;
    }
    const ok = await downloadAttachment({
      name: doc.name,
      dataUrl: doc.sourceUrl,
      type: doc.sourceType
    });
    if (!ok) toast.error('Download failed');
  }, [toast]);

  const handlePrint = useCallback((doc) => {
    const { route, canPrint } = resolvePrintRoute(doc);
    if (canPrint && route) {
      navigate(route);
    } else {
      toast.info('Print not available for this document');
    }
  }, [navigate, toast]);

  const handleOpenInDocuments = useCallback(() => {
    navigate('/purchase/documents');
  }, [navigate]);

  const handleOpenSource = useCallback((doc) => {
    const { route, canNavigate } = resolveSourceRoute(doc);
    if (canNavigate && route) {
      navigate(route);
    }
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-6">
        <FolderOpen className="w-8 h-8 mx-auto text-slate-200 mb-2" />
        <p className="text-xs font-bold text-slate-500">No documents</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Documents will appear here as they are generated or uploaded.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-slate-700">
          {label || 'Documents'}
          <span className="ml-1.5 text-slate-400 font-normal">({documents.length})</span>
        </h4>
        <button
          type="button"
          onClick={handleOpenInDocuments}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0B4A3D] hover:underline underline-offset-2 cursor-pointer"
        >
          <FolderOpen className="w-3 h-3" /> View all
        </button>
      </div>

      {/* Document list */}
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
        {documents.map((doc) => {
          const kind = detectType(doc.name, doc.sourceType);
          const tone = TYPE_TONES[kind] || TYPE_TONES.other;
          const Icon = tone.Icon;
          const canPreview = hasContent(doc);

          return (
            <li key={doc.docId} className="flex items-center gap-3 px-3 py-2.5">
              {/* File icon */}
              <span
                className="p-1.5 rounded-lg shrink-0"
                style={{ background: tone.bg, color: tone.color }}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>

              {/* File info */}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700 truncate" title={doc.name}>
                  {doc.name}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  {doc.fileType && <span>{doc.fileType}</span>}
                  {doc.fileSize > 0 && <span>{formatSize(doc.fileSize)}</span>}
                  {doc.version > 1 && (
                    <span className="font-bold text-[#0B4A3D]">v{doc.version}</span>
                  )}
                  {doc.uploadedAt && <span>{formatDate(doc.uploadedAt)}</span>}
                </div>
              </div>

              {/* Actions */}
              {!compact && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handlePreview(doc)}
                    disabled={!canPreview}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canPreview ? 'Preview' : 'No preview available'}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={!doc.sourceUrl}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={doc.sourceUrl ? 'Download' : 'No file to download'}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrint(doc)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer"
                    title="Print"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenSource(doc)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors cursor-pointer"
                    title="Open source record"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Preview modal */}
      <AttachmentPreview
        key={previewDoc?.docId || 'none'}
        open={Boolean(previewDoc)}
        attachment={previewDoc ? {
          id: previewDoc.docId,
          name: previewDoc.name,
          type: previewDoc.sourceType,
          size: previewDoc.fileSize,
          dataUrl: previewDoc.sourceUrl,
          uploadedAt: previewDoc.uploadedAt,
          version: previewDoc.version,
          sourceDocument: previewDoc.docNo,
          sourceLabel: previewDoc.sourceLabel
        } : null}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
});

export default SourceDocumentsDrawer;

/**
 * Document Workflow — the linked-document lifecycle for Sales Orders and
 * Sales Contracts. Lives INSIDE the existing Linked Documents section.
 *
 * Default stages (strict order, never reversible, never skipped):
 *   Draft Document → Corrected Document → Signed Document → Submitted Document
 *
 * Sales Contracts pass their own stage set via the `stages` prop:
 *   Draft → Correction → VST Sign → Final Document
 *
 * Every progression creates a NEW version; previous versions are preserved.
 *
 * BACKEND-PERSISTED: Uses the existing DocumentRepository API:
 *   - GET  /v1/documents?module={module}&relatedRecordId={docId} → find/create document
 *   - POST /v1/documents/{id}/versions → upload new version with file
 *   - GET  /v1/documents/{id}/versions → list all versions
 *   - Files stored via FileStorageService (UUID-based, same as Sales attachments)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowDown, Check, Eye, FileText, Loader2, Upload } from 'lucide-react';
import { formatDate, formatDateTime } from '../../utils/leadHelpers';
import { useToast } from '../Common';
import api from '../../api/axiosInstance';
import { openFileInNewTab } from '../../utils/fileAccess';

const DEFAULT_STAGES = [
  { label: 'Draft Document', dateLabel: null, awaiting: 'No draft document uploaded yet' },
  { label: 'Corrected Document', dateLabel: null, awaiting: 'Not corrected yet' },
  { label: 'Signed Document', dateLabel: null, awaiting: 'Not signed yet' },
  { label: 'Submitted Document', dateLabel: null, awaiting: 'Not submitted yet' }
];

const DEFAULT_NEXT_ACTIONS = ['Correct', 'Sign', 'Submit'];

export default function DocumentWorkflow({
  moduleKey,
  docId,
  docNo,
  stages = DEFAULT_STAGES,
  nextActions = DEFAULT_NEXT_ACTIONS
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [documentRepoId, setDocumentRepoId] = useState(null);

  /** Find or create the DocumentRepository entry for this module+record. */
  const findOrCreateDocument = useCallback(async () => {
    try {
      // Search for existing document for this module + record
      const { data } = await api.get('/documents', {
        params: {
          module: moduleKey,
          page: 0,
          size: 100,
        }
      });

      const entries = data?.content || data?.data?.content || [];
      const existing = entries.find(
        (e) => e.module === moduleKey && String(e.relatedRecordId) === String(docId)
      );

      if (existing) {
        setDocumentRepoId(existing.id);
        return existing.id;
      }

      // Create a new document entry for this workflow
      const { data: created } = await api.post('/documents', {
        documentName: `${moduleKey}-${docId}-workflow`,
        documentType: 'Document Workflow',
        module: moduleKey,
        relatedRecordId: Number(docId) || null,
        recordNumber: docNo || null,
        status: 'active',
        visibility: 'TEAM_ONLY',
      });

      const newId = created?.data?.id || created?.id;
      setDocumentRepoId(newId);
      return newId;
    } catch (err) {
      console.error('Failed to find/create document entry:', err);
      return null;
    }
  }, [moduleKey, docId, docNo]);

  /** Load versions from the backend. */
  const loadVersions = useCallback(async (repoId) => {
    if (!repoId) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/documents/${repoId}/versions`);
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

      // Map backend versions to frontend format
      // Backend stores stage info in changeNotes as "stage:{index}:{label}"
      const mapped = list
        .sort((a, b) => (a.versionNumber || 0) - (b.versionNumber || 0))
        .map((v) => {
          // Parse stage info from changeNotes
          let stageIndex = 0;
          let stageLabel = stages[0]?.label || 'Draft';
          if (v.changeNotes && v.changeNotes.startsWith('stage:')) {
            const parts = v.changeNotes.split(':');
            stageIndex = parseInt(parts[1], 10) || 0;
            stageLabel = parts[2] || stages[stageIndex]?.label || '';
          }
          return {
            id: v.id,
            backendId: v.id,
            versionNumber: v.versionNumber,
            stageIndex,
            stageLabel,
            fileName: v.documentName || 'Document',
            fileSize: v.fileSize || 0,
            filePath: v.filePath || '',
            storedName: v.storedName || '',
            // Relative to the API base (/v1) — never prefix it here, or the
            // request becomes /v1/v1/files/... and fails with 404.
            url: v.filePath ? `/files/${v.storedName || v.filePath.split('/').pop()}` : '',
            uploadedBy: v.uploadedBy || '',
            createdAt: v.uploadedAt || '',
          };
        });

      setVersions(mapped);
    } catch (err) {
      console.error('Failed to load document versions:', err);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [stages]);

  // Initialize: find/create document and load versions
  useEffect(() => {
    if (!moduleKey || !docId) return;
    let cancelled = false;

    async function init() {
      const repoId = await findOrCreateDocument();
      if (!cancelled && repoId) {
        await loadVersions(repoId);
      } else if (!cancelled) {
        setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [moduleKey, docId, findOrCreateDocument, loadVersions]);

  const latest = versions.length > 0 ? versions[versions.length - 1] : null;
  const nextStageIndex = latest ? latest.stageIndex + 1 : 0;

  const handlePick = (stageIndex) => {
    setPendingAction(stageIndex);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const requestedStage = pendingAction;
    setPendingAction(null);

    // Strict progression: the requested stage must be the exact next stage.
    const currentLatest = versions[versions.length - 1] || null;
    const allowedStage = currentLatest ? currentLatest.stageIndex + 1 : 0;
    if (requestedStage !== allowedStage) {
      toast.error(`Documents must progress in order: ${stages.map((s) => s.label).join(' → ')}.`);
      return;
    }

    // Ensure we have a document repo entry
    let repoId = documentRepoId;
    if (!repoId) {
      repoId = await findOrCreateDocument();
      if (!repoId) {
        toast.error('Failed to create document entry.');
        return;
      }
    }

    // Upload the file as a new version
    try {
      setUploading(true);
      const stageLabel = stages[requestedStage].label;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('changeNotes', `stage:${requestedStage}:${stageLabel}`);

      await api.post(`/documents/${repoId}/versions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Reload versions from backend
      await loadVersions(repoId);
      toast.success(`${file.name} added as ${stageLabel}`);
    } catch (err) {
      console.error('Failed to upload version:', err);
      toast.error(err?.response?.data?.message || 'Failed to upload document version.');
    } finally {
      setUploading(false);
    }
  };

  const viewFile = async (version) => {
    if (!version?.url) return;
    // Shared authenticated file client — normalizes the stored URL centrally.
    openFileInNewTab(version.url).catch((err) =>
      toast.error(err?.message || 'Failed to open file')
    );
  };

  const formatSize = (bytes) => {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-center py-6 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading document workflow…
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Document Workflow
        </span>
        <span className="text-[10px] font-semibold text-slate-400">
          {versions.length} version{versions.length === 1 ? '' : 's'}
          {uploading && ' · uploading…'}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload document version"
        data-workflow-input="true"
      />

      <div className="flex flex-col">
        {stages.map((stage, index) => {
          const version = versions.find((v) => v.stageIndex === index) || null;
          const isLatest = latest && version && version.id === latest.id;
          const isNext = index === nextStageIndex;
          const actionLabel = nextActions[index];

          return (
            <div key={stage.label}>
              <div
                className={`rounded-lg border p-3 ${
                  version
                    ? 'border-slate-200 bg-surface'
                    : isNext
                      ? 'border-dashed border-[#0B4A3D]/30 bg-[#0B4A3D]/[0.03]'
                      : 'border-dashed border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    {stage.label}
                  </span>
                  {version && isLatest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#0B4A3D] text-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                      <Check className="w-2.5 h-2.5" /> Current
                    </span>
                  )}
                  {version && !isLatest && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                      Preserved
                    </span>
                  )}
                </div>

                {stage.dateLabel && (
                  <div className="flex items-center justify-between gap-2 py-0.5 mb-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">{stage.dateLabel}</span>
                    <span className={`font-semibold ${version ? 'text-slate-700' : 'text-slate-300'}`}>
                      {version ? formatDate(version.createdAt) : '—'}
                    </span>
                  </div>
                )}

                {version ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-[#0B4A3D] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-slate-800 truncate" title={version.fileName}>
                          {version.fileName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatDateTime(version.createdAt)}
                          {version.fileSize != null ? ` · ${formatSize(version.fileSize)}` : ''}
                          {version.uploadedBy ? ` · ${version.uploadedBy}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => viewFile(version)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-surface border border-slate-200 px-2.5 h-[26px] rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                      {version.stageIndex < stages.length - 1 && isLatest && (
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => handlePick(version.stageIndex + 1)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 px-2.5 h-[26px] rounded-md transition-colors cursor-pointer"
                        >
                          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} {actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">{stage.awaiting}</span>
                    {isNext && (
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => handlePick(index)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 px-2.5 h-[26px] rounded-md transition-colors cursor-pointer"
                      >
                        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {index === 0 ? 'Upload Draft' : actionLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {index < stages.length - 1 && (
                <div className="flex justify-center py-0.5 text-slate-300">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
        {docNo ? `${docNo} · ` : ''}Document versions progress strictly {stages.map((s) => s.label).join(' → ')}.
        Previous versions are preserved in the Document Repository.
      </p>
    </div>
  );
}

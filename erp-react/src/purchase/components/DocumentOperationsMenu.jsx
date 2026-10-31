/**
 * purchase/components/DocumentOperationsMenu.jsx
 * ------------------------------------------------------------------
 * Reusable document operations menu component.
 *
 * Provides a dropdown menu with all management operations for a document:
 *   - Rename
 *   - Edit Description
 *   - Edit Tags
 *   - Change Category
 *   - Upload Replacement (creates new version)
 *   - Create New Version
 *   - Archive / Restore
 *   - PDF Page Operations (reorder, rotate, delete, merge, split)
 *
 * Destructive operations show confirmation dialogs.
 * PDF page operations that require backend show proper unavailable state.
 *
 * When a custom `trigger` is supplied (e.g. the "More Operations" row of
 * the Actions menu), the popover behaves as a proper NESTED submenu:
 * it is portaled to document.body, anchored to the SIDE of the trigger
 * row (flipping to the opposite side when there is no room), vertically
 * aligned with the row (flipping up near the viewport bottom), and
 * never clipped by tables/overflow containers. The trigger row shows a
 * chevron; Escape closes the submenu first (parent menu stays open) and
 * a second Escape closes the parent.
 *
 * Used in:
 *   - Document table row actions (nested in the Actions menu)
 *   - AttachmentPreview toolbar
 * ------------------------------------------------------------------
 */
import { memo, useCallback, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive, ArchiveRestore, ChevronRight, Edit3, FilePlus, FolderInput, MoreHorizontal,
  Pencil, RefreshCw, RotateCcw, Scissors, SplitSquareVertical,
  Tag, Upload, Merge, Info, Shield
} from 'lucide-react';
import { documentOperationsService } from '../services/documentOperations';
import { documentPermissionsService } from '../services/documentPermissions';
import { documentAuditService } from '../services/documentAudit';
import { useToast } from './ui';
import { formatSize } from '../utils/attachmentFile';
import { registerDocumentSubmenu, focusFirstMenuItem, handleMenuKeyNav } from './documentSubmenu';

/* ═══════════════════════════════════════════════════════════════════
   Confirmation Dialog
   ═══════════════════════════════════════════════════════════════════ */
function ConfirmDialog({ open, title, message, confirmLabel, confirmColor = 'bg-[#0B4A3D] hover:bg-[#083D34] text-white', onConfirm, onCancel, busy }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-5">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-60 ${confirmColor}`}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Inline Edit Dialogs
   ═══════════════════════════════════════════════════════════════════ */
function InlineEditDialog({ open, title, label, value, placeholder, multiline, onSave, onCancel, busy }) {
  const [localValue, setLocalValue] = useState(value || '');
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: sync local value with prop */
  useEffect(() => { setLocalValue(value || ''); }, [value, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-5">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <label className="block mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</label>
        {multiline ? (
          <textarea
            rows={3}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D]/10 resize-none"
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D]/10"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(localValue); }}
          />
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(localValue)} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] rounded-lg transition-colors cursor-pointer disabled:opacity-60">
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PDF Page Operations Unavailable Panel
   ═══════════════════════════════════════════════════════════════════ */
function PdfOperationUnavailable({ operation, onClose }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Info className="w-6 h-6 text-amber-500" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">{operation.label}</h3>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
          {operation.description}
        </p>
        <p className="mt-3 text-[10px] text-slate-400">
          This feature requires a server-side PDF processing backend.
          The browser cannot safely modify PDF bytes directly.
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] rounded-lg transition-colors cursor-pointer"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Document operations dropdown menu.
 *
 * Props:
 *   doc        — document record (docId, name, version, recordState, etc.)
 *   onRefresh  — callback after any operation succeeds
 *   trigger    — custom trigger element (defaults to ⋯ button)
 *   compact    — compact mode (icon-only, smaller)
 */
function DocumentOperationsMenu({ doc, onRefresh, onAction, trigger, compact = false }) {
  const toast = useToast();
  const triggerRef = useRef(null);
  const submenuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState(null);

  /* ─── Dialog states ─── */
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [editDialog, setEditDialog] = useState(null);
  const [pdfUnavailable, setPdfUnavailable] = useState(null);
  const fileInputRef = useRef(null);

  /* ─── Placement: anchor the portaled submenu to the trigger row,
         beside it (right side), flipping left/up when needed ─── */
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const triggerEl = triggerRef.current;
      const sub = submenuRef.current;
      if (!triggerEl || !sub) return;
      const rect = triggerEl.getBoundingClientRect();
      const subW = sub.offsetWidth || 224;
      const subH = sub.offsetHeight || 0;
      const gap = 6;
      const margin = 8;
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;

      /* Prefer opening to the right of the row... */
      let left = rect.right + gap;
      /* ...flip to the left when there is not enough room on the right. */
      if (left + subW > vw - margin && rect.left - subW - gap >= margin) {
        left = rect.left - subW - gap;
      }
      left = Math.max(margin, Math.min(left, vw - subW - margin));

      /* Align with the top of the row, flip up when near the bottom. */
      let top = rect.top;
      if (subH > 0 && top + subH > vh - margin) {
        top = rect.bottom - subH;
      }
      top = Math.max(margin, Math.min(top, vh - subH - margin));
      setPos({ top, left });
    };

    place();
    focusFirstMenuItem(submenuRef.current);
    registerDocumentSubmenu(submenuRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      registerDocumentSubmenu(null);
    };
  }, [open]);

  /* ─── Click outside (trigger row + portaled submenu) closes ─── */
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (submenuRef.current && submenuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* ─── Escape: first closes the submenu only (capture phase stops the
         parent menu's own Escape handler); a second Escape closes the
         parent menu via its own listener ─── */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  /* ─── Execute an async operation with audit ─── */
  const execute = useCallback(async (fn, successMsg, auditAction) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMsg);
      if (auditAction) {
        documentAuditService.record(auditAction, { doc, source: 'ui' }).catch(() => {});
      }
      setOpen(false);
      onAction?.();
      onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Operation failed');
    } finally {
      setBusy(false);
      setConfirmDialog(null);
    }
  }, [toast, onRefresh, onAction, doc]);

  /* ─── Permissions ─── */
  const perms = documentPermissionsService.getDocumentPermissions(doc);
  const isConf = documentPermissionsService.isConfidential(doc);
  const isOwn = documentPermissionsService.isOwner(doc);

  /* ─── Operations ─── */
  const handleRename = useCallback(() => {
    setEditDialog({ type: 'rename', title: 'Rename Document', label: 'Document Name', value: doc.name, placeholder: 'Enter document name...' });
    setOpen(false);
    onAction?.();
  }, [doc, onAction]);

  const handleDescription = useCallback(() => {
    setEditDialog({ type: 'description', title: 'Edit Description', label: 'Description', value: doc.description || '', placeholder: 'Add a description...', multiline: true });
    setOpen(false);
    onAction?.();
  }, [doc, onAction]);

  const handleTags = useCallback(() => {
    const tagsStr = Array.isArray(doc.tags) ? doc.tags.join(', ') : (doc.tags || '');
    setEditDialog({ type: 'tags', title: 'Edit Tags', label: 'Tags (comma-separated)', value: tagsStr, placeholder: 'e.g. urgent, review, final' });
    setOpen(false);
    onAction?.();
  }, [doc, onAction]);

  const handleCategory = useCallback(() => {
    setEditDialog({ type: 'category', title: 'Change Category', label: 'Category', value: doc.category || '', placeholder: 'e.g. Technical, Commercial, Legal' });
    setOpen(false);
    onAction?.();
  }, [doc, onAction]);

  const handleArchive = useCallback(() => {
    const isArchived = doc.recordState === 'archived';
    const message = isArchived
      ? `Restore "${doc.name}" from archive? It will become visible in the default view again.`
      : `Archive "${doc.name}"? It will be hidden from the default view but can be restored.`;
    setConfirmDialog({
      operation: isArchived ? 'restore' : 'archive',
      title: isArchived ? 'Restore Document' : 'Archive Document',
      message,
      confirmLabel: isArchived ? 'Restore' : 'Archive',
      confirmColor: isArchived ? 'bg-[#0B4A3D] hover:bg-[#083D34] text-white' : 'bg-amber-500 hover:bg-amber-600 text-white',
      onConfirm: () => execute(
        () => isArchived
          ? documentOperationsService.restore(doc.docId)
          : documentOperationsService.archive(doc.docId),
        isArchived ? 'Document restored' : 'Document archived',
        isArchived ? 'RESTORED' : 'ARCHIVED'
      )
    });
    setOpen(false);
    onAction?.();
  }, [doc, execute, onAction]);

  const handleCreateVersion = useCallback(() => {
    const message = documentOperationsService.getConfirmationMessage('create_version', doc);
    setConfirmDialog({
      operation: 'create_version',
      title: 'Create New Version',
      message,
      confirmLabel: 'Create Version',
      confirmColor: 'bg-[#0B4A3D] hover:bg-[#083D34] text-white',
      onConfirm: () => execute(
        () => documentOperationsService.createNewVersion(doc.docId, { changeReason: 'Manual version created' }),
        `New version v${(doc.version || 1) + 1} created`
      )
    });
    setOpen(false);
    onAction?.();
  }, [doc, execute, onAction]);

  const handleUploadReplacement = useCallback(() => {
    fileInputRef.current?.click();
    setOpen(false);
    onAction?.();
  }, [onAction]);

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const message = documentOperationsService.getConfirmationMessage('replace', doc);
    setConfirmDialog({
      operation: 'replace',
      title: 'Upload Replacement',
      message: `${message}\n\nFile: ${file.name} (${formatSize(file.size)})`,
      confirmLabel: 'Upload & Create Version',
      confirmColor: 'bg-[#0B4A3D] hover:bg-[#083D34] text-white',
      onConfirm: () => execute(
        () => documentOperationsService.uploadReplacement(doc.docId, file, { changeReason: `Replaced with ${file.name}` }),
        `File replaced — new version v${(doc.version || 1) + 1} created`
      )
    });
    e.target.value = '';
  }, [doc, execute]);

  const handlePdfOperation = useCallback((opKey) => {
    const status = documentOperationsService.getPdfPageOperationStatus(opKey);
    if (!status.available) {
      setPdfUnavailable(status);
    }
    setOpen(false);
    onAction?.();
  }, [onAction]);

  /* ─── Save handlers for inline edit dialogs ─── */
  const handleEditSave = useCallback(async (value) => {
    if (!editDialog) return;
    setBusy(true);
    try {
      switch (editDialog.type) {
        case 'rename':
          await documentOperationsService.rename(doc.docId, value);
          toast.success('Document renamed');
          break;
        case 'description':
          await documentOperationsService.updateDescription(doc.docId, value);
          toast.success('Description updated');
          break;
        case 'tags':
          await documentOperationsService.updateTags(doc.docId, value);
          toast.success('Tags updated');
          break;
        case 'category':
          await documentOperationsService.changeCategory(doc.docId, value);
          toast.success('Category changed');
          break;
      }
      setEditDialog(null);
      onRefresh?.();
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }, [editDialog, doc, toast, onRefresh]);

  const isArchived = doc?.recordState === 'archived';

  return (
    <>
      {trigger ? (
        <div
          ref={triggerRef}
          className={`doc-ops-trigger relative cursor-pointer ${open ? 'open' : ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          {trigger}
          {!compact && <ChevronRight size={13} className="doc-ops-chevron" aria-hidden="true" />}
        </div>
      ) : (
        <div ref={triggerRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer ${compact ? 'p-1' : ''}`}
            title="Document operations"
          >
            <MoreHorizontal size={compact ? 13 : 15} />
          </button>
        </div>
      )}

      {open && createPortal(
        <div
          ref={submenuRef}
          className="doc-row-dropdown doc-ops-submenu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') return; /* dedicated capture listener closes the submenu */
            handleMenuKeyNav(e, submenuRef.current);
          }}
          style={{
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : 0,
            visibility: pos ? 'visible' : 'hidden'
          }}
        >
          {/* ── Confidential Badge ── */}
          {isConf && (
            <div className="doc-ops-sub-badge">
              <Shield size={11} /> Confidential
              {isOwn && <span className="doc-ops-sub-owner">Owner</span>}
            </div>
          )}

          {/* ── Editing Section (requires EDIT_METADATA) ── */}
          {perms.editMetadata && (
            <>
              <div className="doc-ops-sub-section">Edit</div>
              <button type="button" onClick={handleRename} className="doc-row-dropdown-item" role="menuitem">
                <Pencil size={13} className="doc-row-dropdown-icon" /> Rename
              </button>
              <button type="button" onClick={handleDescription} className="doc-row-dropdown-item" role="menuitem">
                <Edit3 size={13} className="doc-row-dropdown-icon" /> Edit Description
              </button>
              <button type="button" onClick={handleTags} className="doc-row-dropdown-item" role="menuitem">
                <Tag size={13} className="doc-row-dropdown-icon" /> Edit Tags
              </button>
              <button type="button" onClick={handleCategory} className="doc-row-dropdown-item" role="menuitem">
                <FolderInput size={13} className="doc-row-dropdown-icon" /> Change Category
              </button>
              <hr className="doc-row-dropdown-divider" />
            </>
          )}

          {/* ── Version Section (requires CREATE_VERSION) ── */}
          {perms.createVersion && (
            <>
              <div className="doc-ops-sub-section">Version</div>
              <button type="button" onClick={handleUploadReplacement} className="doc-row-dropdown-item" role="menuitem">
                <Upload size={13} className="doc-row-dropdown-icon" /> Upload Replacement
              </button>
              <button type="button" onClick={handleCreateVersion} className="doc-row-dropdown-item" role="menuitem">
                <FilePlus size={13} className="doc-row-dropdown-icon" /> Create New Version
              </button>
              <hr className="doc-row-dropdown-divider" />
            </>
          )}

          {/* ── PDF Page Operations (only for PDFs) ── */}
          {doc?.fileType?.toUpperCase() === 'PDF' && (
            <>
              <div className="doc-ops-sub-section">PDF Operations</div>
              <button type="button" onClick={() => handlePdfOperation('reorder')} className="doc-row-dropdown-item" role="menuitem">
                <RotateCcw size={13} className="doc-row-dropdown-icon" /> Reorder Pages
                <span className="ml-auto text-[9px] font-bold text-amber-500">Backend</span>
              </button>
              <button type="button" onClick={() => handlePdfOperation('rotate_selected')} className="doc-row-dropdown-item" role="menuitem">
                <RefreshCw size={13} className="doc-row-dropdown-icon" /> Rotate Pages
                <span className="ml-auto text-[9px] font-bold text-amber-500">Backend</span>
              </button>
              <button type="button" onClick={() => handlePdfOperation('delete_selected')} className="doc-row-dropdown-item" role="menuitem">
                <Scissors size={13} className="doc-row-dropdown-icon" /> Delete Pages
                <span className="ml-auto text-[9px] font-bold text-amber-500">Backend</span>
              </button>
              <button type="button" onClick={() => handlePdfOperation('merge')} className="doc-row-dropdown-item" role="menuitem">
                <Merge size={13} className="doc-row-dropdown-icon" /> Merge PDFs
                <span className="ml-auto text-[9px] font-bold text-amber-500">Backend</span>
              </button>
              <button type="button" onClick={() => handlePdfOperation('split')} className="doc-row-dropdown-item" role="menuitem">
                <SplitSquareVertical size={13} className="doc-row-dropdown-icon" /> Split PDF
                <span className="ml-auto text-[9px] font-bold text-amber-500">Backend</span>
              </button>
              <hr className="doc-row-dropdown-divider" />
            </>
          )}

          {/* ── Archive/Restore Section ── */}
          {(perms.archive || (isArchived && perms.restore)) && (
            <button type="button" onClick={handleArchive} className="doc-row-dropdown-item" role="menuitem">
              {isArchived ? (
                <ArchiveRestore size={13} className="doc-row-dropdown-icon" />
              ) : (
                <Archive size={13} className="doc-row-dropdown-icon" />
              )}
              {isArchived ? 'Restore from Archive' : 'Archive'}
            </button>
          )}
        </div>,
        document.body
      )}

      {/* ─── Hidden file input for replacement upload ─── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* ─── Dialogs (portaled to body so they survive the parent row
              menu closing — the menu container stays mounted but hidden,
              and these must render above every other overlay) ─── */}
      {createPortal(
        <ConfirmDialog
          open={!!confirmDialog}
          title={confirmDialog?.title || ''}
          message={confirmDialog?.message || ''}
          confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
          confirmColor={confirmDialog?.confirmColor}
          onConfirm={confirmDialog?.onConfirm}
          onCancel={() => setConfirmDialog(null)}
          busy={busy}
        />,
        document.body
      )}

      {createPortal(
        <InlineEditDialog
          open={!!editDialog}
          title={editDialog?.title || ''}
          label={editDialog?.label || ''}
          value={editDialog?.value || ''}
          placeholder={editDialog?.placeholder || ''}
          multiline={editDialog?.multiline}
          onSave={handleEditSave}
          onCancel={() => setEditDialog(null)}
          busy={busy}
        />,
        document.body
      )}

      {pdfUnavailable && createPortal(
        <PdfOperationUnavailable
          operation={pdfUnavailable}
          onClose={() => setPdfUnavailable(null)}
        />,
        document.body
      )}
    </>
  );
}

export default memo(DocumentOperationsMenu);
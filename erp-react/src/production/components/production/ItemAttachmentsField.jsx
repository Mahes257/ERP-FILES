/**
 * ItemAttachmentsField — per-Production-Item attachment picker for the
 * Create / Edit Work Order form.
 *
 * Files chosen here belong to ONE Production Item, never to the Work Order as a
 * whole. Nothing is uploaded while the form is being edited:
 *   - files picked for the item are staged in the form (`item.pendingAttachments`)
 *     and uploaded against the item's saved id when the Work Order is saved;
 *   - an attachment that already exists is marked for removal
 *     (`item.removedAttachmentIds`) and deleted on save.
 * That way a cancelled edit changes nothing, and a new item (which has no
 * database id yet) can still carry attachments.
 *
 * Existing files are read from the same shared attachment store the rest of the
 * ERP uses (GET /production-orders/{orderId}/items/{itemId}/attachments).
 */
import { useEffect, useRef, useState } from 'react';
import api from '../../../api/axiosInstance';
import Icon from '../icons/Icon';
import {
  ATTACHMENT_ACCEPT,
  fileTypeLabel,
  formatFileSize,
  getAttachmentSelectionError,
} from '../../../utils/attachmentStorage';

/** A database id — the form's own unsaved items use a non-numeric slug. */
const isSavedItemId = (value) => /^\d+$/.test(String(value ?? '').trim());

const listFromResponse = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

export default function ItemAttachmentsField({
  orderId,
  item,
  onAddFiles,
  onRemoveFile,
  onRemoveExisting,
}) {
  const fileInputRef = useRef(null);
  // One read state keyed on the record being read: a navigation can never show
  // the previous item's files, and no setState happens synchronously inside the
  // effect below.
  const [loadState, setLoadState] = useState({ key: '', items: [], failed: false });
  const [selectionError, setSelectionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const savedItemId = isSavedItemId(item?.id) ? String(item.id) : '';
  const requestKey = orderId && savedItemId ? `${orderId}:${savedItemId}` : '';
  const loading = Boolean(requestKey) && loadState.key !== requestKey;
  const existing = requestKey && loadState.key === requestKey ? loadState.items : [];
  const loadFailed = Boolean(requestKey) && loadState.key === requestKey && loadState.failed;

  const removedIds = Array.isArray(item?.removedAttachmentIds) ? item.removedAttachmentIds : [];
  const pendingFiles = Array.isArray(item?.pendingAttachments) ? item.pendingAttachments : [];

  useEffect(() => {
    if (!requestKey) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get(
          `/production-orders/${orderId}/items/${savedItemId}/attachments`
        );
        if (!cancelled) {
          setLoadState({ key: requestKey, items: listFromResponse(response?.data), failed: false });
        }
      } catch {
        // The attachments cannot be listed, but the item itself must stay
        // editable — report it inline instead of blocking the form.
        if (!cancelled) setLoadState({ key: requestKey, items: [], failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestKey, orderId, savedItemId]);

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const accepted = [];
    const rejected = [];
    files.forEach((file) => {
      const error = getAttachmentSelectionError(file);
      if (error) rejected.push(error.message);
      else accepted.push(file);
    });
    setSelectionError(rejected.join(' '));
    if (accepted.length > 0) onAddFiles(item.id, accepted);
  };

  const handleOpen = async (attachment) => {
    if (!attachment?.url) return;
    setBusyId(attachment.id);
    try {
      const response = await api.get(attachment.url, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: attachment.contentType || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setSelectionError(`"${attachment.name}" could not be opened.`);
    } finally {
      setBusyId(null);
    }
  };

  const savedAttachments = existing.filter((doc) => !removedIds.includes(doc.id));

  return (
    <div className="wo-item-attachments">
      <div className="wo-item-attach-head">
        <span className="form-label">
          <Icon name="paperclip" size={12} /> Attachments for this item
        </span>
        <button
          type="button"
          className="btn btn-secondary wo-item-attach-browse"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="upload" size={13} /> Add Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="wo-item-attach-input"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <p className="wo-item-attach-hint">
        PDF, DOCX, XLSX, PNG, JPG, STEP, STL, OBJ, GLB and similar — up to 2 GB per file.
        Files are saved with this item when you save the Work Order.
      </p>

      {loading && (
        <p className="wo-item-attach-state">
          <Icon name="refresh-cw" size={12} /> Loading saved attachments…
        </p>
      )}
      {loadFailed && (
        <p className="wo-item-attach-error">
          <Icon name="info" size={12} /> Saved attachments could not be loaded. Existing files are
          untouched; adding new ones still works.
        </p>
      )}
      {selectionError && (
        <p className="wo-item-attach-error" role="alert">
          <Icon name="info" size={12} /> {selectionError}
        </p>
      )}

      {!loading && savedAttachments.length === 0 && pendingFiles.length === 0 && (
        <p className="wo-item-attach-state">No attachments for this item yet.</p>
      )}

      {(savedAttachments.length > 0 || pendingFiles.length > 0) && (
        <ul className="wo-item-attach-list">
          {savedAttachments.map((doc) => (
            <li className="wo-item-attach-row" key={`saved-${doc.id}`}>
              <span className="wo-item-attach-icon">
                <Icon name="paperclip" size={14} />
              </span>
              <span className="wo-item-attach-name" title={doc.name}>
                {doc.name}
              </span>
              <span className="wo-item-attach-meta">
                {fileTypeLabel(doc.name, doc.contentType)}
                {doc.size ? ` · ${formatFileSize(doc.size)}` : ''}
              </span>
              <span className="wo-item-attach-actions">
                {doc.url && (
                  <button
                    type="button"
                    className="wo-item-attach-btn"
                    title="Preview"
                    disabled={busyId === doc.id}
                    onClick={() => handleOpen(doc)}
                  >
                    <Icon name="eye" size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="wo-item-attach-btn wo-item-attach-btn-danger"
                  title="Remove this attachment (applied when you save)"
                  onClick={() => onRemoveExisting(item.id, doc.id)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </li>
          ))}

          {pendingFiles.map((file, index) => (
            <li className="wo-item-attach-row wo-item-attach-row-pending" key={`pending-${file.name}-${index}`}>
              <span className="wo-item-attach-icon">
                <Icon name="file-text" size={14} />
              </span>
              <span className="wo-item-attach-name" title={file.name}>
                {file.name}
              </span>
              <span className="wo-item-attach-meta">
                {fileTypeLabel(file.name, file.type)}
                {file.size ? ` · ${formatFileSize(file.size)}` : ''}
                <span className="wo-item-attach-new"> · not saved yet</span>
              </span>
              <span className="wo-item-attach-actions">
                <button
                  type="button"
                  className="wo-item-attach-btn wo-item-attach-btn-danger"
                  title="Remove this file"
                  onClick={() => onRemoveFile(item.id, index)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

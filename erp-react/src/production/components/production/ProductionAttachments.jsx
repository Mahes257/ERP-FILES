/**
 * ProductionAttachments — Reusable attachment panel for Production modules.
 *
 * Uses the same shared ERP file system as Sales/Marketing (SalesAttachment entity),
 * served via the authenticated /v1/files/{storedName} endpoint.
 *
 * Props:
 *   apiBase   — e.g. "/v1/production-orders" or "/v1/drawings" or "/v1/models"
 *   recordId  — numeric ID of the parent record
 *   onChanged — callback after upload/delete to refresh parent data
 */
import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/axiosInstance';
import Icon from '../icons/Icon';
import './ProductionAttachments.css';

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function progressPct(entry) {
  if (!entry.total) return entry.status === 'done' ? 100 : 0;
  return Math.min(100, Math.round((entry.loaded / entry.total) * 100));
}

export default function ProductionAttachments({ apiBase, recordId, onChanged }) {
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  // Load attachments
  const loadAttachments = async () => {
    if (!apiBase || !recordId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get(`${apiBase}/${recordId}/attachments`);
      // Handle ApiResponse wrapper: { success: true, data: [...] }
      const list = Array.isArray(data) ? data
        : Array.isArray(data?.data) ? data.data
        : [];
      setAttachments(list);
    } catch (err) {
      console.error('Failed to load attachments:', err);
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttachments();
  }, [apiBase, recordId]);

  // Upload files
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    setQueue(files.map(file => ({ file, status: 'uploading', loaded: 0, total: file.size, error: null })));

    let okCount = 0;
    let failCount = 0;

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        await api.post(`${apiBase}/${recordId}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              setQueue(prev => prev.map(entry =>
                entry.file === file
                  ? { ...entry, loaded: e.loaded, total: e.total }
                  : entry
              ));
            }
          },
        });

        okCount++;
        setQueue(prev => prev.map(entry =>
          entry.file === file ? { ...entry, status: 'done' } : entry
        ));
      } catch (err) {
        failCount++;
        setQueue(prev => prev.map(entry =>
          entry.file === file ? { ...entry, status: 'error', error: err?.message || 'Upload failed' } : entry
        ));
      }
    }

    setUploading(false);
    setTimeout(() => setQueue([]), 1500);

    if (okCount > 0) {
      await loadAttachments();
      onChanged?.();
    }
  };

  // Delete attachment
  const handleDelete = async (attachment) => {
    setDeletingId(attachment.id);
    try {
      await api.delete(`${apiBase}/${recordId}/attachments/${attachment.id}`);
      await loadAttachments();
      onChanged?.();
    } catch (err) {
      console.error('Failed to delete attachment:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Preview (open in new tab via authenticated URL)
  const handlePreview = async (attachment) => {
    try {
      if (attachment.url) {
        // Fetch through the authenticated API to get the actual file
        const response = await api.get(attachment.url, { responseType: 'blob' });
        const blob = new Blob([response.data], { type: attachment.contentType || 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
    } catch {
      alert('Failed to preview file');
    }
  };

  // Download attachment
  const handleDownload = async (attachment) => {
    try {
      if (attachment.url) {
        const response = await api.get(attachment.url, { responseType: 'blob' });
        const blob = new Blob([response.data]);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = attachment.name || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
    } catch {
      alert('Failed to download file');
    }
  };

  const pendingQueue = queue.filter(e => e.status === 'uploading' || e.status === 'error');

  return (
    <div className="prod-attachments">
      {/* Drop zone */}
      <div
        className={`prod-attach-dropzone ${dragOver ? 'drag-over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer?.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
      >
        <Icon name="upload" size={24} />
        <p className="prod-attach-dropzone-text">
          Drag & drop files here or <span className="prod-attach-browse">browse</span>
        </p>
        <p className="prod-attach-dropzone-hint">
          PDF, DOCX, XLSX, PNG, JPG, STEP, STL, OBJ, GLB — up to 200 MB per file
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.step,.stp,.iges,.igs,.stl,.obj,.glb,.gltf,.txt,.csv,.zip"
        className="prod-attach-hidden-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Upload queue */}
      {pendingQueue.length > 0 && (
        <div className="prod-attach-queue">
          {pendingQueue.map(entry => (
            <div key={entry.file.name} className="prod-attach-queue-item">
              <Icon name="file-text" size={14} />
              <div className="prod-attach-queue-info">
                <span className="prod-attach-queue-name">{entry.file.name}</span>
                {entry.status === 'error' ? (
                  <span className="prod-attach-queue-error">{entry.error}</span>
                ) : (
                  <div className="prod-attach-progress-bar">
                    <div
                      className="prod-attach-progress-fill"
                      style={{ width: `${progressPct(entry)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attachment list */}
      {loading ? (
        <div className="prod-attach-loading">
          <Icon name="refresh-cw" size={16} /> Loading attachments…
        </div>
      ) : attachments.length === 0 && pendingQueue.length === 0 ? (
        <div className="prod-attach-empty">
          <Icon name="paperclip" size={28} />
          <p>No attachments uploaded yet.</p>
        </div>
      ) : (
        <div className="prod-attach-list">
          {attachments.map(doc => (
            <div key={doc.id} className="prod-attach-item">
              <div className="prod-attach-item-icon">
                <Icon name="paperclip" size={16} />
              </div>
              <div className="prod-attach-item-info">
                <span className="prod-attach-item-name">{doc.name}</span>
                <span className="prod-attach-item-meta">
                  {doc.size ? formatBytes(doc.size) : ''}
                  {doc.size && doc.uploadedAt ? ' · ' : ''}
                  {doc.uploadedAt ? formatTime(doc.uploadedAt) : ''}
                </span>
              </div>
              <div className="prod-attach-item-actions">
                {doc.url && (
                  <button
                    type="button"
                    className="prod-attach-btn"
                    title="Preview"
                    onClick={() => handlePreview(doc)}
                  >
                    <Icon name="eye" size={14} />
                  </button>
                )}
                {doc.url && (
                  <button
                    type="button"
                    className="prod-attach-btn"
                    title="Download"
                    onClick={() => handleDownload(doc)}
                  >
                    <Icon name="download" size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="prod-attach-btn prod-attach-btn-danger"
                  title="Delete"
                  disabled={deletingId === doc.id}
                  onClick={() => handleDelete(doc)}
                >
                  {deletingId === doc.id
                    ? <Icon name="refresh-cw" size={14} />
                    : <Icon name="trash" size={14} />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

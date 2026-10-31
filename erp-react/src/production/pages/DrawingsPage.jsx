import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Icon from '../components/icons/Icon';
import RowActionsDropdown from '../components/production/RowActionsDropdown';
import useProductionAccess from '../access/useProductionAccess';
import { useToast } from '../../components/Common';
import { useDrawings } from '../context/DrawingsContext';
import Drawing2DViewer from '../components/production/Drawing2DViewer';
import { canPreviewInApp, previewUnavailableReason } from '../utils/drawingFormats';
import { formatDate } from '../utils/format';
import api from '../../api/axiosInstance';
import './AcknowledgementPage.css';
import './DrawingsModels.css';

const PAGE_SIZE = 10;

export default function DrawingsPage() {
  /* Access Management: each row action is filtered by its own permission;
     the backend rejects the protected call independently. */
  const { can } = useProductionAccess();
  const allowRowAction = (label) => {
    switch (label) {
      case 'Download':
      case 'View File':
        return can('drawings', 'download');
      case 'Verify':
      case 'Reject':
        return can('drawings', 'approve');
      case 'Print':
      case 'Export PDF':
        return can('drawings', 'print');
      case 'Delete':
        return can('drawings', 'delete');
      default:
        return true;
    }
  };
  const navigate = useNavigate();
  const { records, deleteDrawing, stats, loading, backendAvailable, refresh, refreshStats } = useDrawings();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [woFilter, setWoFilter] = useState('');
  const [showFiltersOpen, setShowFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [viewRecord, setViewRecord] = useState(null);
  // In-app 2D viewer (View File): renders the drawing inside the application
  // for the formats the browser can actually display. Formats with no renderer
  // are downloaded instead — never a fake preview.
  const [inlinePreview, setInlinePreview] = useState(null);

  // Filtered rows
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((rec) => {
      if (woFilter && rec.workOrderId !== woFilter) return false;
      if (q) {
        const searchable = [
          rec.drawingNumber,
          rec.fileName,
          rec.workOrderId,
          rec.itemName,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (statusFilter !== 'All' && rec.verificationStatus !== statusFilter) return false;
      return true;
    });
  }, [records, searchQuery, statusFilter, woFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page > totalPages && totalPages > 0) setPage(totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Use backend stats when available, fall back to computed counts
  const totalCount = stats?.total ?? records.length;
  const pendingCount = stats?.pending ?? records.filter((r) => (r.verificationStatus || 'Pending') === 'Pending').length;
  const verifiedCount = stats?.verified ?? records.filter((r) => r.verificationStatus === 'Verified').length;
  const rejectedCount = stats?.rejected ?? records.filter((r) => r.verificationStatus === 'Rejected').length;

  const openAddForm = () => {
    navigate('/production/drawings/new');
  };

  const handleDelete = (rec) => {
    if (window.confirm(`Delete drawing "${rec.drawingNumber}" (${rec.fileName})?`)) {
      deleteDrawing(rec.id);
    }
  };

  const handleVerify = async (rec, status) => {
    try {
      const { drawingApi } = await import('../utils/api');
      if (status === 'Verified') {
        await drawingApi.verify(rec.id, 'Current User', '');
      } else {
        await drawingApi.reject(rec.id, 'Current User', '');
      }
      await refresh();
      await refreshStats();
    } catch (err) {
      console.error('Failed to update drawing status:', err);
    }
  };

  const API_BASE = '/v1';

  /**
   * Open a drawing. Formats the browser can genuinely render (PDF, SVG, PNG,
   * JPG/JPEG, BMP) open in the in-app 2D viewer; the rest are stored-only and
   * are handed to the authenticated download with the real reason shown —
   * capability comes from utils/drawingFormats, never from a hardcoded list.
   */
  const handleViewFile = async (rec) => {
    if (!rec.id) return;
    if (canPreviewInApp(rec)) {
      setInlinePreview(rec);
      return;
    }
    // No renderer for this format: hand over the stored original and explain
    // why nothing previewed — as a non-blocking toast, so the page stays usable
    // (a modal alert here would freeze the table on every click).
    const downloaded = await handleDownload(rec);
    if (downloaded) {
      toast.info(previewUnavailableReason(rec));
    } else {
      toast.error('Could not download the drawing file.');
    }
  };

  /**
   * Download drawing file — authenticated.
   * Returns true when the file was handed to the browser, false otherwise, so
   * callers can report the outcome (the error itself is not surfaced twice).
   */
  const handleDownload = async (rec) => {
    if (!rec.id) return false;
    try {
      const resp = await api.get(`/drawings/${rec.id}/download`, { responseType: 'blob' });
      const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = rec.fileName || `drawing-${rec.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.error('Failed to download drawing:', err);
      return false;
    }
  };

  // Keep old code path for localStorage fallback (if any)
  const _handleDownloadLegacy = (rec) => {
    if (rec.fileData) {
      // localStorage fallback: decode base64
      const [header, base64] = rec.fileData.split(',');
      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const byteString = atob(base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = rec.fileName || 'drawing-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      alert('No file data available for this record.');
    }
  };

  const uniqueWorkOrders = useMemo(() => {
    const set = new Set(records.map((r) => r.workOrderId));
    return [...set].sort();
  }, [records]);

  return (
    <div className="page">
      {loading && (
        <div style={{ padding: '8px 16px', background: '#fef3c7', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#92400e' }}>
          Loading drawings from backend...
        </div>
      )}
      {!loading && !backendAvailable && (
        <div style={{ padding: '8px 16px', background: '#fee2e2', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
          Backend unavailable — using local data. Start the backend server for real data.
        </div>
      )}
      <PageHeader
        title="Drawings"
        subtitle="Manage 2D engineering drawings (PDF, DWG, DXF) linked to Work Orders."
        actions={
          can('drawings', 'create') && (
            <button type="button" className="btn btn-primary" onClick={openAddForm}>
              <Icon name="plus" size={15} /> Add New Drawing
            </button>
          )
        }
      />

      {/* Summary cards — Production Orders KPI style */}
      <div className="ack-page-summary">
        {[
          { tone: 'neutral', icon: 'file-text', num: totalCount, label: 'Total', cardClass: 'total-card' },
          { tone: 'amber', icon: 'clock', num: pendingCount, label: 'Pending', cardClass: 'pending-card' },
          { tone: 'green', icon: 'check', num: verifiedCount, label: 'Verified', cardClass: 'completed-card' },
          { tone: 'red', icon: 'x', num: rejectedCount, label: 'Rejected', cardClass: 'rejected-card' },
        ].map((card) => {
          const filterVal = card.label === 'Total' ? 'All' : card.label;
          const isActive = statusFilter === filterVal;
          return (
            <div
              key={card.label}
              className={`ack-page-summary-card ${card.cardClass}${isActive ? ' card-active' : ''}`}
              onClick={() => { setStatusFilter(filterVal); setPage(1); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter(filterVal); setPage(1); } }}
            >
              <div className="ack-page-summary-icon-num">
                <span className="ack-page-summary-icon">
                  <Icon name={card.icon} size={19} />
                </span>
                <div className="ack-page-summary-value">{card.num}</div>
              </div>
              <div className="ack-page-summary-label">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* Toolbar — Production Orders pattern */}
      <div className="ack-toolbar">
        <div className="ack-toolbar-left">
          <button type="button" className="ack-ghost-btn" onClick={() => setShowFiltersOpen((v) => !v)}>
            <Icon name={showFiltersOpen ? 'eye-off' : 'filter'} size={11} /> {showFiltersOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button type="button" className="ack-ghost-btn" onClick={() => { refresh(); }}>
            <Icon name="refresh-cw" size={11} /> Refresh
          </button>
        </div>
        <div className="ack-toolbar-right">
          <div className="ack-search-input">
            <Icon name="search" size={14} />
            <input
              type="text"
              placeholder="Search drawing number, file name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
          <span className="ack-record-count">
            {filtered.length > 0 ? `Showing 1–${Math.min(PAGE_SIZE, filtered.length)} of ${filtered.length}` : 'No records'}
          </span>

        </div>
      </div>

      {/* Collapsible filter panel */}
      {showFiltersOpen && (
        <div className="ack-filter-panel">
          <div className="ack-filter-field">
            <label>Work Order</label>
            <select
              className="journey-status-select"
              value={woFilter}
              onChange={(e) => { setWoFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Work Orders</option>
              {uniqueWorkOrders.map((wo) => (
                <option key={wo} value={wo}>{wo}</option>
              ))}
            </select>
          </div>
          <div className="ack-filter-field">
            <label>Status</label>
            <select
              className="journey-status-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              {['All', 'Pending', 'Verified', 'Rejected'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All' : s}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <section className="orders-card">

        {/* Table */}
        <div className="table-scroll">
          {/* Sticky grid (shared Production scope): selection column frozen at
              left: 0, Drawing No. frozen beside it, Actions frozen at right: 0 —
              offsets come from the shared `.sgrid-prod` scope. */}
          <table className="data-table drawings-models-table sgrid sgrid-prod sgrid-cb sgrid-actions">
            <thead>
              <tr>
                <th className="pt-checkbox-col sgrid-pin sgrid-first">
                  <input type="checkbox" className="pt-checkbox" aria-label="Select all" />
                </th>
                <th className="sgrid-pin">Drawing No.</th>
                <th>Revision</th>
                <th>File Name</th>
                <th>Type</th>
                <th>Work Order</th>
                <th>Item / Product</th>
                <th>Uploaded By</th>
                <th>Uploaded Date</th>
                <th>Status</th>
                <th className="sgrid-pin-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                    No drawings found.
                  </td>
                </tr>
              )}
              {pageRows.map((rec) => {
                const isVerified = rec.verificationStatus === 'Verified';
                const isRejected = rec.verificationStatus === 'Rejected';
                const statusKey = (rec.verificationStatus || 'pending').toLowerCase().replace(/\s+/g, '-');
                return (
                  <tr key={rec.id} className={`kpi-row-${statusKey}`}>
                    <td className="pt-checkbox-col sgrid-pin sgrid-first">
                      <input type="checkbox" className="pt-checkbox" aria-label={`Select ${rec.drawingNumber}`} />
                    </td>
                    <td className="cell-strong sgrid-pin">
                      {rec.filePath || rec.fileData ? (
                        <a
                          href="#"
                          style={{ color: '#075E54', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleViewFile(rec); }}
                        >
                          {rec.drawingNumber}
                        </a>
                      ) : (
                        <span style={{ color: '#075E54', fontWeight: 600 }}>{rec.drawingNumber}</span>
                      )}
                    </td>
                    <td>{rec.drawingRevision}</td>
                    <td>
                      {rec.fileName ? (
                        <button
                          type="button"
                          className="btn-link"
                          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: 13 }}
                          title={rec.filePath ? 'Open file' : 'No file on server'}
                          onClick={() => handleViewFile(rec)}
                        >
                          {rec.fileName}
                        </button>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No file</span>
                      )}
                    </td>
                    <td><span className="ack-status-badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>{rec.fileType}</span></td>
                    <td>{rec.workOrderId}</td>
                    <td>{rec.itemName || '—'}</td>
                    <td>{rec.uploadedBy || '—'}</td>
                    <td>{formatDate(rec.uploadedDate)}</td>
                    <td>
                      <span className={`ack-status-badge ${isVerified ? 'ack-status-acknowledged' : isRejected ? 'tv-status-rejected' : 'ack-status-pending'}`}>
                        <Icon name={isVerified ? 'check' : isRejected ? 'x' : 'clock'} size={12} />
                        {rec.verificationStatus || 'Pending'}
                      </span>
                    </td>
                    <td className="sgrid-pin-actions">
                      <RowActionsDropdown
                        actions={[
                          {
                            label: 'Preview',
                            icon: <Icon name="eye" size={13} />,
                            onClick: () => navigate(`/production/preview/drawings/${encodeURIComponent(rec.id)}`),
                          },
                          ...(rec.filePath || rec.fileData ? [{
                            label: 'View File',
                            icon: <Icon name="external-link" size={13} />,
                            onClick: () => handleViewFile(rec),
                          }] : []),
                          {
                            label: 'Download',
                            icon: <Icon name="download" size={13} />,
                            onClick: () => handleDownload(rec),
                          },
                          ...((rec.verificationStatus || 'Pending') === 'Pending' ? [
                            {
                              label: 'Verify',
                              icon: <Icon name="check" size={13} />,
                              onClick: () => handleVerify(rec, 'Verified'),
                            },
                            {
                              label: 'Reject',
                              icon: <Icon name="x" size={13} />,
                              danger: true,
                              onClick: () => handleVerify(rec, 'Rejected'),
                            },
                          ] : []),
                          {
                            label: 'Print',
                            icon: <Icon name="printer" size={13} />,
                            onClick: () => window.print(),
                          },
                          {
                            label: 'Export PDF',
                            icon: <Icon name="download" size={13} />,
                            onClick: async () => {
                              const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
                              const doc = await PDFDocument.create();
                              const font = await doc.embedFont(StandardFonts.Helvetica);
                              const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
                              const page = doc.addPage([842, 595]);
                              let y = 560;
                              page.drawText('Drawings Report', { x: 40, y, size: 18, font: boldFont, color: rgb(0.13, 0.55, 0.13) });
                              y -= 40;
                              page.drawText(`Drawing: ${rec.drawingNumber} | Rev: ${rec.drawingRevision} | File: ${rec.fileName || 'N/A'} | Status: ${rec.verificationStatus || 'Pending'}`, { x: 40, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
                              const bytes = await doc.save();
                              const blob = new Blob([bytes], { type: 'application/pdf' });
                              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${rec.drawingNumber}.pdf`; a.click();
                            },
                          },
                          {
                            label: 'Delete',
                            icon: <Icon name="trash" size={13} />,
                            danger: true,
                            onClick: () => handleDelete(rec),
                          },
                        ].filter((action) => allowRowAction(action.label))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="sf-pagination">
            <span className="sf-pagination-info">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="sf-pagination-controls">
              <button type="button" className="btn btn-secondary sf-pagination-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <Icon name="chevron-left" size={13} /> Prev
              </button>
              <span className="sf-pagination-page">Page {page} of {totalPages}</span>
              <button type="button" className="btn btn-secondary sf-pagination-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <Icon name="chevron-right" size={13} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ===== VIEW MODAL ===== */}
      {viewRecord && (
        <div className="dm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewRecord(null); }}>
          <div className="dm-modal">
            <div className="dm-modal-header">
              <h3>Drawing Details</h3>
              <button type="button" className="btn-icon" onClick={() => setViewRecord(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="dm-modal-body">
              <div className="ack-expand-fields">
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Drawing Number</span>
                  <span className="ack-expand-value">{viewRecord.drawingNumber}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Revision</span>
                  <span className="ack-expand-value">{viewRecord.drawingRevision}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">File Name</span>
                  <span className="ack-expand-value">{viewRecord.fileName || '—'}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">File Type</span>
                  <span className="ack-expand-value">{viewRecord.fileType || '—'}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Work Order</span>
                  <span className="ack-expand-value">{viewRecord.workOrderId}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Item / Product</span>
                  <span className="ack-expand-value">{viewRecord.itemName || '—'}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Uploaded By</span>
                  <span className="ack-expand-value">{viewRecord.uploadedBy || '—'}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Uploaded Date</span>
                  <span className="ack-expand-value">{formatDate(viewRecord.uploadedDate)}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Verification Status</span>
                  <span className={`ack-status-badge ${viewRecord.verificationStatus === 'Verified' ? 'ack-status-acknowledged' : viewRecord.verificationStatus === 'Rejected' ? 'tv-status-rejected' : 'ack-status-pending'}`}>
                    <Icon name={viewRecord.verificationStatus === 'Verified' ? 'check' : viewRecord.verificationStatus === 'Rejected' ? 'x' : 'clock'} size={12} />
                    {viewRecord.verificationStatus || 'Pending'}
                  </span>
                </div>
                {viewRecord.verifiedBy && (
                  <div className="ack-expand-field">
                    <span className="ack-expand-label">Verified By</span>
                    <span className="ack-expand-value">{viewRecord.verifiedBy}</span>
                  </div>
                )}
                {viewRecord.verificationRemarks && (
                  <div className="ack-expand-field ack-expand-field-wide">
                    <span className="ack-expand-label">Verification Remarks</span>
                    <span className="ack-expand-value">{viewRecord.verificationRemarks}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="dm-modal-footer">
              {viewRecord.fileData && (
                <button type="button" className="btn btn-primary" onClick={() => handleDownload(viewRecord)}>
                  <Icon name="download" size={14} /> Download File
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setViewRecord(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== IN-APP 2D VIEWER (View File) ===== */}
      <Drawing2DViewer
        record={inlinePreview}
        onClose={() => setInlinePreview(null)}
        onDownload={handleDownload}
      />
    </div>
  );
}

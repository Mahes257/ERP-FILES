import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Icon from '../components/icons/Icon';
import RowActionsDropdown from '../components/production/RowActionsDropdown';
import useProductionAccess from '../access/useProductionAccess';

import { useModels } from '../context/ModelsContext';
import { formatDate } from '../utils/format';
import api from '../../api/axiosInstance';
import './AcknowledgementPage.css';
import './DrawingsModels.css';

const VIEWABLE_TYPES = ['SLDPRT', 'SLDASM', 'STEP', 'STP', 'IGES', 'IGS', 'GLB', 'GLTF', 'STL', 'OBJ'];
const PAGE_SIZE = 10;

/** Whether a model record carries a supported 3D file type (dot/case tolerant). */
function isModelViewable(rec) {
  const t = (rec?.fileType || '').toUpperCase().replace('.', '');
  return VIEWABLE_TYPES.includes(t);
}

export default function ModelsPage() {
  /* Access Management: each row action is filtered by its own permission;
     the backend rejects the protected call independently. */
  const { can } = useProductionAccess();
  const allowRowAction = (label) => {
    switch (label) {
      case 'Download':
        return can('models', 'download');
      case 'Verify':
      case 'Reject':
        return can('models', 'approve');
      case 'Print':
      case 'Export PDF':
        return can('models', 'print');
      case 'Delete':
        return can('models', 'delete');
      default:
        return true;
    }
  };
  const navigate = useNavigate();
  const { records, deleteModel, stats, loading, backendAvailable, refresh, refreshStats } = useModels();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [woFilter, setWoFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [revisionFilter, setRevisionFilter] = useState('All');
  const [showFiltersOpen, setShowFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [viewRecord, setViewRecord] = useState(null);


  // Filtered rows
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((rec) => {
      if (woFilter && rec.workOrderId !== woFilter) return false;
      if (q) {
        const searchable = [
          rec.modelNumber,
          rec.fileName,
          rec.workOrderId,
          rec.itemName,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (statusFilter !== 'All' && rec.verificationStatus !== statusFilter) return false;
      if (typeFilter !== 'All' && (rec.fileType || '').toUpperCase().replace('.', '') !== typeFilter) return false;
      if (revisionFilter !== 'All' && (rec.modelRevision || 'Rev A') !== revisionFilter) return false;
      return true;
    });
  }, [records, searchQuery, statusFilter, woFilter, typeFilter, revisionFilter]);

  const uniqueTypes = useMemo(
    () => [...new Set(records.map((r) => (r.fileType || '').toUpperCase().replace('.', '')))].filter(Boolean).sort(),
    [records]
  );
  const uniqueRevisions = useMemo(
    () => [...new Set(records.map((r) => r.modelRevision || 'Rev A'))].filter(Boolean).sort(),
    [records]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page > totalPages && totalPages > 0) setPage(totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalCount = stats?.total ?? records.length;
  const pendingCount = stats?.pending ?? records.filter((r) => (r.verificationStatus || 'Pending') === 'Pending').length;
  const verifiedCount = stats?.verified ?? records.filter((r) => r.verificationStatus === 'Verified').length;
  const rejectedCount = stats?.rejected ?? records.filter((r) => r.verificationStatus === 'Rejected').length;

  const openAddForm = () => {
    navigate('/production/models/new');
  };

  const handleDelete = (rec) => {
    if (window.confirm(`Delete model "${rec.modelNumber}" (${rec.fileName})?`)) {
      deleteModel(rec.id);
    }
  };

  const handleVerify = async (rec, status) => {
    try {
      const { modelApi } = await import('../utils/api');
      if (status === 'Verified') {
        await modelApi.verify(rec.id, 'Current User', '');
      } else {
        await modelApi.reject(rec.id, 'Current User', '');
      }
      await refresh();
      await refreshStats();
    } catch (err) {
      console.error('Failed to update model status:', err);
    }
  };

  /** Download a file from backend (JWT-authenticated) or legacy base64 data URL. */
  const handleDownload = async (rec) => {
    const backendId = rec.backendId || rec.id;
    if (backendId && typeof backendId === 'number') {
      try {
        const resp = await api.get(`/models/${backendId}/download`, { responseType: 'blob' });
        const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = rec.fileName || `model-${backendId}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      } catch (err) {
        console.error('Download failed:', err);
        alert('Failed to download the file. This model may have no file stored on the backend.');
        return;
      }
    }
    if (rec.fileData) {
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
      a.download = rec.fileName || 'model-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    alert('No file data available for this record.');
  };

  const uniqueWorkOrders = useMemo(() => {
    const set = new Set(records.map((r) => r.workOrderId));
    return [...set].sort();
  }, [records]);



  return (
    <div className="page">
      <PageHeader
        title="Models"
        subtitle="Manage 3D CAD models (SLDPRT, SLDASM, STEP, STP, IGES, IGS, STL, OBJ, GLB, GLTF, 3MF, FBX, WRL, VRML) linked to Work Orders."
        actions={
          <button type="button" className="btn btn-primary" onClick={openAddForm}>
            <Icon name="plus" size={15} /> Add New Model
          </button>
        }
      />

      {/* Summary cards — Production Orders KPI style */}
      <div className="ack-page-summary">
        {[
          { tone: 'neutral', icon: 'box', num: totalCount, label: 'Total', cardClass: 'total-card' },
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
          <button type="button" className="ack-ghost-btn" onClick={() => { refresh(); refreshStats(); }}>
            <Icon name="refresh-cw" size={11} /> Refresh
          </button>
        </div>
        <div className="ack-toolbar-right">
          <div className="ack-search-input">
            <Icon name="search" size={14} />
            <input
              type="text"
              placeholder="Search model number, file name..."
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
          <div className="ack-filter-field">
            <label>File Type</label>
            <select
              className="journey-status-select"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="ack-filter-field">
            <label>Revision</label>
            <select
              className="journey-status-select"
              value={revisionFilter}
              onChange={(e) => { setRevisionFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Revisions</option>
              {uniqueRevisions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <section className="orders-card">

      {/* Table */}
        <div className="table-scroll">
          {/* Sticky grid (shared Production scope): selection column frozen at
              left: 0, Model No. frozen beside it, Actions frozen at right: 0 —
              offsets come from the shared `.sgrid-prod` scope. */}
          <table className="data-table drawings-models-table sgrid sgrid-prod sgrid-cb sgrid-actions">
            <thead>
              <tr>
                <th className="pt-checkbox-col sgrid-pin sgrid-first">
                  <input type="checkbox" className="pt-checkbox" aria-label="Select all" />
                </th>
                <th className="sgrid-pin">Model No.</th>
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
                    No models found.
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
                      <input type="checkbox" className="pt-checkbox" aria-label={`Select ${rec.modelNumber}`} />
                    </td>
                    <td className="cell-strong sgrid-pin">
                      <a
                        href={`/production/models/${rec.backendId || rec.id}`}
                        title="Open model details"
                        style={{ color: '#075E54', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rec.modelNumber}
                      </a>
                    </td>
                    <td>{rec.modelRevision}</td>
                    <td>
                      {rec.fileName ? (
                        <button
                          type="button"
                          className="btn-link"
                          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: 13 }}
                          title="View 3D model in new tab"
                          onClick={() => window.open(`/model-viewer/${rec.backendId || rec.id}`, '_blank')}
                        >
                          {rec.fileName}
                        </button>
                      ) : '—'}
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
                            onClick: () => navigate(`/production/preview/models/${encodeURIComponent(rec.backendId || rec.id)}`),
                          },
                          {
                            label: 'Download',
                            icon: <Icon name="download" size={13} />,
                            onClick: () => handleDownload(rec),
                          },
                          ...(isModelViewable(rec) ? [{
                            label: 'View 3D',
                            icon: <Icon name="cube" size={13} />,
                            onClick: () => window.open(`/model-viewer/${rec.backendId || rec.id}`, '_blank'),
                          }] : []),
                          {
                            label: 'View Details',
                            icon: <Icon name="eye" size={13} />,
                            onClick: () => navigate(`/production/models/${rec.backendId || rec.id}`),
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
                              page.drawText('Models Report', { x: 40, y, size: 18, font: boldFont, color: rgb(0.13, 0.55, 0.13) });
                              y -= 40;
                              page.drawText(`Model: ${rec.modelNumber} | Rev: ${rec.modelRevision} | File: ${rec.fileName || 'N/A'} | Status: ${rec.verificationStatus || 'Pending'}`, { x: 40, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
                              const bytes = await doc.save();
                              const blob = new Blob([bytes], { type: 'application/pdf' });
                              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${rec.modelNumber}.pdf`; a.click();
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
              <h3>Model Details</h3>
              <button type="button" className="btn-icon" onClick={() => setViewRecord(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="dm-modal-body">
              <div className="ack-expand-fields">
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Model Number</span>
                  <span className="ack-expand-value">{viewRecord.modelNumber}</span>
                </div>
                <div className="ack-expand-field">
                  <span className="ack-expand-label">Revision</span>
                  <span className="ack-expand-value">{viewRecord.modelRevision}</span>
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
              {isModelViewable(viewRecord) && (
                <button type="button" className="btn btn-primary" onClick={() => handleDownload(viewRecord)}>
                  <Icon name="download" size={14} /> Download File
                </button>
              )}
              {viewRecord.id && (
                <button type="button" className="btn btn-primary" onClick={() => { setViewRecord(null); navigate(`/production/models/${viewRecord.backendId || viewRecord.id}`); }}>
                  <Icon name="eye" size={14} /> Open Details
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setViewRecord(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

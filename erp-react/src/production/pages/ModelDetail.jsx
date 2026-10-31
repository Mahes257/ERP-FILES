import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import { useModels } from '../context/ModelsContext';
import { useDrawings } from '../context/DrawingsContext';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { modelApi } from '../utils/api';
import {
  normalizeType,
  isPreviewable,
  needsBackendConversion,
  isStoredOnlyType,
  storedOnlyMessage,
} from '../services/production/modelFormats';
import { formatDate, formatDateTime } from '../utils/format';
import ProductionAttachments from '../components/production/ProductionAttachments';
import './KpiDetailsPage.css';
import './ModelDetail.css';

/** Uppercase token for a file extension / type string ('.step' -> 'STEP'). */
const typeOf = (t) => normalizeType(t);

function statusBadgeClass(status) {
  const s = (status || 'Pending').toLowerCase();
  if (s === 'verified') return 'ack-status-badge ack-status-acknowledged';
  if (s === 'rejected') return 'ack-status-badge tv-status-rejected';
  return 'ack-status-badge ack-status-pending';
}

function statusIcon(status) {
  const s = (status || 'Pending').toLowerCase();
  if (s === 'verified') return 'check';
  if (s === 'rejected') return 'x';
  return 'clock';
}

/** Convert status → label/tone for the conversion strip. */
function conversionTone(cs) {
  switch (cs) {
    case 'READY': return { cls: 'md-convert-ready', label: '3D preview ready' };
    case 'PROCESSING':
    case 'QUEUED':
    case 'PENDING': return { cls: 'md-convert-warn', label: '3D conversion in progress…' };
    case 'FAILED': return { cls: 'md-convert-err', label: '3D conversion failed' };
    case 'UNSUPPORTED': return { cls: 'md-convert-err', label: '3D preview unavailable for this format' };
    case 'NOT_REQUIRED': return { cls: 'md-convert-ready', label: 'No conversion required' };
    case 'NOT_CONVERTED': return { cls: 'md-convert-warn', label: '3D conversion pending' };
    default: return { cls: 'md-convert-warn', label: cs || 'Unknown' };
  }
}

/** Extension of a file name, e.g. 'bracket.step' -> 'STEP'. */
function extOf(name) {
  if (!name || !name.includes('.')) return '';
  return name.slice(name.lastIndexOf('.') + 1).toUpperCase();
}

/**
 * /production/models/:id — Model-centric detail page.
 *
 * Two modes (both backed by real MySQL data — nothing invented):
 *  1. Numeric/:modelNumber id matching a Model record → the model detail screen
 *     with header, info, file tree, viewer actions and verification history.
 *  2. Legacy work-order id (e.g. /production/models/WO-2024-001 from old
 *     ModelsPage "View Details" links) → grouped per-work-order model table.
 */
export default function ModelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { records: allModels, loading: modelsLoading } = useModels();
  const { records: allDrawings } = useDrawings();
  const { orders } = useProductionOrders();

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Resolve the target record (numeric id, model number, or legacy WO) ──
  const model = useMemo(() => {
    if (modelsLoading) return null;
    if (/^\d+$/.test(id)) return allModels.find((m) => String(m.id) === id) || null;
    const upper = String(id).toUpperCase();
    return (
      allModels.find((m) => (m.modelNumber || '').toUpperCase() === upper) ||
      allModels.find((m) => (m.backendId || m.id) && String(m.backendId || m.id) === id) ||
      null
    );
  }, [allModels, modelsLoading, id]);

  // Legacy mode: id is a Work Order, not a model (old "View Details" links
  // pointed at /production/models/{workOrderId}). Match a WO string or a WO
  // that has models; anything else falls through to Not Found.
  const legacyModels = useMemo(() => {
    if (model || modelsLoading) return [];
    const upper = String(id).toUpperCase();
    const byWo = allModels.filter((m) => (m.workOrderId || '').toUpperCase() === upper);
    if (byWo.length > 0) return byWo;
    const isWoString = orders.some((o) => (o.workOrder || '').toUpperCase() === upper);
    return isWoString ? [] : null; // null = not found, [] = WO with no models
  }, [model, modelsLoading, allModels, orders, id]);

  // ── Verification history (real backend audit trail) ──
  useEffect(() => {
    if (!model || typeof model.id !== 'number') { setHistory([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      try {
        const resp = await modelApi.getHistory(model.id);
        const data = resp?.data ?? resp;
        if (!cancelled && Array.isArray(data)) setHistory(data);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [model?.id]);

  // ── File tree from REAL data ──
  // GrabCAD-style grouping, using only relationships that exist:
  //   MODEL (the record)
  //     ├─ main CAD file (model file itself)
  //     ├─ converted 3D representation (when backend conversion is READY)
  //     ├─ Documents (ERP attachments uploaded against the model)
  //     └─ Related Drawings (2D drawings on the same work order + item)
  const fileTree = useMemo(() => {
    if (!model) return [];
    const nodes = [];
    const hasFile = !!model.fileName;
    const ft = typeOf(model.fileType || extOf(model.fileName));

    nodes.push({
      key: 'main',
      label: model.fileName || `${model.modelNumber} (no file uploaded)`,
      type: hasFile ? (ft || 'FILE') : '',
      icon: hasFile ? 'box' : 'file',
      previewable: hasFile && isPreviewable(ft),
      missing: !hasFile,
      onClick: hasFile && isPreviewable(ft)
        ? () => window.open(`/model-viewer/${model.backendId || model.id}`, '_blank')
        : undefined,
    });

    if (needsBackendConversion(ft) && model.conversionStatus === 'READY') {
      nodes.push({
        key: 'converted',
        label: `${model.modelNumber || 'model'}.glb — converted 3D representation`,
        type: 'GLB',
        icon: 'box',
        previewable: true,
        onClick: () => window.open(`/model-viewer/${model.backendId || model.id}`, '_blank'),
      });
    }

    // Related 2D drawings — same work order (and item when both are known).
    const related = allDrawings.filter((d) =>
      d.workOrderId === model.workOrderId &&
      (!model.workOrderItemId || !d.workOrderItemId || d.workOrderItemId === model.workOrderItemId)
    );
    related.forEach((d) => {
      nodes.push({
        key: `dwg-${d.id}`,
        label: d.fileName || d.drawingNumber || `Drawing #${d.id}`,
        type: typeOf(d.fileType || extOf(d.fileName)) || '2D',
        icon: 'file-text',
        previewable: false, // 2D files open in the system viewer / download
        doc: true,
        open: d.id,
        onClick: () => window.open(`/production/drawings/${d.id}`, '_blank'),
      });
    });

    return nodes;
  }, [model, allDrawings]);

  const [attachments, setAttachments] = useState([]);
  const modelIdForFiles = model ? (model.backendId || model.id) : null;

  const loadAttachments = async () => {
    if (typeof modelIdForFiles !== 'number') { setAttachments([]); return; }
    try {
      const { default: api } = await import('../../api/axiosInstance');
      const { data } = await api.get(`/models/${modelIdForFiles}/attachments`);
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setAttachments(list);
    } catch {
      setAttachments([]);
    }
  };

  useEffect(() => { loadAttachments(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [modelIdForFiles]);

  // ═══════════ RENDER ═══════════

  if (modelsLoading) {
    return (
      <div className="kpi-details-page">
        <div className="kpi-details-empty"><Icon name="refresh-cw" size={28} /><p>Loading model…</p></div>
      </div>
    );
  }

  // ── Legacy work-order view (old links like /production/models/WO-001) ──
  if (!model && Array.isArray(legacyModels)) {
    return (
      <div className="kpi-details-page">
        <div className="kpi-details-header">
          <button className="kpi-details-back" onClick={() => navigate('/production/models')}>
            <Icon name="arrow-left" size={16} /> Back to Models
          </button>
          <div>
            <h1>Models — {legacyModels[0].workOrderId}</h1>
            <p className="kpi-details-subtitle">
              {legacyModels.length} model{legacyModels.length === 1 ? '' : 's'} linked to this Work Order
            </p>
          </div>
        </div>
        <div className="kpi-details-table-wrap">
          <table className="kpi-details-table sgrid sgrid-prod sgrid-actions">
            <thead>
              <tr>
                <th className="sgrid-pin sgrid-first">MODEL NUMBER</th><th>REVISION</th><th>FILE</th><th>TYPE</th>
                <th>STATUS</th><th className="sgrid-pin-actions">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {legacyModels.map((rec) => (
                <tr key={rec.id}>
                  <td className="kpi-details-link sgrid-pin sgrid-first">{rec.modelNumber || '-'}</td>
                  <td>{rec.modelRevision || '-'}</td>
                  <td>{rec.fileName || '-'}</td>
                  <td>{rec.fileType || '-'}</td>
                  <td>
                    <span className={statusBadgeClass(rec.verificationStatus)}>
                      <Icon name={statusIcon(rec.verificationStatus)} size={12} /> {rec.verificationStatus || 'Pending'}
                    </span>
                  </td>
                  <td className="sgrid-pin-actions">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/production/models/${rec.backendId || rec.id}`)}>
                        Details
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => window.open(`/model-viewer/${rec.backendId || rec.id}`, '_blank')}>
                        3D View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Not found ──
  if (!model) {
    return (
      <div className="kpi-details-page">
        <div className="kpi-details-header">
          <button className="kpi-details-back" onClick={() => navigate('/production/models')}>
            <Icon name="arrow-left" size={16} /> Back to Models
          </button>
          <h1>Model Detail</h1>
        </div>
        <div className="kpi-details-empty">
          <Icon name="search" size={40} />
          <h3>Model Not Found</h3>
          <p>No model found matching "{id}".</p>
          <button className="btn btn-primary" onClick={() => navigate('/production/models')}>
            Open Models Library
          </button>
        </div>
      </div>
    );
  }

  // ── Model-centric detail ──
  const ft = typeOf(model.fileType || extOf(model.fileName));
  const conv = conversionTone(model.conversionStatus);
  const modelIdForLinks = model.backendId || model.id;

  return (
    <div className="kpi-details-page">
      {/* ── MODEL HEADER ── */}
      <div className="md-header">
        <div className="md-header-left">
          <button className="kpi-details-back" onClick={() => navigate('/production/models')}>
            <Icon name="arrow-left" size={16} /> Back
          </button>
          <div>
            <div className="md-title-row">
              <h1>{model.modelNumber || model.fileName || `Model #${model.id}`}</h1>
              <span className="ack-status-badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>{ft || '—'}</span>
              <span className={statusBadgeClass(model.verificationStatus)}>
                <Icon name={statusIcon(model.verificationStatus)} size={12} /> {model.verificationStatus || 'Pending'}
              </span>
            </div>
            <p className="md-header-sub">
              {model.modelRevision || 'Rev A'} · Work Order {model.workOrderId || '—'}
              {model.itemName ? ` · ${model.itemName}` : ''}
            </p>
          </div>
        </div>
        <div className="md-header-actions">
          {/* Recognised but not convertible here: state the capability honestly
              instead of offering a preview that cannot be produced. The original
              file stays downloadable through the button below. */}
          {model.fileName && isStoredOnlyType(ft) && (
            <span className="badge" title={storedOnlyMessage(ft)}>
              Stored — no 3D preview
            </span>
          )}
          {model.fileName && isPreviewable(ft) && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.open(`/model-viewer/${modelIdForLinks}`, '_blank')}
            >
              <Icon name="box" size={15} /> 3D View
            </button>
          )}
          {model.fileName && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const { default: api } = await import('../../api/axiosInstance');
                  const resp = await api.get(`/models/${modelIdForLinks}/download`, { responseType: 'blob' });
                  const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = model.fileName || `model-${modelIdForLinks}`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error('Download failed:', err);
                  alert('Failed to download the file.');
                }
              }}
            >
              <Icon name="download" size={15} /> Download
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/production/models')}>
            <Icon name="list" size={15} /> Models Library
          </button>
        </div>
      </div>

      {/* ── MODEL INFORMATION CARDS ── */}
      <div className="md-summary">
        <div className="md-card">
          <div className="md-card-label">Model Number</div>
          <div className="md-card-value">{model.modelNumber || '—'}</div>
        </div>
        <div className="md-card">
          <div className="md-card-label">Revision</div>
          <div className="md-card-value">{model.modelRevision || 'Rev A'}</div>
        </div>
        <div className="md-card">
          <div className="md-card-label">File Type</div>
          <div className="md-card-value">{ft || '—'}</div>
        </div>
        <div className="md-card">
          <div className="md-card-label">File Size</div>
          <div className="md-card-value">
            {model.fileSize != null ? (model.fileSize < 1048576 ? `${(model.fileSize / 1024).toFixed(1)} KB` : `${(model.fileSize / 1048576).toFixed(1)} MB`) : '—'}
          </div>
        </div>
        <div className="md-card">
          <div className="md-card-label">Uploaded By</div>
          <div className="md-card-value">{model.uploadedBy || '—'}</div>
        </div>
        <div className="md-card">
          <div className="md-card-label">Uploaded Date</div>
          <div className="md-card-value">{formatDate(model.uploadedDate)}</div>
        </div>
      </div>

      {/* ── BODY: FILES + INFO ── */}
      <div className="md-body">
        {/* Files / tree */}
        <div className="md-panel">
          <div className="md-panel-header">
            <span className="md-panel-title">Model Files</span>
          </div>
          <div className="md-tree">
            {fileTree.map((node) => (
              <button
                key={node.key}
                type="button"
                className={`md-tree-node ${node.doc ? 'md-tree-doc' : ''} ${node.missing ? 'md-tree-missing' : ''}`}
                onClick={node.onClick}
                disabled={!node.onClick}
                title={node.onClick ? 'Open' : 'No preview available for this file'}
              >
                <span className="md-tree-icon"><Icon name={node.icon} size={15} /></span>
                <span className="md-tree-name">{node.label}</span>
                {node.type && (
                  <span className="md-tree-badge ack-status-badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                    {node.type}
                  </span>
                )}
              </button>
            ))}
            {attachments.map((att) => (
              <button
                key={`att-${att.id}`}
                type="button"
                className="md-tree-node md-tree-doc"
                onClick={async () => {
                  try {
                    const { default: api } = await import('../../api/axiosInstance');
                    const resp = await api.get(att.url, { responseType: 'blob' });
                    const blob = new Blob([resp.data], { type: att.contentType || 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    setTimeout(() => URL.revokeObjectURL(url), 15000);
                  } catch { alert('Failed to preview file'); }
                }}
                title="Preview attachment"
              >
                <span className="md-tree-icon"><Icon name="paperclip" size={15} /></span>
                <span className="md-tree-name">{att.name}</span>
                <span className="md-tree-badge" style={{ fontSize: 11, color: '#64748B' }}>
                  {att.size != null ? (att.size < 1048576 ? `${(att.size / 1024).toFixed(0)} KB` : `${(att.size / 1048576).toFixed(1)} MB`) : ''}
                </span>
              </button>
            ))}
            {fileTree.length === 0 && attachments.length === 0 && (
              <div className="md-tree-empty">No files associated with this model.</div>
            )}
          </div>

          {/* Conversion status strip (real backend conversion state) */}
          {needsBackendConversion(ft) && (
            <div className={`md-convert-strip ${conv.cls}`}>
              <Icon name={model.conversionStatus === 'READY' ? 'check' : 'clock'} size={13} />
              <span>{conv.label}</span>
              {model.conversionStatus === 'FAILED' && model.conversionError && (
                <span style={{ color: '#64748B' }}>— {model.conversionError}</span>
              )}
            </div>
          )}

          {/* Attachments management — shared ERP file system */}
          <div className="md-panel-header" style={{ borderTop: '1px solid #E2E8F0' }}>
            <span className="md-panel-title">Attachments</span>
          </div>
          <div style={{ padding: '10px 16px 16px' }}>
            <ProductionAttachments
              apiBase="/models"
              recordId={model.backendId || model.id}
              onChanged={loadAttachments}
            />
          </div>
        </div>

        {/* Info + history */}
        <div className="md-panel">
          <div className="md-panel-header">
            <span className="md-panel-title">Model Information</span>
          </div>
          <div className="md-details">
            <div className="md-detail-row"><span className="md-detail-label">Model Number</span><span className="md-detail-value">{model.modelNumber || '—'}</span></div>
            <div className="md-detail-row"><span className="md-detail-label">Revision</span><span className="md-detail-value">{model.modelRevision || 'Rev A'}</span></div>
            <div className="md-detail-row"><span className="md-detail-label">File Name</span><span className="md-detail-value">{model.fileName || '—'}</span></div>
            <div className="md-detail-row"><span className="md-detail-label">File Type</span><span className="md-detail-value">{ft || '—'}</span></div>
            <div className="md-detail-row"><span className="md-detail-label">Work Order</span><span className="md-detail-value">{model.workOrderId || '—'}</span></div>
            <div className="md-detail-row"><span className="md-detail-label">Item / Product</span><span className="md-detail-value">{model.itemName || '—'}</span></div>
            <div className="md-detail-row"><span className="md-detail-label">Uploaded By</span><span className="md-detail-value">{model.uploadedBy || '—'}</span></div>
            <div className="md-detail-row"><span className="md-detail-label">Uploaded Date</span><span className="md-detail-value">{formatDate(model.uploadedDate)}</span></div>
            <div className="md-detail-row">
              <span className="md-detail-label">Verification</span>
              <span className="md-detail-value">
                <span className={statusBadgeClass(model.verificationStatus)}>
                  <Icon name={statusIcon(model.verificationStatus)} size={12} /> {model.verificationStatus || 'Pending'}
                </span>
              </span>
            </div>
            {model.verifiedBy && (
              <div className="md-detail-row"><span className="md-detail-label">Verified By</span><span className="md-detail-value">{model.verifiedBy}</span></div>
            )}
            {model.verificationDateTime && (
              <div className="md-detail-row"><span className="md-detail-label">Verified At</span><span className="md-detail-value">{formatDateTime(model.verificationDateTime)}</span></div>
            )}
            {model.verificationRemarks && (
              <div className="md-detail-row"><span className="md-detail-label">Remarks</span><span className="md-detail-value">{model.verificationRemarks}</span></div>
            )}
            {model.conversionStatus && (
              <div className="md-detail-row"><span className="md-detail-label">3D Conversion</span><span className="md-detail-value">{model.conversionStatus}</span></div>
            )}
          </div>

          <div className="md-panel-header" style={{ borderTop: '1px solid #E2E8F0' }}>
            <span className="md-panel-title">Verification History</span>
          </div>
          <div className="md-history">
            {historyLoading && <div className="md-history-empty">Loading history…</div>}
            {!historyLoading && history.length === 0 && (
              <div className="md-history-empty">No verification history recorded yet.</div>
            )}
            {history.map((h) => (
              <div key={h.id} className="md-history-item">
                <div className="md-history-action">
                  {h.action || 'Updated'}
                  {h.fromStatus && h.toStatus && h.fromStatus !== h.toStatus
                    ? `: ${h.fromStatus} → ${h.toStatus}`
                    : h.toStatus ? `: ${h.toStatus}` : ''}
                </div>
                <div className="md-history-meta">
                  {h.performedBy || 'System'} · {formatDateTime(h.performedAt)}
                </div>
                {h.remarks && <div className="md-history-remarks">{h.remarks}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useDrawings } from '../context/DrawingsContext';
import './DrawingFormPage.css';

// Kept in sync with the backend DrawingService ALLOWED_EXTENSIONS: raster/PDF/SVG
// are browser-renderable, while the CAD/plot formats (DWG, DXF, DGN, PLT, HPGL,
// HPG, CGM, EPS, AI) are accepted and stored for downstream CAD tools.
const DRAWING_EXTENSIONS = [
  '.pdf', '.dwg', '.dxf', '.dgn', '.plt', '.hpgl', '.hpg', '.cgm', '.eps', '.ai',
  '.svg', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff',
];

function getFileExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

/**
 * Create Drawing — standalone full-page view.
 *
 * Route: /production/drawings/new
 *
 * Mirrors the WorkOrderFormPage architecture: the drawings list is NOT
 * rendered behind the form; this route fully replaces the workspace
 * content.
 */
export default function DrawingFormPage() {
  const navigate = useNavigate();
  const { orders } = useProductionOrders();
  const { saveDrawing } = useDrawings();
  const fileInputRef = useRef(null);
  const draggingRef = useRef(false);

  const [formData, setFormData] = useState({
    workOrderId: '',
    workOrderItemId: '',
    drawingNumber: '',
    drawingRevision: 'Rev A',
    verificationStatus: 'Pending',
    verificationRemarks: '',
  });
  const [formError, setFormError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);

  // Build item list from all orders
  const allItems = useMemo(() => {
    const items = [];
    orders.forEach((order) => {
      const orderItems = order.items || [];
      if (orderItems.length > 0) {
        orderItems.forEach((item) => {
          items.push({
            workOrderId: order.workOrder,
            workOrderItemId: item.id,
            productName: item.productName || '—',
            productionType: item.productionType || '—',
          });
        });
      } else {
        items.push({
          workOrderId: order.workOrder,
          workOrderItemId: `${order.workOrder}-item-1`,
          productName: order.product || '—',
          productionType: order.productionType || order.department || '—',
        });
      }
    });
    return items;
  }, [orders]);

  const formItems = useMemo(() => {
    if (!formData.workOrderId) return [];
    return allItems.filter((i) => i.workOrderId === formData.workOrderId);
  }, [formData.workOrderId, allItems]);

  const backToList = () => navigate('/production/drawings');

  const applyDrawingFile = (file) => {
    if (!file) return;
    const ext = getFileExtension(file.name);
    if (!DRAWING_EXTENSIONS.includes(ext)) {
      setFormError(`Unsupported file type "${ext}". Supported: ${DRAWING_EXTENSIONS.join(', ')}`);
      return;
    }
    setSelectedFile(file);
    setFormError('');
    if (!formData.drawingNumber) {
      setFormData((prev) => ({ ...prev, drawingNumber: file.name.replace(/\.[^/.]+$/, '') }));
    }
  };

  const handleFileSelect = (e) => {
    applyDrawingFile(e.target.files?.[0]);
  };

  const handleFileDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
  };

  const handleFileDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleFileDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    draggingRef.current = false;
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = false;
    applyDrawingFile(e.dataTransfer?.files?.[0]);
  };

  const handleSave = async () => {
    if (!formData.workOrderId) {
      setFormError('Please select a Work Order.');
      return;
    }
    if (!formData.workOrderItemId) {
      setFormError('Please select an Item / Product.');
      return;
    }
    if (!formData.drawingNumber.trim()) {
      setFormError('Drawing Number is required.');
      return;
    }
    if (selectedFile) {
      const ext = getFileExtension(selectedFile.name);
      if (!DRAWING_EXTENSIONS.includes(ext)) {
        setFormError(`Unsupported file type "${ext}".`);
        return;
      }
    }

    const item = allItems.find(
      (i) => String(i.workOrderId) === String(formData.workOrderId)
        && String(i.workOrderItemId) === String(formData.workOrderItemId)
    );

    const now = new Date().toISOString();
    const record = {
      workOrderId: formData.workOrderId,
      workOrderItemId: formData.workOrderItemId,
      itemName: item?.productName || '',
      drawingNumber: formData.drawingNumber.trim(),
      drawingRevision: formData.drawingRevision.trim() || 'Rev A',
      fileName: selectedFile ? selectedFile.name : '',
      fileType: selectedFile ? getFileExtension(selectedFile.name).slice(1).toUpperCase() : '',
      file: selectedFile || null,
      uploadedBy: 'Current User',
      uploadedDate: now,
      verificationStatus: formData.verificationStatus || 'Pending',
      verificationRemarks: formData.verificationRemarks || '',
      verifiedBy: formData.verificationStatus === 'Verified' ? 'Current User' : '',
      verificationDateTime: formData.verificationStatus === 'Verified' ? now : '',
    };

    try {
      setSaving(true);
      await saveDrawing(record);
      navigate('/production/drawings');
    } catch (err) {
      setFormError(err.message || 'Failed to save drawing.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="drawing-form-page">
      {/* ===== PAGE HEADER — same visual language as WorkOrderFormPage ===== */}
      <div className="drawing-form-header">
        <div className="drawing-form-header-left">
          <div className="drawing-form-breadcrumb">
            <span
              className="drawing-form-bc-link"
              role="link"
              tabIndex={0}
              onClick={() => navigate('/production')}
            >
              Dashboard
            </span>
            <span className="drawing-form-bc-sep">›</span>
            <span className="drawing-form-bc-current">Production</span>
            <span className="drawing-form-bc-sep">›</span>
            <span
              className="drawing-form-bc-link"
              role="link"
              tabIndex={0}
              onClick={backToList}
            >
              Drawings
            </span>
            <span className="drawing-form-bc-sep">›</span>
            <span className="drawing-form-bc-current">Create Drawing</span>
          </div>
          <h1 className="drawing-form-title">
            <Icon name="file-plus" size={22} />
            Add New Drawing
          </h1>
          <p className="drawing-form-subtitle">
            Upload a 2D engineering drawing (PDF, DWG, DXF, DGN, SVG, etc.) linked to a Work Order item.
          </p>
        </div>
        <button type="button" className="drawing-form-back-btn" onClick={backToList}>
          <Icon name="chevron-left" size={14} /> Back to Drawings
        </button>
      </div>

      {/* ===== FORM ===== */}
      <div className="drawing-form-card">
        {formError && <div className="drawing-form-error">{formError}</div>}

        <div className="drawing-form-body">
          <div className="ack-expand-fields">
            {/* Work Order */}
            <div className="ack-expand-field">
              <span className="ack-expand-label">Work Order *</span>
              <select
                className="form-input"
                value={formData.workOrderId}
                onChange={(e) => setFormData((prev) => ({ ...prev, workOrderId: e.target.value, workOrderItemId: '' }))}
              >
                <option value="">Select Work Order</option>
                {[...new Set(allItems.map((i) => i.workOrderId))].sort().map((wo) => (
                  <option key={wo} value={wo}>{wo}</option>
                ))}
              </select>
            </div>

            {/* Item / Product */}
            <div className="ack-expand-field">
              <span className="ack-expand-label">Item / Product *</span>
              <select
                className="form-input"
                value={formData.workOrderItemId}
                onChange={(e) => setFormData((prev) => ({ ...prev, workOrderItemId: e.target.value }))}
                disabled={!formData.workOrderId}
              >
                <option value="">Select Item</option>
                {formItems.map((item) => (
                  <option key={item.workOrderItemId} value={item.workOrderItemId}>
                    {item.productName} ({item.productionType})
                  </option>
                ))}
              </select>
            </div>

            {/* Drawing Number */}
            <div className="ack-expand-field">
              <span className="ack-expand-label">Drawing Number *</span>
              <input
                type="text"
                className="form-input"
                value={formData.drawingNumber}
                onChange={(e) => setFormData((prev) => ({ ...prev, drawingNumber: e.target.value }))}
                placeholder="e.g. PH-001"
              />
            </div>

            {/* Drawing Revision */}
            <div className="ack-expand-field">
              <span className="ack-expand-label">Drawing Revision</span>
              <input
                type="text"
                className="form-input"
                value={formData.drawingRevision}
                onChange={(e) => setFormData((prev) => ({ ...prev, drawingRevision: e.target.value }))}
                placeholder="e.g. Rev A"
              />
            </div>

            {/* File Upload */}
            <div className="ack-expand-field ack-expand-field-wide">
              <span className="ack-expand-label">Drawing File *</span>
              <div
                className="dm-file-upload"
                onDragEnter={handleFileDragEnter}
                onDragOver={handleFileDragOver}
                onDragLeave={handleFileDragLeave}
                onDrop={handleFileDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.dwg,.dxf,.dgn,.plt,.hpgl,.hpg,.cgm,.eps,.ai,.svg,.png,.jpg,.jpeg,.bmp,.gif,.tif,.tiff"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <Icon name="upload" size={14} /> Choose File
                </button>
                {selectedFile && (
                  <span className="dm-file-name">
                    <Icon name="file" size={14} /> {selectedFile.name}
                    <span className="dm-file-type">({getFileExtension(selectedFile.name).slice(1).toUpperCase()})</span>
                  </span>
                )}
              </div>
              <small className="dm-file-hint">
                Supported: PDF (previewed in-app), SVG, PNG, JPG, JPEG, BMP, GIF (previewed in-app),
                DWG, DXF, DGN, PLT, HPGL, HPG, CGM, EPS, AI, TIF, TIFF (stored — download to open in your CAD/image tool).
              </small>
            </div>

            {/* Verification Status */}
            <div className="ack-expand-field">
              <span className="ack-expand-label">Verification Status</span>
              <select
                className="form-input"
                value={formData.verificationStatus}
                onChange={(e) => setFormData((prev) => ({ ...prev, verificationStatus: e.target.value }))}
              >
                <option value="Pending">Pending</option>
                <option value="Verified">Verified</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            {/* Verification Remarks */}
            <div className="ack-expand-field ack-expand-field-wide">
              <span className="ack-expand-label">Verification Remarks</span>
              <textarea
                className="form-textarea"
                rows={2}
                value={formData.verificationRemarks}
                onChange={(e) => setFormData((prev) => ({ ...prev, verificationRemarks: e.target.value }))}
                placeholder="Add verification remarks..."
              />
            </div>
          </div>
        </div>

        <div className="drawing-form-footer">
          <button type="button" className="btn btn-secondary" onClick={backToList}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Icon name="save" size={14} /> {saving ? 'Saving...' : 'Save Drawing'}
          </button>
        </div>
      </div>
    </div>
  );
}

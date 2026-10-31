import React, { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useModels } from '../context/ModelsContext';
import { notifyProductionDataChanged } from '../utils/dataChanged';
import api from '../../api/axiosInstance';
import './ModelFormPage.css';

// Kept in sync with the backend ModelService.ALLOWED_EXTENSIONS. Direct-view
// mesh formats, engine-converted formats, and recognised stored-only CAD
// formats are all uploadable; only the viewable ones ever claim a preview.
const MODEL_EXTENSIONS = [
  '.sldprt', '.sldasm', '.slddrw', '.step', '.stp', '.iges', '.igs', '.brep',
  '.stl', '.obj', '.glb', '.gltf', '.3mf', '.fbx', '.wrl', '.vrml', '.ply', '.dae', '.3ds',
  '.sat', '.x_t', '.x_b', '.3dm', '.jt', '.3dxml',
  '.catpart', '.catproduct', '.catdrawing',
  '.prt', '.asm', '.drw', '.ipt', '.iam', '.idw', '.par', '.dft',
  '.f3d', '.f3z', '.fcstd', '.blend', '.scad',
];

function getFileExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function getFileTypeLabel(ext) {
  const map = {
    '.sldprt': 'SLDPRT', '.sldasm': 'SLDASM', '.slddrw': 'SLDDRW',
    '.step': 'STEP', '.stp': 'STP', '.iges': 'IGES', '.igs': 'IGS', '.brep': 'BREP',
    '.stl': 'STL', '.obj': 'OBJ', '.ply': 'PLY', '.dae': 'DAE', '.3ds': '3DS',
    '.glb': 'GLB', '.gltf': 'GLTF', '.3mf': '3MF', '.fbx': 'FBX',
    '.wrl': 'WRL', '.vrml': 'VRML', '.sat': 'SAT', '.x_t': 'X_T', '.x_b': 'X_B',
    '.3dm': '3DM', '.jt': 'JT', '.3dxml': '3DXML',
    '.catpart': 'CATPART', '.catproduct': 'CATPRODUCT', '.catdrawing': 'CATDRAWING',
    '.prt': 'PRT', '.asm': 'ASM', '.drw': 'DRW', '.ipt': 'IPT', '.iam': 'IAM', '.idw': 'IDW',
    '.par': 'PAR', '.dft': 'DFT', '.f3d': 'F3D', '.f3z': 'F3Z',
    '.fcstd': 'FCSTD', '.blend': 'BLEND', '.scad': 'SCAD',
  };
  return map[ext] || ext.slice(1).toUpperCase();
}

/**
 * Create Model — standalone full-page view.
 *
 * Route: /production/models/new
 *
 * Mirrors the DrawingFormPage / WorkOrderFormPage architecture:
 * the models list is NOT rendered behind the form; this route fully
 * replaces the workspace content.
 */
export default function ModelFormPage() {
  const navigate = useNavigate();
  const { orders, loading: ordersLoading } = useProductionOrders();
  const { saveModel, backendAvailable } = useModels();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    workOrderId: '',
    workOrderItemId: '',
    modelNumber: '',
    modelRevision: 'Rev A',
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

  const backToList = () => navigate('/production/models');

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = getFileExtension(file.name);
    if (!MODEL_EXTENSIONS.includes(ext)) {
      setFormError(`Unsupported file type "${ext}". Supported: ${MODEL_EXTENSIONS.join(', ')}`);
      return;
    }
    setSelectedFile(file);
    setFormError('');
    if (!formData.modelNumber) {
      setFormData((prev) => ({ ...prev, modelNumber: file.name.replace(/\.[^/.]+$/, '') }));
    }
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
    if (!formData.modelNumber.trim()) {
      setFormError('Model Number is required.');
      return;
    }
    if (selectedFile) {
      const ext = getFileExtension(selectedFile.name);
      if (!MODEL_EXTENSIONS.includes(ext)) {
        setFormError(`Unsupported file type "${ext}".`);
        return;
      }
    }

    const item = allItems.find(
      (i) => i.workOrderId === formData.workOrderId && i.workOrderItemId === formData.workOrderItemId
    );

    const now = new Date().toISOString();
    const record = {
      workOrderId: formData.workOrderId,
      workOrderItemId: formData.workOrderItemId,
      itemName: item?.productName || '',
      modelNumber: formData.modelNumber.trim(),
      modelRevision: formData.modelRevision.trim() || 'Rev A',
      fileName: selectedFile ? selectedFile.name : '',
      fileType: selectedFile ? getFileTypeLabel(getFileExtension(selectedFile.name)) : '',
      uploadedBy: 'Current User',
      uploadedDate: now,
      verificationStatus: formData.verificationStatus || 'Pending',
      verificationRemarks: formData.verificationRemarks || '',
      verifiedBy: formData.verificationStatus === 'Verified' ? 'Current User' : '',
      verificationDateTime: formData.verificationStatus === 'Verified' ? now : '',
    };

    try {
      setSaving(true);
      if (selectedFile) {
        if (!backendAvailable) {
          throw new Error('Backend is unavailable — cannot upload the model file.');
        }
        const modelJson = {
          workOrderId: record.workOrderId,
          workOrderItemId: record.workOrderItemId,
          itemName: record.itemName || '',
          modelNumber: record.modelNumber,
          modelRevision: record.modelRevision || 'Rev A',
          uploadedBy: record.uploadedBy || 'Current User',
        };
        const formDataObj = new FormData();
        formDataObj.append('model', new Blob([JSON.stringify(modelJson)], { type: 'application/json' }));
        formDataObj.append('file', selectedFile);
        const MULTIPART = { 'Content-Type': 'multipart/form-data' };
        // 409 (duplicate model number) is an expected business answer: resolve
        // it so the catch below can show the backend's real message inline
        // instead of the global error page replacing this form.
        const resp = await api.post('/models', formDataObj, {
          headers: MULTIPART,
          validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
        });
        const data = resp?.data;
        if (!data?.success) {
          throw new Error(data?.message || 'Upload failed');
        }
      } else {
        await saveModel(record);
      }
      notifyProductionDataChanged();
      navigate('/production/models');
    } catch (err) {
      const backendMsg = err?.response?.data?.message
        || err?.response?.data?.error
        || err?.message
        || 'Failed to save model.';
      setFormError(backendMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="model-form-page">
      {/* ===== PAGE HEADER — same visual language as DrawingFormPage ===== */}
      <div className="model-form-header">
        <div className="model-form-header-left">
          <div className="model-form-breadcrumb">
            <span
              className="model-form-bc-link"
              role="link"
              tabIndex={0}
              onClick={() => navigate('/production')}
            >
              Dashboard
            </span>
            <span className="model-form-bc-sep">›</span>
            <span className="model-form-bc-current">Production</span>
            <span className="model-form-bc-sep">›</span>
            <span
              className="model-form-bc-link"
              role="link"
              tabIndex={0}
              onClick={backToList}
            >
              Models
            </span>
            <span className="model-form-bc-sep">›</span>
            <span className="model-form-bc-current">Create Model</span>
          </div>
          <h1 className="model-form-title">
            <Icon name="box" size={22} />
            Add New Model
          </h1>
          <p className="model-form-subtitle">
            Upload a 3D CAD model (SLDPRT, STEP, STL, etc.) linked to a Work Order item.
          </p>
        </div>
        <button type="button" className="model-form-back-btn" onClick={backToList}>
          <Icon name="chevron-left" size={14} /> Back to Models
        </button>
      </div>

      {/* ===== FORM ===== */}
      <div className="model-form-card">
        {formError && <div className="model-form-error">{formError}</div>}

        <div className="model-form-body">
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
              {formData.workOrderId && ordersLoading && (
                <small className="dm-file-hint">Loading items/products…</small>
              )}
              {formData.workOrderId && !ordersLoading && formItems.length === 0 && (
                <small className="dm-file-hint" style={{ color: '#b45309' }}>
                  No items/products available for this Work Order.
                </small>
              )}
            </div>

            {/* Model Number */}
            <div className="ack-expand-field">
              <span className="ack-expand-label">Model Number *</span>
              <input
                type="text"
                className="form-input"
                value={formData.modelNumber}
                onChange={(e) => setFormData((prev) => ({ ...prev, modelNumber: e.target.value }))}
                placeholder="e.g. PH-3D-001"
              />
            </div>

            {/* Model Revision */}
            <div className="ack-expand-field">
              <span className="ack-expand-label">Model Revision</span>
              <input
                type="text"
                className="form-input"
                value={formData.modelRevision}
                onChange={(e) => setFormData((prev) => ({ ...prev, modelRevision: e.target.value }))}
                placeholder="e.g. Rev A"
              />
            </div>

            {/* File Upload */}
            <div className="ack-expand-field ack-expand-field-wide">
              <span className="ack-expand-label">Model File *</span>
              <div className="dm-file-upload">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sldprt,.sldasm,.slddrw,.step,.stp,.iges,.igs,.brep,.stl,.obj,.glb,.gltf,.3mf,.fbx,.wrl,.vrml,.ply,.dae,.3ds,.sat,.x_t,.x_b,.3dm,.jt,.3dxml,.catpart,.catproduct,.catdrawing,.prt,.asm,.drw,.ipt,.iam,.idw,.par,.dft,.f3d,.f3z,.fcstd,.blend,.scad"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <Icon name="upload" size={14} /> Choose File
                </button>
                {selectedFile && (
                  <span className="dm-file-name">
                    <Icon name="file" size={14} /> {selectedFile.name}
                    <span className="dm-file-type">({getFileTypeLabel(getFileExtension(selectedFile.name))})</span>
                  </span>
                )}
              </div>
              <small className="dm-file-hint">
                Supported 3D: SLDPRT, SLDASM, STEP/STP, IGES/IGS, BREP, STL, OBJ, GLB, GLTF, 3MF, FBX, WRL, PLY, DAE, 3DS.
                Native CAD (SLDDRW, CATIA, NX, Creo, Inventor, Solid Edge, SAT, Parasolid, JT, Rhino, Fusion, FreeCAD, Blender, OpenSCAD)
                is stored and downloadable — export to STEP for an in-app preview.
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

        <div className="model-form-footer">
          <button type="button" className="btn btn-secondary" onClick={backToList}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Icon name="save" size={14} /> {saving ? 'Saving...' : 'Save Model'}
          </button>
        </div>
      </div>
    </div>
  );
}

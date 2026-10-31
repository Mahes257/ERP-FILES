import React, { useState } from 'react';
import Icon from '../icons/Icon';
import { useDrawings } from '../../context/DrawingsContext';
import { useModels } from '../../context/ModelsContext';
import { formatDate } from '../../utils/format';
import './ItemDrawingsModels.css';

const DRAWING_EXTENSIONS = ['.pdf', '.dwg', '.dxf'];
const MODEL_EXTENSIONS = ['.sldprt', '.sldasm', '.step', '.stp', '.iges', '.igs'];

function getFileExtension(fileName) {
  if (!fileName) return '';
  const ext = fileName.lastIndexOf('.') !== -1 ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
  return ext;
}

function isDrawingFile(fileName) {
  return DRAWING_EXTENSIONS.includes(getFileExtension(fileName));
}

function isModelFile(fileName) {
  return MODEL_EXTENSIONS.includes(getFileExtension(fileName));
}

/**
 * DrawingsTable — shows 2D engineering drawings for a specific Work Order item.
 */
function DrawingsTable({ workOrderId, itemId, itemName }) {
  const { getDrawingsForItem, saveDrawing, deleteDrawing } = useDrawings();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    drawingNumber: '',
    drawingRevision: '',
    fileName: '',
    fileType: '',
  });

  const drawings = getDrawingsForItem(workOrderId, itemId);

  const resetForm = () => {
    setForm({ drawingNumber: '', drawingRevision: '', fileName: '', fileType: '' });
    setAdding(false);
    setEditing(null);
  };

  const handleSave = () => {
    if (!form.drawingNumber || !form.fileName) return;
    const ext = getFileExtension(form.fileName);
    saveDrawing({
      ...(editing ? { id: editing.id } : {}),
      workOrderId,
      workOrderItemId: itemId,
      drawingNumber: form.drawingNumber,
      drawingRevision: form.drawingRevision || 'Rev A',
      fileName: form.fileName,
      fileType: ext.replace('.', '').toUpperCase() || form.fileType,
      uploadedBy: 'Current User',
      uploadedDate: new Date().toISOString(),
      verificationStatus: editing?.verificationStatus || 'Pending',
      verifiedBy: editing?.verifiedBy || '',
      verificationDateTime: editing?.verificationDateTime || '',
      verificationRemarks: editing?.verificationRemarks || '',
    });
    resetForm();
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this drawing?')) {
      deleteDrawing(id);
    }
  };

  const handleVerify = (drawing, status) => {
    saveDrawing({
      ...drawing,
      verificationStatus: status,
      verifiedBy: 'Current User',
      verificationDateTime: new Date().toISOString(),
    });
  };

  return (
    <div className="dm-section">
      <div className="dm-section-head">
        <h4 className="dm-section-title">
          <Icon name="file-text" size={14} /> Drawings — {itemName}
        </h4>
        <button type="button" className="btn btn-primary dm-add-btn" onClick={() => { resetForm(); setAdding(true); }}>
          <Icon name="plus" size={13} /> Add Drawing
        </button>
      </div>

      {/* Add/Edit Form */}
      {(adding || editing) && (
        <div className="dm-form">
          <div className="dm-form-row">
            <div className="dm-form-field">
              <label>Drawing Number *</label>
              <input value={form.drawingNumber} onChange={(e) => setForm({ ...form, drawingNumber: e.target.value })} placeholder="e.g. DWG-001" />
            </div>
            <div className="dm-form-field">
              <label>Revision</label>
              <input value={form.drawingRevision} onChange={(e) => setForm({ ...form, drawingRevision: e.target.value })} placeholder="e.g. Rev A" />
            </div>
            <div className="dm-form-field">
              <label>File Name *</label>
              <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="e.g. pump-housing.pdf" />
            </div>
            <div className="dm-form-actions">
              <button type="button" className="btn btn-primary" onClick={handleSave}>
                <Icon name="check" size={13} /> Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </div>
          <p className="dm-form-hint">Supported: PDF, DWG, DXF</p>
        </div>
      )}

      {/* Drawings Table */}
      {drawings.length > 0 ? (
        <div className="dm-table-wrap">
          <table className="dm-table sgrid sgrid-prod sgrid-actions">
            <thead>
              <tr>
                <th className="sgrid-pin sgrid-first">Drawing No.</th>
                <th>Revision</th>
                <th>File Name</th>
                <th>File Type</th>
                <th>Uploaded By</th>
                <th>Date</th>
                <th>Status</th>
                <th className="sgrid-pin-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drawings.map((d) => (
                <tr key={d.id}>
                  <td className="cell-strong sgrid-pin sgrid-first">{d.drawingNumber}</td>
                  <td>{d.drawingRevision}</td>
                  <td>{d.fileName}</td>
                  <td><span className="dm-file-badge">{d.fileType}</span></td>
                  <td>{d.uploadedBy}</td>
                  <td>{formatDate(d.uploadedDate)}</td>
                  <td>
                    <span className={`dm-status dm-status--${(d.verificationStatus || 'pending').toLowerCase()}`}>
                      {d.verificationStatus || 'Pending'}
                    </span>
                  </td>
                  <td className="sgrid-pin-actions">
                    <div className="dm-actions">
                      {d.verificationStatus !== 'Verified' && (
                        <button type="button" className="dm-action-btn dm-action-verify" title="Verify" onClick={() => handleVerify(d, 'Verified')}>
                          <Icon name="check" size={13} />
                        </button>
                      )}
                      {d.verificationStatus !== 'Rejected' && d.verificationStatus !== 'Verified' && (
                        <button type="button" className="dm-action-btn dm-action-reject" title="Reject" onClick={() => handleVerify(d, 'Rejected')}>
                          <Icon name="x" size={13} />
                        </button>
                      )}
                      <button type="button" className="dm-action-btn" title="Edit" onClick={() => { setEditing(d); setForm({ drawingNumber: d.drawingNumber, drawingRevision: d.drawingRevision, fileName: d.fileName, fileType: d.fileType }); setAdding(true); }}>
                        <Icon name="edit" size={13} />
                      </button>
                      <button type="button" className="dm-action-btn dm-action-delete" title="Delete" onClick={() => handleDelete(d.id)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dm-empty">
          <Icon name="file-text" size={18} />
          <span>No drawings added yet.</span>
        </div>
      )}
    </div>
  );
}

/**
 * ModelsTable — shows 3D CAD models for a specific Work Order item.
 */
function ModelsTable({ workOrderId, itemId, itemName }) {
  const { getModelsForItem, saveModel, deleteModel } = useModels();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    modelNumber: '',
    modelRevision: '',
    fileName: '',
    fileType: '',
  });

  const models = getModelsForItem(workOrderId, itemId);

  const resetForm = () => {
    setForm({ modelNumber: '', modelRevision: '', fileName: '', fileType: '' });
    setFormError('');
    setAdding(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.modelNumber || !form.fileName) return;
    const ext = getFileExtension(form.fileName);
    try {
      await saveModel({
        ...(editing ? { id: editing.id } : {}),
        workOrderId,
        workOrderItemId: itemId,
        modelNumber: form.modelNumber,
        modelRevision: form.modelRevision || 'Rev A',
        fileName: form.fileName,
        fileType: ext.replace('.', '').toUpperCase() || form.fileType,
        uploadedBy: 'Current User',
        uploadedDate: new Date().toISOString(),
        verificationStatus: editing?.verificationStatus || 'Pending',
        verifiedBy: editing?.verifiedBy || '',
        verificationDateTime: editing?.verificationDateTime || '',
        verificationRemarks: editing?.verificationRemarks || '',
      });
      resetForm();
    } catch (err) {
      // A refused save (e.g. duplicate model number) shows the backend's real
      // message inline instead of vanishing into an unhandled rejection.
      setFormError(err?.message || 'Failed to save model.');
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this model?')) {
      deleteModel(id);
    }
  };

  const handleVerify = (model, status) => {
    saveModel({
      ...model,
      verificationStatus: status,
      verifiedBy: 'Current User',
      verificationDateTime: new Date().toISOString(),
    });
  };

  const openViewer = (modelId) => {
    window.open(`/model-viewer/${modelId}`, '_blank');
  };

  return (
    <div className="dm-section">
      <div className="dm-section-head">
        <h4 className="dm-section-title">
          <Icon name="box" size={14} /> Models — {itemName}
        </h4>
        <button type="button" className="btn btn-primary dm-add-btn" onClick={() => { resetForm(); setAdding(true); }}>
          <Icon name="plus" size={13} /> Add Model
        </button>
      </div>

      {/* Add/Edit Form */}
      {(adding || editing) && (
        <div className="dm-form">
          {formError && <div className="dm-form-hint" style={{ color: '#b91c1c' }}>{formError}</div>}
          <div className="dm-form-row">
            <div className="dm-form-field">
              <label>Model Number *</label>
              <input value={form.modelNumber} onChange={(e) => setForm({ ...form, modelNumber: e.target.value })} placeholder="e.g. MDL-001" />
            </div>
            <div className="dm-form-field">
              <label>Revision</label>
              <input value={form.modelRevision} onChange={(e) => setForm({ ...form, modelRevision: e.target.value })} placeholder="e.g. Rev A" />
            </div>
            <div className="dm-form-field">
              <label>File Name *</label>
              <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="e.g. pump-housing.SLDPRT" />
            </div>
            <div className="dm-form-actions">
              <button type="button" className="btn btn-primary" onClick={handleSave}>
                <Icon name="check" size={13} /> Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Models Table */}
      {models.length > 0 ? (
        <div className="dm-table-wrap">
          <table className="dm-table sgrid sgrid-prod sgrid-actions">
            <thead>
              <tr>
                <th className="sgrid-pin sgrid-first">Model No.</th>
                <th>Revision</th>
                <th>File Name</th>
                <th>File Type</th>
                <th>Uploaded By</th>
                <th>Date</th>
                <th>Status</th>
                <th className="sgrid-pin-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td className="cell-strong sgrid-pin sgrid-first">{m.modelNumber}</td>
                  <td>{m.modelRevision}</td>
                  <td>{m.fileName}</td>
                  <td><span className="dm-file-badge">{m.fileType}</span></td>
                  <td>{m.uploadedBy}</td>
                  <td>{formatDate(m.uploadedDate)}</td>
                  <td>
                    <span className={`dm-status dm-status--${(m.verificationStatus || 'pending').toLowerCase()}`}>
                      {m.verificationStatus || 'Pending'}
                    </span>
                  </td>
                  <td className="sgrid-pin-actions">
                    <div className="dm-actions">
                      <button type="button" className="dm-action-btn dm-action-view" title="View 3D" onClick={() => openViewer(m.id)}>
                        <Icon name="box" size={13} />
                      </button>
                      {m.verificationStatus !== 'Verified' && (
                        <button type="button" className="dm-action-btn dm-action-verify" title="Verify" onClick={() => handleVerify(m, 'Verified')}>
                          <Icon name="check" size={13} />
                        </button>
                      )}
                      {m.verificationStatus !== 'Rejected' && m.verificationStatus !== 'Verified' && (
                        <button type="button" className="dm-action-btn dm-action-reject" title="Reject" onClick={() => handleVerify(m, 'Rejected')}>
                          <Icon name="x" size={13} />
                        </button>
                      )}
                      <button type="button" className="dm-action-btn" title="Edit" onClick={() => { setEditing(m); setForm({ modelNumber: m.modelNumber, modelRevision: m.modelRevision, fileName: m.fileName, fileType: m.fileType }); setAdding(true); }}>
                        <Icon name="edit" size={13} />
                      </button>
                      <button type="button" className="dm-action-btn dm-action-delete" title="Delete" onClick={() => handleDelete(m.id)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dm-empty">
          <Icon name="box" size={18} />
          <span>No models added yet.</span>
        </div>
      )}
    </div>
  );
}

/**
 * ItemDrawingsModels — wraps DrawingsTable and ModelsTable for a single Work Order item.
 */
export default function ItemDrawingsModels({ order, item }) {
  if (!order || !item) return null;

  return (
    <div className="item-dm-container">
      <DrawingsTable workOrderId={order.workOrder} itemId={item.id || item.productName} itemName={item.productName || item.product || 'Item'} />
      <ModelsTable workOrderId={order.workOrder} itemId={item.id || item.productName} itemName={item.productName || item.product || 'Item'} />
    </div>
  );
}

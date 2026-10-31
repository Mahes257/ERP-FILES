import React, { useRef, useState } from 'react';
import Icon from '../icons/Icon';
import { formatDate, formatFileSize } from '../../utils/format';
import './DocumentsTab.css';

/**
 * Document section — local file selection only (no backend storage).
 * Shows the Work Order's drawing/pattern reference (Fabrication /
 * Casting) so a drawing file can be associated with its number.
 */
export default function DocumentsTab({ order }) {
  const [documents, setDocuments] = useState([]);
  const inputRef = useRef(null);

  // The production-type reference (separate from Work Order / Sales
  // Order / Product Code) — Casting → Pattern Number, Fabrication →
  // Drawing Number. No fake drawing files are ever created.
  const reference =
    order?.productionType === 'Fabrication'
      ? { label: 'Drawing Number', value: order.drawingNumber }
      : order?.productionType === 'Casting'
        ? { label: 'Pattern Number', value: order.patternNumber }
        : null;

  const handleFiles = (e) => {
    const incoming = Array.from(e.target.files).map((file) => ({
      id: `${file.name}-${Date.now()}`,
      name: file.name,
      type: file.type || file.name.split('.').pop().toUpperCase(),
      size: file.size,
      date: new Date().toISOString(),
    }));
    if (incoming.length) setDocuments((prev) => [...incoming, ...prev]);
    e.target.value = '';
  };

  const removeDocument = (id) => setDocuments((prev) => prev.filter((doc) => doc.id !== id));

  return (
    <div>
      {reference && (
        <div className="docs-reference">
          <span className="docs-reference-label">{reference.label}</span>
          <span className="docs-reference-value">{reference.value || '—'}</span>
          <span className="docs-reference-note">
            {reference.value
              ? 'Associated with the documents below.'
              : 'No reference recorded for this Work Order yet.'}
          </span>
        </div>
      )}
      <div className="docs-toolbar">
        <span className="doc-count">{documents.length} document{documents.length === 1 ? '' : 's'}</span>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current.click()}>
          <Icon name="upload" size={15} /> Add Document
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={handleFiles} />
      </div>

      {documents.length === 0 ? (
        <p className="tab-empty">No documents added yet. Use "Add Document" to attach files.</p>
      ) : (
        <ul className="doc-list">
          {documents.map((doc) => (
            <li key={doc.id} className="doc-item">
              <span className="doc-icon">
                <Icon name="file-text" size={17} />
              </span>
              <span className="doc-main">
                <span className="doc-name">{doc.name}</span>
                <span className="doc-meta">
                  {doc.type} · {formatFileSize(doc.size)} · {formatDate(doc.date.slice(0, 10))}
                </span>
              </span>
              <button
                type="button"
                className="doc-remove"
                aria-label={`Remove ${doc.name}`}
                onClick={() => removeDocument(doc.id)}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

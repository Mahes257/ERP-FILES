import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Icon from '../components/icons/Icon';
import PackingListDocument from '../components/production/packing/PackingListDocument';
import { usePacking } from '../context/PackingContext';
import { ensureBoxes } from '../data/packing';
import './Packing.css';

/**
 * Packing List Preview page — full-page view with Edit/Save/Print/Download.
 * Route: /production/packing/:id/preview
 *
 * Workflow:
 *   View → Edit → Save → View (with persisted changes)
 *   Print / Download PDF
 */
export default function PackingPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { records, updatePackingRecord } = usePacking();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Find the record by ID
  const record = useMemo(() => {
    const found = records.find((r) => r.id === id);
    return found ? ensureBoxes(found) : null;
  }, [records, id]);

  // Draft is the editable copy
  const displayRecord = useMemo(() => draft || record, [draft, record]);

  // Handle field changes in edit mode
  const handleFieldChange = useCallback((field, value) => {
    setDraft((prev) => {
      const base = prev || (record ? { ...ensureBoxes(record) } : {});
      return { ...base, [field]: value };
    });
  }, [record]);

  // Save changes
  const handleSave = useCallback(async () => {
    if (!draft || !record) return;
    setSaving(true);
    try {
      updatePackingRecord(record.id, draft);
      setDraft(null);
      setEditing(false);
      setToast({ type: 'success', message: 'Packing List saved successfully.' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: 'error', message: `Save failed: ${err.message || 'Unknown error'}` });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [draft, record, updatePackingRecord]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setDraft(null);
    setEditing(false);
  }, []);

  // Print — clones the document into a clean window for printing
  const handlePrint = useCallback(() => {
    const docEl = document.querySelector('.pl-document');
    if (!docEl) { alert('Document not found.'); return; }
    const clone = docEl.cloneNode(true);
    const plNumber = record?.id || 'PL';
    const w = window.open('', '_blank');
    if (!w) { alert('Popup blocked. Please allow popups for this site.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Packing List ${plNumber}</title>
<style>
@page { size: A4 portrait; margin: 15mm 18mm; }
body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #111; line-height: 1.4; }
* { box-sizing: border-box; }
.pl-page { padding: 0 8mm; }
.pl-page-break { page-break-after: always; break-after: page; height: 0; }
.pl-doc-title { text-align: center; font-size: 22px; font-weight: 800; letter-spacing: 2px; margin-bottom: 14px; border-bottom: 3px double #111; padding-bottom: 8px; }
.pl-header-table { width: 100%; border-collapse: collapse; border: 1px solid #111; font-size: 12px; }
.pl-header-table td { border: 1px solid #111; padding: 8px 12px; vertical-align: top; }
.pl-hdr-label { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
.pl-hdr-company { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
.pl-hdr-address { font-size: 11.5px; line-height: 1.4; margin-bottom: 2px; }
.pl-hdr-label-inline { font-weight: 700; font-size: 11.5px; }
.pl-hdr-value-inline { font-size: 11.5px; }
.pl-hdr-value-bold { font-weight: 700; font-size: 12px; }
.pl-hdr-buyer-name { font-weight: 700; font-size: 12px; margin-bottom: 2px; }
.pl-ship-table { width: 100%; border-collapse: collapse; border: 1px solid #111; border-top: none; font-size: 12px; }
.pl-ship-table td { border: 1px solid #111; padding: 8px 12px; vertical-align: top; }
.pl-ship-cell { width: 50%; }
.pl-ship-label { font-weight: 700; font-size: 11.5px; }
.pl-ship-value { font-weight: 700; font-size: 12px; }
.pl-packing-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
.pl-packing-table th, .pl-packing-table td { border: 1px solid #111; padding: 6px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
.pl-packing-table thead th { background: #f2f2f2; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; text-align: center; font-weight: 700; }
.pl-packing-table thead { display: table-header-group; }
.pl-packing-table tfoot { display: table-footer-group; }
.pl-packing-table tr { page-break-inside: avoid; }
.pl-col-no { width: 5%; } .pl-col-marks { width: 14%; } .pl-col-pkg { width: 15%; } .pl-col-desc { width: 29%; } .pl-col-qty { width: 9%; text-align: center; } .pl-col-net { width: 12%; text-align: center; } .pl-col-gross { width: 16%; text-align: center; }
.pl-center { text-align: center !important; } .pl-strong { font-weight: 700; }
.pl-box-row td { background: #fafafa; }
.pl-box-pkg-cell { text-align: center; font-weight: 700; vertical-align: middle !important; }
.pl-box-pkg-text { font-weight: 700; font-size: 12px; }
.pl-box-dim-text { font-size: 11px; margin-top: 2px; }
.pl-desc-multiline { white-space: pre-line; line-height: 1.3; font-size: 11.5px; word-break: break-word; overflow-wrap: anywhere; }
.pl-desc { word-break: break-word; overflow-wrap: anywhere; white-space: normal; }
.pl-total-row td { background: #f2f2f2; font-weight: 700; font-size: 12px; }
.pl-weight-summary-section { margin-top: 16px; }
.pl-weight-summary-title { font-weight: 700; font-size: 12px; margin-bottom: 6px; padding: 4px 8px; background: #f2f2f2; border: 1px solid #111; }
.pl-weight-summary-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.pl-weight-summary-table th, .pl-weight-summary-table td { border: 1px solid #111; padding: 5px 8px; text-align: left; }
.pl-weight-summary-table th { background: #f2f2f2; font-weight: 700; font-size: 10px; text-transform: uppercase; }
.pl-weight-lines { margin-top: 14px; font-size: 12.5px; line-height: 1.6; }
.pl-weight-line { margin-bottom: 2px; }
.pl-footer-section { page-break-inside: avoid; margin-top: 16px; }
.pl-declaration-ref { margin-top: 0; }
.pl-decl-title { font-weight: 700; font-size: 12.5px; margin-bottom: 4px; }
.pl-decl-text { font-size: 12px; line-height: 1.5; padding-left: 20px; }
.pl-sign-area { text-align: right; margin-top: 40px; page-break-inside: avoid; }
.pl-sign-block { display: inline-block; text-align: center; width: 220px; }
.pl-sign-company { font-weight: 700; font-size: 13px; margin-bottom: 8px; color: #111; }
.pl-sign-img { display: block; max-width: 140px; max-height: 50px; margin: 0 auto 6px; object-fit: contain; }
.pl-sign-seal { width: 140px; height: 140px; margin: 8px auto; } .pl-seal-svg { width: 100%; height: 100%; }
.pl-sign-line { width: 180px; height: 1px; background: #111; margin: 14px auto 6px; }
.pl-sign-label { font-size: 12px; color: #333; }
</style></head><body></body></html>`);
    w.document.close();
    w.document.body.appendChild(clone);
    w.onload = () => { w.print(); };
  }, [record]);

  // Download PDF — clones the document into a new window with inline styles
  const handleDownload = useCallback(() => {
    const docEl = document.querySelector('.pl-document');
    if (!docEl) { alert('Document not found.'); return; }
    const clone = docEl.cloneNode(true);
    const plNumber = record?.id || 'PL';
    const w = window.open('', '_blank');
    if (!w) { alert('Popup blocked. Please allow popups for this site.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Packing List ${plNumber}</title>
<style>
@page { size: A4 portrait; margin: 15mm 18mm; }
body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #111; line-height: 1.4; }
* { box-sizing: border-box; }
.pl-page { padding: 0 8mm; }
.pl-page-break { page-break-after: always; break-after: page; height: 0; }
.pl-doc-title { text-align: center; font-size: 22px; font-weight: 800; letter-spacing: 2px; margin-bottom: 14px; border-bottom: 3px double #111; padding-bottom: 8px; }
.pl-header-table { width: 100%; border-collapse: collapse; border: 1px solid #111; font-size: 12px; }
.pl-header-table td { border: 1px solid #111; padding: 8px 12px; vertical-align: top; }
.pl-hdr-label { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
.pl-hdr-company { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
.pl-hdr-address { font-size: 11.5px; line-height: 1.4; margin-bottom: 2px; }
.pl-hdr-label-inline { font-weight: 700; font-size: 11.5px; }
.pl-hdr-value-inline { font-size: 11.5px; }
.pl-hdr-value-bold { font-weight: 700; font-size: 12px; }
.pl-hdr-buyer-name { font-weight: 700; font-size: 12px; margin-bottom: 2px; }
.pl-ship-table { width: 100%; border-collapse: collapse; border: 1px solid #111; border-top: none; font-size: 12px; }
.pl-ship-table td { border: 1px solid #111; padding: 8px 12px; vertical-align: top; }
.pl-ship-cell { width: 50%; }
.pl-ship-label { font-weight: 700; font-size: 11.5px; }
.pl-ship-value { font-weight: 700; font-size: 12px; }
.pl-packing-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
.pl-packing-table th, .pl-packing-table td { border: 1px solid #111; padding: 6px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
.pl-packing-table thead th { background: #f2f2f2; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; text-align: center; font-weight: 700; }
.pl-packing-table thead { display: table-header-group; }
.pl-packing-table tfoot { display: table-footer-group; }
.pl-packing-table tr { page-break-inside: avoid; }
.pl-col-no { width: 5%; } .pl-col-marks { width: 14%; } .pl-col-pkg { width: 15%; } .pl-col-desc { width: 29%; } .pl-col-qty { width: 9%; text-align: center; } .pl-col-net { width: 12%; text-align: center; } .pl-col-gross { width: 16%; text-align: center; }
.pl-center { text-align: center !important; } .pl-strong { font-weight: 700; }
.pl-box-row td { background: #fafafa; }
.pl-box-pkg-cell { text-align: center; font-weight: 700; vertical-align: middle !important; }
.pl-box-pkg-text { font-weight: 700; font-size: 12px; }
.pl-box-dim-text { font-size: 11px; margin-top: 2px; }
.pl-desc-multiline { white-space: pre-line; line-height: 1.3; font-size: 11.5px; word-break: break-word; overflow-wrap: anywhere; }
.pl-desc { word-break: break-word; overflow-wrap: anywhere; white-space: normal; }
.pl-total-row td { background: #f2f2f2; font-weight: 700; font-size: 12px; }
.pl-weight-summary-section { margin-top: 16px; }
.pl-weight-summary-title { font-weight: 700; font-size: 12px; margin-bottom: 6px; padding: 4px 8px; background: #f2f2f2; border: 1px solid #111; }
.pl-weight-summary-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.pl-weight-summary-table th, .pl-weight-summary-table td { border: 1px solid #111; padding: 5px 8px; text-align: left; }
.pl-weight-summary-table th { background: #f2f2f2; font-weight: 700; font-size: 10px; text-transform: uppercase; }
.pl-weight-lines { margin-top: 14px; font-size: 12.5px; line-height: 1.6; }
.pl-weight-line { margin-bottom: 2px; }
.pl-footer-section { page-break-inside: avoid; margin-top: 16px; }
.pl-declaration-ref { margin-top: 0; }
.pl-decl-title { font-weight: 700; font-size: 12.5px; margin-bottom: 4px; }
.pl-decl-text { font-size: 12px; line-height: 1.5; padding-left: 20px; }
.pl-sign-area { text-align: right; margin-top: 40px; page-break-inside: avoid; }
.pl-sign-block { display: inline-block; text-align: center; width: 220px; }
.pl-sign-company { font-weight: 700; font-size: 13px; margin-bottom: 8px; color: #111; }
.pl-sign-img { display: block; max-width: 140px; max-height: 50px; margin: 0 auto 6px; object-fit: contain; }
.pl-sign-seal { width: 140px; height: 140px; margin: 8px auto; } .pl-seal-svg { width: 100%; height: 100%; }
.pl-sign-line { width: 180px; height: 1px; background: #111; margin: 14px auto 6px; }
.pl-sign-label { font-size: 12px; color: #333; }
</style></head><body></body></html>`);
    w.document.close();
    w.document.body.appendChild(clone);
    w.onload = () => { w.print(); };
  }, [record]);

  // Not found
  if (!record) {
    return (
      <div className="page">
        <PageHeader
          title="Packing List Preview"
          subtitle="Loading…"
          actions={
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/production/packing')}>
              <Icon name="arrow-left" size={14} /> Back to Packing
            </button>
          }
        />
        <div className="settings-page-card" style={{ padding: '40px', textAlign: 'center' }}>
          <Icon name="alert-circle" size={22} />
          <h3 style={{ marginTop: 12 }}>Packing List not found</h3>
          <p style={{ color: '#666', marginTop: 8 }}>
            The Packing List <strong>{id}</strong> does not exist or has been deleted.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/production/packing')} style={{ marginTop: 16 }}>
            Back to Packing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page pp-page">
      {/* Toast notification */}
      {toast && (
        <div className={`pp-toast pp-toast-${toast.type}`}>
          <Icon name={toast.type === 'success' ? 'check' : 'alert-circle'} size={14} />
          {toast.message}
        </div>
      )}

      <PageHeader
        title={`Packing List — ${record.id}`}
        subtitle={`Preview, edit, print and download the Packing List document`}
        actions={
          <div className="pp-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/production/packing')}>
              <Icon name="arrow-left" size={14} /> Back
            </button>

            {editing ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                  <Icon name="x" size={14} /> Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  <Icon name="check" size={14} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => { setDraft({ ...ensureBoxes(record) }); setEditing(true); }}>
                <Icon name="edit" size={14} /> Edit
              </button>
            )}

            <button type="button" className="btn btn-secondary" onClick={handlePrint}>
              <Icon name="printer" size={14} /> Print
            </button>
            <button type="button" className="btn btn-primary" onClick={handleDownload}>
              <Icon name="download" size={14} /> Download PDF
            </button>
          </div>
        }
      />

      {editing && (
        <div className="pp-edit-banner">
          <Icon name="edit" size={14} /> <strong>Editing On</strong> — Click on any field in the document to edit it. Changes are local until you click Save.
        </div>
      )}

      <div className="pp-scroll">
        <PackingListDocument
          record={displayRecord}
          editing={editing}
          onFieldChange={handleFieldChange}
        />
      </div>
    </div>
  );
}

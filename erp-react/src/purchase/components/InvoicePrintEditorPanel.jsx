/**
 * purchase/components/InvoicePrintEditorPanel.jsx
 * ------------------------------------------------------------------
 * Design sidebar for the Invoice print editor. Everything here is
 * presentation-only: branding/logo, vendor snapshot, tax & totals,
 * terms, signature layout + images, field visibility and saved
 * templates. Transactional edits flow through the page's record
 * handlers (workflow-guarded); design edits flow through the design
 * snapshot.
 * ------------------------------------------------------------------
 */
import { useState } from 'react';
import { Check, FileText, RotateCcw, Trash2, X } from 'lucide-react';
import { SIGNATURE_LAYOUTS } from '../services/invoicePrintDesign';
import '../styles/po-print-editor.css';

function readFileAsDataUrl(file, onLoad) {
  const reader = new FileReader();
  reader.onload = () => onLoad(reader.result);
  reader.readAsDataURL(file);
}

function Field({ label, value, onChange, textarea = false, rows = 3, placeholder = '', disabled = false }) {
  if (textarea) {
    return (
      <label className="poe-field">
        <span className="poe-label">{label}</span>
        <textarea className="poe-input poe-textarea" value={value || ''} rows={rows}
          placeholder={placeholder} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
      </label>
    );
  }
  return (
    <label className="poe-field">
      <span className="poe-label">{label}</span>
      <input className="poe-input" value={value || ''} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)} />
    </label>
  );
}

function Section({ title, children }) {
  return (
    <section className="poe-section">
      <header className="poe-section-head"><h3>{title}</h3></header>
      <div className="poe-section-body">{children}</div>
    </section>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="poe-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ImagePicker({ label, value, onPick, onClear }) {
  return (
    <div className="poe-image-picker">
      {value ? (
        <>
          <img className="poe-image-preview" src={value} alt={label} />
          <div className="poe-image-actions">
            <button type="button" className="poe-btn poe-btn-ghost" onClick={onClear}>Remove</button>
          </div>
        </>
      ) : (
        <label className="poe-image-drop">
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFileAsDataUrl(f, onPick); e.target.value = ''; }} />
          <FileText size={16} />
          <span>Upload {label}</span>
        </label>
      )}
    </div>
  );
}

export default function InvoicePrintEditorPanel({
  record, design, isRecordEditable,
  onRecordChange, onDesignChange, onCompanyChange,
  onItemChange, onAddItem, onRemoveItem, onDuplicateItem, onMoveItem,
  templates = [], onSaveTemplate, onApplyTemplate, onDeleteTemplate, onResetDesign
}) {
  const [templateName, setTemplateName] = useState('');

  const updateSig = (field, patch) => {
    onDesignChange?.({ signatures: { ...design.signatures, [field]: { ...(design.signatures[field] || {}), ...patch } } });
  };

  const visibility = design.visibility || {};
  const sigRoles = design.signatureLayout === SIGNATURE_LAYOUTS.VENDOR_BUYER
    ? ['vendor', 'buyer'] : ['preparedBy', 'verifiedBy', 'approvedBy'];
  const sigLabels = { preparedBy: 'Prepared By', verifiedBy: 'Verified By', approvedBy: 'Approved By', vendor: 'Vendor', buyer: 'Receiver' };

  return (
    <aside className="poe-panel" aria-label="Invoice document editor">
      <header className="poe-panel-head">
        <div>
          <h2>Document Editor</h2>
          <p>{record.invoiceNo}</p>
        </div>
      </header>

      <div className="poe-scroll">
        {!isRecordEditable && (
          <p className="poe-note">
            This invoice is <b>{record.status}</b> — transactional edits are frozen.
            Branding, signatures, layout &amp; visibility below are saved to the print design only.
          </p>
        )}

        {/* Branding & Logo */}
        <Section title="Branding & Logo">
          <ImagePicker label="Company Logo" value={design.logo}
            onPick={(d) => onDesignChange?.({ logo: d })}
            onClear={() => onDesignChange?.({ logo: '' })} />
          <p className="poe-hint">Shown top-left on every page.</p>
        </Section>

        {/* Company */}
        <Section title="Company">
          <Field label="Company Name" value={record.companyName || ''} disabled />
          <Field label="Address" value={record.companyAddress || ''} disabled />
          <Field label="GSTIN" value={record.companyGstin || ''} disabled />
          <p className="poe-hint">Company info comes from Settings.</p>
        </Section>

        {/* Vendor */}
        <Section title="Supplier / Vendor">
          <Field label="Vendor Name" value={record.vendor} onChange={(v) => onRecordChange?.('vendor', v)} placeholder="Vendor name" />
          <Field label="Address" value={record.vendorAddress || ''} onChange={(v) => onRecordChange?.('vendorAddress', v)} textarea rows={2} />
          <div className="poe-grid-2">
            <Field label="City" value={record.vendorCity || ''} onChange={(v) => onRecordChange?.('vendorCity', v)} />
            <Field label="State" value={record.vendorState || ''} onChange={(v) => onRecordChange?.('vendorState', v)} />
          </div>
          <Field label="GSTIN" value={record.vendorGstin || ''} onChange={(v) => onRecordChange?.('vendorGstin', v)} />
          <Field label="Phone" value={record.vendorPhone || ''} onChange={(v) => onRecordChange?.('vendorPhone', v)} />
          <Field label="Email" value={record.vendorEmail || ''} onChange={(v) => onRecordChange?.('vendorEmail', v)} />
          <p className="poe-hint">Invoice-specific snapshot — edits do not modify the vendor master.</p>
        </Section>

        {/* Discount & Charges */}
        <Section title="Discount & Charges">
          <div className="poe-grid-2">
            <Field label="Discount %" value={record.discount} onChange={(v) => onRecordChange?.('discount', v)} />
            <Field label="Charges" value={record.charges} onChange={(v) => onRecordChange?.('charges', v)} />
          </div>
          <div className="poe-grid-2">
            <Field label="Freight" value={record.freight} onChange={(v) => onRecordChange?.('freight', v)} />
            <Field label="TDS %" value={record.tdsPercent} onChange={(v) => onRecordChange?.('tdsPercent', v)} />
          </div>
        </Section>

        {/* Item Table */}
        {isRecordEditable && (
          <Section title="Item Table">
            <div className="poe-items-summary">
              <span className="poe-hint">{record.items?.length || 0} item(s)</span>
              <button type="button" className="poe-btn poe-btn-primary" onClick={onAddItem}>+ Add Item</button>
            </div>
            {(record.items || []).map((item, idx) => (
              <div className="poe-item-row" key={idx}>
                <span className="poe-item-idx">{idx + 1}.</span>
                <div className="poe-item-row-fields">
                  <input className="poe-input" value={item.product || ''} placeholder="Description"
                    onChange={(e) => onItemChange?.(idx, 'product', e.target.value)} />
                  <div className="poe-grid-3">
                    <Field label="Qty" value={String(item.qty || '')} onChange={(v) => onItemChange?.(idx, 'qty', v)} />
                    <Field label="Unit" value={item.uom || ''} onChange={(v) => onItemChange?.(idx, 'uom', v)} />
                    <Field label="Rate" value={String(item.rate || '')} onChange={(v) => onItemChange?.(idx, 'rate', v)} />
                  </div>
                </div>
                <div className="poe-item-row-actions">
                  <button type="button" className="poe-btn poe-btn-ghost" disabled={idx === 0} onClick={() => onMoveItem?.(idx, -1)} title="Move up">▲</button>
                  <button type="button" className="poe-btn poe-btn-ghost" disabled={idx === (record.items?.length || 0) - 1} onClick={() => onMoveItem?.(idx, 1)} title="Move down">▼</button>
                  <button type="button" className="poe-btn poe-btn-ghost" onClick={() => onDuplicateItem?.(idx)} title="Duplicate">⧉</button>
                  <button type="button" className="poe-btn poe-btn-ghost" style={{ color: '#b91c1c' }} onClick={() => onRemoveItem?.(idx)} title="Delete">✕</button>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Terms */}
        <Section title="Terms">
          <Field label="Terms & Conditions" value={record.termsAndConditions} onChange={(v) => onRecordChange?.('termsAndConditions', v)} textarea rows={4} />
          <Field label="Notes" value={record.notes} onChange={(v) => onRecordChange?.('notes', v)} textarea rows={3} />
        </Section>

        {/* Signatures */}
        <Section title="Signatures">
          <div className="poe-seg" role="radiogroup">
            <button type="button" className={design.signatureLayout === SIGNATURE_LAYOUTS.WORKFLOW ? 'poe-seg-on' : ''}
              onClick={() => onDesignChange?.({ signatureLayout: SIGNATURE_LAYOUTS.WORKFLOW })}>
              <Check size={12} style={{ visibility: design.signatureLayout === SIGNATURE_LAYOUTS.WORKFLOW ? 'visible' : 'hidden' }} />
              Approval Workflow
            </button>
            <button type="button" className={design.signatureLayout === SIGNATURE_LAYOUTS.VENDOR_BUYER ? 'poe-seg-on' : ''}
              onClick={() => onDesignChange?.({ signatureLayout: SIGNATURE_LAYOUTS.VENDOR_BUYER })}>
              <Check size={12} style={{ visibility: design.signatureLayout === SIGNATURE_LAYOUTS.VENDOR_BUYER ? 'visible' : 'hidden' }} />
              Vendor / Receiver
            </button>
          </div>

          {sigRoles.map((field) => (
            <div className="poe-sig-card" key={field}>
              <div className="poe-sig-card-head">
                <b>{sigLabels[field]}</b>
                <ImagePicker label="signature" value={design.signatures[field]?.image || ''}
                  onPick={(d) => updateSig(field, { image: d })}
                  onClear={() => updateSig(field, { image: '' })} />
              </div>
              <div className="poe-grid-2">
                <Field label="Name" value={design.signatures[field]?.name || ''} onChange={(v) => updateSig(field, { name: v })} />
                <Field label="Designation" value={design.signatures[field]?.designation || ''} onChange={(v) => updateSig(field, { designation: v })} />
              </div>
            </div>
          ))}
        </Section>

        {/* Visibility */}
        <Section title="Show on Document">
          <Toggle label="Amount in Words" checked={visibility.amountInWords !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, amountInWords: v } })} />
          <Toggle label="Notes" checked={visibility.notes !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, notes: v } })} />
          <Toggle label="Terms & Conditions" checked={visibility.termsAndConditions !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, termsAndConditions: v } })} />
          <Toggle label="Payment Information" checked={visibility.paymentInfo !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, paymentInfo: v } })} />
          <Toggle label="PO Reference" checked={visibility.poReference !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, poReference: v } })} />
          <Toggle label="GRN Reference" checked={visibility.grnReference !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, grnReference: v } })} />
          <Toggle label="Vendor GSTIN" checked={visibility.vendorGstin !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, vendorGstin: v } })} />
          <Toggle label="Three-Way Match" checked={visibility.threeWayMatch !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, threeWayMatch: v } })} />
          <Toggle label="Payment Status" checked={visibility.paymentStatus !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, paymentStatus: v } })} />
          <Toggle label="Footer (date & page numbers)" checked={visibility.footer !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, footer: v } })} />
        </Section>

        {/* Templates */}
        <Section title="Templates">
          <div className="poe-tpl-row">
            <input className="poe-input poe-tpl-name" value={templateName} placeholder="Template name"
              onChange={(e) => setTemplateName(e.target.value)} />
            <button type="button" className="poe-btn poe-btn-primary" disabled={!templateName.trim()}
              onClick={() => { const t = onSaveTemplate(templateName); if (t) setTemplateName(t.name); }}>
              Save As Template
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="poe-hint">No saved templates yet.</p>
          ) : (
            <ul className="poe-tpl-list">
              {templates.map((t) => (
                <li key={t.id} className={design.printTemplateId === t.id ? 'poe-tpl-active' : ''}>
                  <button type="button" className="poe-tpl-apply"
                    onClick={() => { onApplyTemplate(t.id); setTemplateName(t.name); }}>{t.name}</button>
                  <button type="button" className="poe-btn poe-btn-icon" title="Delete" onClick={() => onDeleteTemplate(t.id)}>
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="poe-footer">
          <button type="button" className="poe-btn poe-btn-ghost" onClick={() => { setTemplateName(''); onResetDesign(); }}>
            <RotateCcw size={13} /> Reset design
          </button>
          <span className="poe-spacer" />
          <span className="poe-hint"><X size={12} style={{ verticalAlign: '-2px' }} /> Close panel to preview</span>
        </div>
      </div>
    </aside>
  );
}

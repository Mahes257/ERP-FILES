/**
 * purchase/components/PoPrintEditorPanel.jsx
 * ------------------------------------------------------------------
 * Design sidebar for the PO print editor. Everything here is
 * presentation-only: branding/logo, supplier snapshot, taxes & charges,
 * terms, signature layout + images, field visibility and saved
 * templates. Transactional edits flow through the page's record
 * handlers (workflow-guarded); design edits flow through the design
 * snapshot (never touches the workflow document).
 * ------------------------------------------------------------------ */
import { useState } from 'react';
import DEFAULT_DOCUMENT_ASSETS from '../assets/defaultDocumentAssets.json' with { type: 'json' };
import { FileText, RotateCcw, Save, Trash2, X } from 'lucide-react';
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
        <textarea
          className="poe-input poe-textarea"
          value={value || ''}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </label>
    );
  }
  return (
    <label className="poe-field">
      <span className="poe-label">{label}</span>
      <input
        className="poe-input"
        value={value || ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </label>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="poe-section">
      <header className="poe-section-head">
        <h3>{title}</h3>
        {right}
      </header>
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
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              if (file) readFileAsDataUrl(file, onPick);
              e.target.value = '';
            }}
          />
          <FileText size={16} />
          <span>Upload {label}</span>
        </label>
      )}
    </div>
  );
}

export default function PoPrintEditorPanel({
  record,
  design,
  isRecordEditable,
  onRecordChange,
  onDesignChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onDuplicateItem,
  onMoveItem,
  templates = [],
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  onResetDesign,
  onClose,
  onSave,
  busy = false,
  hasUnsavedChanges = false
}) {
  const [templateName, setTemplateName] = useState('');

  const updateSignature = (field, patch) => {
    onDesignChange?.({
      signatures: { ...design.signatures, [field]: { ...(design.signatures[field] || {}), ...patch } }
    });
  };

  const visibility = design.visibility || {};

  return (
    <aside className="poe-panel" aria-label="PO document editor">
      <header className="poe-panel-head">
        <div>
          <h2>Document Editor</h2>
          <p>{record.poNo}</p>
        </div>
        {onClose && (
          <button type="button" className="poe-close-btn" onClick={onClose} title="Close editor">
            <X size={16} />
          </button>
        )}
      </header>

      <div className="poe-scroll">
        {!isRecordEditable && (
          <p className="poe-note">
            This PO is <b>{record.status}</b> — line-item/header edits are frozen by the
            workflow. Branding, signatures, layout &amp; visibility below are saved to the
            print design only.
          </p>
        )}

        {/* Branding */}
        <Section title="Branding & Logo">
          <ImagePicker
            label="Company Logo"
            value={design.logo || DEFAULT_DOCUMENT_ASSETS?.logo || ''}
            onPick={(dataUrl) => onDesignChange?.({ logo: dataUrl })}
            onClear={() => onDesignChange?.({ logo: DEFAULT_DOCUMENT_ASSETS?.logo || '' })}
          />
          <p className="poe-hint">Shown top-right on every page. Saved with this PO's design.</p>
        </Section>

        {/* Supplier snapshot */}
        <Section title="Supplier (this PO)">
          <Field label="Company Name" value={record.vendor} onChange={(v) => onRecordChange('vendor', v)} placeholder="Supplier name" />
          <Field label="Address" value={record.vendorAddress} onChange={(v) => onRecordChange('vendorAddress', v)} textarea rows={2} placeholder="Street, area" />
          <div className="poe-grid-2">
            <Field label="City" value={record.vendorCity} onChange={(v) => onRecordChange('vendorCity', v)} placeholder="City" />
            <Field label="State" value={record.vendorState} onChange={(v) => onRecordChange('vendorState', v)} placeholder="State" />
          </div>
          <div className="poe-grid-2">
            <Field label="Phone" value={record.vendorPhone} onChange={(v) => onRecordChange('vendorPhone', v)} placeholder="Ph number" />
            <Field label="Contact" value={record.vendorContact} onChange={(v) => onRecordChange('vendorContact', v)} placeholder="Contact person" />
          </div>
          <Field label="Email" value={record.vendorEmail} onChange={(v) => onRecordChange('vendorEmail', v)} placeholder="Email" />
          <Field label="GSTIN" value={record.vendorGstin} onChange={(v) => onRecordChange('vendorGstin', v)} placeholder="GSTIN" />
          <p className="poe-hint">Pre-populated from the vendor master; edits stay on this PO only.</p>
        </Section>

        {/* Taxes & charges */}
        <Section title="Discount & Charges">
          <div className="poe-grid-2">
            <Field label="Discount %" value={record.discount} onChange={(v) => onRecordChange('discount', v)} placeholder="0" />
            <Field label="Charges" value={record.charges} onChange={(v) => onRecordChange('charges', v)} placeholder="0" />
          </div>
          <p className="poe-hint">Totals (incl. GST split) recompute instantly on the document.</p>
        </Section>

        {/* Item Table */}
        {isRecordEditable && (
          <Section title="Item Table">
            <div className="poe-items-summary">
              <span className="poe-hint">{record.items?.length || 0} item(s)</span>
              <button type="button" className="poe-btn poe-btn-primary" onClick={onAddItem}>
                + Add Item
              </button>
            </div>
            {(record.items || []).map((item, idx) => (
              <div className="poe-item-row" key={idx}>
                <span className="poe-item-idx">{idx + 1}.</span>
                <div className="poe-item-row-fields">
                  <input
                    className="poe-input"
                    value={item.product || ''}
                    placeholder="Description"
                    onChange={(e) => onItemChange?.(idx, 'product', e.target.value)}
                  />
                  <div className="poe-grid-3">
                    <Field label="Qty" value={String(item.qty || '')} onChange={(v) => onItemChange?.(idx, 'qty', v)} />
                    <Field label="Unit" value={item.uom || ''} onChange={(v) => onItemChange?.(idx, 'uom', v)} />
                    <Field label="Rate" value={String(item.rate || '')} onChange={(v) => onItemChange?.(idx, 'rate', v)} />
                  </div>
                </div>
                <div className="poe-item-row-actions">
                  <button type="button" className="poe-btn poe-btn-ghost" disabled={idx === 0} onClick={() => onMoveItem?.(idx, -1)} title="Move up">\u25B2</button>
                  <button type="button" className="poe-btn poe-btn-ghost" disabled={idx === (record.items?.length || 0) - 1} onClick={() => onMoveItem?.(idx, 1)} title="Move down">\u25BC</button>
                  <button type="button" className="poe-btn poe-btn-ghost" onClick={() => onDuplicateItem?.(idx)} title="Duplicate">\u2398</button>
                  <button type="button" className="poe-btn poe-btn-ghost" style={{ color: '#b91c1c' }} onClick={() => onRemoveItem?.(idx)} title="Delete">\u2715</button>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Terms */}
        <Section title="Terms">
          <Field label="Delivery Term" value={record.deliveryTerms || record.terms} onChange={(v) => onRecordChange('deliveryTerms', v)} placeholder="e.g. Ex works 3 Days" />
          <Field
            label="Payment Terms"
            value={typeof record.paymentTerms === 'string' ? record.paymentTerms : ''}
            onChange={(v) => onRecordChange('paymentTerms', v)}
            placeholder={typeof record.paymentTerms === 'string' ? 'e.g. 50% Advance, Balance Against PI' : 'Structured terms — edit in the PO form'}
            disabled={typeof record.paymentTerms !== 'string'}
          />
          <Field label="Terms & Conditions" value={record.termsAndConditions} onChange={(v) => onRecordChange('termsAndConditions', v)} textarea rows={4} placeholder="Terms that appear on the document" />
          <Field label="Supplier Code of Conduct" value={record.supplierCodeOfConduct} onChange={(v) => onRecordChange('supplierCodeOfConduct', v)} textarea rows={3} placeholder="Optional supplier conduct text" />
        </Section>

        {/* Signatures — Seller / Buyer (independently shown on document) */}
        <Section title="Seller / Buyer">
          {['seller', 'buyer'].map((field) => (
            <div className="poe-sig-card" key={field}>
              <div className="poe-sig-card-head">
                <b>{field === 'seller' ? 'Seller' : 'Buyer'}</b>
                <Toggle
                  label="Show on document"
                  checked={design.visibility[field] !== false}
                  onChange={(v) => onDesignChange({ visibility: { ...design.visibility, [field]: v } })}
                />
                <ImagePicker
                  label="signature"
                  value={design.signatures[field]?.image || ''}
                  onPick={(dataUrl) => updateSignature(field, { image: dataUrl })}
                  onClear={() => updateSignature(field, { image: '' })}
                />
              </div>
              <div className="poe-grid-2">
                <Field label="Name" value={design.signatures[field]?.name || ''} onChange={(v) => updateSignature(field, { name: v })} />
                <Field label="Designation" value={design.signatures[field]?.designation || ''} onChange={(v) => updateSignature(field, { designation: v })} />
              </div>
            </div>
          ))}
        </Section>

        {/* Visibility — note: Seller & Buyer toggles live in the Seller / Buyer section above so each party's controls stay together */}
        <Section title="Show on Document">
          <Toggle label="Amount in Words" checked={visibility.amountInWords !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, amountInWords: v } })} />
          <Toggle label="Notes" checked={visibility.notes !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, notes: v } })} />
          <Toggle label="Delivery Term & Payment" checked={visibility.deliveryPayment !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, deliveryPayment: v } })} />
          <Toggle label="Terms & Conditions" checked={visibility.termsAndConditions !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, termsAndConditions: v } })} />
          <Toggle label="Supplier Code of Conduct" checked={visibility.supplierCodeOfConduct !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, supplierCodeOfConduct: v } })} />
          <Toggle label="Footer (date & page numbers)" checked={visibility.footer !== false} onChange={(v) => onDesignChange({ visibility: { ...visibility, footer: v } })} />
        </Section>

        {/* Templates */}
        <Section title="Templates">
          <div className="poe-tpl-row">
            <input
              className="poe-input poe-tpl-name"
              value={templateName}
              placeholder="Template name"
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <button
              type="button"
              className="poe-btn poe-btn-primary"
              disabled={!templateName.trim()}
              onClick={() => {
                const template = onSaveTemplate(templateName);
                if (template) setTemplateName(template.name);
              }}
            >
              Save As Template
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="poe-hint">No saved templates yet.</p>
          ) : (
            <ul className="poe-tpl-list">
              {templates.map((t) => (
                <li key={t.id} className={design.printTemplateId === t.id ? 'poe-tpl-active' : ''}>
                  <button
                    type="button"
                    className="poe-tpl-apply"
                    onClick={() => {
                      onApplyTemplate(t.id);
                      setTemplateName(t.name);
                    }}
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    className="poe-btn poe-btn-icon"
                    title="Delete template"
                    onClick={() => onDeleteTemplate(t.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="poe-footer">
          {onSave && (
            <button
              type="button"
              className="poe-btn poe-btn-primary"
              onClick={onSave}
              disabled={!hasUnsavedChanges || busy}
            >
              <Save size={13} /> Save Changes
            </button>
          )}
          <button
            type="button"
            className="poe-btn poe-btn-ghost"
            onClick={() => {
              setTemplateName('');
              onResetDesign();
            }}
          >
            <RotateCcw size={13} /> Reset design
          </button>
          <span className="poe-spacer" />
          {onClose && (
            <button type="button" className="poe-btn poe-btn-ghost" onClick={onClose}>
              <X size={12} style={{ verticalAlign: '-2px' }} /> Close
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import StatusBadge from './StatusBadge';
import Modal from './Modal';

/**
 * RecordPreviewModal — shared ERP-wide read-only record Preview.
 *
 * The consistent "Actions ⋮ → Preview" destination used across Sales,
 * Marketing and Production list pages. It renders a complete record in a
 * professional read-only modal (no editable inputs, no save path), using
 * the same design language as the existing Sales Quotations preview.
 *
 * Props:
 *   open        boolean                 — controls visibility (Modal contract)
 *   onClose     fn                      — close handler
 *   title       string                  — record number / main heading (e.g. "WO-0008")
 *   subtitle    string (optional)       — customer / lead / context line
 *   status      string (optional)       — status value rendered as a StatusBadge
 *   sections    [{ heading?, rows: [[label, value], ...] }] — key sections
 *   items       { columns: [{key,label}], rows: [row] } (optional) — item table
 *   totals      [[label, value], ...] (optional) — right-aligned totals block
 *   footer      ReactNode (optional)    — extra footer actions (e.g. Open in page / New tab)
 *   maxWidth    string (optional)       — Modal maxWidth class (default 'max-w-3xl')
 *
 * All values are rendered read-only. Missing / null / empty values render as
 * "—" and orphan references never crash the view.
 */
export default function RecordPreviewModal({
  open,
  onClose,
  title,
  subtitle,
  status,
  sections = [],
  items,
  totals = [],
  footer,
  maxWidth = 'max-w-3xl'
}) {
  const normalizedSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          rows: (section.rows || []).filter((row) => Array.isArray(row) && row.length >= 2)
        }))
        .filter((section) => section.rows.length > 0),
    [sections]
  );

  const renderValue = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return '—';
    return value;
  };

  return (
    <Modal open={open} onClose={onClose} title={title || 'Record Preview'} maxWidth={maxWidth}>
      <div className="rpv-wrapper" data-testid="record-preview">
        {/* ===== Header ===== */}
        <div className="rpv-header">
          <div className="rpv-header-main">
            {title && <div className="rpv-title">{title}</div>}
            {subtitle && <div className="rpv-subtitle">{subtitle}</div>}
          </div>
          {status && (
            <div className="rpv-status">
              <StatusBadge status={status} />
            </div>
          )}
        </div>

        {/* ===== Sections ===== */}
        {normalizedSections.length === 0 && !items && totals.length === 0 ? (
          <div className="rpv-empty">
            <FileText size={28} />
            <p>No record details available.</p>
          </div>
        ) : (
          normalizedSections.map((section, idx) => (
            <div key={`section-${idx}`} className="rpv-section">
              {section.heading && <h4 className="rpv-section-heading">{section.heading}</h4>}
              <div className="rpv-grid">
                {section.rows.map(([label, value], rIdx) => (
                  <div key={`row-${rIdx}`} className="rpv-field">
                    <div className="rpv-field-label">{label}</div>
                    <div className="rpv-field-value">{renderValue(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* ===== Items table ===== */}
        {items && Array.isArray(items.columns) && Array.isArray(items.rows) && items.rows.length > 0 && (
          <div className="rpv-section">
            <h4 className="rpv-section-heading">Items</h4>
            <div className="rpv-table-wrap">
              <table className="rpv-table">
                <thead>
                  <tr>
                    {items.columns.map((col) => (
                      <th key={col.key} style={{ textAlign: col.align || 'left' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {items.columns.map((col) => (
                        <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                          {renderValue(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== Totals ===== */}
        {totals.length > 0 && (
          <div className="rpv-section rpv-totals">
            {totals.map(([label, value], idx) => (
              <div key={`total-${idx}`} className="rpv-total-row">
                <span className="rpv-total-label">{label}</span>
                <span className="rpv-total-value">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ===== Footer actions ===== */}
        {footer && <div className="rpv-footer">{footer}</div>}

        <style>{`
          .rpv-wrapper { font-family: 'Inter', system-ui, sans-serif; }
          .rpv-header {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 16px; padding-bottom: 14px; margin-bottom: 4px;
            border-bottom: 2px solid #0B4A3D;
          }
          .rpv-title { font-size: 17px; font-weight: 800; color: #0B4A3D; letter-spacing: -0.01em; }
          .rpv-subtitle { font-size: 13px; color: #64748b; margin-top: 3px; font-weight: 500; }
          .rpv-status { flex-shrink: 0; }
          .rpv-empty {
            display: flex; flex-direction: column; align-items: center; gap: 10px;
            padding: 40px 16px; color: #94a3b8; font-size: 13px;
          }
          .rpv-section { margin-top: 16px; }
          .rpv-section-heading {
            font-size: 11px; font-weight: 700; color: #0B4A3D;
            text-transform: uppercase; letter-spacing: 0.07em;
            margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
          }
          .rpv-section-heading::after {
            content: ''; flex: 1; height: 1px; background: #e2e8f0;
          }
          .rpv-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
            gap: 10px 18px;
          }
          .rpv-field { min-width: 0; }
          .rpv-field-label {
            font-size: 11px; color: #94a3b8; text-transform: uppercase;
            letter-spacing: 0.05em; font-weight: 600; margin-bottom: 2px;
          }
          .rpv-field-value {
            font-size: 13px; color: #1e293b; font-weight: 600;
            word-break: break-word; line-height: 1.4;
          }
          .rpv-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; }
          .rpv-table { width: 100%; border-collapse: collapse; min-width: 480px; }
          .rpv-table th {
            background: #f8fafc; color: #0B4A3D; font-size: 11px; font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.05em;
            padding: 8px 12px; border-bottom: 1px solid #e2e8f0; white-space: nowrap;
          }
          .rpv-table td {
            font-size: 12.5px; color: #334155; padding: 8px 12px;
            border-bottom: 1px solid #f1f5f9; white-space: nowrap;
          }
          .rpv-table tbody tr:last-child td { border-bottom: none; }
          .rpv-totals { border-top: 1px solid #e2e8f0; padding-top: 12px; }
          .rpv-total-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 5px 0;
          }
          .rpv-total-label { font-size: 12px; color: #64748b; font-weight: 600; }
          .rpv-total-value { font-size: 13px; color: #0B4A3D; font-weight: 800; }
          .rpv-footer {
            display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px;
            padding-top: 14px; border-top: 1px solid #e2e8f0;
          }
        `}</style>
      </div>
    </Modal>
  );
}
/**
 * purchase/components/VendorPrintDocument.jsx
 * ------------------------------------------------------------------
 * THE single reusable Vendor Profile document template.
 *
 * Reuses the Purchase Requisition A4 print system: the same
 * PRINT_SHEET_STYLES stylesheet, `.pr-sheet` layout, running header
 * and footer. The SAME DOM feeds on-screen preview, browser Print and
 * the downloaded PDF (each `.pr-sheet` node is rasterised via SVG
 * <foreignObject> + jsPDF — see utils/export.js).
 * ------------------------------------------------------------------
 */
import { PRINT_SHEET_STYLES } from './RequisitionPrintDocument';
import { formatDate, formatDateTime } from '../utils/helpers';

/** Status → print badge tone. */
function statusTone(status = '') {
  const s = String(status || '').toLowerCase();
  if (s.includes('approv') || s.includes('active')) return 'green';
  if (s.includes('block')) return 'red';
  if (s.includes('pending')) return 'amber';
  return 'gray';
}

/** Two-column details grid (label · value pairs). */
export function VendorPrintDetails({ record = {} }) {
  const rows = [
    ['Vendor Name', record.name],
    ['Vendor Code', record.id],
    ['Category', record.category],
    ['Status', record.status],
    ['City', record.city],
    ['State', record.state],
    ['Email', record.email],
    ['Phone', record.phone],
    ['Website', record.website],
    ['GSTIN', record.gstin],
    ['Payment Terms', record.paymentTerms],
    ['Currency', record.currency],
    ['Lead Time', record.leadTimeDays ? `${record.leadTimeDays} days` : '—'],
    ['Registered On', record.createdAt ? formatDate(record.createdAt) : '—']
  ];
  return (
    <div className="pr-details">
      {rows.map(([label, value]) => (
        <div className="pr-detail-row" key={label}>
          <span className="pr-detail-label">{label}</span>
          <span className="pr-detail-value">{String(value ?? '') || '—'}</span>
        </div>
      ))}
    </div>
  );
}

/** Running footer with generated date + page number. */
export function VendorSheetFooter({ generatedAt, pageNumber, totalPages }) {
  return (
    <footer className="pr-sheet-foot">
      <span>Generated on {formatDateTime(generatedAt)}</span>
      <span>Page {pageNumber} of {totalPages}</span>
    </footer>
  );
}

/** One full A4 sheet. */
export function VendorPrintSheet({ data, sheetRef }) {
  const { record, company, preparedBy, checkedBy, approvedBy, generatedAt } = data;
  return (
    <section className="pr-sheet" ref={sheetRef}>
      <style>{PRINT_SHEET_STYLES}</style>
      <div className="pr-sheet-inner">
        <div className="pr-company">
          <div className="pr-company-left">
            <div className="pr-logo">AM</div>
            <div>
              <p className="pr-company-name">{company.name}</p>
              <p className="pr-company-address">{company.address}</p>
              <p className="pr-company-contact">
                GSTIN: {company.gstin}
                <span className="pr-dot">·</span> {company.phone}
                <span className="pr-dot">·</span> {company.email}
              </p>
            </div>
          </div>
          <div className="pr-company-right">
            <p className="pr-doc-title">Vendor Profile</p>
            <p className="pr-pr-no">{record.id}</p>
            <span className={`pr-status pr-status--${statusTone(record.status)}`}>{record.status || '—'}</span>
          </div>
        </div>

        <div className="pr-section-label" style={{ marginTop: '5mm' }}>Registration &amp; Contact</div>
        <VendorPrintDetails record={record} />

        <div className="pr-section-label" style={{ marginTop: '5mm' }}>Registered Address</div>
        <p style={{ fontSize: '9.5px', fontWeight: 600, color: '#0f172a', lineHeight: 1.6 }}>
          {record.address || '—'}
        </p>

        <div className="pr-section-label" style={{ marginTop: '5mm' }}>Attachments</div>
        {(record.attachments || []).length > 0 ? (
          <ul style={{ paddingLeft: '5mm', fontSize: '9px', color: '#334155', lineHeight: 1.7 }}>
            {(record.attachments || []).map((attachment) => (
              <li key={attachment.name || attachment}>{attachment.name || 'File'}</li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: '9px', color: '#64748b' }}>No supporting documents attached.</p>
        )}

        <div className="pr-sign" style={{ marginTop: '12mm' }}>
          {[['Prepared By', preparedBy], ['Checked By', checkedBy], ['Approved By', approvedBy]].map(([role, name]) => (
            <div className="pr-sign-item" key={role}>
              <div className="pr-sign-role">{role}</div>
              <div className="pr-sign-line">
                <p className="pr-sign-name">{name || '—'}</p>
                <p className="pr-sign-sub">Signature</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <VendorSheetFooter generatedAt={generatedAt} pageNumber={1} totalPages={1} />
    </section>
  );
}

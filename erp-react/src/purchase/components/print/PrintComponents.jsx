/**
 * purchase/components/print/PrintComponents.jsx
 * ------------------------------------------------------------------
 * THE single reusable set of print document components.
 *
 * Every Purchase print preview passes its own data into these
 * building blocks. The visual design is inherited from the RFQ
 * master template via PrintSharedStyles.
 *
 * Usage:
 *   import { PrintDocumentHeader, PrintInfoGrid, ... } from './print/PrintComponents';
 *
 *   <PrintDocumentHeader
 *     company={company}
 *     docTitle="Purchase Order"
 *     docNumber="PO-2026-0001"
 *     status="Approved"
 *   />
 *   <PrintInfoGrid left={[...]} right={[...]} />
 *   <PrintSection label="Line Items">
 *     <PrintTable columns={[...]} rows={[...]} />
 *   </PrintSection>
 * ------------------------------------------------------------------
 */
import { formatDate, formatDateTime } from '../../utils/helpers';
import { PRINT_STATUS_TONES } from './PrintSharedStyles';
import { getPdfDefaults } from '../../services/settings';

/* Live PDF defaults — read at render time so Settings changes apply
   to every print document without rebuilding the page. */
function pdfFlags() {
  const d = getPdfDefaults() || {};
  return {
    showCompanyAddress: d.showCompanyAddress !== false,
    showGstin: d.showGstin !== false,
    showSignature: d.showSignature !== false,
    footerText: String(d.footerText || '').trim()
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: company initials from name                                  */
/* ------------------------------------------------------------------ */
function companyInitials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'CO'
  );
}

/* ------------------------------------------------------------------ */
/*  PrintDocumentHeader — company letterhead + document title          */
/* ------------------------------------------------------------------ */
export function PrintDocumentHeader({ company, docTitle, docNumber, status }) {
  const tone = PRINT_STATUS_TONES[status] || 'gray';
  const flags = pdfFlags();
  return (
    <header>
      <div className="pr-company">
        <div className="pr-company-left">
          <div className="pr-logo" aria-hidden="true">{companyInitials(company?.name)}</div>
          <div>
            <h1 className="pr-company-name">{company?.name || '—'}</h1>
            {flags.showCompanyAddress && <p className="pr-company-address">{company?.address || '—'}</p>}
            <p className="pr-company-contact">
              {flags.showGstin && company?.gstin && <><span>GSTIN {company.gstin}</span><span className="pr-dot">·</span></>}
              {company?.phone && <span>{company.phone}</span>}
              {company?.phone && company?.email && <span className="pr-dot">·</span>}
              {company?.email && <span>{company.email}</span>}
            </p>
          </div>
        </div>
        <div className="pr-company-right">
          <h2 className="pr-doc-title">{docTitle || '—'}</h2>
          <p className="pr-doc-number">{docNumber || '—'}</p>
          {status && <span className={`pr-status pr-status--${tone}`}>{status}</span>}
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintInfoGrid — two-column detail fields                           */
/* ------------------------------------------------------------------ */
export function PrintInfoGrid({ left = [], right = [] }) {
  return (
    <div className="pr-details">
      <div>
        {left.map((field) => (
          <PrintDetailRow key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
      <div>
        {right.map((field) => (
          <PrintDetailRow key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintDetailRow — single label/value pair                           */
/* ------------------------------------------------------------------ */
export function PrintDetailRow({ label, value }) {
  return (
    <div className="pr-detail-row">
      <span className="pr-detail-label">{label}</span>
      <span className="pr-detail-value">{value || '—'}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintSection — labeled section wrapper                             */
/* ------------------------------------------------------------------ */
export function PrintSection({ label, children, className = '' }) {
  return (
    <div className={className}>
      {label && <div className="pr-section-label">{label}</div>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintTable — generic items table                                   */
/* ------------------------------------------------------------------ */
export function PrintTable({ columns = [], rows = [], emptyMessage = 'No line items', className = '', refs }) {
  return (
    <div className={`pr-items ${className}`}>
      <table className="pr-items-table">
        <thead ref={refs?.thead}>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.align === 'right' ? 'num' : ''} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={refs?.tbody}>
          {rows.length === 0 ? (
            <tr className="pr-empty-row">
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.key || i}>
                {columns.map((col) => (
                  <td key={col.key} className={`${col.align === 'right' ? 'num ' : ''}${col.key === 'description' || col.key === 'product' ? 'desc ' : ''}`}>
                    {col.render ? col.render(row, i) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintSummary — financial summary box                               */
/* ------------------------------------------------------------------ */
export function PrintSummary({ rows = [], grandLabel, grandValue, className = '' }) {
  return (
    <div className={`pr-summary ${className}`}>
      {rows.map((row, i) => (
        <div className="pr-summary-row" key={row.label || i}>
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
      {grandLabel && (
        <div className="pr-summary-grand">
          <span>{grandLabel}</span>
          <span>{grandValue}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintNotes — notes / description block                            */
/* ------------------------------------------------------------------ */
export function PrintNotes({ text, label = 'Notes' }) {
  if (!text) return null;
  return (
    <div>
      <div className="pr-section-label">{label}</div>
      <p className="pr-notes-text">{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintAmountInWords                                                 */
/* ------------------------------------------------------------------ */
export function PrintAmountInWords({ amount, currency }) {
  /* Lazy-load numberToWords to avoid circular deps */
  let inWords = '—';
  try {
    const { numberToWords, formatAmountInWords } = require('../../utils/purchase');
    inWords = numberToWords(amount || 0);
    return (
      <div>
        <div className="pr-section-label pr-words-label">Amount in Words</div>
        <p className="pr-words-text">{inWords}</p>
        {currency && String(currency).toUpperCase() !== 'INR' && (
          <p className="pr-words-foreign">{formatAmountInWords(amount || 0, currency)}</p>
        )}
      </div>
    );
  } catch {
    return (
      <div>
        <div className="pr-section-label pr-words-label">Amount in Words</div>
        <p className="pr-words-text">{inWords}</p>
      </div>
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PrintSignatures — signature lines                                  */
/* ------------------------------------------------------------------ */
export function PrintSignatories({ signatories = [], threeColumn = false }) {
  if (pdfFlags().showSignature === false) return null;
  return (
    <div className={`pr-sign ${threeColumn ? 'pr-sign--3col' : ''}`}>
      {signatories.map(([role, name]) => (
        <div className="pr-sign-item" key={role}>
          <div className="pr-sign-role">{role}</div>
          <div className="pr-sign-line">
            <p className="pr-sign-name">{name || '—'}</p>
            <p className="pr-sign-sub">Signature</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintFooter — page footer with date + page number                  */
/* ------------------------------------------------------------------ */
export function PrintFooter({ generatedAt, pageNumber, totalPages, docNumber }) {
  const footerText = pdfFlags().footerText;
  return (
    <footer className="pr-sheet-foot">
      <span>
        {docNumber && <>{docNumber} · </>}
        Generated on {generatedAt ? formatDateTime(generatedAt) : formatDate(new Date().toISOString())}
        {footerText && <><span className="pr-dot">·</span> {footerText}</>}
      </span>
      <span>Page {pageNumber} of {totalPages}</span>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintRunningHeader — compact header for pages 2+                   */
/* ------------------------------------------------------------------ */
export function PrintRunningHeader({ companyName, docTitle, docNumber, pageNumber, totalPages }) {
  return (
    <div className="pr-running">
      <span className="pr-running-left">
        <strong className="pr-running-company">{companyName || '—'}</strong>
        <span className="pr-dot" aria-hidden="true">·</span>
        {docTitle}
        <span className="pr-dot" aria-hidden="true">·</span>
        {docNumber}
      </span>
      <span className="pr-running-right">Page {pageNumber} of {totalPages}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintInfoBox — bordered info box for terms/conditions              */
/* ------------------------------------------------------------------ */
export function PrintInfoBox({ children, label }) {
  return (
    <div>
      {label && <div className="pr-section-label">{label}</div>}
      <div className="pr-info-box">{children}</div>
    </div>
  );
}

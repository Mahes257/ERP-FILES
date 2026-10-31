/**
 * purchase/utils/prClipboard.js
 * ------------------------------------------------------------------
 * Email-safe HTML serialisation for the Purchase Requisition document.
 *
 * Converts the editable React document state into inline-styled HTML
 * that Gmail / Outlook / Apple Mail render faithfully. Every style is
 * inlined as a `style=""` attribute — no classes, no external CSS,
 * no CSS variables, no grid, no flexbox (Outlook doesn't support it).
 *
 * Two outputs:
 *   1. text/html — full rich HTML with tables, inline styles
 *   2. text/plain — fallback plain text for plain-text editors
 *
 * Usage:
 *   import { copyPrToClipboard } from '../../utils/prClipboard';
 *   await copyPrToClipboard(editableData);
 * ------------------------------------------------------------------
 */
import { formatAmountConverted } from './purchase';
import { formatDate, formatDateTime } from './helpers';

/* ------------------------------------------------------------------ */
/*  Inline-style constants — every value is a plain CSS string.        */
/* ------------------------------------------------------------------ */
const S = {
  body: 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:10px;line-height:1.45;color:#0f172a;margin:0;padding:10mm;background:#ffffff;',
  table: 'width:100%;border-collapse:collapse;border-spacing:0;',
  th: 'background:#0B4A3D;color:#ffffff;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;text-align:left;padding:2.5mm 2mm;',
  thRight: 'background:#0B4A3D;color:#ffffff;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;text-align:right;padding:2.5mm 2mm;',
  td: 'padding:2.2mm 2mm;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#334155;font-size:8.5px;',
  tdRight: 'padding:2.2mm 2mm;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#0f172a;font-size:8.5px;text-align:right;font-variant-numeric:tabular-nums;',
  tdDesc: 'padding:2.2mm 2mm;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#0f172a;font-size:8.5px;font-weight:600;',
  companyBorder: 'border-bottom:2px solid #0f172a;padding-bottom:6mm;margin-bottom:5mm;',
  companyName: 'font-size:16px;font-weight:800;letter-spacing:-0.2px;color:#0f172a;margin:0;',
  companyAddr: 'font-size:8.5px;color:#64748b;margin:1.2mm 0 0;line-height:1.5;',
  companyContact: 'font-size:8.5px;color:#475569;margin:1.2mm 0 0;',
  docTitle: 'font-size:17px;font-weight:800;color:#0f172a;letter-spacing:-0.2px;margin:0;text-align:right;',
  prNo: 'font-size:13px;font-weight:800;color:#0B4A3D;padding-top:1.5mm;text-align:right;',
  detailLabel: 'font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;',
  detailValue: 'font-size:9.5px;font-weight:600;color:#0f172a;text-align:right;word-break:break-word;',
  detailRow: 'display:flex;justify-content:space-between;align-items:baseline;gap:4mm;padding:1.6mm 0;border-bottom:1px dashed #e2e8f0;',
  sectionLabel: 'font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#64748b;padding-bottom:3mm;',
  notesText: 'font-size:9px;color:#334155;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:0;',
  notesInternal: 'padding-top:2mm;font-size:8.5px;color:#94a3b8;font-style:italic;',
  wordsLabel: 'padding-top:5mm;',
  wordsText: 'font-size:9.5px;color:#334155;font-style:italic;overflow-wrap:anywhere;word-break:break-word;margin:0;',
  summaryBorder: 'border:1px solid #e2e8f0;border-radius:1.5mm;overflow:hidden;',
  summaryRow: 'display:flex;justify-content:space-between;gap:4mm;padding:1.8mm 3mm;border-bottom:1px dashed #e2e8f0;font-size:8.5px;color:#475569;',
  summaryValue: 'font-weight:700;color:#334155;font-variant-numeric:tabular-nums;',
  grandRow: 'display:flex;justify-content:space-between;gap:4mm;padding:2.5mm 3mm;background:#0B4A3D;color:#ffffff;font-size:10px;font-weight:800;',
  grandValue: 'font-variant-numeric:tabular-nums;',
  signRole: 'font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;margin-bottom:9mm;',
  signLine: 'border-top:1px solid #94a3b8;padding-top:1.5mm;',
  signName: 'font-size:10px;font-weight:700;color:#0f172a;margin:0;',
  signSub: 'font-size:7.5px;color:#94a3b8;margin:0.5mm 0 0;',
  dot: 'margin:0 1.5mm;color:#94a3b8;',
  footer: 'border-top:1px solid #e2e8f0;padding:2.5mm 0;font-size:7.5px;color:#94a3b8;display:flex;justify-content:space-between;',
};

/* ------------------------------------------------------------------ */
/*  Status pill colours (mirrors STATUS_TONES in the document).        */
/* ------------------------------------------------------------------ */
const STATUS_COLORS = {
  Draft:           { bg: '#f3f4f6', fg: '#6b7280' },
  'Pending Approval': { bg: '#fffbeb', fg: '#d97706' },
  Approved:        { bg: '#f0fdf4', fg: '#16a34a' },
  Rejected:        { bg: '#fef2f2', fg: '#dc2626' },
  Returned:        { bg: '#fffbeb', fg: '#d97706' },
  'PO Raised':     { bg: '#f0fdf4', fg: '#16a34a' },
  Converted:       { bg: '#f0fdf4', fg: '#16a34a' },
  'Converted to RFQ': { bg: '#f0fdf4', fg: '#16a34a' },
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusPill(status) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Draft;
  return `<span style="display:inline-block;margin-top:2.5mm;padding:1.4mm 3.5mm;border-radius:10mm;font-size:7.5px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;background:${c.bg};color:${c.fg};">${esc(status)}</span>`;
}

function detailRow(label, value) {
  return `<tr>
    <td style="padding:1.6mm 0;border-bottom:1px dashed #e2e8f0;" colspan="2">
      <table style="width:100%;border-collapse:collapse;border-spacing:0;"><tr>
        <td style="${S.detailLabel}">${esc(label)}</td>
        <td style="${S.detailValue}">${esc(value || '—')}</td>
      </tr></table>
    </td>
  </tr>`;
}

/* ------------------------------------------------------------------ */
/*  Build the full HTML string from editable document state.           */
/* ------------------------------------------------------------------ */
export function buildPrHtml(editableData) {
  const { company, record, preparedBy, checkedBy, approvedBy, generatedAt } = editableData;
  const totals = record?.totals || {};
  const items = record?.items || [];
  const currency = record?.currency || '';
  const showIgst = Number(totals.igst ?? 0) > 0;

  /* ---------- Company header ---------- */
  const companyHtml = `
    <table style="width:100%;border-collapse:collapse;border-spacing:0;${S.companyBorder}">
      <tr>
        <td style="vertical-align:top;width:70%;">
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin:0;">${esc(company?.name)}</div>
          <div style="${S.companyAddr}">${esc(company?.address)}</div>
          <div style="${S.companyContact}">
            GSTIN ${esc(company?.gstin)} &nbsp;·&nbsp; ${esc(company?.phone)} &nbsp;·&nbsp; ${esc(company?.email)}
          </div>
        </td>
        <td style="vertical-align:top;text-align:right;width:30%;">
          <div style="${S.docTitle}">Purchase Requisition</div>
          <div style="${S.prNo}">${esc(record?.prNo)}</div>
          <div style="padding-top:2.5mm;">${statusPill(record?.status)}</div>
        </td>
      </tr>
    </table>`;

  /* ---------- Details grid ---------- */
  const leftDetails = [
    ['Title', record?.title],
    ['Department', record?.department],
    ['Project', record?.project],
    ['Requester', record?.requester],
    ['Buyer', record?.buyer],
    ['Priority', record?.priority],
  ];
  const rightDetails = [
    ['Vendor', record?.vendor],
    ['Required Date', record?.expectedDate ? formatDate(record.expectedDate) : ''],
    ['Payment Terms', record?.terms],
    ['Currency', record?.currency],
    ['Created', record?.createdAt ? formatDateTime(record.createdAt) : ''],
    ['GST Type', record?.gstType],
  ];

  const detailsHtml = `
    <table style="width:100%;border-collapse:collapse;border-spacing:0;padding:5mm 0 2mm;">
      <tr>
        <td style="vertical-align:top;padding:0 6mm 0 0;width:50%;">
          <table style="width:100%;border-collapse:collapse;border-spacing:0;">
            ${leftDetails.map(([l, v]) => detailRow(l, v)).join('')}
          </table>
        </td>
        <td style="vertical-align:top;padding:0;width:50%;">
          <table style="width:100%;border-collapse:collapse;border-spacing:0;">
            ${rightDetails.map(([l, v]) => detailRow(l, v)).join('')}
          </table>
        </td>
      </tr>
    </table>`;

  /* ---------- Line items ---------- */
  const colWidths = ['4%', '36%', '8%', '7%', '7%', '11%', '8%', '8%', '11%'];
  const itemRows = items.map((item, idx) => {
    const lineTotal =
      totals?.lines?.[idx]?.total ??
      (Number(item.qty) || 0) * (Number(item.rate) || 0) * (1 - (Number(item.discount) || 0) / 100);
    const bgColor = idx % 2 === 1 ? 'background:#f8fafc;' : '';
    return `<tr>
      <td style="${S.td}${bgColor}">${idx + 1}</td>
      <td style="${S.tdDesc}${bgColor}">${esc(item.product || '—')}</td>
      <td style="${S.td}${bgColor}">${esc(item.hsn || '—')}</td>
      <td style="${S.td}${bgColor}">${esc(item.uom || '—')}</td>
      <td style="${S.tdRight}${bgColor}">${Number(item.qty) || 0}</td>
      <td style="${S.tdRight}${bgColor}">${formatAmountConverted(item.rate, currency)}</td>
      <td style="${S.tdRight}${bgColor}">${Number(item.discount) || 0}%</td>
      <td style="${S.tdRight}${bgColor}">${Number(item.gstRate) || 0}%</td>
      <td style="${S.tdRight}${bgColor}">${formatAmountConverted(lineTotal, currency)}</td>
    </tr>`;
  }).join('');

  const itemsTableHtml = `
    <div style="padding-top:6mm;">
      <div style="${S.sectionLabel}">Line Items</div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px;">
        <thead>
          <tr>
            <th style="${S.th}col-width:${colWidths[0]};">#</th>
            <th style="${S.th}col-width:${colWidths[1]};">Description</th>
            <th style="${S.th}col-width:${colWidths[2]};">HSN</th>
            <th style="${S.th}col-width:${colWidths[3]};">UOM</th>
            <th style="${S.thRight}col-width:${colWidths[4]};">Qty</th>
            <th style="${S.thRight}col-width:${colWidths[5]};">Rate</th>
            <th style="${S.thRight}col-width:${colWidths[6]};">Disc %</th>
            <th style="${S.thRight}col-width:${colWidths[7]};">GST %</th>
            <th style="${S.thRight}col-width:${colWidths[8]};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="9" style="text-align:center;font-style:italic;color:#94a3b8;padding:6mm 2mm;">No line items</td></tr>`}
        </tbody>
      </table>
    </div>`;

  /* ---------- Notes + Financial summary ---------- */
  const summaryRows = [
    ['Subtotal', formatAmountConverted(totals.subtotal ?? 0, currency)],
    ['Discount', totals.discountAmount ? `− ${formatAmountConverted(totals.discountAmount, currency)}` : '—'],
    ['Taxable Value', formatAmountConverted(totals.taxable ?? 0, currency)],
    ...(showIgst
      ? [['IGST', formatAmountConverted(totals.igst ?? 0, currency)]]
      : [
          ['CGST', formatAmountConverted(totals.cgst ?? 0, currency)],
          ['SGST', formatAmountConverted(totals.sgst ?? 0, currency)]
        ]),
    ['Charges', formatAmountConverted(totals.charges ?? 0, currency)],
    ['Round Off', `${(totals.roundOff ?? 0) >= 0 ? '+' : '−'} ${formatAmountConverted(Math.abs(totals.roundOff ?? 0), currency)}`]
  ];

  const summaryRowsHtml = summaryRows.map(([label, value]) =>
    `<div style="${S.summaryRow}"><span>${label}</span><span style="${S.summaryValue}">${value}</span></div>`
  ).join('');

  const bottomHtml = `
    <table style="width:100%;border-collapse:collapse;border-spacing:0;padding-top:7mm;">
      <tr>
        <td style="vertical-align:top;width:50%;padding-right:5mm;">
          <div style="${S.sectionLabel}">Notes</div>
          <p style="${S.notesText}">${esc(record?.notes || 'No additional notes.')}</p>
          ${record?.internalNotes ? `<p style="${S.notesInternal}">Internal: ${esc(record.internalNotes)}</p>` : ''}

          <div style="${S.sectionLabel}${S.wordsLabel}">Amount in Words</div>
          <p style="${S.wordsText}">${esc(totals.inWords || 'Zero Rupees Only')}</p>
        </td>
        <td style="vertical-align:top;width:50%;">
          <div style="${S.sectionLabel}">Financial Summary</div>
          <div style="${S.summaryBorder}">
            ${summaryRowsHtml}
            <div style="${S.grandRow}">
              <span>Grand Total</span>
              <span style="${S.grandValue}">${formatAmountConverted(totals.roundedTotal ?? totals.total ?? 0, currency)}</span>
            </div>
          </div>
        </td>
      </tr>
    </table>`;

  /* ---------- Signatures ---------- */
  const signatories = [
    ['Prepared By', preparedBy],
    ['Checked By', checkedBy],
    ['Approved By', approvedBy]
  ];

  const signsHtml = `
    <table style="width:100%;border-collapse:collapse;border-spacing:0;margin-top:8mm;">
      <tr>
        ${signatories.map(([role, name]) => `
          <td style="width:33%;padding-right:4mm;vertical-align:top;">
            <div style="${S.signRole}">${role}</div>
            <div style="${S.signLine}">
              <p style="${S.signName}">${esc(name || '—')}</p>
              <p style="${S.signSub}">Signature</p>
            </div>
          </td>
        `).join('')}
      </tr>
    </table>`;

  /* ---------- Footer ---------- */
  const footerHtml = `
    <div style="${S.footer}">
      <span>Generated on ${esc(formatDateTime(generatedAt))}</span>
      <span>Page 1 of 1</span>
    </div>`;

  /* ---------- Assemble ---------- */
  const fullHtml = `
    <div style="${S.body}">
      ${companyHtml}
      ${detailsHtml}
      ${itemsTableHtml}
      ${bottomHtml}
      ${signsHtml}
      ${footerHtml}
    </div>`;

  return fullHtml;
}

/* ------------------------------------------------------------------ */
/*  Build plain-text fallback.                                         */
/* ------------------------------------------------------------------ */
export function buildPrPlainText(editableData) {
  const { company, record, preparedBy, checkedBy, approvedBy, generatedAt } = editableData;
  const totals = record?.totals || {};
  const items = record?.items || [];
  const currency = record?.currency || '';

  const lines = [];
  lines.push(company?.name || '');
  lines.push(company?.address || '');
  lines.push(`GSTIN ${company?.gstin || ''}  |  ${company?.phone || ''}  |  ${company?.email || ''}`);
  lines.push('');
  lines.push('Purchase Requisition');
  lines.push(record?.prNo || '');
  lines.push(`Status: ${record?.status || ''}`);
  lines.push('');
  lines.push(`Title: ${record?.title || ''}`);
  lines.push(`Department: ${record?.department || ''}`);
  lines.push(`Project: ${record?.project || ''}`);
  lines.push(`Requester: ${record?.requester || ''}`);
  lines.push(`Buyer: ${record?.buyer || ''}`);
  lines.push(`Priority: ${record?.priority || ''}`);
  lines.push(`Vendor: ${record?.vendor || ''}`);
  lines.push(`Required Date: ${record?.expectedDate ? formatDate(record.expectedDate) : ''}`);
  lines.push(`Payment Terms: ${record?.terms || ''}`);
  lines.push(`Currency: ${record?.currency || ''}`);
  lines.push(`Created: ${record?.createdAt ? formatDateTime(record.createdAt) : ''}`);
  lines.push(`GST Type: ${record?.gstType || ''}`);
  lines.push('');
  lines.push('LINE ITEMS');
  lines.push('# | Description | HSN | UOM | Qty | Rate | Disc% | GST% | Amount');
  items.forEach((item, idx) => {
    const lineTotal =
      totals?.lines?.[idx]?.total ??
      (Number(item.qty) || 0) * (Number(item.rate) || 0) * (1 - (Number(item.discount) || 0) / 100);
    lines.push(
      `${idx + 1} | ${item.product || '—'} | ${item.hsn || '—'} | ${item.uom || '—'} | ${Number(item.qty) || 0} | ${formatAmountConverted(item.rate, currency)} | ${Number(item.discount) || 0}% | ${Number(item.gstRate) || 0}% | ${formatAmountConverted(lineTotal, currency)}`
    );
  });
  lines.push('');
  lines.push('NOTES');
  lines.push(record?.notes || 'No additional notes.');
  if (record?.internalNotes) lines.push(`Internal: ${record.internalNotes}`);
  lines.push('');
  lines.push('FINANCIAL SUMMARY');
  lines.push(`Subtotal: ${formatAmountConverted(totals.subtotal ?? 0, currency)}`);
  lines.push(`Discount: ${totals.discountAmount ? '− ' + formatAmountConverted(totals.discountAmount, currency) : '—'}`);
  lines.push(`Taxable Value: ${formatAmountConverted(totals.taxable ?? 0, currency)}`);
  const showIgst = Number(totals.igst ?? 0) > 0;
  if (showIgst) {
    lines.push(`IGST: ${formatAmountConverted(totals.igst ?? 0, currency)}`);
  } else {
    lines.push(`CGST: ${formatAmountConverted(totals.cgst ?? 0, currency)}`);
    lines.push(`SGST: ${formatAmountConverted(totals.sgst ?? 0, currency)}`);
  }
  lines.push(`Charges: ${formatAmountConverted(totals.charges ?? 0, currency)}`);
  lines.push(`Round Off: ${(totals.roundOff ?? 0) >= 0 ? '+' : '−'} ${formatAmountConverted(Math.abs(totals.roundOff ?? 0), currency)}`);
  lines.push(`Grand Total: ${formatAmountConverted(totals.roundedTotal ?? totals.total ?? 0, currency)}`);
  lines.push('');
  lines.push(`Amount in Words: ${totals.inWords || 'Zero Rupees Only'}`);
  lines.push('');
  lines.push(`Prepared By: ${preparedBy || '—'}`);
  lines.push(`Checked By: ${checkedBy || '—'}`);
  lines.push(`Approved By: ${approvedBy || '—'}`);
  lines.push('');
  lines.push(`Generated on ${formatDateTime(generatedAt)}`);

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Clipboard write helper — tries the modern async Clipboard API     */
/*  first, then falls back to execCommand for older browsers.         */
/* ------------------------------------------------------------------ */
export async function copyPrToClipboard(editableData) {
  const html = buildPrHtml(editableData);
  const text = buildPrPlainText(editableData);

  /* Modern async Clipboard API (requires HTTPS or localhost). */
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([text], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]);
      return true;
    } catch {
      /* Fall through to execCommand fallback. */
    }
  }

  /* Fallback: execCommand('copy') — synchronously sets clipboard data. */
  try {
    const ta = document.createElement('div');
    ta.contentEditable = 'true';
    ta.innerHTML = html;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ta);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    selection.removeAllRanges();
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the native `copy` event on the document container.
 * Intercepts the default copy and replaces the clipboard data with
 * email-safe inline-styled HTML + plain text fallback.
 */
export function handlePrCopyEvent(event, editableData) {
  const html = buildPrHtml(editableData);
  const text = buildPrPlainText(editableData);

  try {
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  } catch {
    /* If setting clipboard data fails, let the browser handle it
       natively — the DOM selection will be copied as-is. */
  }
}

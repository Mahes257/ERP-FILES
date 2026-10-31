/**
 * QFormPrint — Complete Q Form Print / PDF Download.
 *
 * Opens a new window with a standalone document containing:
 *   1. Document Header (VISHAK TECH / Q FORM)
 *   2. Document Information (ID, Status, Visit No, etc.)
 *   3. Complete Q Form (ALL sections, even empty ones)
 *
 * Portrait A4, multi-page, professional business document.
 */

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function e(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ev(s) { return s ? e(s) : '—'; }

// ============================== Print CSS ==============================

const CSS = `
@page { size: A4 portrait; margin: 14mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #1e293b; margin: 0; padding: 0; line-height: 1.35; background: #fff; }

/* Header */
.hdr { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #0B4A3D; margin-bottom: 14px; page-break-after: avoid; }
.hdr-co { font-size: 20pt; font-weight: 800; color: #0B4A3D; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 2px; }
.hdr-t { font-size: 13pt; font-weight: 700; color: #334155; margin: 0 0 6px; }
.hdr-m { font-size: 9pt; color: #6B7280; }
.hdr-m strong { color: #1e293b; }

/* Section title */
.st { font-size: 11pt; font-weight: 700; color: #0B4A3D; border-bottom: 2px solid #0B4A3D; padding-bottom: 3px; margin: 16px 0 8px; page-break-after: avoid; }
.st-sub { font-size: 9.5pt; font-weight: 600; color: #475569; margin: 10px 0 5px; font-style: italic; }

/* Info grid (2-col for document info and visit details) */
.ig { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 12px; }
.ir { display: flex; align-items: baseline; gap: 6px; padding: 3px 0; border-bottom: 1px dotted #e2e8f0; }
.il { font-size: 8.5pt; font-weight: 600; color: #6B7280; min-width: 130px; flex-shrink: 0; }
.iv { font-size: 9.5pt; font-weight: 500; color: #1e293b; }

/* Field group (label + value box) */
.fg { margin-bottom: 10px; page-break-inside: avoid; }
.fl { font-size: 8.5pt; font-weight: 600; color: #6B7280; margin-bottom: 2px; }
.fv { font-size: 9.5pt; color: #1e293b; padding: 4px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3px; word-wrap: break-word; overflow-wrap: break-word; min-height: 20px; white-space: pre-wrap; }
.fv.empty { color: #9CA3AF; font-style: italic; }

/* Tables — headers repeat on continuation */
table.dt { width: 100%; border-collapse: collapse; margin: 6px 0 14px; font-size: 8.5pt; }
table.dt thead { display: table-header-group; }
table.dt th { background: #F3F4F6; font-weight: 700; font-size: 8pt; padding: 5px 6px; border: 1px solid #cbd5e1; text-align: left; white-space: nowrap; color: #334155; }
table.dt td { padding: 4px 6px; border: 1px solid #e2e8f0; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
table.dt .sno { width: 30px; text-align: center; font-weight: 600; color: #6B7280; }
table.dt .mach { font-weight: 600; color: #1e293b; min-width: 90px; }
table.dt tr { page-break-inside: avoid; }

/* Remarks */
.rbox { padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3px; font-size: 9.5pt; white-space: pre-wrap; word-wrap: break-word; min-height: 22px; }

/* Signatures */
.sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; page-break-inside: avoid; }
.sig-block { text-align: center; }
.sig-lbl { font-size: 8.5pt; font-weight: 600; color: #6B7280; margin-bottom: 6px; }
.sig-line { border-bottom: 1px solid #9CA3AF; margin: 36px 20px 4px; }
.sig-img { max-width: 200px; max-height: 55px; object-fit: contain; }

/* Footer */
.dfoot { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 7.5pt; color: #9CA3AF; page-break-after: avoid; }
@media print {
  .dfoot::after { content: "VISHAK TECH ERP — Q Form — Page " counter(page) " of " counter(pages); font-size: 7.5pt; color: #9CA3AF; }
  body { counter-reset: page; }
  .hdr { counter-increment: none; }
}
`;

// ============================== Table Renderers ==============================

function tbl(headers, rows, cls) {
  return `<table class="dt ${cls || ''}"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

function plantOem(rows) {
  const h = ['S.No','Machine','IKN','FL Smith','Polysius (Poly Track)','KHD','Claudius Peters','Sinoma'];
  const body = (rows || []).map((r, i) => `<tr><td class="sno">${String.fromCharCode(97+i)}.</td><td class="mach">${e(r.machine)||''}</td><td>${e(r.ikn)||''}</td><td>${e(r.flSmith)||''}</td><td>${e(r.polysius)||''}</td><td>${e(r.khd)||''}</td><td>${e(r.claudiusPeters)||''}</td><td>${e(r.sinoma)||''}</td></tr>`).join('');
  return `<div class="st-sub">Plant OEM Details as Follows: (Original Equipment Manufacturer)</div>` + tbl(h, body);
}

function vrmOem(rows) {
  const h = ['S.No','Machine','Loesche','Gebr. Pfeiffer','Polysius','Pfeiffer','Pfeiffer Part No.','Atox','Sinoma'];
  const body = (rows || []).map((r, i) => `<tr><td class="sno">${String.fromCharCode(97+i)}.</td><td class="mach">${e(r.machine)||''}</td><td>${e(r.loesche)||''}</td><td>${e(r.gebrPfeiffer)||''}</td><td>${e(r.polysius)||''}</td><td>${e(r.pfeiffer)||''}</td><td>${e(r.pfeifferPartNumber)||''}</td><td>${e(r.atox)||''}</td><td>${e(r.sinoma)||''}</td></tr>`).join('');
  return `<div class="st-sub">VRM OEM Details</div>` + tbl(h, body);
}

function cementMill(rows) {
  const h = ['Machine','Christian Pfeiffer','Vega','Megatoux'];
  const body = (rows||[]).map(r => `<tr><td class="mach">Cement Mill / Ball Mill</td><td>${e(r.christianPfeiffer)||''}</td><td>${e(r.vega)||''}</td><td>${e(r.megatoux)||''}</td></tr>`).join('');
  return `<div class="st-sub">Cement Mill / Ball Mill OEM Details</div>` + tbl(h, body);
}

function clinkerCrusher(rows) {
  const h = ['Type','Roller — IKN','Roller — FL Smith','Hammer Impact'];
  const body = (rows||[]).map(r => `<tr><td>${e(r.machine)||''}</td><td>${e(r.rollerIkn)||''}</td><td>${e(r.rollerFlSmith)||''}</td><td>${e(r.hammerImpact)||''}</td></tr>`).join('');
  return `<div class="st-sub">Clinker Crusher</div>` + tbl(h, body);
}

function limestoneCrusher(details) {
  return `<div class="fv${!details ? ' empty' : ''}">${e(details) || 'Not filled'}</div>`;
}

function packingPlant(rows) {
  const h = ['Machine','FL Smith','Vendomatic','Buemer','Haver &amp; Booker','China'];
  const body = (rows||[]).map(r => `<tr><td class="mach">Packing Plant</td><td>${e(r.flSmith)||''}</td><td>${e(r.vendomatic)||''}</td><td>${e(r.buemer)||''}</td><td>${e(r.haverBooker)||''}</td><td>${e(r.china)||''}</td></tr>`).join('');
  return `<div class="st-sub">Packing Plant OEM Details</div>` + tbl(h, body);
}

function contacts(rows) {
  const h = ['Department','Person In Charge','Mobile','Mail ID'];
  const body = (rows||[]).map(r => `<tr><td>${e(r.department)||''}</td><td>${e(r.personInCharge)||''}</td><td>${e(r.mobile)||''}</td><td>${e(r.mailId)||''}</td></tr>`).join('');
  return tbl(h, body);
}

function sig(label, data) {
  return data
    ? `<div class="sig-block"><div class="sig-lbl">${e(label)}</div><img src="${data}" class="sig-img" /></div>`
    : `<div class="sig-block"><div class="sig-lbl">${e(label)}</div><div class="sig-line"></div></div>`;
}

// ============================== Main ==============================

export function printQForm(qf, visit) {
  if (!qf) return;

  const formNo = qf.formNo || `QF-${qf.id}`;
  const visitNo = qf.visitNo || visit?.visitNo || '';
  const company = qf.companyName || visit?.companyName || visit?.customerName || '';
  const location = qf.plantLocation || visit?.location || '';
  const marketer = qf.marketer || '';
  const dov = qf.dateOfVisit || visit?.scheduleDate || '';

  // ---- 1. DOCUMENT INFORMATION ----
  const docInfo = [
    ['Q Form ID', formNo],
    ['Status', qf.status || ''],
    ['Visit No', visitNo],
    ['Marketing User', marketer],
    ['Travel Registry Ref', qf.travelPlanNo || ''],
    ['Company', company],
    ['Location', location],
    ['Created', fmtDateTime(qf.createdAt)],
    ['Updated', fmtDateTime(qf.updatedAt)],
    ['Submitted', fmtDateTime(qf.submittedAt)],
  ];

  // ---- 2. VISIT BASIC DETAILS ----
  const visitInfo = [
    ['Company / Plant', company],
    ['Location', location],
    ['Address', visit?.address || qf.location || ''],
    ['Visit / Lead No', [visitNo, visit?.leadNo].filter(Boolean).join(' / ') || ''],
    ['Visit Date', dov ? fmtDate(dov) : ''],
    ['Visit Status', visit?.visitStatus || ''],
    ['Appointment Status', visit?.appointmentStatus || ''],
    ['Meeting Person', visit?.meetingPerson || visit?.contactPerson || ''],
    ['Designation', visit?.meetingDesignation || visit?.designation || ''],
    ['Marketing User', marketer],
    ['Next Follow-up', visit?.followupDate ? fmtDate(visit.followupDate) : ''],
    ['Contact Phone', visit?.phone || ''],
  ];

  // ---- 3. VISIT / PLANT BASIC INFORMATION ----
  const plantInfo = [
    ['Date of Visit', qf.dateOfVisit ? fmtDate(qf.dateOfVisit) : ''],
    ['Number of Active Lines', qf.activeLines != null ? String(qf.activeLines) : ''],
    ['Shutdown Period / Year', qf.shutdownPeriod || ''],
    ['Production (Tons/Day)', qf.productionPerDay || ''],
    ['Approximate PR Date', qf.approximatePrDate || ''],
  ];

  // ---- Build HTML ----
  const infoRows = (rows) => rows.filter(([,v]) => v).map(([l,v]) => `<div class="ir"><span class="il">${e(l)}:</span><span class="iv">${e(v)}</span></div>`).join('');
  const infoGrid = (rows) => `<div class="ig">${infoRows(rows)}</div>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Q Form — ${e(formNo)}</title><style>${CSS}</style></head><body>

<div class="hdr">
  <div class="hdr-co">VISHAK TECH</div>
  <div class="hdr-t">Q FORM — QUESTIONNAIRE FORM</div>
  <div class="hdr-m"><strong>${e(formNo)}</strong>${company ? ` &nbsp;|&nbsp; <strong>${e(company)}</strong>` : ''}${visitNo ? ` &nbsp;|&nbsp; Visit: <strong>${e(visitNo)}</strong>` : ''}${dov ? ` &nbsp;|&nbsp; Date: <strong>${fmtDate(dov)}</strong>` : ''}</div>
</div>

<div class="st">DOCUMENT INFORMATION</div>
${infoGrid(docInfo)}

<div class="st">VISIT BASIC DETAILS</div>
${infoGrid(visitInfo)}

<div class="st">VISIT / PLANT BASIC INFORMATION</div>
<div class="fg"><div class="fl">Plant Name &amp; Group Name</div><div class="fv">${e(qf.plantName) || ''}</div></div>
<div class="fg"><div class="fl">Location &amp; Address of the Plant</div><div class="fv">${e(qf.plantLocation) || ''}</div></div>
${infoGrid(plantInfo)}

<div class="st">ANY OTHER REMARKS</div>
<div class="fl">Any Other Remarks:</div>
<div class="fv">${e(qf.basicRemarks) || ''}</div>

<div class="st">PLANT OEM DETAILS</div>
${plantOem(qf.plantOemDetails)}

${vrmOem(qf.vrmOemDetails)}

${cementMill(qf.cementMillOemDetails)}

${clinkerCrusher(qf.clinkerCrusherDetails)}

<div class="st">LIMESTONE CRUSHER</div>
<div class="fg"><div class="fl">Limestone Crusher Details</div>
${limestoneCrusher(qf.limestoneCrusherDetails)}</div>

<div class="st">PACKING PLANT OEM DETAILS</div>
${packingPlant(qf.packingPlantOemDetails)}

<div class="st">CONTACT DETAILS TO BE GET FROM THE PLANT</div>
${contacts(qf.plantContacts)}

<div class="st">BOSS COMMAND</div>
<div class="fl">Boss Command:</div>
<div class="fv">${e(qf.bossCommand) || ''}</div>

<div class="st">SIGNATURE / APPROVAL</div>
<div class="sig-grid">
  ${sig('Signature of the Marketing Lead', qf.marketingLeadSignatureBase64)}
  ${sig('Signature of the Authority', qf.authoritySignatureBase64)}
</div>

<div class="dfoot"></div>

</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => setTimeout(() => w.print(), 300);
}

export function downloadQFormPdf(qf, visit) { printQForm(qf, visit); }
export default { printQForm, downloadQFormPdf };

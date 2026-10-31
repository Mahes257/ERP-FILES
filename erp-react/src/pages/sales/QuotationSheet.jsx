import { forwardRef } from 'react';
import Letterhead from '../../components/SalesDesign/Letterhead';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import { formatDate } from '../../utils/leadHelpers';
import './quotation-templates.css';

function partyRows(customer, doc, showShip) {
  const rows = [];
  const add = (label, value) => {
    if (value) rows.push([label, value]);
  };
  add('Contact', customer?.contact);
  add('GSTIN', customer?.gstin);
  add('PAN', customer?.pan);
  add('Email', customer?.email);
  add('Phone', customer?.phone);
  add('Contact Email', doc?.contactEmail);
  add('Contact Phone', doc?.contactPhone);
  add('Country', customer?.country);
  add('Bill To', customer?.billing);
  if (showShip) add('Ship To', customer?.shipping);
  return rows;
}

function sellerRows(doc) {
  const rows = [];
  if (doc?.companyName) rows.push(['Seller Name', doc.companyName]);
  if (doc?.companyAddress) rows.push(['Address', doc.companyAddress]);
  if (doc?.companyGstin) rows.push(['GSTIN', doc.companyGstin]);
  if (doc?.companyEmail) rows.push(['Email', doc.companyEmail]);
  if (doc?.companyPhone) rows.push(['Phone', doc.companyPhone]);
  return rows;
}

function projectRows(doc) {
  const rows = [];
  const add = (label, value) => {
    if (value) rows.push([label, value]);
  };
  add('Quotation For', doc?.quotationFor);
  add('Project', doc?.project);
  add('Account Manager', doc?.accountManager);
  return rows;
}

function totalRows(p) {
  const T = p.totals || {};
  const rows = [
    { label: 'Sub Total', value: p.money(T.subTotal) },
    { label: 'Discount', value: `${Number(T.discount) > 0 ? '\u2212 ' : ''}${p.money(T.discount)}` },
    { label: 'Additional Charges', value: p.money(p.doc?.charges || 0) },
    { label: 'Freight', value: p.money(p.doc?.freight || 0) },
    { label: 'Insurance', value: p.money(p.doc?.insurance || 0) }
  ];
  if (p.display?.taxSummary) {
    if (p.isInterState) {
      rows.push({ label: p.doc?.taxType || 'IGST', value: p.money(T.taxTotal) });
    } else {
      rows.push({ label: 'CGST', value: p.money(T.cgstTotal) });
      rows.push({ label: 'SGST', value: p.money(T.sgstTotal) });
      rows.push({ label: 'GST (Tax)', value: p.money(T.taxTotal) });
    }
  }
  if (p.display?.showSummarizedTotalQty) {
    rows.push({ label: 'Total Quantity', value: p.fmtQty(p.totalQty) });
  }
  rows.push({ label: 'Round Off', value: p.money(T.roundOffAmount) });
  rows.push({ label: 'Grand Total', value: p.money(T.grandTotal), grand: true });
  return rows;
}

function ItemsRegion({ p }) {
  return <div className="qtn-items">{p.renderItemGrid()}</div>;
}

function HsnRegion({ p }) {
  if (!p.display?.showHsnSummary || !p.hsnSummary || p.hsnSummary.length === 0) return null;
  return (
    <div className="qtn-section qtn-hsn keep-together">
      <div className="qtn-section-title">HSN Summary</div>
      <table className="qtn-hsn-table">
        <thead>
          <tr>
            <th>HSN</th>
            <th>Description</th>
            <th className="qtn-num">Qty</th>
            <th className="qtn-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {p.hsnSummary.map((row) => (
            <tr key={row.hsn}>
              <td className="qtn-strong">{row.hsn}</td>
              <td>{row.name || '\u2014'}</td>
              <td className="qtn-num">{p.fmtQty(row.qty)}</td>
              <td className="qtn-num">{p.money(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetaStrip({ meta }) {
  return (
    <div className="qtn-meta-strip keep-together">
      {meta.map((f) => (
        <div className="qtn-meta-cell" key={f.label}>
          <span className="qtn-meta-label">{f.label}</span>
          <span className="qtn-meta-value">{f.value}</span>
        </div>
      ))}
    </div>
  );
}

function MetaList({ meta }) {
  return (
    <div className="qtn-meta-list keep-together">
      {meta.map((f) => (
        <div className="qtn-meta-row" key={f.label}>
          <span className="qtn-meta-label">{f.label}</span>
          <span className="qtn-meta-value">{f.value}</span>
        </div>
      ))}
    </div>
  );
}

function MetaInline({ meta, dot = true }) {
  return (
    <div className="qtn-meta-inline keep-together">
      {meta.map((f, i) => (
        <span className="qtn-meta-item" key={f.label}>
          <span className="qtn-meta-label">{f.label}</span>
          <span className="qtn-meta-value">{f.value}</span>
          {dot && i < meta.length - 1 && <span className="qtn-meta-dot">|</span>}
        </span>
      ))}
    </div>
  );
}

function MetaTable({ meta }) {
  return (
    <table className="qtn-meta-table keep-together">
      <tbody>
        <tr>
          <td><span className="qtn-meta-label">{meta[0].label}</span><b>{meta[0].value}</b></td>
          <td><span className="qtn-meta-label">{meta[1].label}</span><b>{meta[1].value}</b></td>
        </tr>
        <tr>
          <td><span className="qtn-meta-label">{meta[2].label}</span><b>{meta[2].value}</b></td>
          <td><span className="qtn-meta-label">{meta[3].label}</span><b>{meta[3].value}</b></td>
        </tr>
      </tbody>
    </table>
  );
}

function PartyCard({ title, name, rows }) {
  return (
    <div className="qtn-party-card">
      <div className="qtn-party-title">{title}</div>
      <div className="qtn-party-name">{name}</div>
      {rows.length > 0 && (
        <div className="qtn-party-rows">
          {rows.map((row) => (
            <div className="qtn-party-row" key={row[0]}>
              <span className="qtn-party-label">{row[0]}</span>
              <span className="qtn-party-value">{row[1]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartyPlain({ title, name, rows }) {
  return (
    <div className="qtn-party-plain">
      {title && <div className="qtn-party-plain-title">{title}</div>}
      {name && <div className="qtn-party-plain-name">{name}</div>}
      {rows.length > 0 && (
        <div className="qtn-party-rows">
          {rows.map((row) => (
            <div className="qtn-party-row" key={row[0]}>
              <span className="qtn-party-label">{row[0]}</span>
              <span className="qtn-party-value">{row[1]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartyTable({ title, name, rows }) {
  return (
    <table className="qtn-party-table">
      {title && (
        <thead>
          <tr>
            <th colSpan={2}>{title}</th>
          </tr>
        </thead>
      )}
      <tbody>
        {name && (
          <tr className="qtn-party-table-name">
            <td colSpan={2}>{name}</td>
          </tr>
        )}
        {rows.map((row) => (
          <tr key={row[0]}>
            <td className="qtn-party-label">{row[0]}</td>
            <td className="qtn-party-value">{row[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsTable({ p }) {
  return (
    <table className="qtn-totals-table keep-together">
      <tbody>
        {totalRows(p).map((r) => (
          <tr key={r.label} className={r.grand ? 'qtn-gt-row' : ''}>
            <td className="qtn-tt-label">{r.label}</td>
            <td className="qtn-tt-value">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsLedger({ p, wide = false }) {
  return (
    <div className={`qtn-ledger${wide ? ' qtn-ledger-wide' : ''} keep-together`}>
      {totalRows(p).map((r) => (
        <div key={r.label} className={`qtn-ledger-row${r.grand ? ' qtn-ledger-grand' : ''}`}>
          <span className="qtn-l-label">{r.label}</span>
          <span className="qtn-l-dots" />
          <span className="qtn-l-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function WordsBlock({ p }) {
  return (
    <div className="qtn-words keep-together">
      <span className="qtn-words-label">Total (In Words)</span>
      <span className="qtn-words-value">{p.words(p.totals.grandTotal)}</span>
    </div>
  );
}

function SignRight({ p }) {
  return (
    <div className="qtn-sign qtn-sign-right keep-together">
      <div className="qtn-sign-title">Company Seal</div>
      <div className="qtn-sign-space" />
      <div className="qtn-sign-line">
        <span>{p.doc?.signatureLabel || 'Authorized Signatory'}</span>
      </div>
    </div>
  );
}

function SignCentre({ p }) {
  return (
    <div className="qtn-sign qtn-sign-centre keep-together">
      <div className="qtn-sign-title">Company Seal</div>
      <div className="qtn-sign-space" />
      <div className="qtn-sign-line">
        <span>{p.doc?.signatureLabel || 'Authorized Signatory'}</span>
      </div>
    </div>
  );
}

function SignForCompany({ p }) {
  return (
    <div className="qtn-sign qtn-sign-for keep-together">
      <div className="qtn-sign-for-company">For {p.doc?.companyName || 'VISHAK TECH'}</div>
      <div className="qtn-sign-space" />
      <div className="qtn-sign-line">
        <span>{p.doc?.signatureLabel || 'Authorized Signatory'}</span>
      </div>
    </div>
  );
}

function TermsCards({ p }) {
  return (
    <div className="qtn-terms-cards keep-together">
      <div className="qtn-term-card">
        <span className="qtn-term-title">Payment Terms</span>
        <span className="qtn-term-text">{p.doc?.paymentTerms || '\u2014'}</span>
      </div>
      <div className="qtn-term-card">
        <span className="qtn-term-title">Delivery Terms</span>
        <span className="qtn-term-text">{p.doc?.deliveryTerms || '\u2014'}</span>
      </div>
    </div>
  );
}

function TermsPlain({ p }) {
  return (
    <div className="qtn-terms-plain keep-together">
      <div className="qtn-term-plain">
        <span className="qtn-term-title">Payment Terms</span>
        <span className="qtn-term-text">{p.doc?.paymentTerms || '\u2014'}</span>
      </div>
      <div className="qtn-term-plain">
        <span className="qtn-term-title">Delivery Terms</span>
        <span className="qtn-term-text">{p.doc?.deliveryTerms || '\u2014'}</span>
      </div>
    </div>
  );
}

function TermsTable({ p }) {
  return (
    <table className="qtn-terms-table keep-together">
      <tbody>
        <tr>
          <td className="qtn-term-title">Payment Terms</td>
          <td>{p.doc?.paymentTerms || '\u2014'}</td>
        </tr>
        <tr>
          <td className="qtn-term-title">Delivery Terms</td>
          <td>{p.doc?.deliveryTerms || '\u2014'}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CustomFieldsBlock({ p }) {
  const cf = p.customFields || [];
  if (cf.length === 0) return null;
  return (
    <div className="qtn-section qtn-custom keep-together">
      <div className="qtn-section-title">Custom Fields</div>
      <div className="qtn-custom-grid">
        {cf.map((f, i) => (
          <div className="qtn-custom-row" key={i}>
            <span className="qtn-custom-label">{f.name}</span>
            <span className="qtn-custom-value">
              {f.type === 'checkbox' ? (f.value ? 'Yes' : 'No') : String(f.value ?? '') || '\u2014'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdditionalInfoBlock({ p }) {
  const text = p.doc?.additionalInfo;
  if (!text || String(text).trim() === '') return null;
  return (
    <div className="qtn-section qtn-additional keep-together">
      <div className="qtn-section-title">Additional Info</div>
      <div className="qtn-section-body">{text}</div>
    </div>
  );
}

function AttachmentsBlock({ p }) {
  const list = Array.isArray(p.doc?.attachments) ? p.doc.attachments : [];
  if (list.length === 0) return null;
  return (
    <div className="qtn-section qtn-attachments keep-together">
      <div className="qtn-section-title">Attachments</div>
      <ul className="qtn-attach-list">
        {list.map((a, i) => (
          <li key={i}>{a.name || a.fileName || 'Attachment'}</li>
        ))}
      </ul>
    </div>
  );
}

function BankStrip({ p }) {
  const bank = p.bank || {};
  if (!Object.values(bank).filter(Boolean).length) return null;
  return (
    <div className="qtn-section qtn-bank keep-together">
      <div className="qtn-section-title">Bank Details</div>
      <div className="qtn-bank-grid">
        {bank.name && <div className="qtn-bank-item"><span>Bank</span><b>{bank.name}</b></div>}
        {bank.account && <div className="qtn-bank-item"><span>A/C No</span><b>{bank.account}</b></div>}
        {bank.branch && <div className="qtn-bank-item"><span>Branch</span><b>{bank.branch}</b></div>}
        {bank.ifsc && <div className="qtn-bank-item"><span>IFSC</span><b>{bank.ifsc}</b></div>}
        {bank.upi && <div className="qtn-bank-item"><span>UPI</span><b>{bank.upi}</b></div>}
      </div>
    </div>
  );
}

function TermsFooter({ p }) {
  const text = p.doc?.terms || p.header?.terms || p.doc?.notes;
  if (!text) return null;
  return (
    <div className="qtn-section qtn-footer keep-together">
      <div className="qtn-section-title">Terms &amp; Conditions</div>
      <div className="qtn-section-body">{text}</div>
    </div>
  );
}

function KpiPanels({ p }) {
  const rows = [
    { label: 'Items', value: p.itemCount },
    { label: 'Total Qty', value: p.fmtQty(p.totalQty) },
    { label: 'Subtotal', value: p.money(p.totals.subTotal) },
    { label: 'Tax', value: p.money(p.totals.taxTotal) },
    { label: 'Discount', value: p.money(p.totals.discount) },
    { label: 'Charges', value: p.money((p.doc?.charges || 0) + (p.doc?.freight || 0) + (p.doc?.insurance || 0)) },
    { label: 'Grand Total', value: p.money(p.totals.grandTotal) }
  ];
  return (
    <div className="qtn-kpis keep-together">
      {rows.map((r) => (
        <div className="qtn-kpi kpi-base" key={r.label}>
          <span className="qtn-kpi-label">{r.label}</span>
          <span className="qtn-kpi-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardKpis({ p }) {
  const rows = [
    { label: 'Items', value: p.itemCount },
    { label: 'Total Qty', value: p.fmtQty(p.totalQty) },
    { label: 'Subtotal', value: p.money(p.totals.subTotal) },
    { label: 'Tax', value: p.money(p.totals.taxTotal) },
    { label: 'Discount', value: p.money(p.totals.discount) },
    { label: 'Charges', value: p.money((p.doc?.charges || 0) + (p.doc?.freight || 0) + (p.doc?.insurance || 0)) },
    { label: 'Grand Total', value: p.money(p.totals.grandTotal) }
  ];
  return (
    <div className="qtn-dash-kpis keep-together">
      {rows.map((r) => (
        <div className="qtn-dash-kpi dash-widget" key={r.label}>
          <span className="qtn-dash-kpi-label">{r.label}</span>
          <span className="qtn-dash-kpi-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const TEMPLATE_RENDERERS = {
  'classic-corporate': function ClassicCorporate(p) {
    const m = p.meta;
    return (
      <>
        <header className="qtn-cc-header qtn-vt-header">
          <div className="qtn-vt-title-row">
            <div>
              <h1 className="qtn-vt-title">Quotation</h1>
              <div className="qtn-vt-status-row">
                <SalesStatusBadge status={p.status} />
                <span>{p.doc?.companyName || 'VISHAK TECH'}</span>
              </div>
            </div>
            <div className="qtn-vt-title-accent" aria-hidden="true">
              <span />
              <b />
              <em>YOUR PARTNER<br />IN ENGINEERING<br />EXCELLENCE</em>
            </div>
          </div>
          <div className="qtn-vt-meta-row">
            <MetaInline meta={m} dot />
          </div>
          <div className="qtn-vt-prepared">
            <span>Prepared for</span>
            <b>{p.customer?.name || headerFallback(p)}</b>
          </div>
        </header>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <div className="qtn-vt-item-summary keep-together">
          <span><b>Total Items</b>{p.itemCount}</span>
          <i />
          <span><b>Total Qty</b>{p.fmtQty(p.totalQty)}</span>
          <i />
          <span><b>Estimated Value</b>{p.money(p.totals.subTotal)}</span>
        </div>
        <HsnRegion p={p} />
        <div className="qtn-vt-lower">
          <div className="qtn-vt-left">
            {p.display?.showTotals && p.display?.showTotalInWords && <WordsBlock p={p} />}
            <TermsPlain p={p} />
            <div className="qtn-vt-note">We appreciate your interest in our products and services.<br />We look forward to a long and successful partnership.</div>
          </div>
          {p.display?.showTotals && <TotalsTable p={p} />}
        </div>
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-vt-signature keep-together">
          <div>
            <b>For {p.doc?.companyName || 'VISHAK TECH'}</b>
            <div className="qtn-vt-signature-space" />
            <span>{p.doc?.signatureLabel || 'Authorized Signatory'}</span>
          </div>
          <div className="qtn-vt-seal" aria-hidden="true">VISHAK TECH<br /><small>ENGINEERING YOUR SUCCESS</small></div>
        </div>
        <footer className="qtn-vt-footer keep-together">
          <span>&#9881;<b>Engineering<br />Excellence</b></span>
          <span>&#9678;<b>Customer<br />Focus</b></span>
          <span>&#9645;<b>Sustainable<br />Growth</b></span>
          <strong>Your Partner in Engineering Excellence</strong>
        </footer>
      </>
    );
  },

  'modern-modular': function ModernModular(p) {
    return (
      <>
        <div className="qtn-mm-top">
          <div className="qtn-mm-title-wrap">
            <h1 className="qtn-mm-title">QUOTATION</h1>
            <SalesStatusBadge status={p.status} />
          </div>
          <MetaList meta={p.meta} />
        </div>
        <div className="qtn-mm-modules">
          <div className="qtn-mm-module qtn-mm-buyer">
            <div className="qtn-mm-mod-title">Quotation For</div>
            <div className="qtn-mm-mod-name">{p.customer?.name || headerFallback(p)}</div>
            <div className="qtn-mm-prows">
              {p.party.map((row) => (
                <div className="qtn-mm-prow" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
              ))}
            </div>
          </div>
          <div className="qtn-mm-module qtn-mm-seller">
            <div className="qtn-mm-mod-title">Project</div>
            {projectRows(p.doc).map((row) => (
              <div className="qtn-mm-prow" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
            ))}
            {sellerRows(p.doc).map((row) => (
              <div className="qtn-mm-prow" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
            ))}
          </div>
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-mm-finwrap">
          <div className="qtn-mm-module qtn-mm-fin">
            <div className="qtn-mm-mod-title">Financial Summary</div>
            {p.display?.showTotals && <TotalsTable p={p} />}
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-mm-words"><WordsBlock p={p} /></div>}
          </div>
        </div>
        <div className="qtn-mm-module qtn-mm-terms">
          <div className="qtn-mm-mod-title">Terms</div>
          <TermsPlain p={p} />
        </div>
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-mm-signrow"><SignRight p={p} /></div>
      </>
    );
  },

  'luxury-fine-line': function LuxuryFineLine(p) {
    return (
      <>
        <header className="qtn-fl-header">
          <div className="qtn-fl-brand">V I S H A K&nbsp;&nbsp;T E C H</div>
          <div className="qtn-fl-rule" />
          <div className="qtn-fl-titlerow">
            <h1 className="qtn-fl-title">Quotation</h1>
            <SalesStatusBadge status={p.status} />
          </div>
          <MetaInline meta={p.meta} dot={false} />
        </header>
        <div className="qtn-fl-hairline" />
        <div className="qtn-fl-parties">
          <PartyPlain title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyPlain title="Reference" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-fl-finrow">
          <div className="qtn-fl-finleft">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-fl-words"><WordsBlock p={p} /></div>}
            <TermsPlain p={p} />
          </div>
          <div className="qtn-fl-finright">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <div className="qtn-fl-signrow"><SignForCompany p={p} /></div>
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-fl-footerrule" />
      </>
    );
  },

  'dark-executive': function DarkExecutive(p) {
    return (
      <>
        <header className="qtn-de-masthead">
          <div className="qtn-de-brandrow">
            <div className="qtn-de-brand">VISHAK TECH</div>
            <SalesStatusBadge status={p.status} />
          </div>
          <div className="qtn-de-titlerow">
            <div>
              <h1 className="qtn-de-title">QUOTATION</h1>
              <div className="qtn-de-subtitle">Commercial Offer</div>
            </div>
            <MetaStrip meta={p.meta} />
          </div>
        </header>
        <div className="qtn-de-partywrap">
          <PartyCard title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyCard title="Project" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-de-finrow">
          <div className="qtn-de-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-de-words"><WordsBlock p={p} /></div>}
            <WordsBlockPlaceholder />
          </div>
          <div className="qtn-de-finbox">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <div className="qtn-de-signrow"><SignForCompany p={p} /></div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-de-footer">Prepared by VISHAK TECH \u2014 approved modern executive format</div>
      </>
    );
  },

  'blueprint-industrial': function BlueprintIndustrial(p) {
    return (
      <>
        <header className="qtn-bp-header">
          <div className="qtn-bp-titleblock">
            <div className="qtn-bp-titletop">
              <span className="qtn-bp-big">VISHAK TECH</span>
              <span className="qtn-bp-ref">REF: {p.header.reference || p.doc?.reference || '\u2014'}</span>
            </div>
            <h1 className="qtn-bp-title">QUOTATION</h1>
            <div className="qtn-bp-subrow">
              <span>DOC. NO: {p.header.quotationNo || p.doc?.quotationNo || '\u2014'}</span>
              <span>DRAWN: VISHAK</span>
              <span>SCALE: N/A</span>
              <span>REV: 00</span>
            </div>
          </div>
        </header>
        <div className="qtn-bp-grid">
          <div className="qtn-bp-cell qtn-bp-customer">
            <div className="qtn-bp-cell-title">CUSTOMER</div>
            <div className="qtn-bp-name">{p.customer?.name || headerFallback(p)}</div>
            {p.party.map((row) => (
              <div className="qtn-bp-row" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
            ))}
          </div>
          <div className="qtn-bp-cell qtn-bp-project">
            <div className="qtn-bp-cell-title">PROJECT</div>
            {projectRows(p.doc).map((row) => (
              <div className="qtn-bp-row" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
            ))}
          </div>
        </div>
        <div className="qtn-bp-cell qtn-bp-dates">
          <div className="qtn-bp-grid3">
            {p.meta.map((f) => (
              <div className="qtn-bp-row" key={f.label}><span>{f.label}</span><b>{f.value}</b></div>
            ))}
          </div>
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-bp-bill">
          <div className="qtn-bp-cell-title">BILL OF QUANTITIES</div>
          {p.display?.showTotals && <TotalsLedger p={p} wide />}
          {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-bp-words"><WordsBlock p={p} /></div>}
        </div>
        <div className="qtn-bp-signline">
          <div className="qtn-bp-signblock"><div className="qtn-bp-sign-rule" /><span>PREPARED BY</span></div>
          <div className="qtn-bp-signblock"><div className="qtn-bp-sign-rule" /><span>AUTHORIZED SIGNATORY</span></div>
        </div>
        <TermsTable p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-bp-frame">
          <div className="qtn-bp-frame-inner" />
        </div>
      </>
    );
  },

  'financial-report': function FinancialReport(p) {
    return (
      <>
        <header className="qtn-fr-header">
          <div className="qtn-fr-brand">VISHAK TECH</div>
          <div className="qtn-fr-rule" />
          <h1 className="qtn-fr-title">QUOTATION REPORT</h1>
          <div className="qtn-fr-rule" />
          <MetaTable meta={p.meta} />
        </header>
        <div className="qtn-fr-summary keep-together">
          <div className="qtn-fr-sum-item"><span>Grand Total</span><b>{p.money(p.totals.grandTotal)}</b></div>
          <div className="qtn-fr-sum-item"><span>Total Items</span><b>{p.itemCount}</b></div>
          <div className="qtn-fr-sum-item"><span>Total Quantity</span><b>{p.fmtQty(p.totalQty)}</b></div>
          <div className="qtn-fr-sum-item"><span>Tax Payable</span><b>{p.money(p.totals.taxTotal)}</b></div>
        </div>
        <div className="qtn-fr-body">
          <div className="qtn-fr-left">
            <PartyTable title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          </div>
          <div className="qtn-fr-right">
            <PartyTable title="Reference" name="" rows={projectRows(p.doc)} />
          </div>
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-fr-finrow">
          <div>
            <div className="qtn-fr-fin-head">Financial Summary</div>
            {p.display?.showTotals && <TotalsLedger p={p} wide />}
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-fr-words"><WordsBlock p={p} /></div>}
          </div>
        </div>
        <div className="qtn-fr-notes">
          <TermsPlain p={p} />
          <AdditionalInfoBlock p={p} />
          <AttachmentsBlock p={p} />
        </div>
        <div className="qtn-fr-signrow"><SignRight p={p} /></div>
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-fr-footer">This is a computer generated quotation.</div>
      </>
    );
  },

  'modern-technology': function ModernTechnology(p) {
    return (
      <>
        <header className="qtn-mt-header">
          <div className="qtn-mt-brandrow">
            <div className="qtn-mt-brand">VISHAK TECH</div>
            <SalesStatusBadge status={p.status} />
          </div>
          <div className="qtn-mt-titlebox">
            <div className="qtn-mt-accent" />
            <div>
              <h1 className="qtn-mt-title">QUOTATION</h1>
              <div className="qtn-mt-subtitle">{p.header.accountManager || 'Sales & Estimation'}</div>
            </div>
          </div>
          <div className="qtn-mt-meta">
            <MetaList meta={[p.meta[0], p.meta[1]]} />
            <MetaList meta={[p.meta[2], p.meta[3]]} />
          </div>
        </header>
        <div className="qtn-mt-parties qtn-party-duo">
          <PartyCard title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyCard title="Project / Account" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-mt-finrow">
          <div className="qtn-mt-finleft">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-mt-words"><WordsBlock p={p} /></div>}
            <SignRight p={p} />
          </div>
          <div className="qtn-mt-finright">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-mt-footerbar" />
      </>
    );
  },

  'architectural-grid': function ArchitecturalGrid(p) {
    return (
      <>
        <header className="qtn-ar-header">
          <div className="qtn-ar-mark left" />
          <div className="qtn-ar-titlezone">
            <div className="qtn-ar-topline">
              <span className="qtn-ar-big">VISHAK TECH</span>
              <span className="qtn-ar-doc">QUOTATION</span>
            </div>
            <div className="qtn-ar-name">FOR: {p.customer?.name ? p.customer.name.toUpperCase() : '\u2014'}</div>
            <div className="qtn-ar-subname">{projectRows(p.doc).map((row) => `${row[0]}: ${row[1]} `).join('  \u2014  ')}</div>
          </div>
          <div className="qtn-ar-mark right" />
        </header>
        <MetaInline meta={p.meta} />
        <div className="qtn-ar-plan">
          <PartyTable title="CUSTOMER DETAILS" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyTable title="PROJECT DETAILS" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-ar-finrow">
          {p.display?.showTotals && <div className="qtn-ar-fin"><TotalsTable p={p} /></div>}
        </div>
        {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-ar-words"><WordsBlock p={p} /></div>}
        <div className="qtn-ar-signrow"><SignCentre p={p} /></div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-ar-frame">
          <span>DWG: {p.header.reference || p.doc?.reference || '\u2014'}</span>
          <span>NTS</span>
          <span>REV: 00</span>
          <span>{formatDate(p.header.quotationDate)}</span>
          <span>VISHAK TECH \u2014 DESIGN STUDIO</span>
        </div>
      </>
    );
  },

  'editorial-minimal': function EditorialMinimal(p) {
    return (
      <>
        <header className="qtn-em-header">
          <div className="qtn-em-kicker">Estimate N\u00ba {p.header.quotationNo || p.doc?.quotationNo || '\u2014'}</div>
          <h1 className="qtn-em-title">Quotation</h1>
          <div className="qtn-em-rule" />
          <SalesStatusBadge status={p.status} />
          <div className="qtn-em-signed">VISHAK TECH</div>
        </header>
        <MetaInline meta={p.meta} dot={false} />
        <div className="qtn-em-parties">
          <div className="qtn-em-party">
            <div className="qtn-em-label">Prepared for</div>
            <div className="qtn-em-name">{p.customer?.name || headerFallback(p)}</div>
          </div>
          <div className="qtn-em-party qtn-em-party-mid">
            {p.party.map((row) => (
              <div className="qtn-em-line" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
            ))}
          </div>
          <div className="qtn-em-party">
            {projectRows(p.doc).map((row) => (
              <div className="qtn-em-line" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>
            ))}
          </div>
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-em-finrow">
          <div className="qtn-em-finleft">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-em-words"><WordsBlock p={p} /></div>}
            <TermsPlain p={p} />
          </div>
          <div className="qtn-em-finright">{p.display?.showTotals && <TotalsLedger p={p} />}</div>
        </div>
        <div className="qtn-em-signrow"><SignForCompany p={p} /></div>
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-em-foot">VISHAK TECH \u2014 DESIGN &amp; ENGINEERING \u2014 ESTIMATION</div>
      </>
    );
  },

  'elegant-export': function ElegantExport(p) {
    return (
      <>
        <header className="qtn-ex-header">
          <div className="qtn-ex-rule" />
          <div className="qtn-ex-row">
            <h1 className="qtn-ex-title">QUOTATION</h1>
            <SalesStatusBadge status={p.status} />
          </div>
          <MetaInline meta={p.meta} />
          <div className="qtn-ex-rule" />
        </header>
        <div className="qtn-ex-details qtn-ex-details-box">
          <PartyCard title="Exporter / Seller" name={p.doc?.companyName || 'VISHAK TECH'} rows={sellerRows(p.doc)} />
          <div className="qtn-ex-mid" />
          <PartyCard title="Buyer / Customer" name={p.customer?.name || headerFallback(p)} rows={p.party} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-ex-finrow">
          <div className="qtn-ex-finleft">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-ex-words"><WordsBlock p={p} /></div>}
            <SignForCompany p={p} />
          </div>
          <div className="qtn-ex-finright">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-ex-footer">VISHAK TECH \u2014 EXPORTS DIVISION</div>
      </>
    );
  },

  'infographic-style': function InfographicStyle(p) {
    return (
      <>
        <KpiPanels p={p} />
        <header className="qtn-ig-header">
          <div className="qtn-ig-titlerow">
            <h1 className="qtn-ig-title">QUOTATION</h1>
            <SalesStatusBadge status={p.status} />
          </div>
          <MetaStrip meta={p.meta} />
        </header>
        <div className="qtn-ig-parties">
          <PartyCard title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyCard title="Project" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-ig-finrow">
          <div>
            {p.display?.showTotals && <div className="qtn-ig-totals"><TotalsTable p={p} /></div>}
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-ig-words"><WordsBlock p={p} /></div>}
          </div>
          <div className="qtn-ig-signcol"><SignForCompany p={p} /></div>
        </div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-ig-footer">DATA-DRIVEN COMMERCIAL QUOTATION \u2014 VISHAK TECH</div>
      </>
    );
  },

  'minimalist-erp': function MinimalistErp(p) {
    return (
      <>
        <header className="qtn-me-header">
          <div className="qtn-me-titlewrap">
            <div>
              <div className="qtn-me-brand">{p.doc?.companyName || 'VISHAK TECH'}</div>
              <h1 className="qtn-me-title">Quotation</h1>
            </div>
            <SalesStatusBadge status={p.status} />
          </div>
          <MetaTable meta={p.meta} />
        </header>
        <div className="qtn-me-parties">
          <PartyPlain title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyPlain title="Project" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-me-finrow">
          <div className="qtn-me-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-me-words"><WordsBlock p={p} /></div>}
            <SignRight p={p} />
          </div>
          <div className="qtn-me-finbox">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <TermsPlain p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-me-foot">Generated by the ERP quotation module</div>
      </>
    );
  },

  'corporate-blue': function CorporateBlue(p) {
    return (
      <>
        <header className="qtn-cb-band">
          <div className="qtn-cb-row">
            <div>
              <div className="qtn-cb-brand">{p.doc?.companyName || 'VISHAK TECH'}</div>
              <h1 className="qtn-cb-title">QUOTATION</h1>
            </div>
            <SalesStatusBadge status={p.status} />
          </div>
          <MetaStrip meta={p.meta} />
        </header>
        <div className="qtn-cb-parties qtn-party-duo">
          <PartyCard title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyCard title="Project Details" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-cb-finrow">
          <div className="qtn-cb-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-cb-words"><WordsBlock p={p} /></div>}
            <SignRight p={p} />
          </div>
          <div className="qtn-cb-finbox">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-cb-foot">VISHAK TECH \u2014 VISWAKARMA INDUSTRIES</div>
      </>
    );
  },

  'dynamic-grid': function DynamicGrid(p) {
    return (
      <>
        <div className="qtn-dg-grid">
          <div className="qtn-dg-cell qtn-dg-cell-brand">
            <h1 className="qtn-dg-title">QUOTATION</h1>
            <SalesStatusBadge status={p.status} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-meta">
            <MetaList meta={p.meta} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-party">
            <PartyPlain title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-proj">
            <PartyPlain title="Project" name="" rows={projectRows(p.doc)} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-items">
            {p.customFields && p.customFields.length > 0 && <CustomFieldsBlock p={p} />}
            <ItemsRegion p={p} />
            <HsnRegion p={p} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-fin">
            {p.display?.showTotals && <TotalsTable p={p} />}
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-dg-words"><WordsBlock p={p} /></div>}
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-terms">
            <TermsPlain p={p} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-sign">
            <SignRight p={p} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-bank">
            <BankStrip p={p} />
          </div>
          <div className="qtn-dg-cell qtn-dg-cell-foot">
            <AdditionalInfoBlock p={p} />
            <AttachmentsBlock p={p} />
            <TermsFooter p={p} />
          </div>
        </div>
      </>
    );
  },

  'elegant-borderless': function ElegantBorderless(p) {
    return (
      <>
        <header className="qtn-eb-header">
          <div className="qtn-eb-titlerow">
            <h1 className="qtn-eb-title">Quotation</h1>
            <SalesStatusBadge status={p.status} />
          </div>
          <div className="qtn-eb-sub">Commercial Estimate</div>
          <MetaInline meta={p.meta} dot={false} />
        </header>
        <div className="qtn-eb-parties">
          <PartyPlain title="Prepared for" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyPlain title="Project" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-eb-finrow">
          <div className="qtn-eb-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-eb-words"><WordsBlock p={p} /></div>}
            <div className="qtn-eb-sign"><SignForCompany p={p} /></div>
          </div>
          <div className="qtn-eb-finbox">{p.display?.showTotals && <TotalsLedger p={p} />}</div>
        </div>
        <TermsPlain p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-eb-footrule" />
      </>
    );
  },

  'photo-header': function PhotoHeader(p) {
    return (
      <>
        <div className="qtn-ph-masthead">
          <div className="qtn-ph-shape qtn-ph-shape-a" />
          <div className="qtn-ph-shape qtn-ph-shape-b" />
          <div className="qtn-ph-copy">
            <div className="qtn-ph-brand">{p.doc?.companyName || 'VISHAK TECH'}</div>
            <h1 className="qtn-ph-title">QUOTATION</h1>
            <div className="qtn-ph-tagline">Engineering excellence, delivered with clarity</div>
          </div>
          <div className="qtn-ph-badge"><SalesStatusBadge status={p.status} /></div>
        </div>
        <MetaStrip meta={p.meta} />
        <div className="qtn-ph-parties">
          <PartyCard title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyCard title="Project" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-ph-finrow">
          <div className="qtn-ph-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-ph-words"><WordsBlock p={p} /></div>}
            <SignRight p={p} />
          </div>
          <div className="qtn-ph-finbox">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-ph-footrule" />
      </>
    );
  },

  'geometric-layers': function GeometricLayers(p) {
    return (
      <>
        <header className="qtn-gl-header">
          <div className="qtn-gl-layer qtn-gl-layer-a" />
          <div className="qtn-gl-layer qtn-gl-layer-b" />
          <div className="qtn-gl-content">
            <div className="qtn-gl-brand">VISHAK TECH</div>
            <div className="qtn-gl-titlerow">
              <h1 className="qtn-gl-title">QUOTATION</h1>
              <SalesStatusBadge status={p.status} />
            </div>
          </div>
        </header>
        <div className="qtn-gl-meta"><MetaStrip meta={p.meta} /></div>
        <div className="qtn-gl-parties">
          <PartyCard title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyCard title="Project" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-gl-finrow">
          <div className="qtn-gl-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-gl-words"><WordsBlock p={p} /></div>}
            <SignForCompany p={p} />
          </div>
          <div className="qtn-gl-finbox">{p.display?.showTotals && <TotalsTable p={p} />}</div>
        </div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-gl-foot">
          <span className="qtn-gl-footstripe" />
          <span className="qtn-gl-footstripe qtn-gl-footstripe-b" />
          <span className="qtn-gl-footstripe qtn-gl-footstripe-c" />
        </div>
      </>
    );
  },

  'elegant-monochrome': function ElegantMonochrome(p) {
    return (
      <>
        <header className="qtn-emb-header">
          <div className="qtn-emb-toprule" />
          <div className="qtn-emb-brand">VISHAK TECH</div>
          <h1 className="qtn-emb-title">QUOTATION</h1>
          <div className="qtn-emb-rule" />
          <SalesStatusBadge status={p.status} />
        </header>
        <MetaTable meta={p.meta} />
        <div className="qtn-emb-parties">
          <PartyTable title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyTable title="Project References" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-emb-finrow">
          <div className="qtn-emb-words">{p.display?.showTotals && p.display?.showTotalInWords && <WordsBlock p={p} />}</div>
          <div className="qtn-emb-fin">{p.display?.showTotals && <TotalsLedger p={p} />}</div>
        </div>
        <div className="qtn-emb-signrow"><SignCentre p={p} /></div>
        <TermsTable p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-emb-footer">
          <div className="qtn-emb-bottomrule" />
          <span>VISHAK TECH</span>
        </div>
      </>
    );
  },

  'dashboard-style': function DashboardStyle(p) {
    return (
      <>
        <DashboardKpis p={p} />
        <div className="qtn-db-titlewrap">
          <div>
            <div className="qtn-db-brand">VISHAK TECH</div>
            <h1 className="qtn-db-title">Quotation</h1>
          </div>
          <SalesStatusBadge status={p.status} />
        </div>
        <MetaStrip meta={p.meta} />
        <div className="qtn-db-parties">
          <PartyCard title="Quotation For" name={p.customer?.name || headerFallback(p)} rows={p.party} />
          <PartyCard title="Project" name="" rows={projectRows(p.doc)} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-db-finrow">
          <div className="qtn-db-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-db-words"><WordsBlock p={p} /></div>}
            <SignRight p={p} />
          </div>
          <div className="qtn-db-finbox">{p.display?.showTotals && <div className="qtn-db-widget"><div className="qtn-db-wid-title">Financial Summary</div><TotalsTable p={p} /></div>}</div>
        </div>
        <div className="qtn-db-widget qtn-db-termswidget">
          <div className="qtn-db-wid-title">Commercial Terms</div>
          <TermsPlain p={p} />
        </div>
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-db-foot">Viswaker KPI quotation \u2014 generated by ERP</div>
      </>
    );
  },

  'premium-trade': function PremiumTrade(p) {
    return (
      <>
        <header className="qtn-pt-masthead">
          <div className="qtn-pt-goldline" />
          <div className="qtn-pt-row">
            <div>
              <div className="qtn-pt-brand">VISHAK TECH</div>
              <h1 className="qtn-pt-title">QUOTATION</h1>
            </div>
            <SalesStatusBadge status={p.status} />
          </div>
          <div className="qtn-pt-goldline" />
        </header>
        <MetaInline meta={p.meta} />
        <div className="qtn-pt-details qtn-party-duo">
          <PartyCard title="Seller" name={p.doc?.companyName || 'VISHAK TECH'} rows={sellerRows(p.doc)} />
          <PartyCard title="Buyer" name={p.customer?.name || headerFallback(p)} rows={p.party} />
        </div>
        <CustomFieldsBlock p={p} />
        <ItemsRegion p={p} />
        <HsnRegion p={p} />
        <div className="qtn-pt-finrow">
          <div className="qtn-pt-finwords">
            {p.display?.showTotals && p.display?.showTotalInWords && <div className="qtn-pt-words"><WordsBlock p={p} /></div>}
            <SignForCompany p={p} />
          </div>
          <div className="qtn-pt-finbox">{p.display?.showTotals && <TotalsLedger p={p} />}</div>
        </div>
        <TermsCards p={p} />
        <AdditionalInfoBlock p={p} />
        <AttachmentsBlock p={p} />
        <BankStrip p={p} />
        <TermsFooter p={p} />
        <div className="qtn-pt-foot">
          <div className="qtn-pt-goldline" />
          <span>VISHAK TECH \u2014 TRADING ESTABLISHMENT</span>
        </div>
      </>
    );
  }
};

function WordsBlockPlaceholder() {
  return null;
}

function headerFallback(p) {
  return p.header?.clientName || 'Client';
}

const QuotationSheet = forwardRef(function QuotationSheet(props, ref) {
  const {
    templateKey,
    doc,
    header,
    customFields,
    display,
    totals,
    customer,
    bank,
    placeOfSupply,
    isInterState,
    taxLabel,
    totalQty,
    itemCount,
    showShip,
    money,
    fmtQty,
    words,
    hsnSummary,
    status,
    renderItemGrid
  } = props;

  const meta = [
    { label: 'Quotation No.', value: header?.quotationNo || doc?.quotationNo || '\u2014' },
    {
      // The PR reference is not necessarily CPR-backed: the origin is folded
      // into the printed value so a quotation started directly from the
      // customer enquiry reads correctly in the preview and the generated PDF.
      label: 'Reference PR No.',
      value: (() => {
        const ref = header?.referencePrNo || doc?.referencePrNo || header?.reference || doc?.reference;
        if (!ref) return '\u2014';
        const src = header?.referencePrSource || doc?.referencePrSource;
        if (src === 'CPR' || header?.cprId || doc?.cprId) return `${ref} (CPR Reference)`;
        if (src === 'DIRECT') return `${ref} (Direct PR Reference)`;
        return ref;
      })()
    },
    { label: 'Date', value: formatDate(header?.quotationDate) },
    { label: 'Valid Till', value: formatDate(header?.validUntil) }
  ];
  if (display?.showPlaceCountryOfSupply && placeOfSupply) {
    meta.push({ label: 'Place of Supply', value: placeOfSupply });
  }

  const p = {
    doc,
    header,
    customFields,
    display,
    totals,
    customer,
    bank,
    placeOfSupply,
    isInterState,
    taxLabel,
    totalQty,
    itemCount,
    showShip,
    money,
    fmtQty,
    words,
    hsnSummary,
    status,
    renderItemGrid,
    meta,
    party: partyRows(customer, doc, showShip)
  };

  const render = TEMPLATE_RENDERERS[templateKey] || TEMPLATE_RENDERERS['classic-corporate'];

  return (
    <div
      id="quotation-sheet"
      ref={ref}
      data-template={templateKey}
      data-layout={templateKey}
      data-item-count={itemCount}
      className="qtn-sheet bg-white shadow-[0_8px_30px_rgba(15,23,42,0.14)] rounded-sm mx-auto"
      style={{ width: '210mm', minHeight: '297mm', maxWidth: '100%' }}
    >
      <Letterhead className="qtn-common-letterhead" />
      {render(p)}
    </div>
  );
});

export default QuotationSheet;
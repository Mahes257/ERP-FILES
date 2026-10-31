// ============================================================================
// CprDocument — the CPR document layout, rendered on a white page.
//
// ONE renderer for the CPR (Customer Purchase Request) document. It is the
// exact body the CPR Preview modal has always shown, extracted verbatim so the
// same layout can be reused by any surface (the modal in CprView, and the
// document preview page opened from Documents → View / Preview) instead of
// being duplicated per caller.
//
// Pure presentation: the CPR record is passed in; nothing is fetched here and
// no business value is invented. Items, columns and totals reuse the existing
// cprDocument() / column-config helpers, so the sheet always matches what
// buildCprPrintHtml() and exportCprDocumentPdf() produce.
// ============================================================================
import { Fragment } from 'react';
import Letterhead from '../SalesDesign/Letterhead';
import { cprDocument, defaultCprItemColumns } from '../../utils/cprHelpers';
import { formatDate, formatINR } from '../../utils/leadHelpers';

function InfoRow({ label, value }) {
  return (
    <div className="flex text-xs py-1">
      <span className="w-32 shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-700 font-medium">{value || '—'}</span>
    </div>
  );
}

export default function CprDocument({ cpr }) {
  if (!cpr) return null;
  const d = cprDocument(cpr);
  const totalQty = d.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

  // Dynamic columns from the saved configuration. A CPR that never saved a
  // column configuration resolves to the module defaults, exactly as the CPR
  // record page's own item grid does (record columns → defaults), so the sheet
  // is never reduced to a bare "# / Total" table.
  const configuredColumns = Array.isArray(cpr.itemColumns) && cpr.itemColumns.length
    ? cpr.itemColumns
    : defaultCprItemColumns();
  const allCols = configuredColumns.filter((c) => c && c.id && !c.hidden);
  const stdCols = allCols.filter((c) => c.system);
  const customCols = allCols.filter((c) => !c.system);

  const stdCellValue = (it, col) => {
    switch (col.id) {
      case 'drawingNo': return it.drawingNo || '—';
      case 'description': return it.description || '—';
      case 'specification': return it.specification || '—';
      case 'qty': return it.qty ?? '—';
      case 'unit': return it.unit || '—';
      case 'estimatedCost': return formatINR(Number(it.estimatedCost) || 0);
      case 'remarks': return it.remarks || '—';
      default: return '—';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <Letterhead className="mb-3" />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-400 mt-0.5">Purchase Request</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-slate-800">{cpr.prNo}</div>
          <div className="text-[11px] text-slate-400">{formatDate(cpr.prDate || cpr.createdAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bill To</div>
          <div className="text-xs space-y-0.5">
            <div className="font-bold text-slate-800">{cpr.client || cpr.clientName || '—'}</div>
            {cpr.company && <div>{cpr.company}</div>}
            {cpr.contactPerson && <div>{cpr.contactPerson}</div>}
            {cpr.phone && <div>{cpr.phone}</div>}
            {cpr.email && <div>{cpr.email}</div>}
            {cpr.gst && <div>GST: {cpr.gst}</div>}
            {cpr.billingAddress && <div>{cpr.billingAddress}</div>}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Details</div>
          <InfoRow label="Reference No" value={cpr.referencePrNo} />
          <InfoRow label="Quotation Deadline" value={formatDate(cpr.quotationDeadline)} />
          <InfoRow label="Extended Deadline" value={formatDate(cpr.extendedDeadline)} />
          <InfoRow label="Department" value={cpr.department} />
          <InfoRow label="Requested By" value={cpr.requestedBy || cpr.createdBy} />
          <InfoRow label="Required Date" value={formatDate(cpr.requiredDate)} />
          <InfoRow label="Priority" value={cpr.priority} />
          <InfoRow label="Lead No" value={cpr.leadNo} />
          <InfoRow label="Project" value={cpr.project} />
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          Items ({d.items.length})
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-[#0B4A3D] text-white">
                {['#', ...stdCols.map((c) => c.label), ...customCols.map((c) => c.label), 'Total'].map((h) => (
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.items.map((it, idx) => {
                const cf = it.customFields && typeof it.customFields === 'object' ? it.customFields : {};
                const itemNotes = String(it.notes || '').trim();
                return (
                  <Fragment key={idx}>
                    <tr className="border-b border-slate-100">
                      <td className="px-2 py-1.5 text-xs text-slate-500">{idx + 1}</td>
                      {stdCols.map((c) => (
                        <td key={c.id} className="px-2 py-1.5 text-xs">{stdCellValue(it, c)}</td>
                      ))}
                      {customCols.map((c) => (
                        <td key={c.id} className="px-2 py-1.5 text-xs">{cf[c.id] || '—'}</td>
                      ))}
                      <td className="px-2 py-1.5 text-xs font-semibold">
                        {formatINR((Number(it.qty) || 0) * (Number(it.estimatedCost) || 0))}
                      </td>
                    </tr>
                    {/* Item notes — their own line, line breaks preserved. */}
                    {itemNotes && (
                      <tr className="border-b border-slate-100 bg-slate-50/70">
                        <td colSpan={2 + stdCols.length + customCols.length} className="px-2 py-1 text-[11px] text-slate-600 whitespace-pre-line">
                          <span className="font-bold text-slate-500">Notes: </span>{itemNotes}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td colSpan={1 + stdCols.length + customCols.length} className="px-2 py-2 text-xs font-bold text-[#0B4A3D]">
                  Total ({totalQty} qty)
                </td>
                <td className="px-2 py-2 text-xs font-extrabold text-[#0B4A3D]">{formatINR(d.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {cpr.remarks && (
        <div className="mt-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Remarks</div>
          <div className="text-xs text-slate-600 whitespace-pre-wrap">{cpr.remarks}</div>
        </div>
      )}
    </div>
  );
}

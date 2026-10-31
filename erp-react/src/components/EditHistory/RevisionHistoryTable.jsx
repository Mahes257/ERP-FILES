import { CheckCircle2, Eye, GitBranch } from 'lucide-react';
import { formatDateTime } from '../../utils/leadHelpers';

/**
 * Renders the revision chain of a sales document (Quotation, Sales Contract,
 * Customer Purchase Order, Proforma Invoice, Delivery Challan, Invoice, Credit
 * Note, Payment Receipt) and — when the caller supplies a route — turns each
 * version into a way to OPEN it.
 *
 * Each row is one permanently-preserved version:
 *   - revision 0  → the original document (e.g. INV-00001)
 *   - revision 1+ → numbered revisions (e.g. INV-00001(1))
 *
 * The chain comes from the backend response field `revisions`:
 *   [{ id, number, revision, status, revisionDate, latestRevision }]
 *
 * The latest revision is always the current/editable one. Older versions are
 * never deleted or overwritten — an edit always creates a new revision row, and
 * opening one loads THAT revision's own stored data (never the latest data).
 *
 * Props
 *   revisions   chain summaries, oldest → newest
 *   docNumber   base document number, for versions that carry no `number`
 *   currentId   id of the version currently on screen, marked "Viewing"
 *   viewRoute   (rev) => route that opens that revision's own view page.
 *               Without it the table stays read-only (the ERP PDF/print
 *               surfaces render it that way).
 *   navigate    the router's navigate function; when supplied the route is
 *               followed with client-side navigation like every other link in
 *               the app, otherwise the anchor does a normal page load.
 *   onSelect    optional click handler; when given it wins over `viewRoute`
 */
export default function RevisionHistoryTable({
  revisions = [],
  docNumber = '',
  currentId = null,
  viewRoute = null,
  navigate = null,
  onSelect = null,
  // Optional metadata column. Only surfaces that have a stored editor per
  // version enable it; the Quotation/CPR/CRM chain keeps its existing columns.
  showChangedBy = false
}) {
  const chain = Array.isArray(revisions) ? revisions : [];

  if (chain.length === 0) {
    return null;
  }

  const latestId = chain.find((rev) => rev.latestRevision)?.id ?? chain[chain.length - 1]?.id;
  const interactive = typeof viewRoute === 'function' || typeof onSelect === 'function';

  const versionLabel = (rev) => (Number(rev.revision) > 0 ? `Revision ${rev.revision}` : 'Original');

  /** Route that opens this revision's OWN stored data. */
  const routeFor = (rev) => (typeof viewRoute === 'function' ? viewRoute(rev) : null);

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full border-collapse" style={{ minWidth: 560 }}>
        <thead>
          <tr className="bg-slate-50">
            <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Version</th>
            <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Document No</th>
            <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Status</th>
            {showChangedBy && (
              <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Changed By</th>
            )}
            <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Date</th>
            <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">State</th>
            {interactive && (
              <th className="py-2.5 px-3 text-center text-[11px] font-bold text-slate-500">Open</th>
            )}
          </tr>
        </thead>
        <tbody>
          {chain.map((rev) => {
            const isLatest = rev.id === latestId;
            const isViewing = currentId != null && String(rev.id) === String(currentId);
            const versionNo = rev.number || (Number(rev.revision) > 0 ? `${docNumber}(${rev.revision})` : docNumber);
            const statusText = String(rev.status || '—').replace(/_/g, ' ');
            return (
              <tr
                key={rev.id}
                className={`border-b border-slate-100 transition-colors last:border-b-0 ${
                  isViewing ? 'bg-[#E8F0EE]/70' : 'hover:bg-slate-50/70'
                }`}
              >
                <td className="py-2.5 px-3 text-xs font-bold text-slate-700">
                  {versionLabel(rev)}
                  {Number(rev.revision) === 0 && (
                    <span className="ml-1.5 text-[10px] text-slate-400 font-normal">(Base)</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-xs text-slate-700 font-medium">{versionNo}</td>
                <td className="py-2.5 px-3 text-xs text-slate-600 capitalize">{statusText}</td>
                {showChangedBy && (
                  <td className="py-2.5 px-3 text-xs text-slate-500">{rev.changedBy || '—'}</td>
                )}
                <td className="py-2.5 px-3 text-xs text-slate-500">
                  {rev.revisionDate ? formatDateTime(rev.revisionDate) : '—'}
                </td>
                <td className="py-2.5 px-3">
                  {isLatest ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Current
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                      <GitBranch className="w-3 h-3" /> Historical
                    </span>
                  )}
                  {isViewing && (
                    <span className="ml-1.5 inline-flex items-center text-[10px] font-bold text-[#0B4A3D] bg-[#E8F0EE] border border-[#0B4A3D]/20 rounded-full px-2 py-0.5">
                      Viewing
                    </span>
                  )}
                </td>
                {interactive && (
                  <td className="py-2.5 px-3 text-center">
                    {isViewing ? (
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">On screen</span>
                    ) : (
                      <a
                        href={routeFor(rev) || '#'}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onSelect) return onSelect(rev);
                          const route = routeFor(rev);
                          if (navigate && route) return navigate(route);
                          if (route) window.location.assign(route);
                          return undefined;
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B4A3D] hover:underline cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> {isLatest ? 'Current' : 'View'}
                      </a>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

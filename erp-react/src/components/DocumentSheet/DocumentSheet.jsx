// ============================================================================
// DocumentSheet — one printable ERP document, rendered on a white A4 page.
//
// Pure presentation: the caller passes the already-resolved document parts
// (title, number, date, heading, rows, details) built from a REAL record by a
// sheet spec, and this renders them. Nothing is fetched here and no value is
// invented, so a sheet can never show data the record does not have.
//
// The markup follows the ERP's existing document sheet (CprDocument): the
// shared company letterhead, a title block with the document number and date,
// a two-column body of labelled values, and an optional details block. That is
// what makes a preview opened from Documents read as an ERP document page
// rather than a file viewer.
// ============================================================================
import Letterhead from '../SalesDesign/Letterhead';

function InfoRow({ label, value }) {
  return (
    <div className="flex text-xs py-1">
      <span className="w-32 shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-700 font-medium break-words">{value}</span>
    </div>
  );
}

export default function DocumentSheet({ title, number, date, heading, rows = [], details = [] }) {
  const hasBody = rows.length > 0 || details.length > 0;

  return (
    <div className="bg-white min-h-[1123px] px-8 py-10 sm:px-14 sm:py-14">
      <Letterhead className="mb-4" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#0B4A3D] uppercase tracking-wider">{title}</div>
          {heading ? (
            <div className="text-xs font-semibold text-slate-600 mt-1 break-words">{heading}</div>
          ) : null}
        </div>
        <div className="text-right">
          {number ? <div className="text-sm font-bold text-slate-800">{number}</div> : null}
          {date ? <div className="text-[11px] text-slate-400 mt-0.5">{date}</div> : null}
        </div>
      </div>

      {hasBody ? (
        <div className="mt-6 border-t border-slate-100 pt-5">
          {rows.length > 0 ? (
            /* `print:grid-cols-2` keeps the two-column document layout on paper
               even when the window is narrower than the sm breakpoint — the
               sheet is a fixed A4 page, so the viewport must not reshape what
               gets printed. */
            <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-10">
              {rows.map(([label, value]) => (
                <InfoRow key={label} label={label} value={value} />
              ))}
            </div>
          ) : null}

          {details.length > 0 ? (
            <>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-1">
                Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-10">
                {details.map(([label, value]) => (
                  <InfoRow key={label} label={label} value={value} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

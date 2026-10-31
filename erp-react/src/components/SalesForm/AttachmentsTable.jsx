import { Download, Eye, FileText, Loader2, Trash2 } from 'lucide-react';

/**
 * AttachmentsTable.jsx
 * ------------------------------------------------------------------
 * Compact, horizontally-scrollable attachments table shared by the CPO create
 * page (staged files, before the order exists) and the saved-document pages.
 *
 * The table is presentation-only: the caller supplies the rows, including the
 * view/download/delete callbacks, so the same markup renders pending and
 * persisted attachments without a second implementation.
 *
 * Header styling comes from the ERP-wide table-header standard in index.css
 * (solid dark green + white text) — the class list below only controls the
 * compact typography, never the colours, so a configured/custom column can
 * never fall back to a grey header.
 */
const TH_CLS = 'px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap';
const TD_CLS = 'px-2 py-2 border-b border-slate-100 text-xs text-slate-700 align-middle';
const ACTION_BTN =
  'p-1.5 rounded-md text-slate-400 hover:bg-slate-100 cursor-pointer disabled:opacity-50';

/**
 * The document kind a Sales Contract attachment is filed under. Only the
 * modules that document one pass `categoryLabel` (they get the column);
 * `categoryOptions` turns each row's category into the picker used for a file
 * that is staged but not uploaded yet (`onCategoryChange(row, value)`).
 */
export default function AttachmentsTable({
  rows = [],
  emptyText = 'No attachments added yet.',
  minWidth = 820,
  categoryLabel = null,
  categoryOptions = null,
  onCategoryChange = null
}) {
  const list = Array.isArray(rows) ? rows : [];
  const columnCount = categoryLabel ? 8 : 7;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse" style={{ minWidth: categoryLabel ? minWidth + 150 : minWidth }}>
        <thead>
          <tr>
            <th className={`${TH_CLS} w-[56px]`}>S.No</th>
            <th className={`${TH_CLS} min-w-[220px]`}>File Name</th>
            <th className={`${TH_CLS} min-w-[84px]`}>Type</th>
            {categoryLabel && <th className={`${TH_CLS} min-w-[150px]`}>{categoryLabel}</th>}
            <th className={`${TH_CLS} min-w-[104px]`}>Size</th>
            <th className={`${TH_CLS} min-w-[170px]`}>Uploaded By</th>
            <th className={`${TH_CLS} min-w-[140px]`}>Date</th>
            <th className={`${TH_CLS} min-w-[120px] text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-8 text-center text-xs text-slate-400">
                {emptyText}
              </td>
            </tr>
          ) : (
            list.map((row, index) => (
              <tr key={row.key ?? index} className="hover:bg-slate-50">
                <td className={`${TD_CLS} text-slate-400`}>{index + 1}</td>
                <td className={`${TD_CLS} font-semibold text-slate-700`}>
                  <span className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                    <span className="break-all">{row.name || 'File'}</span>
                  </span>
                </td>
                <td className={`${TD_CLS} whitespace-nowrap`}>{row.type || '—'}</td>
                {categoryLabel && (
                  <td className={`${TD_CLS} whitespace-nowrap`}>
                    {categoryOptions ? (
                      <select
                        value={row.category || ''}
                        onChange={(event) => onCategoryChange?.(row, event.target.value)}
                        aria-label={`Category for ${row.name || 'file'}`}
                        className="h-7 w-full max-w-[140px] rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-emerald-600/50 focus:bg-surface"
                      >
                        <option value="">— Not specified —</option>
                        {categoryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.category || '—'
                    )}
                  </td>
                )}
                <td className={`${TD_CLS} whitespace-nowrap`}>{row.size || '—'}</td>
                <td className={`${TD_CLS} break-words`}>{row.uploadedBy || '—'}</td>
                <td className={`${TD_CLS} whitespace-nowrap text-slate-500`}>{row.date || '—'}</td>
                <td className={`${TD_CLS} text-right`}>
                  <span className="inline-flex items-center gap-0.5">
                    {row.onView && (
                      <button
                        type="button"
                        title="Preview"
                        onClick={row.onView}
                        className={`${ACTION_BTN} hover:text-[#0B4A3D]`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {row.onDownload && (
                      <button
                        type="button"
                        title="Download"
                        onClick={row.onDownload}
                        className={`${ACTION_BTN} hover:text-[#0B4A3D]`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {row.onDelete && (
                      <button
                        type="button"
                        title="Delete"
                        disabled={row.deleting}
                        onClick={row.onDelete}
                        className={`${ACTION_BTN} hover:text-rose-600 hover:bg-rose-50`}
                      >
                        {row.deleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

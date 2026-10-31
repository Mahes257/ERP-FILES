import { useEffect, useState } from 'react';
import { ArrowRight, PencilLine, ChevronDown } from 'lucide-react';
import { fetchEditHistory, fetchEditHistoryFromUrl } from '../../utils/editHistory';
import { formatDateTime } from '../../utils/leadHelpers';

/**
 * Renders the field-level edit history of a record, grouped by version,
 * as timeline-style entries:
 *
 *   Edited — Version 1 · by admin · 10-Aug-2026 12:35 PM
 *   ▸ 2 fields changed
 *     Customer Name: ABC Industries → ABC Industries Pvt Ltd
 *
 * Fetches from the shared /history/{module}/{id} endpoint. When no edit
 * history exists, renders nothing (callers decide whether to show an
 * empty state).
 */
export default function EditHistoryTimeline({ moduleKey, recordId, limit = 10, endpoint = null }) {
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const load = endpoint
      ? fetchEditHistoryFromUrl(endpoint)
      : fetchEditHistory(moduleKey, recordId);
    load.then((rows) => {
      if (cancelled) return;
      setHistory(Array.isArray(rows) ? rows : []);
      // First (newest) group expanded by default
      setExpanded(new Set(Array.isArray(rows) && rows.length > 0 ? [rows[0].version] : []));
    });
    return () => {
      cancelled = true;
    };
  }, [endpoint, moduleKey, recordId]);

  if (history.length === 0) return null;

  const visible = history.slice(0, limit);

  const toggle = (version) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  return (
    <div>
      {visible.map((group) => {
        const isOpen = expanded.has(group.version);
        return (
          <div
            key={group.version}
            className="rounded-lg border border-[#FED7AA] bg-[#FFFBEB] mb-2 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggle(group.version)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left cursor-pointer hover:bg-[#FFF7ED] transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-[#C2410C]/10 text-[#C2410C] shrink-0 mt-0.5">
                <PencilLine className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-[#7C2D12]">
                  Edited — Version {group.version}
                </div>
                <div className="text-[10px] text-[#9A3412]/80 mt-0.5">
                  {group.changedBy || 'Unknown'} · {group.createdAt ? formatDateTime(group.createdAt) : ''}
                </div>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#C2410C] shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
              />
            </button>

            {isOpen && (
              <div className="px-3 pb-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#9A3412]/70 mb-1.5">
                  {group.changeSummary || `${group.changes?.length || 0} field(s) changed`}
                </div>
                <div className="flex flex-col gap-1">
                  {(group.changes || []).map((change, i) => (
                    <div
                      key={`${change.field}-${i}`}
                      className="text-[11px] bg-white border border-[#FED7AA] rounded-md px-2 py-1.5"
                    >
                      <span className="font-bold text-[#78350F]">{change.field}</span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-slate-600">
                        <span className="line-through text-slate-400">{change.oldValue || '—'}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-slate-300" />
                        <span className="font-semibold text-slate-800">{change.newValue || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

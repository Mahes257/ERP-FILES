import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, PencilLine, GitBranch } from 'lucide-react';
import leadService from '../../services/leadService';
import useAsyncData from '../../hooks/useAsyncData';
import DetailSection from './DetailSection';
import RecordRevisionTimeline from '../EditHistory/RecordRevisionTimeline';
import { fetchEditHistory } from '../../utils/editHistory';
import { formatDateTime } from '../../utils/leadHelpers';

function toList(response) {
  const list = Array.isArray(response) ? response : response?.data ?? response?.history ?? response?.content ?? [];
  return list.map((entry) => ({
    id: entry.id,
    date: entry.at || entry.date || entry.createdAt,
    field: entry.field || entry.attribute || 'Lead',
    oldValue: entry.oldValue ?? entry.from ?? entry.old ?? '',
    newValue: entry.newValue ?? entry.to ?? entry.value ?? entry.new ?? '',
    changedBy: entry.changedBy || entry.by || entry.actor || entry.user || '',
    action: entry.action || (entry.field ? 'UPDATED' : 'CREATED')
  }));
}

const ACTION_CHIPS = {
  CREATED: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  UPDATED: 'bg-amber-50 text-amber-600 border border-amber-100',
  DELETED: 'bg-rose-50 text-rose-600 border border-rose-100',
  default: 'bg-slate-100 text-slate-500 border border-slate-200'
};

function toEditHistoryRows(groups) {
  // Convert grouped edit history (newest first) into the same entry shape the
  // existing lead history list renders. Each group is one row.
  return (Array.isArray(groups) ? groups : []).map((group) => {
    const detail = (group.changes || [])
      .map((c) => `${c.field}: ${c.oldValue || '—'} → ${c.newValue || '—'}`)
      .join('; ');
    return {
      id: `edit-v${group.version}`,
      date: group.createdAt,
      field: `Version ${group.version}`,
      oldValue: '',
      newValue: detail || group.changeSummary || 'Edited',
      changedBy: group.changedBy || '',
      action: 'UPDATED'
    };
  });
}

export default function History({ leadId, fallbackData = [] }) {
  const { data, loading, error, isFallback, refresh } = useAsyncData(
    () => leadService.getHistory(leadId),
    { fallbackData, deps: [leadId] }
  );
  const [editGroups, setEditGroups] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchEditHistory('lead', leadId).then((groups) => {
      if (cancelled) return;
      setEditGroups(Array.isArray(groups) ? groups : []);
    });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const items = useMemo(
    () =>
      [...toEditHistoryRows(editGroups), ...toList(data)]
        .filter((entry) => entry.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [data, editGroups]
  );

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <GitBranch className="w-4 h-4 text-[#0B4A3D]" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Version History</h4>
        </div>
        <div className="p-4">
          <p className="text-[11px] text-slate-400 mb-3">
            Every edit is preserved as a saved version below. The lead record keeps its identity;
            previous versions are never deleted or overwritten.
          </p>
          <RecordRevisionTimeline module="lead" recordId={leadId} />
        </div>
      </div>
      <DetailSection
        loading={loading}
        error={error}
        isFallback={isFallback}
        onRetry={refresh}
        count={items.length}
        emptyMessage="No change history recorded for this lead."
      >
      <ul className="space-y-3">
        {items.map((entry) => {
          const action = entry.action || 'default';
          const isEditHistory = String(entry.id || '').startsWith('edit-v');
          return (
            <li key={entry.id} className={`${isEditHistory ? 'bg-[#FFFBEB] border-[#FED7AA]' : 'bg-slate-50 border-slate-100'} border rounded-lg px-3 py-2.5`}>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  {isEditHistory && <PencilLine className="w-3.5 h-3.5 text-[#C2410C]" />}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isEditHistory ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FED7AA]' : ACTION_CHIPS[action] || ACTION_CHIPS.default}`}>
                    {action}
                  </span>
                  <span className="text-[11px] font-bold text-slate-800">{entry.field}</span>
                </div>
                <time className="text-[10px] text-slate-400 font-medium">{formatDateTime(entry.date)}</time>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-xs text-slate-400 line-through">{entry.oldValue || '—'}</span>
                <ArrowRight className="w-3 h-3 text-slate-300" />
                <span className="text-xs font-semibold text-slate-800">{entry.newValue || '—'}</span>
                {entry.changedBy && (
                  <span className="ml-auto text-[10px] text-slate-400 font-medium">by {entry.changedBy}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      </DetailSection>
    </div>
  );
}

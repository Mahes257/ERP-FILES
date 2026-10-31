import { useMemo } from 'react';
import leadService from '../../services/leadService';
import useAsyncData from '../../hooks/useAsyncData';
import DetailSection from './DetailSection';
import { formatDateTime } from '../../utils/leadHelpers';

const TYPE_DOTS = {
  created: 'bg-emerald-500',
  stage: 'bg-amber-500',
  activity: 'bg-sky-500',
  note: 'bg-indigo-500',
  attachment: 'bg-purple-500',
  default: 'bg-slate-400'
};

function toList(response) {
  const list = Array.isArray(response) ? response : response?.data ?? response?.timeline ?? response?.content ?? [];
  return list.map((item) => ({
    id: item.id,
    date: item.at || item.date || item.createdAt,
    title: item.title || 'Event',
    description: item.description || item.detail || '',
    type: item.type || 'default'
  }));
}

export default function Timeline({ leadId, fallbackData = [] }) {
  const { data, loading, error, isFallback, refresh } = useAsyncData(
    () => leadService.getTimeline(leadId),
    { fallbackData, deps: [leadId] }
  );

  const items = useMemo(
    () =>
      toList(data)
        .filter((item) => item.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [data]
  );

  return (
    <DetailSection
      loading={loading}
      error={error}
      isFallback={isFallback}
      onRetry={refresh}
      count={items.length}
      emptyMessage="No timeline events recorded for this lead."
    >
      <ol className="relative border-l-2 border-slate-100 ml-1.5 space-y-5">
        {items.map((item) => (
          <li key={item.id} className="pl-5 relative">
            <span
              className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white ${TYPE_DOTS[item.type] || TYPE_DOTS.default}`}
            />
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="text-xs font-bold text-slate-800">{item.title}</p>
              <time className="text-[10px] text-slate-400 font-medium">{formatDateTime(item.date)}</time>
            </div>
            {item.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>}
          </li>
        ))}
      </ol>
    </DetailSection>
  );
}

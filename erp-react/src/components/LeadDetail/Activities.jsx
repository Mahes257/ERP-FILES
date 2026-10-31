import { useMemo } from 'react';
import { PhoneCall, Mail, Users, ListTodo, CalendarCheck, Activity } from 'lucide-react';
import leadService from '../../services/leadService';
import useAsyncData from '../../hooks/useAsyncData';
import DetailSection from './DetailSection';
import { formatRelativeTime, formatDateTime } from '../../utils/leadHelpers';

const TYPE_ICONS = {
  Call: PhoneCall,
  Email: Mail,
  Meeting: Users,
  Task: ListTodo,
  'Follow-up': CalendarCheck,
  default: Activity
};

const TYPE_COLORS = {
  Call: 'bg-sky-50 text-sky-600',
  Email: 'bg-indigo-50 text-indigo-600',
  Meeting: 'bg-purple-50 text-purple-600',
  Task: 'bg-amber-50 text-amber-600',
  'Follow-up': 'bg-emerald-50 text-emerald-600',
  default: 'bg-slate-100 text-slate-500'
};

function toList(response) {
  const list = Array.isArray(response) ? response : response?.data ?? response?.activities ?? response?.content ?? [];
  return list.map((item) => ({
    id: item.id,
    type: item.type || item.activityType || 'default',
    title: item.title || item.label || 'Activity',
    description: item.description || item.detail || item.notes || '',
    owner: item.owner || item.ownerName || item.by || '',
    date: item.at || item.date || item.createdAt
  }));
}

export default function Activities({ leadId, fallbackData = [] }) {
  const { data, loading, error, isFallback, refresh } = useAsyncData(
    () => leadService.getActivities(leadId),
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
      emptyMessage="No activities logged for this lead."
    >
      <ul className="space-y-3">
        {items.map((item) => {
          const Icon = TYPE_ICONS[item.type] || TYPE_ICONS.default;
          const color = TYPE_COLORS[item.type] || TYPE_COLORS.default;
          return (
            <li key={item.id} className="flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className="text-xs font-bold text-slate-800">{item.title}</p>
                  <time className="text-[10px] text-slate-400 font-medium" title={formatDateTime(item.date)}>
                    {formatRelativeTime(item.date)}
                  </time>
                </div>
                {item.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>}
                {item.owner && <p className="text-[10px] text-slate-400 font-medium mt-1">{item.owner}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </DetailSection>
  );
}

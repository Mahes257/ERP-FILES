import { useState, useMemo } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import leadService from '../../services/leadService';
import useAsyncData from '../../hooks/useAsyncData';
import DetailSection from './DetailSection';
import { useToast } from '../Common';
import { formatRelativeTime, formatDateTime, getInitials, avatarColor } from '../../utils/leadHelpers';

function toList(response) {
  const list = Array.isArray(response) ? response : response?.data ?? response?.notes ?? response?.content ?? [];
  return list.map((note) => ({
    id: note.id,
    text: note.text || note.body || note.content || '',
    author: note.author || note.createdBy || note.owner || 'Unknown',
    date: note.at || note.date || note.createdAt
  }));
}

export default function Notes({ leadId, fallbackData = [] }) {
  const toast = useToast();
  const { data, loading, error, isFallback, refresh } = useAsyncData(
    () => leadService.getNotes(leadId),
    { fallbackData, deps: [leadId] }
  );
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const items = useMemo(
    () => toList(data).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()),
    [data]
  );

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await leadService.addNote(leadId, { text });
      setDraft('');
      toast.success('Note added');
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Failed to add note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Write a note about this lead..."
          className="flex-1 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim() || submitting}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer shrink-0"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>

      <DetailSection
        loading={loading}
        error={error}
        isFallback={isFallback}
        onRetry={refresh}
        count={items.length}
        emptyMessage="No notes for this lead yet."
      >
        <ul className="space-y-3">
          {items.map((note) => (
            <li key={note.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
              <div className="flex items-start gap-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 ${avatarColor(note.author)}`}>
                  {getInitials(note.author)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-[11px] font-bold text-slate-800">{note.author}</p>
                    <time className="text-[10px] text-slate-400 font-medium" title={formatDateTime(note.date)}>
                      {formatRelativeTime(note.date)}
                    </time>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{note.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </DetailSection>
    </div>
  );
}

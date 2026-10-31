/**
 * purchase/pages/requisition/PurchaseRequisitionTimeline.jsx
 * ------------------------------------------------------------------
 * Vertical timeline for a purchase requisition — every event (created,
 * edited, submitted, approved, rejected, returned, PO raised, comment,
 * attachment, print/export) with an icon, date, user and status.
 * Data comes from the backend-ready requisitionService.getTimeline().
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2, ChevronLeft, Circle, FileDown, FilePlus2, FileText, History, Loader2,
  MessageSquare, Paperclip, Printer, RotateCcw, Send, XCircle
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { requisitionService } from '../../services/requisition';
import { formatDateTime } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const TYPE_STYLES = {
  create: { Icon: FilePlus2, dot: 'bg-slate-100 text-slate-500', ring: 'border-slate-200' },
  edit: { Icon: FilePlus2, dot: 'bg-amber-50 text-amber-600', ring: 'border-amber-200' },
  submit: { Icon: Send, dot: 'bg-teal-50 text-teal-600', ring: 'border-teal-200' },
  approve: { Icon: CheckCircle2, dot: 'bg-emerald-50 text-emerald-600', ring: 'border-emerald-200' },
  reject: { Icon: XCircle, dot: 'bg-rose-50 text-rose-600', ring: 'border-rose-200' },
  return: { Icon: RotateCcw, dot: 'bg-slate-100 text-slate-600', ring: 'border-slate-200' },
  review: { Icon: CheckCircle2, dot: 'bg-violet-50 text-violet-600', ring: 'border-violet-200' },
  po: { Icon: FileText, dot: 'bg-sky-50 text-sky-600', ring: 'border-sky-200' },
  comment: { Icon: MessageSquare, dot: 'bg-teal-50 text-teal-600', ring: 'border-teal-200' },
  attachment: { Icon: Paperclip, dot: 'bg-indigo-50 text-indigo-600', ring: 'border-indigo-200' },
  print: { Icon: Printer, dot: 'bg-orange-50 text-orange-600', ring: 'border-orange-200' },
  export: { Icon: FileDown, dot: 'bg-fuchsia-50 text-fuchsia-600', ring: 'border-fuchsia-200' }
};

const FALLBACK = { Icon: Circle, dot: 'bg-slate-100 text-slate-500', ring: 'border-slate-200' };

export default function PurchaseRequisitionTimeline() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const timeline = await requisitionService.getTimeline(id);
        if (!cancelled) setData(timeline);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !data) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Requisition not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/requisition')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Requisitions
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const events = data.events || [];
  const secondaryButton =
    'inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none';

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Requisition', to: '/purchase/requisition' },
          { label: 'Timeline' }
        ]}
        icon={History}
        title={`Timeline — ${data.prNo}`}
        subtitle={`${events.length} event(s) recorded for this requisition`}
        actions={
          <button type="button" onClick={() => navigate(`/purchase/requisition/${id}`)} className={secondaryButton}>
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to View
          </button>
        }
      />

      <PurchaseSectionCard title="Event History" subtitle="Chronological record of every action on this requisition">
        {events.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">No events recorded yet.</p>
        ) : (
          <ol className="relative space-y-0 max-w-2xl mx-auto">
            {events.map((event, index) => {
              const { Icon, dot, ring } = TYPE_STYLES[event.type] || FALLBACK;
              const isLast = index === events.length - 1;
              return (
                <li key={event.id || `${event.type}-${index}`} className="relative pl-14 pb-7 last:pb-0">
                  {!isLast && (
                    <span className="absolute left-[21px] top-10 bottom-0 w-px bg-slate-200" aria-hidden="true" />
                  )}
                  <span className={`absolute left-0 top-0 flex items-center justify-center w-11 h-11 rounded-full border ${ring} ${dot} shadow-sm`}>
                    <Icon className="w-[18px] h-[18px]" />
                  </span>
                  <div className="pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-bold text-slate-800">{event.label}</p>
                      {event.status && <PurchaseStatusBadge status={event.status} />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {event.actor ? `${event.actor} · ` : ''}{formatDateTime(event.timestamp)}
                    </p>
                    {event.note && (
                      <p className="mt-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        {event.note}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </PurchaseSectionCard>

      <div className="flex items-center gap-2 mt-5">
        <History className="w-4 h-4 text-slate-300" />
        <p className="text-[11px] text-slate-400">
          Timeline is generated from the service layer and is ready for backend integration.
        </p>
      </div>
    </PurchasePageLayout>
  );
}

/**
 * purchase/pages/vendors/VendorTimeline.jsx
 * ------------------------------------------------------------------
 * Vertical timeline for a vendor — every event (registered, updated,
 * approved, blocked, activated, archived, restored, comment,
 * attachment, print/export) with an icon, date, user and status.
 * Mirrors the Purchase Requisition Timeline master page.
 * Data comes from vendorService.getVendorTimeline().
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Archive, Building2, CheckCircle2, ChevronLeft, Circle, FilePlus2,
  History, Loader2, MessageSquare, Paperclip, Pencil, Printer, RotateCcw, UserX
} from 'lucide-react';
import { useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import { PurchaseExportDropdown } from '../../components/list';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { vendorService } from '../../services/vendor';
import { formatDateTime } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import '../../styles/cpr-list.css';

const TYPE_STYLES = {
  create: { Icon: FilePlus2, dot: 'bg-slate-100 text-slate-500', ring: 'border-slate-200' },
  edit: { Icon: Pencil, dot: 'bg-amber-50 text-amber-600', ring: 'border-amber-200' },
  status: { Icon: RotateCcw, dot: 'bg-slate-100 text-slate-600', ring: 'border-slate-200' },
  approve: { Icon: CheckCircle2, dot: 'bg-emerald-50 text-emerald-600', ring: 'border-emerald-200' },
  block: { Icon: UserX, dot: 'bg-rose-50 text-rose-600', ring: 'border-rose-200' },
  activate: { Icon: CheckCircle2, dot: 'bg-teal-50 text-teal-600', ring: 'border-teal-200' },
  archive: { Icon: Archive, dot: 'bg-slate-100 text-slate-600', ring: 'border-slate-200' },
  restore: { Icon: RotateCcw, dot: 'bg-teal-50 text-teal-600', ring: 'border-teal-200' },
  comment: { Icon: MessageSquare, dot: 'bg-teal-50 text-teal-600', ring: 'border-teal-200' },
  attachment: { Icon: Paperclip, dot: 'bg-indigo-50 text-indigo-600', ring: 'border-indigo-200' },
  print: { Icon: Printer, dot: 'bg-orange-50 text-orange-600', ring: 'border-orange-200' }
};

const FALLBACK = { Icon: Circle, dot: 'bg-slate-100 text-slate-500', ring: 'border-slate-200' };

export default function VendorTimeline() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const timeline = await vendorService.getVendorTimeline(id);
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
          <p className="text-sm font-bold text-slate-700">Vendor not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/vendors')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Vendors
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const events = data.events || [];
  const secondaryButton =
    'inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none';

  const timelineColumns = [
    { key: 'label', label: 'Event' },
    { key: 'type', label: 'Type' },
    { key: 'actor', label: 'Actor' },
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'note', label: 'Remarks' }
  ];

  const timelineRecords = events.map((event) => ({
    label: event.label,
    type: event.type,
    actor: event.actor,
    timestamp: event.timestamp,
    note: event.note
  }));

  const handleExport = async (type) => {
    try {
      if (type === 'csv') exportCsv(timelineColumns, timelineRecords, `vendor-timeline-${id}`);
      else if (type === 'excel') await exportExcel(timelineColumns, timelineRecords, `vendor-timeline-${id}`);
      else if (type === 'pdf') {
        await exportPdf({
          title: `Timeline — ${data.name || ''}`,
          columns: timelineColumns,
          records: timelineRecords,
          filename: `vendor-timeline-${id}`
        });
      } else if (type === 'print') printTable(`Timeline — ${data.name || ''}`, timelineColumns, timelineRecords);
      toast.success('Timeline exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export timeline');
    }
  };

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Vendor Management', to: '/purchase/vendors' },
          { label: 'Timeline' }
        ]}
        icon={History}
        title={`Timeline — ${data.name || id}`}
        subtitle={`${events.length} event(s) recorded for this vendor`}
        actions={
          <>
            <PurchaseExportDropdown buttonLabel="Export Timeline" onExport={handleExport} />
            <button
              type="button"
              onClick={() => handleExport('print')}
              className={secondaryButton}
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" /> Print Timeline
            </button>
            <button type="button" onClick={() => navigate(`/purchase/vendors/${id}`)} className={secondaryButton}>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to View
            </button>
          </>
        }
      />

      <PurchaseSectionCard title="Event History" subtitle="Chronological record of every action on this vendor">
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
        <Building2 className="w-4 h-4 text-slate-300" />
        <p className="text-[11px] text-slate-400">
          Timeline is generated from the service layer and is ready for backend integration.
        </p>
      </div>
    </PurchasePageLayout>
  );
}

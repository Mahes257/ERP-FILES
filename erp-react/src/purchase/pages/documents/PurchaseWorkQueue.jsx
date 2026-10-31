/**
 * purchase/pages/documents/PurchaseWorkQueue.jsx
 * ------------------------------------------------------------------
 * Purchase Work Queue — every actionable pending item across the
 * procurement workflow, grouped by category:
 *
 *   PR Approvals · RFQ Actions · PO Approvals · PO Releases ·
 *   Supplier Acknowledgements · Pending GRNs · Pending Inspections ·
 *   Invoice Matching · Invoice Approvals · Payments Due
 *
 * Everything is derived from REAL records via services/workQueue.js —
 * the same shared pending predicates that drive the sidebar badges and
 * table dots, so counts are always the true number of pending records.
 * Each item opens the actual document; the row also names the next
 * action and links to the page where it is performed.
 *
 * The ten category KPI cards use the shared PR-list KPI design
 * (PurchaseKpiCards variant="cpr" → pr-kpi-grid / pr-kpi-card /
 * qtn-kpi-*) — the exact cards the PR and RFQ lists render — so the
 * card geometry, typography, hover and responsive reflow match the
 * reference. Values are the live category counts; every card keeps its
 * category accent colour and scrolls to that category's section.
 *
 * Route: /purchase/work-queue
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Banknote, Bell, CheckCircle2, ClipboardCheck, ClipboardList,
  FileText, Handshake, Inbox, ListTodo, Loader2, Mail, Package,
  RefreshCw, Rocket, Scale, ShieldCheck
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { useToast } from '../../components/ui/ToastContext';
import { getWorkQueue, WORK_QUEUE_CATEGORIES } from '../../services/workQueue';
import { getAlerts } from '../../services/notifications';
import { formatAmount } from '../../utils/purchase';
import '../../styles/cpr-list.css';
/* PR-list KPI card geometry (horizontal card, icon chip on the left,
   count + label on the right, 88px tall). The same sheet every Purchase
   list page loads, so this page's KPI cards can never drift from the
   PR / RFQ list reference. */
import '../../styles/requisition-list-polish.css';

const CATEGORY_ICONS = {
  'pr-approvals': ClipboardList,
  'rfq-actions': Mail,
  'po-approvals': ShieldCheck,
  'po-releases': Rocket,
  'supplier-acknowledgements': Handshake,
  'pending-grns': Package,
  'pending-inspections': ClipboardCheck,
  'invoice-matching': Scale,
  'invoice-approvals': BadgeCheck,
  'payments-due': Banknote
};

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

function AllClear({ total }) {
  return (
    <PurchaseSectionCard
      title="All Clear"
      subtitle="No pending work in any category"
      icon={CheckCircle2}
    >
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <p className="text-sm font-bold text-slate-700">Nothing awaiting action</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Every category above is empty — {total === 0 ? 'there is no pending work right now.' : 'new pending records will appear here as the workflow advances.'}
        </p>
      </div>
    </PurchaseSectionCard>
  );
}

function QueueItemRow({ item }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 hover:border-[#0B4A3D]/30 hover:bg-[#EDF7F4]/40 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(item.route)}
            className="text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
          >
            {item.number}
          </button>
          {item.status && <PurchaseStatusBadge status={item.status} variant="cpr" className="!text-[10px]" />}
          {item.matchStatus && item.matchStatus !== item.status && (
            <PurchaseStatusBadge status={item.matchStatus} variant="cpr" className="!text-[10px]" />
          )}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 truncate max-w-xl">{item.title}</div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
          {item.vendor && <span>{item.vendor}</span>}
          {item.dateLabel && <span>{item.dateLabel}</span>}
          {item.amount !== '' && item.amount != null && (
            <span className="font-semibold text-slate-600 tabular-nums">{formatAmount(Number(item.amount), 'INR')}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => navigate(item.actionRoute)}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
        >
          {item.actionLabel} <ArrowRight className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => navigate(item.route)}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
        >
          <FileText className="w-3 h-3" /> Open
        </button>
      </div>
    </div>
  );
}

function CategorySection({ category, onJump }) {
  const Icon = CATEGORY_ICONS[category.key] || FileText;
  return (
    <PurchaseSectionCard
      title={
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: category.accent }} />
          {category.label}
        </span>
      }
      subtitle={`${category.hint} — ${category.count} item${category.count !== 1 ? 's' : ''}`}
      action={
        <span
          className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-xs font-extrabold tabular-nums text-white cursor-pointer"
          style={{ background: category.accent }}
          onClick={() => onJump(category.key)}
          title="Scroll to this category"
        >
          {category.count}
        </span>
      }
    >
      <div className="space-y-2">
        {category.items.map((item) => (
          <QueueItemRow key={`${item.category}-${item.id}`} item={item} />
        ))}
      </div>
    </PurchaseSectionCard>
  );
}

export default function PurchaseWorkQueue() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* Toast feedback. Held in a ref so `load` keeps a stable identity and
     the mount effect can never re-run on a toast-provider re-render. */
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  /* In-flight guard — a refresh click while a load is already running is
     ignored, so a double click can never fire a second batch of requests
     or let an older response overwrite a newer one. */
  const inFlight = useRef(false);

  const load = useCallback(async ({ announce = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      /* Queue first — it is the page's primary data. */
      const workQueue = await getWorkQueue();
      setQueue(workQueue);

      /* Alerts are supplementary and derive their counts from the queue
         we just fetched, so a rule/records failure must never blank the
         queue itself. */
      try {
        setAlerts(await getAlerts({ queue: workQueue }));
      } catch {
        setAlerts([]);
      }

      if (announce) toastRef.current.success('Work queue refreshed');
    } catch (err) {
      setError(err);
      toastRef.current.error(err?.message || 'Unable to load the work queue.');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  /* User-initiated reload — reports the outcome. */
  const reload = useCallback(() => load({ announce: true }), [load]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const nonzero = useMemo(
    () => (queue?.categories || []).filter((cat) => cat.count > 0),
    [queue]
  );
  const activeAlerts = useMemo(() => alerts.filter((a) => a.count > 0), [alerts]);
  const total = queue?.total ?? 0;

  const jumpTo = useCallback((key) => {
    document.getElementById(`wq-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* KPI cards — one per work-queue category, rendered in the shared
     PR-list KPI design. Values are the live counts from the queue
     payload (never static) and every card keeps its category accent
     colour for the icon chip. */
  const kpiCards = useMemo(
    () =>
      WORK_QUEUE_CATEGORIES.map((cat) => ({
        key: cat.key,
        label: cat.label,
        value: (queue?.categories || []).find((c) => c.key === cat.key)?.count || 0,
        icon: CATEGORY_ICONS[cat.key] || FileText,
        color: cat.accent,
        bg: `${cat.accent}1A`
      })),
    [queue]
  );

  /* Card click — scroll to that category's section, or stay on the queue
     when the category has nothing pending (existing behaviour). */
  const selectKpi = useCallback(
    (key) => {
      const count = (queue?.categories || []).find((c) => c.key === key)?.count || 0;
      if (count > 0) jumpTo(key);
      else navigate('/purchase/work-queue');
    },
    [queue, jumpTo, navigate]
  );

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase', to: '/purchase/dashboard' },
          { label: 'Work Queue' }
        ]}
        icon={ListTodo}
        title="Purchase Work Queue"
        subtitle={
          loading ? 'Deriving pending work from live records…'
            : `${total} actionable item${total !== 1 ? 's' : ''} across ${nonzero.length} categor${nonzero.length !== 1 ? 'ies' : 'y'}`
        }
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/dashboard')} className="btn btn-ghost btn-sm">
              Dashboard
            </button>
            <button
              type="button"
              onClick={reload}
              className="btn btn-ghost btn-sm"
              aria-label="Refresh"
              title="Refresh"
              disabled={loading}
              aria-busy={loading}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </>
        }
      />

      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Unable to load the work queue.'}</p>
          <button type="button" className="cpr-error-retry" onClick={reload}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[50vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Category KPI cards — the shared PR-list KPI design ── */}
          {!error && <PurchaseKpiCards variant="cpr" cards={kpiCards} onSelect={selectKpi} />}

          {/* ── Notification Rule Alerts ── */}
          {!error && activeAlerts.length > 0 && (
            <PurchaseSectionCard
              title={<span className="flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" /> Alerts from Notification Rules</span>}
              subtitle="Enabled rules in Settings → Notifications matched against live records — counts are real pending work"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {activeAlerts.map((alert) => (
                  <button
                    key={alert.ruleId}
                    type="button"
                    onClick={() => {
                      if (alert.anchor && WORK_QUEUE_CATEGORIES.some((c) => c.key === alert.anchor)) jumpTo(alert.anchor);
                      else navigate(alert.anchor === 'rfq' ? '/purchase/rfq' : '/purchase/work-queue');
                    }}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors cursor-pointer"
                    title={`${alert.event} — ${alert.recipientRole || 'recipient not set'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-700 truncate">{alert.event}</span>
                      <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full text-[10px] font-extrabold tabular-nums text-white bg-amber-500">
                        {alert.count}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 truncate">
                      {alert.recipientRole ? `To: ${alert.recipientRole} · ` : ''}
                      {alert.count} real record{alert.count !== 1 ? 's' : ''} pending
                    </div>
                  </button>
                ))}
              </div>
            </PurchaseSectionCard>
          )}

          {/* ── Per-category queues ── */}
          <div className="space-y-5">
            {!error && total === 0 && <AllClear total={total} />}
            {!error &&
              nonzero.map((category) => (
                <div key={category.key} id={`wq-${category.key}`}>
                  <CategorySection category={category} onJump={jumpTo} />
                </div>
              ))}
            {!error && total > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-2 text-[11px] text-slate-400">
                <Inbox className="w-3.5 h-3.5" />
                {total} item{total !== 1 ? 's' : ''} awaiting action · counts refresh from live records on every load
              </div>
            )}
          </div>
        </>
      )}
    </PurchasePageLayout>
  );
}
/**
 * purchase/pages/vendors/VendorDetail.jsx
 * ------------------------------------------------------------------
 * Supplier Master Detail — the full ERP supplier profile:
 *   · legal identity + tax details (GSTIN / PAN / TAN / MSME)
 *   · addresses (registered office + additional), contacts, banks
 *   · payment terms, credit limit (with live ledger utilisation)
 *   · categories, contracts, documents, approval status, active state
 *   · real transaction history — RFQs, quotations, POs, GRNs,
 *     inspections, invoices and payments linked to this supplier
 *   · performance derived from those transactions (delivery / quality /
 *     price variance / response time / purchase volume) — never from
 *     manually entered scores.
 *
 * Mirrors the Purchase Requisition View master design
 * (purchase-page.cpr-page prv-page shell, summary KPI row, tabbed
 * main panel + sticky right summary).
 * ------------------------------------------------------------------
 */
import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, BadgeCheck, Building2, CheckCircle2, CreditCard, FileDown, FileText,
  History, IndianRupee, Landmark, LayoutDashboard, Layers, ListChecks, Loader2, Mail, MailPlus,
  MapPin, MoreHorizontal, Paperclip, Pencil, Phone, Printer, Receipt, Scale, ScrollText,
  ShieldCheck, ShoppingCart, Star, Tags, Trash2, TrendingUp, Truck, UserCheck, Users, UserX, Wallet
} from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { ConfirmDialog, useToast } from '../../components/ui';
import Tabs from '../../components/ui/Tabs';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import AttachmentList from '../../components/AttachmentList';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { vendorService } from '../../services/vendor';
import { invoiceService } from '../../services/invoice';
import { VENDOR_STATUS } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { formatDate, formatDateTime } from '../../utils/helpers';
import { exportPdf } from '../../utils/export';
import '../../styles/cpr-list.css';

/* The Leaflet map lives in a lazily-loaded chunk and only mounts while
   the modal is open — the Overview page never renders it directly. */
const VendorLocationModal = lazy(() => import('../../components/VendorLocationModal'));

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

function DetailItem({ label, value }) {
  return (
    <div className="prv-detail-item">
      <div className={LABEL}>{label}</div>
      <div className="prv-detail-value mt-1">{value || '—'}</div>
    </div>
  );
}

/** Small status chip used for contract / inspection / address rows. */
function ToneChip({ label, tone = 'slate' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    slate: 'bg-slate-100 text-slate-600 border-slate-200'
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${tones[tone] || tones.slate}`}>
      {label}
    </span>
  );
}

function statusTone(status) {
  const value = String(status || '').toLowerCase();
  if (['active', 'approved', 'received', 'passed', 'matched', 'accepted', 'completed', 'closed', 'paid'].some((word) => value.includes(word))) return 'green';
  if (['pending', 'partially', 'in progress', 'submitted', 'draft', 'partially delivered'].some((word) => value.includes(word))) return 'amber';
  if (['rejected', 'failed', 'blocked', 'cancelled', 'overdue', 'mismatch', 'expired', 'terminated'].some((word) => value.includes(word))) return 'red';
  if (['sent', 'evaluation', 'awarded', 'released', 'scheduled'].some((word) => value.includes(word))) return 'sky';
  return 'slate';
}

const DETAIL_TABS = ['overview', 'contacts', 'history', 'rfqs', 'orders', 'performance', 'attachments', 'activity', 'timeline'];

export default function VendorDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [vendorBalance, setVendorBalance] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' | 'block' | 'delete'
  /* Deep-link support (?tab=history from Vendor Sourcing) — the active
     tab initialises from the query param when it names a real tab. */
  const [activeTab, setActiveTab] = useState(() => {
    const initial = searchParams.get('tab');
    return DETAIL_TABS.includes(initial) ? initial : 'overview';
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [activity, setActivity] = useState([]);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const moreRef = useRef(null);
  useClickOutside(moreRef, () => setMoreOpen(false), moreOpen);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await vendorService.getVendor(id);
        if (cancelled) return;
        setRecord(data);
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

  /* Live supplier transaction view — every real document linked to the
     supplier plus its derived performance. Never blocks the profile. */
  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    vendorService
      .getSupplierTransactions(id)
      .then((data) => {
        if (!cancelled) setTransactions(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  /* Live vendor payable balance (invoiced / paid / outstanding) from
     the payment ledger — never blocks the page on failure. */
  useEffect(() => {
    if (!record?.name) return;
    let cancelled = false;
    invoiceService
      .getVendorPaymentBalances()
      .then((rows) => {
        if (cancelled) return;
        setVendorBalance(rows.find((r) => String(r.vendor).trim().toLowerCase() === String(record.name).trim().toLowerCase()) || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [record?.name]);

  /* Best-effort audit + timeline data for the Activity / Timeline tabs
     (never blocks the page — failures render empty lists). */
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      vendorService.getVendorActivity(id).then((result) => result?.entries || []),
      vendorService.getVendorTimeline(id).then((result) => result?.events || [])
    ]).then(([activityResult, timelineResult]) => {
      if (cancelled) return;
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
      if (timelineResult.status === 'fulfilled') setTimelineEvents(timelineResult.value);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  /* Blocks a workflow action from being submitted twice (double click /
     double Enter) — the buttons are only disabled after a re-render,
     which is too late for a second click in the same tick. */
  const workflowBusy = useRef(false);

  const runAction = async (operation, successMessage) => {
    if (workflowBusy.current) return null;
    workflowBusy.current = true;
    setBusy(true);
    try {
      const updated = await operation();
      setRecord(updated);
      toast.success(successMessage);
      return updated;
    } catch (err) {
      toast.error(err?.message || 'Action failed');
      return null;
    } finally {
      setBusy(false);
      workflowBusy.current = false;
      setConfirmAction(null);
    }
  };

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !record) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Supplier not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/vendors')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Suppliers
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const iconButton = (Icon, label, onClick, tone = 'neutral') => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`prv-icon-btn prv-icon-btn-${tone}`}
    >
      <Icon aria-hidden="true" />
    </button>
  );

  const handleExportPdf = async () => {
    try {
      await exportPdf({
        title: 'Supplier Master',
        filename: `supplier-${record.id}`,
        meta: [
          ['Supplier', record.name],
          ['Legal Name', record.legalName],
          ['Category', record.category],
          ['Email', record.email],
          ['Phone', record.phone],
          ['GSTIN', record.gstin],
          ['PAN', record.pan],
          ['City / State', [record.city, record.state].filter(Boolean).join(', ')]
        ],
        columns: [
          { key: 'field', label: 'Field' },
          { key: 'value', label: 'Value' }
        ],
        records: [
          ['Approval Status', record.status],
          ['Operational', record.active === false ? 'Inactive' : 'Active'],
          ['Payment Terms', record.paymentTerms],
          ['Currency', record.currency],
          ['Lead Time', record.leadTimeDays ? `${record.leadTimeDays} days` : '—'],
          ['Credit Limit', formatAmount(record.creditLimit?.amount || 0)],
          ['Address', record.address],
          ['Rating', record.rating != null ? record.rating.toFixed(1) : '—'],
          ['On-Time Delivery', record.onTimeDelivery != null ? `${record.onTimeDelivery}%` : '—'],
          ['Orders', record.orders ?? 0],
          ['Total Spend', formatAmount(record.spend ?? 0)]
        ].map(([field, value]) => ({ field, value }))
      });
      toast.success('Supplier profile exported as PDF');
    } catch (err) {
      toast.error(err?.message || 'Failed to export PDF');
    }
  };

  /* Header document actions — desktop icon bar + mobile three-dot menu. */
  const docActions = [
    { key: 'back', Icon: ArrowLeft, label: 'Back to suppliers', tone: 'neutral', run: () => navigate('/purchase/vendors') },
    { key: 'edit', Icon: Pencil, label: 'Edit supplier', tone: 'primary', run: () => navigate(`/purchase/vendors/${record.id}/edit`) },
    { key: 'print', Icon: Printer, label: 'Print preview', tone: 'gray', run: () => navigate(`/purchase/vendors/${record.id}/print`) },
    { key: 'exportPdf', Icon: FileDown, label: 'Export PDF', tone: 'indigo', run: () => handleExportPdf() },
    { key: 'timeline', Icon: History, label: 'Timeline', tone: 'indigo', run: () => navigate(`/purchase/vendors/${record.id}/timeline`) },
    { key: 'approval', Icon: UserCheck, label: 'Approval', tone: 'green', run: () => navigate(`/purchase/vendors/${record.id}/approval`) },
    { key: 'delete', Icon: Trash2, label: 'Delete supplier', tone: 'danger', run: () => setConfirmAction('delete') }
  ];

  /* ── Derived performance (transaction-based, fallback to stored) ── */
  const perf = record.metrics && record.metrics.hasData
    ? record.metrics
    : {
        hasData: false,
        purchaseVolume: { poCount: 0, poValue: 0, invoiceCount: 0, paidValue: 0 },
        delivery: { onTimeRate: null, total: 0 },
        quality: { acceptedRate: null, inspections: 0 },
        priceVariance: { avgVariancePct: null, comparedLines: 0 },
        response: { responded: 0, avgResponseDays: null },
        compositeScore: null
      };
  const perfSource = record.performanceSource || (record.hasTransactionData ? 'transactions' : 'stored');

  const credit = record.creditLimit || {};
  const outstanding = Number(vendorBalance?.outstanding) || 0;
  const creditLimitAmount = Number(credit.amount) || 0;
  const creditUtilisation = creditLimitAmount > 0
    ? Math.min(100, Math.round((outstanding / creditLimitAmount) * 100))
    : 0;

  const contactCount = (record.contacts || []).length;
  const addressCount = (record.addresses || []).length;
  const bankCount = (record.bankDetails || []).length;
  const contractCount = (record.contracts || []).length;
  const categoryCount = (record.categories || []).length;

  const KPI_ICONS = {
    'Supplier Code': { Icon: Building2, tone: 'indigo' },
    Status: { Icon: Activity, tone: 'green' },
    Category: { Icon: Layers, tone: 'cyan' },
    Active: { Icon: ShieldCheck, tone: 'emerald' },
    Rating: { Icon: Star, tone: 'violet' },
    'Total Spend': { Icon: IndianRupee, tone: 'emerald' },
    Paid: { Icon: CheckCircle2, tone: 'green' },
    Outstanding: { Icon: IndianRupee, tone: 'amber' }
  };

  const kpis = [
    { label: 'Supplier Code', value: record.id },
    { label: 'Status', value: <PurchaseStatusBadge status={record.status} /> },
    { label: 'Category', value: record.category || '—' },
    { label: 'Active', value: record.active === false ? 'Inactive' : 'Active' },
    { label: 'Rating', value: record.rating != null ? Number(record.rating).toFixed(1) : '—' },
    { label: 'Total Spend', value: formatAmount(record.spend ?? 0) },
    { label: 'Paid', value: vendorBalance ? formatAmount(vendorBalance.paid) : '—' },
    { label: 'Outstanding', value: vendorBalance ? formatAmount(vendorBalance.outstanding) : '—' }
  ];

  const kpiCard = (kpi) => {
    const meta = KPI_ICONS[kpi.label] || { Icon: LayoutDashboard, tone: 'gray' };
    const Icon = meta.Icon;
    return (
      <div key={kpi.label} className="purchase-summary-card prv-kpi-card">
        <span className={`prv-kpi-chip ${meta.tone}`} aria-hidden="true">
          <Icon />
        </span>
        <div className="prv-kpi-body">
          <div className="purchase-summary-value prv-kpi-value" title={typeof kpi.value === 'string' ? kpi.value : undefined}>
            {kpi.value}
          </div>
          <div className="purchase-summary-label prv-kpi-label">{kpi.label}</div>
        </div>
      </div>
    );
  };

  /* Registered office location — a pin is only registered once BOTH
     coordinates exist on the record (set via Edit → Office Location). */
  const hasLocation = Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude));

  const coordOf = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(6) : '—';
  };

  /* Deep-links into Edit Supplier → Office Location (map section). */
  const goToOfficeLocation = () => navigate(`/purchase/vendors/${record.id}/edit#office-location`);

  const openDocument = (url) => navigate(url);

  const tabs = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'contacts', label: 'Contacts', icon: Users, count: contactCount },
    { key: 'history', label: 'Engagement', icon: ShoppingCart },
    { key: 'rfqs', label: 'RFQs & Quotes', icon: MailPlus, count: transactions ? transactions.counts.rfq + transactions.counts.quotation : 0 },
    { key: 'orders', label: 'Orders', icon: FileText, count: transactions ? transactions.counts.po + transactions.counts.grn + transactions.counts.invoice : 0 },
    { key: 'performance', label: 'Performance', icon: TrendingUp },
    { key: 'attachments', label: 'Documents', icon: Paperclip, count: (record.attachments || []).length },
    { key: 'activity', label: 'Activity', icon: ListChecks },
    { key: 'timeline', label: 'Timeline', icon: History }
  ];

  const registeredOffice = (record.addresses || []).find((address) => address.id === 'registered-office') || null;
  const primaryContact = (record.contacts || []).find((contact) => contact.id === 'primary-contact') || null;

  return (
    <PurchasePageLayout className="prv-page">
      <div className="prv-sticky-header">
        <PurchaseHeader
          variant="cpr"
          crumb={[
            { label: 'Supplier Master', to: '/purchase/vendors' },
            { label: 'Supplier' }
          ]}
          icon={Building2}
          title={
            <span className="flex items-center gap-3">
              {record.name}
              <PurchaseStatusBadge status={record.status} />
              {record.active === false && <ToneChip label="Inactive" tone="red" />}
            </span>
          }
          subtitle={`${record.category || 'Supplier'} · ${record.id} · registered ${formatDate(record.createdAt)}`}
          actions={
            <>
              <span className="prv-icon-bar" role="group" aria-label="Document actions">
                {docActions.map(({ key, Icon, label, tone, run }) => (
                  <Fragment key={key}>
                    {iconButton(Icon, label, run, tone)}
                  </Fragment>
                ))}
              </span>
              <div className="prv-more-wrap" ref={moreRef}>
                <button
                  type="button"
                  className={`prv-more-btn ${moreOpen ? 'open' : ''}`}
                  onClick={() => setMoreOpen((prev) => !prev)}
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  <MoreHorizontal aria-hidden="true" />
                </button>
                {moreOpen && (
                  <div className="prv-more-menu" role="menu">
                    {docActions.map(({ key, Icon, label, tone, run }) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        className={`prv-more-item prv-more-item-${tone}`}
                        onClick={() => {
                          setMoreOpen(false);
                          run();
                        }}
                      >
                        <Icon aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {record.status === VENDOR_STATUS.PENDING && (
                <button
                  type="button"
                  onClick={() => setConfirmAction('approve')}
                  disabled={busy}
                  className="po-btn po-btn-success"
                >
                  <CheckCircle2 className="po-btn-icon-ic" /> Approve Supplier
                </button>
              )}
              {record.status !== VENDOR_STATUS.BLOCKED && record.status !== VENDOR_STATUS.PENDING && (
                <button
                  type="button"
                  onClick={() => setConfirmAction('block')}
                  disabled={busy}
                  className="po-btn po-btn-danger"
                >
                  <UserX className="po-btn-icon-ic" /> Block
                </button>
              )}
            </>
          }
        />
      </div>

      {/* Top KPI row — icon chips + single-line values */}
      <div className="purchase-summary-grid">
        {kpis.map((kpi) => kpiCard(kpi))}
      </div>

      {/* Dashboard grid — left tabs (70%) · right sticky summary (30%) */}
      <div className="prv-layout">
        <div className="prv-main">
          <div className="prv-tabs-bar">
            <div className="po-tabs-row">
              <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
            </div>
            <button
              type="button"
              className="prv-tabs-link"
              onClick={() => navigate(`/purchase/vendors/${record.id}/activity`)}
            >
              <ListChecks /> Activity Log
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="prv-panel space-y-5">
              <PurchaseSectionCard
                title="Profile & Registration"
                subtitle="Supplier code, category and registration facts"
                icon={Building2}
                action={record.active === false ? <ToneChip label="Inactive" tone="red" /> : <ToneChip label="Active" tone="green" />}
              >
                <div className="prv-detail-grid">
                  <DetailItem label="Supplier Code" value={record.id} />
                  <DetailItem label="Primary Category" value={record.category} />
                  <DetailItem label="Registered On" value={formatDate(record.createdAt)} />
                  <DetailItem label="Registration Date" value={formatDate(record.registrationDate)} />
                  <DetailItem label="Approval Status" value={<PurchaseStatusBadge status={record.status} />} />
                  <DetailItem label="Operational" value={record.active === false ? 'Inactive' : 'Active'} />
                </div>
                {(record.categories || []).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    {(record.categories || []).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                        <Tags className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </PurchaseSectionCard>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                <PurchaseSectionCard title="Legal Details" subtitle="Legal entity and incorporation" icon={Scale}>
                  <div className="prv-detail-grid">
                    <DetailItem label="Legal Name" value={record.legalName} />
                    <DetailItem label="Legal Type" value={record.legalType} />
                    <DetailItem label="CIN" value={record.cin} />
                    <DetailItem label="Incorporation Date" value={formatDate(record.incorporationDate)} />
                    <DetailItem label="MSME Reg No" value={record.msmeRegNo} />
                    <DetailItem label="MSME Type" value={record.msmeType} />
                  </div>
                </PurchaseSectionCard>

                <PurchaseSectionCard title="Tax Details" subtitle="GST registration and statutory IDs" icon={BadgeCheck}>
                  <div className="prv-detail-grid">
                    <DetailItem label="GSTIN" value={record.gstin} />
                    <DetailItem label="GST Type" value={record.gstType} />
                    <DetailItem label="PAN" value={record.pan} />
                    <DetailItem label="TAN" value={record.tan} />
                    <DetailItem label="State" value={record.state} />
                    <DetailItem label="GST State Code" value={record.gstin ? String(record.gstin).slice(0, 2) : '—'} />
                  </div>
                </PurchaseSectionCard>
              </div>

              {/* Addresses — registered office card + additional list */}
              <PurchaseSectionCard
                title={`Addresses (${addressCount})`}
                subtitle="Registered office and additional locations"
                icon={MapPin}
              >
                <div className="space-y-3">
                  {registeredOffice && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className={LABEL}>Registered Office</div>
                        {hasLocation && (
                          <button type="button" onClick={() => setMapOpen(true)} className="po-btn po-btn-primary po-btn-sm">
                            <MapPin className="po-btn-icon-ic" /> View Map
                          </button>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-700">{registeredOffice.line || '—'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {[registeredOffice.city, registeredOffice.state, registeredOffice.postalCode].filter(Boolean).join(', ')}
                        {registeredOffice.country ? `, ${registeredOffice.country}` : ''}
                      </p>
                    </div>
                  )}
                  {(record.addresses || []).filter((address) => address.id !== 'registered-office').map((address) => (
                    <div key={address.id} className="rounded-lg border border-slate-200 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className={LABEL}>{address.type || 'Address'}</div>
                      </div>
                      <p className="text-xs font-semibold text-slate-700">{address.line || address.address || '—'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
                        {address.country ? `, ${address.country}` : ''}
                      </p>
                    </div>
                  ))}
                  {!registeredOffice && (record.addresses || []).length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-center">
                      <p className="text-xs text-slate-500">No address has been registered.</p>
                      <button type="button" onClick={goToOfficeLocation} className="po-btn po-btn-primary po-btn-sm mt-2.5">
                        <MapPin className="po-btn-icon-ic" /> Register Location
                      </button>
                    </div>
                  )}
                </div>
              </PurchaseSectionCard>

              {/* Contacts */}
              <PurchaseSectionCard title={`Contacts (${contactCount})`} subtitle="Primary and additional contacts" icon={Users}>
                {(record.contacts || []).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-2 pr-3">Name</th>
                          <th className="py-2 pr-3">Designation</th>
                          <th className="py-2 pr-3">Email</th>
                          <th className="py-2 pr-3">Phone</th>
                          <th className="py-2">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(record.contacts || []).map((contact) => (
                          <tr key={contact.id}>
                            <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                              {contact.name || '—'}
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-slate-600">{contact.designation || contact.role || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500">{contact.email || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500">{contact.phone || '—'}</td>
                            <td className="py-2.5">
                              {contact.isPrimary ? <ToneChip label="Primary" tone="green" /> : <ToneChip label="Additional" tone="slate" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No contacts recorded yet.</p>
                )}
              </PurchaseSectionCard>

              {/* Banking + credit */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                <PurchaseSectionCard title={`Bank Details (${bankCount})`} subtitle="Payment beneficiary accounts" icon={Landmark}>
                  {(record.bankDetails || []).length > 0 ? (
                    <div className="space-y-3">
                      {(record.bankDetails || []).map((bank) => (
                        <div key={bank.id} className="rounded-lg border border-slate-200 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-bold text-slate-800">{bank.accountName || 'Account'}</p>
                            <span className="text-[11px] font-semibold text-slate-400">{bank.currency || ''}</span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {[bank.bankName, bank.branch].filter(Boolean).join(' · ') || '—'}
                          </p>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-slate-500">
                            <span>Account: <b className="font-mono text-slate-700">{bank.accountNumber || '—'}</b></span>
                            <span>IFSC: <b className="font-mono text-slate-700">{bank.ifsc || '—'}</b></span>
                            <span>SWIFT: <b className="font-mono text-slate-700">{bank.swift || '—'}</b></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-6 text-center">No bank accounts recorded yet.</p>
                  )}
                </PurchaseSectionCard>

                <PurchaseSectionCard title="Payment & Credit" subtitle="Terms, sanctioned credit and utilisation" icon={CreditCard}>
                  <div className="prv-detail-grid">
                    <DetailItem label="Payment Terms" value={record.paymentTerms} />
                    <DetailItem label="Currency" value={record.currency} />
                    <DetailItem label="Lead Time" value={record.leadTimeDays ? `${record.leadTimeDays} days` : '—'} />
                    <DetailItem label="Credit Days" value={credit.days ? `${credit.days} days` : '—'} />
                  </div>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className={LABEL}>Credit Limit</div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-800">
                          {creditLimitAmount > 0 ? formatAmount(creditLimitAmount) : 'Not set'}
                        </span>
                        {creditLimitAmount > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            {formatAmount(outstanding)} outstanding · {creditUtilisation}% used
                          </span>
                        )}
                      </div>
                    </div>
                    {creditLimitAmount > 0 && (
                      <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${creditUtilisation >= 90 ? 'bg-rose-500' : creditUtilisation >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${creditUtilisation}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {vendorBalance && (
                    <div className="mt-3 grid grid-cols-3 gap-2.5">
                      {[
                        { label: 'Invoiced', value: formatAmount(vendorBalance.invoiced) },
                        { label: 'Paid', value: formatAmount(vendorBalance.paid) },
                        { label: 'Outstanding', value: formatAmount(vendorBalance.outstanding) }
                      ].map((tile) => (
                        <div key={tile.label} className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                          <div className="text-xs font-bold text-slate-800 tabular-nums">{tile.value}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">{tile.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </PurchaseSectionCard>
              </div>

              {/* Contracts */}
              <PurchaseSectionCard
                title={`Contracts & Agreements (${contractCount})`}
                subtitle="Rate contracts, AMCs and framework agreements"
                icon={ScrollText}
              >
                {(record.contracts || []).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-2 pr-3">Contract No</th>
                          <th className="py-2 pr-3">Title</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Period</th>
                          <th className="py-2 pr-3">Value</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(record.contracts || []).map((contract) => (
                          <tr key={contract.id}>
                            <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{contract.contractNo || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-600">{contract.title || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500">{contract.type || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">
                              {contract.startDate ? formatDate(contract.startDate) : '—'} → {contract.endDate ? formatDate(contract.endDate) : 'Open'}
                            </td>
                            <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                              {contract.value ? formatAmount(contract.value) : '—'}
                            </td>
                            <td className="py-2.5"><ToneChip label={contract.status || 'Draft'} tone={statusTone(contract.status)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No contracts recorded yet.</p>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'contacts' && (
            <div className="prv-panel">
              <PurchaseSectionCard
                title={`Contact Details (${contactCount})`}
                subtitle="Primary point of contact plus additional people"
                icon={Users}
                action={<button type="button" onClick={() => navigate(`/purchase/vendors/${record.id}/edit`)} className="po-btn po-btn-secondary po-btn-sm">Add Contact</button>}
              >
                {(record.contacts || []).length > 0 ? (
                  <div className="space-y-4">
                    {(record.contacts || []).map((contact) => (
                      <div key={contact.id} className="rounded-lg border border-slate-200 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800">{contact.name || 'Unnamed contact'}</p>
                          {contact.isPrimary ? <ToneChip label="Primary Contact" tone="green" /> : <ToneChip label="Contact" tone="slate" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{contact.designation || contact.role || '—'}</p>
                        <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
                          {contact.email && <span className="inline-flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400" /> {contact.email}</span>}
                          {contact.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" /> {contact.phone}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="prv-detail-grid">
                    <DetailItem label="Email" value={
                      <span className="inline-flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400" /> {record.email || '—'}</span>
                    } />
                    <DetailItem label="Phone" value={
                      <span className="inline-flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /> {record.phone || '—'}</span>
                    } />
                    <DetailItem label="Website" value={record.website || '—'} />
                  </div>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="prv-panel">
              <PurchaseSectionCard title="Purchase Engagement" subtitle="Volume and activity derived from real purchase documents">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                  {[
                    { label: 'Purchase Orders', value: String(perf.purchaseVolume.poCount) },
                    { label: 'PO Value', value: formatAmount(perf.purchaseVolume.poValue) },
                    { label: 'Invoices', value: String(perf.purchaseVolume.invoiceCount) },
                    { label: 'Paid to Supplier', value: formatAmount(perf.purchaseVolume.paidValue) }
                  ].map((tile) => (
                    <div key={tile.label} className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-center">
                      <div className="text-sm font-bold text-slate-900">{tile.value}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{tile.label}</div>
                    </div>
                  ))}
                </div>
                {transactions && transactions.rows ? (
                  <ul className="divide-y divide-slate-100">
                    {[
                      ...transactions.rows.rfqs.map((row) => ({ ...row, kind: 'RFQ', icon: MailPlus })),
                      ...transactions.rows.orders.map((row) => ({ ...row, kind: 'PO', icon: FileText })),
                      ...transactions.rows.grns.map((row) => ({ ...row, kind: 'GRN', icon: Truck })),
                      ...transactions.rows.invoices.map((row) => ({ ...row, kind: 'Invoice', icon: Receipt })),
                      ...transactions.rows.payments.map((row) => ({ ...row, kind: 'Payment', icon: Wallet, date: row.paidOn }))
                    ]
                      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
                      .slice(0, 12)
                      .map((entry) => {
                        const KindIcon = entry.icon;
                        return (
                          <li key={`${entry.kind}-${entry.docNo}-${entry.paymentNo || ''}`} className="py-2.5 flex items-start gap-3">
                            <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-500 shrink-0">
                              <KindIcon className="w-3.5 h-3.5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <button
                                  type="button"
                                  onClick={() => openDocument(entry.url)}
                                  className="text-xs font-bold text-slate-800 hover:text-[#0B4A3D] hover:underline text-left"
                                >
                                  {entry.docNo}
                                </button>
                                <ToneChip label={entry.kind} tone="sky" />
                                {entry.status && <ToneChip label={entry.status} tone={statusTone(entry.status)} />}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {entry.title || entry.docNo} · {entry.date ? formatDate(entry.date) : '—'}
                                {entry.amount ? ` · ${formatAmount(entry.amount)}` : ''}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                ) : activity.length > 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No transaction history yet — records will appear as RFQs, orders and invoices are raised.</p>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No transaction history yet — records will appear as RFQs, orders and invoices are raised.</p>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'rfqs' && (
            <div className="prv-panel space-y-5">
              <PurchaseSectionCard title="RFQs" subtitle="Requests for quotation that invited this supplier">
                {transactions && transactions.rows.rfqs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-2 pr-3">RFQ No</th>
                          <th className="py-2 pr-3">Title</th>
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Amount</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transactions.rows.rfqs.map((rfq) => (
                          <tr key={rfq.id}>
                            <td className="py-2.5 pr-3 text-xs font-semibold whitespace-nowrap">
                              <button type="button" onClick={() => openDocument(rfq.url)} className="text-slate-700 hover:text-[#0B4A3D] hover:underline">
                                {rfq.docNo}
                              </button>
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-slate-600">{rfq.title || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">{rfq.date ? formatDate(rfq.date) : '—'}</td>
                            <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatAmount(rfq.amount)}</td>
                            <td className="py-2.5"><ToneChip label={rfq.status} tone={statusTone(rfq.status)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">This supplier has not been invited to any RFQ yet.</p>
                )}
              </PurchaseSectionCard>

              <PurchaseSectionCard title="Quotations" subtitle="Quotations submitted by this supplier">
                {transactions && transactions.rows.quotations.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-2 pr-3">Quote</th>
                          <th className="py-2 pr-3">RFQ</th>
                          <th className="py-2 pr-3">Submitted</th>
                          <th className="py-2 pr-3">Amount</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transactions.rows.quotations.map((quote) => (
                          <tr key={quote.id}>
                            <td className="py-2.5 pr-3 text-xs font-semibold whitespace-nowrap">
                              <button type="button" onClick={() => openDocument(quote.url)} className="text-slate-700 hover:text-[#0B4A3D] hover:underline">
                                {quote.docNo}
                              </button>
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-slate-600">{quote.title || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">{quote.date ? formatDate(quote.date) : '—'}</td>
                            <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatAmount(quote.amount)}</td>
                            <td className="py-2.5"><ToneChip label={quote.status} tone={statusTone(quote.status)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No quotations from this supplier yet.</p>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="prv-panel space-y-5">
              <PurchaseSectionCard title="Purchase Orders" subtitle="Orders placed with this supplier">
                {transactions && transactions.rows.orders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-2 pr-3">PO No</th>
                          <th className="py-2 pr-3">Title</th>
                          <th className="py-2 pr-3">Order Date</th>
                          <th className="py-2 pr-3">Amount</th>
                          <th className="py-2">Stage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transactions.rows.orders.map((order) => (
                          <tr key={order.id}>
                            <td className="py-2.5 pr-3 text-xs font-semibold whitespace-nowrap">
                              <button type="button" onClick={() => openDocument(order.url)} className="text-slate-700 hover:text-[#0B4A3D] hover:underline">
                                {order.docNo}
                              </button>
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-slate-600">{order.title || '—'}</td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">{order.date ? formatDate(order.date) : '—'}</td>
                            <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatAmount(order.amount)}</td>
                            <td className="py-2.5"><ToneChip label={order.status} tone={statusTone(order.status)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No purchase orders with this supplier yet.</p>
                )}
              </PurchaseSectionCard>

              <PurchaseSectionCard title="Goods Receipts & Inspection" subtitle="GRNs and quality inspection records">
                {transactions && (transactions.rows.grns.length > 0 || transactions.rows.inspections.length > 0) ? (
                  <ul className="divide-y divide-slate-100">
                    {transactions.rows.grns.map((grn) => (
                      <li key={grn.id} className="py-2.5 flex items-start gap-3">
                        <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-500 shrink-0">
                          <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <button type="button" onClick={() => openDocument(grn.url)} className="text-xs font-bold text-slate-800 hover:text-[#0B4A3D] hover:underline">
                              {grn.docNo}
                            </button>
                            <ToneChip label={grn.status} tone={statusTone(grn.status)} />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">PO {grn.title} · {grn.date ? formatDate(grn.date) : 'not received yet'}</p>
                        </div>
                      </li>
                    ))}
                    {transactions.rows.inspections.map((inspection) => (
                      <li key={inspection.id} className="py-2.5 flex items-start gap-3">
                        <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-500 shrink-0">
                          <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <button type="button" onClick={() => openDocument(inspection.url)} className="text-xs font-bold text-slate-800 hover:text-[#0B4A3D] hover:underline">
                              {inspection.docNo}
                            </button>
                            <ToneChip label={inspection.status} tone={statusTone(inspection.status)} />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">GRN {inspection.title} · {inspection.date ? formatDate(inspection.date) : 'pending'}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No goods receipts or inspections for this supplier yet.</p>
                )}
              </PurchaseSectionCard>

              <PurchaseSectionCard title="Invoices & Payments" subtitle="Vendor invoices and payments settled">
                {transactions && (transactions.rows.invoices.length > 0 || transactions.rows.payments.length > 0) ? (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <th className="py-2 pr-3">Invoice</th>
                            <th className="py-2 pr-3">PO</th>
                            <th className="py-2 pr-3">Date</th>
                            <th className="py-2 pr-3">Amount</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {transactions.rows.invoices.map((invoice) => (
                            <tr key={invoice.id}>
                              <td className="py-2.5 pr-3 text-xs font-semibold whitespace-nowrap">
                                <button type="button" onClick={() => openDocument(invoice.url)} className="text-slate-700 hover:text-[#0B4A3D] hover:underline">
                                  {invoice.docNo}
                                </button>
                              </td>
                              <td className="py-2.5 pr-3 text-xs text-slate-600">{invoice.title || '—'}</td>
                              <td className="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">{invoice.date ? formatDate(invoice.date) : '—'}</td>
                              <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatAmount(invoice.amount)}</td>
                              <td className="py-2.5"><ToneChip label={invoice.status} tone={statusTone(invoice.status)} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {transactions.rows.payments.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <th className="py-2 pr-3">Payment</th>
                              <th className="py-2 pr-3">Invoice</th>
                              <th className="py-2 pr-3">Date</th>
                              <th className="py-2 pr-3">Method</th>
                              <th className="py-2">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {transactions.rows.payments.map((payment) => (
                              <tr key={`${payment.invoiceNo}-${payment.paymentNo}`}>
                                <td className="py-2.5 pr-3 text-xs font-semibold whitespace-nowrap">
                                  <button type="button" onClick={() => openDocument(payment.url)} className="text-slate-700 hover:text-[#0B4A3D] hover:underline">
                                    {payment.paymentNo || '—'}
                                  </button>
                                </td>
                                <td className="py-2.5 pr-3 text-xs text-slate-600">{payment.invoiceNo}</td>
                                <td className="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">{payment.paidOn ? formatDate(payment.paidOn) : '—'}</td>
                                <td className="py-2.5 pr-3 text-xs text-slate-500">{payment.method || '—'}</td>
                                <td className="py-2.5 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatAmount(payment.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No invoices or payments for this supplier yet.</p>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="prv-panel">
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-2.5">
                <TrendingUp className="w-4 h-4 text-[#0A4F44] mt-0.5 shrink-0" />
                <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">
                  {perfSource === 'transactions'
                    ? `Performance is computed from ${record.name}'s real purchase documents (POs, goods receipts, inspections, quotations, invoices). Nothing is manually scored.`
                    : 'This supplier has no transaction history yet — the numbers below are the stored master values. Real RFQ → PO → GRN → Invoice activity will replace them automatically.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                {[
                  { label: 'Composite Score', value: perf.compositeScore != null ? String(perf.compositeScore) : '—', icon: Star, color: 'text-amber-500', suffix: '' },
                  { label: 'Delivery Performance', value: perf.delivery.onTimeRate != null ? `${perf.delivery.onTimeRate}%` : '—', icon: Truck, color: 'text-emerald-500', suffix: `on ${perf.delivery.total} receipt(s)` },
                  { label: 'Quality / Acceptance', value: perf.quality.acceptedRate != null ? `${perf.quality.acceptedRate}%` : '—', icon: BadgeCheck, color: 'text-violet-500', suffix: `${perf.quality.inspections} inspection(s)` },
                  { label: 'Price Variance', value: perf.priceVariance.avgVariancePct != null ? `${perf.priceVariance.avgVariancePct > 0 ? '+' : ''}${perf.priceVariance.avgVariancePct}%` : '—', icon: IndianRupee, color: 'text-sky-500', suffix: perf.priceVariance.comparedLines ? `vs quote on ${perf.priceVariance.comparedLines} line(s)` : '' }
                ].map((tile) => (
                  <div key={tile.label} className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-center">
                    <tile.icon className={`w-4 h-4 ${tile.color} mx-auto mb-1.5`} aria-hidden="true" />
                    <div className="text-lg font-bold text-slate-900">{tile.value}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{tile.label}</div>
                    {tile.suffix && <div className="text-[10px] text-slate-400 mt-0.5">{tile.suffix}</div>}
                  </div>
                ))}
              </div>

              <PurchaseSectionCard title="Metric Details" subtitle="How every number is derived from real transactions" icon={Activity}>
                <div className="space-y-4">
                  {[
                    {
                      label: 'Delivery Performance',
                      icon: Truck,
                      rows: [
                        { key: 'Receipts logged', value: String(perf.delivery.total) },
                        { key: 'On-time receipts', value: String(perf.delivery.onTime) },
                        { key: 'Late receipts', value: String(perf.delivery.late) },
                        { key: 'Overdue undelivered orders', value: String(perf.delivery.pending) },
                        { key: 'Avg delay on late receipts', value: perf.delivery.avgLateDays ? `${perf.delivery.avgLateDays} days` : '—' }
                      ],
                      note: 'GRN receipt dates are compared with each PO\u2019s promised (expected) date. Shipments add a receipt only when no GRN covers the PO.'
                    },
                    {
                      label: 'Quality / Rejection',
                      icon: BadgeCheck,
                      rows: [
                        { key: 'Inspections', value: String(perf.quality.inspections) },
                        { key: 'Accepted qty', value: String(perf.quality.acceptedQty) },
                        { key: 'Rejected qty', value: String(perf.quality.rejectedQty) },
                        { key: 'Defects', value: String(perf.quality.defects) },
                        { key: 'Failed inspections', value: String(perf.quality.failed) }
                      ],
                      note: 'Quality = accepted ÷ (accepted + rejected) across inspection line items; inspection-status-only records use the passed ÷ decided ratio.'
                    },
                    {
                      label: 'Price Variance',
                      icon: IndianRupee,
                      rows: [
                        { key: 'Orders compared', value: String(perf.priceVariance.comparedOrders) },
                        { key: 'Lines compared', value: String(perf.priceVariance.comparedLines) },
                        { key: 'Avg variance vs quote', value: perf.priceVariance.avgVariancePct != null ? `${perf.priceVariance.avgVariancePct > 0 ? '+' : ''}${perf.priceVariance.avgVariancePct}%` : '—' }
                      ],
                      note: 'PO line rates are compared with the accepted quotation (or the originating RFQ estimate) line by line.'
                    },
                    {
                      label: 'Response Time',
                      icon: MailPlus,
                      rows: [
                        { key: 'RFQs sent', value: String(perf.response.invited) },
                        { key: 'Quotations responded', value: String(perf.response.responded) },
                        { key: 'Avg response time', value: perf.response.avgResponseDays != null ? `${perf.response.avgResponseDays} days` : '—' },
                        { key: 'On-time responses', value: String(perf.response.onTimeResponses) },
                        { key: 'Late responses', value: String(perf.response.lateResponses) }
                      ],
                      note: 'Quotation submission dates are measured from the RFQ send date; on-time means before the RFQ closing date.'
                    }
                  ].map((section) => (
                    <div key={section.label} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <section.icon className="w-4 h-4 text-[#0A4F44]" aria-hidden="true" />
                        <h4 className="text-xs font-bold text-slate-800">{section.label}</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {section.rows.map((row) => (
                          <div key={row.key} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-center">
                            <div className="text-xs font-bold text-slate-800 tabular-nums">{row.value}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">{row.key}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 italic">{section.note}</p>
                    </div>
                  ))}
                </div>
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'attachments' && (
            <div className="prv-panel">
              <PurchaseSectionCard
                title="Documents"
                subtitle={`${(record.attachments || []).length} supporting document(s)`}
                icon={Paperclip}
              >
                <AttachmentList attachments={record.attachments || []} fallbackDate={record.createdAt} />
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="prv-panel">
              <PurchaseSectionCard title="Activity" subtitle="Full audit trail for this supplier">
                {activity.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {activity.map((entry) => (
                      <li key={entry.id || `${entry.action}-${entry.date}`} className="py-2.5 flex items-start gap-3">
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-sky-500 shrink-0" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800">{entry.action}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {formatDateTime(entry.date)} · {entry.user}{entry.ip ? ` · ${entry.ip}` : ''}
                          </p>
                          {(entry.oldValue || entry.newValue) && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {entry.oldValue ? `${entry.oldValue} → ${entry.newValue}` : entry.newValue}
                            </p>
                          )}
                          {entry.remarks && <p className="text-[11px] text-slate-400 italic mt-0.5">{entry.remarks}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No activity recorded for this supplier yet.</p>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="prv-panel">
              <PurchaseSectionCard title="Timeline" subtitle="Chronological event stream">
                {timelineEvents.length > 0 ? (
                  <ol className="relative space-y-0 max-w-2xl mx-auto">
                    {timelineEvents.map((event, index) => (
                      <li key={event.id || `${event.type}-${index}`} className="relative pl-12 pb-6 last:pb-0">
                        {index < timelineEvents.length - 1 && (
                          <span className="absolute left-[15px] top-9 bottom-0 w-px bg-slate-200" aria-hidden="true" />
                        )}
                        <span className="absolute left-0 top-0 flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-slate-50 text-slate-500 shadow-sm" aria-hidden="true">
                          <FileText className="w-4 h-4" />
                        </span>
                        <div className="pt-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-xs font-bold text-slate-800">{event.label}</p>
                            {event.status && <PurchaseStatusBadge status={event.status} />}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {event.actor ? `${event.actor} · ` : ''}{formatDateTime(event.timestamp)}
                          </p>
                          {event.note && (
                            <p className="mt-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                              {event.note}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">No timeline events recorded yet.</p>
                )}
              </PurchaseSectionCard>
            </div>
          )}
        </div>

        {/* Sticky right panel — commercial terms + registration summary */}
        <aside className="prv-side">
          <PurchaseSectionCard title="Commercial Terms" subtitle="Trading conditions">
            <div className="space-y-3">
              <DetailItem label="Payment Terms" value={record.paymentTerms || '—'} />
              <DetailItem label="Currency" value={record.currency || '—'} />
              <DetailItem label="Lead Time" value={record.leadTimeDays ? `${record.leadTimeDays} days` : '—'} />
              <DetailItem label="GSTIN" value={record.gstin || '—'} />
              <DetailItem label="PAN / TAN" value={[record.pan, record.tan].filter(Boolean).join(' / ') || '—'} />
              <DetailItem label="Credit Limit" value={creditLimitAmount > 0 ? formatAmount(creditLimitAmount) : 'Not set'} />
            </div>
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Registration" subtitle="Master record summary">
            <div className="space-y-3">
              <DetailItem label="Supplier Code" value={record.id} />
              <DetailItem label="Legal Name" value={record.legalName || record.name || '—'} />
              <DetailItem label="Category" value={record.category || '—'} />
              <DetailItem label="Registered On" value={formatDate(record.createdAt)} />
              <DetailItem label="Status" value={<PurchaseStatusBadge status={record.status} />} />
              <DetailItem label="Operational" value={record.active === false ? 'Inactive' : 'Active'} />
            </div>
          </PurchaseSectionCard>

          {primaryContact && (
            <PurchaseSectionCard title="Primary Contact" subtitle="Main point of contact">
              <div className="space-y-3">
                <DetailItem label="Name" value={primaryContact.name || record.name || '—'} />
                <DetailItem label="Designation" value={primaryContact.designation || '—'} />
                <DetailItem label="Email" value={primaryContact.email || '—'} />
                <DetailItem label="Phone" value={primaryContact.phone || '—'} />
              </div>
            </PurchaseSectionCard>
          )}
        </aside>
      </div>

      {mapOpen && (
        <Suspense fallback={null}>
          <VendorLocationModal
            open={mapOpen}
            onClose={() => setMapOpen(false)}
            latitude={record.latitude}
            longitude={record.longitude}
            formattedAddress={record.formattedAddress}
          />
        </Suspense>
      )}

      <ConfirmDialog
        open={confirmAction === 'approve'}
        title="Approve supplier?"
        message={`${record.name} will become an approved supplier and appear in sourcing lists.`}
        confirmLabel="Approve"
        variant="default"
        icon={CheckCircle2}
        loading={busy}
        onConfirm={() => runAction(() => vendorService.setVendorStatus(record.id, VENDOR_STATUS.APPROVED), `${record.name} approved`)}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'block'}
        title="Block supplier?"
        message={`${record.name} will be blocked and excluded from future sourcing.`}
        confirmLabel="Block"
        variant="danger"
        icon={UserX}
        loading={busy}
        onConfirm={() => runAction(() => vendorService.setVendorStatus(record.id, VENDOR_STATUS.BLOCKED), `${record.name} blocked`)}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Delete supplier?"
        message={`This will permanently remove ${record.name}. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onConfirm={async () => {
          await runAction(() => vendorService.deleteVendor(record.id), `${record.name} deleted`);
          navigate('/purchase/vendors');
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </PurchasePageLayout>
  );
}

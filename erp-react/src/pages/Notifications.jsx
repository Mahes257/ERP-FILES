import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  RotateCw,
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  Factory,
  Shield,
  Package,
  Megaphone
} from 'lucide-react';
import { useToast } from '../components/Common';
import { useNotifications } from '../components/Common';
import { formatRelativeTime } from '../data/notificationSource';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' }
];

/** Map module name to an icon and accent colour. */
const MODULE_STYLES = {
  SALES: { icon: Package, accent: { background: '#F5F3FF', color: '#7C3AED' } },
  MARKETING: { icon: Megaphone, accent: { background: '#FFFBEB', color: '#D97706' } },
  // Production approval events (submitted / approved / rejected).
  PRODUCTION: { icon: Factory, accent: { background: '#EEF6F3', color: '#0B4A3D' } },
  GENERAL: { icon: Bell, accent: { background: '#F3F4F6', color: '#6B7280' } }
};

function getModuleStyle(mod) {
  return MODULE_STYLES[mod] || MODULE_STYLES.GENERAL;
}

/** Priority â†’ colour. */
const PRIORITY_COLORS = {
  LOW: 'bg-slate-100 text-slate-500',
  NORMAL: 'bg-blue-50 text-blue-600',
  HIGH: 'bg-orange-50 text-orange-600',
  URGENT: 'bg-red-50 text-red-600'
};

function NotificationCard({ item, onOpen }) {
  const style = getModuleStyle(item.module);
  const Icon = style.icon;
  const isUnread = item.status === 'UNREAD';

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`w-full text-left rounded-2xl border px-4 py-4 sm:px-5 flex items-start gap-4 transition-all duration-150 cursor-pointer group ${
        isUnread
          ? 'bg-[#F4F9F7] border-[#0B4A3D]/20 shadow-[0_1px_3px_rgba(11, 74, 61,0.08)] hover:border-[#0B4A3D]/35 hover:shadow-[0_4px_14px_rgba(11, 74, 61,0.12)]'
          : 'bg-surface border-slate-200/90 shadow-sm hover:shadow-md hover:border-[#0B4A3D]/25'
      }`}
      aria-label={`${item.title}${isUnread ? ', unread' : ''}`}
    >
      <span
        className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: style.accent.background }}
        aria-hidden="true"
      >
        <Icon className="w-[18px] h-[18px]" style={{ color: style.accent.color }} />
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-start justify-between gap-3">
          <span
            className={`flex items-center gap-2 min-w-0 ${
              isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
            }`}
          >
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-[#dc2626] shrink-0" aria-hidden="true" />
            )}
            <span className="truncate text-[13px] leading-snug">{item.title}</span>
          </span>
          <span className="text-[11px] text-slate-400 whitespace-nowrap mt-0.5 shrink-0">
            {formatRelativeTime(item.createdAt)}
          </span>
        </span>

        <span className="mt-1.5 block text-[13px] text-slate-600 line-clamp-2 leading-snug">
          {item.message}
        </span>

        <span className="mt-2 flex flex-wrap items-center gap-2">
          {item.module && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500">
              {item.module}
            </span>
          )}
          {item.referenceType && item.referenceId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-600">
              {item.referenceType} #{item.referenceId}
            </span>
          )}
          {item.priority && item.priority !== 'NORMAL' && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                PRIORITY_COLORS[item.priority] || ''
              }`}
            >
              {item.priority}
            </span>
          )}
          {item.reminderCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              Reminder #{item.reminderCount}
            </span>
          )}
        </span>
      </span>

      <span
        className="shrink-0 mt-1 text-slate-300 group-hover:text-[#0B4A3D] transition-colors"
        aria-hidden="true"
      >
        <ChevronRight className="w-4 h-4" />
      </span>
    </button>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    notifications,
    unreadCount,
    loading,
    connected,
    markAsRead,
    resolveNotification,
    refresh
  } = useNotifications();
  const [filter, setFilter] = useState('all');

  const unreadFilterCount = unreadCount;

  const visibleItems = useMemo(
    () =>
      filter === 'unread'
        ? notifications.filter((n) => n.status === 'UNREAD')
        : notifications,
    [notifications, filter]
  );

  const openNotification = useCallback(
    async (item) => {
      if (item.status === 'UNREAD') {
        await markAsRead(item.id);
      }
      if (item.referenceType && item.referenceId) {
        // Navigate to the referenced record if possible
        const routes = {
          SalesOrder: `/sales-orders/${item.referenceId}`,
          Quotation: `/quotations/${item.referenceId}/view`,
          SalesContract: `/sales-contracts/${item.referenceId}`,
          // Sales workflow records raised by the Sales notification sweep.
          CreditNote: `/credit-notes/${item.referenceId}`,
          Invoice: `/invoices/${item.referenceId}`,
          PaymentReceipt: `/payment-receipts/${item.referenceId}`,
          // Production Work Orders are addressed by their backend id.
          ProductionOrder: `/production/orders/${item.referenceId}`,
          // The other Production records are addressed by their DOCUMENT NUMBER in
          // the Production routes (drawings/:workOrder, quality/:inspectionNo), not
          // by the numeric id carried here — so they open their queue page, where
          // the number from the notification message is listed and searchable.
          TechnicalVerification: '/production/technical-verification',
          Drawing: '/production/drawings',
          Model: '/production/models',
          QualityInspection: '/production/quality',
          PackingList: '/production/packing',
          Dispatch: '/production/dispatch',
          // Purchase records that are routed by their backend id.
          PurchaseRequisition: `/purchase/requisition/${item.referenceId}`,
          PurchaseOrder: `/purchase/orders/${item.referenceId}`,
          PurchaseRfq: `/purchase/rfq/${item.referenceId}`,
          PurchaseInvoice: `/purchase/invoices/${item.referenceId}`,
          // GRNs and quality inspections are addressed by their DOCUMENT NUMBER
          // in the Purchase routes (grn/:grnNo, quality/:inspectionNo), not by
          // the numeric id carried here — so those open their queue, where the
          // document number from the message is listed and searchable.
          PurchaseGrn: '/purchase/logistics/grn',
          PurchaseInspection: '/purchase/logistics/quality'
        };
        const route = routes[item.referenceType];
        if (route) navigate(route);
      }
    },
    [markAsRead, navigate]
  );

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => n.status === 'UNREAD');
    if (unread.length === 0) return;
    await Promise.all(unread.map((n) => markAsRead(n.id)));
    toast.success('All notifications marked as read');
  }, [notifications, markAsRead, toast]);

  const showEmpty = !loading && notifications.length === 0;
  const showFilteredEmpty = !loading && !showEmpty && visibleItems.length === 0;

  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 px-3 pt-3.5 pb-10 sm:px-7 sm:pt-5 sm:pb-24 w-full max-w-[100vw] overflow-x-hidden">
      <div className="max-w-[760px] mx-auto">
        {/* Breadcrumb — part of the sticky page header (useStickyPageHeader) */}
        <div data-erp-sticky-header className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
          <span>VISHAK TECH</span>
          <span>&gt;</span>
          <span>Notifications</span>
        </div>

        {/* Header — pinned with the breadcrumb above while the list scrolls */}
        <div data-erp-sticky-header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 tracking-tight">
            <span className="h-10 w-10 rounded-full bg-[#E8F0EE] flex items-center justify-center">
              <Bell className="w-5 h-5 text-[#0B4A3D]" aria-hidden="true" />
            </span>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full bg-[#dc2626] text-white text-[11px] font-bold shadow-sm h-[22px] min-w-[22px] px-[5px]"
                aria-label={`${unreadCount} unread notifications`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </h1>

          <div className="flex items-center gap-3">
            {/* WebSocket connection status */}
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                connected
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-amber-50 text-amber-600'
              }`}
              title={connected ? 'Real-time notifications active' : 'Reconnecting...'}
            >
              {connected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {connected ? 'Live' : 'Reconnecting'}
            </span>

            {notifications.length > 0 && unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#0B4A3D] bg-[#E8F0EE] hover:bg-[#DCEAE5] px-4 h-[38px] rounded-[9px] transition-colors cursor-pointer select-none w-fit"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" />
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs — sticky page controls, pinned under the header */}
        <div data-erp-sticky-header className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg mb-5 select-none">
          {FILTERS.map((tab) => {
            const active = filter === tab.key;
            const count = tab.key === 'unread' ? unreadFilterCount : notifications.length;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 px-4 h-[34px] rounded-md text-[12.5px] font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-[#0B4A3D] text-white shadow-sm'
                    : 'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-white'
                }`}
              >
                {tab.label}
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="inline-block h-7 w-7 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
            <p className="mt-3 text-xs font-semibold text-slate-400">Loading notifications...</p>
          </div>
        )}

        {/* No notifications at all */}
        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-600 mb-1">You&apos;re all caught up</p>
            <p className="text-xs text-slate-400">No new notifications.</p>
          </div>
        )}

        {/* Filter emptied the list */}
        {showFilteredEmpty && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
              <Bell className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-600 mb-1">No unread notifications</p>
            <p className="text-xs text-slate-400">You&apos;ve read everything.</p>
          </div>
        )}

        {/* Notification cards */}
        {!loading && visibleItems.length > 0 && (
          <ul className="space-y-3">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <NotificationCard item={item} onOpen={openNotification} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

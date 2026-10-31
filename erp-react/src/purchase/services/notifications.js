/**
 * purchase/services/notifications.js
 * ------------------------------------------------------------------
 * Notification Rules → Alerts.
 *
 * The Settings → Notifications section defines rules (event, recipient
 * role, reminder/escalation timing, enabled). This service turns those
 * rules into real, actionable alerts by deriving the underlying pending
 * records from the live stores — a disabled rule produces no alert and
 * every count is the number of real records, never a hardcoded number.
 *
 * The pure `deriveAlerts(stores)` function is unit-tested; the async
 * `getAlerts()` fetches the live lists first.
 * ------------------------------------------------------------------ */
import { deriveWorkQueue } from './workQueue';

/* Rule events mapped to the work-queue categories that represent the
   same real pending work. Unmapped events get a dedicated derivation. */
const RULE_TO_CATEGORY = {
  'PR approval pending': 'pr-approvals',
  'PO approval pending': 'po-approvals',
  'Supplier acknowledgement pending': 'supplier-acknowledgements',
  'Delivery overdue': 'pending-grns',
  'Quality inspection pending': 'pending-inspections',
  'Invoice pending verification': 'invoice-approvals',
  'Payment overdue': 'payments-due'
};

/** Days ahead an RFQ due date may be and still count as "approaching". */
function dueSoonDays(rule) {
  const n = Number(rule?.reminderAfter);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/**
 * Derives alerts from the configured rules + real records.
 *
 * `queue` (optional) is an authoritative work-queue payload (the same
 * shape returned by getWorkQueue()). When supplied, the category-mapped
 * rule counts and items come straight from it — so an alert can never
 * disagree with the work-queue category it links to, and no duplicate
 * list fetch is needed to recompute them.
 */
export function deriveAlerts({ rules = [], stores = {}, queue = null } = {}) {
  const {
    requisitions = [], rfqs = [], orders = [], grns = [],
    inspections = [], invoices = []
  } = stores;

  const categories = queue?.categories?.length
    ? queue.categories
    : deriveWorkQueue({ requisitions, rfqs, orders, grns, inspections, invoices }).categories;
  const byKey = Object.fromEntries(categories.map((cat) => [cat.key, cat]));

  /* RFQs whose response deadline is coming up — not closed/cancelled. */
  const today = new Date().toISOString().slice(0, 10);
  const rfqDueSoon = rfqs.filter((rfq) => {
    if (!rfq?.dueDate || rfq.dueDate < today) return false;
    const closed = /closed|cancelled|awarded/i.test(String(rfq.status || ''));
    if (closed) return false;
    return true;
  });

  return rules
    .filter((rule) => rule?.enabled !== false && rule?.event)
    .map((rule) => {
      const categoryKey = RULE_TO_CATEGORY[rule.event];
      const category = categoryKey ? byKey[categoryKey] : null;
      let count = 0;
      let items = [];
      let anchor = categoryKey || '';
      if (category) {
        count = category.count;
        items = category.items.slice(0, 5).map((it) => ({
          number: it.number,
          title: it.title,
          vendor: it.vendor || '',
          status: it.status || '',
          route: it.route || ''
        }));
      } else if (rule.event === 'RFQ deadline approaching') {
        /* Due date window respects the rule's reminderAfter days. */
        const windowDays = dueSoonDays(rule);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + windowDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const due = rfqDueSoon.filter((rfq) => rfq.dueDate <= cutoffStr);
        count = due.length;
        items = due.slice(0, 5).map((rfq) => ({
          number: rfq.rfqNo || rfq.id,
          title: rfq.title || rfq.rfqNo || rfq.id,
          vendor: '',
          status: rfq.status || '',
          route: `/purchase/rfq/${rfq.id}`
        }));
        anchor = 'rfq';
      }

      return {
        ruleId: rule.id,
        event: rule.event,
        recipientRole: rule.recipientRole || '',
        reminderAfter: rule.reminderAfter,
        escalateAfter: rule.escalateAfter,
        repeatInterval: rule.repeatInterval || 'once',
        count,
        items,
        anchor
      };
    });
}

/**
 * Derives alerts from the configured rules and real records.
 *
 * Pass the already-fetched work queue (`getAlerts({ queue })`) whenever it
 * is available: every category-mapped rule then reads the backend's exact
 * count instead of re-deriving one from six heavyweight list requests.
 * The only record-level rule left is "RFQ deadline approaching", so the
 * raw lists are fetched only when that rule is actually configured.
 *
 * With no enabled rules there is nothing to report and nothing to fetch.
 */
export async function getAlerts({ queue = null } = {}) {
  const { readSettings } = await import('./settings');
  const rules = (readSettings()?.notificationRules || [])
    .filter((rule) => rule?.enabled !== false && rule?.event);
  if (rules.length === 0) return [];

  if (queue) {
    const needsRfqRecords = rules.some((rule) => rule.event === 'RFQ deadline approaching');
    const stores = needsRfqRecords ? { rfqs: await loadRfqList() } : {};
    return deriveAlerts({ rules, stores, queue });
  }

  return deriveAlerts({ rules, stores: await loadStores() });
}

/** RFQ list — the only records an unmapped rule needs. */
async function loadRfqList() {
  const { rfqService } = await import('./rfq');
  const result = await rfqService.getRfqs({ pageSize: 1000 });
  return result?.data || [];
}

async function loadStores() {
  const { requisitionService } = await import('./requisition');
  const { rfqService } = await import('./rfq');
  const { purchaseOrderService } = await import('./purchaseOrder');
  const { logisticsService } = await import('./logistics');
  const { invoiceService } = await import('./invoice');
  const [
    reqResult, rfqResult, poResult, grnResult, inspResult, invoiceResult
  ] = await Promise.all([
    requisitionService.getRequisitions({ pageSize: 1000 }),
    rfqService.getRfqs({ pageSize: 1000 }),
    purchaseOrderService.getOrders({ pageSize: 1000 }),
    logisticsService.getGrns({ pageSize: 1000 }),
    logisticsService.getInspections({ pageSize: 1000 }),
    invoiceService.getInvoices({ pageSize: 1000 })
  ]);
  return {
    requisitions: reqResult.data || [],
    rfqs: rfqResult.data || [],
    orders: poResult.data || [],
    grns: grnResult.data || [],
    inspections: inspResult.data || [],
    invoices: invoiceResult.data || []
  };
}
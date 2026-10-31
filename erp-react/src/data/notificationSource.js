/**
 * notificationSource.js
 * ------------------------------------------------------------------
 * FRONTEND-ONLY notification feed for the Notifications page.
 *
 * There is no backend notification system in this ERP. This module is the
 * single, clearly isolated place that feeds the Notifications UI, so it can
 * be swapped later for a real `GET /notifications` API without touching the
 * page itself.
 *
 * Today it derives real notification items from EXISTING ERP data only:
 * records currently awaiting approval across the approval-enabled modules
 * (CPR, Cost Workout, Profit Workout, Quotation, Sales Contract, Customer
 * Purchase Order, Credit Note), fetched through each module's existing list
 * endpoint. No new backend, database table, or API is created.
 *
 * Read/unread state is client-side (localStorage in the Notifications page).
 * ------------------------------------------------------------------
 */
import {
  Calculator,
  ClipboardList,
  FileMinus2,
  FileSignature,
  FileText,
  Megaphone,
  Package,
  TrendingUp
} from 'lucide-react';
import cprService from '../services/cprService';
import costWorkoutService from '../services/costWorkoutService';
import profitWorkoutService from '../services/profitWorkoutService';
import quotationService from '../services/quotationService';
import salesContractService from '../services/salesContractService';
import salesOrderService from '../services/salesOrderService';
import creditNoteService from '../services/creditNoteService';
import marketingService from '../services/marketingService';
import { cpoNo } from '../utils/salesHelpers';

/**
 * Best-effort extraction of the record array from any of the modules' list
 * response shapes (PageImpl `{ content }`, raw array, or ApiResponse wrapper).
 */
function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

/**
 * Module sources. Each entry knows how to fetch its pending-approval records
 * through the module's existing service, which field holds the document
 * number, how the document is labelled, and where it lives in the app.
 */
const NOTIFICATION_SOURCES = [
  {
    key: 'cpr',
    label: 'CPR',
    documentType: 'CPR',
    icon: ClipboardList,
    accent: { background: '#eff6ff', color: '#0B4A3D' },
    statuses: ['pending approval'],
    docNo: (doc) => doc.prNo || doc.cprNo || '',
    route: (doc) => `/cprs/${doc.id}`,
    fetch: (params, options) => cprService.listCprs(params, options)
  },
  {
    key: 'costWorkout',
    label: 'Cost Workout',
    documentType: 'Cost Workout',
    icon: Calculator,
    accent: { background: '#EFF6FF', color: '#2563EB' },
    statuses: ['submitted'],
    docNo: (doc) => doc.cwNo || '',
    route: (doc) => `/cost-workouts/${doc.id}`,
    fetch: (params, options) => costWorkoutService.listCws(params, options)
  },
  {
    key: 'profitWorkout',
    label: 'Profit Workout',
    documentType: 'Profit Workout',
    icon: TrendingUp,
    accent: { background: '#F0FDF4', color: '#16A34A' },
    statuses: ['submitted'],
    docNo: (doc) => doc.pwNo || '',
    route: (doc) => `/profit-workouts/${doc.id}`,
    fetch: (params, options) => profitWorkoutService.listPws(params, options)
  },
  {
    key: 'quotation',
    label: 'Quotation',
    documentType: 'Quotation',
    icon: FileText,
    accent: { background: '#FFFBEB', color: '#D97706' },
    statuses: ['pending approval'],
    docNo: (doc) => doc.quotationNo || '',
    route: (doc) => `/quotations/${doc.id}/view`,
    fetch: (params, options) => quotationService.list(params, options)
  },
  {
    key: 'salesContract',
    label: 'Sales Contract',
    documentType: 'Sales Contract',
    icon: FileSignature,
    accent: { background: '#EEF2FF', color: '#4F46E5' },
    statuses: ['submitted', 'under review'],
    docNo: (doc) => doc.scNo || '',
    route: (doc) => `/sales-contracts/${doc.id}`,
    fetch: (params, options) => salesContractService.list(params, options)
  },
  {
    key: 'salesOrder',
    label: 'Customer Purchase Order',
    documentType: 'Customer Purchase Order',
    icon: Package,
    accent: { background: '#F5F3FF', color: '#7C3AED' },
    statuses: ['pending review'],
    docNo: (doc) => cpoNo(doc.soNo || ''),
    route: (doc) => `/sales-orders/${doc.id}`,
    fetch: (params, options) => salesOrderService.list(params, options)
  },
  {
    key: 'creditNote',
    label: 'Credit Note',
    documentType: 'Credit Note',
    icon: FileMinus2,
    accent: { background: '#FEF2F2', color: '#DC2626' },
    statuses: ['pending approval'],
    docNo: (doc) => doc.cnNo || '',
    route: (doc) => `/credit-notes/${doc.id}`,
    fetch: (params, options) => creditNoteService.list(params, options)
  },
  {
    key: 'marketingHandover',
    label: 'Offline Marketing',
    documentType: 'Marketing Visit',
    title: 'Sales handover pending',
    icon: Megaphone,
    accent: { background: '#FFFBEB', color: '#D97706' },
    // The marketing module has no approval workflow; its notification is the
    // visit marked "Ready for Sales" that is awaiting handover into Sales.
    statuses: ['handover'],
    docNo: (doc) => doc.visitNo || '',
    clientName: (doc) => doc.companyName || doc.customerName || '',
    route: () => '/marketing',
    fetch: (params, options) => marketingService.list({ view: 'handover', size: 50 }, options)
  }
];

const NOTIFICATION_TITLE = 'New approval request';

/**
 * Fetches the current pending-approval records from every approval-enabled
 * module (best-effort — a failing module is skipped, never fatal) and maps
 * them into a uniform, UI-ready notification item.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array>} notifications sorted newest first.
 */
export async function fetchNotifications(options = {}) {
  const tasks = NOTIFICATION_SOURCES.flatMap((source) =>
    source.statuses.map((status) =>
      Promise.resolve()
        .then(() =>
          source
            .fetch({ status, size: 50 }, { signal: options.signal })
            .then((payload) => ({ source, payload }))
        )
        .catch(() => null)
    )
  );

  const results = (await Promise.all(tasks)).filter(Boolean);

  const notifications = results.flatMap(({ source, payload }) =>
    extractItems(payload)
      .map((raw) => {
        const number = String(source.docNo(raw) || '').trim();
        if (!number) return null;
        return {
          id: `${source.key}:${raw.id}`,
          key: source.key,
          title: source.title || NOTIFICATION_TITLE,
          documentType: source.documentType,
          documentNo: number,
          clientName: source.clientName ? source.clientName(raw) : raw.clientName || raw.customerName || raw.sourceLead || '',
          status: raw.status || raw.handoverStatus || 'pending approval',
          createdAt: raw.createdAt || raw.date || raw.updatedAt || '',
          link: source.route(raw),
          icon: source.icon,
          accent: source.accent
        };
      })
      .filter(Boolean)
  );

  return notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Human-friendly relative timestamp for the notification cards.
 * Uses the existing createdAt data — storage is never changed.
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) return '';
  const diffMs = Date.now() - time.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && sameDay(time, new Date())) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(time, yesterday)) return 'Yesterday';
  return time.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Client-side read/unread persistence (no backend). Keyed by notification id.
const READ_STORAGE_KEY = 'erp:notifications:read';

export function loadReadIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveReadIds(ids) {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Storage unavailable — read state simply stays in memory for the session.
  }
}

export const NOTIFICATION_SOURCES_CONFIG = NOTIFICATION_SOURCES;

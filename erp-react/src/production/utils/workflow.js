// ============================================================
// Production workflow helpers — shared across modules so the
// lifecycle stays consistent (Order → Shop Floor → Quality →
// Packing → Dispatch → Finished Goods).
// ============================================================
import { stageGroupOf } from '../data/orders';

/** Map a lifecycle group / department to its module route. */
export const MODULE_ROUTES = {
  Casting: '/production/casting',
  Fabrication: '/production/fabrication',
  'Machine Shop': '/production/machine-shop',
  Assembly: '/production/assembly',
  Quality: '/production/quality',
  Packing: '/production/packing',
  Dispatch: '/production/dispatch',
};

/** Route of the module currently working the order (null if none). */
export const moduleRouteForOrder = (order) =>
  MODULE_ROUTES[stageGroupOf(order?.currentStage)] || null;

/**
 * The single next lifecycle step for an order based on its status.
 * `transition` is the order status it moves to (null = open the
 * module without changing the order, e.g. waiting on QC/packing).
 */
export function workflowActionFor(order) {
  if (!order) return null;
  switch (order.status) {
    case 'Draft':
    case 'Pending Production Approval':
    case 'Production Approved':
    case 'Pending Admin Approval':
    case 'Admin Approved':
    case 'Approved':
      return null; // Approval workflow — handled by Draft List actions
    case 'Pending':
      return {
        label: 'Start Production',
        icon: 'play',
        tone: 'primary',
        transition: 'In Progress',
        nav: null,
        hint: 'Release this order to the shop floor.',
      };
    case 'In Progress':
      return {
        label: 'Send to Quality',
        icon: 'shield-check',
        tone: 'primary',
        transition: 'Pending QC',
        nav: '/production/quality',
        hint: 'Production is running — hand off for inspection.',
      };
    case 'Pending QC':
      return {
        label: 'Open Quality',
        icon: 'shield-check',
        tone: 'view',
        transition: null,
        nav: '/production/quality',
        hint: 'Awaiting the QC decision before packing.',
      };
    case 'Completed':
      return {
        label: 'Open Packing',
        icon: 'package',
        tone: 'view',
        transition: null,
        nav: '/production/packing',
        hint: 'QC passed — packing is the next stage.',
      };
    case 'Packed':
      return {
        label: 'Ready for Dispatch',
        icon: 'truck',
        tone: 'primary',
        transition: 'Ready for Dispatch',
        nav: '/production/dispatch',
        hint: 'Packing done — clear the order for shipping.',
      };
    case 'Ready for Dispatch':
      return {
        label: 'Open Dispatch',
        icon: 'truck',
        tone: 'view',
        transition: null,
        nav: '/production/dispatch',
        hint: 'Order cleared — complete the dispatch there.',
      };
    default:
      return null;
  }
}

/** Lifecycle stages shown in the order-detail workflow strip. */
export const WORKFLOW_STEPS = [
  { key: 'work-order', label: 'Work Order' },
  { key: 'shop-floor', label: 'Shop Floor' },
  { key: 'quality', label: 'Quality' },
  { key: 'packing', label: 'Packing' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'finished-goods', label: 'Finished Goods' },
];

/** Which lifecycle step an order status maps to (for highlighting). */
export const workflowStepForStatus = (status) => {
  switch (status) {
    case 'Draft':
    case 'Pending Production Approval':
    case 'Production Approved':
    case 'Pending Admin Approval':
    case 'Admin Approved':
    case 'Approved':
    case 'Pending':
      return 'work-order';
    case 'In Progress':
      return 'shop-floor';
    case 'Pending QC':
    case 'Completed':
      return 'quality';
    case 'Packed':
      return 'packing';
    case 'Ready for Dispatch':
      return 'dispatch';
    default:
      return 'work-order';
  }
};

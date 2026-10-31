import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Icon from '../components/icons/Icon';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useQuality } from '../context/QualityContext';
import { usePacking } from '../context/PackingContext';
import { useDispatch } from '../context/DispatchContext';

import { formatDate } from '../utils/format';
import { loadData } from '../utils/storage';
import { productionTypeOf, workflowForType, currentStageFor } from '../data/entries';
import { castingApi } from '../utils/api';
import { fabricationApi } from '../utils/api';
import { assemblyApi } from '../utils/api';
import { useAcknowledgement } from '../context/AcknowledgementContext';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { useDrawings } from '../context/DrawingsContext';
import { useModels } from '../context/ModelsContext';
import { useDashboardNav } from '../context/DashboardNavContext';
import {
  subscribeProductionDataChanged
} from '../utils/dataChanged';

/** Refresh-bus identity for this screen (it never writes). */
const DASHBOARD_VIEW = 'dashboard-view';
import './ProductionDashboard.css';

// ============================================================
// Production Dashboard — central monitoring & control view
//
// KPI → Flow → Progress → Workload → Pending → Alerts
// → Recent Orders → Active Orders → Performance
// ============================================================

const STATUS_COLORS = {
  Draft: '#6b7280',
  'Pending Production Approval': '#f59e0b',
  'Production Approved': '#3b82f6',
  'Pending Admin Approval': '#f59e0b',
  'Admin Approved': '#3b82f6',
  Approved: '#10b981',
  'In Progress': '#3b82f6',
  'Pending QC': '#f59e0b',
  Completed: '#10b981',
  Packed: '#10b981',
  'Ready for Dispatch': '#8b5cf6',
  Dispatched: '#10b981',
  Hold: '#6b7280',
  Cancelled: '#ef4444',
};

const PRIORITY_COLORS = {
  Low: '#6b7280',
  Medium: '#f59e0b',
  High: '#f97316',
  Urgent: '#ef4444',
};

export default function ProductionDashboard() {
  const navigate = useNavigate();
  const { navigateWith } = useDashboardNav();
  const { orders } = useProductionOrders();
  const { inspections } = useQuality();
  const { stats: packingStats } = usePacking();
  const { stats: dispatchStats } = useDispatch();
  const { getAcknowledgement } = useAcknowledgement();
  // Counts for the workflow strip. These three providers are already mounted
  // for every Production route, so their /stats figures are loaded anyway —
  // the strip only surfaces values the dashboard previously fetched and dropped.
  const { getTechnicalVerification, stats: tvStats } = useTechnicalVerification();
  const { stats: drawingsStats } = useDrawings();
  const { stats: modelsStats } = useModels();

  // ---- Load shop floor jobs from backend API ----
  const [shopData, setShopData] = useState({ casting: [], fabrication: [], assembly: [] });
  const [shopLoading, setShopLoading] = useState(true);

  const loadShopData = useCallback(async () => {
    try {
      const [castingRes, fabRes, asmRes] = await Promise.allSettled([
        castingApi.list({ size: 500 }),
        fabricationApi.list({ size: 500 }),
        assemblyApi.list({ size: 500 }),
      ]);
      setShopData({
        casting: castingRes.status === 'fulfilled' ? (castingRes.value?.data?.content || castingRes.value?.data || castingRes.value || []) : [],
        fabrication: fabRes.status === 'fulfilled' ? (fabRes.value?.data?.content || fabRes.value?.data || fabRes.value || []) : [],
        assembly: asmRes.status === 'fulfilled' ? (asmRes.value?.data?.content || asmRes.value?.data || asmRes.value || []) : [],
      });
    } catch (err) {
      console.error('Failed to load shop floor data:', err);
    } finally {
      setShopLoading(false);
    }
  }, []);

  useEffect(() => { loadShopData(); }, [loadShopData]);

  // Listen for external data changes (one refresh per burst).
  useEffect(
    () => subscribeProductionDataChanged(DASHBOARD_VIEW, () => loadShopData()),
    [loadShopData]
  );

  // ---- Navigation helper: set context state then navigate ----
  const goTo = useCallback((path, navState) => {
    if (navState) navigateWith(navState);
    navigate(path);
  }, [navigate, navigateWith]);

  // ================================================================
  // 1. KPI SUMMARY CARDS
  // ================================================================
  const kpis = useMemo(() => {
    const total = orders.length;
    const draft = orders.filter((o) => o.status === 'Draft').length;
    const pendingApproval = orders.filter(
      (o) => ['Pending Production Approval', 'Production Approved', 'Pending Admin Approval', 'Admin Approved'].includes(o.status)
    ).length;
    const approved = orders.filter((o) => o.status === 'Approved').length;
    const inProgress = orders.filter((o) => o.status === 'In Progress').length;
    const completed = orders.filter((o) => ['Completed', 'Packed', 'Ready for Dispatch', 'Dispatched'].includes(o.status)).length;
    const onHold = orders.filter((o) => o.status === 'Hold').length;
    const delayed = orders.filter((o) => {
      if (!o.dueDate || ['Completed', 'Packed', 'Dispatched', 'Cancelled'].includes(o.status)) return false;
      return new Date(o.dueDate) < new Date();
    }).length;
    const qcPending = orders.filter((o) => o.status === 'Pending QC').length;
    // Packing / Dispatch pending counts come from the DB-backed stats endpoints,
    // batched by scope: pending+in progress (packing) and draft+ready (dispatch).
    const packingPending = (packingStats?.pending ?? 0) + (packingStats?.inProgress ?? 0);
    const dispatchPending = (dispatchStats?.draft ?? 0) + (dispatchStats?.ready ?? 0);
    return { total, draft, pendingApproval, approved, inProgress, completed, onHold, delayed, qcPending, packingPending, dispatchPending };
  }, [orders, packingStats, dispatchStats]);

  // ================================================================
  // 2. PRODUCTION WORKFLOW — stage counts per module
  // ================================================================
  const workflow = useMemo(() => {
    const castingJobs = shopLoading ? [] : shopData.casting;
    const fabJobs = shopLoading ? [] : shopData.fabrication;
    const asmJobs = shopLoading ? [] : shopData.assembly;

    // Production Orders stage
    const po = {
      total: orders.length,
      draft: orders.filter((o) => o.status === 'Draft').length,
      approvalPending: orders.filter((o) => ['Pending Production Approval', 'Production Approved', 'Pending Admin Approval', 'Admin Approved'].includes(o.status)).length,
      approved: orders.filter((o) => o.status === 'Approved').length,
      inProgress: orders.filter((o) => o.status === 'In Progress').length,
      completed: orders.filter((o) => ['Completed', 'Packed', 'Ready for Dispatch', 'Dispatched'].includes(o.status)).length,
    };

    // Casting
    const casting = {
      total: castingJobs.length,
      pending: castingJobs.filter((j) => j.status === 'Pending').length,
      inProgress: castingJobs.filter((j) => j.status === 'In Progress').length,
      completed: castingJobs.filter((j) => j.status === 'Completed').length,
    };

    // Fabrication — stage breakdown
    const fabStageCounts = {};
    ['Raw Material', 'Cutting', 'Bending', 'Welding', 'Hard Facing'].forEach((stage) => {
      fabStageCounts[stage] = fabJobs.filter((j) => j.stage === stage && j.status === 'In Progress').length;
    });
    const fabrication = {
      total: fabJobs.length,
      pending: fabJobs.filter((j) => j.status === 'Pending').length,
      inProgress: fabJobs.filter((j) => j.status === 'In Progress').length,
      completed: fabJobs.filter((j) => j.status === 'Completed').length,
      stages: fabStageCounts,
    };

    // Assembly
    const assembly = {
      total: asmJobs.length,
      pending: asmJobs.filter((j) => j.status === 'Pending').length,
      inProgress: asmJobs.filter((j) => j.status === 'In Progress').length,
      completed: asmJobs.filter((j) => j.status === 'Completed').length,
    };

    // Quality
    const quality = {
      total: inspections.length,
      pending: inspections.filter((i) => i.status === 'Pending').length,
      inProgress: inspections.filter((i) => i.status === 'In Progress').length,
      passed: inspections.filter((i) => i.status === 'Passed').length,
      failed: inspections.filter((i) => i.status === 'Failed').length,
    };

    // Packing — counts from the DB-backed /packing/stats endpoint
    const packing = {
      total: packingStats?.total ?? 0,
      pending: packingStats?.pending ?? 0,
      inProgress: packingStats?.inProgress ?? 0,
      completed: packingStats?.completed ?? 0,
      readyForDispatch: packingStats?.readyForDispatch ?? 0,
    };

    // Dispatch — counts from the DB-backed /dispatch/stats endpoint
    const dispatch = {
      total: dispatchStats?.total ?? 0,
      draft: dispatchStats?.draft ?? 0,
      ready: dispatchStats?.ready ?? 0,
      dispatched: dispatchStats?.dispatched ?? 0,
      inTransit: dispatchStats?.inTransit ?? 0,
      delivered: dispatchStats?.delivered ?? 0,
    };

    return { po, casting, fabrication, assembly, quality, packing, dispatch };
  }, [orders, shopData, inspections, packingStats, dispatchStats]);

  // ================================================================
  // 3. PRODUCTION PROGRESS
  // ================================================================
  const progress = useMemo(() => {
    const total = orders.length;
    const started = orders.filter((o) => !['Draft', 'Pending Production Approval', 'Production Approved', 'Pending Admin Approval', 'Admin Approved'].includes(o.status)).length;
    const inProgress = orders.filter((o) => o.status === 'In Progress' || o.status === 'Pending QC').length;
    const completed = orders.filter((o) => ['Completed', 'Packed', 'Ready for Dispatch', 'Dispatched'].includes(o.status)).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const delayed = orders.filter((o) => {
      if (!o.dueDate || ['Completed', 'Packed', 'Dispatched', 'Cancelled'].includes(o.status)) return false;
      return new Date(o.dueDate) < new Date();
    }).length;
    return { total, started, inProgress, completed, percentage, delayed };
  }, [orders]);

  // ================================================================
  // 4. STAGE-WISE WORKLOAD
  // ================================================================
  const workload = useMemo(() => {
    const stageOf = (order) => {
      const ack = getAcknowledgement(order.workOrder);
      const tv = getTechnicalVerification(order.workOrder);
      return currentStageFor(order, loadData('entries', []), ack, tv);
    };

    const countByStage = (stageName) => {
      const relevant = orders.filter((o) => stageOf(o) === stageName);
      return {
        pending: relevant.filter((o) => ['Draft', 'Pending Production Approval', 'Production Approved', 'Pending Admin Approval', 'Admin Approved', 'Approved'].includes(o.status)).length,
        inProgress: relevant.filter((o) => o.status === 'In Progress').length,
        completed: relevant.filter((o) => ['Completed', 'Packed', 'Ready for Dispatch', 'Dispatched'].includes(o.status)).length,
      };
    };

    return [
      { stage: 'Production', ...countByStage('In Progress') },
      { stage: 'Casting', ...countByStage('Shell Preparation') },
      { stage: 'Fabrication', ...countByStage('Raw Material') },
      { stage: 'Assembly', ...countByStage('Assembly') },
      { stage: 'Quality', ...countByStage('Technical Verification') },
      { stage: 'Packing', ...countByStage('Packing') },
      { stage: 'Dispatch', ...countByStage('Dispatch') },
    ];
  }, [orders, getAcknowledgement, getTechnicalVerification]);

  // ================================================================
  // 5. PENDING ACTIONS
  // ================================================================
  const pendingActions = useMemo(() => {
    const actions = [];
    const prodApproval = orders.filter((o) => o.status === 'Draft' || o.status === 'Pending Production Approval').length;
    if (prodApproval > 0) actions.push({ label: 'Production Approval Pending', count: prodApproval, path: '/production/orders', nav: { tab: 'Production Approval' }, icon: 'clock' });
    const adminApproval = orders.filter((o) => o.status === 'Production Approved' || o.status === 'Pending Admin Approval').length;
    if (adminApproval > 0) actions.push({ label: 'Admin Approval Pending', count: adminApproval, path: '/production/orders', nav: { tab: 'Admin Approval' }, icon: 'clock' });
    const castingPend = (shopLoading ? [] : shopData.casting).filter((j) => j.status === 'Pending').length;
    if (castingPend > 0) actions.push({ label: 'Casting Pending', count: castingPend, path: '/production/casting', nav: null, icon: 'flame' });
    const fabPend = (shopLoading ? [] : shopData.fabrication).filter((j) => j.status === 'Pending').length;
    if (fabPend > 0) actions.push({ label: 'Fabrication Pending', count: fabPend, path: '/production/fabrication', nav: null, icon: 'layers' });
    const asmPend = (shopLoading ? [] : shopData.assembly).filter((j) => j.status === 'Pending').length;
    if (asmPend > 0) actions.push({ label: 'Assembly Pending', count: asmPend, path: '/production/assembly', nav: { status: 'Pending' }, icon: 'box' });
    const qcPend = inspections.filter((i) => i.status === 'Pending').length;
    if (qcPend > 0) actions.push({ label: 'QC Pending', count: qcPend, path: '/production/quality', nav: { status: 'Pending' }, icon: 'shield-check' });
    const qcFailed = inspections.filter((i) => i.status === 'Failed').length;
    if (qcFailed > 0) actions.push({ label: 'QC Failed', count: qcFailed, path: '/production/quality', nav: { status: 'Failed' }, icon: 'alert-triangle' });
    const packingPend = (packingStats?.pending ?? 0) + (packingStats?.inProgress ?? 0);
    if (packingPend > 0) actions.push({ label: 'Packing Pending', count: packingPend, path: '/production/packing', nav: { status: 'Pending' }, icon: 'package' });
    const readyDispatch = dispatchStats?.ready ?? 0;
    if (readyDispatch > 0) actions.push({ label: 'Ready for Dispatch', count: readyDispatch, path: '/production/dispatch', nav: { status: 'Ready' }, icon: 'truck' });
    const dispatchPend = dispatchStats?.draft ?? 0;
    if (dispatchPend > 0) actions.push({ label: 'Dispatch Pending', count: dispatchPend, path: '/production/dispatch', nav: { status: 'Draft' }, icon: 'file-text' });
    return actions;
  }, [orders, shopData, inspections, packingStats, dispatchStats]);

  // ================================================================
  // 6. ALERTS / ATTENTION REQUIRED
  // ================================================================
  const alerts = useMemo(() => {
    const list = [];
    // Delayed orders
    const delayedOrders = orders.filter((o) => {
      if (!o.dueDate || ['Completed', 'Packed', 'Dispatched', 'Cancelled'].includes(o.status)) return false;
      return new Date(o.dueDate) < new Date();
    });
    if (delayedOrders.length > 0) {
      list.push({ type: 'error', icon: 'alert-triangle', text: `${delayedOrders.length} order${delayedOrders.length > 1 ? 's' : ''} overdue — past due date`, path: '/production/orders', nav: { tab: 'All' } });
    }
    // QC Failed
    const rejected = inspections.filter((i) => i.status === 'Failed');
    if (rejected.length > 0) {
      list.push({ type: 'error', icon: 'x-circle', text: `${rejected.length} QC inspection${rejected.length > 1 ? 's' : ''} failed`, path: '/production/quality', nav: { status: 'Failed' } });
    }
    // Orders stuck (Draft for more than 7 days)
    const stuckOrders = orders.filter((o) => {
      if (o.status !== 'Draft') return false;
      const created = new Date(o.createdAt || o.startDate || '');
      const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 7;
    });
    if (stuckOrders.length > 0) {
      list.push({ type: 'warning', icon: 'clock', text: `${stuckOrders.length} order${stuckOrders.length > 1 ? 's' : ''} stuck in Draft for 7+ days`, path: '/production/orders', nav: { tab: 'Draft' } });
    }
    // Ready for dispatch but not shipped
    const readyNotDispatched = dispatchStats?.ready ?? 0;
    if (readyNotDispatched > 0) {
      list.push({ type: 'warning', icon: 'truck', text: `${readyNotDispatched} dispatch${readyNotDispatched > 1 ? 'es' : ''} ready but not shipped`, path: '/production/dispatch', nav: { status: 'Ready' } });
    }
    return list;
  }, [orders, inspections, dispatchStats]);

  // ================================================================
  // 7. RECENT PRODUCTION ORDERS
  // ================================================================
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (b.createdAt || b.startDate || '').localeCompare(a.createdAt || a.startDate || ''))
      .slice(0, 8);
  }, [orders]);

  // ================================================================
  // 8. ACTIVE WORK ORDERS
  // ================================================================
  const activeOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'In Progress' || o.status === 'Pending QC')
      .map((o) => {
        const stage = currentStageFor(o, loadData('entries', []), getAcknowledgement(o.workOrder), getTechnicalVerification(o.workOrder));
        return { ...o, currentStage: stage };
      })
      .slice(0, 6);
  }, [orders, getAcknowledgement, getTechnicalVerification]);

  // ================================================================
  // 9. PERFORMANCE SUMMARY
  // ================================================================
  const performance = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter((o) => ['Completed', 'Packed', 'Ready for Dispatch', 'Dispatched'].includes(o.status)).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const qcPassed = inspections.filter((i) => i.status === 'Passed').length;
    const qcTotal = inspections.length;
    const qcPassRate = qcTotal > 0 ? Math.round((qcPassed / qcTotal) * 100) : 0;
    const dispatched = dispatchStats?.delivered ?? 0;
    const dispatchTotal = dispatchStats?.total ?? 0;
    const dispatchRate = dispatchTotal > 0 ? Math.round((dispatched / dispatchTotal) * 100) : 0;
    return { total, completed, completionRate, qcTotal, qcPassed, qcPassRate, dispatchTotal, dispatched, dispatchRate };
  }, [orders, inspections, dispatchStats]);

  // ================================================================
  // 2b. WORKFLOW STRIP — one compact card per Production stage
  //
  // Purely presentational: every row reuses a count already computed
  // above (kpis / workflow / the mounted contexts' stats) and keeps the
  // destination the previous vertical layout used.
  // ================================================================
  const flowStages = [
    {
      key: 'dashboard', title: 'Production Dashboard', icon: 'dashboard',
      onClick: () => goTo('/production'),
      rows: [
        ['Work Orders', kpis.total, () => goTo('/production/orders')],
        ['In Progress', kpis.inProgress, () => goTo('/production/orders')],
        ['Completed', kpis.completed, () => goTo('/production/orders')],
        ['Delayed', kpis.delayed, () => goTo('/production/orders')],
      ],
    },
    {
      key: 'orders', title: 'Production Work Orders', icon: 'clipboard',
      onClick: () => goTo('/production/orders'),
      rows: [
        ['Total', workflow.po.total, () => goTo('/production/orders', { tab: 'All' })],
        ['Draft', workflow.po.draft, () => goTo('/production/orders', { tab: 'Draft' })],
        ['Approval Pending', workflow.po.approvalPending, () => goTo('/production/orders', { tab: 'Production Approval' })],
        ['Approved', workflow.po.approved, () => goTo('/production/orders', { tab: 'Approved' })],
        ['In Progress', workflow.po.inProgress, () => goTo('/production/orders')],
        ['Completed', workflow.po.completed, () => goTo('/production/orders')],
      ],
    },
    {
      key: 'tv', title: 'Technical Verification', icon: 'shield-check',
      onClick: () => goTo('/production/technical-verification'),
      rows: [
        ['Total', tvStats?.total ?? 0, () => goTo('/production/technical-verification')],
        ['Pending', tvStats?.pending ?? 0, () => goTo('/production/technical-verification')],
        ['Verified', tvStats?.verified ?? 0, () => goTo('/production/technical-verification')],
        ['Rejected', tvStats?.rejected ?? 0, () => goTo('/production/technical-verification')],
      ],
    },
    {
      key: 'drawings', title: 'Drawings', icon: 'file-text',
      onClick: () => goTo('/production/drawings'),
      rows: [
        ['Total', drawingsStats?.total ?? 0, () => goTo('/production/drawings')],
        ['Pending', drawingsStats?.pending ?? 0, () => goTo('/production/drawings')],
        ['Verified', drawingsStats?.verified ?? 0, () => goTo('/production/drawings')],
        ['Rejected', drawingsStats?.rejected ?? 0, () => goTo('/production/drawings')],
      ],
    },
    {
      key: 'models', title: 'Models', icon: 'box',
      onClick: () => goTo('/production/models'),
      rows: [
        ['Total', modelsStats?.total ?? 0, () => goTo('/production/models')],
        ['Pending', modelsStats?.pending ?? 0, () => goTo('/production/models')],
        ['Verified', modelsStats?.verified ?? 0, () => goTo('/production/models')],
        ['Rejected', modelsStats?.rejected ?? 0, () => goTo('/production/models')],
      ],
    },
    {
      key: 'casting', title: 'Casting', icon: 'flame',
      onClick: () => goTo('/production/casting'),
      rows: [
        ['Total Jobs', workflow.casting.total, () => goTo('/production/casting')],
        ['Pending', workflow.casting.pending, () => goTo('/production/casting')],
        ['In Progress', workflow.casting.inProgress, () => goTo('/production/casting')],
        ['Completed', workflow.casting.completed, () => goTo('/production/casting')],
      ],
    },
    {
      key: 'fabrication', title: 'Fabrication', icon: 'layers',
      onClick: () => goTo('/production/fabrication'),
      rows: [
        ['Total Jobs', workflow.fabrication.total, () => goTo('/production/fabrication')],
        ['Pending', workflow.fabrication.pending, () => goTo('/production/fabrication')],
        ['In Progress', workflow.fabrication.inProgress, () => goTo('/production/fabrication')],
        ['Completed', workflow.fabrication.completed, () => goTo('/production/fabrication')],
      ],
      // Stage breakdown kept from the previous layout — it is the only place
      // these per-stage in-progress counts are surfaced. Rendered by
      // flowSubStages below the strip so it cannot stretch the workflow cards.
      subRows: Object.entries(workflow.fabrication.stages).map(([stage, count]) => [
        stage, count, () => goTo('/production/fabrication', { stage }),
      ]),
    },
    {
      key: 'assembly', title: 'Assembly', icon: 'hammer',
      onClick: () => goTo('/production/assembly'),
      rows: [
        ['Pending', workflow.assembly.pending, () => goTo('/production/assembly', { status: 'Pending' })],
        ['In Progress', workflow.assembly.inProgress, () => goTo('/production/assembly', { status: 'In Progress' })],
        ['Completed', workflow.assembly.completed, () => goTo('/production/assembly', { status: 'Completed' })],
      ],
    },
    {
      key: 'quality', title: 'Quality / QC', icon: 'clipboard-check',
      onClick: () => goTo('/production/quality'),
      rows: [
        ['Total', workflow.quality.total, () => goTo('/production/quality')],
        ['Pending', workflow.quality.pending, () => goTo('/production/quality', { status: 'Pending' })],
        ['In Progress', workflow.quality.inProgress, () => goTo('/production/quality', { status: 'In Progress' })],
        ['Passed', workflow.quality.passed, () => goTo('/production/quality', { status: 'Passed' })],
        ['Failed', workflow.quality.failed, () => goTo('/production/quality', { status: 'Failed' })],
      ],
    },
    {
      key: 'packing', title: 'Packing', icon: 'package',
      onClick: () => goTo('/production/packing'),
      rows: [
        ['Total', workflow.packing.total, () => goTo('/production/packing')],
        ['Pending', workflow.packing.pending, () => goTo('/production/packing', { status: 'Pending' })],
        ['In Progress', workflow.packing.inProgress, () => goTo('/production/packing', { status: 'In Progress' })],
        ['Completed', workflow.packing.completed, () => goTo('/production/packing', { status: 'Completed' })],
        ['Ready for Dispatch', workflow.packing.readyForDispatch, () => goTo('/production/packing', { status: 'Ready for Dispatch' })],
      ],
    },
    {
      key: 'dispatch', title: 'Dispatch', icon: 'truck',
      onClick: () => goTo('/production/dispatch'),
      rows: [
        ['Total', workflow.dispatch.total, () => goTo('/production/dispatch')],
        ['Draft', workflow.dispatch.draft, () => goTo('/production/dispatch', { status: 'Draft' })],
        ['Ready', workflow.dispatch.ready, () => goTo('/production/dispatch', { status: 'Ready' })],
        ['Dispatched', workflow.dispatch.dispatched, () => goTo('/production/dispatch', { status: 'Dispatched' })],
        ['In Transit', workflow.dispatch.inTransit, () => goTo('/production/dispatch', { status: 'In Transit' })],
        ['Delivered', workflow.dispatch.delivered, () => goTo('/production/dispatch', { status: 'Delivered' })],
      ],
    },
  ];

  // Stages that carry a per-stage breakdown get it rendered once, under the
  // workflow strip, so every card keeps the same compact row count.
  const flowSubStages = flowStages.filter((stage) => stage.subRows);

  return (
    <div className="page dash">
      <PageHeader
        title="Production Dashboard"
        subtitle="Overall production monitoring and workflow status"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/production/orders')}>
            <Icon name="plus" size={15} /> Create Work Order
          </button>
        }
      />

      {/* ================================================================ */}
      {/* 1. KPI SUMMARY CARDS                                            */}
      {/* ================================================================ */}
      <div className="dash-kpi-grid">
        {[
          { num: kpis.total, label: 'Total Orders', icon: 'clipboard', tone: 'neutral', kpiKey: 'total' },
          { num: kpis.draft, label: 'Draft', icon: 'file-text', tone: 'gray', kpiKey: 'draft' },
          { num: kpis.pendingApproval, label: 'Pending Approval', icon: 'clock', tone: 'amber', kpiKey: 'pendingApproval' },
          { num: kpis.approved, label: 'Approved', icon: 'check-circle', tone: 'blue', kpiKey: 'approved' },
          { num: kpis.inProgress, label: 'In Progress', icon: 'play', tone: 'blue', kpiKey: 'inProgress' },
          { num: kpis.completed, label: 'Completed', icon: 'check', tone: 'green', kpiKey: 'completed' },
          { num: kpis.onHold, label: 'On Hold', icon: 'pause', tone: 'gray', kpiKey: 'onHold' },
          { num: kpis.delayed, label: 'Delayed', icon: 'alert-triangle', tone: 'red', kpiKey: 'delayed' },
          { num: kpis.qcPending, label: 'QC Pending', icon: 'shield-check', tone: 'amber', kpiKey: 'qcPending' },
          { num: kpis.packingPending, label: 'Packing Pending', icon: 'package', tone: 'teal', kpiKey: 'packingPending' },
          { num: kpis.dispatchPending, label: 'Dispatch Pending', icon: 'truck', tone: 'purple', kpiKey: 'dispatchPending' },
        ].map((kpi) => (
          <button key={kpi.label} type="button" className="dash-kpi" onClick={() => window.open(`/production/kpi/dashboard/${kpi.kpiKey}`, '_blank')} title={`View ${kpi.label} details (opens in new tab)`}>
            <span className={`dash-kpi-icon dash-kpi-icon--${kpi.tone}`}><Icon name={kpi.icon} size={18} /></span>
            <div className="dash-kpi-body">
              <div className="dash-kpi-num">{kpi.num}</div>
              <div className="dash-kpi-label">{kpi.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* 2. COMPLETE PRODUCTION FLOW                                     */}
      {/* ================================================================ */}
      <section className="dash-card dash-card--full">
        <h3 className="dash-card-title">Complete Production Flow</h3>
        <div className="dash-flow-track">
          {flowStages.map((stage, index) => (
            <React.Fragment key={stage.key}>
              {index > 0 && (
                <span className="dash-flow-arrow" aria-hidden="true">
                  <Icon name="arrow-right" size={15} />
                </span>
              )}
              <div className="dash-flow-card">
                <button
                  type="button"
                  className="dash-flow-card-head"
                  onClick={stage.onClick}
                  title={`Open ${stage.title}`}
                >
                  <Icon name={stage.icon} size={14} />
                  <span>{stage.title}</span>
                </button>
                <div className="dash-flow-card-body">
                  {stage.rows.map(([label, value, onClick]) => (
                    <button key={label} type="button" className="dash-flow-row" onClick={onClick}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
        {flowSubStages.map((stage) => (
          <div className="dash-flow-subline" key={`${stage.key}-stages`}>
            <span className="dash-flow-subline-label">{stage.title} stages</span>
            {stage.subRows.map(([label, value, onClick]) => (
              <button key={label} type="button" className="dash-flow-chip" onClick={onClick} title={`Open ${stage.title} — ${label}`}>
                {label}
                <strong>{value}</strong>
              </button>
            ))}
          </div>
        ))}
      </section>

      <div className="dash-two-col">
        {/* ================================================================ */}
        {/* 3. PRODUCTION PROGRESS                                          */}
        {/* ================================================================ */}
        <section className="dash-card">
          <h3 className="dash-card-title">Production Progress</h3>
          <div className="dash-progress">
            <div className="dash-progress-bar-wrap">
              <div className="dash-progress-bar" style={{ width: `${progress.percentage}%` }} />
            </div>
            <span className="dash-progress-pct">{progress.percentage}%</span>
          </div>
          <div className="dash-progress-stats">
            <div className="dash-progress-stat">
              <span className="dash-progress-stat-num">{progress.total}</span>
              <span className="dash-progress-stat-label">Total</span>
            </div>
            <div className="dash-progress-stat">
              <span className="dash-progress-stat-num dash-progress-stat-num--blue">{progress.started}</span>
              <span className="dash-progress-stat-label">Started</span>
            </div>
            <div className="dash-progress-stat">
              <span className="dash-progress-stat-num dash-progress-stat-num--blue">{progress.inProgress}</span>
              <span className="dash-progress-stat-label">In Progress</span>
            </div>
            <div className="dash-progress-stat">
              <span className="dash-progress-stat-num dash-progress-stat-num--green">{progress.completed}</span>
              <span className="dash-progress-stat-label">Completed</span>
            </div>
            <div className="dash-progress-stat">
              <span className="dash-progress-stat-num dash-progress-stat-num--red">{progress.delayed}</span>
              <span className="dash-progress-stat-label">Delayed</span>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 4. STAGE-WISE WORKLOAD                                          */}
        {/* ================================================================ */}
        <section className="dash-card">
          <h3 className="dash-card-title">Stage-wise Workload</h3>
          <div className="dash-table-wrap">
            <table className="dash-table dash-table--compact sgrid sgrid-prod">
              <thead>
                <tr>
                  <th className="sgrid-pin sgrid-first">Stage</th>
                  <th>Pending</th>
                  <th>In Progress</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((row) => (
                  <tr key={row.stage}>
                    <td className="dash-td-bold sgrid-pin sgrid-first">{row.stage}</td>
                    <td>{row.pending}</td>
                    <td>{row.inProgress}</td>
                    <td>{row.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="dash-two-col">
        {/* ================================================================ */}
        {/* 5. PENDING ACTIONS                                              */}
        {/* ================================================================ */}
        <section className="dash-card">
          <h3 className="dash-card-title">Pending Actions</h3>
          {pendingActions.length > 0 ? (
            <div className="dash-actions-list">
              {pendingActions.map((action) => (
                <button key={action.label} type="button" className="dash-action-item" onClick={() => goTo(action.path, action.nav)}>
                  <Icon name={action.icon} size={16} />
                  <span className="dash-action-label">{action.label}</span>
                  <span className="dash-action-count">{action.count}</span>
                  <Icon name="chevron-right" size={14} className="dash-action-arrow" />
                </button>
              ))}
            </div>
          ) : (
            <div className="dash-empty"><Icon name="check-circle" size={20} /><span>No pending actions</span></div>
          )}
        </section>

        {/* ================================================================ */}
        {/* 6. ATTENTION REQUIRED                                           */}
        {/* ================================================================ */}
        <section className="dash-card">
          <h3 className="dash-card-title">Attention Required</h3>
          {alerts.length > 0 ? (
            <div className="dash-alerts-list">
              {alerts.map((alert, idx) => (
                <button key={idx} type="button" className={`dash-alert-item dash-alert-item--${alert.type}`} onClick={() => goTo(alert.path, alert.nav)}>
                  <Icon name={alert.icon} size={16} />
                  <span>{alert.text}</span>
                  <Icon name="chevron-right" size={14} className="dash-action-arrow" />
                </button>
              ))}
            </div>
          ) : (
            <div className="dash-empty dash-empty--green"><Icon name="check-circle" size={20} /><span>All clear — no alerts</span></div>
          )}
        </section>
      </div>

      {/* ================================================================ */}
      {/* 7. RECENT PRODUCTION ORDERS                                     */}
      {/* ================================================================ */}
      <section className="dash-card dash-card--full">
        <h3 className="dash-card-title">Recent Production Work Orders</h3>
        {recentOrders.length > 0 ? (
          <div className="dash-table-wrap">
            <table className="dash-table sgrid sgrid-prod">
              <thead>
                <tr>
                  <th className="sgrid-pin sgrid-first">Work Order</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created Date</th>
                  <th>Expected Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="sgrid-pin sgrid-first">
                      <button type="button" className="dash-wo-link" onClick={() => navigate(`/production/orders/${order.id}`)}>
                        {order.workOrder}
                      </button>
                    </td>
                    <td className="dash-td-muted">{order.customer || '—'}</td>
                    <td>{order.product || '—'}</td>
                    <td>{order.quantity || '—'}</td>
                    <td>
                      <span className="dash-status-badge" style={{ background: STATUS_COLORS[order.status] || '#6b7280' }}>
                        {order.status}
                      </span>
                    </td>
                    <td>
                      {order.priority && (
                        <span className="dash-priority-badge" style={{ color: PRIORITY_COLORS[order.priority] || '#6b7280' }}>
                          {order.priority}
                        </span>
                      )}
                    </td>
                    <td className="dash-td-muted">{formatDate(order.startDate || order.createdAt)}</td>
                    <td className="dash-td-muted">{formatDate(order.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dash-empty"><Icon name="clipboard" size={20} /><span>No production orders yet</span></div>
        )}
      </section>

      <div className="dash-two-col">
        {/* ================================================================ */}
        {/* 8. ACTIVE WORK ORDERS                                           */}
        {/* ================================================================ */}
        <section className="dash-card">
          <h3 className="dash-card-title">Active Work Orders</h3>
          {activeOrders.length > 0 ? (
            <div className="dash-active-list">
              {activeOrders.map((order) => (
                <div key={order.id} className="dash-active-item">
                  <div className="dash-active-top">
                    <button type="button" className="dash-wo-link" onClick={() => navigate(`/production/orders/${order.id}`)}>{order.workOrder}</button>
                    <span className="dash-status-badge" style={{ background: STATUS_COLORS[order.status] || '#3b82f6' }}>{order.status}</span>
                  </div>
                  <div className="dash-active-meta">
                    <span>{order.product || '—'}</span>
                    <span className="dash-td-muted">·</span>
                    {order.currentStage ? (
                      <button type="button" className="dash-stage-link" onClick={() => {
                        const stage = order.currentStage;
                        const fabStages = ['Raw Material', 'Cutting', 'Bending', 'Welding', 'Hard Facing'];
                        if (fabStages.includes(stage)) goTo('/production/fabrication', { stage });
                        else if (['Shell Preparation', 'Pouring', 'Blasting', 'Assembly'].includes(stage)) goTo('/production/casting');
                        else if (['QC', 'Quality'].includes(stage)) goTo('/production/quality', { status: 'Pending' });
                        else if (stage === 'Packing') goTo('/production/packing', { status: 'In Progress' });
                        else if (stage === 'Dispatch') goTo('/production/dispatch', { status: 'Draft' });
                        else goTo('/production/orders');
                      }}>{order.currentStage}</button>
                    ) : (
                      <span className="dash-td-muted">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-empty"><Icon name="play" size={20} /><span>No active work orders</span></div>
          )}
        </section>

        {/* ================================================================ */}
        {/* 9. PRODUCTION PERFORMANCE                                       */}
        {/* ================================================================ */}
        <section className="dash-card">
          <h3 className="dash-card-title">Production Performance</h3>
          <div className="dash-perf-grid">
            <div className="dash-perf-item">
              <span className="dash-perf-num">{performance.completionRate}%</span>
              <span className="dash-perf-label">Completion Rate</span>
              <div className="dash-perf-bar-wrap">
                <div className="dash-perf-bar dash-perf-bar--green" style={{ width: `${performance.completionRate}%` }} />
              </div>
            </div>
            <div className="dash-perf-item">
              <span className="dash-perf-num">{performance.qcPassRate}%</span>
              <span className="dash-perf-label">QC Pass Rate</span>
              <div className="dash-perf-bar-wrap">
                <div className="dash-perf-bar dash-perf-bar--blue" style={{ width: `${performance.qcPassRate}%` }} />
              </div>
            </div>
            <div className="dash-perf-item">
              <span className="dash-perf-num">{performance.dispatchRate}%</span>
              <span className="dash-perf-label">Dispatch Completion</span>
              <div className="dash-perf-bar-wrap">
                <div className="dash-perf-bar dash-perf-bar--purple" style={{ width: `${performance.dispatchRate}%` }} />
              </div>
            </div>
          </div>
          <div className="dash-perf-summary">
            <div className="dash-perf-stat">
              <span className="dash-perf-stat-num">{performance.completed}</span>
              <span className="dash-perf-stat-label">Orders Completed</span>
            </div>
            <div className="dash-perf-stat">
              <span className="dash-perf-stat-num">{performance.qcPassed}/{performance.qcTotal}</span>
              <span className="dash-perf-stat-label">QC Passed</span>
            </div>
            <div className="dash-perf-stat">
              <span className="dash-perf-stat-num">{performance.dispatched}/{performance.dispatchTotal}</span>
              <span className="dash-perf-stat-label">Delivered</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

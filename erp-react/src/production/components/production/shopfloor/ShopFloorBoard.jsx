import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../PageHeader';
import PdfPrintButtons from '../../PdfPrintButtons';
import Icon from '../../icons/Icon';
import Modal from '../Modal';
import ProductionTableToolbar from '../ProductionTableToolbar';
import ProductionBulkActionBar from '../ProductionBulkActionBar';
import ShopFloorSummaryCards from './ShopFloorSummaryCards';
import ShopFloorWorkflow from './ShopFloorWorkflow';
import ShopFloorFilters from './ShopFloorFilters';
import ShopFloorOrderTable from './ShopFloorOrderTable';
import ShopFloorRowActions from './ShopFloorRowActions';
import SettingsFormModal from '../settings/SettingsFormModal';
import { useShopFloorJobs, filterShopFloorJobs, SHOP_FLOOR_STATUSES } from './useShopFloorJobs';
import useProductionAccess from '../../../access/useProductionAccess';
import { settingsService } from '../../../services/production';
import { useProductionOrders } from '../../../context/ProductionOrdersContext';
import { useAcknowledgement } from '../../../context/AcknowledgementContext';
import { useTechnicalVerification } from '../../../context/TechnicalVerificationContext';
import { productionTypeOf, workflowForType, ENTRY_MODULE_TYPES } from '../../../data/entries';
import { cpoDisplay } from '../../../utils/cpoRef';
import { useToast } from '../../../../components/Common';
import { useNavigate, useParams } from 'react-router-dom';

import './ShopFloorTable.css';

/* Shop floor boards that render the Stage field in its own bordered section
   ("… Stage") and offer the row-level Edit action plus inline Stage editing.
   All other boards keep their original plain Stage field and read-only cell.
   The board's type is `productionType` on type-scoped boards (Casting,
   Fabrication) and `stageFilter` on section boards (Assembly) — both are
   covered, so a section board gets exactly the same treatment. */
const stageBoxTypes = ['Casting', 'Fabrication', 'Assembly'];
const stageOwnerType = (productionType, stageFilter) => productionType || stageFilter || '';

/**
 * Composer for a shop floor page (Casting, Fabrication, Machine
 * Shop, Assembly). Owns the job state and the search/filter state;
 * renders summary cards, an optional process workflow, the filter
 * toolbar, the job table and full user-entry CRUD (create/edit/
 * delete via modal forms).
 *
 * Jobs are user-entered only — records are persisted to localStorage
 * under `storageKey` and restored on reload.
 */
export default function ShopFloorBoard({
  title,
  subtitle,
  jobs: initialJobs,
  workflow,
  workflowTitle = 'Shop Floor Workflow',
  columns,
  searchFields,
  filterFields = [],
  searchPlaceholder = 'Search by production order, work order, item name or operator...',
  tableTitle = 'Jobs',
  stage,
  storageKey,
  idPrefix = 'JOB',
  createLabel = 'Create Job',
  extraFields = [],
  dropdownStageOptions,
  hideStage,
  stageTabs,
  statusTabs,
  productionType,
  stageFilter,
  /* Downstream sections that consume ANY Work Order (Assembly, Quality,
     Packing, Dispatch): the row scope is the whole Production Order table
     instead of the orders of one production type. Each row still aggregates
     only the jobs/entries that belong to THIS section's production type. */
  allWorkOrders = false,
  moduleName,
  onWorkOrderClick,
  onJobChange,
  /* Optional dedicated create/edit-route wiring (used by Casting):
     - `createPath` : create buttons navigate here instead of opening the
       in-board modal form (the list page keeps its normal layout).
     - `createPage` : this instance IS the create route — render only the
       create form, in-flow, as a full page (no board chrome).
     - `editPage` : this instance IS the edit route (`<board>/:id/edit`) —
       render only the edit form, in-flow, as a full page. Used by ⋮ → Edit.
     - `createBackPath` : the board's own path — where the create/edit page
       returns on Cancel/Save, and the base for the edit route.
     - `initialWorkOrder` : pre-select a Work Order when deep-linked. */
  createPath,
  createPage = false,
  editPage = false,
  createBackPath = '/production',
  initialWorkOrder = '',
}) {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const toast = useToast();
  const { orders, deleteOrder } = useProductionOrders();
  const { getAcknowledgement } = useAcknowledgement();
  const { getTechnicalVerification } = useTechnicalVerification();

  /* Production Access Management — this board's own switches. Presentation
     only: every API behind the board is enforced server-side. */
  const { can: canProduction } = useProductionAccess();

  // ---- Production Parameters (Settings → Production Parameters) ----
  // Two of them drive the board directly: the default status of a new job and
  // whether a running job may be put on hold for QC. Both are read from the
  // saved parameter set; when it cannot be read the board keeps the workflow's
  // built-in behaviour (status 'Pending', hold allowed) rather than blocking
  // shop floor work.
  const [productionParameters, setProductionParameters] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await settingsService.loadParameters();
        if (!cancelled) setProductionParameters(response.data || {});
      } catch {
        if (!cancelled) setProductionParameters(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const jobDefaultStatus = SHOP_FLOOR_STATUSES.includes(productionParameters?.defaultProductionStatus)
    ? productionParameters.defaultProductionStatus
    : 'Pending';
  const qualityHoldEnabled = productionParameters?.enableQualityHold !== false;
  const {
    jobs: rawJobs,
    loading: jobsLoading,
    startJob,
    holdJob,
    resumeJob,
    completeJob,
    skipJob,
    addJob,
    updateJob,
    changeJobStage,
    deleteJob,
    refresh: refreshJobs,
  } = useShopFloorJobs(productionType, storageKey);

  // Merge any initially-provided jobs with backend-loaded jobs
  const jobs = useMemo(() => {
    const backendIds = new Set(rawJobs.map((j) => j.id));
    const extra = (initialJobs || []).filter((j) => !backendIds.has(j.id));
    return [...rawJobs, ...extra];
  }, [rawJobs, initialJobs]);

  const [query, setQuery] = useState('');
  const [showFiltersOpen, setShowFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(() =>
    Object.fromEntries(filterFields.map((field) => [field.key, 'All']))
  );
  const [activeStageTab, setActiveStageTab] = useState(() => stageTabs?.[0] || 'All Stages');
  const [activeStatusTab, setActiveStatusTab] = useState(() => statusTabs?.[0] || 'All');
  /* Both dedicated routes render the same form as a full-size page. The edit
     route reads its record from the URL, so a reload or a deep link reopens
     that exact job instead of losing it with the board's row-click state. */
  const isPage = createPage || editPage;
  const routedJob = editPage
    ? jobs.find((job) => String(job.id) === String(editId)) || null
    : null;
  const [localFormState, setFormState] = useState(() => (
    createPage
      ? { mode: 'create', job: initialWorkOrder ? { productionOrder: initialWorkOrder } : {} }
      : null
  ));
  const formState = editPage
    ? routedJob
      ? { mode: 'edit', job: routedJob }
      : null
    : localFormState;

  /* A stale / unknown edit link returns to the board rather than rendering an
     empty form — but only once a load has actually FINISHED. `useShopFloorJobs`
     starts at `loading: false` with an empty list, so gating on `!jobsLoading`
     alone bounced the URL back to the board before the first fetch resolved. */
  const jobsLoadState = useRef('idle'); // idle → loading → done
  useEffect(() => {
    if (jobsLoading) jobsLoadState.current = 'loading';
    else if (jobsLoadState.current === 'loading') jobsLoadState.current = 'done';
  }, [jobsLoading]);
  useEffect(() => {
    if (!editPage || jobsLoadState.current !== 'done' || routedJob) return;
    navigate(createBackPath || '/production', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPage, routedJob, jobsLoading, jobs.length, navigate, createBackPath]);
  const [deleting, setDeleting] = useState(null);
  const [skipping, setSkipping] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const visibleJobs = useMemo(() => {
    let result = stage ? jobs.filter((job) => job.stage === stage) : jobs;
    if (stageTabs && activeStageTab && activeStageTab !== 'All Stages') {
      result = result.filter((job) => job.stage === activeStageTab);
    }
    return result;
  }, [jobs, stage, stageTabs, activeStageTab]);

  const visibleJobsWithMaster = useMemo(
    () =>
      visibleJobs.map((job) => {
        const order = orders.find((o) => o.workOrder === job.productionOrder);
        if (!order) return job;
        const planned = Number(order.quantity) || 0;
        const completed = Number(job.completedQuantity) || 0;
        return {
          ...job,
          workOrder: order.workOrder ?? job.workOrder,
          product: order.product ?? job.product,
          department: order.department ?? job.department,
          plannedQuantity: planned || job.plannedQuantity,
          startDate: order.startDate ?? job.startDate,
          dueDate: order.dueDate ?? job.dueDate,
          priority: order.priority ?? job.priority,
          progress: planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : job.progress,
        };
      }),
    [visibleJobs, orders]
  );

  /* The production type this section's own entries carry. Boards scoped by
     production type use it directly ('Casting'); a stage-scoped board
     ('Assembly') uses its stage/task name as the type key. Every aggregate on
     this board (jobs, status, progress, current stage, quantities) is built
     from entries of this type only, so a Fabrication QC/Dispatch entry can
     never drive an Assembly row (and vice versa) — the same separation
     `orderEntriesOf()` documents in data/entries.js. */
  const sectionType = productionType || stageFilter || '';

  const typeOrders = useMemo(() => {
    if (allWorkOrders) return orders;
    if (stageFilter) {
      return orders.filter((order) => {
        const type = productionTypeOf(order);
        const flow = workflowForType(type);
        return flow.includes(stageFilter);
      });
    }
    if (productionType) {
      return orders.filter((order) => {
        if (order.items && order.items.length > 0) {
          return order.items.some((item) => item.productionType === productionType);
        }
        return productionTypeOf(order) === productionType;
      });
    }
    return [];
  }, [orders, productionType, stageFilter, allWorkOrders]);

  const filterOptions = useMemo(() => {
    const options = {};
    filterFields.forEach((field) => {
      if (field.key === 'productionOrder' && (productionType || stageFilter)) {
        options[field.key] = ['All', ...typeOrders.map((order) => order.workOrder)];
        return;
      }
      options[field.key] = ['All', ...new Set(visibleJobsWithMaster.map((job) => job[field.key]).filter(Boolean))];
    });
    return options;
  }, [visibleJobsWithMaster, filterFields, productionType, typeOrders]);

  const filteredJobs = useMemo(
    () => filterShopFloorJobs(visibleJobsWithMaster, { query, filters, searchFields }),
    [visibleJobsWithMaster, query, filters, searchFields]
  );

  const groups = useMemo(() => {
    // Only this section's own entries count as its jobs. Entries without a
    // production type are legacy rows and are kept so nothing that used to be
    // visible disappears.
    const sectionJobs = sectionType
      ? visibleJobs.filter((job) => !job.productionType || job.productionType === sectionType)
      : visibleJobs;
    const jobsByOrder = new Map();
    sectionJobs.forEach((job) => {
      const key = job.productionOrder || 'Unassigned';
      if (!jobsByOrder.has(key)) jobsByOrder.set(key, []);
      jobsByOrder.get(key).push(job);
    });

    if (productionType || stageFilter || allWorkOrders) {
      const q = query.trim().toLowerCase();
      return typeOrders
        .map((order) => {
          const jobs = jobsByOrder.get(order.workOrder) || [];
          const matchingItems = (order.items || []).filter(
            (item) => item.productionType === (productionType || stageFilter)
          );
          const plannedQuantity = matchingItems.length > 0
            ? matchingItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
            : Number(order.quantity) || Number(jobs[0]?.plannedQuantity) || 0;
          const completedQuantity = jobs.reduce(
            (sum, job) => sum + (Number(job.completedQuantity) || 0), 0
          );
          const rejectedQuantity = jobs.reduce(
            (sum, job) => sum + (Number(job.rejectedQuantity) || 0), 0
          );
          // Same precedence the table uses (ShopFloorOrderTable.groupStatus),
          // so the KPI cards, the status tabs and the table row always agree.
          // Previously this value was only used for filtering and never reached
          // the group object, so every order counted as Pending no matter what
          // status its backend entry actually had.
          const status =
            jobs.length === 0
              ? 'Pending'
              : jobs.every((job) => job.status === 'Completed')
                ? 'Completed'
                : jobs.some((job) => job.status === 'In Progress')
                  ? 'In Progress'
                  : jobs.some((job) => job.status === 'Hold')
                    ? 'Hold'
                    : 'Pending';
          // Current stage as actually recorded in the backend entries. Without
          // this the "Current Stage" column stayed empty ('—') on boards that
          // do not render a separate workflow card (e.g. Casting), even though
          // the stage is stored against the order.
          const orderFlow = workflowForType(productionType || stageFilter);
          const stageRank = (job) => orderFlow.indexOf(job.stage);
          const recordedStages = jobs.filter((job) => job.stage).sort((a, b) => stageRank(a) - stageRank(b));
          const inProgressJob = jobs.find((job) => job.status === 'In Progress');
          const currentStage =
            inProgressJob?.stage ||
            (recordedStages.length > 0 ? recordedStages[recordedStages.length - 1].stage : '');
          // Search the fields this board declares in `searchFields` (plus the
          // Work Order / item / CPO basics). The declared list was ignored on
          // this path, so searching an operator (Fabrication) or a customer
          // (Casting) — both promised by the page's search placeholder —
          // returned nothing even though the rows showed those values.
          const searchHaystack = [
            order.workOrder,
            order.product,
            order.salesOrderNumber,
            ...(searchFields || []).flatMap((key) => [order[key], ...jobs.map((job) => job[key])]),
          ];
          const matchesSearch =
            !q || searchHaystack.some((value) => String(value ?? '').toLowerCase().includes(q));
          const matchesFilters = Object.entries(filters).every(([key, value]) => {
            if (value === 'All') return true;
            if (key === 'productionOrder') return order.workOrder === value;
            if (key === 'status') return status === value;
            if (key === 'operator') return jobs.some((job) => job.operator === value);
            return String(order[key] ?? '') === value || jobs.some((job) => job[key] === value);
          });
          if (!matchesSearch || !matchesFilters) return null;
          const itemNames = matchingItems.length > 0
            ? matchingItems.map((i) => i.productName || i.product || '').filter(Boolean).join(', ')
            : order.product || '—';
          return {
            workOrder: order.workOrder,
            product: itemNames || '—',
            customer: order.customer || '',
            createdDate: order.startDate || '',
            currentStage,
            status,
            // Carried so the row Preview shows the real type — without it
            // productionTypeOf() fell back to its 'Casting' default and every
            // order's pop-up claimed to be Casting.
            productionType: productionTypeOf(order),
            department: order.department || '',
            jobs,
            plannedQuantity,
            completedQuantity,
            rejectedQuantity,
            pendingQuantity: Math.max(0, plannedQuantity - completedQuantity - rejectedQuantity),
            machines: [...new Set(jobs.map((job) => job.machine).filter(Boolean))],
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.workOrder.localeCompare(b.workOrder));
    }

    const byOrder = new Map();
    filteredJobs.forEach((job) => {
      const key = job.productionOrder || 'Unassigned';
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key).push(job);
    });
    return [...byOrder.entries()]
      .map(([workOrder, jobs]) => {
        const order = orders.find((o) => o.workOrder === workOrder);
        const plannedQuantity =
          Number(order?.quantity) || Number(jobs[0]?.plannedQuantity) || 0;
        const completedQuantity = jobs.reduce(
          (sum, job) => sum + (Number(job.completedQuantity) || 0), 0
        );
        const rejectedQuantity = jobs.reduce(
          (sum, job) => sum + (Number(job.rejectedQuantity) || 0), 0
        );
        return {
          workOrder,
          product: order?.product || jobs[0]?.product || '—',
          customer: order?.customer || jobs[0]?.customer || '',
          createdDate: order?.startDate || jobs[0]?.startDate || '',
          productionType: order ? productionTypeOf(order) : jobs[0]?.productionType || '',
          department: order?.department || '',
          jobs,
          plannedQuantity,
          completedQuantity,
          rejectedQuantity,
          pendingQuantity: Math.max(0, plannedQuantity - completedQuantity - rejectedQuantity),
          machines: [...new Set(jobs.map((job) => job.machine).filter(Boolean))],
        };
      })
      .sort((a, b) => a.workOrder.localeCompare(b.workOrder));
  }, [filteredJobs, visibleJobs, orders, typeOrders, productionType, stageFilter, allWorkOrders, sectionType, query, filters]);

  const filteredGroups = useMemo(() => {
    if (!statusTabs || activeStatusTab === 'All') return groups;
    return groups.filter((group) => {
      const status = group.status || 'Pending';
      if (activeStatusTab === 'On Hold') return status === 'Hold';
      return status === activeStatusTab;
    });
  }, [groups, statusTabs, activeStatusTab]);

  const orderCount = useMemo(
    () =>
      (productionType || stageFilter || allWorkOrders)
        ? groups.filter((group) => group.workOrder !== 'Unassigned').length
        : new Set(visibleJobsWithMaster.map((job) => job.productionOrder || 'Unassigned')).size,
    [productionType, stageFilter, allWorkOrders, groups, visibleJobsWithMaster]
  );

  const filtersActive = useMemo(() => {
    if (query.trim() !== '') return true;
    return Object.values(filters).some((value) => value !== 'All');
  }, [query, filters]);

  const clearAll = () => {
    setQuery('');
    setFilters(Object.fromEntries(filterFields.map((field) => [field.key, 'All'])));
  };

  // ---- Bulk actions ----
  const handleBulkExport = () => {
    const selectedGroups = groups.filter((g) => selectedIds.includes(g.workOrder));
    const csv = selectedGroups.map((g) => `${g.workOrder},${g.product},${g.plannedQuantity},${g.completedQuantity}`).join('\n');
    const blob = new Blob([`Work Order,Product,Planned,Completed\n${csv}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'shopfloor'}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkDelete = () => {
    setBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    let deletedAny = false;
    for (const wo of selectedIds) {
      const order = orders.find((o) => o.workOrder === wo);
      if (!order) continue;
      // eslint-disable-next-line no-await-in-loop
      const result = await deleteOrder(order.id);
      if (result?.ok) deletedAny = true;
    }
    setSelectedIds([]);
    setBulkDeleteConfirm(false);
    // The jobs table is built from the backend entries, so it has to be
    // reloaded for the deleted Work Orders to disappear.
    if (deletedAny) await refreshJobs();
  };

  // ---- Job form (create / edit) ----
  const orderOptions = ((productionType || stageFilter) ? typeOrders : orders).map((order) => ({
    value: order.workOrder,
    label: order.workOrder,
  }));
  const findOrder = (wo) => orders.find((order) => order.workOrder === wo);

  const itemOptionsForOrder = (order) => {
    if (!order?.items || !Array.isArray(order.items) || order.items.length === 0) return [];
    // Items are normally narrowed to the board's own production type. But a
    // board lists an order when its WORKFLOW reaches that type (see
    // `typeOrders`), so an order whose items are a different type — e.g. a
    // Fabrication order on the Assembly board, whose flow passes through
    // Assembly — filters down to nothing. The required "Item Name" field then
    // had no option to select, so no job could ever be created for that row.
    // Falling back to the order's own items keeps every listed Work Order
    // usable; boards whose orders already match always take the filtered
    // branch, so their options are byte-for-byte unchanged.
    const matching = (productionType || stageFilter)
      ? order.items.filter((item) => item.productionType === (productionType || stageFilter))
      : order.items;
    const items = matching.length > 0 ? matching : order.items;
    return items.map((item) => {
      const code = item.productCode || item.itemCode || '';
      const name = item.productName || item.product || '';
      return {
        value: item.id || name,
        label: code ? `${name} — ${code}` : name,
        item,
      };
    });
  };

  const masterFromOrder = (order, selectedItem) => {
    if (!order) return null;
    const item = selectedItem || (order.items && order.items.length > 0 ? order.items[0] : null);
    return {
      workOrder: order.workOrder || '',
      product: item?.productName || item?.product || order.product || '',
      productCode: item?.productCode || item?.itemCode || order.productCode || '',
      salesOrder: cpoDisplay(order) || '',
      productionType: productionTypeOf(order) || '',
      patternNumber: item?.patternNumber || order.patternNumber || '',
      drawingNumber: item?.drawingNumber || order.drawingNumber || '',
      drawingRevision: item?.drawingRevision || order.drawingRevision || '',
      department: item?.department || order.department || '',
      plannedQuantity: item?.quantity ?? order.quantity ?? '',
      startDate: order.startDate || '',
      dueDate: order.dueDate || '',
      priority: order.priority || '',
      _itemOptions: itemOptionsForOrder(order),
      _selectedItemId: item?.id || item?.productName || '',
    };
  };

  const availableStageFor = (order) => {
    if (!workflow || !workflow.length) return '';
    if (!order) return workflow[0];
    const ackRecord = getAcknowledgement(order.workOrder);
    const tvRecord = getTechnicalVerification(order.workOrder);
    const ackDone = ackRecord?.status === 'Acknowledged';
    const tvDone = tvRecord?.verificationStatus === 'Verified';
    if (!ackDone || !tvDone) return '';
    const orderJobs = jobs.filter((job) => job.productionOrder === order.workOrder);
    const done = new Set(
      orderJobs
        .filter((job) => job.status === 'Completed' || job.status === 'Skipped')
        .map((job) => job.stage)
    );
    return workflow.find((stage) => !done.has(stage)) || '';
  };

  const inputFor = (order, stage) => {
    if (!workflow || !workflow.length) return order?.quantity ?? '';
    const index = workflow.indexOf(stage);
    if (index <= 0) return order?.quantity ?? '';
    const prevJob = jobs.find(
      (job) => job.productionOrder === order?.workOrder && job.stage === workflow[index - 1]
    );
    if (prevJob && (prevJob.status === 'Completed' || prevJob.status === 'Skipped')) {
      return prevJob.completedQuantity ?? order?.quantity ?? '';
    }
    return order?.quantity ?? '';
  };

  const jobFields = (values = {}) => {
    const order = findOrder(values.productionOrder);
    const available = availableStageFor(order);

    // A section board (Assembly) has no `productionType` prop — its type is
    // the `stageFilter` it is scoped to. Without that fallback the initial
    // field build saw an empty flow and produced no Stage field at all, so the
    // saved stage was missing from the form's values (and from the select).
    const effectiveType = values.productionType || productionType || stageFilter || (order ? productionTypeOf(order) : '');
    const fullFlow = effectiveType ? workflowForType(effectiveType) : [];

    // Always a copy: a legacy stored stage is unshifted below for editing, and
    // mutating the board's shared workflow array would leak that value into
    // every other dropdown on the page.
    const dropdownOptions = [...(dropdownStageOptions || fullFlow)];
    if (formState?.mode === 'edit' && formState.job?.stage && !dropdownOptions.includes(formState.job.stage)) {
      dropdownOptions.unshift(formState.job.stage);
    }
    // Casting, Fabrication and Assembly render the Stage field inside its own
    // bordered section box (see SettingsFormModal) so the stage is a clearly
    // separated choice. Other boards keep the plain field exactly as before.
    const ownerType = stageOwnerType(productionType, stageFilter);
    const stageBoxBoard = stageBoxTypes.includes(ownerType);
    const stageField = !hideStage && fullFlow.length
      ? {
          key: 'stage', label: 'Stage *', type: 'select', options: dropdownOptions,
          required: true,
          default: formState?.mode === 'edit' ? formState.job?.stage : undefined,
          placeholder: effectiveType ? 'Select a stage…' : 'Select a production type first',
          hint: effectiveType
            ? `${effectiveType} stages — select the starting stage for this job.`
            : 'Select a Production Type above to see its available stages.',
          boxTitle: stageBoxBoard ? `${ownerType} Stage` : undefined,
          boxHint: stageBoxBoard
            ? `The ${ownerType.toLowerCase()} stage this job is recorded against — separate from the job status.`
            : undefined,
        }
      : null;

    const tvRecord = order ? getTechnicalVerification(order.workOrder) : null;
    const approvalDone = Boolean(order?.productionApprovedBy && order?.adminApprovedBy);
    const approvalStatus = approvalDone ? 'Approved' : order?.productionApprovedBy ? 'Production Approved' : 'Pending';
    const tvStatus = tvRecord?.verificationStatus === 'Verified'
      ? 'Verified'
      : tvRecord?.verificationStatus === 'Rejected'
        ? 'Rejected'
        : 'Pending';
    const flowSteps = [
      { name: 'Approval', prefix: true, value: approvalStatus },
      // Casting's first stage IS the technical verification gate, so the gate
      // is shown once — as the stage itself — instead of twice under the same
      // name (which also made the flow list render duplicate React keys).
      ...(fullFlow.includes('Technical Verification')
        ? []
        : [{ name: 'Technical Verification', prefix: true, value: tvStatus }]),
      ...fullFlow.map((stage) => ({ name: stage, active: stage === (values.stage || available) })),
    ];
    const typeOptions = ENTRY_MODULE_TYPES.map((t) => ({ value: t, label: t }));

    const base = [
      {
        key: 'productionOrder', label: 'Work Order *', type: 'select', options: orderOptions,
        required: true,
        default: orderOptions.length === 1 ? orderOptions[0].value : undefined,
        placeholder: orderOptions.length ? 'Select a Work Order…' : 'No work orders available',
        hint: orderOptions.length ? undefined : 'No Work Orders available. Create a Work Order first.',
      },
      {
        key: '_selectedItemId', label: 'Item Name *', type: 'select',
        options: values._itemOptions || [], required: true,
        placeholder: values._itemOptions?.length > 0 ? 'Select an item…' : 'Select a Work Order first',
        hint: values._itemOptions?.length > 0
          ? `${values._itemOptions.length} item${values._itemOptions.length > 1 ? 's' : ''} available — select one to auto-fill fields.`
          : 'Select a Work Order to see its items.',
      },
      { key: 'product', label: 'Item Name (auto-filled)', type: 'text', disabled: true, placeholder: 'Selected from item above', required: true },
      { key: 'productCode', label: 'Item Code', type: 'text', disabled: true, placeholder: 'From selected item' },
      { key: 'salesOrder', label: 'CPO', type: 'text', disabled: true, placeholder: 'From work order' },
      {
        key: 'productionType', label: 'Production Type *', type: 'select', options: typeOptions,
        // A stage-scoped section (Assembly) records its own entries under the
        // section type, so that is the default here — the field stays editable.
        required: true, default: productionType || stageFilter || '', placeholder: 'Select production type…',
        hint: effectiveType ? `Complete ${effectiveType} flow shown below.` : 'Select a production type to see its workflow.',
      },
      effectiveType && flowSteps.length > 2
        ? { key: '_workflowFlow', label: `Production Flow — ${effectiveType}`, type: 'flow', flowSteps, wide: true }
        : null,
      { key: 'drawingNumber', label: 'Drawing Number', type: 'text', disabled: true, placeholder: 'From work order item' },
      { key: 'drawingRevision', label: 'Drawing Revision', type: 'text', disabled: true, placeholder: 'From work order item' },
      ...(productionType === 'Casting'
        ? [{ key: 'patternNumber', label: 'Pattern Number', type: 'text', disabled: true, placeholder: 'From work order item' }]
        : []),
      { key: 'department', label: 'Department', type: 'text', disabled: true, placeholder: 'From work order' },
      {
        key: 'plannedQuantity', label: 'Input / Planned Quantity', type: 'number', min: 0, required: true,
        hint: 'Defaults to the previous stage output (first stage: the Work Order planned quantity).',
      },
      { key: 'startDate', label: 'Start Date', type: 'date', disabled: true },
      { key: 'dueDate', label: 'Due Date', type: 'date', disabled: true },
      { key: 'priority', label: 'Priority', type: 'text', disabled: true, placeholder: 'From work order' },
      { key: 'completedQuantity', label: 'Completed Quantity *', type: 'number', min: 0, required: true },
      { key: 'rejectedQuantity', label: 'Rejected Quantity', type: 'number', min: 0 },
      { key: 'operator', label: 'Operator', type: 'text', placeholder: 'Operator name' },
      {
        key: 'status', label: 'Status *', type: 'select', options: SHOP_FLOOR_STATUSES,
        // Seeded from Settings → Production Parameters ('Default Production
        // Status'), which documents itself as the default for new shop floor
        // jobs. Only a status the workflow actually accepts is used — an entry
        // is stored under one of SHOP_FLOOR_STATUSES, so a value outside that
        // set would be rejected on save.
        required: true, default: jobDefaultStatus,
      },
      { key: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'Optional notes…', wide: true },
    ].filter(Boolean);

    const fields = [...base, ...extraFields];
    if (!stageField) return fields;
    // Every other board keeps the Stage field where it has always been (first).
    if (!stageBoxBoard) return [stageField, ...fields];
    // Casting / Fabrication: the Stage box sits directly after the Production
    // Type / Production Flow fields, without moving any other field.
    const flowIndex = fields.findIndex((field) => field.key === '_workflowFlow');
    const insertAt = flowIndex >= 0 ? flowIndex + 1 : fields.length;
    return [...fields.slice(0, insertAt), stageField, ...fields.slice(insertAt)];
  };

  const handleSubmit = async (values) => {
    const { idPrefix: _prefix, _itemOptions: _opts, _selectedItemId, ...record } = values;
    const progress =
      Number(record.plannedQuantity) > 0
        ? Math.min(100, Math.round((Number(record.completedQuantity) / Number(record.plannedQuantity)) * 100))
        : 0;
    // The chosen Work Order Item must travel with the record — it is the
    // `workOrderItemId` the Production Entry is stored under.
    //
    // It used to be destructured out and thrown away, so every entry was
    // written with an EMPTY item id: the stage row could not be tied to the
    // item it belongs to (per-item stage progress, per-item lookups and the
    // item's `current_stage` update all silently did nothing), and two items of
    // the same Work Order at the same stage collapsed onto a single row — the
    // backend upserts on (order, item, stage), so the second save overwrote the
    // first.
    /* Boards that still label a job with a free-text task (Assembly's
       "Assembly Task") persist that label in the entry's stage column. Now
       that the same form also carries the workflow Stage, the two must not
       disagree — otherwise a stale task would overwrite the stage the user
       picked. Keep the label in step with the Stage field. */
    if ('assemblyTask' in record && record.stage) {
      record.assemblyTask = record.stage;
    }
    const payload = {
      ...record,
      workOrderItemId: _selectedItemId || record.workOrderItemId || '',
      progress,
    };
    let savedJob;
    if (formState.mode === 'edit') {
      await updateJob(formState.job.id, payload);
      savedJob = { ...payload, id: formState.job.id };
    } else {
      const created = await addJob({ ...payload, idPrefix });
      // The record is written to the backend before it reaches the board, so a
      // rejected create leaves the form open instead of showing a job that was
      // never stored (it used to disappear on the next refresh).
      if (!created?.data) return;
      savedJob = created.data;
    }
    if (onJobChange) onJobChange(savedJob, formState.mode === 'edit' ? 'update' : 'create');
    closeForm();
  };

  const openCreateFor = (workOrder) => {
    // When a dedicated create route is wired, send the user there (carrying
    // the Work Order when the request came from a specific row).
    if (createPath) {
      navigate(workOrder ? `${createPath}?workOrder=${encodeURIComponent(workOrder)}` : createPath);
      return;
    }
    setFormState({ mode: 'create', job: { productionOrder: workOrder } });
  };

  const confirmDelete = async () => {
    const job = deleting;
    if (!job) return;
    setDeleting(null);
    try {
      // Persist the removal before telling the page it happened, so a job that
      // the backend refused to delete is not silently dropped from the board.
      await deleteJob(job.id);
      if (onJobChange) onJobChange(job, 'delete');
    } catch (err) {
      console.error('Failed to delete shop floor job:', err);
    }
  };

  /* The preview module key mirrors the Production route each board owns
     (machineShop is served by /production/machine-shop). */
  const previewModule = {
    casting: 'casting',
    fabrication: 'fabrication',
    assembly: 'assembly',
    machineShop: 'machine-shop',
  }[moduleName] || 'orders';

  /* Production Access Management — the create control is shown only when the
     area's Create switch is ON (the backend refuses POST /<area> regardless). */
  const boardArea = previewModule === 'machine-shop' ? 'machineShop' : previewModule;
  const canCreateJob = canProduction(boardArea, 'create');

  const openPreview = (workOrder, jobId) => {
    if (!workOrder) return;
    const jobQuery = jobId ? `?job=${encodeURIComponent(jobId)}` : '';
    navigate(`/production/preview/${previewModule}/${encodeURIComponent(workOrder)}${jobQuery}`);
  };

  /* Casting, Fabrication and Assembly rows carry an inline Stage editor and a
     row-level ⋮ → Edit. Both are wired only for those boards, so every other
     shop floor list keeps exactly the menu and read-only Stage cell it had. */
  const inlineStageEditable =
    stageBoxTypes.includes(stageOwnerType(productionType, stageFilter)) &&
    Array.isArray(dropdownStageOptions);

  /** ⋮ → Edit / inline stage: the entry a summary row currently stands for. */
  const stageJobForGroup = (group, currentStage) =>
    group.jobs?.find((job) => job.stage === currentStage) ||
    group.jobs?.[group.jobs.length - 1] ||
    null;

  const handleRowEdit = (group, job) => {
    const target = job || stageJobForGroup(group, group.currentStage);
    if (target) openEdit(target);
  };

  const handleInlineStageChange = async (group, job, nextStage) => {
    try {
      await changeJobStage(job.id, nextStage);
      // Re-read the board so the row's stage, stage tabs, KPIs and progress all
      // come from what the database now holds instead of local state alone.
      await refreshJobs();
      // Lets the page revalidate its own entries store (Casting reloads the
      // Work Order's entries), so the View page shows the same stage.
      if (onJobChange) onJobChange({ ...job, stage: nextStage }, 'stage');
      toast.success(`Stage changed to ${nextStage}.`);
    } catch (err) {
      const detail =
        err?.response?.data?.message || err?.message || 'The stage change was not saved.';
      toast.error(detail);
      // Re-throw so the cell keeps the stored value and marks itself unsaved.
      throw new Error(detail, { cause: err });
    }
  };

  const renderActions = (job) => (
    <ShopFloorRowActions
      /* The board's own Production area — its Access Management switches decide
         which row actions are offered (the backend refuses the same pairs). */
      area={previewModule === 'machine-shop' ? 'machineShop' : previewModule}
      job={job}
      previewPath={
        job.productionOrder
          ? `/production/preview/${previewModule}/${encodeURIComponent(job.productionOrder)}?job=${encodeURIComponent(
              job._backendId || job.id
            )}`
          : undefined
      }
      // 'Quality Hold' (Settings → Production Parameters) governs whether a
      // running job can be put on hold for QC.
      canHold={qualityHoldEnabled}
      onStart={wrappedStartJob}
      onHold={wrappedHoldJob}
      onResume={wrappedResumeJob}
      onComplete={wrappedCompleteJob}
      onSkip={setSkipping}
      onEdit={() => openEdit(job)}
      onDelete={setDeleting}
    />
  );

  const notifyChange = (job, status) => {
    if (onJobChange) onJobChange({ ...job, status }, 'update');
  };
  const wrappedStartJob = (id) => { const j = jobs.find((j) => j.id === id); if (j) notifyChange(j, 'In Progress'); startJob(id); };
  const wrappedHoldJob = (id) => { const j = jobs.find((j) => j.id === id); if (j) notifyChange(j, 'Hold'); holdJob(id); };
  const wrappedResumeJob = (id) => { const j = jobs.find((j) => j.id === id); if (j) notifyChange(j, 'In Progress'); resumeJob(id); };
  // Completing derives the completed quantity from the planned/rejected figures
  // (useShopFloorJobs.completeJob). The board persists that write, and then the
  // page's onJobChange handler re-saves the same entry — so the handler has to
  // receive the SAME quantity. Passing the stale job made the second write
  // reset output_quantity to 0, leaving the job Completed but 0% after a reload.
  const wrappedCompleteJob = (id) => {
    const j = jobs.find((job) => job.id === id);
    if (j) {
      const planned = Number(j.plannedQuantity) || 0;
      const rejected = Number(j.rejectedQuantity) || 0;
      const completed = Number(j.completedQuantity) > 0
        ? Number(j.completedQuantity)
        : Math.max(0, planned - rejected);
      notifyChange({ ...j, completedQuantity: completed }, 'Completed');
    }
    completeJob(id);
  };

  const confirmSkip = () => {
    if (!skipping) return;
    notifyChange(skipping.job, 'Skipped');
    skipJob(skipping.job.id, { reason: skipping.reason, remarks: skipping.remarks });
    setSkipping(null);
  };

  const openCreate = () => {
    if (createPath) {
      navigate(createPath);
      return;
    }
    setFormState({ mode: 'create' });
  };

  /* ⋮ → Edit opens the dedicated full-size edit page (`<board>/:id/edit`)
     instead of a half-width overlay panel over the still-mounted board. Boards
     wired to dedicated create routes are the ones that get an edit route. */
  const editBasePath = createBackPath && createBackPath !== '/production' ? createBackPath : null;
  const openEdit = (job) => {
    if (editBasePath) {
      navigate(`${editBasePath}/${encodeURIComponent(job.id)}/edit`);
      return;
    }
    setFormState({ mode: 'edit', job });
  };

  /* Closing the form: on a dedicated create / edit route we leave the page and
     return to the board; in-board we simply hide the modal. */
  const closeForm = () => {
    if (isPage) {
      navigate(createBackPath || '/production');
      return;
    }
    setFormState(null);
  };

  const pageTitle = stage || title;
  const pageSubtitle = stage
    ? `Jobs at the ${stage} stage of the ${title.toLowerCase()} process.`
    : subtitle;

  /* The create / edit form. Rendered as an in-flow full-page block on the
     dedicated create route (layout="page") and as the classic overlay
     everywhere else — same fields, same validation, same submit. */
  const jobForm = formState ? (
    <SettingsFormModal
      title={
        formState.mode === 'edit'
          ? `Edit ${formState.job.id}`
          : `${createLabel} — ${title}`
      }
      fields={jobFields}
      initialValues={formState.job}
      mode={formState.mode}
      idKey="id"
      existingIds={[]}
      layout={isPage ? 'page' : 'modal'}
      fullPage={!isPage}
      onInit={(values) => {
        const order = findOrder(values.productionOrder);
        if (!order) return null;

        // EDIT: refresh only the Work-Order-derived display fields (item
        // options, product, drawing, department…). The record's own values
        // — stage, input/completed/rejected quantity, operator, status,
        // remarks — must win, and skipping this seeding altogether left
        // the required Item Name unlocked. Previously the create-time
        // seeding also ran on edit, so opening a saved job pre-filled the
        // Work Order's quantity instead of the stored one and silently
        // stored it on save.
        if (formState.mode === 'edit') {
          const itemOpts = itemOptionsForOrder(order);
          const storedItemId = values._selectedItemId || formState.job?.workOrderItemId || '';
          const selected =
            itemOpts.find((opt) => String(opt.value) === String(storedItemId)) || itemOpts[0] || null;
          // The record's own production type must win over the Work Order's:
          // an Assembly job lives on ANY Work Order, and re-typing it to the
          // order's type would move the entry out of this board on save.
          const { plannedQuantity: _planned, productionType: _woType, ...master } = masterFromOrder(order, selected?.item || null);
          return { ...master, _selectedItemId: selected ? selected.value : '' };
        }

        // A section board (Assembly) records its OWN production type — it
        // consumes any Work Order — so the flow and its first stage come from
        // that type, never from the Work Order's own type.
        const woType = order ? productionTypeOf(order) : '';
        const flowType = sectionType || woType;
        const flow = flowType ? workflowForType(flowType) : [];
        const firstStage = flow.length > 0 ? flow[0] : '';
        return {
          ...masterFromOrder(order),
          productionType: flowType || '',
          stage: firstStage,
          plannedQuantity: inputFor(order, firstStage),
        };
      }}
      onValuesChange={(key, value, current) => {
        if (key === 'productionOrder') {
          const order = findOrder(value);
          if (!order) return null;
          const woType = order ? productionTypeOf(order) : '';
          // Same rule as above: a section board keeps its own type and flow
          // (Assembly), a type-scoped board uses the Work Order's.
          const flowType = sectionType || woType;
          const flow = flowType ? workflowForType(flowType) : [];
          const firstStage = flow.length > 0 ? flow[0] : '';
          const master = masterFromOrder(order);
          const firstItem = order.items && order.items.length > 0 ? order.items[0] : null;
          const itemUpdates = firstItem ? masterFromOrder(order, firstItem) : {};
          const { _itemOptions, _selectedItemId, ...itemFields } = itemUpdates;
          return {
            ...master,
            ...itemFields,
            _selectedItemId: firstItem ? (firstItem.id || firstItem.productName || '') : '',
            productionType: flowType || current.productionType || '',
            stage: firstStage,
            plannedQuantity: firstItem?.quantity ?? inputFor(order, firstStage),
          };
        }
        if (key === '_selectedItemId') {
          const order = findOrder(current.productionOrder);
          if (!order) return null;
          const itemOpts = itemOptionsForOrder(order);
          const selectedOpt = itemOpts.find((opt) => opt.value === value);
          if (!selectedOpt) return null;
          const item = selectedOpt.item;
          return {
            product: item.productName || item.product || '',
            productCode: item.productCode || item.itemCode || '',
            patternNumber: item.patternNumber || '',
            drawingNumber: item.drawingNumber || '',
            department: item.department || '',
            plannedQuantity: item.quantity ?? current.plannedQuantity ?? '',
          };
        }
        if (key === 'productionType') {
          // Boards that hide the stage field (Assembly) have no workflow stage
          // to keep in sync — the `stage` column carries the user's "Assembly
          // Task" instead. Resetting it to the new flow's first stage silently
          // wiped that task AND re-keyed the entry, because a Production Entry
          // is upserted on (order, item, stage): the old row was left behind and
          // a second one was inserted for the same job. Boards with a visible
          // stage field keep the original behaviour.
          if (hideStage) return null;
          const newFlow = workflowForType(value);
          const firstStage = newFlow.length > 0 ? newFlow[0] : '';
          return { stage: firstStage };
        }
        if (key === 'stage' && workflow && workflow.length) {
          const order = findOrder(current.productionOrder);
          if (!order) return null;
          return { plannedQuantity: inputFor(order, value) };
        }
        return null;
      }}
      validate={(values) => {
        if (Number(values.plannedQuantity) < 0) return 'Input quantity cannot be negative.';
        if (Number(values.completedQuantity) < 0) return 'Completed quantity cannot be negative.';
        if (Number(values.rejectedQuantity) < 0) return 'Rejected quantity cannot be negative.';
        if (Number(values.completedQuantity) + Number(values.rejectedQuantity) > Number(values.plannedQuantity)) {
          return 'Completed + rejected quantity cannot exceed the input quantity.';
        }
        return null;
      }}
      onSubmit={handleSubmit}
      onCancel={closeForm}
    />
  ) : null;

  /* Dedicated create / edit routes: the form replaces the whole board — the
     job list, summary cards, tabs and toolbar are not rendered underneath. */
  if (isPage) {
    // The record is read from the jobs the hook is still fetching — hold the
    // page rather than flashing an empty form.
    if (editPage && !routedJob) return <div className="page" />;
    return <div className="page">{jobForm}</div>;
  }

  return (
    <div className="page">
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={canCreateJob && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Icon name="plus" size={15} /> {createLabel}
          </button>
        )}
      />

      <ShopFloorSummaryCards jobs={groups} onCardClick={moduleName ? (key) => window.open(`/production/kpi/${moduleName}/${key}`, '_blank') : undefined} />

      {stageTabs && stageTabs.length > 0 && (
        <div className="sf-stage-tabs">
          {stageTabs.map((tab) => {
            // Count the work orders that actually have a job at this stage.
            // The tab used to test the (non-existent) `stage` field on the
            // group, so every stage tab showed 0 even when jobs were recorded.
            const count = tab === 'All Stages'
              ? groups.length
              : groups.filter((group) => (group.jobs || []).some((job) => job.stage === tab)).length;
            return (
              <button
                key={tab}
                type="button"
                className={`sf-stage-tab ${activeStageTab === tab ? 'active' : ''}`}
                onClick={() => setActiveStageTab(tab)}
              >
                {tab}
                <span className="sf-stage-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {statusTabs && statusTabs.length > 0 && (
        <div className="sf-stage-tabs">
          {statusTabs.map((tab) => {
            const count = tab === 'All'
              ? groups.length
              : groups.filter((g) => {
                  const s = g.status || 'Pending';
                  return tab === 'On Hold' ? s === 'Hold' : s === tab;
                }).length;
            return (
              <button
                key={tab}
                type="button"
                className={`sf-stage-tab ${activeStatusTab === tab ? 'active' : ''}`}
                onClick={() => setActiveStatusTab(tab)}
              >
                {tab}
                <span className="sf-stage-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {workflow && workflow.length > 0 && (
        <ShopFloorWorkflow steps={workflow} jobs={visibleJobsWithMaster} title={workflowTitle} current={stage} />
      )}

      <ProductionTableToolbar
        showFilters={showFiltersOpen}
        onToggleFilters={filterFields.length > 0 ? () => setShowFiltersOpen((v) => !v) : undefined}
        filtersActive={filtersActive}
        onRefresh={refreshJobs}
        searchPlaceholder={searchPlaceholder}
        searchQuery={query}
        onSearchChange={setQuery}
        totalRecords={filteredGroups.length}
        pageStart={filteredGroups.length > 0 ? 1 : 0}
        pageEnd={filteredGroups.length}
      />

      {showFiltersOpen && filterFields.length > 0 && (
        <ShopFloorFilters
          searchPlaceholder={searchPlaceholder}
          searchQuery={query}
          onSearchChange={setQuery}
          fields={filterFields.map((field) => ({ ...field, options: filterOptions[field.key] || ['All'] }))}
          filters={filters}
          onChange={setFilters}
          onClear={clearAll}
          clearVisible={filtersActive}
        />
      )}

      <section className="pt-table-card">
        <div className="sf-board-head">
          <div>
            <h3 className="sf-board-title">{tableTitle}</h3>
            <p className="sf-board-subtitle">
              Showing {filteredGroups.length} of {orderCount} work orders
              {(() => {
                const awaiting = filteredGroups.filter((g) => g.jobs.length === 0).length;
                return awaiting > 0
                  ? ` · ${awaiting} work order${awaiting > 1 ? 's' : ''} awaiting ${stage || title || 'work'} — no entries recorded yet`
                  : '';
              })()}
            </p>
          </div>
        </div>

        {/* Bulk Action Bar */}
        <ProductionBulkActionBar
          count={selectedIds.length}
          onExport={selectedIds.length > 0 ? handleBulkExport : undefined}
          onDelete={selectedIds.length > 0 ? handleBulkDelete : undefined}
        />

        {filteredGroups.length > 0 ? (
          <ShopFloorOrderTable
            groups={filteredGroups}
            columns={columns}
            renderActions={renderActions}
            workflow={workflow}
            showMachine={columns.includes('Machine')}
            showCustomer={columns.includes('Customer')}
            viewLabel={workflow && workflow.length ? 'View Workflow' : 'View Details'}
            onCreateJob={openCreateFor}
            onWorkOrderClick={onWorkOrderClick}
            onPreviewOrder={(group) => openPreview(group.workOrder)}
            onSelectionChange={setSelectedIds}
            onEditGroup={inlineStageEditable ? handleRowEdit : undefined}
            onStageChange={inlineStageEditable ? handleInlineStageChange : undefined}
            stageOptions={inlineStageEditable ? dropdownStageOptions : undefined}
          />
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="search" size={22} />
            </span>
            <h4>
              {productionType && typeOrders.length === 0
                ? `No ${title} Work Orders Available`
                : jobs.length === 0
                  ? `No ${title} jobs yet`
                  : 'No jobs found'}
            </h4>
            <p>
              {productionType && typeOrders.length === 0
                ? `Create a ${title} Work Order in Production Work Orders first — it will appear here automatically.`
                : jobs.length === 0
                  ? `Create your first ${title} job to start tracking shop floor work.`
                  : 'No records match your search and filter criteria.'}
            </p>
            {jobs.length === 0
              ? (canCreateJob && (
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  <Icon name="plus" size={14} /> {createLabel}
                </button>
              ))
              : (
                <button type="button" className="btn btn-secondary" onClick={clearAll}>
                  Clear Filters
                </button>
              )}
          </div>
        )}
      </section>

      {jobForm}

      {deleting && (
        <Modal
          title="Delete Job"
          size="sm"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                <Icon name="trash" size={14} /> Delete
              </button>
            </>
          }
        >
          <p className="confirm-text">Are you sure you want to delete this job?</p>
          <p className="confirm-subtext">
            <strong>{deleting.id}</strong> · Work Order {deleting.productionOrder} · {deleting.product}
          </p>
        </Modal>
      )}

      {skipping && (
        <Modal
          title={`Skip ${skipping.job.stage || 'Job'} — ${skipping.job.id}`}
          size="sm"
          onClose={() => setSkipping(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setSkipping(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-secondary" onClick={confirmSkip}>
                <Icon name="skip-forward" size={14} /> Skip Stage
              </button>
            </>
          }
        >
          <label className="form-field" style={{ marginBottom: 12 }}>
            <span className="form-label">Skip Reason</span>
            <select
              className="form-select"
              value={skipping.reason}
              onChange={(e) => setSkipping((prev) => ({ ...prev, reason: e.target.value }))}
            >
              <option value="">Select a reason…</option>
              {['Not Applicable', 'Customer Approved Deviation', 'Replaced by Alternative Process', 'Duplicate of Previous Stage', 'Other'].map(
                (option) => (
                  <option key={option}>{option}</option>
                )
              )}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Remarks</span>
            <textarea
              className="form-textarea"
              rows={2}
              value={skipping.remarks}
              onChange={(e) => setSkipping((prev) => ({ ...prev, remarks: e.target.value }))}
              placeholder="Optional notes…"
            />
          </label>
        </Modal>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <Modal
          title="Bulk Delete"
          size="sm"
          onClose={() => setBulkDeleteConfirm(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setBulkDeleteConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmBulkDelete}>
                <Icon name="trash" size={14} /> Delete {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''}
              </button>
            </>
          }
        >
          <p className="confirm-text">
            Are you sure you want to delete {selectedIds.length} selected work order{selectedIds.length > 1 ? 's' : ''}?
          </p>
          <p className="confirm-subtext">This action cannot be undone.</p>
        </Modal>
      )}

    </div>
  );
}

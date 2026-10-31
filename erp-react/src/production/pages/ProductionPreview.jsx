import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Box,
  Boxes,
  ClipboardList,
  Cog,
  Download,
  Eye,
  FileText,
  Flame,
  History,
  Layers,
  Loader2,
  Package,
  Paperclip,
  Printer,
  ShieldCheck,
  Truck,
  Wrench,
} from 'lucide-react';
import { Check } from 'lucide-react';
import ProductionStatusBadge from '../components/production/ProductionStatusBadge';
import Drawing2DViewer from '../components/production/Drawing2DViewer';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { useDrawings } from '../context/DrawingsContext';
import { useModels } from '../context/ModelsContext';
import { useQuality } from '../context/QualityContext';
import { usePacking } from '../context/PackingContext';
import { useDispatch } from '../context/DispatchContext';
import { useProductionEntry } from '../context/ProductionEntryContext';
import { modelApi, qualityApi } from '../utils/api';
import {
  capabilityLabel,
  canPreviewInApp,
  extensionLabel,
  previewUnavailableReason,
} from '../utils/drawingFormats';
import { cpoDisplay, unlinkedCpoNumber } from '../utils/cpoRef';
import { productionTypeOf } from '../data/entries';
import { castingStageProgress } from '../data/casting';
import { fabricationStageProgress } from '../data/fabrication';
import { assemblyStageProgress } from '../data/assembly';
import {
  boxTotals,
  ensureBoxes,
  overallTotals,
  packedQtyOf,
} from '../data/packing';
import { formatDate, formatDateTime, formatFileSize } from '../utils/format';
import { fileTypeLabel } from '../../utils/attachmentStorage';
import { useToast } from '../../components/Common';
import api from '../../api/axiosInstance';
import './ProductionPreview.css';
/* Drawing2DViewer renders its modal with the dm-modal-* classes defined here;
   the list pages import this file, so the preview page must too. */
import './DrawingsModels.css';

/* ------------------------------------------------------------------ *
 * Module catalogue — one entry per Production list page that owns
 * record-level actions. `listPath` is the exact page "Back to List"
 * must return to, and the preview route key is the same value.
 * ------------------------------------------------------------------ */
const MODULES = {
  orders: {
    label: 'Production Work Orders',
    listPath: '/production/orders',
    icon: ClipboardList,
  },
  'technical-verification': {
    label: 'Technical Verification',
    listPath: '/production/technical-verification',
    icon: ShieldCheck,
  },
  drawings: {
    label: 'Drawings',
    listPath: '/production/drawings',
    icon: FileText,
  },
  models: {
    label: 'Models',
    listPath: '/production/models',
    icon: Box,
  },
  casting: {
    label: 'Casting',
    listPath: '/production/casting',
    icon: Flame,
  },
  fabrication: {
    label: 'Fabrication',
    listPath: '/production/fabrication',
    icon: Layers,
  },
  'machine-shop': {
    label: 'Machine Shop',
    listPath: '/production/machine-shop',
    icon: Cog,
  },
  assembly: {
    label: 'Assembly',
    listPath: '/production/assembly',
    icon: Wrench,
  },
  quality: {
    label: 'Quality',
    listPath: '/production/quality',
    icon: ShieldCheck,
  },
  packing: {
    label: 'Packing',
    listPath: '/production/packing',
    icon: Package,
  },
  dispatch: {
    label: 'Dispatch',
    listPath: '/production/dispatch',
    icon: Truck,
  },
};

const VIEWABLE_MODEL_TYPES = ['SLDPRT', 'SLDASM', 'STEP', 'STP', 'IGES', 'IGS', 'GLB', 'GLTF', 'STL', 'OBJ'];

/* ------------------------------------------------------------------ *
 * Small, dependency-free helpers. Every one of them returns an
 * honest empty value (—) instead of inventing data.
 * ------------------------------------------------------------------ */
const text = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return '—';
  return String(value);
};

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const dateText = (value) => {
  if (!value) return '—';
  const raw = String(value);
  return raw.includes('T') ? formatDateTime(raw) : formatDate(raw);
};

const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const matchesId = (value, id) =>
  value !== null && value !== undefined && String(value) === String(id);

/**
 * Read ONE Quality inspection by id — the authoritative saved record.
 *
 * Returns `{ key, record, loading }`; `key` is the route it belongs to, so a
 * navigation to another inspection never renders the previous record.
 */
function useInspectionRecord(inspectionId, key) {
  const [state, setState] = useState({ key: null, record: null, failed: false });

  useEffect(() => {
    if (!inspectionId) return undefined;
    let cancelled = false;
    qualityApi
      .getById(inspectionId)
      .then((response) => {
        if (cancelled) return;
        const raw = response?.data ?? response ?? null;
        // The preview reads `productionOrder` first; the API mirrors the Work
        // Order in `workOrder`/`productionOrderId` (same alias the Quality
        // context applies).
        setState({
          key,
          record: raw
            ? { ...raw, productionOrder: raw.productionOrder ?? raw.productionOrderId ?? raw.workOrder ?? '' }
            : null,
          failed: !raw,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ key, record: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [inspectionId, key]);

  // State is keyed by route, so a navigation reads as "loading" without the
  // effect having to synchronously reset state on mount.
  const current = state.key === key;
  return {
    key: current ? key : null,
    record: current ? state.record : null,
    loading: Boolean(inspectionId) && !current,
  };
}

const initialOf = (value) => String(value || '?').trim().charAt(0).toUpperCase() || '?';

/* Revision values are stored in mixed shapes ("A", "Rev A", "R2"). Normalise
   them for headings without inventing a revision when none is stored. */
const revisionLabel = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return /^rev\b/i.test(raw) ? raw : `Rev ${raw}`;
};

const statusOfEntries = (entries, fallback = 'Pending') => {
  if (!Array.isArray(entries) || entries.length === 0) return fallback;
  if (entries.every((entry) => entry.status === 'Completed' || entry.status === 'Skipped')) {
    return 'Completed';
  }
  if (entries.some((entry) => entry.status === 'In Progress')) return 'In Progress';
  if (entries.some((entry) => entry.status === 'Hold')) return 'Hold';
  return 'Pending';
};

const progressOf = (planned, output) => {
  const total = number(planned);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((number(output) / total) * 100));
};

const cpoReference = (order) => {
  if (!order) return '';
  return cpoDisplay(order) || unlinkedCpoNumber(order) || order.salesOrderNumber || '';
};

const attachmentsForOrder = (order, drawings, models) => {
  if (!order) return [];
  const workOrder = order.workOrder || order.id;
  const drawingRows = (drawings || [])
    .filter((drawing) => matchesId(drawing.workOrderId, workOrder))
    .map((drawing) => ({
      key: `drawing-${drawing.id}`,
      kind: 'Drawing',
      label: drawing.drawingNumber || drawing.fileName || `Drawing #${drawing.id}`,
      meta: [drawing.drawingRevision, drawing.fileName].filter(Boolean).join(' · '),
      status: drawing.verificationStatus || 'Pending',
      path: `/production/preview/drawings/${encodeURIComponent(drawing.id)}`,
    }));
  const modelRows = (models || [])
    .filter((model) => matchesId(model.workOrderId, workOrder))
    .map((model) => ({
      key: `model-${model.id}`,
      kind: 'Model',
      label: model.modelNumber || model.fileName || `Model #${model.id}`,
      meta: [model.modelRevision, model.fileName].filter(Boolean).join(' · '),
      status: model.verificationStatus || 'Pending',
      path: `/production/preview/models/${encodeURIComponent(model.backendId || model.id)}`,
    }));
  return [...drawingRows, ...modelRows];
};

/* ------------------------------------------------------------------ *
 * View builders — one per Production record type.
 * ------------------------------------------------------------------ */

function buildOrderView({ order, entries, drawings, models, itemAttachments }) {
  const orderEntries = (entries || []).filter(
    (entry) => matchesId(entry.workOrderId || entry.workOrder, order.workOrder)
  );
  const planned = number(order.quantity);
  const output = orderEntries.reduce((sum, entry) => sum + number(entry.outputQuantity), 0);
  const rejected = orderEntries.reduce((sum, entry) => sum + number(entry.rejectedQuantity), 0);
  const currentStage =
    order.currentStage ||
    orderEntries[orderEntries.length - 1]?.stage ||
    '—';
  const items = Array.isArray(order.items) ? order.items : [];
  // Item-wise attachments, read under each item's own id. A Work Order that
  // predates them simply has no rows here.
  const attachmentsByItem =
    itemAttachments && typeof itemAttachments === 'object' ? itemAttachments : {};
  const filesForItem = (item) =>
    Array.isArray(attachmentsByItem[String(item?.id)]) ? attachmentsByItem[String(item?.id)] : [];
  const itemAttachmentRows = items.flatMap((item) =>
    filesForItem(item).map((file) => ({
      key: `item-${item.id}-${file.id}`,
      kind: 'Item Attachment',
      label: file.name,
      meta: [
        item.productName || item.product,
        fileTypeLabel(file.name, file.contentType),
        file.size != null ? formatFileSize(file.size) : '',
      ]
        .filter(Boolean)
        .join(' · '),
      url: file.url,
      contentType: file.contentType,
      downloadName: file.name,
    }))
  );
  const attachments = [...attachmentsForOrder(order, drawings, models), ...itemAttachmentRows];

  return {
    title: order.customer || order.product || 'Production Order',
    number: order.workOrder,
    subtitle: [order.product, cpoReference(order) ? `CPO ${cpoReference(order)}` : '']
      .filter(Boolean)
      .join(' · '),
    status: order.status || 'Pending',
    meta: [
      { label: 'CPO', value: cpoReference(order) },
      { label: 'Type', value: order.productionType || productionTypeOf(order) },
      { label: 'Due', value: dateText(order.dueDate) },
      { label: 'Priority', value: order.priority },
    ].filter((item) => item.value),
    sections: [
      {
        heading: 'Work Order Information',
        icon: ClipboardList,
        rows: [
          ['Work Order', order.workOrder],
          ['CPO Reference', cpoReference(order)],
          ['Customer', order.customer],
          ['Customer Code', order.customerCode],
          ['Product / Item', order.product],
          ['Order Description', order.orderDescription || order.description],
          ['Production Type', order.productionType || productionTypeOf(order)],
          ['Department', order.department],
          ['Quantity', planned ? `${planned}${order.uom ? ` ${order.uom}` : ''}` : ''],
          ['Priority', order.priority],
          ['Status', order.status],
          ['Current Stage', currentStage],
        ],
      },
      {
        heading: 'Schedule & Technical Details',
        icon: History,
        rows: [
          ['Start Date', dateText(order.startDate)],
          ['Due Date', dateText(order.dueDate)],
          ['Batch Number', order.batchNumber],
          ['Pattern Number', order.patternNumber],
          ['Drawing Number', order.drawingNumber],
          ['Drawing Revision', order.drawingRevision],
        ],
      },
      {
        heading: 'Approvals',
        icon: ShieldCheck,
        rows: [
          ['Production Approval', order.productionApprovedBy ? `Approved by ${order.productionApprovedBy}` : 'Pending'],
          ['Production Approved At', order.productionApprovedAt ? dateText(order.productionApprovedAt) : ''],
          ['Admin Approval', order.adminApprovedBy ? `Approved by ${order.adminApprovedBy}` : 'Pending'],
          ['Admin Approved At', order.adminApprovedAt ? dateText(order.adminApprovedAt) : ''],
        ],
      },
      {
        heading: 'Remarks',
        icon: FileText,
        rows: [['Remarks', order.remarks]],
      },
    ],
    summary: [
      { label: 'Planned Quantity', value: planned || '—' },
      { label: 'Recorded Output', value: output || '—' },
      { label: 'Rejected', value: rejected || '—' },
      { label: 'Progress', value: `${progressOf(planned, output)}%` },
    ],
    tables: [
      ...(items.length > 0
        ? [
            {
              key: 'items',
              label: 'Items',
              icon: Package,
              columns: [
                { key: 'product', label: 'Product / Item' },
                { key: 'code', label: 'Item Code' },
                { key: 'type', label: 'Production Type' },
                { key: 'quantity', label: 'Quantity', align: 'right' },
                { key: 'due', label: 'Item Due Date' },
                { key: 'drawing', label: 'Drawing' },
                { key: 'attachments', label: 'Attachments' },
              ],
              rows: items.map((item) => ({
                product: item.productName || item.product,
                code: item.productCode || item.itemCode,
                type: item.productionType,
                quantity: item.quantity,
                due: item.dueDate ? dateText(item.dueDate) : 'Not set',
                drawing: [item.drawingNumber, item.drawingRevision].filter(Boolean).join(' · '),
                attachments: filesForItem(item).map((file) => file.name).join(', '),
              })),
              emptyText: 'No items are recorded on this Work Order.',
            },
          ]
        : []),
      {
        key: 'stages',
        label: 'Stage Entries',
        icon: Layers,
        columns: [
          { key: 'stage', label: 'Stage' },
          { key: 'status', label: 'Status' },
          { key: 'input', label: 'Input', align: 'right' },
          { key: 'output', label: 'Output', align: 'right' },
          { key: 'rejected', label: 'Rejected', align: 'right' },
          { key: 'operator', label: 'Operator' },
          { key: 'date', label: 'Date' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: orderEntries.map((entry) => ({
          stage: entry.stage,
          status: <ProductionStatusBadge status={entry.status || 'Pending'} />,
          input: entry.inputQuantity,
          output: entry.outputQuantity,
          rejected: entry.rejectedQuantity,
          operator: entry.operator,
          date: dateText(entry.entryDate || entry.date),
          remarks: entry.remarks,
        })),
        emptyText: 'No stage entries have been recorded for this Work Order yet.',
      },
    ],
    attachments,
  };
}

function buildTechnicalVerificationView({ order, records, drawings, models }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const byItem = (item) =>
    (records || []).find(
      (record) =>
        matchesId(record.itemId ?? record.workOrderItemId, item.id) ||
        (!item.id && record.itemId === item.productName)
    ) || null;

  const itemRows = items.map((item) => {
    const record = byItem(item);
    return {
      item: item.productName || item.product,
      code: item.productCode || item.itemCode,
      type: item.productionType,
      quantity: item.quantity,
      status: <ProductionStatusBadge status={record?.verificationStatus || 'Pending'} />,
      verifiedBy: record?.verifiedBy,
      verifiedOn: record?.verificationDateTime || record?.updatedAt,
      remarks: record?.verificationRemarks,
    };
  });

  // A verification record may exist for a work order without item rows (legacy
  // data). Surface those records rather than hiding them.
  const unmatched = (records || []).filter(
    (record) =>
      !items.some(
        (item) =>
          matchesId(record.itemId ?? record.workOrderItemId, item.id) ||
          (!item.id && record.itemId === item.productName)
      )
  );
  unmatched.forEach((record) => {
    itemRows.push({
      item: record.itemProduct || record.product || '—',
      code: '',
      type: record.productionType,
      quantity: record.requiredQuantity,
      status: <ProductionStatusBadge status={record.verificationStatus || 'Pending'} />,
      verifiedBy: record.verifiedBy,
      verifiedOn: record.verificationDateTime || record.updatedAt,
      remarks: record.verificationRemarks,
    });
  });

  const statuses = (records || []).map((record) => record.verificationStatus || 'Pending');
  const overallStatus = statuses.length === 0
    ? 'Pending'
    : statuses.every((status) => status === 'Verified')
      ? 'Verified'
      : statuses.some((status) => status === 'Rejected')
        ? 'Rejected'
        : 'Pending';

  const verifiedCount = statuses.filter((status) => status === 'Verified').length;
  const rejectedCount = statuses.filter((status) => status === 'Rejected').length;
  const latest = (records || [])
    .filter((record) => record.verificationDateTime)
    .sort((a, b) => String(b.verificationDateTime).localeCompare(String(a.verificationDateTime)))[0];

  const checklistRows = [];
  (records || []).forEach((record) => {
    const checklist = parseMaybeJson(record.checklist);
    if (!checklist || typeof checklist !== 'object') return;
    Object.entries(checklist).forEach(([name, result]) => {
      checklistRows.push({
        check: name,
        result: result === true ? 'Yes' : result === false ? 'No' : result,
        remarks: record.verificationRemarks,
      });
    });
  });

  return {
    title: order.customer || order.product || 'Technical Verification',
    number: order.workOrder,
    subtitle: [order.product, cpoReference(order) ? `CPO ${cpoReference(order)}` : '']
      .filter(Boolean)
      .join(' · '),
    status: overallStatus,
    meta: [
      { label: 'CPO', value: cpoReference(order) },
      { label: 'Type', value: order.productionType || productionTypeOf(order) },
      { label: 'Items', value: items.length || '' },
      { label: 'Verified By', value: latest?.verifiedBy },
    ].filter((item) => item.value),
    sections: [
      {
        heading: 'Verification Information',
        icon: ShieldCheck,
        rows: [
          ['Work Order', order.workOrder],
          ['Customer', order.customer],
          ['CPO Reference', cpoReference(order)],
          ['Production Type', order.productionType || productionTypeOf(order)],
          ['Item Count', items.length],
          ['Overall Status', overallStatus],
          ['Last Verified By', latest?.verifiedBy],
          ['Last Verified On', latest?.verificationDateTime ? dateText(latest.verificationDateTime) : ''],
        ],
      },
      {
        heading: 'Work Order Details',
        icon: ClipboardList,
        rows: [
          ['Product / Item', order.product],
          ['Order Description', order.orderDescription || order.description],
          ['Quantity', order.quantity],
          ['Department', order.department],
          ['Start Date', dateText(order.startDate)],
          ['Due Date', dateText(order.dueDate)],
          ['Drawing Number', order.drawingNumber],
          ['Drawing Revision', order.drawingRevision],
        ],
      },
      {
        heading: 'Verification Remarks',
        icon: FileText,
        rows: (records || []).length > 0
          ? (records || []).map((record, index) => [
              record.itemProduct || `Item ${index + 1}`,
              record.verificationRemarks,
            ])
          : [['Remarks', 'No verification record has been saved yet.']],
      },
    ],
    summary: [
      { label: 'Items', value: items.length || (records || []).length || '—' },
      { label: 'Verified', value: verifiedCount },
      { label: 'Rejected', value: rejectedCount },
      { label: 'Pending', value: Math.max(0, (items.length || (records || []).length) - verifiedCount - rejectedCount) },
    ],
    tables: [
      {
        key: 'item-verifications',
        label: 'Item Verifications',
        icon: Package,
        columns: [
          { key: 'item', label: 'Item' },
          { key: 'code', label: 'Item Code' },
          { key: 'type', label: 'Production Type' },
          { key: 'quantity', label: 'Quantity', align: 'right' },
          { key: 'status', label: 'Status' },
          { key: 'verifiedBy', label: 'Verified By' },
          { key: 'verifiedOn', label: 'Verified On' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: itemRows,
        emptyText: 'No items are recorded on this Work Order.',
      },
      ...(checklistRows.length > 0
        ? [
            {
              key: 'checklist',
              label: 'Checklist',
              icon: ShieldCheck,
              columns: [
                { key: 'check', label: 'Verification Check' },
                { key: 'result', label: 'Result' },
                { key: 'remarks', label: 'Remarks' },
              ],
              rows: checklistRows,
              emptyText: 'No verification checklist has been saved.',
            },
          ]
        : []),
    ],
    attachments: attachmentsForOrder(order, drawings, models),
  };
}

function buildDrawingView({ drawing, order, drawings, models }) {
  const linkedOrder = (order || []).find?.((candidate) => matchesId(candidate.workOrder, drawing.workOrderId));
  return {
    title: drawing.drawingNumber || drawing.fileName || `Drawing #${drawing.id}`,
    number: revisionLabel(drawing.drawingRevision || drawing.revision),
    breadcrumb: drawing.drawingNumber,
    subtitle: [
      drawing.workOrderId ? `Work Order: ${drawing.workOrderId}` : '',
      drawing.itemName,
    ].filter(Boolean).join(' · '),
    status: drawing.verificationStatus || 'Pending',
    meta: [
      { label: 'Work Order', value: drawing.workOrderId },
      { label: 'File Type', value: extensionLabel(drawing) },
      { label: 'Uploaded', value: dateText(drawing.uploadedDate) },
    ].filter((item) => item.value),
    sections: [
      {
        heading: 'Drawing Information',
        icon: FileText,
        rows: [
          ['Drawing Number', drawing.drawingNumber],
          ['Revision', revisionLabel(drawing.drawingRevision || drawing.revision)],
          ['Work Order', drawing.workOrderId],
          ['Order / CPO', linkedOrder ? cpoReference(linkedOrder) : ''],
          ['Item', drawing.itemName],
          ['Uploaded By', drawing.uploadedBy],
          ['Uploaded Date', dateText(drawing.uploadedDate)],
          ['Verification Status', drawing.verificationStatus || 'Pending'],
          ['Verified By', drawing.verifiedBy],
          ['Verified On', drawing.verificationDateTime ? dateText(drawing.verificationDateTime) : ''],
        ],
      },
      {
        heading: 'File Information',
        icon: Paperclip,
        rows: [
          ['File Name', drawing.fileName],
          ['File Type', extensionLabel(drawing)],
          ['File Size', drawing.fileSize != null ? formatFileSize(drawing.fileSize) : ''],
          ['Preview Support', drawing.fileName ? capabilityLabel(drawing) : 'No file uploaded'],
          ['Verification Remarks', drawing.verificationRemarks],
        ],
      },
    ],
    summary: [
      { label: 'Revision', value: drawing.drawingRevision || drawing.revision || '—' },
      { label: 'Format', value: extensionLabel(drawing) },
      { label: 'Status', value: drawing.verificationStatus || 'Pending' },
    ],
    tables: [],
    attachments: attachmentsForOrder({ workOrder: drawing.workOrderId }, drawings, models).filter(
      (item) => item.key !== `drawing-${drawing.id}`
    ),
    file: { kind: 'drawing', record: drawing },
  };
}

function buildModelView({ model, order, drawings, models, history }) {
  const linkedOrder = (order || []).find?.((candidate) => matchesId(candidate.workOrder, model.workOrderId));
  const fileType = String(model.fileType || model.fileName?.split('.').pop() || '').toUpperCase().replace('.', '');
  const canView3D = VIEWABLE_MODEL_TYPES.includes(fileType);
  return {
    title: model.modelNumber || model.fileName || `Model #${model.id}`,
    number: revisionLabel(model.modelRevision),
    breadcrumb: model.modelNumber,
    subtitle: [
      model.workOrderId ? `Work Order: ${model.workOrderId}` : '',
      model.itemName,
    ].filter(Boolean).join(' · '),
    status: model.verificationStatus || 'Pending',
    meta: [
      { label: 'Work Order', value: model.workOrderId },
      { label: 'Format', value: fileType },
      { label: 'Uploaded', value: dateText(model.uploadedDate) },
    ].filter((item) => item.value),
    sections: [
      {
        heading: 'Model Information',
        icon: Box,
        rows: [
          ['Model Number', model.modelNumber],
          ['Revision', model.modelRevision],
          ['Work Order', model.workOrderId],
          ['Order / CPO', linkedOrder ? cpoReference(linkedOrder) : ''],
          ['Item / Product', model.itemName],
          ['Uploaded By', model.uploadedBy],
          ['Uploaded Date', dateText(model.uploadedDate)],
          ['Verification Status', model.verificationStatus || 'Pending'],
          ['Verified By', model.verifiedBy],
          ['Verified On', model.verificationDateTime ? dateText(model.verificationDateTime) : ''],
        ],
      },
      {
        heading: 'File & Conversion',
        icon: Paperclip,
        rows: [
          ['File Name', model.fileName],
          ['File Type', fileType],
          ['File Size', model.fileSize != null ? formatFileSize(model.fileSize) : ''],
          ['3D Conversion', model.conversionStatus],
          ['3D Viewer', canView3D ? 'Available' : 'Not available for this format'],
          ['Verification Remarks', model.verificationRemarks],
        ],
      },
    ],
    summary: [
      { label: 'Revision', value: revisionLabel(model.modelRevision) || '—' },
      { label: 'Format', value: fileType || '—' },
      { label: 'Conversion', value: model.conversionStatus || '—' },
    ],
    tables: [],
    timeline: (history || []).map((entry, index) => ({
      key: entry.id ?? index,
      title: entry.action || 'Model updated',
      detail: [entry.performedBy || 'System', entry.remarks].filter(Boolean).join(' · '),
      date: entry.performedAt,
    })),
    attachments: attachmentsForOrder({ workOrder: model.workOrderId }, drawings, models).filter(
      (item) => item.key !== `model-${model.id}` && item.key !== `model-${model.backendId}`
    ),
    file: { kind: 'model', record: model },
  };
}

function buildShopFloorView({ moduleKey, order, entries, highlightedJob }) {
  const orderEntries = (entries || []).filter(
    (entry) => matchesId(entry.workOrderId || entry.workOrder, order.workOrder)
  );
  const typeForModule = {
    casting: 'Casting',
    fabrication: 'Fabrication',
    assembly: 'Assembly',
  }[moduleKey];
  let sectionEntries = typeForModule
    ? orderEntries.filter((entry) => entry.productionType === typeForModule)
    : orderEntries;
  // Machine Shop jobs are regular stage entries that carry a machine
  // assignment. When none is assigned yet the board shows the Work Order's
  // entries, so the preview does the same rather than claiming "no data".
  if (moduleKey === 'machine-shop') {
    const machining = orderEntries.filter((entry) => entry.machineCode);
    sectionEntries = machining.length > 0 ? machining : orderEntries;
  }

  const planned = number(order.quantity);
  const output = sectionEntries.reduce((sum, entry) => sum + number(entry.outputQuantity), 0);
  const rejected = sectionEntries.reduce((sum, entry) => sum + number(entry.rejectedQuantity), 0);
  const status = statusOfEntries(sectionEntries);
  // Stage completion is derived from the SAVED stage entries only — the same
  // helper each board uses — so the strip, the percentage and the list can
  // never disagree, and a stage is never green just because an approval
  // happened or because it was picked in a dropdown.
  const stageProgress =
    moduleKey === 'casting'
      ? castingStageProgress(sectionEntries)
      : moduleKey === 'fabrication'
        ? fabricationStageProgress(sectionEntries)
        : moduleKey === 'assembly'
          ? assemblyStageProgress(sectionEntries)
          : null;
  const currentStage =
    stageProgress?.currentStage ||
    sectionEntries.find((entry) => entry.status === 'In Progress')?.stage ||
    sectionEntries[sectionEntries.length - 1]?.stage ||
    '—';
  // A row opened from the expanded job table carries that job's entry id.
  // Surface it explicitly so Preview always proves it opened the selected job,
  // not merely the Work Order that owns it.
  const selectedJob = highlightedJob
    ? sectionEntries.find(
        (entry) =>
          matchesId(entry.id, highlightedJob) ||
          matchesId(entry._backendId, highlightedJob) ||
          matchesId(entry.stage, highlightedJob)
      ) || null
    : null;

  return {
    title: order.customer || order.product || MODULES[moduleKey]?.label || 'Shop Floor',
    number: order.workOrder,
    subtitle: [order.product, cpoReference(order) ? `CPO ${cpoReference(order)}` : '']
      .filter(Boolean)
      .join(' · '),
    status,
    meta: [
      { label: 'Type', value: typeForModule || order.productionType || productionTypeOf(order) },
      { label: 'Stage', value: currentStage },
      { label: 'Due', value: dateText(order.dueDate) },
      { label: 'Jobs', value: sectionEntries.length || '' },
    ].filter((item) => item.value),
    sections: [
      {
        heading: `${MODULES[moduleKey]?.label || 'Shop Floor'} Work Information`,
        icon: Layers,
        rows: [
          ['Work Order', order.workOrder],
          ['CPO Reference', cpoReference(order)],
          ['Customer', order.customer],
          ['Product / Item', order.product],
          ['Production Type', typeForModule || order.productionType || productionTypeOf(order)],
          ['Department', order.department],
          ['Planned Quantity', planned],
          ['Current Stage', currentStage],
          ['Status', status],
        ],
      },
      {
        heading: 'Schedule',
        icon: History,
        rows: [
          ['Start Date', dateText(order.startDate)],
          ['Due Date', dateText(order.dueDate)],
          ['Priority', order.priority],
          ['Batch Number', order.batchNumber],
          ['Drawing Number', order.drawingNumber],
          ['Drawing Revision', order.drawingRevision],
        ],
      },
      {
        heading: 'Recorded Quantities',
        icon: Package,
        rows: [
          ['Recorded Output', output],
          ['Rejected', rejected],
          ['Pending', Math.max(0, planned - output - rejected)],
          ['Jobs Recorded', sectionEntries.length],
        ],
      },
      ...(selectedJob
        ? [
            {
              heading: 'Selected Job',
              icon: Wrench,
              rows: [
                ['Stage / Task', selectedJob.stage],
                ['Status', selectedJob.status],
                ['Input Quantity', selectedJob.inputQuantity],
                ['Output Quantity', selectedJob.outputQuantity],
                ['Rejected Quantity', selectedJob.rejectedQuantity],
                ['Operator', selectedJob.operator],
                ['Machine', selectedJob.machineCode],
                ['Date', dateText(selectedJob.entryDate || selectedJob.date)],
                ['Remarks', selectedJob.remarks],
              ],
            },
          ]
        : []),
    ],
    summary: [
      { label: 'Jobs', value: sectionEntries.length },
      { label: 'Output', value: output || '—' },
      { label: 'Rejected', value: rejected || '—' },
      { label: 'Progress', value: `${progressOf(planned, output)}%` },
      ...(stageProgress
        ? [{ label: 'Stages Done', value: `${stageProgress.doneCount}/${stageProgress.total}` }]
        : []),
    ],
    /* Casting / Fabrication: the workflow rendered as a progress strip in the
       Overview. Approval stays a separate step before it; the first workflow
       stage IS Technical Verification, so the gate is not repeated. */
    stageFlow: stageProgress
      ? {
          percent: stageProgress.percent,
          doneCount: stageProgress.doneCount,
          total: stageProgress.total,
          currentStage: stageProgress.currentStage,
          approval: {
            done: Boolean(order.productionApprovedBy && order.adminApprovedBy),
            label: order.productionApprovedBy && order.adminApprovedBy
              ? 'Approved'
              : order.productionApprovedBy
                ? 'Production Approved'
                : 'Pending',
          },
          steps: stageProgress.steps,
        }
      : undefined,
    tables: [
      {
        key: 'jobs',
        label: 'Jobs',
        icon: Layers,
        columns: [
          { key: 'stage', label: 'Stage' },
          { key: 'status', label: 'Status' },
          { key: 'input', label: 'Input', align: 'right' },
          { key: 'output', label: 'Output', align: 'right' },
          { key: 'rejected', label: 'Rejected', align: 'right' },
          { key: 'operator', label: 'Operator' },
          { key: 'machine', label: 'Machine' },
          { key: 'date', label: 'Date' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: sectionEntries.map((entry) => ({
          stage: entry.stage,
          status: <ProductionStatusBadge status={entry.status || 'Pending'} />,
          input: entry.inputQuantity,
          output: entry.outputQuantity,
          rejected: entry.rejectedQuantity,
          operator: entry.operator,
          machine: entry.machineCode,
          date: dateText(entry.entryDate || entry.date),
          remarks: entry.remarks,
        })),
        emptyText: `No ${MODULES[moduleKey]?.label || ''} stage entries are recorded for this Work Order yet.`,
      },
    ],
    attachments: [],
  };
}

function buildQualityView({ inspection }) {
  const checklistRaw = parseMaybeJson(inspection.checklist);
  const historyRaw = parseMaybeJson(inspection.history);
  const report = parseMaybeJson(inspection.inspectionReport) || {};
  const dimensions = parseMaybeJson(inspection.dimensionalInspection);
  const mtc = parseMaybeJson(inspection.materialTestCertificate) || {};
  const finalQc = parseMaybeJson(inspection.finalQcInfo) || {};

  const checklist = Array.isArray(checklistRaw)
    ? checklistRaw
    : checklistRaw && typeof checklistRaw === 'object'
      ? Object.entries(checklistRaw).map(([name, result]) => ({ name, result }))
      : [];

  const dimensionRows = Array.isArray(dimensions) ? dimensions : [];
  const history = Array.isArray(historyRaw) ? historyRaw : [];
  const chemical = mtc.chemicalAnalysis || {};
  const mechanical = mtc.mechanicalProperties || {};
  const inspected = inspection.quantityInspected;
  const accepted = inspection.acceptedQuantity ?? inspection.acceptedQty;
  const rejected = inspection.rejectedQuantity ?? inspection.rejectedQty;

  return {
    title: inspection.product || `Inspection ${inspection.id}`,
    number: inspection.id,
    subtitle: [
      inspection.productionOrder || inspection.workOrder
        ? `Work Order: ${inspection.productionOrder || inspection.workOrder}`
        : '',
      inspection.inspectionType,
    ].filter(Boolean).join(' · '),
    status: inspection.status || 'Pending',
    meta: [
      { label: 'Work Order', value: inspection.productionOrder || inspection.workOrder },
      { label: 'Type', value: inspection.inspectionType },
      { label: 'Inspected', value: dateText(inspection.inspectionDate) },
      { label: 'Inspector', value: inspection.inspector },
    ].filter((item) => item.value),
    sections: [
      {
        heading: 'Inspection Information',
        icon: ShieldCheck,
        rows: [
          ['Inspection ID', inspection.id],
          ['Work Order', inspection.productionOrder || inspection.workOrder],
          ['Product', inspection.product],
          ['Customer', inspection.customer],
          ['Department', inspection.department],
          ['Inspection Type', inspection.inspectionType],
          ['Inspection Date', dateText(inspection.inspectionDate)],
          ['Inspector', inspection.inspector],
          ['Quantity Inspected', inspected],
          ['Accepted Quantity', accepted],
          ['Rejected Quantity', rejected],
          ['Status', inspection.status],
        ],
      },
      {
        heading: 'Inspection Report',
        icon: FileText,
        rows: [
          ['Report Number', report.reportNumber || inspection.id],
          ['Customer', report.customer],
          ['Component Description', report.componentDescription],
          ['Drawing Number', report.drawingNumber],
          ['Quantity', report.quantity],
          ['Report Date', dateText(report.date)],
        ],
      },
      {
        heading: 'Material Test Certificate',
        icon: Paperclip,
        rows: [
          ['Chemical — C', chemical.c],
          ['Chemical — Si', chemical.si],
          ['Chemical — Mn', chemical.mn],
          ['Chemical — S', chemical.s],
          ['Chemical — P', chemical.p],
          ['Chemical — Cr', chemical.cr],
          ['Chemical — Ni', chemical.ni],
          ['Chemical — Mo', chemical.mo],
          ['Mechanical — YS', mechanical.ys],
          ['Mechanical — TS', mechanical.ts],
          ['Mechanical — Hardness', mechanical.hardness],
          ['Mechanical — Impact', mechanical.impact],
          ['Mechanical — Elongation', mechanical.elongation],
        ],
      },
      {
        heading: 'Final QC Information',
        icon: ClipboardList,
        rows: [
          ['Heat No.', finalQc.heatNo],
          ['Part No.', finalQc.partNo],
          ['Item Description', finalQc.itemDescription],
          ['Drawing No.', finalQc.drawingNo],
          ['Dispatch Quantity', finalQc.dispatchQty],
          ['Remarks', inspection.remarks],
        ],
      },
    ],
    summary: [
      { label: 'Inspected', value: inspected ?? '—' },
      { label: 'Accepted', value: accepted ?? '—' },
      { label: 'Rejected', value: rejected ?? '—' },
      { label: 'Status', value: inspection.status || 'Pending' },
    ],
    tables: [
      {
        key: 'checklist',
        label: 'Checklist',
        icon: ShieldCheck,
        columns: [
          { key: 'name', label: 'Check' },
          { key: 'result', label: 'Result' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: checklist.map((item) => ({
          name: item.name || item.check || '',
          result: item.result,
          remarks: item.remarks,
        })),
        emptyText: 'No inspection checklist has been recorded.',
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        icon: FileText,
        columns: [
          { key: 'drawingDimension', label: 'Drawing Dimension' },
          { key: 'measured1', label: 'M1' },
          { key: 'measured2', label: 'M2' },
          { key: 'measured3', label: 'M3' },
          { key: 'measured4', label: 'M4' },
          { key: 'measured5', label: 'M5' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: dimensionRows,
        emptyText: 'No dimensional inspection rows have been recorded.',
      },
    ],
    timeline: history.map((entry, index) => ({
      key: entry.id ?? index,
      title: entry.action || entry.newStatus || 'Inspection updated',
      detail: [
        entry.user || entry.performedBy,
        entry.previousStatus && entry.newStatus ? `${entry.previousStatus} → ${entry.newStatus}` : '',
        entry.remarks,
      ].filter(Boolean).join(' · '),
      date: entry.date || entry.performedAt,
    })),
    attachments: [],
  };
}

function buildPackingView({ record }) {
  const normalized = ensureBoxes(record) || record;
  const boxes = Array.isArray(normalized.packingBoxes) ? normalized.packingBoxes : [];
  const totals = overallTotals(boxes);
  const itemRows = [];
  boxes.forEach((box) => {
    (box.items || []).forEach((item) => {
      itemRows.push({
        box: box.boxNumber,
        description: item.description || item.itemDescription,
        partNumber: item.partNumber,
        quantity: item.quantity ?? item.qty,
        unit: item.unit,
        netWeight: item.netWeight,
        marks: item.marksNos,
      });
    });
  });

  return {
    title: record.product || record.id,
    number: record.id,
    subtitle: [
      record.productionOrder ? `Work Order: ${record.productionOrder}` : '',
      record.customer,
    ].filter(Boolean).join(' · '),
    status: record.status || 'Pending',
    meta: [
      { label: 'Work Order', value: record.productionOrder },
      { label: 'Packed Qty', value: packedQtyOf(record) },
      { label: 'Packing Date', value: dateText(record.packingDate) },
    ].filter((item) => item.value),
    sections: [
      {
        heading: 'Packing List Information',
        icon: Package,
        rows: [
          ['Packing List', record.id],
          ['Work Order', record.productionOrder],
          ['Sales Order', record.salesOrderNumber],
          ['Product', record.product],
          ['Customer', record.customer],
          ['Quantity', record.quantity],
          ['Packed Quantity', packedQtyOf(record)],
          ['Packing Date', dateText(record.packingDate)],
          ['Status', record.status],
          ['Created By', record.createdBy],
          ['Created At', record.createdAt ? dateText(record.createdAt) : ''],
        ],
      },
      {
        heading: 'Weights',
        icon: Boxes,
        rows: [
          ['Boxes', totals.boxes],
          ['Items', totals.totalItems],
          ['Total Quantity', totals.qty],
          ['Total Net Weight', totals.net],
          ['Total Gross Weight', totals.gross],
        ],
      },
      {
        heading: 'Remarks',
        icon: FileText,
        rows: [['Remarks', record.remarks]],
      },
    ],
    summary: [
      { label: 'Boxes', value: totals.boxes },
      { label: 'Items', value: totals.totalItems },
      { label: 'Packed Qty', value: packedQtyOf(record) || '—' },
      { label: 'Gross Weight', value: totals.gross || '—' },
    ],
    tables: [
      {
        key: 'boxes',
        label: 'Boxes',
        icon: Boxes,
        columns: [
          { key: 'boxNumber', label: 'Box' },
          { key: 'packageType', label: 'Package Type' },
          { key: 'dimensions', label: 'Dimensions' },
          { key: 'items', label: 'Items', align: 'right' },
          { key: 'quantity', label: 'Qty', align: 'right' },
          { key: 'net', label: 'Net Weight', align: 'right' },
          { key: 'gross', label: 'Gross Weight', align: 'right' },
        ],
        rows: boxes.map((box) => {
          const boxTotals = boxTotalsFor(box);
          return {
            boxNumber: box.boxNumber,
            packageType: box.packageType,
            dimensions: [box.length, box.width, box.height].filter(Boolean).join(' × '),
            items: boxTotals.itemCount,
            quantity: boxTotals.qty,
            net: boxTotals.net,
            gross: boxTotals.gross,
          };
        }),
        emptyText: 'This Packing List has no box detail stored.',
      },
      {
        key: 'packed-items',
        label: 'Items',
        icon: Package,
        columns: [
          { key: 'box', label: 'Box' },
          { key: 'description', label: 'Description' },
          { key: 'partNumber', label: 'Part Number' },
          { key: 'quantity', label: 'Quantity', align: 'right' },
          { key: 'unit', label: 'Unit' },
          { key: 'netWeight', label: 'Net Weight', align: 'right' },
          { key: 'marks', label: 'Marks / Nos.' },
        ],
        rows: itemRows,
        emptyText: 'This Packing List has no item detail stored.',
      },
    ],
    attachments: [],
  };
}

function buildDispatchView({ record }) {
  return {
    title: record.product || record.customer || record.id,
    number: record.id,
    subtitle: [
      record.productionOrder ? `Work Order: ${record.productionOrder}` : '',
      record.customer,
    ].filter(Boolean).join(' · '),
    status: record.status || 'Draft',
    meta: [
      { label: 'Work Order', value: record.productionOrder },
      { label: 'Dispatch Date', value: dateText(record.dispatchDate) },
      { label: 'Vehicle', value: record.vehicleNo },
    ].filter((item) => item.value),
    sections: [
      {
        heading: 'Dispatch Information',
        icon: Truck,
        rows: [
          ['Dispatch No.', record.id],
          ['Work Order', record.productionOrder],
          ['Order / PO No.', record.salesOrderNumber],
          ['Customer', record.customer],
          ['Product', record.product],
          ['Quantity', record.quantity],
          ['Packing Status', record.packingStatus],
          ['Packing List', record.packingListId],
          ['Packages', record.packageCount],
          ['Status', record.status],
        ],
      },
      {
        heading: 'Shipment Details',
        icon: Package,
        rows: [
          ['Dispatch Date', dateText(record.dispatchDate)],
          ['Expected Delivery', dateText(record.expectedDeliveryDate)],
          ['Transporter', record.transporter],
          ['Vehicle No.', record.vehicleNo],
          ['LR / Tracking No.', record.lrTrackingNo],
        ],
      },
      {
        heading: 'Audit',
        icon: History,
        rows: [
          ['Created By', record.createdBy],
          ['Created At', record.createdAt ? dateText(record.createdAt) : ''],
          ['Updated At', record.updatedAt ? dateText(record.updatedAt) : ''],
          ['Remarks', record.remarks],
        ],
      },
    ],
    summary: [
      { label: 'Quantity', value: record.quantity ?? '—' },
      { label: 'Packages', value: record.packageCount ?? '—' },
      { label: 'Packing Status', value: record.packingStatus || '—' },
      { label: 'Status', value: record.status || '—' },
    ],
    tables: [],
    attachments: [],
  };
}

// Local alias so the packing builder above cannot accidentally shadow the
// imported helper while keeping the imported name available to callers.
function boxTotalsFor(box) {
  return boxTotals(box);
}

/* ------------------------------------------------------------------ *
 * Presentational pieces shared by every record type.
 * ------------------------------------------------------------------ */
function CardHeader({ icon: Icon, title, count }) {
  return (
    <h3 className="ppv-card-title">
      <Icon size={16} />
      {title}
      {count !== undefined && count !== null ? <span className="ppv-card-count">({count})</span> : null}
    </h3>
  );
}

function FieldRow({ label, children, value }) {
  return (
    <div className="ppv-field-row">
      <span className="ppv-field-label">{label}</span>
      <span className="ppv-field-value">{children ?? text(value)}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="ppv-empty">
      <Icon size={34} />
      <h4>{title}</h4>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function DataTable({ table }) {
  if (!table) return null;
  return (
    <div className="ppv-table-card">
      <div className="ppv-table-head">
        <CardHeader icon={table.icon || Package} title={table.label} count={table.rows.length} />
      </div>
      {table.rows.length === 0 ? (
        <EmptyState icon={table.icon || Package} title={`No ${table.label.toLowerCase()}`} subtitle={table.emptyText} />
      ) : (
        <div className="ppv-table-wrap">
          <table className="ppv-table">
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column.key} style={{ textAlign: column.align || 'left' }}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {table.columns.map((column) => (
                    <td key={column.key} style={{ textAlign: column.align || 'left' }}>
                      {row[column.key] === undefined || row[column.key] === null || row[column.key] === ''
                        ? '—'
                        : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Timeline({ entries }) {
  return (
    <div className="ppv-card">
      <CardHeader icon={History} title="History" count={entries.length} />
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No history recorded" subtitle="No timeline entries are available for this record." />
      ) : (
        <div className="ppv-timeline">
          {entries.map((entry) => (
            <div className="ppv-timeline-item" key={entry.key}>
              <span className="ppv-timeline-dot" aria-hidden="true" />
              <div>
                <div className="ppv-timeline-title">{entry.title}</div>
                {entry.detail ? <div className="ppv-timeline-detail">{entry.detail}</div> : null}
                <div className="ppv-timeline-date">{dateText(entry.date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export default function ProductionPreview() {
  const { module: moduleKey, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const config = MODULES[moduleKey];
  const decodedId = decodeURIComponent(id || '');
  const highlightedJob = searchParams.get('job') || '';

  const { orders, loading: ordersLoading } = useProductionOrders();
  const { technicalVerifications, loading: tvLoading } = useTechnicalVerification();
  const { records: drawings, loading: drawingsLoading } = useDrawings();
  const { records: models, loading: modelsLoading } = useModels();
  const { inspections, loading: qualityLoading } = useQuality();
  const { records: packingRecords, loading: packingLoading } = usePacking();
  const { records: dispatchRecords, loading: dispatchLoading } = useDispatch();
  const { entries, loading: entriesLoading } = useProductionEntry();

  /* The tab belongs to a specific record. Keying it to the route avoids an
     effect that resets state after every navigation (which would render the
     previous tab once before switching). */
  const viewKey = `${moduleKey}:${decodedId}`;
  const [tabState, setTabState] = useState({ key: viewKey, tab: 'overview' });
  const tab = tabState.key === viewKey ? tabState.tab : 'overview';
  const setTab = (nextTab) => setTabState({ key: viewKey, tab: nextTab });
  const [drawingViewer, setDrawingViewer] = useState(null);
  const [modelHistoryState, setModelHistoryState] = useState({ key: null, rows: [] });
  // Item-wise attachments of an order preview, keyed on the order's backend id so
  // a navigation can never show the previous order's item files.
  const [itemAttachmentState, setItemAttachmentState] = useState({ key: null, byItem: {} });

  /* ---------------- record resolution ---------------- */
  const order = useMemo(() => {
    if (!['orders', 'technical-verification', 'casting', 'fabrication', 'machine-shop', 'assembly'].includes(moduleKey)) {
      return null;
    }
    return (
      orders.find(
        (candidate) =>
          matchesId(candidate.workOrder, decodedId) ||
          matchesId(candidate.id, decodedId) ||
          matchesId(candidate.backendId, decodedId)
      ) || null
    );
  }, [orders, moduleKey, decodedId]);

  const drawing = useMemo(
    () =>
      moduleKey === 'drawings'
        ? drawings.find(
            (record) =>
              matchesId(record.id, decodedId) ||
              matchesId(record.backendId, decodedId) ||
              matchesId(record.drawingNumber, decodedId)
          ) || null
        : null,
    [drawings, moduleKey, decodedId]
  );

  const model = useMemo(
    () =>
      moduleKey === 'models'
        ? models.find(
            (record) =>
              matchesId(record.id, decodedId) ||
              matchesId(record.backendId, decodedId) ||
              matchesId(record.modelNumber, decodedId)
          ) || null
        : null,
    [models, moduleKey, decodedId]
  );

  /* ONE inspection, read from the API by id.
     This used to resolve from the Quality list cache only, so a preview could
     show a different version of the record than the list (or than the saved
     row) whenever that cache was older — e.g. an inspection created or edited
     in another tab, or a stale copy left behind after the same id was deleted
     and re-created. The list page caps its fetch (`size: 500`, which the
     backend clamps to 200), so a longer history could not be previewed at all.
     The cached row is still used as an immediate fallback while this read is
     in flight, so the page never flashes empty. */
  const inspectionState = useInspectionRecord(moduleKey === 'quality' ? decodedId : '', viewKey);

  const inspection = useMemo(() => {
    if (moduleKey !== 'quality') return null;
    if (inspectionState.key === viewKey && inspectionState.record) return inspectionState.record;
    return (
      inspections.find(
        (record) => matchesId(record.id, decodedId) || matchesId(record.backendId, decodedId)
      ) || null
    );
  }, [inspections, moduleKey, decodedId, inspectionState, viewKey]);

  const packingRecord = useMemo(
    () =>
      moduleKey === 'packing'
        ? packingRecords.find(
            (record) => matchesId(record.id, decodedId) || matchesId(record.backendId, decodedId)
          ) || null
        : null,
    [packingRecords, moduleKey, decodedId]
  );

  const dispatchRecord = useMemo(
    () =>
      moduleKey === 'dispatch'
        ? dispatchRecords.find(
            (record) => matchesId(record.id, decodedId) || matchesId(record.backendId, decodedId)
          ) || null
        : null,
    [dispatchRecords, moduleKey, decodedId]
  );

  const tvRecords = useMemo(
    () =>
      moduleKey === 'technical-verification' && order
        ? technicalVerifications.filter(
            (record) =>
              matchesId(record.workOrderId, order.workOrder) ||
              matchesId(record.workOrderNumber, order.workOrder)
          )
        : [],
    [technicalVerifications, moduleKey, order]
  );

  /* ---------------- model audit history ---------------- */
  const modelHistoryKey = model ? String(model.backendId || model.id) : null;
  const modelHistory = useMemo(
    () => (modelHistoryState.key === modelHistoryKey ? modelHistoryState.rows : []),
    [modelHistoryState, modelHistoryKey]
  );

  useEffect(() => {
    if (moduleKey !== 'models' || !model) return undefined;
    const backendId = model.backendId || model.id;
    if (typeof backendId !== 'number') return undefined;
    let cancelled = false;
    modelApi
      .getHistory(backendId)
      .then((response) => {
        if (cancelled) return;
        const data = response?.data ?? response;
        setModelHistoryState({
          key: String(backendId),
          rows: Array.isArray(data) ? data : [],
        });
      })
      .catch(() => {
        if (!cancelled) setModelHistoryState({ key: String(backendId), rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [moduleKey, model]);

  /* ---------------- item-wise attachments (Work Order preview) ---------------- */
  useEffect(() => {
    if (moduleKey !== 'orders' || !order?.backendId) return undefined;
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) return undefined;
    const backendId = order.backendId;
    let cancelled = false;
    (async () => {
      const byItem = {};
      await Promise.all(
        items.map(async (item) => {
          if (item?.id == null) return;
          try {
            const response = await api.get(
              `/production-orders/${backendId}/items/${item.id}/attachments`
            );
            const body = response?.data;
            byItem[String(item.id)] = Array.isArray(body)
              ? body
              : Array.isArray(body?.data)
                ? body.data
                : [];
          } catch {
            // An unreadable item keeps its row; it just shows no attachments.
            byItem[String(item.id)] = [];
          }
        })
      );
      if (!cancelled) setItemAttachmentState({ key: String(backendId), byItem });
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleKey, order]);

  const itemAttachments = useMemo(
    () => (order && itemAttachmentState.key === String(order.backendId) ? itemAttachmentState.byItem : {}),
    [order, itemAttachmentState]
  );

  const loading =
    {
      orders: ordersLoading,
      'technical-verification': ordersLoading || tvLoading,
      drawings: drawingsLoading,
      models: modelsLoading,
      casting: ordersLoading || entriesLoading,
      fabrication: ordersLoading || entriesLoading,
      'machine-shop': ordersLoading || entriesLoading,
      assembly: ordersLoading || entriesLoading,
      quality: qualityLoading || inspectionState.loading,
      packing: packingLoading,
      dispatch: dispatchLoading,
    }[moduleKey] || false;

  const record = {
    orders: order,
    'technical-verification': order,
    drawings: drawing,
    models: model,
    casting: order,
    fabrication: order,
    'machine-shop': order,
    assembly: order,
    quality: inspection,
    packing: packingRecord,
    dispatch: dispatchRecord,
  }[moduleKey];

  const view = useMemo(() => {
    if (!config || !record) return null;
    switch (moduleKey) {
      case 'orders':
        return buildOrderView({ order, entries, drawings, models, itemAttachments });
      case 'technical-verification':
        return buildTechnicalVerificationView({ order, records: tvRecords, drawings, models });
      case 'drawings':
        return buildDrawingView({ drawing, order: orders, drawings, models });
      case 'models':
        return buildModelView({ model, order: orders, drawings, models, history: modelHistory });
      case 'casting':
      case 'fabrication':
      case 'machine-shop':
      case 'assembly':
        return buildShopFloorView({ moduleKey, order, entries, highlightedJob });
      case 'quality':
        return buildQualityView({ inspection });
      case 'packing':
        return buildPackingView({ record: packingRecord });
      case 'dispatch':
        return buildDispatchView({ record: dispatchRecord });
      default:
        return null;
    }
  }, [
    config,
    moduleKey,
    record,
    order,
    entries,
    drawings,
    models,
    tvRecords,
    inspection,
    packingRecord,
    dispatchRecord,
    drawing,
    model,
    modelHistory,
    orders,
    highlightedJob,
    itemAttachments,
  ]);

  /* ---------------- file actions ---------------- */
  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  /** Item attachment files live in the shared store — open/download them through
      the authenticated API instead of navigating to a record preview. */
  const handleItemAttachmentOpen = async (attachment) => {
    if (!attachment?.url) return;
    try {
      const response = await api.get(attachment.url, { responseType: 'blob' });
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: attachment.contentType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error('Could not open this item attachment.');
    }
  };

  const handleItemAttachmentDownload = async (attachment) => {
    if (!attachment?.url) return;
    try {
      const response = await api.get(attachment.url, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      downloadBlob(blob, attachment.downloadName || attachment.label || 'attachment');
    } catch {
      toast.error('Could not download this item attachment.');
    }
  };

  const handleDrawingDownload = async (drawingRecord) => {
    if (!drawingRecord?.id) return;
    try {
      const response = await api.get(`/drawings/${drawingRecord.id}/download`, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      downloadBlob(blob, drawingRecord.fileName || `drawing-${drawingRecord.id}`);
    } catch {
      toast.error('Could not download the drawing file.');
    }
  };

  const handleModelDownload = async (modelRecord) => {
    const backendId = modelRecord?.backendId || modelRecord?.id;
    if (!backendId) return;
    try {
      const response = await api.get(`/models/${backendId}/download`, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      downloadBlob(blob, modelRecord.fileName || `model-${backendId}`);
    } catch {
      toast.error('Could not download the model file.');
    }
  };

  /* ---------------- loading / error states ---------------- */
  if (!config) {
    return (
      <div className="ppv-page">
        <div className="ppv-card ppv-state-card">
          <EmptyState
            icon={ClipboardList}
            title="Preview not available"
            subtitle="This Production record type does not have a preview."
          />
          <button type="button" className="ppv-action ppv-action-ghost" onClick={() => navigate('/production')}>
            <ArrowLeft size={14} /> Back to Production
          </button>
        </div>
      </div>
    );
  }

  if (loading && !record) {
    return (
      <div className="ppv-page ppv-loading">
        <Loader2 size={24} className="ppv-spin" />
        <span>Loading preview…</span>
      </div>
    );
  }

  if (!record || !view) {
    return (
      <div className="ppv-page">
        <nav className="ppv-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => navigate('/production')}>Production</button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={() => navigate(config.listPath)}>{config.label}</button>
          <span aria-hidden="true">/</span>
          <span className="ppv-breadcrumb-current">Not found</span>
        </nav>
        <div className="ppv-card ppv-state-card">
          <EmptyState
            icon={config.icon}
            title={`${config.label} record not found`}
            subtitle={`The record "${decodedId}" could not be found. It may have been deleted, or it may still be loading.`}
          />
          <button type="button" className="ppv-action ppv-action-primary" onClick={() => navigate(config.listPath)}>
            <ArrowLeft size={14} /> Back to {config.label}
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: config.icon },
    ...(view.tables || []).map((table) => ({ key: table.key, label: table.label, icon: table.icon || Package })),
    ...(view.timeline && view.timeline.length > 0
      ? [{ key: 'history', label: 'History', icon: History, count: view.timeline.length }]
      : []),
    ...(view.attachments && view.attachments.length > 0
      ? [{ key: 'attachments', label: 'Attachments', icon: Paperclip, count: view.attachments.length }]
      : []),
    ...(view.file ? [{ key: 'file', label: view.file.kind === 'model' ? 'Model File' : 'File', icon: Paperclip }] : []),
  ];

  const activeTable = (view.tables || []).find((table) => table.key === tab);

  return (
    <div className="ppv-page erp-detail-scope">
      <nav className="ppv-breadcrumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => navigate('/production')}>Production</button>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={() => navigate(config.listPath)}>{config.label}</button>
        <span aria-hidden="true">/</span>
        <span className="ppv-breadcrumb-current">{view.breadcrumb || view.number || view.title}</span>
      </nav>

      <div className="ppv-header-sticky">
        <section className="ppv-header-card">
          <div className="ppv-header-main">
            <div className="ppv-avatar" aria-hidden="true">{initialOf(view.title)}</div>
            <div className="ppv-title-wrap">
              <h1 className="ppv-title">
                {view.title}
                {view.number ? <span className="ppv-title-number">({view.number})</span> : null}
              </h1>
              <div className="ppv-subtitle">{view.subtitle || '—'}</div>
              <div className="ppv-meta">
                <ProductionStatusBadge status={view.status || 'Pending'} />
                {(view.meta || []).map((item) => (
                  <span className="ppv-chip" key={item.label}>
                    <span className="ppv-chip-label">{item.label}</span>
                    {item.value}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="erp-detail-actions ppv-actions">
            <button type="button" className="erp-detail-action" onClick={() => navigate(config.listPath)}>
              <ArrowLeft size={14} /> Back to List
            </button>
            <button type="button" className="erp-detail-action" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
          </div>
        </section>

        <div className="ppv-tabs" role="tablist" aria-label={`${config.label} preview sections`}>
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`ppv-tab${active ? ' is-active' : ''}`}
                onClick={() => setTab(item.key)}
              >
                <Icon size={14} />
                {item.label}
                {item.count !== undefined ? <span className="ppv-tab-count">{item.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ppv-content">
        {tab === 'overview' && (
          <div className="ppv-overview-grid">
            <div className="ppv-overview-main">
              {view.stageFlow && (
                <section className="ppv-card ppv-stage-card">
                  <CardHeader
                    icon={Flame}
                    title={`${MODULES[moduleKey]?.label || 'Casting'} Stage Progress`}
                    count={`${view.stageFlow.doneCount}/${view.stageFlow.total}`}
                  />
                  <div
                    className="ppv-stage-meter"
                    role="img"
                    aria-label={`${view.stageFlow.percent}% of ${MODULES[moduleKey]?.label || 'shop floor'} stages complete`}
                  >
                    <span
                      className="ppv-stage-meter-fill"
                      style={{ width: `${view.stageFlow.percent}%` }}
                    />
                  </div>
                  <div className="ppv-stage-meta">
                    <span className="ppv-stage-percent">
                      {view.stageFlow.doneCount} of {view.stageFlow.total} stages complete · {view.stageFlow.percent}%
                    </span>
                    <span className="ppv-stage-current">
                      {view.stageFlow.currentStage
                        ? `Current stage: ${view.stageFlow.currentStage}`
                        : 'No stage recorded yet'}
                    </span>
                  </div>
                  <div className="ppv-stage-flow">
                    <div
                      className={`ppv-stage-step${view.stageFlow.approval.done ? ' is-done' : ' is-pending'}`}
                      title={`Approval: ${view.stageFlow.approval.label}`}
                    >
                      <span className="ppv-stage-dot">
                        {view.stageFlow.approval.done ? <Check size={11} /> : null}
                      </span>
                      <span className="ppv-stage-name">Approval</span>
                      <span className="ppv-stage-status">{view.stageFlow.approval.label}</span>
                    </div>
                    <span
                      className={`ppv-stage-connector${view.stageFlow.approval.done ? ' is-done' : ''}`}
                      aria-hidden="true"
                    />
                    {view.stageFlow.steps.map((step, index) => (
                      <Fragment key={step.stage}>
                        <div
                          className={`ppv-stage-step${step.done ? ' is-done' : ''}${
                            step.current ? ' is-current' : ''
                          }${!step.done && !step.current ? ' is-pending' : ''}`}
                          title={`${step.stage}: ${step.status}`}
                        >
                          <span className="ppv-stage-dot">
                            {step.done ? <Check size={11} /> : null}
                          </span>
                          <span className="ppv-stage-name">{step.stage}</span>
                          <span className="ppv-stage-status">
                            {step.done ? 'Completed' : step.current ? step.status : 'Pending'}
                          </span>
                        </div>
                        {index < view.stageFlow.steps.length - 1 && (
                          <span
                            className={`ppv-stage-connector${step.done ? ' is-done' : ''}`}
                            aria-hidden="true"
                          />
                        )}
                      </Fragment>
                    ))}
                  </div>
                </section>
              )}
              {(view.sections || []).map((section) => {
                const Icon = section.icon || FileText;
                return (
                  <section className="ppv-card" key={section.heading}>
                    <CardHeader icon={Icon} title={section.heading} />
                    {section.rows.length === 0 ? (
                      <EmptyState icon={Icon} title="No details recorded" />
                    ) : (
                      section.rows.map(([label, value], index) => (
                        <FieldRow key={`${label}-${index}`} label={label} value={value} />
                      ))
                    )}
                  </section>
                );
              })}
            </div>
            {view.summary && view.summary.length > 0 && (
              <aside className="ppv-summary">
                <section className="ppv-card">
                  <CardHeader icon={Boxes} title="Summary" />
                  {view.summary.map((item) => (
                    <div className="ppv-summary-row" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{text(item.value)}</strong>
                    </div>
                  ))}
                </section>
              </aside>
            )}
          </div>
        )}

        {activeTable ? <DataTable table={activeTable} /> : null}

        {tab === 'history' && view.timeline && <Timeline entries={view.timeline} />}

        {tab === 'attachments' && view.attachments && (
          <section className="ppv-card">
            <CardHeader icon={Paperclip} title="Attachments" count={view.attachments.length} />
            <div className="ppv-attachment-grid">
              {view.attachments.map((attachment) => (
                <div className="ppv-attachment" key={attachment.key}>
                  <div className="ppv-attachment-icon">
                    {attachment.url ? (
                      <Paperclip size={18} />
                    ) : attachment.kind === 'Drawing' ? (
                      <FileText size={18} />
                    ) : (
                      <Box size={18} />
                    )}
                  </div>
                  <div className="ppv-attachment-body">
                    <div className="ppv-attachment-title">{attachment.label}</div>
                    <div className="ppv-attachment-meta">
                      {attachment.kind}
                      {attachment.meta ? ` · ${attachment.meta}` : ''}
                    </div>
                    {attachment.status ? (
                      <ProductionStatusBadge status={attachment.status} />
                    ) : null}
                  </div>
                  {attachment.url ? (
                    <div className="ppv-attachment-actions">
                      <button
                        type="button"
                        className="ppv-action ppv-action-ghost"
                        onClick={() => handleItemAttachmentOpen(attachment)}
                      >
                        <Eye size={14} /> Preview
                      </button>
                      <button
                        type="button"
                        className="ppv-action ppv-action-ghost"
                        onClick={() => handleItemAttachmentDownload(attachment)}
                      >
                        <Download size={14} /> Download
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ppv-action ppv-action-ghost"
                      onClick={() => navigate(attachment.path)}
                    >
                      <Eye size={14} /> Preview
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'file' && view.file && (
          <section className="ppv-card">
            <CardHeader
              icon={Paperclip}
              title={view.file.kind === 'model' ? 'Model File' : 'Drawing File'}
            />
            {view.file.kind === 'drawing' ? (
              <>
                <FieldRow label="File Name" value={view.file.record.fileName} />
                <FieldRow label="Format" value={extensionLabel(view.file.record)} />
                <FieldRow label="File Size" value={view.file.record.fileSize != null ? formatFileSize(view.file.record.fileSize) : ''} />
                <FieldRow label="Preview Support" value={capabilityLabel(view.file.record)} />
                {view.file.record.fileName ? (
                  <div className="ppv-file-actions">
                    {canPreviewInApp(view.file.record) ? (
                      <button
                        type="button"
                        className="ppv-action ppv-action-primary"
                        onClick={() => setDrawingViewer(view.file.record)}
                      >
                        <Eye size={14} /> Open Preview
                      </button>
                    ) : (
                      <p className="ppv-file-note">{previewUnavailableReason(view.file.record)}</p>
                    )}
                    <button
                      type="button"
                      className="ppv-action ppv-action-ghost"
                      onClick={() => handleDrawingDownload(view.file.record)}
                    >
                      <Download size={14} /> Download File
                    </button>
                  </div>
                ) : (
                  <EmptyState icon={FileText} title="No file uploaded" subtitle="This Drawing record has no stored file." />
                )}
              </>
            ) : (
              <>
                <FieldRow label="File Name" value={view.file.record.fileName} />
                <FieldRow label="Format" value={view.file.record.fileType} />
                <FieldRow label="File Size" value={view.file.record.fileSize != null ? formatFileSize(view.file.record.fileSize) : ''} />
                <FieldRow label="3D Conversion" value={view.file.record.conversionStatus} />
                <div className="ppv-file-actions">
                  {VIEWABLE_MODEL_TYPES.includes(
                    String(view.file.record.fileType || view.file.record.fileName?.split('.').pop() || '')
                      .toUpperCase()
                      .replace('.', '')
                  ) ? (
                    <button
                      type="button"
                      className="ppv-action ppv-action-primary"
                      onClick={() =>
                        window.open(
                          `/model-viewer/${view.file.record.backendId || view.file.record.id}`,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                    >
                      <Eye size={14} /> View 3D Model
                    </button>
                  ) : (
                    <p className="ppv-file-note">This file format has no in-app 3D viewer.</p>
                  )}
                  <button
                    type="button"
                    className="ppv-action ppv-action-ghost"
                    onClick={() => handleModelDownload(view.file.record)}
                  >
                    <Download size={14} /> Download File
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <Drawing2DViewer
        record={drawingViewer}
        onClose={() => setDrawingViewer(null)}
        onDownload={handleDrawingDownload}
      />
    </div>
  );
}

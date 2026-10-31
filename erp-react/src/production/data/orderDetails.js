// ============================================================
// Production Order Details — demo data generator.
// Builds Operations / Materials / Quality / Timeline / History
// from a production order so every order (including newly
// created ones) has a complete detail screen.
// ============================================================
import { stageGroupOf } from './orders';
import { initialDispatchRecords } from './dispatch';

const OPERATORS = ['R. Kumar', 'S. Iyer', 'M. Patel', 'A. Verma', 'D. Rao', 'P. Nair'];

const OPERATIONS_BY_DEPARTMENT = {
  Casting: ['Moulding', 'Pouring', 'Blasting', 'Fettling'],
  Fabrication: ['Cutting', 'Forming', 'Welding', 'Finishing'],
  'Machine Shop': ['CNC Turning', 'Drilling', 'Milling', 'Deburring'],
  Assembly: ['Pre-Assembly', 'Sub-Assembly', 'Final Assembly', 'Fitting'],
  Quality: ['Incoming Inspection', 'In-Process Check', 'Final Inspection'],
  Packing: ['Packing', 'Sealing', 'Labelling'],
  Dispatch: ['Documentation', 'Vehicle Loading', 'Vehicle Dispatch'],
};

const MATERIALS_BY_DEPARTMENT = {
  Casting: [
    { code: 'RM-CST-101', name: 'Cast Iron Ingot', unit: 'kg', factor: 1.2 },
    { code: 'RM-SND-102', name: 'Foundry Sand', unit: 'kg', factor: 0.8 },
    { code: 'RM-BND-103', name: 'Casting Binder', unit: 'L', factor: 0.15 },
  ],
  Fabrication: [
    { code: 'RM-STL-201', name: 'Mild Steel Sheet', unit: 'kg', factor: 1.1 },
    { code: 'RM-ELC-202', name: 'Welding Electrode', unit: 'no', factor: 2 },
    { code: 'RM-PNT-203', name: 'Anti-rust Primer', unit: 'L', factor: 0.1 },
  ],
  'Machine Shop': [
    { code: 'RM-BLT-301', name: 'Hex Bolt M8', unit: 'no', factor: 4 },
    { code: 'RM-NUT-302', name: 'Hex Nut M8', unit: 'no', factor: 4 },
    { code: 'RM-OIL-303', name: 'Cutting Oil', unit: 'L', factor: 0.2 },
  ],
  Assembly: [
    { code: 'RM-FRM-401', name: 'Frame Assembly', unit: 'no', factor: 1 },
    { code: 'RM-SCR-402', name: 'Screw Pack', unit: 'no', factor: 6 },
    { code: 'RM-GSK-403', name: 'Gasket Kit', unit: 'no', factor: 1 },
  ],
  Quality: [{ code: 'RM-GGE-501', name: 'Inspection Gauge Set', unit: 'set', factor: 0.02 }],
  Packing: [
    { code: 'PK-BOX-601', name: 'Export Carton', unit: 'no', factor: 0.1 },
    { code: 'PK-TPE-602', name: 'Strapping Tape', unit: 'roll', factor: 0.05 },
  ],
  Dispatch: [{ code: 'DP-DOC-701', name: 'Shipping Labels', unit: 'no', factor: 0.1 }],
};

/** Spread an order's overall progress across its operations. */
function distributeProgress(progress, count) {
  const per = 100 / count;
  return Array.from({ length: count }, (_, i) => {
    const start = i * per;
    if (progress >= start + per) return 100;
    if (progress <= start) return 0;
    return Math.round(((progress - start) / per) * 100);
  });
}

function buildOperations(order) {
  const names = OPERATIONS_BY_DEPARTMENT[order.department] || ['Operation 1', 'Operation 2', 'Operation 3'];
  const perOp = distributeProgress(order.progress, names.length);
  return names.map((name, i) => {
    const p = perOp[i];
    const completed = Math.round((order.quantity * p) / 100);
    return {
      operation: name,
      department: order.department,
      plannedQuantity: order.quantity,
      completedQuantity: completed,
      startTime: p > 0 ? `${order.startDate}T0${8 + Math.floor(i / 2)}:00:00` : null,
      endTime: p === 100 ? `${order.startDate}T1${i}:30:00` : null,
      operator: p > 0 ? OPERATORS[i % OPERATORS.length] : '—',
      status: p === 100 ? 'Completed' : p > 0 ? 'In Progress' : 'Pending',
      progress: p,
    };
  });
}

function buildMaterials(order) {
  const templates = MATERIALS_BY_DEPARTMENT[order.department] || [];
  const ratio = order.progress / 100;
  return templates.map((m) => {
    const required = Math.max(1, Math.round(order.quantity * m.factor));
    const issued = Math.min(required, Math.round(required * Math.min(1, ratio + 0.15)));
    const consumed = Math.round(issued * 0.85);
    let status = 'Pending';
    if (consumed > 0) status = 'Consumed';
    else if (issued >= required) status = 'Issued';
    else if (issued > 0) status = 'Partially Issued';
    return {
      materialCode: m.code,
      materialName: m.name,
      requiredQuantity: required,
      issuedQuantity: issued,
      consumedQuantity: consumed,
      unit: m.unit,
      status,
    };
  });
}

function buildQuality(order) {
  const passed = ['Completed', 'Packed', 'Ready for Dispatch'].includes(order.status);
  const pendingQc = order.status === 'Pending QC';
  if (passed) {
    return {
      inspectionStatus: 'Passed',
      inspector: 'QC Lead',
      inspectionDate: order.dueDate,
      acceptedQuantity: order.quantity,
      rejectedQuantity: 0,
      remarks: 'All inspection parameters within tolerance.',
    };
  }
  if (pendingQc) {
    return {
      inspectionStatus: 'Pending',
      inspector: 'QC Lead',
      inspectionDate: order.dueDate,
      acceptedQuantity: Math.round(order.quantity * 0.9),
      rejectedQuantity: order.quantity - Math.round(order.quantity * 0.9),
      remarks: 'Awaiting final inspection sign-off.',
    };
  }
  if (order.progress < 30 || order.status === 'Pending') {
    return {
      inspectionStatus: 'Not Started',
      inspector: '—',
      inspectionDate: null,
      acceptedQuantity: 0,
      rejectedQuantity: 0,
      remarks: 'Inspection scheduled once production reaches the Quality stage.',
    };
  }
  return {
    inspectionStatus: 'In Progress',
    inspector: 'QC Lead',
    inspectionDate: null,
    acceptedQuantity: Math.round(order.quantity * 0.75),
    rejectedQuantity: Math.round(order.quantity * 0.05),
    remarks: 'In-process checks ongoing.',
  };
}

function buildTimeline(order) {
  const events = [];
  const push = (event, date, time, status, user) =>
    events.push({ event, date: `${date}T${time}:00`, status, user });

  const done = ['Completed', 'Packed', 'Ready for Dispatch'];

  push('Work Order Created', order.startDate, '09:00', 'Completed', 'Planner');

  if (order.status !== 'Pending') {
    push('Production Started', order.startDate, '09:15', 'Completed', 'Supervisor');
  }

  // Stages the order has passed through (incl. the current one).
  const stageOrder = ['Casting', 'Fabrication', 'Machine Shop', 'Assembly', 'Quality', 'Packing', 'Dispatch'];
  const current = stageGroupOf(order.currentStage);
  const idx = stageOrder.indexOf(current);
  stageOrder.slice(0, idx + 1).forEach((stage, i) => {
    if (stage !== current || order.status !== 'Pending') {
      push(`${stage} Started`, order.startDate, `${10 + i}:00`, order.status === 'Pending' && stage === current ? 'Pending' : 'Completed', OPERATORS[i % OPERATORS.length]);
    }
  });

  // Production completed milestone.
  if (done.includes(order.status)) {
    push('Production Completed', order.dueDate, '10:30', 'Completed', 'Supervisor');
  }

  if (order.status === 'Pending QC' || done.includes(order.status)) {
    push('QC Started', order.startDate, `${10 + stageOrder.length}:00`, 'Completed', 'QC Lead');
  }
  if (done.includes(order.status)) {
    push('QC Passed', order.dueDate, '11:00', 'Completed', 'QC Lead');
  }

  if (order.status === 'Packed' || order.status === 'Ready for Dispatch') {
    push('Packing Started', order.dueDate, '11:15', 'Completed', 'Store Keeper');
    push('Packed', order.dueDate, '11:30', 'Completed', 'Store Keeper');
  }
  if (order.status === 'Ready for Dispatch') {
    push('Ready for Dispatch', order.dueDate, '12:00', 'Completed', 'Dispatcher');
  }

  // If a dispatch record for this order is already Dispatched (demo
  // data), show the final Finished Goods milestone.
  const dispatched = initialDispatchRecords.find(
    (record) => record.productionOrder === order.workOrder && record.status === 'Dispatched'
  );
  if (dispatched) {
    push('Dispatched', dispatched.dispatchDate, '16:00', 'Completed', 'Dispatcher');
    push('Finished Goods', dispatched.dispatchDate, '16:30', 'Completed', 'Store Keeper');
  }
  return events;
}

function buildHistory(order) {
  const rows = [];
  const push = (date, time, action, user, previousStatus, newStatus, remarks) =>
    rows.push({ date: `${date}T${time}:00`, action, user, previousStatus, newStatus, remarks });

  push(order.startDate, '09:00', 'Work Order Created', 'Planner', '—', 'Pending', 'Work Order raised from sales order.');
  if (order.status !== 'Pending') {
    push(order.startDate, '09:05', 'Production Started', 'Supervisor', 'Pending', 'In Progress', 'Work released to the floor.');
  }
  if (order.status === 'Pending QC' || order.progress >= 85) {
    push(order.dueDate, '10:00', 'Stage Completed', 'Supervisor', 'In Progress', 'Pending QC', 'Production complete, sent for inspection.');
  }
  if (['Completed', 'Packed', 'Ready for Dispatch'].includes(order.status)) {
    push(order.dueDate, '11:30', 'Quality Approved', 'QC Lead', 'Pending QC', order.status, 'Inspection passed.');
  }
  push(order.dueDate, '12:00', 'Progress Updated', 'System', '—', order.status, `${order.progress}% completion logged.`);
  return rows;
}

/**
 * Full demo detail payload for a production order.
 * @param {object} order - a production order record
 */
export function getOrderDetails(order) {
  if (!order) return null;
  return {
    operations: buildOperations(order),
    materials: buildMaterials(order),
    quality: buildQuality(order),
    timeline: buildTimeline(order),
    history: buildHistory(order),
  };
}

// Master data for the Profit Workout module — sourced from the original ERP
// (js/profit-workout.js system lists and create-profit-workout.html form options).

export const PW_SYSTEM_CATEGORIES = [
  'Material Cost', 'Labour Cost', 'Machining Cost', 'Fabrication Cost',
  'Assembly Cost', 'Packing Cost', 'Transport Cost', 'Installation Cost',
  'Vendor Cost', 'Overhead Cost', 'Pattern Cost', 'Molding Cost',
  'Fettling Cost', 'Blasting Cost', 'Heat Treatment', 'Powder Coating',
  'Painting', 'Lead Time', 'Miscellaneous'
];

export const PW_SYSTEM_UNITS = [
  'Nos', 'Kg', 'Gram', 'Ton', 'Meter', 'Millimeter (mm)', 'Centimeter (cm)',
  'Feet', 'Inch', 'Sq.ft', 'Sq.m', 'Cubic Meter', 'Litre', 'Millilitre',
  'Piece', 'Pair', 'Set', 'Box', 'Bundle', 'Roll', 'Coil', 'Hours',
  'Minutes', 'Days', 'Weeks', 'Months'
];

export const PW_DEPARTMENTS = [
  'Production', 'Purchase', 'Stores', 'Maintenance', 'Quality', 'Sales',
  'Accounts', 'Admin', 'HR', 'IT', 'Engineering', 'Logistics', 'R&D'
];

export const PW_PREPARERS = [
  'Ramesh Patel', 'Suresh Kumar', 'Amit Singh', 'Priya Sharma',
  'Vijay Kumar', 'Neha Gupta', 'Admin User'
];

// Statuses shown in the Profit Workout list filter (original ERP list).
export const PW_STATUSES = [
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Completed' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'pending', label: 'Pending' }
];

// Status options on the Profit Workout create form (original ERP).
export const PW_FORM_STATUSES = [
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Completed' }
];

export const PW_STATUS_META = {
  draft: { label: 'Draft', className: 'po-badge po-badge-gray' },
  completed: { label: 'Completed', className: 'po-badge po-badge-green' },
  submitted: { label: 'Submitted', className: 'po-badge po-badge-gray' },
  pending: { label: 'Submitted', className: 'po-badge po-badge-gray' },
  approved: { label: 'Approved', className: 'po-badge po-badge-green' },
  rejected: { label: 'Rejected', className: 'po-badge po-badge-red' },
  archived: { label: 'Archived', className: 'po-badge po-badge-gray' },
  deleted: { label: 'Deleted', className: 'po-badge po-badge-gray' }
};

// Approval matrix rules (original ERP seed rules from profit-workout-approval.js).
export const PW_APPROVAL_MATRIX = [
  { level: 1, levelName: 'Manager', minAmount: 0, maxAmount: 50000, approverRole: 'Department Manager', departments: ['All'] },
  { level: 1, levelName: 'Manager', minAmount: 50001, maxAmount: 200000, approverRole: 'Department Manager', departments: ['All'] },
  { level: 2, levelName: 'Director', minAmount: 200001, maxAmount: 500000, approverRole: 'Director', departments: ['All'] },
  { level: 3, levelName: 'VP / CXO', minAmount: 500001, maxAmount: 99999999, approverRole: 'VP Operations', departments: ['All'] }
];

// Resolve the required approval levels for a given amount (original ERP logic).
export function pwRequiredLevels(amount) {
  const amt = Number(amount) || 0;
  let matched = null;
  for (const rule of PW_APPROVAL_MATRIX) {
    if (amt >= rule.minAmount && amt <= rule.maxAmount) {
      if (!matched || rule.level > matched.level) matched = rule;
    }
  }
  const levels = [];
  for (const rule of PW_APPROVAL_MATRIX) {
    if (rule.level <= (matched ? matched.level : 1) && !levels.includes(rule.level)) levels.push(rule.level);
  }
  return levels.sort((a, b) => a - b);
}

export function pwApproverRole(level) {
  const rule = PW_APPROVAL_MATRIX.find((r) => r.level === level);
  return rule ? rule.approverRole : 'Approver';
}

export function pwLevelName(level) {
  const rule = PW_APPROVAL_MATRIX.find((r) => r.level === level);
  return rule ? rule.levelName : `Level ${level}`;
}

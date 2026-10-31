// ============================================================
// Settings — vocabulary + empty master-data lists.
// Frontend-only master data used by the five settings screens.
//
// Users, machines, work centers and statuses are USER-ENTRY-ONLY:
// each list starts empty and every record is created by the user
// through the UI. Records are persisted in localStorage by the
// settings pages — nothing is seeded here.
// ============================================================
import { PRIORITY_OPTIONS, STATUS_OPTIONS, DEPARTMENT_OPTIONS } from './orders';
import { INSPECTION_TYPES, QUALITY_STATUSES } from './quality';

// ------------------------------------------------------------
// 1. Users & Roles (role vocabulary; users are user-created)
// ------------------------------------------------------------
export const USER_ROLES = [
  'Admin',
  'Production Manager',
  'Supervisor',
  'Operator',
  'Quality Inspector',
  'Store/Dispatch User',
];

export const initialUsers = [];

// ------------------------------------------------------------
// 2. Machines (type/status vocabulary; machines are user-created)
// ------------------------------------------------------------
export const MACHINE_STATUSES = ['Available', 'Running', 'Maintenance', 'Inactive'];

export const MACHINE_TYPES = ['CNC Lathe', 'CNC Milling', 'Drilling', 'Grinding', 'Welding', 'Press', 'Furnace', 'Cutting'];

export const initialMachines = [];

// ------------------------------------------------------------
// 3. Work Centers (location vocabulary; work centers are user-created)
// ------------------------------------------------------------
export const WORK_CENTER_LOCATIONS = ['Foundry', 'Fabrication Bay', 'Machine Bay', 'Assembly Hall', 'QC Lab'];

export const initialWorkCenters = [];

// ------------------------------------------------------------
// 4. Production Parameters (frontend configuration defaults)
// ------------------------------------------------------------
export const PRODUCTION_UNITS = ['Nos.', 'Kgs', 'Sets', 'Ltrs', 'Mtrs'];

export const initialParameters = {
  defaultProductionPriority: PRIORITY_OPTIONS[1], // Medium
  defaultProductionStatus: STATUS_OPTIONS[1], // In Progress
  defaultDepartment: DEPARTMENT_OPTIONS[0], // Casting
  defaultInspectionType: INSPECTION_TYPES[1], // In-Process
  defaultProductionUnit: PRODUCTION_UNITS[0], // Nos.
  defaultDueDateGracePeriod: 2,
  enableQualityHold: true,
  enableProductionTimeline: true,
  enableProductionPhotos: false,
  enableProductionDocuments: true,
};

// ------------------------------------------------------------
// 5. Status Masters (category vocabulary + empty status list)
// ------------------------------------------------------------
export const STATUS_CATEGORIES = [
  'Work Order Status',
  'Shop Floor Status',
  'Quality Status',
  'Packing Status',
  'Dispatch Status',
];

// Statuses referenced by the workflow definitions — deleting these
// would break the module's status vocabulary, so they are protected
// from deletion in the Status Masters screen.
export const PROTECTED_STATUSES = [
  ...STATUS_OPTIONS, // Pending, In Progress, Pending QC, Completed, Packed, Ready for Dispatch
  ...QUALITY_STATUSES, // Pending, In Progress, Passed, Failed, Hold
  'Dispatched', // dispatch completed
  'Hold', // shop floor hold
];

export const initialStatuses = [];

export const isProtectedStatus = (name) => PROTECTED_STATUSES.includes(name);

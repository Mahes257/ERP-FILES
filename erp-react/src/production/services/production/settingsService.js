// ============================================================
// Settings service.
// Data access for the Production Settings screens:
//   Users & Roles · Machines · Work Centers · Production
//   Parameters · Status Masters
//
// Machines and Work Centers have their own services
// (machineService / workCenterService). This service covers the
// remaining master data:
//
//   Status Masters        → production_status_masters  (MySQL)
//   Production Parameters → app_settings               (MySQL, production.param.*)
//   Users & Roles         → role vocabulary (frontend) + the user register in
//                           app_settings (production.users). The register is
//                           Production master data, not a login account: the
//                           ERP's `users` table belongs to authentication, so
//                           these records carry no password. Storing them
//                           server-side is what lets Production Settings →
//                           Access Management list a newly created user and key
//                           an individual permission configuration on its
//                           stable USR-NNN id.
// ============================================================
import {
  USER_ROLES,
  initialUsers,
  PRODUCTION_UNITS,
  initialParameters,
  STATUS_CATEGORIES,
  PROTECTED_STATUSES,
  isProtectedStatus,
} from '../../data/settings';
import { productionSettingsApi } from '../../utils/api';
import { ok, fail } from './index';

/** Generate the next id in a `PREFIX-NNN` sequence (max-based). */
const nextId = (records, prefix) =>
  `${prefix}-${String(
    records.reduce((max, record) => {
      const n = Number(String(record.id).split('-').pop());
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1
  ).padStart(3, '0')}`;

export const settingsService = {
  // ------------------------------------------------------------
  // Users & Roles (frontend register — see the note above)
  // ------------------------------------------------------------

  /** Users & Roles — the role vocabulary shared by the form and the filters. */
  getUsersAndRoles: () => ({
    roles: USER_ROLES,
    users: initialUsers,
  }),

  /**
   * The Production user register, as stored by the server. The API wrapper
   * returns the {success, message, data} envelope, so the rows are unwrapped
   * here — the access-management selector reads the same rows from its own
   * endpoint.
   */
  listUsers: async () => {
    const response = await productionSettingsApi.listUsers();
    return Array.isArray(response?.data) ? response.data : [];
  },

  /** Replace the register; the server keeps/assigns the stable USR-NNN ids. */
  saveUsers: async (users) => {
    const response = await productionSettingsApi.saveUsers(users);
    return Array.isArray(response?.data) ? response.data : [];
  },

  /** Create a user. Generates a USR- id when one is not provided. */
  createUser: (users, data) => {
    const id = String(data.id ?? '').trim();
    const record = {
      ...data,
      id: id || nextId(users, 'USR'),
      lastLogin: data.lastLogin ?? 'Never',
    };
    if (users.some((user) => user.id === record.id)) {
      return fail(users, `User ${record.id} already exists.`);
    }
    return ok([record, ...users], record);
  },

  /** Update a user by stable id (merges over the record). */
  updateUser: (users, id, data) => {
    const existing = users.find((user) => user.id === id);
    if (!existing) return fail(users, `User ${id} not found.`);
    const record = { ...existing, ...data, id: existing.id };
    return ok(
      users.map((user) => (user.id === id ? record : user)),
      record
    );
  },

  /** Delete a user by stable id. */
  deleteUser: (users, id) => {
    if (!users.some((user) => user.id === id)) {
      return fail(users, `User ${id} not found.`);
    }
    return ok(
      users.filter((user) => user.id !== id),
      { id }
    );
  },

  // ------------------------------------------------------------
  // Production Parameters (persisted in MySQL)
  // ------------------------------------------------------------

  /**
   * Default parameter values + unit vocabulary.
   *
   * The defaults stay in the frontend — they are the starting configuration the
   * screen shows before anything has been saved. Stored overrides are read with
   * {@link settingsService.loadParameters} and merged over them.
   */
  getProductionParameters: () => ({
    units: PRODUCTION_UNITS,
    values: { ...initialParameters },
  }),

  /** Saved parameter overrides (empty until something is changed and saved). */
  loadParameters: () => productionSettingsApi.getParameters(),

  /** Persist the whole parameter map; a key that is absent is cleared. */
  saveParameters: (values) => productionSettingsApi.saveParameters(values),

  // ------------------------------------------------------------
  // Notification preferences (persisted in MySQL, app_settings)
  // ------------------------------------------------------------

  /**
   * Saved notification preferences, defaults filled in.
   *
   * These are the gates the backend publisher reads before delivering a
   * Production workflow event, so the screen and the notification pipeline
   * share one source of truth.
   */
  loadNotificationPreferences: () => productionSettingsApi.getNotifications(),

  /** Persist the whole preference set (one boolean per workflow event). */
  saveNotificationPreferences: (values) => productionSettingsApi.saveNotifications(values),

  // ------------------------------------------------------------
  // Status Masters (persisted in MySQL)
  // ------------------------------------------------------------

  /** Status Masters — status categories and the deletion-protection rule. */
  getStatusMasters: () => ({
    categories: STATUS_CATEGORIES,
    protectedStatuses: PROTECTED_STATUSES,
    isProtected: isProtectedStatus,
  }),

  /** All statuses, optionally narrowed to one category. */
  listStatusMasterRecords: (params) => productionSettingsApi.listStatusMasters(params),

  /** Create a status in a category; (name, category) must be unique. */
  createStatusMaster: (data) => productionSettingsApi.createStatusMaster(data),

  /** Update a status addressed by its numeric id (the name is editable). */
  updateStatusMaster: (id, data) => productionSettingsApi.updateStatusMaster(id, data),

  /** Delete a status addressed by its numeric id. */
  deleteStatusMaster: (id) => productionSettingsApi.deleteStatusMaster(id),
};

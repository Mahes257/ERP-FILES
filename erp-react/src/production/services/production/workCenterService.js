// ============================================================
// Work center master service.
// The physical areas of the shop floor (foundry, fabrication bay,
// machine bay, assembly hall, QC lab). Persisted master data in MySQL
// rather than browser state, so the configuration survives a reload
// and is shared between users.
//
//   Settings → Work Centers UI
//        ↓
//   workCenterService (this module)
//        ↓
//   productionSettingsApi → /production/settings/work-centers → MySQL
// ============================================================
import { productionSettingsApi } from '../../utils/api';

export const workCenterService = {
  /** All work centers (optionally narrowed to one department). */
  listWorkCenters: (params) => productionSettingsApi.listWorkCenters(params),

  /** Create a work center. Duplicate work center ids are rejected by the backend. */
  createWorkCenter: (data) => productionSettingsApi.createWorkCenter(data),

  /** Update a work center addressed by its current work center id (code). */
  updateWorkCenter: (code, data) => productionSettingsApi.updateWorkCenter(code, data),

  /** Delete a work center addressed by its work center id (code). */
  deleteWorkCenter: (code) => productionSettingsApi.deleteWorkCenter(code),
};

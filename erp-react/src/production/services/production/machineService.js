// ============================================================
// Machine master service.
// Machines back the Machine Shop module and the Machine Utilization
// report. They are persisted master data in MySQL — the records used
// to live in localStorage, so they were lost on another device and the
// report could not read them.
//
//   Settings → Machines UI
//        ↓
//   machineService (this module)
//        ↓
//   productionSettingsApi → /production/settings/machines → MySQL
//
// Every call resolves to the backend's `{ success, message, data }`
// envelope; `data` is the affected machine (single) or the list.
// ============================================================
import { productionSettingsApi } from '../../utils/api';

export const machineService = {
  /** All machines (optionally narrowed to one department). */
  listMachines: (params) => productionSettingsApi.listMachines(params),

  /** Create a machine. Duplicate machine ids are rejected by the backend. */
  createMachine: (data) => productionSettingsApi.createMachine(data),

  /** Update a machine addressed by its current machine id (code). */
  updateMachine: (code, data) => productionSettingsApi.updateMachine(code, data),

  /** Delete a machine addressed by its machine id (code). */
  deleteMachine: (code) => productionSettingsApi.deleteMachine(code),
};

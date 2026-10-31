// ============================================================
// Production Service Layer
// ============================================================
// This directory is the single data-access boundary for the
// Production module. Pages and contexts should obtain or mutate
// data through these services — never by importing demo datasets
// directly into UI components.
//
//   Production UI
//        ↓
//   Production Service Layer   (this directory)
//        ↓
//   Frontend Demo Data         (src/data/*)
//
//   Future (when a backend exists):
//   Production UI → Service Layer → Production API → Backend → Database
//
// Current implementation: services operate on the in-memory demo
// dataset (React state) which the caller passes in as the first
// argument. Read functions are pure; mutation functions return a
// consistent result object `{ ok, data, record?, error? }` where
// `data` is the new dataset for the caller to apply to state.
//
// When an API replaces the demo implementation, the function names
// and result shapes stay the same — only the internals change and
// the dataset argument is dropped in favour of a server round-trip.
//
// IMPORTANT: This layer is frontend-only. No fetch(), no URLs, no
// backend — nothing here talks to a server.
// ============================================================

/** Success result: `data` is the new dataset, `record` the affected row. */
export const ok = (data, record) => ({ ok: true, data, record });

/** Error result: `data` is left untouched, `error` a human-readable message. */
export const fail = (data, error) => ({ ok: false, data, error });

// Individual services (also exported from their own modules).
export { productionOrderService } from './productionOrderService';
export { qualityService } from './qualityService';
export { shopFloorService } from './shopFloorService';
export { packingService } from './packingService';
export { dispatchService } from './dispatchService';
export { machineService } from './machineService';
export { workCenterService } from './workCenterService';
export { reportService } from './reportService';
export { settingsService } from './settingsService';

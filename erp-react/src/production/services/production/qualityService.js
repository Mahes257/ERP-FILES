// ============================================================
// Quality service.
// Data access for QC inspections. Inspections reference Work Orders
// by their stable id (stored in `productionOrder`, e.g. 'WO-0001').
//
// Demo implementation: pure functions over the in-memory inspection
// dataset (held in React state by QualityContext).
// Future: replace internals with API calls.
// ============================================================
//
// !!! DEPRECATED — DO NOT WIRE THIS UP. !!!
// This is leftover demo code operating on an in-memory dataset. The LIVE
// Production → Quality page (src/production/pages/Quality.jsx) and the Sales →
// CPO → QC page (src/pages/sales/CpoQcPage.jsx) BOTH use the real API
// (qualityApi / qualityInspectionService → /quality-inspections →
// QualityInspectionController → the single `quality_inspections` table).
// There is exactly ONE canonical QC record per inspection; this file must
// never be imported, or it would create a parallel in-memory dataset and
// duplicate records.
// ============================================================
import { ok, fail } from './index';

/** Inspection IDs use the QI- prefix convention of the demo data. */
const nextId = (inspections, prefix = 'QI') =>
  `${prefix}-${String(
    inspections.reduce((max, inspection) => {
      const n = Number(String(inspection.id).split('-').pop());
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1
  ).padStart(3, '0')}`;

export const qualityService = {
  /** Read all inspections. */
  getInspections: (inspections) => inspections,

  /** Read one inspection by stable id. */
  getInspectionById: (inspections, id) =>
    inspections.find((inspection) => inspection.id === id),

  /** Create an inspection. Rejects duplicate ids. */
  createInspection: (inspections, data) => {
    const record = {
      ...data,
      id: String(data.id ?? '').trim() || nextId(inspections),
    };
    if (inspections.some((inspection) => inspection.id === record.id)) {
      return fail(inspections, `Inspection ${record.id} already exists.`);
    }
    return ok([record, ...inspections], record);
  },

  /** Update an inspection by stable id (merges over the record). */
  updateInspection: (inspections, id, data) => {
    const existing = inspections.find((inspection) => inspection.id === id);
    if (!existing) return fail(inspections, `Inspection ${id} not found.`);
    const record = { ...existing, ...data, id: existing.id };
    return ok(
      inspections.map((inspection) => (inspection.id === id ? record : inspection)),
      record
    );
  },

  /** Delete an inspection by stable id. */
  deleteInspection: (inspections, id) => {
    if (!inspections.some((inspection) => inspection.id === id)) {
      return fail(inspections, `Inspection ${id} not found.`);
    }
    return ok(
      inspections.filter((inspection) => inspection.id !== id),
      { id }
    );
  },

  /** Required-field validation for the inspection form. */
  validateInspection: (data) => {
    if (!data?.id && !data?.inspectionId) return 'Inspection ID is required.';
    if (!data?.productionOrder) return 'Work Order is required.';
    const quantity = Number(data?.quantityToInspect ?? data?.quantityInspected);
    if (Number.isFinite(quantity) && quantity <= 0) {
      return 'Quantity must be greater than zero.';
    }
    return null;
  },
};

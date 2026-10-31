// ============================================================
// Shop Floor service.
// Data access + status transitions for the four shop floor boards
// (Casting, Fabrication, Machine Shop, Assembly). Jobs reference
// production orders by stable id.
//
// Demo implementation: pure functions over the in-memory job
// dataset (held in React state by the useShopFloorJobs hook).
// Future: startJob/holdJob/resumeJob/completeJob map naturally to
// API endpoints (POST /jobs/:id/start, .../hold, .../resume,
// .../complete).
// ============================================================
import { ok, fail } from './index';
import { castingJobs } from '../../data/casting';
import { fabricationJobs } from '../../data/fabrication';
import { machineShopJobs } from '../../data/machineShop';
import { assemblyJobs } from '../../data/assembly';

const nowIso = () => new Date().toISOString();

/** Generate the next id in a `PREFIX-NNN` sequence (max-based). */
const nextJobId = (jobs, prefix) =>
  `${prefix}-${String(
    jobs.reduce((max, job) => {
      const n = Number(String(job.id).split('-').pop());
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1
  ).padStart(3, '0')}`;

/** Seed job datasets keyed by module. */
const JOB_SOURCES = {
  casting: castingJobs,
  fabrication: fabricationJobs,
  machineShop: machineShopJobs,
  assembly: assemblyJobs,
};

export const shopFloorService = {
  /**
   * Read the seed job list for a shop floor module.
   * `module` is one of: casting | fabrication | machineShop | assembly
   */
  getShopFloorJobs: (module) => JOB_SOURCES[module] || [],

  /**
   * Create a job. The id is generated from the module's prefix
   * (CST- / FAB- / MS- / ASM-) when not provided. Rejects duplicates.
   */
  createJob: (jobs, data) => {
    const prefix = (data.idPrefix || 'JOB-').toUpperCase();
    const record = {
      ...data,
      id: String(data.id ?? '').trim() || nextJobId(jobs, prefix),
    };
    if (jobs.some((job) => job.id === record.id)) {
      return fail(jobs, `Job ${record.id} already exists.`);
    }
    return ok([record, ...jobs], record);
  },

  /** Delete a job by stable id. */
  deleteJob: (jobs, id) => {
    if (!jobs.some((job) => job.id === id)) {
      return fail(jobs, `Job ${id} not found.`);
    }
    return ok(
      jobs.filter((job) => job.id !== id),
      { id }
    );
  },

  /** Update a job's fields by stable id (merges over the record). */
  updateShopFloorJob: (jobs, id, data) => {
    const existing = jobs.find((job) => job.id === id);
    if (!existing) return fail(jobs, `Job ${id} not found.`);
    const record = { ...existing, ...data };
    return ok(
      jobs.map((job) => (job.id === id ? record : job)),
      record
    );
  },

  /** Start a Pending job → In Progress (records the start time). */
  startJob: (jobs, id) => {
    const existing = jobs.find((job) => job.id === id);
    if (!existing) return fail(jobs, `Job ${id} not found.`);
    if (existing.status !== 'Pending') {
      return fail(jobs, `Job ${id} cannot be started from '${existing.status}'.`);
    }
    return shopFloorService.updateShopFloorJob(jobs, id, {
      status: 'In Progress',
      startTime: existing.startTime || nowIso(),
    });
  },

  /** Hold an In Progress job → Hold. */
  holdJob: (jobs, id) => {
    const existing = jobs.find((job) => job.id === id);
    if (!existing) return fail(jobs, `Job ${id} not found.`);
    if (existing.status !== 'In Progress') {
      return fail(jobs, `Job ${id} cannot be held from '${existing.status}'.`);
    }
    return shopFloorService.updateShopFloorJob(jobs, id, { status: 'Hold' });
  },

  /** Resume a Held job → In Progress. */
  resumeJob: (jobs, id) => {
    const existing = jobs.find((job) => job.id === id);
    if (!existing) return fail(jobs, `Job ${id} not found.`);
    if (existing.status !== 'Hold') {
      return fail(jobs, `Job ${id} cannot be resumed from '${existing.status}'.`);
    }
    return shopFloorService.updateShopFloorJob(jobs, id, {
      status: 'In Progress',
      startTime: existing.startTime || nowIso(),
    });
  },

  /**
   * Complete an In Progress / Hold job → Completed.
   * The actual completed quantity entered by the user is PRESERVED
   * (never reset to the planned quantity) — the stage's own quantity
   * is the real output. When no quantity was entered, fall back to
   * planned minus rejected so the workflow can still advance.
   */
  completeJob: (jobs, id) => {
    const existing = jobs.find((job) => job.id === id);
    if (!existing) return fail(jobs, `Job ${id} not found.`);
    if (existing.status !== 'In Progress' && existing.status !== 'Hold') {
      return fail(jobs, `Job ${id} cannot be completed from '${existing.status}'.`);
    }
    const planned = Number(existing.plannedQuantity) || 0;
    const rejected = Number(existing.rejectedQuantity) || 0;
    const completed =
      Number(existing.completedQuantity) > 0
        ? Number(existing.completedQuantity)
        : Math.max(0, planned - rejected);
    return shopFloorService.updateShopFloorJob(jobs, id, {
      status: 'Completed',
      progress: planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 100,
      completedQuantity: completed,
      endTime: nowIso(),
    });
  },

  /**
   * Officially skip a stage that is not yet completed. Skipped stays a
   * separate status from Completed and records who/when/why.
   */
  skipJob: (jobs, id, { reason = '', remarks = '' } = {}) => {
    const existing = jobs.find((job) => job.id === id);
    if (!existing) return fail(jobs, `Job ${id} not found.`);
    if (existing.status === 'Completed' || existing.status === 'Skipped') {
      return fail(jobs, `Job ${id} cannot be skipped from '${existing.status}'.`);
    }
    return shopFloorService.updateShopFloorJob(jobs, id, {
      status: 'Skipped',
      skipReason: reason || 'Other',
      skipRemarks: remarks,
      skippedBy: existing.operator || '',
      skippedDate: nowIso(),
    });
  },
};

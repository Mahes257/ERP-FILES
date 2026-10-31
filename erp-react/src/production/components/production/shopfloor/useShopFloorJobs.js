import { useEffect, useState, useCallback } from 'react';
import api from '../../../../api/axiosInstance';
import { machineService } from '../../../services/production';

export const SHOP_FLOOR_STATUSES = ['Pending', 'In Progress', 'Hold', 'Completed', 'Skipped'];

/**
 * Shop floor job board backed by the real Production Entries API.
 *
 * Jobs are loaded from /v1/production-entries/order/{workOrderId} and
 * filtered by productionType (Casting, Fabrication, Assembly, etc.).
 *
 * Status transitions update the backend:
 *  - Start    : Pending → In Progress
 *  - Hold     : In Progress → Hold
 *  - Resume   : Hold → In Progress
 *  - Complete : In Progress/Hold → Completed
 *  - Skip     : Pending/In Progress/Hold → Skipped
 *
 * @param {string} productionType - e.g. 'Casting', 'Fabrication', 'Assembly'
 * @param {string} storageKey - unused, kept for API compatibility
 */
export function useShopFloorJobs(productionType, storageKey) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  // Machine id → 'MCH-001 · CNC Lathe 01', from the persisted machine master
  // (Settings → Machines). Jobs store the machine id; the board shows the
  // friendly label.
  const [machineLabels, setMachineLabels] = useState({});

  const machineLabel = useCallback(
    (code) => (code ? machineLabels[code] || code : ''),
    [machineLabels]
  );

  /** Load all production entries and filter by production type. */
  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      // The machine master is needed to label the machine a job is assigned to.
      // A failure here must not hide the jobs, so it degrades to showing ids.
      const labels = await machineService
        .listMachines()
        .then((response) => Object.fromEntries(
          (response.data || []).map((machine) => [
            machine.id,
            machine.name ? `${machine.id} · ${machine.name}` : machine.id,
          ])
        ))
        .catch(() => ({}));
      setMachineLabels(labels);
      // The backend doesn't have a "list all entries" endpoint,
      // so we load entries from the production orders context
      // which already has all the data.
      //
      // We use the production-entries/order endpoint for each known
      // work order. For the shop floor board, we'll load from the
      // production orders list and their entries.
      const { data: ordersData } = await api.get('/production-orders', {
        params: { page: 0, size: 100, productionType }
      });

      const orders = ordersData?.data?.content || [];
      const allJobs = [];

      for (const order of orders) {
        try {
          const { data: entriesData } = await api.get(
            `/production-entries/order/${encodeURIComponent(order.workOrder)}`
          );
          const entries = entriesData?.data || entriesData || [];

          for (const entry of entries) {
            // Convert production entry to shop floor job format
            allJobs.push({
              id: `JOB-${entry.id || entry.workOrderId + '-' + entry.stage}`,
              productionOrder: entry.workOrderId || order.workOrder,
              workOrderItemId: entry.workOrderItemId || '',
              productionType: entry.productionType || '',
              stage: entry.stage || '',
              product: order.product || entry.productionType || '',
              customer: order.customer || '',
              plannedQuantity: entry.inputQuantity || order.quantity || 0,
              completedQuantity: entry.outputQuantity || 0,
              rejectedQuantity: entry.rejectedQuantity || 0,
              status: entry.status || 'Pending',
              // Where a board labels jobs with a task (Assembly), the stored
              // stage IS that label — surface it so Edit pre-fills and the
              // "Assembly Task" column renders.
              assemblyTask: entry.assemblyTask ?? entry.stage ?? '',
              operator: entry.operator || '',
              // The machine this job runs on (persisted machine master id), and
              // its display label. A job with no machine stays empty — machines
              // are optional.
              machineCode: entry.machineCode || '',
              machine: entry.machineCode ? labels[entry.machineCode] || entry.machineCode : '',
              startDate: entry.entryDate || entry.date || order.startDate || '',
              remarks: entry.remarks || '',
              progress: entry.inputQuantity > 0
                ? Math.min(100, Math.round(((entry.outputQuantity || 0) / entry.inputQuantity) * 100))
                : 0,
              startTime: entry.createdAt || '',
              endTime: entry.status === 'Completed' ? entry.updatedAt || '' : '',
              createdAt: entry.createdAt || '',
              updatedAt: entry.updatedAt || '',
              // Keep the backend entry ID for API calls
              _backendId: entry.id,
            });
          }
        } catch {
          // Order may not have entries yet — skip silently
        }
      }

      setJobs(allJobs);
    } catch (err) {
      console.error('Failed to load shop floor jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [productionType]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  /**
   * Resolve the backend Production Entry id for a job.
   *
   * Jobs loaded from the API carry `_backendId`, but a job the user just
   * created only has a local id, so the entry is looked up by the
   * (work order, item, stage) key the backend upserts on. Without this the
   * module could never delete or re-key an entry it had created.
   */
  const resolveEntryId = useCallback(async (job) => {
    if (!job) return null;
    if (job._backendId) return job._backendId;
    if (!job.productionOrder || !job.stage) return null;
    try {
      const { data } = await api.get(
        `/production-entries/order/${encodeURIComponent(job.productionOrder)}/stage/${encodeURIComponent(job.stage)}`,
        { params: job.workOrderItemId ? { itemId: job.workOrderItemId } : {} }
      );
      const entry = data?.data ?? data;
      return entry?.id ?? null;
    } catch (err) {
      console.error('Failed to resolve production entry:', err);
      return null;
    }
  }, []);

  /**
   * The stage an entry is stored under.
   *
   * Assembly exposes a free-text "Assembly Task" instead of the workflow stage
   * (the form hides the stage field). That task had nowhere to go: there is no
   * `assembly_task` column in `production_entries` and `ddl-auto=validate`, so
   * the value was silently dropped on every save. The stage column is the only
   * per-job free-text field, so the task is stored there — which also makes it
   * reload into the Edit form and the table's "Assembly Task" column.
   *
   * Boards without a task field are unaffected: `data.assemblyTask` is absent
   * and the plain stage is used exactly as before.
   */
  const effectiveStage = useCallback((job, data = {}) => {
    const rawTask = data.assemblyTask;
    const task = rawTask === undefined || rawTask === null ? '' : String(rawTask).trim();
    return task || data.stage || job.stage;
  }, []);

  /** Build the CreateProductionEntryRequest body for a job. */
  const entryPayload = useCallback((job, data = {}) => ({
    workOrderId: job.productionOrder,
    // Prefer the item travelling with this save, then the job's stored item.
    // Every other field below follows the same `data ?? job` rule; ignoring
    // `data` here meant an edit could never (re)set the item an entry belongs
    // to, so a row created before the id was carried through stayed unlinked.
    workOrderItemId: data.workOrderItemId || job.workOrderItemId || '',
    // Prefer the production type chosen on the form, then the job loaded from
    // the API, then the board's own type. The Assembly board passes `stageFilter`
    // instead of `productionType`, so falling back to the prop alone wrote
    // production_type = NULL on every edit — which silently removed the job from
    // /assemblies (Dashboard + KPI card) even though it stayed on the board.
    productionType: data.productionType || job.productionType || productionType,
    stage: effectiveStage(job, data),
    inputQuantity: Number(data.plannedQuantity ?? job.plannedQuantity ?? 0) || 0,
    outputQuantity: Number(data.completedQuantity ?? job.completedQuantity ?? 0) || 0,
    rejectedQuantity: Number(data.rejectedQuantity ?? job.rejectedQuantity ?? 0) || 0,
    operator: data.operator ?? job.operator ?? '',
    // Machine assignment: the id of a configured machine, or '' for none. The
    // backend rejects an id that is not in the machine master.
    machineCode: data.machineCode ?? job.machineCode ?? '',
    // The backend request field is `entryDate` (CreateProductionEntryRequest) —
    // sending `date` made Jackson drop the value, so every entry was stored
    // with a null entry_date.
    entryDate: data.startDate ?? job.startDate ?? new Date().toISOString().split('T')[0],
    status: data.status ?? job.status ?? 'Pending',
    remarks: data.remarks ?? job.remarks ?? '',
  }), [productionType, effectiveStage]);

  /** Update a job in the local state and persist to backend. */
  const updateJob = useCallback(async (id, data) => {
    const job = jobs.find((j) => j.id === id);
    // The board displays the machine label, the entry stores the machine id:
    // keep them in step whenever the form sends a new machine.
    const applyPatch = (target) => {
      const next = { ...target, ...data };
      if ('machineCode' in data) next.machine = machineLabel(data.machineCode);
      return next;
    };
    setJobs((prev) => prev.map((j) => (j.id === id ? applyPatch(j) : j)));

    // The stage the entry will actually be stored under (the Assembly task
    // wins over the hidden stage field), so renames and persistence agree.
    const nextStage = job ? effectiveStage(job, data) : undefined;

    // The (order, item, stage) key the database will hold for this save. The
    // item has to be part of it: an entry is upserted on that triple, so a save
    // that changes the item WITHOUT moving the stage would otherwise leave the
    // previous row behind and insert a second one — and it is exactly how a row
    // written before the item was carried through (item id blank) gets repaired.
    const nextItemId = data.workOrderItemId ?? job?.workOrderItemId ?? '';

    // Persist whenever the job is identifiable in the backend — not only when a
    // `_backendId` was already cached (a freshly created job had none, so every
    // edit/status change on it was silently lost).
    if (job && job.productionOrder && nextStage) {
      try {
        // Moving a job to another stage, or onto another item, replaces its
        // (order, item, stage) key, so the previous row has to go — otherwise
        // the old stage reappears on the board after the next reload. Compared
        // against the *effective* stage: renaming an Assembly task also moves
        // the stored key. `resolveEntryId` looks the old row up using the job's
        // pre-save item id, which is the row being replaced.
        const keyChanged =
          nextStage !== job.stage ||
          String(nextItemId || '') !== String(job.workOrderItemId || '');
        if (keyChanged) {
          const previousId = await resolveEntryId(job);
          if (previousId) await api.delete(`/production-entries/${previousId}`);
        }
        const { data: response } = await api.post('/production-entries', entryPayload(job, data));
        const saved = response?.data ?? response;
        // Keep the local job on the same (order, item, stage) key the database
        // now holds, so later status changes update that row instead of
        // inserting a second one.
        setJobs((prev) => prev.map((j) => (
          j.id === id
            ? {
                ...j,
                stage: nextStage,
                workOrderItemId: nextItemId,
                ...(j.assemblyTask !== undefined ? { assemblyTask: nextStage } : {}),
                ...(saved?.id ? { _backendId: saved.id } : {}),
                // The stored value is the canonical machine id the backend
                // accepted (empty when the machine was cleared).
                ...(saved && 'machineCode' in saved
                  ? { machineCode: saved.machineCode || '', machine: machineLabel(saved.machineCode) }
                  : {}),
              }
            : j
        )));
      } catch (err) {
        console.error('Failed to persist job update:', err);
      }
    }
    return { data: jobs.map((j) => (j.id === id ? applyPatch(j) : j)) };
  }, [jobs, resolveEntryId, entryPayload, effectiveStage, machineLabel]);

  const startJob = useCallback((id) => updateJob(id, {
    status: 'In Progress',
    startTime: new Date().toISOString(),
  }), [updateJob]);

  const holdJob = useCallback((id) => updateJob(id, { status: 'Hold' }), [updateJob]);

  const resumeJob = useCallback((id) => updateJob(id, {
    status: 'In Progress',
    startTime: new Date().toISOString(),
  }), [updateJob]);

  const completeJob = useCallback((id) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const planned = Number(job.plannedQuantity) || 0;
    const rejected = Number(job.rejectedQuantity) || 0;
    const completed = Number(job.completedQuantity) > 0
      ? Number(job.completedQuantity)
      : Math.max(0, planned - rejected);
    return updateJob(id, {
      status: 'Completed',
      progress: planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 100,
      completedQuantity: completed,
      endTime: new Date().toISOString(),
    });
  }, [jobs, updateJob]);

  const skipJob = useCallback((id, { reason = '', remarks: skipRemarks = '' } = {}) => {
    return updateJob(id, {
      status: 'Skipped',
      skipReason: reason || 'Other',
      skipRemarks,
      skippedBy: jobs.find((j) => j.id === id)?.operator || '',
      skippedDate: new Date().toISOString(),
    });
  }, [jobs, updateJob]);

  /**
   * Create a job. The record is written to the backend FIRST — a job that the
   * database refused must not appear on the board (previously this only touched
   * local state, so a "created" job vanished on the next refresh).
   */
  const addJob = useCallback(async (job) => {
    const newJob = {
      ...job,
      id: job.id || `JOB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: job.status || 'Pending',
      machineCode: job.machineCode || '',
      machine: machineLabel(job.machineCode),
      createdAt: new Date().toISOString(),
    };

    // Same key the database will store the row under (the Assembly task when
    // the board labels jobs with one), so later edits/status changes target it.
    // Pass the job through as `data` as well: `effectiveStage` reads the task
    // from `data.assemblyTask`, and addJob used to pass nothing, so an Assembly
    // job created with a task ("Final Assembly") was stored under the
    // workflow's FIRST stage ('Assembly') and the value the user typed was
    // silently dropped — create and edit disagreed, since `updateJob` does pass
    // the form data. Boards without a task field never set `assemblyTask`, so
    // `task` stays empty for them and the plain stage is used exactly as before.
    const savedStage = effectiveStage(newJob, newJob);
    if (savedStage) newJob.stage = savedStage;

    if (newJob.productionOrder && newJob.stage) {
      try {
        const { data: response } = await api.post('/production-entries', entryPayload(newJob));
        const saved = response?.data ?? response;
        if (saved?.id) newJob._backendId = saved.id;
      } catch (err) {
        console.error('Failed to create shop floor job:', err);
        return { data: null, error: err };
      }
    }

    setJobs((prev) => [newJob, ...prev]);
    return { data: newJob };
  }, [entryPayload, effectiveStage, machineLabel]);

  /**
   * Delete a job (and its stored Production Entry).
   *
   * The row is removed from the BACKEND first; only then from local state. The
   * previous implementation was local-only, so the job came straight back after
   * a refresh because the database row was never touched.
   */
  const deleteJob = useCallback(async (id) => {
    const job = jobs.find((j) => j.id === id);

    if (job) {
      try {
        const backendId = await resolveEntryId(job);
        if (backendId) await api.delete(`/production-entries/${backendId}`);
      } catch (err) {
        console.error('Failed to delete shop floor job:', err);
        // Re-sync so the board shows what the database actually holds.
        await loadJobs();
        throw err;
      }
    }

    setJobs((prev) => prev.filter((j) => j.id !== id));
    return { data: { id } };
  }, [jobs, resolveEntryId, loadJobs]);

  /**
   * Change ONLY the stage of an existing job (inline Stage column edit).
   *
   * Unlike `updateJob`, this never shows the new value before the database has
   * accepted it: on any failure the board is re-synced from the API and the
   * error is re-thrown, so the caller can report it instead of leaving an
   * unsaved stage on screen.
   *
   * The row is moved, not duplicated: the entry is written under its new
   * (order, item, stage) key FIRST and the superseded row is deleted only
   * after that succeeded. Quantities, item id, operator, status, remarks and
   * the other stage entries are carried over untouched. A stage that already
   * holds an entry for the same Work Order item is refused — the backend
   * upserts on that key, so writing it would overwrite the stored quantities.
   */
  const changeJobStage = useCallback(async (id, nextStageValue) => {
    const job = jobs.find((j) => j.id === id);
    const nextStage = String(nextStageValue || '').trim();
    if (!job) throw new Error('This job is no longer on the board. Refresh and try again.');
    if (!nextStage) throw new Error('Select a stage for this job.');
    if (nextStage === job.stage) return { data: job };
    if (!job.productionOrder) throw new Error('This job is not linked to a Work Order.');

    // The backend upserts on (order, item, stage) only, so an entry of ANY
    // production type already stored at the target stage is a collision —
    // writing over it would replace that record's quantities.
    const occupied = jobs.some(
      (other) =>
        other.id !== job.id &&
        other.productionOrder === job.productionOrder &&
        String(other.workOrderItemId || '') === String(job.workOrderItemId || '') &&
        other.stage === nextStage
    );
    if (occupied) {
      throw new Error(`A ${nextStage} entry already exists for this Work Order item.`);
    }

    const previousId = await resolveEntryId(job);
    let saved;
    try {
      const { data: response } = await api.post(
        '/production-entries',
        entryPayload(job, { stage: nextStage })
      );
      saved = response?.data ?? response;
    } catch (err) {
      await loadJobs();
      throw err;
    }

    let cleanupError = null;
    if (previousId && saved?.id && String(saved.id) !== String(previousId)) {
      try {
        await api.delete(`/production-entries/${previousId}`);
      } catch (err) {
        cleanupError = err;
      }
    }

    setJobs((prev) => prev.map((j) => (
      j.id === id
        ? { ...j, stage: nextStage, ...(saved?.id ? { _backendId: saved.id } : {}) }
        : j
    )));

    if (cleanupError) {
      await loadJobs();
      throw new Error('The stage was saved, but the previous stage record could not be removed.');
    }
    return { data: { ...job, stage: nextStage } };
  }, [jobs, resolveEntryId, entryPayload, loadJobs]);

  return {
    jobs,
    loading,
    startJob,
    holdJob,
    resumeJob,
    completeJob,
    skipJob,
    addJob,
    updateJob,
    changeJobStage,
    deleteJob,
    refresh: loadJobs,
  };
}

/**
 * Combine a search query with exact-match filters.
 */
export function filterShopFloorJobs(jobs, { query = '', filters = {}, searchFields = [] }) {
  const q = query.trim().toLowerCase();
  return jobs.filter((job) => {
    const matchesSearch =
      !q || searchFields.some((key) => String(job[key] ?? '').toLowerCase().includes(q));
    const matchesFilters = Object.entries(filters).every(
      ([key, value]) => value === 'All' || String(job[key] ?? '') === value
    );
    return matchesSearch && matchesFilters;
  });
}

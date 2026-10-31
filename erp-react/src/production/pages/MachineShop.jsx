import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ShopFloorBoard from '../components/production/shopfloor/ShopFloorBoard';
import { machineShopJobs } from '../data/machineShop';
import { machineService } from '../services/production';

const COLUMNS = [
  'Work Order',
  'Order Description',
  'Machine',
  'Operator',
  'Planned Qty',
  'Completed Qty',
  'Pending Qty',
  'Start Time',
  'End Time',
  'Status',
  'Progress',
  'Action',
];

const SEARCH_FIELDS = ['productionOrder', 'product', 'machine', 'operator'];

const FILTER_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'machine', label: 'Machine' },
  { key: 'operator', label: 'Operator' },
  { key: 'productionOrder', label: 'Work Order' },
];

/**
 * Machine Shop shop-floor page.
 *
 * `/production/machine-shop` renders the board; `/production/machine-shop/new`
 * and `/production/machine-shop/:id/edit` render the very same component in
 * page mode, where the board (cards, tabs, toolbar, table) is replaced by the
 * job form laid out in-flow as a full page — the same pattern Casting,
 * Fabrication and Assembly use. Without this wiring the board fell back to the
 * legacy `Modal fullPage` overlay, which positioned itself with a stale
 * sidebar token and left the listing visible beside the panel.
 */
export default function MachineShop({ createPage = false, editPage = false }) {
  const [searchParams] = useSearchParams();
  const isPage = createPage || editPage;
  /* Deep link from a table row ("create a job for this Work Order") carries the
     Work Order in the query string. */
  const initialWorkOrder = createPage ? (searchParams.get('workOrder') || '') : '';

  // Machine options are the persisted machine master (Settings → Machines),
  // read from the backend. They used to be read from the browser's localStorage
  // copy of the master, which the settings screen no longer writes — so the
  // dropdown was always empty and the field degraded to free text that the
  // backend had nowhere to store. A machine a job is assigned to must be a
  // configured machine (the API rejects anything else), so the field can only
  // be a picker over real records.
  const [machines, setMachines] = useState([]);
  const [machinesLoaded, setMachinesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await machineService.listMachines();
        if (!cancelled) setMachines(response.data || []);
      } catch {
        // Leave the list empty — the field then explains where machines come
        // from instead of silently accepting a value the API cannot store.
        if (!cancelled) setMachines([]);
      } finally {
        if (!cancelled) setMachinesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Retired ('Inactive') machines stay in the master and on jobs that already
  // reference them, but cannot be assigned to new work.
  const machineOptions = useMemo(
    () =>
      machines
        .filter((machine) => String(machine.status || '').toLowerCase() !== 'inactive')
        .map((machine) => ({
          value: machine.id,
          label: machine.name ? `${machine.id} · ${machine.name}` : machine.id,
        })),
    [machines]
  );

  const machineField = useMemo(
    () =>
      machineOptions.length
        ? {
            key: 'machineCode',
            label: 'Machine',
            type: 'select',
            options: machineOptions,
            hint: 'Machines come from Settings → Machines.',
          }
        : {
            key: 'machineCode',
            label: 'Machine',
            type: 'select',
            options: [],
            disabled: true,
            placeholder: machinesLoaded ? 'No machines configured' : 'Loading machines…',
            hint: machinesLoaded
              ? 'Add a machine in Settings → Machines to assign one to a job. Jobs can be saved without a machine.'
              : 'Loading the machine master…',
          },
    [machineOptions, machinesLoaded]
  );

  return (
    <ShopFloorBoard
      /* Force a fresh mount when switching between the board and the
         dedicated create / edit page — otherwise React reuses the same
         instance, the form state initialiser never re-runs and the create
         page renders empty when reached by in-app navigation. */
      key={createPage ? 'machine-shop-create' : editPage ? 'machine-shop-edit' : 'machine-shop-board'}
      title="Machine Shop"
      subtitle="Flexible machining work management connected to production orders."
      jobs={machineShopJobs}
      columns={COLUMNS}
      searchFields={SEARCH_FIELDS}
      filterFields={FILTER_FIELDS}
      searchPlaceholder="Search by work order, item name, machine or operator..."
      tableTitle="Machine Shop Jobs"
      storageKey="machineShop"
      idPrefix="MS"
      createLabel="Create Machine Shop Job"
      extraFields={[
        machineField,
        { key: 'startTime', label: 'Start Time', type: 'time', placeholder: 'e.g. 08:00' },
        { key: 'endTime', label: 'End Time', type: 'time', placeholder: 'e.g. 16:30' },
      ]}
      moduleName="machineShop"
      /* Create / Edit Machine Shop Job are dedicated full-page routes (like
         Create Casting / Fabrication / Assembly Job) so the board is not
         rendered behind an oversized overlay panel. */
      createPath={isPage ? undefined : '/production/machine-shop/new'}
      createPage={createPage}
      editPage={editPage}
      createBackPath="/production/machine-shop"
      initialWorkOrder={initialWorkOrder}
    />
  );
}

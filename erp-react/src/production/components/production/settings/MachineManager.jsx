import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../PageHeader';
import Icon from '../../icons/Icon';
import useProductionAccess from '../../../access/useProductionAccess';
import Modal from '../Modal';
import ShopFloorFilters from '../shopfloor/ShopFloorFilters';
import SettingsTable, { SettingsRowActions } from './SettingsTable';
import SettingsFormModal from './SettingsFormModal';
import { FILTER_DEPARTMENT_OPTIONS, DEPARTMENT_OPTIONS } from '../../../data/orders';
import { MACHINE_STATUSES, MACHINE_TYPES } from '../../../data/settings';
import { machineService, workCenterService } from '../../../services/production';
import './settings-pages.css';

const SEARCH_FIELDS = ['id', 'name', 'type', 'department', 'workCenter'];

const MACHINE_COLUMNS = [
  { key: 'id', label: 'Machine ID', render: (row) => <td className="cell-strong">{row.id}</td> },
  { key: 'name', label: 'Machine Name', render: (row) => <td>{row.name}</td> },
  { key: 'type', label: 'Machine Type', render: (row) => <td>{row.type}</td> },
  { key: 'department', label: 'Department', render: (row) => <td>{row.department}</td> },
  { key: 'workCenter', label: 'Work Center', render: (row) => <td className="cell-muted">{row.workCenter}</td> },
  { key: 'status', label: 'Status', statusKey: 'status' },
];

/**
 * Machine form fields.
 *
 * The Work Center is a picker over the persisted work center master
 * (Settings → Work Centers), not free text: a machine that names a work center
 * nobody configured can never be reconciled with the shop floor, and the API
 * rejects such a reference. `currentValue` keeps a value that is not in the
 * list (a machine saved before this field was a picker) selectable, so opening
 * such a machine for editing does not silently blank its work center.
 */
const machineFields = (workCenters = [], currentValue = '') => {
  const options = [
    { value: '', label: 'Not set' },
    ...workCenters
      .filter((center) => String(center.status || '').toLowerCase() !== 'inactive')
      .map((center) => ({
        value: center.id,
        label: center.name ? `${center.id} · ${center.name}` : center.id,
      })),
  ];
  const saved = currentValue ? workCenters.find((center) => center.id === currentValue) : null;
  if (currentValue && !saved) {
    options.push({ value: currentValue, label: `${currentValue} (not in the work center master)` });
  }

  return [
    { key: 'id', label: 'Machine ID *', type: 'text', placeholder: 'MCH-001', required: true },
    { key: 'name', label: 'Machine Name *', type: 'text', placeholder: 'CNC Lathe 01', required: true },
    { key: 'type', label: 'Machine Type *', type: 'select', options: MACHINE_TYPES, required: true },
    { key: 'department', label: 'Department *', type: 'select', options: DEPARTMENT_OPTIONS, required: true, default: 'Machine Shop' },
    {
      key: 'workCenter',
      label: 'Work Center',
      type: 'select',
      options,
      hint: 'Work centers come from Settings → Work Centers.',
    },
    { key: 'status', label: 'Status *', type: 'select', options: MACHINE_STATUSES, required: true, default: 'Available' },
    { key: 'availableHours', label: 'Available Hours', type: 'number', min: 0, placeholder: 'e.g. 160' },
    { key: 'runningHours', label: 'Running Hours', type: 'number', min: 0, placeholder: 'e.g. 128' },
    { key: 'idleHours', label: 'Idle Hours', type: 'number', min: 0, placeholder: 'e.g. 24' },
    { key: 'maintenanceHours', label: 'Maintenance Hours', type: 'number', min: 0, placeholder: 'e.g. 8' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional notes about the machine…', wide: true },
  ];
};

const EMPTY_FILTERS = { department: 'All', status: 'All' };

export default function MachineManager() {
  /* Access Management: creating or changing Production master data needs
     settings.create / settings.edit / settings.delete. The backend
     re-checks every write — hiding the control is only the UI half. */
  const { can } = useProductionAccess();
  const canCreateSettings = can('settings', 'create');
  const canEditSettings = can('settings', 'edit');
  const canDeleteSettings = can('settings', 'delete');
  // Machine master, read from and written to MySQL through the service layer.
  const [machines, setMachines] = useState([]);
  // Work center master — the machine form picks a work center from it, so the
  // reference a machine holds always resolves.
  const [workCenters, setWorkCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [formState, setFormState] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadMachines = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await machineService.listMachines();
      setMachines(response.data || []);
    } catch (error) {
      setLoadError(error.message || 'Could not load the machine master.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkCenters = useCallback(async () => {
    try {
      const response = await workCenterService.listWorkCenters();
      setWorkCenters(response.data || []);
    } catch {
      // The machine list is the important one; without work centers the form
      // still opens and a machine simply keeps no work center.
      setWorkCenters([]);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadMachines);
    queueMicrotask(loadWorkCenters);
  }, [loadMachines, loadWorkCenters]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return machines.filter((machine) => {
      const matchesSearch =
        !q || SEARCH_FIELDS.some((key) => String(machine[key] ?? '').toLowerCase().includes(q));
      const matchesDept = filters.department === 'All' || machine.department === filters.department;
      const matchesStatus = filters.status === 'All' || machine.status === filters.status;
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [machines, searchQuery, filters]);

  const filtersActive = searchQuery.trim() !== '' || filters.department !== 'All' || filters.status !== 'All';

  const clearAll = () => {
    setSearchQuery('');
    setFilters(EMPTY_FILTERS);
  };

  const handleSubmit = async (values) => {
    setFormError('');
    try {
      if (formState.mode === 'edit') {
        await machineService.updateMachine(formState.machine.id, values);
      } else {
        await machineService.createMachine(values);
      }
      setFormState(null);
      await loadMachines();
    } catch (error) {
      // The server's reason (duplicate machine id, invalid status, …) is shown
      // in the form; the modal stays open so the value can be corrected.
      setFormError(error.message || 'The machine could not be saved.');
    }
  };

  const confirmDelete = async () => {
    try {
      await machineService.deleteMachine(deleting.id);
      setDeleting(null);
      await loadMachines();
    } catch (error) {
      setLoadError(error.message || 'The machine could not be deleted.');
      setDeleting(null);
    }
  };

  return (
    <div className="ss-section">
      <PageHeader
        title="Machines"
        subtitle="Machine Shop and Machine Utilization report."
        actions={
          canCreateSettings && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
              setFormError('');
              setFormState({ mode: 'create', machine: null });
            }}
          >
            <Icon name="plus" size={15} /> Add Machine
          </button>
        )}
      />

      <div className="settings-note">
        <Icon name="info" size={15} />
        <span>
          Machine master data backs the Machine Shop module and the Machine Utilization report — the hours
          entered here are what that report divides. Records are saved on the server, so they survive a reload
          and are shared between users.
        </span>
      </div>

      <ShopFloorFilters
        ariaLabel="Search machines"
        searchPlaceholder="Search by machine ID, name, type, department or work center..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        fields={[
          { key: 'department', label: 'Department', options: ['All', ...FILTER_DEPARTMENT_OPTIONS] },
          { key: 'status', label: 'Status', options: ['All', ...MACHINE_STATUSES] },
        ]}
        filters={filters}
        onChange={setFilters}
        onClear={clearAll}
        clearVisible={filtersActive}
      />

      {loadError && (
        <div className="settings-note settings-note-error">
          <Icon name="info" size={15} />
          <span>{loadError}</span>
          <button type="button" className="btn btn-secondary" onClick={loadMachines}>
            Retry
          </button>
        </div>
      )}

      <section className="settings-page-card">
        <div className="settings-page-head">
          <div>
            <h3 className="settings-page-title">Machine Master</h3>
            <p className="settings-page-subtitle">
              Showing {filtered.length} of {machines.length} machines
            </p>
          </div>
        </div>

        {loading ? (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="cpu" size={22} />
            </span>
            <h4>Loading machines…</h4>
          </div>
        ) : filtered.length > 0 ? (
          <SettingsTable
            columns={MACHINE_COLUMNS}
            rows={filtered}
            renderActions={(machine) => (
              <SettingsRowActions
                item={machine}
                labels={{ singular: 'Machine', name: 'name' }}
                canEdit={canEditSettings}
                canDelete={canDeleteSettings}
                onView={(item) => {
                  setFormError('');
                  setFormState({ mode: 'view', machine: item });
                }}
                onEdit={(item) => {
                  setFormError('');
                  setFormState({ mode: 'edit', machine: item });
                }}
                onDelete={setDeleting}
              />
            )}
          />
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="cpu" size={22} />
            </span>
            <h4>No machines found</h4>
            <p>
              {machines.length === 0
                ? 'No machines have been added yet.'
                : 'No records match your search and filter criteria.'}
            </p>
            {machines.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={clearAll}>
                Clear Filters
              </button>
            )}
          </div>
        )}
      </section>

      {formState && (
        <SettingsFormModal
          title={
            formState.mode === 'view'
              ? `View ${formState.machine.name}`
              : formState.mode === 'edit'
                ? `Edit ${formState.machine.name}`
                : 'Add Machine'
          }
          fields={machineFields(workCenters, formState.machine?.workCenter || '')}
          initialValues={formState.machine}
          mode={formState.mode}
          idKey="id"
          existingIds={machines.map((m) => m.id)}
          errorMessage={formError}
          onSubmit={handleSubmit}
          onCancel={() => setFormState(null)}
        />
      )}

      {deleting && (
        <Modal
          title="Delete Machine"
          size="sm"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                <Icon name="trash" size={14} /> Delete
              </button>
            </>
          }
        >
          <p className="confirm-text">Are you sure you want to delete this machine?</p>
          <p className="confirm-subtext">
            <strong>{deleting.id}</strong> · {deleting.name}
          </p>
        </Modal>
      )}
    </div>
  );
}

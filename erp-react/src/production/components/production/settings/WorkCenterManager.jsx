import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../PageHeader';
import Icon from '../../icons/Icon';
import useProductionAccess from '../../../access/useProductionAccess';
import Modal from '../Modal';
import ShopFloorFilters from '../shopfloor/ShopFloorFilters';
import SettingsTable, { SettingsRowActions } from './SettingsTable';
import SettingsFormModal from './SettingsFormModal';
import { FILTER_DEPARTMENT_OPTIONS, DEPARTMENT_OPTIONS } from '../../../data/orders';
import { WORK_CENTER_LOCATIONS } from '../../../data/settings';
import { workCenterService } from '../../../services/production';
import './settings-pages.css';

const SEARCH_FIELDS = ['id', 'name', 'department', 'location', 'supervisor'];

const WC_COLUMNS = [
  { key: 'id', label: 'Work Center ID', render: (row) => <td className="cell-strong">{row.id}</td> },
  { key: 'name', label: 'Work Center Name', render: (row) => <td>{row.name}</td> },
  { key: 'department', label: 'Department', render: (row) => <td>{row.department}</td> },
  { key: 'location', label: 'Location', render: (row) => <td>{row.location}</td> },
  { key: 'supervisor', label: 'Supervisor', render: (row) => <td>{row.supervisor}</td> },
  { key: 'status', label: 'Status', statusKey: 'status' },
];

const WC_FIELDS = [
  { key: 'id', label: 'Work Center ID *', type: 'text', placeholder: 'WC-001', required: true },
  { key: 'name', label: 'Work Center Name *', type: 'text', placeholder: 'Foundry — Shell & Pouring', required: true },
  { key: 'department', label: 'Department *', type: 'select', options: DEPARTMENT_OPTIONS, required: true, default: 'Casting' },
  { key: 'location', label: 'Location *', type: 'select', options: WORK_CENTER_LOCATIONS, required: true },
  { key: 'supervisor', label: 'Supervisor', type: 'text', placeholder: 'Shift supervisor name' },
  { key: 'status', label: 'Status *', type: 'select', options: ['Active', 'Inactive'], required: true, default: 'Active' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional notes about the work center…', wide: true },
];

const EMPTY_FILTERS = { department: 'All', status: 'All' };

export default function WorkCenterManager() {
  /* Access Management: creating or changing Production master data needs
     settings.create / settings.edit / settings.delete. The backend
     re-checks every write — hiding the control is only the UI half. */
  const { can } = useProductionAccess();
  const canCreateSettings = can('settings', 'create');
  const canEditSettings = can('settings', 'edit');
  const canDeleteSettings = can('settings', 'delete');
  // Work center master, read from and written to MySQL through the service layer.
  const [workCenters, setWorkCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [formState, setFormState] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadWorkCenters = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await workCenterService.listWorkCenters();
      setWorkCenters(response.data || []);
    } catch (error) {
      setLoadError(error.message || 'Could not load the work center master.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadWorkCenters);
  }, [loadWorkCenters]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workCenters.filter((wc) => {
      const matchesSearch =
        !q || SEARCH_FIELDS.some((key) => String(wc[key] ?? '').toLowerCase().includes(q));
      const matchesDept = filters.department === 'All' || wc.department === filters.department;
      const matchesStatus = filters.status === 'All' || wc.status === filters.status;
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [workCenters, searchQuery, filters]);

  const filtersActive = searchQuery.trim() !== '' || filters.department !== 'All' || filters.status !== 'All';

  const clearAll = () => {
    setSearchQuery('');
    setFilters(EMPTY_FILTERS);
  };

  const handleSubmit = async (values) => {
    setFormError('');
    try {
      if (formState.mode === 'edit') {
        await workCenterService.updateWorkCenter(formState.workCenter.id, values);
      } else {
        await workCenterService.createWorkCenter(values);
      }
      setFormState(null);
      await loadWorkCenters();
    } catch (error) {
      setFormError(error.message || 'The work center could not be saved.');
    }
  };

  const confirmDelete = async () => {
    try {
      await workCenterService.deleteWorkCenter(deleting.id);
      setDeleting(null);
      await loadWorkCenters();
    } catch (error) {
      setLoadError(error.message || 'The work center could not be deleted.');
      setDeleting(null);
    }
  };

  return (
    <div className="ss-section">
      <PageHeader
        title="Work Centers"
        subtitle="Work center master for shop floor operations."
        actions={
          canCreateSettings && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
              setFormError('');
              setFormState({ mode: 'create', workCenter: null });
            }}
          >
            <Icon name="plus" size={15} /> Add Work Center
          </button>
        )}
      />

      <div className="settings-note">
        <Icon name="info" size={15} />
        <span>
          Work centers are the physical areas of the shop floor — casting, fabrication, machine shop and
          assembly. Records are saved on the server, so they survive a reload and are shared between users.
        </span>
      </div>

      <ShopFloorFilters
        ariaLabel="Search work centers"
        searchPlaceholder="Search by work center ID, name, department, location or supervisor..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        fields={[
          { key: 'department', label: 'Department', options: ['All', ...FILTER_DEPARTMENT_OPTIONS] },
          { key: 'status', label: 'Status', options: ['All', 'Active', 'Inactive'] },
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
          <button type="button" className="btn btn-secondary" onClick={loadWorkCenters}>
            Retry
          </button>
        </div>
      )}

      <section className="settings-page-card">
        <div className="settings-page-head">
          <div>
            <h3 className="settings-page-title">Work Center Master</h3>
            <p className="settings-page-subtitle">
              Showing {filtered.length} of {workCenters.length} work centers
            </p>
          </div>
        </div>

        {loading ? (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="grid" size={22} />
            </span>
            <h4>Loading work centers…</h4>
          </div>
        ) : filtered.length > 0 ? (
          <SettingsTable
            columns={WC_COLUMNS}
            rows={filtered}
            renderActions={(wc) => (
              <SettingsRowActions
                item={wc}
                labels={{ singular: 'Work Center', name: 'name' }}
                canEdit={canEditSettings}
                canDelete={canDeleteSettings}
                onView={(item) => {
                  setFormError('');
                  setFormState({ mode: 'view', workCenter: item });
                }}
                onEdit={(item) => {
                  setFormError('');
                  setFormState({ mode: 'edit', workCenter: item });
                }}
                onDelete={setDeleting}
              />
            )}
          />
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="grid" size={22} />
            </span>
            <h4>No work centers found</h4>
            <p>
              {workCenters.length === 0
                ? 'No work centers have been added yet.'
                : 'No records match your search and filter criteria.'}
            </p>
            {workCenters.length > 0 && (
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
              ? `View ${formState.workCenter.name}`
              : formState.mode === 'edit'
                ? `Edit ${formState.workCenter.name}`
                : 'Add Work Center'
          }
          fields={WC_FIELDS}
          initialValues={formState.workCenter}
          mode={formState.mode}
          idKey="id"
          existingIds={workCenters.map((wc) => wc.id)}
          errorMessage={formError}
          onSubmit={handleSubmit}
          onCancel={() => setFormState(null)}
        />
      )}

      {deleting && (
        <Modal
          title="Delete Work Center"
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
          <p className="confirm-text">Are you sure you want to delete this work center?</p>
          <p className="confirm-subtext">
            <strong>{deleting.id}</strong> · {deleting.name}
          </p>
        </Modal>
      )}
    </div>
  );
}

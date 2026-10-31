import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../PageHeader';
import Icon from '../../icons/Icon';
import useProductionAccess from '../../../access/useProductionAccess';
import Modal from '../Modal';
import SettingsTable from './SettingsTable';
import SettingsFormModal from './SettingsFormModal';
import { isProtectedStatus, STATUS_CATEGORIES } from '../../../data/settings';
import { settingsService } from '../../../services/production';
import './settings-pages.css';

const STATUS_COLUMNS = [
  { key: 'name', label: 'Status Name', render: (row) => <td className="cell-strong">{row.name}</td> },
  { key: 'category', label: 'Category', render: (row) => <td>{row.category}</td> },
  { key: 'description', label: 'Description', render: (row) => <td className="cell-muted">{row.description}</td> },
  // `active` is rendered as a live toggle — its renderer is supplied by the
  // component-level `columns` memo below.
  { key: 'active', label: 'Active' },
  {
    key: 'displayOrder',
    label: 'Display Order',
    render: (row) => (
      <td>
        <span className="status-order-col">{row.displayOrder}</span>
      </td>
    ),
  },
];

const STATUS_FIELDS = [
  { key: 'name', label: 'Status Name *', type: 'text', placeholder: 'In Progress', required: true },
  { key: 'category', label: 'Category *', type: 'select', options: STATUS_CATEGORIES, required: true },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'When is this status used…', wide: true },
  { key: 'active', label: 'Active', type: 'select', options: ['Active', 'Inactive'], default: 'Active' },
  { key: 'displayOrder', label: 'Display Order', type: 'number', min: 1 },
];

/**
 * Translate the form's `Active`/`Inactive` select and possibly-empty display
 * order into the payload the status-master API expects. A blank display order
 * is sent as null: on create the backend assigns the next position in the
 * category, on update the existing position is kept.
 */
const toStatusPayload = (values) => ({
  name: String(values.name ?? '').trim(),
  category: values.category,
  description: values.description || null,
  active: values.active !== 'Inactive',
  displayOrder: Number(values.displayOrder) > 0 ? Number(values.displayOrder) : null,
});

export default function StatusMasterManager() {
  /* Access Management: creating or changing Production master data needs
     settings.create / settings.edit / settings.delete. The backend
     re-checks every write — hiding the control is only the UI half. */
  const { can } = useProductionAccess();
  const canCreateSettings = can('settings', 'create');
  const canEditSettings = can('settings', 'edit');
  const canDeleteSettings = can('settings', 'delete');
  // Status masters, read from and written to MySQL through the service layer.
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [category, setCategory] = useState(STATUS_CATEGORIES[0]);
  const [formState, setFormState] = useState(null); // { mode, status }
  const [blocked, setBlocked] = useState(null); // protected status attempted delete
  const [deleting, setDeleting] = useState(null);

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await settingsService.listStatusMasterRecords();
      setStatuses(response.data || []);
    } catch (error) {
      setLoadError(error.message || 'Could not load the status masters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadStatuses);
  }, [loadStatuses]);

  const categoryStatuses = useMemo(
    () => statuses.filter((s) => s.category === category).sort((a, b) => a.displayOrder - b.displayOrder),
    [statuses, category]
  );

  const handleSubmit = async (values) => {
    setFormError('');
    try {
      if (formState.mode === 'edit') {
        await settingsService.updateStatusMaster(formState.status.id, toStatusPayload(values));
      } else {
        await settingsService.createStatusMaster(toStatusPayload(values));
      }
      setCategory(values.category);
      setFormState(null);
      await loadStatuses();
    } catch (error) {
      setFormError(error.message || 'The status could not be saved.');
    }
  };

  const toggleActive = async (status) => {
    setLoadError('');
    try {
      await settingsService.updateStatusMaster(status.id, {
        name: status.name,
        category: status.category,
        description: status.description,
        active: !status.active,
        displayOrder: status.displayOrder,
      });
      await loadStatuses();
    } catch (error) {
      setLoadError(error.message || 'The status could not be updated.');
    }
  };

  const requestDelete = (status) => {
    if (isProtectedStatus(status.name)) {
      setBlocked(status);
    } else {
      setDeleting(status);
    }
  };

  const confirmDelete = async () => {
    try {
      await settingsService.deleteStatusMaster(deleting.id);
      setDeleting(null);
      await loadStatuses();
    } catch (error) {
      setLoadError(error.message || 'The status could not be deleted.');
      setDeleting(null);
    }
  };

  const columns = useMemo(
    () =>
      STATUS_COLUMNS.map((column) =>
        column.key === 'active'
          ? {
              ...column,
              render: (row) => (
                <td>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={() => toggleActive(row)}
                      aria-label={`Toggle ${row.name}`}
                    />
                    <span className="switch-track" />
                  </label>
                </td>
              ),
            }
          : column
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statuses]
  );

  return (
    <div className="ss-section">
      <PageHeader
        title="Status Masters"
        subtitle="Manage the status values used across production orders, shop floor, quality, packing and dispatch."
        actions={
          canCreateSettings && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
              setFormError('');
              setFormState({ mode: 'create', status: { category } });
            }}
          >
            <Icon name="plus" size={15} /> Add Status
          </button>
        )}
      />

      <div className="settings-note">
        <Icon name="info" size={15} />
        <span>
          Statuses marked <span className="status-protected-tag"><Icon name="shield-check" size={11} /> In Use</span> are
          referenced by the workflows and cannot be deleted — they can still be edited or disabled. Records are saved
          on the server, so they survive a reload.
        </span>
      </div>

      {loadError && (
        <div className="settings-note settings-note-error">
          <Icon name="info" size={15} />
          <span>{loadError}</span>
          <button type="button" className="btn btn-secondary" onClick={loadStatuses}>
            Retry
          </button>
        </div>
      )}

      <div className="status-cats" role="tablist" aria-label="Status categories">
        {STATUS_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={category === cat}
            className={`status-cat-btn${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
            <span>{statuses.filter((s) => s.category === cat).length}</span>
          </button>
        ))}
      </div>

      <section className="settings-page-card">
        <div className="settings-page-head">
          <div>
            <h3 className="settings-page-title">{category}</h3>
            <p className="settings-page-subtitle">
              {loading
                ? 'Loading…'
                : `${categoryStatuses.length} status${categoryStatuses.length === 1 ? '' : 'es'} defined`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="flag" size={22} />
            </span>
            <h4>Loading statuses…</h4>
          </div>
        ) : (
          <SettingsTable
            columns={columns}
            rows={categoryStatuses}
            rowKey="key"
            renderActions={(status) => (
              <div className="row-actions">
                {canEditSettings && (
                  <button
                    type="button"
                    className="btn-icon"
                    title="Edit Status"
                    aria-label={`Edit ${status.name}`}
                    onClick={() => {
                      setFormError('');
                      setFormState({ mode: 'edit', status });
                    }}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                )}
                {canDeleteSettings && (
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    title={isProtectedStatus(status.name) ? 'In use — cannot be deleted' : 'Delete Status'}
                    aria-label={`Delete ${status.name}`}
                    onClick={() => requestDelete(status)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            )}
          />
        )}
      </section>

      {formState && (
        <SettingsFormModal
          title={formState.mode === 'edit' ? `Edit ${formState.status.name}` : 'Add Status'}
          fields={STATUS_FIELDS}
          initialValues={
            formState.status
              ? {
                  ...formState.status,
                  active: formState.status.active ? 'Active' : 'Inactive',
                }
              : { category: formState.category }
          }
          mode={formState.mode}
          idKey="name"
          existingIds={statuses
            .filter((s) => s.category === (formState.status?.category ?? formState.category))
            .map((s) => s.name)}
          errorMessage={formError}
          onSubmit={handleSubmit}
          onCancel={() => setFormState(null)}
        />
      )}

      {blocked && (
        <Modal
          title="Status In Use"
          size="sm"
          onClose={() => setBlocked(null)}
          footer={
            <button type="button" className="btn btn-secondary" onClick={() => setBlocked(null)}>
              OK
            </button>
          }
        >
          <p className="confirm-text">This status cannot be deleted.</p>
          <p className="confirm-subtext">
            <strong>{blocked.name}</strong> is referenced by the production workflows. You can edit it or
            disable it instead.
          </p>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete Status"
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
          <p className="confirm-text">Are you sure you want to delete this status?</p>
          <p className="confirm-subtext">
            <strong>{deleting.name}</strong> · {deleting.category}
          </p>
        </Modal>
      )}
    </div>
  );
}

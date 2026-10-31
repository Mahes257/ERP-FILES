import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../PageHeader';
import Icon from '../../icons/Icon';
import useProductionAccess from '../../../access/useProductionAccess';
import Modal from '../Modal';
import ShopFloorFilters from '../shopfloor/ShopFloorFilters';
import SettingsTable, { SettingsRowActions } from './SettingsTable';
import SettingsFormModal from './SettingsFormModal';
import { USER_ROLES } from '../../../data/settings';
import { settingsService } from '../../../services/production';
import { clearData, loadData } from '../../../utils/storage';
import './settings-pages.css';

const SEARCH_FIELDS = ['name', 'email', 'role', 'department'];

const USER_COLUMNS = [
  { key: 'name', label: 'User Name', render: (row) => <td className="cell-strong">{row.name}</td> },
  { key: 'email', label: 'Email', render: (row) => <td>{row.email}</td> },
  { key: 'role', label: 'Role', render: (row) => <td>{row.role}</td> },
  { key: 'department', label: 'Department', render: (row) => <td>{row.department}</td> },
  { key: 'status', label: 'Status', statusKey: 'status' },
  { key: 'lastLogin', label: 'Last Login', render: (row) => <td className="cell-muted">{row.lastLogin}</td> },
];

const USER_FIELDS = [
  { key: 'name', label: 'Name *', type: 'text', placeholder: 'Full name', required: true },
  { key: 'email', label: 'Email *', type: 'email', placeholder: 'user@vishaktech.com', required: true },
  { key: 'role', label: 'Role *', type: 'select', options: USER_ROLES, required: true },
  { key: 'department', label: 'Department *', type: 'text', placeholder: 'Casting, Machine Shop…', required: true },
  { key: 'status', label: 'Status *', type: 'select', options: ['Active', 'Inactive'], required: true, default: 'Active' },
];

const EMPTY_FILTERS = { role: 'All', status: 'All' };

export default function UserRoleManager() {
  /* Access Management: creating or changing Production master data needs
     settings.create / settings.edit / settings.delete. The backend
     re-checks every write — hiding the control is only the UI half. */
  const { can } = useProductionAccess();
  const canCreateSettings = can('settings', 'create');
  const canEditSettings = can('settings', 'edit');
  const canDeleteSettings = can('settings', 'delete');
  // The user register lives on the server (app_settings → production.users), so
  // Production Settings → Access Management sees the same list and a created
  // user can be given individual permissions under its stable USR-NNN id.
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [formState, setFormState] = useState(null); // { mode, user }
  const [deleting, setDeleting] = useState(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !q || SEARCH_FIELDS.some((key) => String(user[key] ?? '').toLowerCase().includes(q));
      const matchesRole = filters.role === 'All' || user.role === filters.role;
      const matchesStatus = filters.status === 'All' || user.status === filters.status;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, filters]);

  const filtersActive =
    searchQuery.trim() !== '' || filters.role !== 'All' || filters.status !== 'All';

  const clearAll = () => {
    setSearchQuery('');
    setFilters(EMPTY_FILTERS);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let rows = await settingsService.listUsers();
      // One-time carry-over of the register this screen used to keep in the
      // browser, so no user created before this change is lost.
      if (rows.length === 0) {
        const legacy = loadData('users', []);
        if (Array.isArray(legacy) && legacy.length > 0) {
          rows = await settingsService.saveUsers(legacy);
          clearData('users');
        }
      }
      setUsers(rows);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Persist the whole register and adopt the server's normalised answer. */
  const persist = async (next) => {
    setSaving(true);
    setError(null);
    try {
      setUsers(await settingsService.saveUsers(next));
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (values) => {
    const result = formState.mode === 'edit'
      ? settingsService.updateUser(users, formState.user.id, values)
      : settingsService.createUser(users, values);
    if (result.error) {
      setError(new Error(result.error));
      return;
    }
    if (await persist(result.data)) setFormState(null);
  };

  const confirmDelete = async () => {
    const result = settingsService.deleteUser(users, deleting.id);
    if (result.error) {
      setError(new Error(result.error));
      setDeleting(null);
      return;
    }
    if (await persist(result.data)) setDeleting(null);
  };

  return (
    <div className="ss-section">
      <PageHeader
        title="Users & Roles"
        subtitle="Manage production users, roles and departments. These are master-data records — they do not sign in."
        actions={
          canCreateSettings && (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => setFormState({ mode: 'create', user: null })}>
              <Icon name="plus" size={15} /> Add User
            </button>
          )
        }
      />

      <div className="settings-note">
        <Icon name="info" size={15} />
        <span>
          Users &amp; roles are master data for the Production UI (operators, supervisors, inspectors and dispatch users).
          The list is saved on the server, so a user you create here appears immediately in
          {' '}<strong>Settings → Access Management → Configure access for: User</strong>{' '}
          under its own <strong>USR-</strong> id. These records carry no password and cannot sign in: while a
          person has no ERP login account, their individual configuration is stored but cannot yet be enforced
          for them — they are addressed by their ERP account as soon as one exists with the same email.
        </span>
      </div>

      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'The Production user list could not be saved.'}</p>
          <button type="button" className="cpr-error-retry" onClick={load}>Reload</button>
        </div>
      )}

      <ShopFloorFilters
        ariaLabel="Search users"
        searchPlaceholder="Search by name, email, role or department..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        fields={[
          { key: 'role', label: 'Role', options: ['All', ...USER_ROLES] },
          { key: 'status', label: 'Status', options: ['All', 'Active', 'Inactive'] },
        ]}
        filters={filters}
        onChange={setFilters}
        onClear={clearAll}
        clearVisible={filtersActive}
      />

      <section className="settings-page-card">
        <div className="settings-page-head">
          <div>
            <h3 className="settings-page-title">Production Users</h3>
            <p className="settings-page-subtitle">
              Showing {filtered.length} of {users.length} users
            </p>
          </div>
        </div>

        {loading ? (
          <div className="sf-empty">
            <span className="sf-empty-icon"><Icon name="user" size={22} /></span>
            <h4>Loading users</h4>
            <p>Reading the Production user register.</p>
          </div>
        ) : filtered.length > 0 ? (
          <SettingsTable
            columns={USER_COLUMNS}
            rows={filtered}
            renderActions={(user) => (
              <SettingsRowActions
                item={user}
                labels={{ singular: 'User', name: 'name' }}
                canEdit={canEditSettings}
                canDelete={canDeleteSettings}
                onView={(item) => setFormState({ mode: 'view', user: item })}
                onEdit={(item) => setFormState({ mode: 'edit', user: item })}
                onDelete={setDeleting}
              />
            )}
          />
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="user" size={22} />
            </span>
            <h4>No users found</h4>
            <p>No records match your search and filter criteria.</p>
            <button type="button" className="btn btn-secondary" onClick={clearAll}>
              Clear Filters
            </button>
          </div>
        )}
      </section>

      {formState && (
        <SettingsFormModal
          title={
            formState.mode === 'view'
              ? `View ${formState.user.name}`
              : formState.mode === 'edit'
                ? `Edit ${formState.user.name}`
                : 'Add User'
          }
          fields={USER_FIELDS}
          initialValues={formState.user}
          mode={formState.mode}
          idKey="id"
          existingIds={users.map((user) => user.id)}
          onSubmit={handleSubmit}
          onCancel={() => setFormState(null)}
        />
      )}

      {deleting && (
        <Modal
          title="Delete User"
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
          <p className="confirm-text">Are you sure you want to delete this user?</p>
          <p className="confirm-subtext">
            <strong>{deleting.name}</strong> · {deleting.email}
          </p>
        </Modal>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Icon from '../../components/icons/Icon';
import useProductionAccess from '../../access/useProductionAccess';
import { settingsService } from '../../services/production';
import '../../components/production/settings/settings-pages.css';

/**
 * Production Settings → Notifications.
 *
 * The same draft/save model as every other Production settings section: the
 * screen edits a DRAFT, nothing is written until Save Changes, Reset Changes
 * restores the last saved values, and the sticky bar carries the unsaved marker
 * and the Saved confirmation.
 *
 * The toggles are the gates the backend publisher actually reads
 * (`ProductionNotificationPublisher` → `production.notif.*` in app_settings), so
 * switching one off really does stop that event from being delivered — this is
 * not a UI-only preference.
 *
 * Every row below is answered by a real Production workflow transition; there is
 * no toggle for an operation that does not exist.
 */
const EVENT_GROUPS = [
  {
    key: 'workOrders',
    label: 'Work Orders',
    events: [
      { key: 'workOrderPendingApproval', label: 'Work Order Pending Approval', sub: 'Submitted for production approval.' },
      { key: 'workOrderAdminApprovalPending', label: 'Work Order Pending Admin Approval', sub: 'Passed production approval and needs admin approval.' },
      { key: 'workOrderApproved', label: 'Work Order Approved', sub: 'Approved by production, admin or final approval.' },
      { key: 'workOrderRejected', label: 'Work Order Rejected', sub: 'Rejected by production or admin.' },
      { key: 'workOrderReleased', label: 'Work Order Released', sub: 'Released to the shop floor for production.' },
      { key: 'workOrderStarted', label: 'Work Order Started', sub: 'Production moved to In Progress.' },
      { key: 'workOrderOnHold', label: 'Work Order On Hold', sub: 'Production was put on hold.' },
      { key: 'workOrderSentToQuality', label: 'Work Order Sent to Quality', sub: 'Waiting for quality inspection.' },
      { key: 'workOrderCompleted', label: 'Work Order Completed', sub: 'Production finished.' },
      { key: 'workOrderFailed', label: 'Work Order Failed', sub: 'Failed at the quality stage.' },
      { key: 'workOrderCancelled', label: 'Work Order Cancelled', sub: 'Cancelled at any stage.' },
    ],
  },
  {
    key: 'verification',
    label: 'Technical Verification',
    events: [
      { key: 'technicalVerificationPending', label: 'Technical Verification Pending', sub: 'Submitted or resubmitted for verification.' },
      { key: 'technicalVerificationApproved', label: 'Technical Verification Approved', sub: 'A work order item was verified.' },
      { key: 'technicalVerificationRejected', label: 'Technical Verification Rejected', sub: 'A work order item was rejected.' },
    ],
  },
  {
    key: 'drawings',
    label: 'Drawings',
    events: [
      { key: 'drawingPendingApproval', label: 'Drawing Pending Approval', sub: 'A drawing was uploaded and awaits verification.' },
      { key: 'drawingApproved', label: 'Drawing Approved', sub: 'A drawing was verified.' },
      { key: 'drawingRejected', label: 'Drawing Rejected', sub: 'A drawing was rejected.' },
    ],
  },
  {
    key: 'models',
    label: 'Models',
    events: [
      { key: 'modelPendingApproval', label: 'Model Pending Approval', sub: 'A 3D model was uploaded and awaits verification.' },
      { key: 'modelApproved', label: 'Model Approved', sub: 'A 3D model was verified.' },
      { key: 'modelRejected', label: 'Model Rejected', sub: 'A 3D model was rejected.' },
    ],
  },
  {
    key: 'quality',
    label: 'Quality Inspection',
    events: [
      { key: 'qualityInspectionPending', label: 'Quality Inspection Pending', sub: 'An inspection was created and is waiting to be carried out.' },
      { key: 'qualityInspectionPassed', label: 'Quality Inspection Passed', sub: 'An inspection was marked Passed.' },
      { key: 'qualityInspectionFailed', label: 'Quality Inspection Failed', sub: 'An inspection was marked Failed.' },
      { key: 'qualityInspectionOnHold', label: 'Quality Inspection On Hold', sub: 'An inspection was put on hold.' },
    ],
  },
  {
    key: 'packing',
    label: 'Packing & Dispatch',
    events: [
      { key: 'packingPending', label: 'Packing Pending', sub: 'A packing list was created and is waiting to be packed.' },
      { key: 'packingCompleted', label: 'Packing Completed', sub: 'A packing list reached Completed or Ready for Dispatch.' },
      { key: 'dispatchPending', label: 'Dispatch Pending', sub: 'A dispatch was created and is waiting to leave the factory.' },
      { key: 'dispatchCompleted', label: 'Dispatch Completed', sub: 'A dispatch left the factory (Dispatched, In Transit or Delivered).' },
    ],
  },
];

const ALL_EVENTS = EVENT_GROUPS.flatMap((group) => group.events);

/** Card shell matching the shared settings design (title band + body). */
function Card({ title, aside, children }) {
  return (
    <section className="ss-card">
      <div className="ss-card-header">
        <h4>{title}</h4>
        {aside && <span>{aside}</span>}
      </div>
      <div className="ss-card-body">{children}</div>
    </section>
  );
}

function ToggleRow({ label, sub, checked, onChange, disabled }) {
  return (
    <div className="ss-row">
      <span style={{ minWidth: 0 }}>
        <span className="ss-row-label" style={{ display: 'block' }}>{label}</span>
        {sub && <span className="ss-hint">{sub}</span>}
      </span>
      <label className="ss-toggle">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-label={label}
        />
        <span className="ss-toggle-slider" />
      </label>
    </div>
  );
}

export default function ProductionNotifications() {
  /* Saving needs settings.edit. The backend rejects the write; this only hides
     the control for a role that may view the section but not change it. */
  const { can } = useProductionAccess();
  const canEditSettings = can('settings', 'edit');

  const [values, setValues] = useState({});
  const [savedValues, setSavedValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await settingsService.loadNotificationPreferences();
      const data = response.data || {};
      // Only keys this screen owns: the response is merged over the defaults so a
      // preference never saved still renders with its documented state.
      const merged = ALL_EVENTS.reduce((acc, event) => {
        acc[event.key] = data[event.key] === true;
        return acc;
      }, {});
      setValues(merged);
      setSavedValues(merged);
      setBanner(null);
    } catch (loadError) {
      setBanner({ tone: 'error', text: loadError.message || 'Could not load the saved notification preferences.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const isDirty = useMemo(() => {
    try {
      return JSON.stringify(values) !== JSON.stringify(savedValues);
    } catch {
      return false;
    }
  }, [values, savedValues]);

  const toggle = (key) => (next) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    setSaveState('idle');
  };

  const resetChanges = () => {
    setValues(savedValues);
    setSaveState('idle');
    setBanner({ tone: 'info', text: 'Unsaved changes discarded — the last saved preferences are back.' });
  };

  const save = async () => {
    setSaveState('saving');
    setBanner(null);
    try {
      const payload = ALL_EVENTS.reduce((acc, event) => {
        acc[event.key] = Boolean(values[event.key]);
        return acc;
      }, {});
      await settingsService.saveNotificationPreferences(payload);
      // Re-read so the draft matches exactly what the server stored.
      const response = await settingsService.loadNotificationPreferences();
      const data = response.data || {};
      const merged = ALL_EVENTS.reduce((acc, event) => {
        acc[event.key] = data[event.key] === true;
        return acc;
      }, {});
      setValues(merged);
      setSavedValues(merged);
      setSaveState('saved');
      setBanner({ tone: 'success', text: 'Notification preferences saved. Production events now follow these switches.' });
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (saveError) {
      // The draft stays dirty: nothing was persisted.
      setSaveState('idle');
      setBanner({ tone: 'error', text: saveError.message || 'The notification preferences could not be saved — nothing was changed.' });
    }
  };

  const enabledCount = ALL_EVENTS.filter((event) => values[event.key]).length;

  return (
    <div className="ss-section">
      <PageHeader
        title="Production Notification Preferences"
        subtitle="Choose which Production events raise a notification for the team."
      />

      <div className="settings-note">
        <Icon name="info" size={15} />
        <span>
          A switched-on event is delivered to the ERP notification bell and the Notifications page as soon as the
          workflow step happens, with the document number and the record it refers to. Approval events go to the
          approver roles; the rest go to the whole Production team. Switching an event off stops new notifications —
          the ones already delivered stay in the inbox.
        </span>
      </div>

      {banner && (
        <div className={`ss-banner ss-banner--${banner.tone}`} role={banner.tone === 'error' ? 'alert' : 'status'}>
          <p>{banner.text}</p>
          <button type="button" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {banner?.tone === 'error' && (
        <button type="button" className="ss-mini-btn" style={{ marginTop: 10 }} onClick={load}>
          <Icon name="refresh-cw" size={14} /> Reload preferences
        </button>
      )}

      <div style={{ height: 16 }} />

      <Card
        title="Production Notification Events"
        aside={loading ? 'Loading…' : `${enabledCount} of ${ALL_EVENTS.length} enabled`}
      >
        {EVENT_GROUPS.map((group, index) => (
          <div key={group.key} style={{ marginTop: index === 0 ? 0 : 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ss-muted)',
                padding: '10px 0 6px',
              }}
            >
              {group.label}
            </div>
            {group.events.map((event) => (
              <ToggleRow
                key={event.key}
                label={event.label}
                sub={event.sub}
                checked={Boolean(values[event.key])}
                onChange={toggle(event.key)}
                disabled={loading || !canEditSettings}
              />
            ))}
          </div>
        ))}
      </Card>

      {/* Sticky action bar — the same draft/save model as the PDE reference. */}
      <div className="ss-actions">
        <div className="ss-actions-left">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetChanges}
            disabled={!isDirty || saveState === 'saving'}
            title={isDirty ? 'Discard the unsaved changes on this screen' : 'No unsaved changes'}
          >
            <Icon name="rotate-ccw" size={15} /> Reset Changes
          </button>
          {isDirty && <span className="ss-dirty">Unsaved changes</span>}
        </div>
        <div className="ss-actions-right">
          {saveState === 'saved' && (
            <span className="ss-saved"><Icon name="check" size={14} /> Saved</span>
          )}
          {canEditSettings && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={!isDirty || loading || saveState === 'saving'}
              title={isDirty ? 'Save the notification preferences' : 'Nothing to save'}
            >
              <Icon name="check" size={15} /> {saveState === 'saving' ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

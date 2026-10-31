import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../PageHeader';
import Icon from '../../icons/Icon';
import useProductionAccess from '../../../access/useProductionAccess';
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  DEPARTMENT_OPTIONS,
} from '../../../data/orders';
import { INSPECTION_TYPES } from '../../../data/quality';
import { PRODUCTION_UNITS } from '../../../data/settings';
import { settingsService } from '../../../services/production';
import './settings-pages.css';

// Production parameter defaults, read through the service layer. Stored
// overrides are merged over these, so a parameter nobody has changed keeps its
// default value.
const defaultParameters = () => settingsService.getProductionParameters().values;

/**
 * The settings sections are ROUTES, so opening another section unmounts this
 * screen. The PDE reference keeps its draft because every section shares one
 * page; caching the draft here reproduces that behaviour — walking to Machines
 * and back never silently throws away an unsaved parameter change.
 */
let draftCache = null;

// Select / number / text parameters (rendered as a two-column field grid).
const PARAM_FIELDS = [
  { key: 'defaultProductionPriority', label: 'Default Production Priority', icon: 'flag', type: 'select', options: PRIORITY_OPTIONS },
  { key: 'defaultProductionStatus', label: 'Default Production Status', icon: 'shield-check', type: 'select', options: STATUS_OPTIONS },
  { key: 'defaultDepartment', label: 'Default Department', icon: 'layers', type: 'select', options: DEPARTMENT_OPTIONS },
  { key: 'defaultInspectionType', label: 'Default Inspection Type', icon: 'check', type: 'select', options: INSPECTION_TYPES },
  { key: 'defaultProductionUnit', label: 'Default Production Unit', icon: 'box', type: 'select', options: PRODUCTION_UNITS },
  { key: 'defaultDueDateGracePeriod', label: 'Default Due Date Grace Period (days)', icon: 'calendar', type: 'number', min: 0 },
];

// Boolean parameters (rendered as toggle rows).
const PARAM_TOGGLES = [
  { key: 'enableQualityHold', label: 'Quality Hold', sub: 'Allow shop floor jobs to be placed on hold for QC.' },
  { key: 'enableProductionTimeline', label: 'Production Timeline', sub: 'Track and display timeline events per production order.' },
  { key: 'enableProductionPhotos', label: 'Production Photos', sub: 'Allow photo attachments on production orders.' },
  { key: 'enableProductionDocuments', label: 'Production Documents', sub: 'Allow document attachments on production orders.' },
];

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
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span className="ss-toggle-slider" />
      </label>
    </div>
  );
}

export default function ProductionParameters() {
  /* Access Management: changing Production parameters needs settings.edit.
     The backend rejects the write; this only hides the control. */
  const { can } = useProductionAccess();
  const canEditSettings = can('settings', 'edit');
  // The DRAFT this screen edits, and the last SAVED document it is compared
  // against. Nothing is written until Save Changes, so a half-finished change
  // is never persisted on its own and Reset Changes can always restore it.
  const [values, setValues] = useState(() => draftCache?.values ?? defaultParameters());
  const [savedValues, setSavedValues] = useState(() => draftCache?.savedValues ?? defaultParameters());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [banner, setBanner] = useState(null);

  // Keep the module cache in step so the draft survives a section change.
  useEffect(() => {
    draftCache = { values, savedValues };
  }, [values, savedValues]);

  const loadParameters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await settingsService.loadParameters();
      const merged = { ...defaultParameters(), ...(response.data || {}) };
      // A draft restored from a previous visit that still has unsaved edits is
      // kept — from here on it is compared against the freshly loaded values.
      const cached = draftCache;
      const carryDraft = Boolean(cached) && JSON.stringify(cached.values) !== JSON.stringify(cached.savedValues);
      setSavedValues(merged);
      if (!carryDraft) setValues(merged);
      setBanner(null);
    } catch (loadError) {
      setBanner({ tone: 'error', text: loadError.message || 'Could not load the saved production parameters.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load on mount, deferred by a microtask so the effect body itself never
    // calls setState synchronously (avoids a cascading first render).
    queueMicrotask(loadParameters);
  }, [loadParameters]);

  const isDirty = useMemo(() => {
    try {
      return JSON.stringify(values) !== JSON.stringify(savedValues);
    } catch {
      return false;
    }
  }, [values, savedValues]);

  const set = (key) => (e) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }));
    setSaveState('idle');
  };

  const toggle = (key) => (next) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    setSaveState('idle');
  };

  /** Load the factory defaults into the DRAFT — they are only persisted on Save. */
  const restoreDefaults = () => {
    setValues(defaultParameters());
    setSaveState('idle');
    setBanner({ tone: 'info', text: 'Factory defaults loaded into the form. Press Save Changes to persist them.' });
  };

  /** Discard the unsaved edits and restore the last saved parameters. */
  const resetChanges = () => {
    setValues(savedValues);
    setSaveState('idle');
    setBanner({ tone: 'info', text: 'Unsaved changes discarded — the last saved parameters are back.' });
  };

  /**
   * Exactly the parameters this screen owns, each with the type it is
   * displayed with: number fields as numbers (an <input type=number> only ever
   * yields a string), toggles as booleans. Numbers are clamped to the field's
   * declared minimum so an invalid value can never be persisted.
   *
   * Keys outside this list are deliberately not sent. The stored map is merged
   * over the defaults on load, so anything the screen does not recognise would
   * otherwise be echoed back forever; omitting it lets the backend drop the
   * stale entry.
   */
  const buildPayload = () => {
    const defaults = defaultParameters();
    const payload = {};
    PARAM_FIELDS.forEach((field) => {
      const value = values[field.key] ?? defaults[field.key];
      if (field.type === 'number') {
        const numeric = Number(value);
        payload[field.key] = Number.isFinite(numeric) ? Math.max(field.min ?? 0, numeric) : (field.min ?? 0);
      } else {
        payload[field.key] = value;
      }
    });
    PARAM_TOGGLES.forEach((param) => {
      payload[param.key] = Boolean(values[param.key] ?? defaults[param.key]);
    });
    return payload;
  };

  const save = async () => {
    setSaveState('saving');
    setBanner(null);
    try {
      await settingsService.saveParameters(buildPayload());
      // Re-read so the draft matches exactly what the server stored.
      const response = await settingsService.loadParameters();
      const merged = { ...defaultParameters(), ...(response.data || {}) };
      setValues(merged);
      setSavedValues(merged);
      setSaveState('saved');
      setBanner({ tone: 'success', text: 'Production parameters saved. Every Production screen uses the new values.' });
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (saveError) {
      // The draft stays dirty: nothing was persisted.
      setSaveState('idle');
      setBanner({ tone: 'error', text: saveError.message || 'The production parameters could not be saved — nothing was changed.' });
    }
  };

  return (
    <div className="ss-section">
      <PageHeader
        title="Production Parameters"
        subtitle="Default configuration values used by the Production UI."
        actions={
          <button type="button" className="btn btn-secondary" onClick={restoreDefaults} disabled={loading || saveState === 'saving'}>
            <Icon name="rotate-ccw" size={15} /> Restore Defaults
          </button>
        }
      />

      <div className="settings-note">
        <Icon name="info" size={15} />
        <span>
          These are the defaults for new production orders, inspections and shop floor jobs
          (priority, status, department, inspection type, unit and grace period). Saved values are stored on
          the server and restored on every reload.
        </span>
      </div>

      {banner && (
        <div className={`ss-banner ss-banner--${banner.tone}`} role={banner.tone === 'error' ? 'alert' : 'status'}>
          <p>{banner.text}</p>
          <button type="button" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {banner?.tone === 'error' && (
        <button type="button" className="ss-mini-btn" style={{ marginTop: 10 }} onClick={loadParameters}>
          <Icon name="refresh-cw" size={14} /> Reload parameters
        </button>
      )}

      <div style={{ height: 16 }} />

      <Card title="Production Defaults" aside="Applied to new records">
        <div className="ss-grid">
          {PARAM_FIELDS.map((param) => (
            <div key={param.key} className="ss-field">
              <label className="ss-label" htmlFor={`param-${param.key}`}>
                <Icon name={param.icon} size={13} /> {param.label}
              </label>
              {param.type === 'select' ? (
                <select
                  id={`param-${param.key}`}
                  className="ss-select"
                  value={values[param.key] ?? ''}
                  onChange={set(param.key)}
                  disabled={loading}
                >
                  {param.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`param-${param.key}`}
                  type="number"
                  min={param.min}
                  className="ss-input"
                  value={values[param.key] ?? ''}
                  onChange={set(param.key)}
                  disabled={loading}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Production Features" aside="Feature flags">
        {PARAM_TOGGLES.map((param) => (
          <ToggleRow
            key={param.key}
            label={param.label}
            sub={param.sub}
            checked={Boolean(values[param.key])}
            onChange={toggle(param.key)}
            disabled={loading || !canEditSettings}
          />
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
              title={isDirty ? 'Save the configuration' : 'Nothing to save'}
            >
              <Icon name="check" size={15} /> {saveState === 'saving' ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

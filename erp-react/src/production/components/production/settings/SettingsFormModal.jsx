import React, { useState } from 'react';
import Modal from '../Modal';
import Icon from '../../icons/Icon';
import './SettingsFormPage.css';

/**
 * Generic modal form for settings masters.
 *
 * `fields`: [{ key, label, type: 'text'|'email'|'number'|'select'|'textarea',
 *              options?, placeholder?, required?, wide?, disabled?, hint? }]
 *   - `options` may be plain strings or { value, label } pairs.
 *   - `disabled` renders a read-only field.
 *   - `hint` shows small muted helper text under the field.
 * `fields` may also be a FUNCTION of the current form values —
 *   `(values) => fields` — for fields whose options/behaviour depend on
 *   another selection (e.g. the Stage options of a Work Order).
 * `mode`: 'create' | 'edit' | 'view' — view renders a read-only detail form.
 * `idKey` + `existingIds` guard against duplicate IDs when creating.
 * `validate(values)` is an optional custom validator returning an error
 *   message (or null) for cross-field rules, e.g. packed <= quantity.
 * `onInit(values)` may return extra master fields applied at mount.
 * `onValuesChange(key, value, values)` may return extra fields to merge
 *   when a watched field changes (used for Work Order linking).
 *
 * `layout`: 'modal' (default) renders the classic centered / fullPage
 * overlay; 'page' renders the SAME form as a normal in-flow page block
 * (used by a dedicated create route so the form is not an overlay and
 * scrolls with the document).
 *
 * A field may set `boxTitle` (and optional `boxHint`) to be rendered inside a
 * bordered section box carrying that title — used by the Casting form's
 * "Casting Stage" section. Fields without `boxTitle` render exactly as before.
 */
export default function SettingsFormModal({
  title,
  fields,
  initialValues,
  mode = 'create',
  idKey = 'id',
  existingIds = [],
  validate,
  onInit,
  onValuesChange,
  /** Error raised by the save itself (e.g. the server rejected the record).
      Shown alongside the local validation message so the modal stays open
      with the operator's values intact until they fix them. */
  errorMessage = '',
  onSubmit,
  onCancel,
  fullPage = false,
  layout = 'modal',
}) {
  const isView = mode === 'view';
  const resolveFields = (v) => (typeof fields === 'function' ? fields(v) : fields);
  const buildInitial = () => {
    const values = {};
    resolveFields({}).forEach((field) => {
      values[field.key] = initialValues?.[field.key] ?? field.default ?? '';
    });
    if (typeof onInit === 'function') {
      const extra = onInit(values);
      if (extra) return { ...values, ...extra };
    }
    return values;
  };

  const [values, setValues] = useState(buildInitial);
  const [error, setError] = useState('');
  const fieldList = resolveFields(values);

  const set = (key) => (e) => {
    const value = e.target.value;
    setValues((prev) => {
      const base = { ...prev, [key]: value };
      if (typeof onValuesChange === 'function') {
        const extra = onValuesChange(key, value, base);
        if (extra) return { ...base, ...extra };
      }
      return base;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const missing = fieldList.find(
      (field) => field.required && !String(values[field.key] ?? '').trim()
    );
    if (missing) {
      setError('Please complete all required fields.');
      return;
    }
    const emailField = fieldList.find((field) => field.type === 'email');
    if (emailField) {
      const email = String(values[emailField.key] ?? '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Please enter a valid email address.');
        return;
      }
    }
    const idValue = String(values[idKey] ?? '').trim();
    if (!isView && mode === 'create' && existingIds.includes(idValue)) {
      setError(`A record with this ${idKey.toUpperCase().replace(/_/g, ' ')} already exists.`);
      return;
    }
    setError('');
    const clean = { ...values };
    fieldList.forEach((field) => {
      if (field.type === 'number') clean[field.key] = Number(clean[field.key]) || 0;
      else if (field.type === 'select' && field.options) {
        // Validate select fields — reject custom values not in options
        const validValues = field.options.map((o) =>
          typeof o === 'object' && o !== null ? o.value : o
        );
        if (clean[field.key] && !validValues.includes(clean[field.key])) {
          setError(`Invalid value for "${field.label}". Please select from the dropdown.`);
          return;
        }
      } else if (field.type !== 'select' && typeof clean[field.key] === 'string') {
        clean[field.key] = clean[field.key].trim();
      }
    });
    if (typeof validate === 'function') {
      const customError = validate(clean);
      if (customError) {
        setError(customError);
        return;
      }
    }
    onSubmit(clean);
  };

  const renderField = (field) => {
    if (field.type === 'flow' && Array.isArray(field.flowSteps)) {
      return (
        <div className="job-flow-preview">
          {field.flowSteps.map((step, i) => (
            <React.Fragment key={step.name}>
              <span
                className={`job-flow-step${step.active ? ' active' : ''}${step.prefix ? ' prefix' : ''}`}
                title={step.prefix ? `${step.name}: ${step.value || '—'}` : step.name}
              >
                {step.prefix ? (
                  <>
                    <span className="job-flow-dot prefix-dot" /> {step.name}
                    {step.value && <span className="job-flow-value"> — {step.value}</span>}
                  </>
                ) : (
                  <>
                    <span className="job-flow-dot" /> {step.name}
                  </>
                )}
              </span>
              {i < field.flowSteps.length - 1 && <span className="job-flow-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
      );
    }
    const common = {
      className: 'form-input',
      value: values[field.key],
      onChange: set(field.key),
      disabled: isView || field.disabled,
      placeholder: field.placeholder,
    };
    if (field.type === 'textarea') {
      return <textarea className="form-textarea" rows={3} {...common} />;
    }
    if (field.type === 'select') {
      const optionValue = (option) =>
        typeof option === 'object' && option !== null ? option.value : option;
      const optionLabel = (option) =>
        typeof option === 'object' && option !== null ? option.label : option;
      // When the field has no value yet (and no default), the browser
      // would otherwise silently display the first option while React
      // state stays empty — which makes required validation reject a
      // form that *looks* filled. Render an explicit placeholder so
      // the displayed selection always matches the form state.
      const hasSelectedValue = (field.options || []).some(
        (option) => optionValue(option) === values[field.key]
      );
      return (
        <select
          className="form-select"
          value={values[field.key]}
          onChange={set(field.key)}
          disabled={isView || field.disabled}
          onKeyDown={(e) => {
            // Only allow arrow keys, Tab, Escape, Enter — block letter typing
            const allowed = ['ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Enter', ' '];
            if (!allowed.includes(e.key)) {
              e.preventDefault();
            }
          }}
          onBlur={() => {
            // Validate on blur — reset to empty if value not in options
            if (field.options && values[field.key]) {
              const validValues = field.options.map((o) =>
                typeof o === 'object' && o !== null ? o.value : o
              );
              if (!validValues.includes(values[field.key])) {
                setValues((prev) => ({ ...prev, [field.key]: '' }));
              }
            }
          }}
        >
          {!hasSelectedValue && <option value="">{field.placeholder || 'Select…'}</option>}
          {(field.options || []).map((option) => (
            <option key={optionValue(option)} value={optionValue(option)}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      );
    }
    return <input type={field.type || 'text'} min={field.min} {...common} />;
  };

  const footerContent = isView ? (
    <button type="button" className="btn btn-secondary" onClick={onCancel}>
      Close
    </button>
  ) : (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" form="settings-form" className="btn btn-primary">
        <Icon name="check" size={15} /> Save
      </button>
    </>
  );

  const formContent = (
    <form id="settings-form" className="po-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        {fieldList.map((field) => {
          const control = (
            <label key={field.key} className={`form-field${field.wide ? ' form-field-wide' : ''}`}>
              <span className="form-label">{field.label}</span>
              {renderField(field)}
              {field.hint && <span className="form-hint">{field.hint}</span>}
            </label>
          );
          if (!field.boxTitle) return control;
          // A field flagged with a box title renders inside its own bordered
          // section (full grid width) instead of as a plain grid cell.
          return (
            <section key={field.key} className="form-field-wide form-section-box">
              <div className="form-section-box-head">
                <span className="form-section-box-title">{field.boxTitle}</span>
                {field.boxHint && (
                  <span className="form-section-box-hint">{field.boxHint}</span>
                )}
              </div>
              <div className="form-section-box-body">{control}</div>
            </section>
          );
        })}
      </div>
      {(error || errorMessage) && (
        <p className="form-error">
          <Icon name="info" size={14} /> {error || errorMessage}
        </p>
      )}
    </form>
  );

  /* Page layout — the same form rendered in normal document flow, so the
     dedicated create route can own the whole content area (no overlay, no
     internal scroll container; the document scrolls). */
  if (layout === 'page') {
    return (
      <div className="settings-form-page">
        <div className="settings-form-page-header">
          <h1 className="settings-form-page-title">{title}</h1>
          <button
            type="button"
            className="settings-form-page-close"
            onClick={onCancel}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="settings-form-page-card">
          <div className="settings-form-page-body">{formContent}</div>
          <div className="settings-form-page-footer">{footerContent}</div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      title={title}
      size="lg"
      fullPage={fullPage}
      onClose={onCancel}
      footer={footerContent}
    >
      {formContent}
    </Modal>
  );
}

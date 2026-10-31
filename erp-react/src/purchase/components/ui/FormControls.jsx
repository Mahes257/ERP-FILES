/**
 * purchase/components/ui/FormControls.jsx
 * ------------------------------------------------------------------
 * Enterprise form controls matching the HTML template's
 * .purchase-form-input / .purchase-form-select / .purchase-form-textarea
 * system: white surface, 40px height, 13px font, green focus ring.
 * ------------------------------------------------------------------
 */
export function FormField({ label, required, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="purchase-form-label">
        {label} {required && <span className="purchase-required">*</span>}
      </label>
      {children}
      {hint && !error && <p className="purchase-form-hint">{hint}</p>}
      {error && <p className="purchase-form-error">{error}</p>}
    </div>
  );
}

const INPUT_BASE = 'purchase-form-input';
const SELECT_BASE = 'purchase-form-select';
const TEXTAREA_BASE = 'purchase-form-textarea';

/** Maps the project's `ariaLabel` prop onto the DOM `aria-label`
 *  attribute before props reach a native element. React raises
 *  "Invalid ARIA attribute `ariaLabel`" whenever a camelCased aria
 *  prop is spread onto a host element, so every native control below
 *  normalizes it (callers may keep writing `ariaLabel=`). */
function withAriaLabel(props) {
  const { ariaLabel, ...rest } = props || {};
  if (ariaLabel === undefined) return rest;
  return { ...rest, 'aria-label': ariaLabel };
}

export function TextInput({ registration, error, className = '', ...rest }) {
  return (
    <input
      className={`${INPUT_BASE} ${error ? 'input-error' : ''} ${className}`}
      {...registration}
      {...withAriaLabel(rest)}
    />
  );
}

export function SelectInput({ registration, error, className = '', children, ...rest }) {
  return (
    <select
      className={`${SELECT_BASE} ${error ? 'input-error' : ''} ${className}`}
      {...registration}
      {...withAriaLabel(rest)}
    >
      {children}
    </select>
  );
}

/** Textarea with an opt-in `autoGrow`: the height fits the content on
    mount and while typing (used for large free-text fields). It only
    ever grows — the natural height from `rows` is the minimum — and
    RHF's registration ref is preserved via ref merging, so all
    existing call sites behave exactly as before. */
export function TextArea({ registration, error, rows = 3, className = '', autoGrow = false, onInput, ...rest }) {
  const fitHeight = (el) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const { ref: registrationRef, ...registrationProps } = registration || {};

  return (
    <textarea
      rows={rows}
      className={`${TEXTAREA_BASE} ${error ? 'input-error' : ''} ${className}`}
      ref={(el) => {
        if (typeof registrationRef === 'function') registrationRef(el);
        if (el && autoGrow) fitHeight(el);
      }}
      onInput={(e) => {
        if (autoGrow) fitHeight(e.currentTarget);
        onInput?.(e);
      }}
      {...registrationProps}
      {...withAriaLabel(rest)}
    />
  );
}

/** Number-only input (spinners, min/max/step passthrough). */
export function NumberInput({ registration, error, className = '', ...rest }) {
  return (
    <input
      type="number"
      className={`${INPUT_BASE} ${error ? 'input-error' : ''} ${className}`}
      {...registration}
      {...withAriaLabel(rest)}
    />
  );
}

/** Email input with basic client-side type enforcement. */
export function EmailInput({ registration, error, className = '', ...rest }) {
  return (
    <input
      type="email"
      className={`${INPUT_BASE} ${error ? 'input-error' : ''} ${className}`}
      {...registration}
      {...withAriaLabel(rest)}
    />
  );
}

/** Phone input (text mode so +91 etc. validate cleanly). */
export function PhoneInput({ registration, error, className = '', ...rest }) {
  return (
    <input
      type="tel"
      className={`${INPUT_BASE} ${error ? 'input-error' : ''} ${className}`}
      {...registration}
      {...withAriaLabel(rest)}
    />
  );
}

/** URL input with client-side type enforcement. */
export function UrlInput({ registration, error, className = '', ...rest }) {
  return (
    <input
      type="url"
      className={`${INPUT_BASE} ${error ? 'input-error' : ''} ${className}`}
      {...registration}
      {...withAriaLabel(rest)}
    />
  );
}

/** Native date picker. */
export function DateInput({ registration, error, className = '', ...rest }) {
  return (
    <input
      type="date"
      className={`${INPUT_BASE} ${error ? 'input-error' : ''} ${className}`}
      {...registration}
      {...withAriaLabel(rest)}
    />
  );
}

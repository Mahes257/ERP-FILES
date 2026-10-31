/**
 * purchase/components/ui/Button.jsx
 * ------------------------------------------------------------------
 * Enterprise button matching the HTML template's .po-btn system.
 *   primary         → .po-btn-primary          (solid green)
 *   primary-gradient→ .po-btn-primary-grad      (premium gradient green)
 *   primary-outline → .po-btn-primary-outline   (green outline)
 *   secondary       → .po-btn-secondary         (white + border)
 *   ghost           → .po-btn-ghost             (transparent + border)
 *   success         → .po-btn-success           (green)
 *   danger          → .po-btn-danger            (red)
 *   warning         → .po-btn-warning           (amber)
 * size="sm" | "lg" | "icon" + optional leading icon.
 * ------------------------------------------------------------------
 */
import { Loader2 } from 'lucide-react';

// eslint-disable-next-line react-refresh/only-export-components
export const BUTTON_VARIANTS = {
  primary: 'po-btn po-btn-primary',
  'primary-gradient': 'po-btn po-btn-primary-grad',
  'primary-outline': 'po-btn po-btn-primary-outline',
  secondary: 'po-btn po-btn-secondary',
  ghost: 'po-btn po-btn-ghost',
  success: 'po-btn po-btn-success',
  danger: 'po-btn po-btn-danger',
  warning: 'po-btn po-btn-warning'
};

const SIZE_CLASS = {
  md: '',
  sm: 'po-btn-sm',
  lg: 'po-btn-lg',
  icon: 'po-btn-icon'
};

export default function Button({
  variant = 'primary',
  type = 'button',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${BUTTON_VARIANTS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="po-btn-icon-ic animate-spin" /> : Icon ? <Icon className="po-btn-icon-ic" /> : null}
      {children}
    </button>
  );
}

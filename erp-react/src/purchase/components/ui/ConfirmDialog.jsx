/**
 * purchase/components/ui/ConfirmDialog.jsx
 * ------------------------------------------------------------------
 * Vendored from src/components/Common/ConfirmDialog.jsx.
 * ------------------------------------------------------------------
 */
import { useEffect, useCallback } from 'react';
import Modal from './Modal';
import Button from './Button';

const ICON_VARIANTS = {
  danger: 'bg-rose-50 text-rose-500',
  warning: 'bg-amber-50 text-amber-500',
  success: 'bg-emerald-50 text-emerald-500',
  info: 'bg-sky-50 text-sky-500',
  default: 'bg-slate-100 text-slate-500'
};

const BUTTON_VARIANT_MAP = {
  danger: 'danger',
  warning: 'warning',
  success: 'success',
  info: 'primary',
  default: 'primary'
};

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  icon: Icon,
  loading = false,
  onConfirm,
  onCancel
}) {
  /* ─── Keyboard: Enter to confirm, Escape to cancel ─── */
  const handleKeyDown = useCallback((e) => {
    if (loading) return;
    if (e.key === 'Enter' && !e.defaultPrevented) {
      e.preventDefault();
      onConfirm?.();
    }
  }, [loading, onConfirm]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={BUTTON_VARIANT_MAP[variant] || 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={`p-2 rounded-lg shrink-0 ${ICON_VARIANTS[variant]}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{message}</p>
      </div>
    </Modal>
  );
}

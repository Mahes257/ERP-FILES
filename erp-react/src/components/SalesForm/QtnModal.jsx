import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * QtnModal — shared modal shell for the New Quotation page feature modals.
 * Centered, animated, highest z-index, backdrop, internal scrolling,
 * responsive, no clipping. Mirrors the ERP card look (qtn-card tokens).
 */
export default function QtnModal({ open, onClose, title, icon, children, footer, maxWidth = 620, theme }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="qtn-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`qtn-modal${theme ? ` qtn-modal-theme-${theme}` : ''}`} style={{ maxWidth }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="qtn-modal-header">
          <div className="qtn-modal-title">
            {icon}
            <h3>{title}</h3>
          </div>
          <button type="button" className="qtn-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="qtn-modal-body">{children}</div>
        {footer && <div className="qtn-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

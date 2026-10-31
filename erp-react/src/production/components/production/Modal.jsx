import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../icons/Icon';
import './Modal.css';

/**
 * Generic centered modal with overlay, header, scrollable body and
 * optional footer. Closes on overlay click or Escape.
 * When fullPage is true, renders via portal to break out of any
 * container constraints and fill the entire viewport.
 */
export default function Modal({ title, onClose, children, footer, size = 'md', fullPage = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (fullPage && typeof document !== 'undefined') {
    return createPortal(
      <div className="modal-fullpage">
        <div className="modal-fullpage-head">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-fullpage-body">{children}</div>
        {footer && <div className="modal-fullpage-foot">{footer}</div>}
      </div>,
      document.body
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

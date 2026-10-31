import React, { useEffect } from 'react';
import Icon from '../icons/Icon';
import './ActionFeedback.css';

/**
 * Small auto-dismissing feedback toast shown after frontend actions
 * (status changes, handoffs). `tone`: 'success' | 'error' | 'info'.
 * The parent passes `message` (null hides the toast); the toast
 * clears itself after `duration` ms.
 */
export default function ActionFeedback({ message, tone = 'success', onDismiss, duration = 3200 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, onDismiss, duration]);

  if (!message) return null;

  const icon = tone === 'success' ? 'check' : tone === 'error' ? 'x' : 'info';

  return (
    <div className={`action-toast tone-${tone}`} role="status" aria-live="polite">
      <Icon name={icon} size={15} />
      <span>{message}</span>
      <button type="button" className="action-toast-close" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

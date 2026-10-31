import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { openInNewTab } from '../../utils/navigationHelpers';

/**
 * RecordOpenPopover — small clean popover that appears when the user clicks
 * an existing record number. Offers two choices:
 *   1. Open in Existing Page (current tab)
 *   2. Open in New Tab
 *
 * Usage:
 *   <RecordOpenPopover
 *     open={popoverOpen}
 *     recordLabel="LEAD-000102"
 *     recordType="Lead"
 *     route="/leads/102"
 *     onOpenExisting={() => navigate('/leads/102')}
 *     onClose={() => setPopoverOpen(false)}
 *   />
 */
export default function RecordOpenPopover({
  open,
  recordLabel = '',
  recordType = 'Record',
  route = '/',
  onOpenExisting,
  onClose,
  anchorRef
}) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Position the popover relative to the anchor element (viewport-aware).
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const el = anchorRef?.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popW = 300;
    const gap = 6;
    const estH = 190;
    let top = rect.bottom + gap;
    if (top + estH > window.innerHeight - 8) {
      top = rect.top - estH - gap;
      if (top < 8) top = rect.bottom + gap;
    }
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [open, anchorRef]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) {
        onClose?.();
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const handleExisting = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose?.();
    if (onOpenExisting) onOpenExisting();
  };

  const handleNewTab = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose?.();
    openInNewTab(route);
  };

  return (
    <div
      ref={popoverRef}
      className="record-open-popover"
      style={pos ? { top: pos.top, left: pos.left } : undefined}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="record-open-popover-header">
        Open {recordType}
      </div>
      {recordLabel && (
        <div className="record-open-popover-label">
          {recordLabel}
        </div>
      )}
      <div className="record-open-popover-options">
        <button
          type="button"
          className="record-open-popover-option"
          onClick={handleExisting}
        >
          <ArrowRight size={14} className="record-open-popover-icon" />
          <div className="record-open-popover-option-text">
            <span className="record-open-popover-option-label">Open in Existing Page</span>
            <span className="record-open-popover-option-desc">Replace current page</span>
          </div>
        </button>
        <button
          type="button"
          className="record-open-popover-option"
          onClick={handleNewTab}
        >
          <ExternalLink size={14} className="record-open-popover-icon" />
          <div className="record-open-popover-option-text">
            <span className="record-open-popover-option-label">Open in New Tab</span>
            <span className="record-open-popover-option-desc">Open in a new browser tab</span>
          </div>
        </button>
      </div>
      <div className="record-open-popover-footer">
        <button
          type="button"
          className="record-open-popover-cancel"
          onClick={(e) => { e.stopPropagation(); onClose?.(); }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

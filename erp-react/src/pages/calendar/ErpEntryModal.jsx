import { useNavigate } from 'react-router-dom';
import { ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import { Modal } from '../../components/Common';
import { categoryFor } from './calendarEvents';
import { formatDayLong, formatTimeLabel, formatTimeRange, fromDateKey } from './calendarUtils';
import { erpSourceLabel } from './calendarErpEntries';

/**
 * The detail dialog for a backend-derived Calendar entry.
 *
 * It is deliberately NOT the editable Event dialog: a derived entry is a
 * projection of a business record, so the Calendar shows what the record says
 * and offers the one action that is safe — navigating to that record, where the
 * module's own form and its own permissions apply. There is no save and no
 * delete here, and nothing is written back.
 *
 * A missing time is stated as such ("no time recorded") instead of showing a
 * made-up hour, matching how the entry is drawn on the grid.
 */
export default function ErpEntryModal({ open, event, onClose }) {
  const navigate = useNavigate();
  if (!event) return null;

  const category = categoryFor(event.category);
  const moduleLabel = erpSourceLabel(event.erpSource);
  const date = fromDateKey(event.date);
  const timeLabel = event.allDay
    ? 'No time recorded — all-day entry'
    : event.end
      ? formatTimeRange(event.start, event.end)
      : formatTimeLabel(event.start);
  const canNavigate = Boolean(event.linkPath);

  const openSource = () => {
    const target = event.linkPath;
    onClose();
    if (target) navigate(target);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ERP entry"
      maxWidth="max-w-md"
      footer={
        <div className="cal-modal-footer">
          <span className="cal-erp-readonly">
            <Lock className="w-3 h-3" /> Read-only
          </span>
          <div className="cal-modal-footer-right">
            <button type="button" className="cal-btn" onClick={onClose}>
              Close
            </button>
            {canNavigate && (
              <button type="button" className="cal-btn cal-btn-primary" onClick={openSource}>
                <ExternalLink className="w-3.5 h-3.5" /> Open source record
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="cal-erp-detail">
        <span
          className="cal-erp-module"
          style={{ '--cal-accent': category.color, '--cal-tint': category.tint }}
        >
          {moduleLabel}
          {event.entityType ? ` · ${event.entityType}` : ''}
        </span>

        <h4 className="cal-erp-title">{event.title}</h4>

        <dl className="cal-erp-meta">
          <div>
            <dt>Date</dt>
            <dd>{date ? formatDayLong(date) : event.date}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{timeLabel}</dd>
          </div>
          {event.status && (
            <div>
              <dt>Status</dt>
              <dd>{event.status}</dd>
            </div>
          )}
          {event.entityId !== null && event.entityId !== undefined && (
            <div>
              <dt>Record</dt>
              <dd>
                {event.entityType || 'Record'} #{event.entityId}
              </dd>
            </div>
          )}
        </dl>

        <p className="cal-erp-note">
          <ShieldCheck className="w-3.5 h-3.5" />
          This entry is generated from the {moduleLabel} module and cannot be edited or deleted from
          the Calendar. Open the source record to change it; the module&apos;s own permissions still
          apply.
        </p>
      </div>
    </Modal>
  );
}

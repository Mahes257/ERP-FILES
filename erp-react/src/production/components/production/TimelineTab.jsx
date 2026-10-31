import React from 'react';
import ProductionStatusBadge from './ProductionStatusBadge';
import { formatDateTime } from '../../utils/format';
import './TimelineTab.css';

export default function TimelineTab({ events }) {
  return (
    <ul className="timeline">
      {events.map((event, index) => (
        <li
          key={`${event.event}-${index}`}
          className={`timeline-item${event.status === 'Pending' ? ' pending' : ''}`}
        >
          <span className="timeline-dot" aria-hidden="true" />
          <div className="timeline-body">
            <span className="timeline-event">{event.event}</span>
            <span className="timeline-meta">
              {formatDateTime(event.date)} · {event.user}
            </span>
          </div>
          <ProductionStatusBadge status={event.status} />
        </li>
      ))}
    </ul>
  );
}

import React from 'react';
import ProductionStatusBadge from './ProductionStatusBadge';
import './RecentProductionActivity.css';

/**
 * Compact activity feed: activity · production order · time · status.
 * User-entry-only: with no records yet the section shows a friendly
 * empty state instead of a blank list.
 */
export default function RecentProductionActivity({ items }) {
  return (
    <section className="activity-card">
      <h3 className="activity-title">Recent Production Activity</h3>
      {items.length === 0 ? (
        <div className="activity-empty">
          <p>No recent activity yet.</p>
          <p>Activity appears here as you create production records.</p>
        </div>
      ) : (
        <ul className="activity-list">
          {items.map((item) => (
            <li
              key={`${item.activity}-${item.workOrder || item.productionOrder}`}
              className="activity-item"
            >
              <span className="activity-dot" aria-hidden="true" />
              <div className="activity-main">
                <span className="activity-text">{item.activity}</span>
                <span className="activity-meta">
                  {item.workOrder || item.productionOrder} · {item.time}
                </span>
              </div>
              <ProductionStatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../icons/Icon';
import './QuickActions.css';

/**
 * Shortcut list — every action navigates to an existing module page.
 */
export default function QuickActions({ actions }) {
  return (
    <section className="quick-card">
      <h3 className="quick-title">Quick Actions</h3>
      <div className="quick-actions">
        {actions.map((action) => (
          <Link key={action.label} to={action.path} className="quick-action">
            <span className="quick-action-icon">
              <Icon name={action.icon} size={17} />
            </span>
            <span className="quick-action-label">{action.label}</span>
            <Icon name="arrow-right" size={15} className="quick-action-arrow" />
          </Link>
        ))}
      </div>
    </section>
  );
}

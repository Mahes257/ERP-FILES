import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../icons/Icon';
import './SettingsCard.css';

/**
 * Clickable card used on the Settings landing page.
 * `to` is a router path; `icon`, `title` and `description` describe
 * the settings section.
 */
export default function SettingsCard({ to, icon, title, description, count }) {
  return (
    <Link to={to} className="settings-card">
      <span className="settings-card-icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="settings-card-body">
        <span className="settings-card-title">{title}</span>
        <span className="settings-card-desc">{description}</span>
      </span>
      <span className="settings-card-meta">
        {typeof count === 'number' && <span className="settings-card-count">{count}</span>}
        <Icon name="chevron-right" size={16} />
      </span>
    </Link>
  );
}

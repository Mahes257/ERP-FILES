import React from 'react';
import './PageHeader.css';

/**
 * Consistent page heading used by every module page.
 * `actions` renders on the right side (buttons etc.).
 */
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-heading">
        <h2 className="page-title">{title}</h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

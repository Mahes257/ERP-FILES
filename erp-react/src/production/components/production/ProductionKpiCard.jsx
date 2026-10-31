import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../icons/Icon';
import './ProductionKpiCard.css';

/**
 * Clickable KPI card. The whole card is a router link to the
 * module page represented by the metric.
 */
export default function ProductionKpiCard({ label, value, hint, icon, path }) {
  return (
    <Link to={path} className="kpi-card" aria-label={`${label}: ${value}`}>
      <div className="kpi-top">
        <span className="kpi-icon">
          <Icon name={icon} size={19} />
        </span>
        <span className="kpi-label">{label}</span>
        <Icon name="arrow-right" size={16} className="kpi-arrow" />
      </div>
      <p className="kpi-value">{value}</p>
      {hint && <p className="kpi-hint">{hint}</p>}
    </Link>
  );
}

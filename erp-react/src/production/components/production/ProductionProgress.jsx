import React from 'react';
import './ProductionProgress.css';

/**
 * Pure-CSS progress bar with percentage label.
 * `value` is clamped to 0–100.
 */
export default function ProductionProgress({ value }) {
  const clamped = Math.min(Math.max(Number(value) || 0, 0), 100);
  return (
    <div className="progress" aria-label={`${clamped}% complete`}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
      <span className="progress-value">{clamped}%</span>
    </div>
  );
}

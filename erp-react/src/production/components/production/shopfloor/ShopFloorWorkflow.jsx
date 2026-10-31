import React from 'react';
import Icon from '../../icons/Icon';
import './ShopFloorWorkflow.css';

const STATE_LABELS = {
  active: 'Active',
  hold: 'Hold',
  completed: 'Completed',
  pending: 'Pending',
};

/**
 * Visual process workflow (used by Casting & Fabrication).
 * Step state is derived from the current job records:
 * active = any job In Progress · hold = any job Hold ·
 * completed = all/some jobs Completed · otherwise pending.
 *
 * `current` (optional) highlights the stage of the active nested
 * route, e.g. /production/casting/pouring highlights Pouring.
 */
export default function ShopFloorWorkflow({ steps, jobs, title = 'Shop Floor Workflow', current }) {
  const stepState = (name) => {
    const records = jobs.filter((job) => job.stage === name);
    if (records.some((job) => job.status === 'In Progress')) return 'active';
    if (records.some((job) => job.status === 'Hold')) return 'hold';
    if (records.length && records.some((job) => job.status === 'Completed')) return 'completed';
    return 'pending';
  };

  return (
    <section className="sf-workflow-card">
      <div className="sf-workflow-head">
        <div>
          <h3 className="sf-workflow-title">{title}</h3>
          <p className="sf-workflow-subtitle">Process stages in order — completed, active and pending.</p>
        </div>
        <span className="sf-workflow-badge">Process</span>
      </div>

      <div className="sf-workflow-scroll">
        <div className="sf-workflow">
          {steps.map((name, index) => {
            const state = stepState(name);
            const isCurrent = current === name;
            return (
              <React.Fragment key={name}>
                <div className={`sf-step ${state}${isCurrent ? ' current' : ''}`}>
                  <span className="sf-step-dot" aria-hidden="true" />
                  <span className="sf-step-name">{name}</span>
                  <span className="sf-step-state">{STATE_LABELS[state]}</span>
                </div>
                {index < steps.length - 1 && <Icon name="arrow-right" size={16} className="sf-arrow" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}

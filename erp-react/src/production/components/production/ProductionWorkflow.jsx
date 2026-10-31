import React from 'react';
import Icon from '../icons/Icon';
import { lifecycle } from '../../data/lifecycle';
import './ProductionWorkflow.css';

/**
 * Visual manufacturing lifecycle flow. Horizontal on desktop,
 * contained horizontal scroll on smaller screens.
 */
export default function ProductionWorkflow() {
  return (
    <section className="workflow-card">
      <div className="workflow-head">
        <div>
          <h3 className="workflow-title">Production Workflow</h3>
          <p className="workflow-subtitle">Manufacturing lifecycle from work order to finished goods.</p>
        </div>
        <span className="workflow-badge">Lifecycle</span>
      </div>

      <div className="workflow-scroll">
        <div className="workflow">
          {lifecycle.map((stage, index) => (
            <React.Fragment key={stage.name}>
              <div className="workflow-step">
                <span className="workflow-step-num">{index + 1}</span>
                <span className="workflow-step-name">{stage.name}</span>
              </div>
              {index < lifecycle.length - 1 && (
                <Icon name="arrow-right" size={18} className="workflow-arrow" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

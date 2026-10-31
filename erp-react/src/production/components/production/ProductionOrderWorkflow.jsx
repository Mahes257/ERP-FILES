import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../icons/Icon';
import { workflowActionFor, workflowStepForStatus, WORKFLOW_STEPS, moduleRouteForOrder } from '../../utils/workflow';
import { stageGroupOf } from '../../data/orders';
import './ProductionOrderWorkflow.css';

/**
 * Lifecycle strip shown on the Production Order Detail screen.
 * Highlights the order's position in the workflow, offers the single
 * next logical action, and links to the module currently working the
 * order (e.g. Casting orders → /production/casting).
 */
export default function ProductionOrderWorkflow({ order, onTransition }) {
  const navigate = useNavigate();
  const action = workflowActionFor(order);
  const currentStep = workflowStepForStatus(order.status);
  const group = stageGroupOf(order.currentStage);
  const moduleRoute = moduleRouteForOrder(order);

  // onTransition (ProductionOrderDetail.handleTransition) is async and resolves
  // with the transition result — await it so the follow-up navigation actually
  // runs once the backend has persisted the new status.
  const handleAction = async () => {
    if (!action) return;
    if (action.transition) {
      const result = await onTransition(action.transition);
      if (result?.ok && action.nav) navigate(action.nav);
    } else if (action.nav) {
      navigate(action.nav);
    }
  };

  return (
    <div className="po-wf">
      <div className="po-wf-strip" role="list" aria-label="Production lifecycle position">
        {WORKFLOW_STEPS.map((step, index) => {
          const idx = WORKFLOW_STEPS.findIndex((s) => s.key === currentStep);
          const isDone = index < idx;
          const isCurrent = index === idx;
          return (
            <React.Fragment key={step.key}>
              {index > 0 && <span className="po-wf-connector" aria-hidden="true" />}
              <span
                role="listitem"
                className={`po-wf-step${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}
              >
                <span className="po-wf-dot">
                  {isDone ? <Icon name="check" size={11} /> : <span>{index + 1}</span>}
                </span>
                <span className="po-wf-label">{step.label}</span>
              </span>
            </React.Fragment>
          );
        })}
      </div>

      <div className="po-wf-actions">
        {moduleRoute && group && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(moduleRoute)}
            title={`Open the ${group} module for this order`}
          >
            <Icon name="arrow-right" size={14} /> View in {group}
          </button>
        )}

        {action && (
          <button
            type="button"
            className={`btn ${action.tone === 'primary' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleAction}
          >
            <Icon name={action.icon} size={14} /> {action.label}
          </button>
        )}
      </div>

      {action?.hint && <p className="po-wf-hint">{action.hint}</p>}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../icons/Icon';
import ProductionStatusBadge from '../ProductionStatusBadge';
import ProductionProgress from '../ProductionProgress';
import RowActionsDropdown from '../RowActionsDropdown';
import ShopFloorTable from './ShopFloorTable';
import './ShopFloorOrderTable.css';

const PAGE_SIZE = 10;

/**
 * Compact shop floor list — ONE Work Order = ONE summary row.
 *
 * Supports:
 *  - Checkbox selection with select-all
 *  - Three-dot action menu
 *  - Bulk selection callback (onSelectionChange)
 *
 * The main table shows only order-level summary. The per-stage
 * process records appear ONLY when the row is expanded via the
 * three-dot menu's "View Details" action.
 */
export default function ShopFloorOrderTable({
  groups,
  columns,
  renderActions,
  workflow,
  showMachine = false,
  showCustomer = false,
  viewLabel = 'View Workflow',
  machineLabel = 'Machine',
  onCreateJob,
  onWorkOrderClick,
  onPreviewOrder,
  onSelectionChange,
  /* Casting only: ⋮ → Edit opens the selected Work Order's current-stage job
     in the existing edit form, and the Stage cell can be changed in place
     through the same persisted workflow. Other boards pass neither and keep
     the exact menu / read-only Stage cell they had. */
  onEditGroup,
  onStageChange,
  stageOptions,
}) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Set());

  // Column aliases. The shared per-job table (ShopFloorTable) renders all
  // spellings, but this summary table only knew 'Current Stage'/'Actions' — so
  // boards that declare 'Stage'/'Action' (Fabrication, Assembly, Machine Shop)
  // silently lost the stage column AND the row-actions menu.
  //
  // 'Assembly Task' is the Assembly board's name for the same cell: it hides the
  // stage field and stores the user's assembly task in the entry's stage, so the
  // declared column was dropped and the Assembly section showed no task at all.
  const stageColumn = columns.includes('Current Stage') ? 'Current Stage'
    : columns.includes('Stage') ? 'Stage'
      : columns.includes('Assembly Task') ? 'Assembly Task' : null;
  const actionsColumn = columns.includes('Actions') ? 'Actions'
    : columns.includes('Action') ? 'Action' : null;

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));

  // Reset to the first page when the filtered list changes.
  useEffect(() => {
    setPage(1);
  }, [groups.length]);

  // Clear selection when groups change
  useEffect(() => {
    setSelected(new Set());
  }, [groups.length]);

  const pageGroups = useMemo(
    () => groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [groups, page]
  );

  // Visible page IDs for select-all
  const pageIds = useMemo(() => pageGroups.map((g) => g.workOrder), [pageGroups]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggle = (workOrder) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(workOrder)) next.delete(workOrder);
      else next.add(workOrder);
      return next;
    });

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allPageSelected, pageIds]);

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) onSelectionChange([...selected]);
  }, [selected, onSelectionChange]);

  /** Current stage + progress derived from the order's stage records. */
  const stageState = (group) => {
    const planned = Number(group.plannedQuantity) || 0;
    const completed = Number(group.completedQuantity) || 0;
    const progress = planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0;
    if (!workflow || workflow.length === 0) {
      return {
        currentStage: group.currentStage || '—',
        progress,
      };
    }
    const done = new Set(
      group.jobs
        .filter((job) => job.status === 'Completed' || job.status === 'Skipped')
        .map((job) => job.stage)
    );
    const current = workflow.find((stage) => !done.has(stage));
    return { currentStage: current || 'Completed', progress };
  };

  const groupStatus = (group) => {
    if (group.jobs.length === 0) return 'Pending';
    if (group.jobs.every((job) => job.status === 'Completed')) return 'Completed';
    if (group.jobs.some((job) => job.status === 'In Progress')) return 'In Progress';
    if (group.jobs.some((job) => job.status === 'Hold')) return 'Hold';
    return 'Pending';
  };

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, groups.length);

  return (
    <>
      <div className={`table-scroll${selected.size > 0 ? ' has-bulk-bar' : ''}`}>
        {/* Sticky grid (shared Production scope, styles/sticky-data-grid.css):
            checkbox frozen at left: 0, expand control beside it, the Work Order
            column frozen at cb+expand width, and the Actions column frozen at
            right: 0. Offsets come from the shared `.sgrid-prod` scope, which
            mirrors the fixed `.pt-checkbox-col` / `.sf-order-expand-col` widths. */}
        <table className={`data-table sf-order-table sgrid sgrid-prod sgrid-cb${actionsColumn ? ' sgrid-actions' : ''}`}>
          <thead>
            <tr>
              <th className="pt-checkbox-col sgrid-pin sgrid-first">
                <input
                  type="checkbox"
                  className="pt-checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="sf-order-expand-col sgrid-pin" aria-hidden="true" />
              {columns.includes('Work Order') && <th className="sgrid-pin2">Work Order</th>}
              {(columns.includes('Order Description') || columns.includes('Item Name')) && <th>Order Description</th>}
              {columns.includes('Customer') && <th>Customer</th>}
              {showMachine && <th>{machineLabel}</th>}
              {columns.includes('Planned Qty') && <th>Planned Qty</th>}
              {columns.includes('Completed Qty') && <th>Completed Qty</th>}
              {stageColumn && <th>{stageColumn}</th>}
              {columns.includes('Progress') && <th>Progress</th>}
              {columns.includes('Status') && <th>Status</th>}
              {columns.includes('Created Date') && <th>Created Date</th>}
              {actionsColumn && <th className="sgrid-pin-actions">{actionsColumn}</th>}
            </tr>
          </thead>
          <tbody>
            {pageGroups.map((group) => {
              const { currentStage, progress } = stageState(group);
              const status = groupStatus(group);
              const isOpen = expanded.has(group.workOrder);
              const isChecked = selected.has(group.workOrder);
              const statusKey = (status || 'all').toLowerCase().replace(/\s+/g, '-');

              // The job this row's Stage cell stands for: the entry recorded
              // at the row's current stage, otherwise its latest entry. It is
              // resolved from THIS row's jobs, so Edit / the inline dropdown can
              // never act on another Work Order's record.
              const rowJob =
                group.jobs.find((job) => job.stage === currentStage) ||
                group.jobs[group.jobs.length - 1] ||
                null;
              const inlineEditable = Boolean(onStageChange && rowJob && rowJob.stage);

              // Build three-dot menu actions for this row
              const rowActions = [
                {
                  label: 'Preview',
                  icon: <Icon name="eye" size={13} />,
                  onClick: () => {
                    if (onPreviewOrder) onPreviewOrder(group);
                  },
                },
                ...(onEditGroup && rowJob
                  ? [{
                      label: 'Edit',
                      icon: <Icon name="edit" size={13} />,
                      onClick: () => onEditGroup(group, rowJob),
                    }]
                  : []),
                {
                  label: isOpen ? 'Hide Details' : viewLabel,
                  icon: <Icon name={isOpen ? 'eye-off' : 'layers'} size={13} />,
                  onClick: () => toggle(group.workOrder),
                },
                {
                  label: 'View Work Order',
                  icon: <Icon name="external-link" size={13} />,
                  onClick: () => {
                    if (onWorkOrderClick) onWorkOrderClick(group.workOrder);
                    else window.location.href = `/production/orders/${group.workOrder}`;
                  },
                },
              ];

              return (
                <React.Fragment key={group.workOrder}>
                  <tr className={`sf-order-row${isOpen ? ' is-expanded' : ''}${isChecked ? ' is-selected' : ''} kpi-row-${statusKey}`}>
                    <td className="pt-checkbox-col sgrid-pin sgrid-first">
                      <input
                        type="checkbox"
                        className="pt-checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(group.workOrder)}
                        aria-label={`Select ${group.workOrder}`}
                      />
                    </td>
                    <td className="sf-order-expand-col sgrid-pin">
                      <button
                        type="button"
                        className="sf-order-expand-btn"
                        onClick={() => toggle(group.workOrder)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${viewLabel} for ${group.workOrder}`}
                        title={isOpen ? 'Hide details' : viewLabel}
                      >
                        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} />
                      </button>
                    </td>
                    <td className="cell-strong sgrid-pin2">
                      {onWorkOrderClick ? (
                        <button
                          type="button"
                          className="po-link"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#075E54', fontWeight: 600, fontSize: 'inherit' }}
                          onClick={(e) => { e.preventDefault(); onWorkOrderClick(group.workOrder); }}
                        >
                          {group.workOrder}
                        </button>
                      ) : (
                        <Link className="po-link" to={`/production/orders/${group.workOrder}`}>
                          {group.workOrder}
                        </Link>
                      )}
                    </td>
                    <td>{group.product || '—'}</td>
                    {showCustomer && <td>{group.customer || '—'}</td>}
                    {showMachine && <td>{group.machines?.join(', ') || '—'}</td>}
                    {columns.includes('Planned Qty') && <td>{group.plannedQuantity}</td>}
                    {columns.includes('Completed Qty') && <td>{group.completedQuantity}</td>}
                    {stageColumn && (
                      <td className={inlineEditable ? 'sf-stage-cell' : undefined}>
                        {inlineEditable ? (
                          <InlineStageEditor
                            key={`${group.workOrder}-${rowJob.id}-${currentStage}`}
                            value={currentStage}
                            options={stageOptions}
                            onSave={(nextStage) => onStageChange(group, rowJob, nextStage)}
                          />
                        ) : (
                          currentStage || '—'
                        )}
                      </td>
                    )}
                    {columns.includes('Progress') && (
                      <td>
                        <ProductionProgress value={progress} />
                      </td>
                    )}
                    {columns.includes('Status') && (
                      <td>
                        <ProductionStatusBadge status={status} />
                        {group.jobs.length === 0 && (
                          <span
                            style={{ color: '#94A3B8', fontSize: 11, marginLeft: 6, whiteSpace: 'nowrap' }}
                            title="No stage entries recorded for this Work Order yet"
                          >
                            · no entries
                          </span>
                        )}
                      </td>
                    )}
                    {columns.includes('Created Date') && <td className="cell-muted">{group.createdDate || '—'}</td>}
                    {actionsColumn && (
                      <td className="sgrid-pin-actions">
                        <RowActionsDropdown actions={rowActions} />
                      </td>
                    )}
                  </tr>

                  {isOpen && (
                    <tr className="sf-order-detail-row">
                      <td colSpan={20} className="sf-order-detail-cell">
                        <div className="sf-order-detail">
                          {workflow && workflow.length > 0 && (
                            <div className="sf-order-workflow">
                              {workflow.map((stage, index) => {
                                const entry = group.jobs.find((job) => job.stage === stage);
                                const done = entry?.status === 'Completed';
                                const skipped = entry?.status === 'Skipped';
                                const isCurrent = stage === currentStage;
                                const locked =
                                  !done && !skipped && !isCurrent && index > workflow.indexOf(currentStage);
                                return (
                                  <React.Fragment key={stage}>
                                    <span
                                      className={`sf-order-step${done ? ' done' : ''}${skipped ? ' skipped' : ''}${isCurrent ? ' current' : ''}${locked ? ' locked' : ''}`}
                                    >
                                      <Icon
                                        name={done ? 'check' : skipped ? 'skip-forward' : isCurrent ? 'play' : locked ? 'lock' : 'clock'}
                                        size={11}
                                      />
                                      {stage}
                                    </span>
                                    {index < workflow.length - 1 && (
                                      <Icon name="arrow-right" size={12} className="sf-order-step-arrow" />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}

                          {group.jobs.length === 0 ? (
                            <div className="sf-order-empty">
                              <p className="sf-order-empty-text">
                                No stage entries recorded yet for {group.workOrder} — start with{' '}
                                <strong>{workflow && workflow.length ? workflow[0] : 'the first job'}</strong>.
                              </p>
                              {onCreateJob && (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => onCreateJob(group.workOrder)}
                                >
                                  <Icon name="plus" size={13} /> Start {workflow && workflow.length ? workflow[0] : 'Job'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <ShopFloorTable jobs={group.jobs} columns={columns} renderActions={renderActions} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="sf-pagination">
          <span className="sf-pagination-info">
            Showing {start}–{end} of {groups.length} orders
          </span>
          <div className="sf-pagination-controls">
            <button
              type="button"
              className="btn btn-secondary sf-pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <Icon name="chevron-left" size={13} /> Prev
            </button>
            <span className="sf-pagination-page">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary sf-pagination-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              Next <Icon name="chevron-right" size={13} /> 
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Compact inline Stage editor used by the Casting jobs table.
 *
 * It only reports the chosen stage to the board (`onSave`) and waits for that
 * promise: while it is pending the cell shows "Saving…", and when it rejects
 * the cell falls back to the value the board re-synced from the API plus a
 * "Not saved" marker — an unsaved stage is never presented as saved.
 */
function InlineStageEditor({ value, options, onSave }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectRef = useRef(null);

  useEffect(() => {
    if (open) selectRef.current?.focus();
  }, [open]);

  /* Exactly the board's own workflow stages. A legacy stage (e.g. 'QC' or
     'Dispatch') stays displayed as stored and is never listed here, so the
     dropdown can never offer — or silently convert to — a stage outside the
     workflow. Picking one of the listed stages is the only change possible. */
  const choices = useMemo(() => (options || []).filter(Boolean), [options]);

  const commit = async (nextStage) => {
    if (!nextStage || nextStage === value) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(nextStage);
      setOpen(false);
    } catch (err) {
      setError(err?.message || 'Stage was not saved.');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (saving) {
    return (
      <span className="sf-stage-saving" role="status">
        <span className="sf-stage-spinner" aria-hidden="true" /> Saving…
      </span>
    );
  }

  if (open) {
    return (
      <span className="sf-stage-editor">
        <select
          ref={selectRef}
          className="sf-stage-select"
          value=""
          aria-label={`Change stage (currently ${value || 'none'})`}
          onChange={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <option value="">Select stage…</option>
          {choices.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="sf-stage-cancel"
          onClick={() => setOpen(false)}
          aria-label="Cancel stage change"
          title="Cancel"
        >
          <Icon name="x" size={12} />
        </button>
      </span>
    );
  }

  return (
    <span className="sf-stage-cell-inner">
      <button
        type="button"
        className="sf-stage-trigger"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
        title={`Change stage (currently ${value || 'not set'})`}
      >
        <span className="sf-stage-value">{value || '—'}</span>
        <Icon name="edit" size={11} />
      </button>
      {error && (
        <span className="sf-stage-error" title={error}>
          Not saved
        </span>
      )}
    </span>
  );
}

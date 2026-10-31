/**
 * purchase/components/RfqWorkflowProgress.jsx
 * ------------------------------------------------------------------
 * Horizontal RFQ sourcing stepper — the full procurement journey at a
 * glance, over the ONE canonical workflow (constants/workflow.js):
 *
 *   RFQ → Follow-up → Quotations → Comparison → Negotiation →
 *   Technical Evaluation → Commercial Evaluation →
 *   Supplier Selection → Purchase Order → PO Approval → PO Released →
 *   Supplier Acknowledgement → Closed
 *
 * The RFQ's position is derived via deriveWorkflowStage(record) — the
 * persisted `workflowStage` (the actual procurement stage) wins, with
 * the document lifecycle `status` as the fallback. The final stages
 * light up as the linked PO advances. A Cancelled RFQ shows a
 * terminal red chip instead of a highlighted position; a Closed RFQ
 * shows the concluded journey. Uses the same brand / slate palette
 * and rounded styling as the rest of the Purchase module.
 * ------------------------------------------------------------------
 */
import { Check, FileText, XCircle } from 'lucide-react';
import { APPROVAL_STATUS, PURCHASE_WORKFLOW, RFQ_STATUS, WORKFLOW_LABEL, deriveWorkflowStage, stageIndex } from '../constants';

/**
 * Maps an RFQ record onto the stepper. Returns `steps` (each with
 * `state`: 'done' | 'active' | 'upcoming') plus terminal flags so the
 * component can render Cancelled / Closed states honestly.
 */
function deriveWorkflowSteps(record = {}) {
  const status = record.status;
  const cancelled = status === RFQ_STATUS.CANCELLED;
  const closed = status === RFQ_STATUS.CLOSED;
  const poDone = Boolean(record.poNo || (record.poNos && record.poNos.length > 0));

  /* PO lifecycle facts — attached by enrichRfq from the linked PO
     record (the PO is the authority for these stages). */
  const poApproved = record.poApprovalStatus === APPROVAL_STATUS.APPROVED;
  const poAcknowledged = Boolean(record.poAcknowledged);

  /* The RFQ's actual procurement stage. The final stages follow the
     linked PO: a raised PO enters PO Approval, an approved (released)
     PO moves to PO Released, and a supplier-acknowledged PO completes
     the acknowledgement stage. A legacy awarded RFQ that already has a
     PO but never recorded the stage advance starts at approval. */
  const currentStage = deriveWorkflowStage(record);
  const effectiveStage = poDone
    ? poAcknowledged
      ? 'SUPPLIER_ACKNOWLEDGEMENT'
      : poApproved
        ? 'PO_RELEASED'
        : stageIndex(currentStage) < stageIndex('PO_APPROVAL')
          ? 'PO_APPROVAL'
          : currentStage
    : currentStage;
  const currentIndex = stageIndex(effectiveStage);

  const steps = PURCHASE_WORKFLOW.map((stage, index) => {
    let state = 'upcoming';
    if (!cancelled) {
      if (closed) {
        /* Closed = the sourcing process concluded — every stage is done. */
        state = 'done';
      } else if (index < currentIndex) {
        state = 'done';
      } else if (index === currentIndex) {
        state = 'active';
      }
    }
    return { key: stage.key, label: stage.label, state };
  });

  return { steps, cancelled, closed, poDone, currentStage: effectiveStage };
}

/**
 * Renders the horizontal stepper. `onOpenPo(poNo)` is called when the
 * user clicks the PO chip (only shown once a PO exists).
 */
export default function RfqWorkflowProgress({ record = {}, onOpenPo, compact = false }) {
  const { steps, cancelled, closed, poDone, currentStage } = deriveWorkflowSteps(record);
  const po = poDone ? record.poNo : null;

  return (
    <div className={`rounded-xl border border-slate-200 bg-surface shadow-sm ${compact ? 'px-3 py-2.5 sm:px-4' : 'px-4 py-4 sm:px-6'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className="min-w-0">
          <h2 className={`font-bold text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>Sourcing Progress</h2>
          <p className={`font-semibold text-slate-400 mt-0.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
            {cancelled
              ? 'This RFQ was cancelled — the sourcing process did not complete.'
              : closed
                ? 'Sourcing concluded. No further quotations will be accepted.'
                : `Current stage: ${WORKFLOW_LABEL[currentStage] || record.status}`}
          </p>
        </div>
        {cancelled && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-[11px] font-bold text-rose-600 whitespace-nowrap">
            <XCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        )}
        {po && (
          <button
            type="button"
            onClick={() => onOpenPo?.(po)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF7F4] border border-[#0B4A3D]/25 px-3 py-1 text-[11px] font-bold text-[#0B4A3D] hover:bg-[#E0F2EC] transition-colors cursor-pointer whitespace-nowrap"
            title={`View ${po}`}
          >
            <FileText className="w-3.5 h-3.5" /> {po}
          </button>
        )}
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <ol className="flex w-full min-w-[840px]" aria-label="Sourcing progress">
          {steps.map(({ key, label, state }, index) => {
            const reached = state === 'done' || state === 'active';
            return (
              <li key={key} className="relative flex-1 flex flex-col items-center min-w-0">
                {/* Connector to the previous node (both nodes are centered,
                    so -50% of this li aligns with the previous node). */}
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-[9px] left-[calc(-50%+10px)] w-[calc(100%-20px)] h-0.5 rounded-full ${
                      reached ? 'bg-[#0F5A46]' : 'bg-slate-200'
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    state === 'done'
                      ? 'bg-[#0F5A46] border-[#0F5A46] text-white'
                      : state === 'active'
                        ? 'bg-[#0F5A46] border-[#0F5A46] text-white shadow-[0_0_0_4px_rgba(15,90,70,0.15)]'
                        : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  {state === 'done' ? (
                    <Check className="w-3 h-3" strokeWidth={3} />
                  ) : state === 'active' ? (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span className="text-[9px] font-bold tabular-nums">{index + 1}</span>
                  )}
                </span>
                <span
                  className={`mt-1.5 text-[10px] font-semibold text-center leading-tight max-w-full px-0.5 truncate ${
                    state === 'active'
                      ? 'text-[#0F5A46]'
                      : state === 'done'
                        ? 'text-slate-600'
                        : 'text-slate-400'
                  }`}
                  title={label}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

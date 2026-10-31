/**
 * purchase/components/EvaluationPipeline.jsx
 * ------------------------------------------------------------------
 * Shared workflow stepper for the sourcing / evaluation pages.
 *
 * The stage sequence is NOT defined here — it is the sourcing subset
 * of the ONE canonical Purchase workflow (constants/workflow.js,
 * `EVALUATION_STAGES`): RFQ → Follow-up → Quotations → Comparison →
 * Negotiation → Technical Evaluation → Commercial
 * Evaluation → Supplier Selection → Purchase Order. The ordering
 * always matches PURCHASE_WORKFLOW; this component only decides the
 * per-step state (done / current / pending) from the evaluation board
 * item's `steps` + `rfqStatus`.
 *
 * Renders a compact horizontal stepper where completed steps are
 * green-checked, the current step is highlighted, and future steps are
 * muted. Pure presentational — the board item supplies the state.
 * ------------------------------------------------------------------
 */
import { CheckCircle2, Circle, Dot } from 'lucide-react';

/**
 * Renders a compact horizontal stepper where completed steps are
 * green-checked, the current step is highlighted, and future steps are
 * muted. Pure presentational — the board item supplies the state.
 */
const TONE = {
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  current: 'bg-[#0B4A3D] text-white border-[#0B4A3D] shadow-sm',
  pending: 'bg-slate-50 text-slate-400 border-slate-200'
};

export default function EvaluationPipeline({ steps = [], ariaLabel = 'Evaluation workflow' }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return (
    <ol className="flex flex-wrap items-center gap-y-2" aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const tone = TONE[step.state] || TONE.pending;
        return (
          <li key={step.key} className="flex items-center">
            {index > 0 && <span className="mx-1.5 text-slate-300" aria-hidden="true"><Dot className="w-4 h-4" /></span>}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${tone}`}
            >
              {step.state === 'done' ? (
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              ) : (
                <Circle className="w-2.5 h-2.5" aria-hidden="true" />
              )}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

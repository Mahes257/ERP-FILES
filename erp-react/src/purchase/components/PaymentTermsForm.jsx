/**
 * purchase/components/PaymentTermsForm.jsx
 * ------------------------------------------------------------------
 * Reusable Payment Terms entry form — used during Commercial
 * Evaluation (finalization) and on the PO (edit / release check).
 *
 * Supports every terms type (Full Advance, Partial Advance, Credit,
 * Milestone Based, Against Delivery, Against Invoice, Custom) with:
 *   - auto-calculated Advance Amount / Balance Amount from `total`
 *   - auto-derived balance % for Partial Advance (Advance + Balance
 *     can never diverge from 100%)
 *   - milestone rows with live total-percentage validation (= 100%)
 *   - inline validation messages
 *
 * Controlled component: `value` (normalized terms or null) + `onChange`.
 * ------------------------------------------------------------------
 */
import { Plus, Trash2 } from 'lucide-react';
import { FormField, TextArea } from './ui';
import {
  normalizePaymentTerms,
  validatePaymentTerms,
  advanceAmount,
  balanceAmount,
  attachMilestoneAmounts,
  PAYMENT_TERMS_TYPES,
  PAYMENT_TRIGGERS,
  PAYMENT_TERMS_TYPE
} from '../utils/paymentTerms';
import { formatAmount } from '../utils/purchase';

const inputClass =
  'w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-800 outline-none focus:border-[#0B4A3D] focus:ring-2 focus:ring-[#0B4A3D]/15 transition-colors';

export default function PaymentTermsForm({ value, onChange, total, currency }) {
  const terms = normalizePaymentTerms(value || {});
  const errors = validatePaymentTerms(terms);

  const set = (patch) => onChange(normalizePaymentTerms({ ...terms, ...patch }));

  const setMilestones = (milestones) => onChange(normalizePaymentTerms({ ...terms, milestones }));

  const updateMilestone = (index, patch) =>
    setMilestones(
      (terms.milestones || []).map((milestone, i) => (i === index ? { ...milestone, ...patch } : milestone))
    );

  const addMilestone = () =>
    setMilestones([...(terms.milestones || []), { percentage: 0, trigger: PAYMENT_TRIGGERS[2] }]);

  const removeMilestone = (index) => setMilestones((terms.milestones || []).filter((_, i) => i !== index));

  const totalValue = Number(total) || 0;
  const milestoneRows = attachMilestoneAmounts(terms, totalValue);

  const showAdvanceSplit =
    terms.type === PAYMENT_TERMS_TYPE.PARTIAL_ADVANCE ||
    terms.type === PAYMENT_TERMS_TYPE.FULL_ADVANCE ||
    terms.type === PAYMENT_TERMS_TYPE.AGAINST_DELIVERY ||
    terms.type === PAYMENT_TERMS_TYPE.AGAINST_INVOICE;

  return (
    <div className="space-y-4">
      <FormField label="Payment Terms Type" required>
        <select
          className={inputClass}
          value={terms.type || ''}
          onChange={(e) => set({ type: e.target.value })}
        >
          <option value="">Select payment terms type</option>
          {PAYMENT_TERMS_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </FormField>

      {showAdvanceSplit && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-3.5">
          {terms.type === PAYMENT_TERMS_TYPE.FULL_ADVANCE ? (
            <div className="text-xs font-bold text-slate-700">
              100% Advance
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Advance %" required>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={inputClass}
                  value={terms.advancePercentage || ''}
                  onChange={(e) => set({ advancePercentage: e.target.value })}
                  placeholder="e.g. 50"
                />
              </FormField>
              {/* Balance auto-derives: Advance % + Balance % = 100. */}
              <FormField label="Balance % (auto)">
                <input
                  type="number"
                  className={`${inputClass} bg-slate-100 text-slate-500`}
                  value={terms.balancePercentage}
                  readOnly
                />
              </FormField>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Advance Trigger" required>
              <select
                className={inputClass}
                value={terms.advanceTrigger || ''}
                onChange={(e) => set({ advanceTrigger: e.target.value })}
              >
                <option value="">Select trigger</option>
                {PAYMENT_TRIGGERS.map((trigger) => (
                  <option key={trigger} value={trigger}>{trigger}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Balance Trigger" required>
              <select
                className={inputClass}
                value={terms.balanceTrigger || ''}
                onChange={(e) => set({ balanceTrigger: e.target.value })}
              >
                <option value="">Select trigger</option>
                {PAYMENT_TRIGGERS.map((trigger) => (
                  <option key={trigger} value={trigger}>{trigger}</option>
                ))}
              </select>
            </FormField>
          </div>
        </div>
      )}

      {terms.type === PAYMENT_TERMS_TYPE.CREDIT && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
          <FormField label="Credit Period (days)" required>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={terms.creditPeriod || ''}
              onChange={(e) => set({ creditPeriod: e.target.value })}
              placeholder="e.g. 30"
            />
          </FormField>
        </div>
      )}

      {terms.type === PAYMENT_TERMS_TYPE.MILESTONE_BASED && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Milestones</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addMilestone}>
              <Plus size={12} /> Add Milestone
            </button>
          </div>
          {(terms.milestones || []).map((milestone, index) => (
            <div key={index} className="grid grid-cols-[1fr_1.6fr_auto] gap-2 items-center">
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={milestone.percentage || ''}
                onChange={(e) => updateMilestone(index, { percentage: e.target.value })}
                placeholder="%"
                aria-label={`Milestone ${index + 1} percentage`}
              />
              <select
                className={inputClass}
                value={milestone.trigger || ''}
                onChange={(e) => updateMilestone(index, { trigger: e.target.value })}
                aria-label={`Milestone ${index + 1} trigger`}
              >
                <option value="">Trigger</option>
                {PAYMENT_TRIGGERS.map((trigger) => (
                  <option key={trigger} value={trigger}>{trigger}</option>
                ))}
              </select>
              <button
                type="button"
                className="p-2 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                onClick={() => removeMilestone(index)}
                aria-label={`Remove milestone ${index + 1}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {milestoneRows.length > 0 && (
            <div className="text-[11px] text-slate-500">
              {milestoneRows.map((milestone, index) => (
                <div key={index} className="flex items-center justify-between py-0.5">
                  <span>{milestone.percentage}% {milestone.trigger || 'Milestone'}</span>
                  {totalValue > 0 && (
                    <span className="font-bold text-slate-700 tabular-nums">
                      {formatAmount(milestone.amount, currency)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <FormField label="Payment Notes">
        <TextArea
          rows={2}
          value={terms.notes || ''}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Optional — bank details, special conditions, advance release conditions…"
        />
      </FormField>

      {/* Auto-calculated summary — the user never computes amounts. */}
      {totalValue > 0 && terms.type && terms.type !== PAYMENT_TERMS_TYPE.MILESTONE_BASED && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5">
            Payment Summary
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div className="text-slate-600">
              PO Value: <span className="font-bold text-slate-800 tabular-nums">{formatAmount(totalValue, currency)}</span>
            </div>
            <div className="text-slate-600">
              Advance Required:{' '}
              <span className="font-bold text-emerald-700 tabular-nums">{formatAmount(advanceAmount(terms, totalValue), currency)}</span>
            </div>
            <div className="text-slate-600">
              Balance:{' '}
              <span className="font-bold text-slate-800 tabular-nums">{formatAmount(balanceAmount(terms, totalValue), currency)}</span>
            </div>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 space-y-1">
          {errors.map((error) => (
            <p key={error} className="text-[11px] font-semibold text-rose-600">{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}

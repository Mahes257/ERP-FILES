/**
 * purchase/pages/approval/NfaCreate.jsx
 * ------------------------------------------------------------------
 * Create NFA – Note for Approval — raises a formal approval note for
 * an RFQ whose supplier selection has been completed. The supplier,
 * final value and currency are DERIVED from the stored selection (the
 * service refuses to fabricate its own numbers), so the note always
 * documents the actual award decision. Only the purpose and
 * justification are entered here; every other field comes from the
 * source RFQ's evaluation record.
 *
 * On submit the note is created AND immediately submitted for 1st
 * Approval (no Draft state is left for the user to manage).
 *
 * Route: /purchase/rfq/approval/new
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ClipboardCheck, FileSearch, Loader2, MailPlus, Stamp } from 'lucide-react';
import { FormField, SelectInput, TextArea, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import { formatAmount } from '../../utils/purchase';
import { formatDateTime } from '../../utils/helpers';
import { sameRfqId, selectInitialRfqId } from '../../utils/approvalCreateFlow';
import { nfaService } from '../../services/nfa';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

export default function NfaCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  /* RFQ pre-selected by the caller (e.g. Technical Evaluation → Proceed
     to Approval passes ?rfqId=<id>). Empty when opened directly. */
  const requestedRfqId = searchParams.get('rfqId')?.trim() || '';

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRfqId, setSelectedRfqId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [userNfaNo, setUserNfaNo] = useState('');

  useEffect(() => {
    let cancelled = false;
    nfaService
      .getNfaCandidates()
      .then((result) => {
        if (cancelled) return;
        setCandidates(result);
        setSelectedRfqId(selectInitialRfqId(result, requestedRfqId));
        setUserNfaNo(nfaService.getNextNfaNo());
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedRfqId]);

  /* sameRfqId() (not ===) because selectedRfqId comes from either the
     ?rfqId= query parameter or a native <select> — both strings — while
     candidate.rfqId is the numeric RFQ store id. Comparing strictly
     would drop a genuinely eligible RFQ. */
  const selected = useMemo(
    () => candidates.find((candidate) => sameRfqId(candidate.rfqId, selectedRfqId)) || null,
    [candidates, selectedRfqId]
  );

  /* An rfqId was supplied (Technical Evaluation → Proceed to Approval)
     but the RFQ is not an eligible candidate — show the validation
     state rather than silently selecting another RFQ. */
  const requestedRfqMissing = Boolean(requestedRfqId) && !candidates.some(
    (candidate) => sameRfqId(candidate.rfqId, requestedRfqId)
  );

  const createNote = async () => {
    if (!selected || busy) return;
    if (!purpose.trim() || !justification.trim()) {
      toast.error('Enter both the purpose and justification before raising the note.');
      return;
    }
    setBusy(true);
    try {
      const note = await nfaService.createNfa({
        rfqId: selected.rfqId,
        nfaNo: userNfaNo,
        purpose: purpose.trim(),
        justification: justification.trim()
      });
      await nfaService.submitNfa(note.id);
      toast.success(`${note.nfaNo} created and submitted for 1st Approval`);
      navigate(`/purchase/rfq/approval/${note.id}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to raise the note');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Approval Flow', to: '/purchase/rfq/approval' },
          { label: 'Create' }
        ]}
        icon={Stamp}
        title="Create Approval Note"
        subtitle="Raise an approval note from an RFQ after PCS, Technical Evaluation, and Supplier Selection"
        actions={
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq/approval')}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back to Approval Flow
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : candidates.length === 0 || requestedRfqMissing ? (
        <PurchaseSectionCard
          title="No Eligible RFQs"
          subtitle={requestedRfqMissing
            ? 'This RFQ is not eligible for an Approval Note — it may already have a note, or its Technical Evaluation and Supplier Selection may not be complete.'
            : 'An Approval Note requires completed PCS, Technical Evaluation and Supplier Selection'}
        >
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-5">
              <FileSearch size={28} className="text-amber-600" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1.5">
              No RFQs Ready for Approval
            </h3>
            <p className="text-xs text-slate-500 max-w-lg leading-relaxed mb-5">
              An Approval Note can only be created after an RFQ has completed the
              <span className="font-semibold text-slate-600"> Price Comparative Statement</span>,
              <span className="font-semibold text-slate-600"> Technical Evaluation</span> and
              <span className="font-semibold text-slate-600"> Supplier Selection</span> process.
              The note's supplier, value and currency are derived directly from the selection, so an RFQ
              without completed evaluation cannot be approved.
            </p>

            {/* Workflow steps */}
            <div className="flex items-center gap-2 mb-6">
              {[
                { label: 'RFQ Sent', icon: MailPlus, active: false },
                { label: 'Quotations Received', icon: ClipboardCheck, active: false },
                { label: 'PCS', icon: FileSearch, active: false },
                { label: 'Technical Evaluation', icon: ClipboardCheck, active: true },
                { label: 'Approval Note', icon: Stamp, active: false }
              ].map((step, index) => (
                <div key={step.label} className="flex items-center gap-2">
                  {index > 0 && <div className="w-6 h-px bg-slate-200" aria-hidden="true" />}
                  <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border ${
                    step.active
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    <step.icon size={12} aria-hidden="true" />
                    {step.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/purchase/rfq')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-lg transition-all cursor-pointer bg-gradient-to-r from-[#0F5C4C] to-[#0B4A3D] hover:from-[#136754] hover:to-[#0F5C4C] shadow-sm"
              >
                <MailPlus size={14} /> Go to RFQ List
              </button>
              <button
                type="button"
                onClick={() => navigate('/purchase/rfq/approval')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 bg-surface border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ChevronLeft size={14} /> Back to Approval Flow
              </button>
            </div>
          </div>
        </PurchaseSectionCard>
      ) : (
        <PurchaseSectionCard
          title="Note Details"
          subtitle="Supplier and value are derived from the completed selection — they cannot be changed here"
        >
          <div className="space-y-4">
            <FormField label="Source RFQ" required hint="RFQs with a completed supplier selection and no existing note">
              <SelectInput
                registration={{ value: selectedRfqId, onChange: (e) => setSelectedRfqId(e.target.value) }}
              >
                {candidates.map((candidate) => (
                  <option key={candidate.rfqId} value={candidate.rfqId}>
                    {candidate.rfqNo} — {candidate.title || 'Untitled'}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            {selected && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5">
                <div className={LABEL}>Derived from selection</div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
                  <div>
                    <div className={LABEL}>RFQ</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">{selected.rfqNo}</div>
                  </div>
                  <div>
                    <div className={LABEL}>Title</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5 truncate" title={selected.title}>{selected.title || '—'}</div>
                  </div>
                  <div>
                    <div className={LABEL}>Supplier</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">{selected.supplier}</div>
                  </div>
                  <div>
                    <div className={LABEL}>Final Value</div>
                    <div className="text-xs font-bold text-emerald-700 mt-0.5">
                      {formatAmount(selected.amount, selected.currency)}
                    </div>
                  </div>
                  <div>
                    <div className={LABEL}>Selected On</div>
                    <div className="text-xs font-semibold text-slate-700 mt-0.5">
                      {selected.selectedAt ? formatDateTime(selected.selectedAt) : '—'}
                    </div>
                  </div>
                  {selected.paymentTerms && (
                    <div>
                      <div className={LABEL}>Payment Terms</div>
                      <div className="text-xs font-semibold text-slate-700 mt-0.5">{selected.paymentTerms}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <FormField label="NFA Number">
              <input
                type="text"
                value={userNfaNo}
                onChange={(e) => setUserNfaNo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D] outline-none"
                placeholder="Auto-generated"
              />
            </FormField>

            <FormField label="Purpose" required hint="Why this procurement needs approval (appears on the note)">
              <TextArea
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Approval to place the purchase order with the selected supplier at the evaluated rate."
              />
            </FormField>

            <FormField label="Justification" required hint="Basis for the proposed supplier and value (appears on the note)">
              <TextArea
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="e.g. Lowest evaluated total after the technical and commercial evaluation, within the project plan."
              />
            </FormField>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => navigate('/purchase/rfq/approval')}
              >
                Cancel
              </button>
              <button
                type="button"
                className="erp-btn-primary"
                disabled={busy || !selected}
                onClick={createNote}
              >
                <span className="erp-btn-icon">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Stamp size={16} />}
                </span>
                Submit for Approval
              </button>
            </div>
          </div>
        </PurchaseSectionCard>
      )}
    </PurchasePageLayout>
  );
}

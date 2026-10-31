/**
 * purchase/pages/evaluation/NegotiationWorkspace.jsx
 * ------------------------------------------------------------------
 * Negotiation Workspace — detail view for one RFQ/vendor pair.
 * Route: /purchase/rfq/negotiation/:rfqId/:vendorId
 * Records negotiation rounds and tracks agreement status.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, ChevronLeft, Loader2,
  RefreshCw, Scale, Send
} from 'lucide-react';
import { Modal, TextArea, useToast } from '../../components/ui';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { evaluationService } from '../../services/evaluation';
import { formatAmount } from '../../utils/purchase';
import { formatDateTime } from '../../utils/helpers';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

export default function NegotiationWorkspace() {
  const navigate = useNavigate();
  const { rfqId, vendorId } = useParams();
  const toast = useToast();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roundTarget, setRoundTarget] = useState(null);
  const [roundType, setRoundType] = useState('counter');
  const [remarks, setRemarks] = useState('');
  const [proposedRate, setProposedRate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await evaluationService.getEvaluation(rfqId);
      if (!data) { setNotFound(true); return; }
      setItem(data);
    } catch { setNotFound(true); } finally { setLoading(false); }
  }, [rfqId]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const recordRound = async () => {
    if (!roundTarget || busy || !item) return;
    setBusy(true);
    try {
      await evaluationService.recordNegotiation(item.rfqId, roundTarget.vendor, {
        type: roundType,
        proposedRate: Number(proposedRate) || undefined,
        remarks
      });
      toast.success(`Negotiation round recorded for ${roundTarget.vendor}`);
      setRoundTarget(null);
      setRemarks('');
      setProposedRate('');
      load();
    } catch (err) {
      toast.error(err?.message || 'Failed to record negotiation round');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !item) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">RFQ not available for negotiation</p>
          <p className="text-xs text-slate-400 mt-1">It may have been awarded, closed, or the link is invalid.</p>
          <button type="button" onClick={() => navigate('/purchase/rfq/negotiation')} className="erp-btn-primary mt-4">
            <span className="erp-btn-icon"><ChevronLeft size={16} /></span> Back to Negotiations
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const vendor = (item.vendors || []).find((v) => v.vendor === vendorId) || (item.vendors || [])[0];
  const agreed = Boolean(item.steps?.negotiationAgreed);
  const rounds = vendor?.negotiationRounds || [];

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations' },
          { label: 'Final Negotiation', to: '/purchase/rfq/negotiation' },
          { label: item.rfqNo }
        ]}
        icon={Scale}
        title={
          <span className="flex items-center gap-3">
            {item.rfqNo}
            <PurchaseStatusBadge status={item.rfqStatus} />
          </span>
        }
        subtitle={item.title || 'Negotiation workspace'}
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/rfq/negotiation')} className="po-btn po-btn-secondary">
              <ChevronLeft className="po-btn-icon-ic" /> Back to List
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
      />

      <PurchaseSectionCard
        title="Negotiation"
        subtitle={
          <span className="inline-flex items-center gap-2">
            <PurchaseStatusBadge status={item.rfqStatus} />
            <span className="text-[11px] text-slate-400">{vendor?.vendor || '—'}</span>
          </span>
        }
        action={
          agreed ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Agreed
            </span>
          ) : (
            <button
              type="button"
              className="erp-btn-primary"
              onClick={() => { setRoundTarget(vendor); setRoundType('counter'); setRemarks(''); setProposedRate(''); }}
            >
              <span className="erp-btn-icon"><Send size={16} /></span> Record Round
            </button>
          )
        }
      >
        {vendor && (
          <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-3 py-2.5">Vendor</th>
                  <th className="px-3 py-2.5 text-right">Quoted Price</th>
                  <th className="px-3 py-2.5 text-center">Rounds</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{vendor.vendor}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-700 tabular-nums">{formatAmount(vendor.total, item.currency)}</td>
                  <td className="px-3 py-2.5 text-center">{rounds.length}</td>
                  <td className="px-3 py-2.5 text-center">
                    {agreed ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">Agreed</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600">Pending</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {rounds.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Negotiation Rounds</h4>
            <div className="space-y-2">
              {rounds.map((round, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-700">Round {i + 1}</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold ${round.type === 'opening' ? 'bg-blue-50 text-blue-700' : round.type === 'counter' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {round.type}
                    </span>
                    {round.proposedRate && (
                      <span className="font-semibold text-slate-600 tabular-nums">{formatAmount(round.proposedRate, item.currency)}</span>
                    )}
                  </div>
                  {round.remarks && <p className="text-slate-500">{round.remarks}</p>}
                  {round.date && <p className="text-slate-400 mt-0.5">{formatDateTime(round.date)}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => navigate(`/purchase/rfq/price-comparative-statement?rfq=${item.rfqId}`)} className="btn btn-ghost btn-sm">
            <Scale className="po-btn-icon-ic" /> Price Comparative Statement
          </button>
          {agreed && (
            <button type="button" onClick={() => navigate(`/purchase/rfq/price-comparative-statement?rfq=${item.rfqId}`)} className="btn btn-primary btn-sm">
              Continue to PCS <ArrowRight className="po-btn-icon-ic" />
            </button>
          )}
        </div>
      </PurchaseSectionCard>

      <Modal
        open={roundTarget !== null}
        onClose={() => { setRoundTarget(null); setRemarks(''); setProposedRate(''); }}
        title={`Record negotiation round — ${item.rfqNo}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoundTarget(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={recordRound}>
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Send className="po-btn-icon-ic" />}
              Record Round
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Round Type</label>
            <select
              value={roundType}
              onChange={(e) => setRoundType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
            >
              <option value="opening">Opening</option>
              <option value="counter">Counter</option>
              <option value="final">Final</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Proposed Rate ({item.currency || 'INR'})</label>
            <input
              type="number"
              value={proposedRate}
              onChange={(e) => setProposedRate(e.target.value)}
              placeholder="Enter proposed rate"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none"
            />
          </div>
          <TextArea
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks — basis of negotiation, terms, conditions…"
          />
        </div>
      </Modal>
    </PurchasePageLayout>
  );
}

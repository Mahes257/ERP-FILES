import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronRight,
  Copy,
  Download,
  FileDown,
  FileText,
  Mail,
  Printer,
  Send,
  Share2,
  MessageCircle
} from 'lucide-react';
import quotationService from '../../services/quotationService';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import { useToast } from '../../components/Common';
import { formatDate, formatINR } from '../../utils/leadHelpers';
import './quotation-module.css';
import '../crm/crm-erp.css';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0B4A3D] placeholder:text-slate-400';

export default function QuotationEmail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [notFound, setNotFound] = useState(!id);
  const [tab, setTab] = useState('email');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    quotationService
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res;
        if (!raw?.id) {
          setNotFound(true);
          return;
        }
        setDoc(raw);
        setTo(raw.email || raw.clientEmail || '');
        setSubject(`Quotation ${raw.quotationNo || raw.id} from VISHAK TECH`);
        setMessage(
          `Dear ${raw.clientName || raw.client || 'Sir/Madam'},\n\nPlease find attached our quotation ${raw.quotationNo || raw.id} for your reference.\n\nTotal Amount: ${formatINR(raw.grandTotal || 0)}\nValid Till: ${formatDate(raw.validUntil || raw.validity)}\n\nLooking forward to your positive response.\n\nBest Regards,\n${raw.salesPerson || 'VISHAK TECH'}`
        );
        setShareLink(`${window.location.origin}/quotations/${raw.id}/view`);
      })
      .catch(() => setNotFound(true))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const sendEmail = async () => {
    if (!to.trim()) {
      toast.warning('Enter recipient email');
      return;
    }
    setBusy(true);
    try {
      await quotationService.postAction(id, 'send');
      toast.success(`Quotation sent to ${to.trim()}`);
    } catch (err) {
      toast.error(err?.message || 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(shareLink).catch(() => {});
    toast.success('Link copied!');
  };

  const shareWhatsApp = () => {
    const text = `Quotation ${doc?.quotationNo || doc?.id} from VISHAK TECH\nAmount: ${formatINR(doc?.grandTotal || 0)}\nView: ${shareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareEmail = () => {
    const subj = encodeURIComponent(`Quotation ${doc?.quotationNo || doc?.id} from VISHAK TECH`);
    const body = encodeURIComponent(`View quotation here: ${shareLink}`);
    window.open(`mailto:?subject=${subj}&body=${body}`, '_blank');
  };

  const sharePrint = () => {
    window.open(`/quotations/print/${id}`, '_blank');
  };

  const downloadCSV = () => {
    if (!doc) return;
    const lines = ['Item,Qty,Unit,Rate,Disc%,Tax%,Amount'];
    (doc.items || []).forEach((it) => {
      const qty = Number(it.qty || 1);
      const rate = Number(it.rate || 0);
      const disc = Number(it.discountPct || it.discount || 0);
      const gst = Number(it.gstRate || it.gst || 0);
      const base = qty * rate;
      const amount = base - (base * disc) / 100 + ((base - (base * disc) / 100) * gst) / 100;
      lines.push(`${it.productName || it.product || it.description || 'Item'},${qty},${it.unit || 'pcs'},${rate},${disc}%,${gst}%,${amount.toFixed(2)}`);
    });
    lines.push('');
    lines.push(`Subtotal,${Number(doc.subTotal || 0).toFixed(2)}`);
    lines.push(`Grand Total,${Number(doc.grandTotal || 0).toFixed(2)}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.quotationNo || doc.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('CSV downloaded');
  };

  const TABS = [
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'share', label: 'Share', icon: Share2 },
    { key: 'download', label: 'Download', icon: Download }
  ];

  return (
    <div className="qpo-page">
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/dashboard')}>Dashboard</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Send Quotation</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Send className="w-6 h-6 text-[#0B4A3D]" />
            Send Quotation
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Email, share or download the quotation</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" /> Quotation List
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      ) : notFound || !doc ? (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">Quotation Not Found</h2>
          <p className="text-xs text-slate-400">Open this page from a quotation's Email action.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
          {/* ===== SUMMARY ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider">Quotation</h3>
              <SalesStatusBadge status={doc.status} />
            </div>
            <div className="text-xl font-extrabold text-slate-900 mb-1">{doc.quotationNo || doc.id}</div>
            <div className="text-sm text-slate-600 mb-4">{doc.clientName || doc.client || '—'}</div>
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Amount</span>
                <span className="font-bold text-[#0B4A3D]">{formatINR(doc.grandTotal || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Date</span>
                <span className="font-semibold text-slate-700">{formatDate(doc.quotationDate || doc.date)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Valid Till</span>
                <span className="font-semibold text-slate-700">{formatDate(doc.validUntil || doc.validity)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Items</span>
                <span className="font-semibold text-slate-700">{(doc.items || []).length}</span>
              </div>
            </div>
          </div>

          {/* ===== TABS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center border-b border-slate-200">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
                      active ? 'border-[#0B4A3D] text-[#0B4A3D]' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {tab === 'email' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">To</label>
                    <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT_CLS} placeholder="customer@email.com" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Subject</label>
                    <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Message</label>
                    <textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} className={`${INPUT_CLS} resize-none`} />
                  </div>
                  <button
                    type="button"
                    onClick={sendEmail}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 w-full text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" /> {busy ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              )}

              {tab === 'share' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Share Link</label>
                    <div className="flex gap-2">
                      <input type="text" readOnly value={shareLink} className={INPUT_CLS} />
                      <button
                        type="button"
                        onClick={copyLink}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={shareWhatsApp}
                      className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-[#25D366] hover:bg-[#1da851] px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={shareEmail}
                      className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" /> Email
                    </button>
                    <button
                      type="button"
                      onClick={sharePrint}
                      className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print View
                    </button>
                  </div>
                </div>
              )}

              {tab === 'download' && (
                <div className="space-y-2">
                  {[
                    { icon: FileDown, label: 'Download PDF', hint: 'Print-ready PDF of the quotation', onClick: () => window.open(`/quotations/print/${id}`, '_blank') },
                    { icon: Printer, label: 'Print', hint: 'Open the print view in a new tab', onClick: () => window.open(`/quotations/print/${id}`, '_blank') },
                    { icon: Download, label: 'Download CSV', hint: 'Items in CSV format', onClick: downloadCSV }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={opt.onClick}
                      className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer text-left"
                    >
                      <span className="p-2 rounded-lg bg-slate-100 text-[#0B4A3D] shrink-0">
                        <opt.icon className="w-4 h-4" />
                      </span>
                      <span>
                        <span className="block text-xs font-bold text-slate-700">{opt.label}</span>
                        <span className="block text-[11px] text-slate-400">{opt.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

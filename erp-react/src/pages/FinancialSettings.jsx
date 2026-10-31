import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useToast } from '../components/Common';
import { useExchangeRates } from '../components/Common';
import exchangeRateService from '../services/exchangeRateService';
import { getStoredUser } from '../services/authService';
import CurrencyDropdown from '../components/SalesForm/CurrencyDropdown';

const isAdmin = () => String(getStoredUser()?.role || '').toUpperCase() === 'ADMIN';

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const CARD =
  'bg-white border border-slate-200 rounded-xl shadow-sm p-6';

export default function FinancialSettings() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshNow } = useExchangeRates();

  const [base, setBase] = useState('INR');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const admin = isAdmin();

  // Fresh backend read whenever the page opens (cancelled-flag pattern).
  useEffect(() => {
    let cancelled = false;
    exchangeRateService
      .getFinancial()
      .then((res) => {
        if (cancelled) return;
        const d = res?.data ?? res ?? {};
        if (d.baseCurrency) setBase(d.baseCurrency);
        setLastUpdated(d.lastUpdated || null);
        setStale(Boolean(d.stale));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = async () => {
    try {
      const res = await exchangeRateService.getFinancial();
      const d = res?.data ?? res ?? {};
      if (d.baseCurrency) setBase(d.baseCurrency);
      setLastUpdated(d.lastUpdated || null);
      setStale(Boolean(d.stale));
    } catch {
      toast.error('Could not load financial settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await exchangeRateService.updateFinancial(base);
      await load();
      await refreshNow().catch(() => {});
      toast.success(`Base currency set to ${base} — rates refreshed`);
      setDirty(false);
    } catch (err) {
      toast.error(err?.message || 'Only an ADMIN can change the base currency');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNow();
      await load();
      toast.success('Exchange rates refreshed');
    } catch (err) {
      toast.error(err?.message || 'Refresh failed — showing cached rates');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back link + title + subtitle are the page header: pinned while the
          settings cards scroll (useStickyPageHeader). */}
      <button
        type="button"
        data-erp-sticky-header
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors cursor-pointer mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 data-erp-sticky-header className="text-xl font-semibold text-slate-800 mb-1">Settings</h1>
      <p data-erp-sticky-header className="text-sm text-slate-500 mb-6">Organization / Company Settings â†’ Financial Settings</p>

      <div className={CARD}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0B4A3D] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-800">Financial Settings</h2>
              <p className="text-xs text-slate-400">Base currency used by every module for exchange-rate conversions</p>
            </div>
          </div>
          {!admin && (
            <span className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-500">
              Read-only · Admin only
            </span>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Default Base Currency <span className="text-slate-400">(default: INR)</span>
            </label>
            {admin ? (
              <CurrencyDropdown
                value={base}
                onChange={(v) => {
                  setBase(v);
                  setDirty(true);
                }}
                selectOnly
                inputClassName="w-full max-w-xs h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-[#0B4A3D] transition-colors"
              />
            ) : (
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 max-w-xs">
                {base || 'INR'} <span className="text-slate-400">(INR - Indian Rupee)</span>
              </div>
            )}
            {admin && dirty && (
              <p className="text-[11px] text-amber-600 mt-1.5">
                Changing the base currency refreshes rates and applies to future calculations. Existing
                documents keep the exchange rate they were created with.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5">Exchange rates last updated</div>
              <div className="text-sm font-medium text-slate-700">{fmt(lastUpdated)}</div>
              {stale && <div className="text-[11px] text-amber-600 mt-0.5">Showing cached rates (provider unavailable)</div>}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5">Auto refresh</div>
              <div className="text-sm font-medium text-slate-700">Every 24 hours</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Silent background refresh, no page reload</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-100">
          {admin && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold text-white bg-[#0B4A3D] hover:bg-[#083D34] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

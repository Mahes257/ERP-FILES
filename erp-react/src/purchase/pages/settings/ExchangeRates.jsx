/**
 * purchase/pages/settings/ExchangeRates.jsx
 * ------------------------------------------------------------------
 * Exchange Rates master — CRUD over the conversion table that backs
 * the module's multi-currency display (Display = INR ÷ rate).
 *
 * INR is the fixed base currency (rate always 1, not editable /
 * deletable). Every other row's rate and effective date can be edited
 * inline and saved immediately; new currencies can be added from the
 * ISO-4217 master; rows can be deleted; the whole table can be reset
 * to the seed rates. Changes apply instantly across the module because
 * the sync accessors (getExchangeRate / convertFromBase) read the
 * persisted master.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote, Info, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import ModuleTabNav from '../../components/ModuleTabNav';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import { exchangeRateService, BASE_CURRENCY } from '../../services/exchangeRates';
import { currencies } from '../../../data/currencies';
import { formatAmount } from '../../utils/purchase';
import { todayLocal } from '../../services/base';

const TH = 'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap';
const TD = 'px-3 py-2.5';
const INPUT =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-[#0B4A3D] focus:bg-surface focus:shadow-[0_0_0_3px_rgba(11,74,61,0.1)]';

function stringifyRates(list) {
  return list.map((entry) => ({
    code: entry.code,
    rate: String(entry.rate ?? ''),
    effectiveDate: entry.effectiveDate || todayLocal()
  }));
}

export default function ExchangeRates() {
  const toast = useToast();

  const [rates, setRates] = useState([]); // { code, rate: string, effectiveDate }
  const [persisted, setPersisted] = useState([]); // last saved snapshot (stringified)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [addCode, setAddCode] = useState('');
  const [addRate, setAddRate] = useState('');
  const [addDate, setAddDate] = useState(todayLocal());
  const [addError, setAddError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState(null); // code to delete
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await exchangeRateService.getRates();
      const stringified = stringifyRates(list);
      setRates(stringified);
      setPersisted(stringified);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const dirtyCodes = useMemo(() => {
    const dirty = new Set();
    rates.forEach((row) => {
      const prev = persisted.find((p) => p.code === row.code);
      if (!prev || prev.rate !== row.rate || prev.effectiveDate !== row.effectiveDate) dirty.add(row.code);
    });
    return dirty;
  }, [rates, persisted]);

  const availableCurrencies = useMemo(() => {
    const present = new Set(rates.map((row) => row.code));
    return currencies.filter((c) => !present.has(c.code));
  }, [rates]);

  const updateRow = (code, field, value) => {
    setRates((prev) => prev.map((row) => (row.code === code ? { ...row, [field]: value } : row)));
  };

  /* Every row must be valid before anything is persisted — otherwise the
     service's normaliser would silently drop a row with a bad rate. */
  const findInvalid = (list) => {
    for (const row of list) {
      const rate = Number(row.rate);
      if (!Number.isFinite(rate) || rate <= 0) return `${row.code}: rate must be a number greater than zero`;
      if (!row.effectiveDate) return `${row.code}: effective date is required`;
    }
    return null;
  };

  const persist = async (next) => {
    const invalid = findInvalid(next);
    if (invalid) {
      toast.error(`Cannot save — ${invalid}.`);
      return false;
    }
    setBusy(true);
    try {
      const saved = await exchangeRateService.saveRates(next);
      const stringified = stringifyRates(saved);
      setRates(stringified);
      setPersisted(stringified);
      return true;
    } catch (err) {
      toast.error(err?.message || 'Failed to save exchange rates');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async (code) => {
    const row = rates.find((r) => r.code === code);
    if (!row) return;
    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error('Rate must be a number greater than zero.');
      return;
    }
    if (!row.effectiveDate) {
      toast.error('Effective date is required.');
      return;
    }
    const ok = await persist(rates);
    if (ok) toast.success(`${code} exchange rate saved`);
  };

  const deleteRow = async () => {
    if (!confirmDelete) return;
    const ok = await persist(rates.filter((row) => row.code !== confirmDelete));
    if (ok) {
      toast.success(`${confirmDelete} exchange rate removed`);
      if (addCode === confirmDelete) setAddCode('');
    }
    setConfirmDelete(null);
  };

  const resetDefaults = async () => {
    setBusy(true);
    try {
      const saved = await exchangeRateService.resetRates();
      const stringified = stringifyRates(saved);
      setRates(stringified);
      setPersisted(stringified);
      setAddCode('');
      setAddRate('');
      setAddDate(todayLocal());
      setAddError('');
      toast.success('Exchange rates reset to defaults');
    } catch (err) {
      toast.error(err?.message || 'Failed to reset exchange rates');
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  const addCurrency = async () => {
    if (!addCode) {
      setAddError('Select a currency.');
      return;
    }
    const rate = Number(addRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setAddError('Enter a rate greater than zero.');
      return;
    }
    if (!addDate) {
      setAddError('Effective date is required.');
      return;
    }
    setAddError('');
    const ok = await persist([...rates, { code: addCode, rate: String(rate), effectiveDate: addDate }]);
    if (ok) {
      toast.success(`${addCode} added to the exchange-rate master`);
      setAddCode('');
      setAddRate('');
      setAddDate(todayLocal());
    }
  };

  const base = rates.find((row) => row.code === BASE_CURRENCY);

  if (loading) {
    return (
      <PurchasePageLayout className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </PurchasePageLayout>
    );
  }

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        crumb="Purchase · Settings · Exchange Rates"
        icon={Banknote}
        title="Exchange Rates"
        subtitle="Maintain the conversion master — Display = INR ÷ rate — used across the module"
        actions={
          <>
            <button
              type="button"
              onClick={load}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${busy ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-surface border border-rose-200 px-3 py-2.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer select-none disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset to Defaults
            </button>
          </>
        }
      />

      <ModuleTabNav module="settings" />

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-rose-600">{error?.message || 'Failed to load exchange rates.'}</p>
          <button type="button" onClick={load} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* LEFT — master table + add */}
        <div className="lg:col-span-2 space-y-4">
          {/* Master table */}
          <PurchaseSectionCard
            title="Conversion Master"
            subtitle={`${rates.length} currencies configured · ${dirtyCodes.size > 0 ? `${dirtyCodes.size} unsaved change(s)` : 'all changes saved'}`}
            className="overflow-hidden"
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[860px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className={TH}>Currency</th>
                    <th className={`${TH} w-36`}>Rate (₹ per 1 unit)</th>
                    <th className={`${TH} w-40`}>Effective Date</th>
                    <th className={TH}>1 unit =</th>
                    <th className={TH}>Sample · ₹15,000</th>
                    <th className={`${TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rates.map((row) => {
                    const meta = currencies.find((c) => c.code === row.code);
                    const rateNum = Number(row.rate);
                    const isBase = row.code === BASE_CURRENCY;
                    const dirty = dirtyCodes.has(row.code);
                    const validRate = Number.isFinite(rateNum) && rateNum > 0;
                    return (
                      <tr key={row.code} className={`bg-surface transition-colors ${dirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}`}>
                        <td className={`${TD} font-bold text-slate-800 whitespace-nowrap`}>
                          <span className="flex items-center gap-2">
                            {row.code}
                            {meta && <span className="text-slate-400 font-medium">{meta.symbol}</span>}
                            {isBase && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#0B4A3D] bg-[#E8F0EE] px-2 py-0.5 rounded-full">
                                <ShieldCheck className="w-3 h-3" /> Base
                              </span>
                            )}
                          </span>
                          <div className="text-[11px] font-medium text-slate-400">{meta?.name || '—'}</div>
                        </td>
                        <td className={TD}>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.rate}
                            readOnly={isBase}
                            onChange={(e) => updateRow(row.code, 'rate', e.target.value)}
                            aria-label={`Rate for ${row.code}`}
                            className={`${INPUT} ${isBase ? 'opacity-70 cursor-not-allowed' : ''} ${!validRate ? 'border-rose-300' : ''}`}
                          />
                        </td>
                        <td className={TD}>
                          <input
                            type="date"
                            value={row.effectiveDate}
                            readOnly={isBase}
                            onChange={(e) => updateRow(row.code, 'effectiveDate', e.target.value)}
                            aria-label={`Effective date for ${row.code}`}
                            className={`${INPUT} ${isBase ? 'opacity-70 cursor-not-allowed' : ''}`}
                          />
                        </td>
                        <td className={`${TD} font-semibold text-slate-700 tabular-nums whitespace-nowrap`}>
                          {validRate ? `1 ${row.code} = ${formatAmount(rateNum, BASE_CURRENCY)}` : '—'}
                        </td>
                        <td className={`${TD} font-semibold text-slate-700 tabular-nums whitespace-nowrap`}>
                          {validRate ? formatAmount(15000 / rateNum, row.code) : '—'}
                        </td>
                        <td className={`${TD} text-right whitespace-nowrap`}>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveRow(row.code)}
                              disabled={busy || isBase || !dirty}
                              title={isBase ? 'Base currency — rate is fixed at 1' : 'Save this rate'}
                              className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                dirty && !isBase
                                  ? 'bg-[#0B4A3D] text-white hover:bg-[#083D34]'
                                  : 'text-slate-400 bg-slate-50 border border-slate-200'
                              }`}
                            >
                              <Save className="w-3 h-3" /> Save
                            </button>
                            {!isBase && (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(row.code)}
                                disabled={busy}
                                title="Remove this currency"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-2.5 text-[11px] text-slate-400 border-t border-slate-100">
              INR is the system base currency — all amounts are stored in INR and its rate is fixed at 1.
            </p>
          </PurchaseSectionCard>

          {/* Add currency */}
          <PurchaseSectionCard
            icon={Plus}
            title="Add Currency"
            subtitle="Configure a conversion rate for a currency not yet in the master."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Currency</span>
                <select
                  value={addCode}
                  onChange={(e) => setAddCode(e.target.value)}
                  className={`${INPUT} cursor-pointer ${addError && !addCode ? 'border-rose-300' : ''}`}
                >
                  <option value="">Select currency…</option>
                  {availableCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Rate (₹ per 1 unit)</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={addRate}
                  onChange={(e) => setAddRate(e.target.value)}
                  placeholder="e.g. 91.5"
                  className={`${INPUT} ${addError && addRate !== '' && Number(addRate) <= 0 ? 'border-rose-300' : ''}`}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Effective Date</span>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  className={INPUT}
                />
              </label>
            </div>
            {addError && <p className="mt-2 text-[11px] font-semibold text-rose-500">{addError}</p>}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={addCurrency}
                disabled={busy || !addCode || !addRate || !addDate}
                className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Currency
              </button>
            </div>
          </PurchaseSectionCard>
        </div>

        {/* RIGHT — info panel */}
        <div className="space-y-4 lg:sticky lg:top-20">
          <PurchaseSectionCard
            icon={Info}
            title="How Conversion Works"
          >
            <div className="rounded-xl border border-[#BFE0D6] bg-[#EDF7F4] p-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                All amounts are <span className="font-bold text-slate-800">calculated and stored in INR</span>. When a
                document uses another currency, every displayed value is converted:
              </p>
              <p className="mt-2 text-sm font-bold text-[#0B4A3D] tabular-nums">
                Display = INR ÷ Rate
              </p>
              <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                e.g. 15,000 INR ÷ 86.25 = <span className="font-bold text-slate-700">$173.91</span>
              </p>
            </div>
            <dl className="mt-4 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between gap-2">
                <dt>Currencies configured</dt>
                <dd className="font-bold text-slate-800">{rates.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Base currency</dt>
                <dd className="font-bold text-[#0B4A3D]">{base?.code || 'INR'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Base rate</dt>
                <dd className="font-bold text-slate-800">1.0000</dd>
              </div>
            </dl>
          </PurchaseSectionCard>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[11px] font-semibold text-amber-800 leading-relaxed">
              Changes apply instantly — saved rates re-render every converted amount across requisitions, the approval
              workspace, technical review, documents and reports. Stored (INR) values are never altered.
            </p>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove exchange rate"
        message={`Remove ${confirmDelete || ''} from the conversion master? Documents already saved keep their INR values — only future conversions stop using this rate.`}
        confirmLabel="Remove"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onConfirm={deleteRow}
        onCancel={() => !busy && setConfirmDelete(null)}
      />

      {/* Reset confirm */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset exchange rates"
        message="Restore the default seed rates (USD 86.25, EUR 99.40, AED 23.49, GBP 115.20, JPY 0.58)? All custom rates will be lost."
        confirmLabel="Reset to Defaults"
        variant="warning"
        icon={RefreshCw}
        loading={busy}
        onConfirm={resetDefaults}
        onCancel={() => !busy && setConfirmReset(false)}
      />
    </PurchasePageLayout>
  );
}

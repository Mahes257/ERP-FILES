/**
 * purchase/pages/settings/CurrencySettings.jsx
 * ------------------------------------------------------------------
 * Currency Settings — configure the module's default currency and how
 * amounts are displayed (symbol position, decimal places, thousands
 * separator). Persists via the mock settingsService.currencySettings.
 *
 * Also shows the full ISO-4217 currency master (src/data/currencies.js)
 * with live search by code or name, and lets you set the default
 * directly from the list. A live preview shows how amounts render
 * under the current preferences.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote, Check, Loader2, RefreshCw, Save, Search, Settings2
} from 'lucide-react';
import { CurrencySelect, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import ModuleTabNav from '../../components/ModuleTabNav';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import { CURRENCY_PREFS_DEFAULTS, settingsService } from '../../services/settings';
import { currencies } from '../../../data/currencies';
import { formatAmount } from '../../utils/purchase';

const POSITION_OPTIONS = [
  { value: 'before', label: 'Before amount', hint: '$1,234.56' },
  { value: 'after', label: 'After amount', hint: '1,234.56 $' },
  { value: 'none', label: 'No symbol', hint: '1,234.56' }
];

const DECIMAL_OPTIONS = [0, 2, 3];

const TH = 'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap';

export default function CurrencySettings() {
  const toast = useToast();
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsService.getSettings();
      setPrefs({
        defaultCurrency: data?.currencySettings?.defaultCurrency || data?.defaults?.currency || CURRENCY_PREFS_DEFAULTS.defaultCurrency,
        symbolPosition: data?.currencySettings?.symbolPosition || CURRENCY_PREFS_DEFAULTS.symbolPosition,
        decimalPlaces: Number.isFinite(Number(data?.currencySettings?.decimalPlaces)) ? Number(data.currencySettings.decimalPlaces) : CURRENCY_PREFS_DEFAULTS.decimalPlaces,
        thousandsSeparator: data?.currencySettings?.thousandsSeparator !== undefined ? Boolean(data.currencySettings.thousandsSeparator) : CURRENCY_PREFS_DEFAULTS.thousandsSeparator
      });
      setError(null);
    } catch (err) {
      setPrefs({ ...CURRENCY_PREFS_DEFAULTS }); // keep page usable; error banner shown below
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const filteredCurrencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [query]);

  const setField = (field) => (value) => {
    setPrefs((prev) => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      await settingsService.updateSettings({
        currencySettings: prefs,
        defaults: { currency: prefs.defaultCurrency }
      });
      toast.success('Currency settings saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save currency settings');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setPrefs({ ...CURRENCY_PREFS_DEFAULTS });
    try {
      await settingsService.updateSettings({ currencySettings: CURRENCY_PREFS_DEFAULTS, defaults: { currency: CURRENCY_PREFS_DEFAULTS.defaultCurrency } });
      toast.success('Currency settings reset to defaults');
    } catch (err) {
      toast.error(err?.message || 'Failed to reset currency settings');
    }
  };

  if (loading || !prefs) {
    return (
      <PurchasePageLayout className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </PurchasePageLayout>
    );
  }

  const previewValues = [26179179.94, 1234567.89, 982.5];
  const defaultEntry = currencies.find((c) => c.code === prefs.defaultCurrency);

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        crumb="Purchase · Settings · Currency"
        title="Currency Settings"
        subtitle="Default currency and how amounts are displayed across the Purchase module"
        actions={
          <>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> Reset
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>
          </>
        }
      />

      <ModuleTabNav module="settings" />

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-rose-600">{error?.message || 'Failed to load currency settings.'}</p>
          <button type="button" onClick={load} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* LEFT — configuration */}
        <div className="lg:col-span-2 space-y-4">
          {/* Default currency */}
          <PurchaseSectionCard
            icon={Banknote}
            title="Default Currency"
            subtitle="Used as the preselected currency on new requisitions, purchase orders, RFQs, invoices and vendor records."
          >
            <div className="max-w-sm">
              <CurrencySelect
                value={prefs.defaultCurrency}
                onChange={setField('defaultCurrency')}
                ariaLabel="Default currency"
                searchable
              />
            </div>
            {defaultEntry && (
              <p className="mt-3 text-[11px] text-slate-400">
                Currently <span className="font-bold text-[#0B4A3D]">{defaultEntry.code} — {defaultEntry.name}</span> · symbol{' '}
                <span className="font-bold text-slate-700">{defaultEntry.symbol}</span>
              </p>
            )}
          </PurchaseSectionCard>

          {/* Symbol display preferences */}
          <PurchaseSectionCard
            title="Symbol Display"
            subtitle="How the currency symbol and numbers are formatted on documents and reports."
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Symbol position</span>
                <div className="flex flex-col gap-2">
                  {POSITION_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                        prefs.symbolPosition === opt.value
                          ? 'border-[#0B4A3D] bg-[#EDF7F4] text-[#0B4A3D]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="symbolPosition"
                          checked={prefs.symbolPosition === opt.value}
                          onChange={() => setField('symbolPosition')(opt.value)}
                          className="accent-[#0B4A3D]"
                        />
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{opt.hint}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Decimal places</span>
                <div className="flex gap-2">
                  {DECIMAL_OPTIONS.map((dec) => (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => setField('decimalPlaces')(dec)}
                      className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                        prefs.decimalPlaces === dec
                          ? 'border-[#0B4A3D] bg-[#EDF7F4] text-[#0B4A3D]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {dec}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Digits after the decimal point.</p>
              </div>

              <div>
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Thousands separator</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.thousandsSeparator}
                  onClick={() => setField('thousandsSeparator')(!prefs.thousandsSeparator)}
                  className={`relative w-12 h-[26px] rounded-full transition-colors cursor-pointer ${
                    prefs.thousandsSeparator ? 'bg-[#0B4A3D]' : 'bg-slate-300'
                  }`}
                  aria-label="Thousands separator"
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      prefs.thousandsSeparator ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                    style={{ left: 0 }}
                  />
                </button>
                <p className="mt-2 text-[11px] text-slate-400">
                  {prefs.thousandsSeparator ? '1,23,456.78 (grouped)' : '123456.78 (plain)'}
                </p>
              </div>
            </div>
          </PurchaseSectionCard>

          {/* ISO-4217 currency master */}
          <PurchaseSectionCard
            title="ISO-4217 Currency Master"
            subtitle={`${currencies.length} world currencies · search by code or name · click a row to set as default`}
            className="overflow-hidden"
            bodyClassName="p-0"
            action={
              <>
                <button
                  type="button"
                  onClick={() => navigate('/purchase/settings/exchange-rates')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B4A3D] bg-[#EDF7F4] border border-[#BFE0D6] px-2.5 py-1.5 rounded-lg hover:bg-[#E8F0EE] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Settings2 className="w-3 h-3" /> Manage Exchange Rates
                </button>
                <div className="relative w-64 max-w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search code or name…"
                    aria-label="Search currencies"
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-[#0B4A3D] focus:bg-surface focus:shadow-[0_0_0_3px_rgba(11,74,61,0.1)] transition-all"
                  />
                </div>
              </>
            }
          >
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className={`${TH} w-20`}>Code</th>
                    <th className={`${TH} w-16`}>Symbol</th>
                    <th className={TH}>Name</th>
                    <th className={`${TH} w-24 text-center`}>Default</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCurrencies.map((c) => {
                    const isDefault = c.code === prefs.defaultCurrency;
                    return (
                      <tr
                        key={c.code}
                        onClick={() => setField('defaultCurrency')(c.code)}
                        className={`cursor-pointer transition-colors ${
                          isDefault ? 'bg-[#EDF7F4]/70 hover:bg-[#EDF7F4]' : 'bg-surface hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="px-3 py-2 font-bold text-slate-800">
                          {c.code}
                          {isDefault && <span className="sr-only"> (default)</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-500 font-semibold">{c.symbol}</td>
                        <td className="px-3 py-2 text-slate-600">{c.name}</td>
                        <td className="px-3 py-2 text-center">
                          {isDefault ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0B4A3D] bg-[#E8F0EE] px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3" /> Default
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setField('defaultCurrency')(c.code);
                              }}
                              className="text-[10px] font-semibold text-slate-400 hover:text-[#0B4A3D] hover:underline cursor-pointer"
                            >
                              Set default
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCurrencies.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-xs text-slate-400">
                        No currencies match &quot;{query}&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PurchaseSectionCard>
        </div>

        {/* RIGHT — live preview */}
        <PurchaseSectionCard
          title="Live Preview"
          subtitle="How amounts will look with the current settings."
          className="lg:sticky lg:top-20"
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            {previewValues.map((value) => (
              <div key={value} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 tabular-nums">{value.toLocaleString('en-IN')}</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums whitespace-nowrap">
                  {formatAmount(value, prefs.defaultCurrency, prefs)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[#BFE0D6] bg-[#EDF7F4] p-4">
            <p className="text-[11px] font-semibold text-[#0B4A3D] uppercase tracking-wide mb-2">Summary</p>
            <dl className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between gap-2">
                <dt>Default</dt>
                <dd className="font-bold text-slate-800">{prefs.defaultCurrency} — {defaultEntry?.name || ''}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Symbol position</dt>
                <dd className="font-semibold capitalize text-slate-700">{prefs.symbolPosition}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Decimals</dt>
                <dd className="font-semibold text-slate-700">{prefs.decimalPlaces}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Thousands</dt>
                <dd className="font-semibold text-slate-700">{prefs.thousandsSeparator ? 'On' : 'Off'}</dd>
              </div>
            </dl>
          </div>
        </PurchaseSectionCard>
      </div>
    </PurchasePageLayout>
  );
}

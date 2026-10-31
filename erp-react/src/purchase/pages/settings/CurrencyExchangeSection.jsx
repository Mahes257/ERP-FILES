/**
 * purchase/pages/settings/CurrencyExchangeSection.jsx
 * ------------------------------------------------------------------
 * Combined Currency Settings + Exchange Rate Master section.
 * Rendered inline inside the main Settings page — no separate routing.
 * Uses the unified settings-polish.css ERP design system.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote, Check, Info, Loader2, Plus, RefreshCw, Save,
  Search, ShieldCheck, Trash2
} from 'lucide-react';
import { CurrencySelect, ConfirmDialog, useToast } from '../../components/ui';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import { exchangeRateService, BASE_CURRENCY } from '../../services/exchangeRates';
import { CURRENCY_PREFS_DEFAULTS } from '../../services/settings';
import { currencies } from '../../../data/currencies';
import { formatAmount } from '../../utils/purchase';
import { todayLocal } from '../../services/base';

/* ------------------------------------------------------------------ */
/*  Shared class names (settings-polish.css)                            */
/* ------------------------------------------------------------------ */
const INPUT = 'st-input';
const SELECT = 'st-select';
const LABEL = 'st-label';

const POSITION_OPTIONS = [
  { value: 'before', label: 'Before amount', hint: '$1,234.56' },
  { value: 'after', label: 'After amount', hint: '1,234.56 $' },
  { value: 'none', label: 'No symbol', hint: '1,234.56' }
];

const DECIMAL_OPTIONS = [0, 2, 3];

function stringifyRates(list) {
  return list.map((entry) => ({
    code: entry.code,
    rate: String(entry.rate ?? ''),
    effectiveDate: entry.effectiveDate || todayLocal()
  }));
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function CurrencyExchangeSection({ settings, update, mode = 'both' }) {
  const showCurrency = mode === 'both' || mode === 'currency';
  const showExchange = mode === 'both' || mode === 'exchange';
  const toast = useToast();

  const storedPrefs = settings?.currencySettings || {};
  const prefs = useMemo(() => ({
    defaultCurrency: storedPrefs.defaultCurrency || settings?.defaults?.currency || CURRENCY_PREFS_DEFAULTS.defaultCurrency,
    symbolPosition: storedPrefs.symbolPosition || CURRENCY_PREFS_DEFAULTS.symbolPosition,
    decimalPlaces: Number.isFinite(Number(storedPrefs.decimalPlaces)) ? Number(storedPrefs.decimalPlaces) : CURRENCY_PREFS_DEFAULTS.decimalPlaces,
    thousandsSeparator: storedPrefs.thousandsSeparator !== undefined ? Boolean(storedPrefs.thousandsSeparator) : CURRENCY_PREFS_DEFAULTS.thousandsSeparator
  }), [storedPrefs.defaultCurrency, storedPrefs.symbolPosition, storedPrefs.decimalPlaces, storedPrefs.thousandsSeparator, settings?.defaults?.currency]);
  const [query, setQuery] = useState('');

  const [rates, setRates] = useState([]);
  const [persisted, setPersisted] = useState([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addRate, setAddRate] = useState('');
  const [addDate, setAddDate] = useState(todayLocal());
  const [addError, setAddError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const list = await exchangeRateService.getRates();
      const stringified = stringifyRates(list);
      setRates(stringified);
      setPersisted(stringified);
      setRatesError(null);
    } catch (err) {
      setRatesError(err);
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(loadRates); }, [loadRates]);

  const filteredCurrencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [query]);

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

  const defaultEntry = useMemo(() => currencies.find((c) => c.code === prefs?.defaultCurrency), [prefs]);
  const base = useMemo(() => rates.find((row) => row.code === BASE_CURRENCY), [rates]);

  const setField = (field) => (value) => {
    update({
      currencySettings: { ...prefs, [field]: value },
      defaults: field === 'defaultCurrency'
        ? { ...(settings?.defaults || {}), currency: value }
        : settings?.defaults
    });
  };

  const saveCurrencyPrefs = async () => {
    toast.success('Currency display settings updated — save via the global Save Settings button');
  };

  const updateRow = (code, field, value) => {
    setRates((prev) => prev.map((row) => (row.code === code ? { ...row, [field]: value } : row)));
  };

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
    if (!Number.isFinite(rate) || rate <= 0) { toast.error('Rate must be a number greater than zero.'); return; }
    if (!row.effectiveDate) { toast.error('Effective date is required.'); return; }
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
    if (!addCode) { setAddError('Select a currency.'); return; }
    const rate = Number(addRate);
    if (!Number.isFinite(rate) || rate <= 0) { setAddError('Enter a rate greater than zero.'); return; }
    if (!addDate) { setAddError('Effective date is required.'); return; }
    setAddError('');
    const ok = await persist([...rates, { code: addCode, rate: String(rate), effectiveDate: addDate }]);
    if (ok) {
      toast.success(`${addCode} added to the exchange-rate master`);
      setAddCode('');
      setAddRate('');
      setAddDate(todayLocal());
    }
  };

  if (ratesLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const previewValues = [26179179.94, 1234567.89, 982.5];

  return (
    <div className="st-space-y-4">
      {/* Header */}
      <div>
        <h2 className="st-text-sm st-text-bold st-text-dark">
          {mode === 'currency' ? 'Currency Settings' : mode === 'exchange' ? 'Exchange Rates' : 'Currency & Exchange Rates'}
        </h2>
        <p className="st-text-xs st-text-muted mt-0.5">
          {mode === 'currency'
            ? 'Configure default currency, symbol display and the ISO-4217 currency master.'
            : mode === 'exchange'
              ? 'Configure conversion rates and manage the exchange-rate master.'
              : 'Configure currency display, conversion rules and exchange rates used across Purchase.'}
        </p>
      </div>

      {/* ── DEFAULT CURRENCY ── */}
      {showCurrency && (<>
      <PurchaseSectionCard
        icon={Banknote}
        title="Default Currency"
        subtitle="Used as the preselected currency on new requisitions, purchase orders, RFQs, invoices and vendor records."
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 st-space-y-4">
            <div className="st-input-wmax360">
              <CurrencySelect
                value={prefs.defaultCurrency}
                onChange={setField('defaultCurrency')}
                ariaLabel="Default currency"
                searchable
              />
            </div>
            {defaultEntry && (
              <p className="st-text-xxs st-text-light">
                Currently <span className="st-text-semibold st-text-accent">{defaultEntry.code} — {defaultEntry.name}</span> · symbol{' '}
                <span className="st-text-semibold st-text-dark">{defaultEntry.symbol}</span>
              </p>
            )}

            {/* Symbol Display */}
            <div className="st-preview-box">
              <p className="st-text-xs st-text-bold st-text-dark mb-3">Symbol Display</p>
              <div className="st-form-grid-3">
                <div>
                  <span className="st-label" style={{ marginBottom: 8 }}>Symbol Position</span>
                  <div className="st-space-y-2">
                    {POSITION_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border st-text-xs st-text-semibold cursor-pointer transition-colors ${
                          prefs.symbolPosition === opt.value
                            ? 'border-st-text-accent bg-st-accent-light text-st-text-accent'
                            : 'border-st-border text-st-text-muted hover:bg-white'
                        }`}
                        style={{
                          borderColor: prefs.symbolPosition === opt.value ? 'var(--purchase-primary, #075E54)' : 'var(--purchase-border, #E2E8F0)',
                          backgroundColor: prefs.symbolPosition === opt.value ? 'var(--purchase-mint, #EDF7F4)' : undefined,
                          color: prefs.symbolPosition === opt.value ? 'var(--purchase-mint-fg, #0B4A3D)' : undefined
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <input type="radio" name="symbolPosition" checked={prefs.symbolPosition === opt.value} onChange={() => setField('symbolPosition')(opt.value)} className="st-radio" />
                          {opt.label}
                        </span>
                        <span className="st-text-xxs st-text-light tabular-nums">{opt.hint}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="st-label" style={{ marginBottom: 8 }}>Decimal Places</span>
                  <div className="flex gap-2">
                    {DECIMAL_OPTIONS.map((dec) => (
                      <button
                        key={dec}
                        type="button"
                        onClick={() => setField('decimalPlaces')(dec)}
                        className="flex-1 px-3 py-2.5 rounded-lg border st-text-xs st-text-bold transition-colors cursor-pointer"
                        style={{
                          borderColor: prefs.decimalPlaces === dec ? 'var(--purchase-primary, #075E54)' : 'var(--purchase-border, #E2E8F0)',
                          backgroundColor: prefs.decimalPlaces === dec ? 'var(--purchase-mint, #EDF7F4)' : undefined,
                          color: prefs.decimalPlaces === dec ? 'var(--purchase-mint-fg, #0B4A3D)' : undefined
                        }}
                      >{dec}</button>
                    ))}
                  </div>
                  <p className="mt-2 st-text-xxs st-text-light">Digits after the decimal point.</p>
                </div>
                <div>
                  <span className="st-label" style={{ marginBottom: 8 }}>Thousands Separator</span>
                  <button type="button" role="switch" aria-checked={prefs.thousandsSeparator} onClick={() => setField('thousandsSeparator')(!prefs.thousandsSeparator)} className="st-toggle" aria-label="Thousands separator" />
                  <p className="mt-2 st-text-xxs st-text-light">
                    {prefs.thousandsSeparator ? '1,23,456.78 (grouped)' : '123456.78 (plain)'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={saveCurrencyPrefs} className="st-btn st-btn-outline"><Save className="w-3.5 h-3.5" /> Save Currency Display</button>
              </div>
            </div>
          </div>

          {/* Right: live preview */}
          <div className="st-space-y-4 lg:sticky lg:top-20">
            <div className="st-preview-box">
              <p className="st-text-xs st-text-bold st-text-dark mb-3">Live Preview</p>
              <div className="rounded-lg border border-st-border p-3 st-space-y-3" style={{ background: 'rgba(100,116,139,0.05)', borderColor: 'rgba(100,116,139,0.12)' }}>
                {previewValues.map((value) => (
                  <div key={value} className="flex items-center justify-between gap-2">
                    <span className="st-text-xxs st-text-light tabular-nums">{value.toLocaleString('en-IN')}</span>
                    <span className="st-text-sm st-text-bold st-text-dark tabular-nums whitespace-nowrap">
                      {formatAmount(value, prefs.defaultCurrency, prefs)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 st-info-card">
                <p className="st-text-xxs st-text-semibold st-text-accent uppercase tracking-wide mb-1.5">Summary</p>
                <dl className="st-space-y-1 st-text-xxs st-text-muted">
                  <div className="flex justify-between"><dt>Default</dt><dd className="st-text-bold st-text-dark">{prefs.defaultCurrency} — {defaultEntry?.name || ''}</dd></div>
                  <div className="flex justify-between"><dt>Symbol</dt><dd className="st-text-semibold capitalize st-text-dark">{prefs.symbolPosition}</dd></div>
                  <div className="flex justify-between"><dt>Decimals</dt><dd className="st-text-semibold st-text-dark">{prefs.decimalPlaces}</dd></div>
                  <div className="flex justify-between"><dt>Thousands</dt><dd className="st-text-semibold st-text-dark">{prefs.thousandsSeparator ? 'On' : 'Off'}</dd></div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </PurchaseSectionCard>

      {/* ── ISO-4217 CURRENCY MASTER ── */}
      <PurchaseSectionCard
        title="ISO-4217 Currency Master"
        subtitle={`${currencies.length} world currencies · search by code or name · click a row to set as default`}
        className="overflow-hidden"
        bodyClassName="p-0"
        action={
          <div className="relative st-input-wmax240">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code or name..."
              aria-label="Search currencies"
              className="st-input st-input-search"
            />
          </div>
        }
      >
        <div className="st-table-scroll" style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table className="st-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Code</th>
                <th style={{ width: 64 }}>Symbol</th>
                <th>Name</th>
                <th className="st-td-center" style={{ width: 100 }}>Default</th>
              </tr>
            </thead>
            <tbody>
              {filteredCurrencies.map((c) => {
                const isDefault = c.code === prefs.defaultCurrency;
                return (
                  <tr
                    key={c.code}
                    onClick={() => setField('defaultCurrency')(c.code)}
                    className="cursor-pointer"
                    style={isDefault ? { background: 'rgba(234,247,243,0.5)' } : undefined}
                  >
                    <td data-label="Code"><span className="st-td-bold">{c.code}</span></td>
                    <td data-label="Symbol"><span className="st-td-muted st-td-bold">{c.symbol}</span></td>
                    <td data-label="Name"><span>{c.name}</span></td>
                    <td data-label="Default" className="st-td-center">
                      {isDefault ? (
                        <span className="st-badge st-badge-success"><Check className="w-3 h-3" /> Default</span>
                      ) : (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setField('defaultCurrency')(c.code); }} className="st-xxs st-text-semibold st-text-light hover:st-text-accent hover:underline cursor-pointer" style={{ fontSize: 10 }}>Set default</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredCurrencies.length === 0 && (
                <tr><td colSpan={4} className="st-empty">No currencies match &quot;{query}&quot;</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PurchaseSectionCard>
      </>
      )}

      {/* ── EXCHANGE RATE MASTER ── */}
      {showExchange && (<>
      <PurchaseSectionCard
        title="Exchange Rate Master"
        subtitle={`${rates.length} currencies configured · ${dirtyCodes.size > 0 ? `${dirtyCodes.size} unsaved change(s)` : 'all changes saved'}`}
        className="overflow-hidden"
        bodyClassName="p-0"
      >
        {ratesError && (
          <div className="mx-4 mt-4 st-banner st-banner-danger flex items-center justify-between gap-3">
            <p className="st-text-xxs st-text-semibold">Failed to load exchange rates.</p>
            <button type="button" onClick={loadRates} className="st-text-xxs st-text-bold underline cursor-pointer">Retry</button>
          </div>
        )}
        <div className="st-table-scroll">
          <table className="st-table" style={{ minWidth: 880 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Currency</th>
                <th style={{ width: 160 }}>Rate (per 1 unit)</th>
                <th style={{ width: 150 }}>Effective Date</th>
                <th style={{ minWidth: 140 }}>1 unit =</th>
                <th style={{ minWidth: 140 }}>Sample (15,000)</th>
                <th className="st-td-center" style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((row) => {
                const meta = currencies.find((c) => c.code === row.code);
                const rateNum = Number(row.rate);
                const isBase = row.code === BASE_CURRENCY;
                const dirty = dirtyCodes.has(row.code);
                const validRate = Number.isFinite(rateNum) && rateNum > 0;
                return (
                  <tr key={row.code} style={dirty ? { background: 'rgba(255,251,235,0.5)' } : undefined}>
                    <td data-label="Currency">
                      <div>
                        <span className="st-td-bold">{row.code}</span>
                        {meta && <span className="st-td-muted st-td-bold" style={{ marginLeft: 6 }}>{meta.symbol}</span>}
                        {isBase && (
                          <span className="st-badge st-badge-primary" style={{ marginLeft: 6 }}><ShieldCheck className="w-3 h-3" /> Base</span>
                        )}
                      </div>
                      <div className="st-text-xxs st-text-light">{meta?.name || '—'}</div>
                    </td>
                    <td data-label="Rate"><input type="number" step="any" min="0" value={row.rate} readOnly={isBase} onChange={(e) => updateRow(row.code, 'rate', e.target.value)} className={`${INPUT} ${isBase ? 'opacity-70 cursor-not-allowed' : ''} ${!validRate ? 'st-input-error' : ''}`} /></td>
                    <td data-label="Effective Date"><input type="date" value={row.effectiveDate} readOnly={isBase} onChange={(e) => updateRow(row.code, 'effectiveDate', e.target.value)} className={`${INPUT} ${isBase ? 'opacity-70 cursor-not-allowed' : ''}`} /></td>
                    <td data-label="Conversion"><span className="st-td-bold st-td-mono st-td-nowrap">{validRate ? `1 ${row.code} = ${formatAmount(rateNum, BASE_CURRENCY)}` : '—'}</span></td>
                    <td data-label="Sample"><span className="st-td-bold st-td-mono st-td-nowrap">{validRate ? formatAmount(15000 / rateNum, row.code) : '—'}</span></td>
                    <td data-label="Actions" className="st-td-actions">
                      <div className="inline-flex items-center gap-1.5 justify-center">
                        <button type="button" onClick={() => saveRow(row.code)} disabled={busy || isBase || !dirty}
                          className={`st-btn ${dirty && !isBase ? 'st-btn-primary' : 'st-btn-ghost'} st-btn-sm`}
                          style={{ opacity: (!dirty || isBase) ? 0.5 : 1, cursor: (!dirty || isBase) ? 'not-allowed' : 'pointer' }}>
                          <Save className="w-3 h-3" /> Save
                        </button>
                        {!isBase && (
                          <button type="button" onClick={() => setConfirmDelete(row.code)} disabled={busy}
                            className="st-btn-icon st-btn-icon-danger">
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
        <p className="st-footer-note">
          INR is the system base currency — all amounts are stored in INR and its rate is fixed at 1.
        </p>
      </PurchaseSectionCard>

      {/* ── ADD CURRENCY ── */}
      <PurchaseSectionCard icon={Plus} title="Add Currency" subtitle="Configure a conversion rate for a currency not yet in the master.">
        <div className="st-form-grid-3 items-end">
          <label className="block">
            <span className={LABEL}>Currency</span>
            <select value={addCode} onChange={(e) => setAddCode(e.target.value)} className={`${SELECT} ${addError && !addCode ? 'st-input-error' : ''}`}>
              <option value="">Select currency...</option>
              {availableCurrencies.map((c) => (<option key={c.code} value={c.code}>{c.code} — {c.name}</option>))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Rate (per 1 unit)</span>
            <input type="number" step="any" min="0" value={addRate} onChange={(e) => setAddRate(e.target.value)} placeholder="e.g. 86.25" className={`${INPUT} ${addError && addRate !== '' && Number(addRate) <= 0 ? 'st-input-error' : ''}`} />
          </label>
          <label className="block">
            <span className={LABEL}>Effective Date</span>
            <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className={INPUT} />
          </label>
        </div>
        {addError && <p className="mt-2 st-text-xxs st-text-semibold st-text-rose">{addError}</p>}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={addCurrency} disabled={busy || !addCode || !addRate || !addDate}
            className="st-btn st-btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Currency
          </button>
        </div>
      </PurchaseSectionCard>

      {/* ── HOW CONVERSION WORKS ── */}
      <div className="st-form-grid">
        <PurchaseSectionCard icon={Info} title="How Conversion Works">
          <div className="st-info-card">
            <p className="st-text-xs st-text-muted leading-relaxed">
              All amounts are <span className="st-text-bold st-text-dark">calculated and stored in INR</span>. When a
              document uses another currency, every displayed value is converted:
            </p>
            <p className="mt-2 st-text-sm st-text-bold st-text-accent tabular-nums">Display = INR ÷ Rate</p>
            <p className="mt-2 st-text-xxs st-text-muted leading-relaxed">
              e.g. 15,000 INR ÷ 86.25 = <span className="st-text-bold st-text-dark">$173.91</span>
            </p>
          </div>
          <dl className="mt-4 st-space-y-2 st-text-xs st-text-muted">
            <div className="flex justify-between gap-2"><dt>Currencies configured</dt><dd className="st-td-bold">{rates.length}</dd></div>
            <div className="flex justify-between gap-2"><dt>Base currency</dt><dd className="st-td-accent">{base?.code || 'INR'}</dd></div>
            <div className="flex justify-between gap-2"><dt>Base rate</dt><dd className="st-td-bold">1.0000</dd></div>
          </dl>
        </PurchaseSectionCard>

        <div className="st-space-y-4">
          <div className="st-banner st-banner-warning">
            Changes apply instantly — saved rates re-render every converted amount across requisitions, the approval
            workspace, technical review, documents and reports. Stored (INR) values are never altered.
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loadRates} disabled={busy}
              className="st-btn st-btn-ghost disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={() => setConfirmReset(true)} disabled={busy}
              className="st-btn st-btn-danger disabled:opacity-50">
              <RefreshCw className="w-3.5 h-3.5" /> Reset to Defaults
            </button>
          </div>
        </div>
      </div>

      </>
      )}

      {/* ── CONFIRM DIALOGS ── */}
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
    </div>
  );
}

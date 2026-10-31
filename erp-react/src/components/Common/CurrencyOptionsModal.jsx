import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Pencil, Plus, X } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './ToastContext';
import {
  addCurrency,
  editCurrency,
  getCurrencies,
  setCurrencyEnabled,
  subscribeDropdownChanges
} from '../../utils/dropdownManager';

const ROW_BTN = 'p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer';
const ROW_BTN_ACTION =
  'p-1 rounded text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer';

/**
 * CurrencyOptionsModal — manage the currency list used by the Client form.
 * Add a currency (code + symbol + name), edit symbol/name, or enable/disable.
 * Disabled currencies disappear from new selections; existing clients keep
 * their stored currency code.
 */
export default function CurrencyOptionsModal({ open, onClose }) {
  const toast = useToast();
  const [currencies, setCurrencies] = useState(() => getCurrencies());
  const [code, setCode] = useState('');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editName, setEditName] = useState('');

  useEffect(() => subscribeDropdownChanges(() => setCurrencies(getCurrencies())), [open]);

  const handleAdd = () => {
    const res = addCurrency({ code, symbol, name });
    if (res.ok) {
      toast.success(`Currency "${code.toUpperCase()}" added`);
      setCode('');
      setSymbol('');
      setName('');
    } else {
      toast.warning(res.error);
    }
  };

  const startEdit = (c) => {
    setEditingCode(c.code);
    setEditSymbol(c.symbol);
    setEditName(c.name);
  };

  const saveEdit = () => {
    const res = editCurrency(editingCode, { symbol: editSymbol, name: editName });
    if (res.ok) {
      toast.success(`Currency "${editingCode}" updated`);
      setEditingCode(null);
    }
  };

  const toggle = (c) => {
    setCurrencyEnabled(c.code, !c.enabled);
    toast.success(c.enabled ? `"${c.code}" disabled` : `"${c.code}" enabled`);
  };

  const enabled = currencies.filter((c) => c.enabled);
  const disabledList = currencies.filter((c) => !c.enabled);

  const inputCls =
    'flex-1 min-w-0 bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 transition-all';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Currencies"
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        {/* Add */}
        <div className="space-y-1.5 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code (e.g. INR)" className={`${inputCls} max-w-[38%]`} aria-label="Currency code" />
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol (e.g. ₹)" className={inputCls} aria-label="Currency symbol" />
          </div>
          <div className="flex items-center gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Indian Rupee)" className={inputCls} aria-label="Currency name" />
            <button
              type="button"
              onClick={handleAdd}
              className="flex items-center gap-1 shrink-0 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {currencies.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">No currencies yet — add one above.</div>
          )}
          {enabled.map((c) =>
            editingCode === c.code ? (
              <div key={c.code} className="flex items-center gap-1 px-2 py-1.5 bg-[#F4F7F6]">
                <input value={editSymbol} onChange={(e) => setEditSymbol(e.target.value)} className={`${inputCls} max-w-[22%]`} aria-label="Edit symbol" />
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === 'Escape') {
                      setEditingCode(null);
                    }
                  }}
                  className={inputCls}
                  aria-label="Edit name"
                  autoFocus
                />
                <button type="button" title="Save" onClick={saveEdit} className={ROW_BTN_ACTION}>
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Cancel" onClick={() => setEditingCode(null)} className={ROW_BTN}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div key={c.code} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 min-w-0 truncate text-xs text-slate-700">
                  <span className="font-bold">{c.symbol}</span> {c.code} — {c.name}
                </span>
                <button type="button" title="Edit" onClick={() => startEdit(c)} className={ROW_BTN_ACTION}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Disable" onClick={() => toggle(c)} className={ROW_BTN}>
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          )}
          {disabledList.map((c) => (
            <div key={c.code} className="flex items-center gap-2 px-3 py-2 bg-slate-50/80">
              <span className="flex-1 min-w-0 truncate text-xs text-slate-400 line-through">{c.code} — {c.name}</span>
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                Disabled
              </span>
              <button type="button" title="Enable" onClick={() => toggle(c)} className={ROW_BTN_ACTION}>
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          Disabled currencies are hidden from new selections; existing clients keep their stored currency.
        </p>
      </div>
    </Modal>
  );
}

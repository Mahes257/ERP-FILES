import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Pencil, Plus, X } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './ToastContext';
import {
  FLAT_CATEGORIES,
  addFlatValue,
  getFlatOptions,
  renameFlatValue,
  setFlatEnabled,
  subscribeDropdownChanges
} from '../../utils/dropdownManager';

const ROW_BTN =
  'p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer';
const ROW_BTN_ACTION =
  'p-1 rounded text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer';

/**
 * OptionsManagerModal — manages the option list of one dropdown category.
 * Supports Add (case-insensitive duplicate prevention), Edit (re-label) and
 * Enable/Disable (disabled values disappear from new selections; existing
 * records keep displaying them).
 */
export default function OptionsManagerModal({ categoryKey, label, open, onClose }) {
  const toast = useToast();
  const [options, setOptions] = useState(() => getFlatOptions(categoryKey));
  const [addText, setAddText] = useState('');
  const [editingValue, setEditingValue] = useState(null);
  const [editText, setEditText] = useState('');

  useEffect(
    () => subscribeDropdownChanges(() => setOptions(getFlatOptions(categoryKey))),
    [open, categoryKey]
  );

  const title = label || FLAT_CATEGORIES[categoryKey]?.label || categoryKey;

  const handleAdd = () => {
    const v = addText.trim();
    if (!v) return;
    const res = addFlatValue(categoryKey, v);
    if (res.ok) {
      toast.success(`"${v}" added`);
      setAddText('');
    } else {
      toast.warning(res.error);
    }
  };

  const startEdit = (opt) => {
    setEditingValue(opt.value);
    setEditText(opt.value);
  };

  const saveEdit = () => {
    const v = editText.trim();
    if (!v) {
      toast.warning('Value cannot be empty');
      return;
    }
    const res = renameFlatValue(categoryKey, editingValue, v);
    if (res.ok) {
      toast.success(`Renamed to "${v}"`);
      setEditingValue(null);
      setEditText('');
    } else {
      toast.warning(res.error);
    }
  };

  const toggle = (opt) => {
    const res = setFlatEnabled(categoryKey, opt.value, !opt.enabled);
    if (res.ok) {
      toast.success(opt.enabled ? `"${opt.value}" disabled` : `"${opt.value}" enabled`);
    }
  };

  const enabled = options.filter((o) => o.enabled);
  const disabledList = options.filter((o) => !o.enabled);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Manage ${title}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        {/* Add */}
        <div className="flex items-center gap-1.5">
          <input
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={`Add a new ${title.toLowerCase()} option...`}
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 transition-all"
            aria-label={`Add ${title} option`}
          />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {/* Options */}
        <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {options.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">No options yet — add one above.</div>
          )}
          {enabled.map((opt) =>
            editingValue === opt.value ? (
              <div key={opt.value} className="flex items-center gap-1 px-2 py-1.5 bg-[#F4F7F6]">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === 'Escape') {
                      setEditingValue(null);
                    }
                  }}
                  className="flex-1 min-w-0 bg-white border border-emerald-600/50 rounded px-2 py-1 text-xs text-slate-700 outline-none"
                  aria-label="Edit option value"
                  autoFocus
                />
                <button type="button" title="Save" onClick={saveEdit} className={ROW_BTN_ACTION}>
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Cancel" onClick={() => setEditingValue(null)} className={ROW_BTN}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div key={opt.value} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 min-w-0 truncate text-xs text-slate-700">{opt.value}</span>
                <button type="button" title="Edit" onClick={() => startEdit(opt)} className={ROW_BTN_ACTION}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Disable" onClick={() => toggle(opt)} className={ROW_BTN}>
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          )}
          {disabledList.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2 px-3 py-2 bg-slate-50/80">
              <span className="flex-1 min-w-0 truncate text-xs text-slate-400 line-through">{opt.value}</span>
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                Disabled
              </span>
              <button type="button" title="Enable" onClick={() => toggle(opt)} className={ROW_BTN_ACTION}>
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          Disabled options are hidden from new selections; existing records keep showing their current value.
        </p>
      </div>
    </Modal>
  );
}

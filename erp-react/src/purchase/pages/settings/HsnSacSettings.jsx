/**
 * purchase/pages/settings/HsnSacSettings.jsx
 * ------------------------------------------------------------------
 * HSN / SAC code master — manage GST classification codes.
 * Uses the unified settings-polish.css ERP design system.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Search, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { HSN_DESCRIPTIONS, HSN_DEFAULT_GST } from '../../constants';
import { getActiveTaxRates } from '../../services/settings';
import { listMaster, addMasterItem, renameMasterItem, removeMasterItem, subscribeMaster } from '../../services/masterStore';

const INPUT = 'st-input';
const SELECT = 'st-select';
const LABEL = 'st-label';

export default function HsnSacSettings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGst, setNewGst] = useState('');
  const [taxRates, setTaxRates] = useState([]);
  const [editField, setEditField] = useState(null);

  useEffect(() => {
    const load = () => {
      setItems(listMaster('hsnCodes'));
      setTaxRates(getActiveTaxRates().map((t) => t.rate));
      setLoading(false);
    };
    queueMicrotask(load);
    const unsub = subscribeMaster('hsnCodes', (list) => setItems(list));
    return unsub;
  }, []);

  const filtered = items.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) ||
      (HSN_DESCRIPTIONS[i.name] || '').toLowerCase().includes(q);
  });

  const handleAdd = useCallback(() => {
    if (!newCode.trim()) return;
    const result = addMasterItem('hsnCodes', newCode.trim());
    if (result.ok) {
      setNewCode('');
      setNewDesc('');
      setNewGst('');
      setAdding(false);
    }
  }, [newCode]);

  const handleRename = useCallback((id, newName) => {
    if (!newName.trim()) return;
    renameMasterItem('hsnCodes', id, newName.trim());
    setEditField(null);
  }, []);

  const handleDelete = useCallback((id) => {
    removeMasterItem('hsnCodes', id);
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="st-space-y-4">
      {/* Search + Add toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search HSN / SAC codes..."
            className="st-input st-input-search"
          />
        </div>
        <button type="button" onClick={() => setAdding(!adding)} className="st-btn st-btn-outline">
          <Plus className="w-3.5 h-3.5" /> Add HSN Code
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="st-add-form">
          <div className="st-form-grid-3">
            <label className="block">
              <span className={LABEL}>HSN / SAC Code</span>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} className={INPUT} placeholder="e.g. 8504" />
            </label>
            <label className="block">
              <span className={LABEL}>Description</span>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className={INPUT} placeholder="e.g. VFD / Drives" />
            </label>
            <label className="block">
              <span className={LABEL}>Default GST %</span>
              <select value={newGst} onChange={(e) => setNewGst(e.target.value)} className={SELECT}>
                <option value="">None</option>
                {taxRates.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button type="button" onClick={handleAdd} className="st-btn st-btn-primary st-btn-sm">Save</button>
            <button type="button" onClick={() => setAdding(false)} className="st-btn st-btn-ghost st-btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th style={{ minWidth: 120 }}>HSN / SAC Code</th>
              <th>Description</th>
              <th style={{ width: 120 }}>Default GST %</th>
              <th style={{ width: 80 }}>Status</th>
              <th className="st-td-center" style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="st-empty">
                  {search ? 'No matching codes found.' : 'No HSN/SAC codes configured. Click "Add HSN Code" to get started.'}
                </td>
              </tr>
            ) : filtered.map((item) => (
              <tr key={item.id}>
                <td data-label="HSN / SAC Code">
                  {editField?.id === item.id && editField.field === 'name' ? (
                    <input
                      autoFocus
                      defaultValue={item.name}
                      onBlur={(e) => handleRename(item.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(item.id, e.target.value); if (e.key === 'Escape') setEditField(null); }}
                      className={`${INPUT} st-input-w96`}
                    />
                  ) : (
                    <button type="button" onClick={() => setEditField({ id: item.id, field: 'name', value: item.name })} className="st-text-xs st-text-bold st-text-dark hover:st-text-accent cursor-pointer">
                      {item.name}
                    </button>
                  )}
                </td>
                <td data-label="Description">
                  <span className="st-text-xs st-text-muted">{HSN_DESCRIPTIONS[item.name] || '—'}</span>
                </td>
                <td data-label="Default GST %">
                  <span className="st-td-bold st-td-mono">{HSN_DEFAULT_GST[item.name] ?? '—'}{HSN_DEFAULT_GST[item.name] != null && '%'}</span>
                </td>
                <td data-label="Status">
                  <span className={`st-badge ${item.system ? 'st-badge-info' : 'st-badge-success'}`}>
                    {item.system ? 'Seed' : 'Custom'}
                  </span>
                </td>
                <td data-label="Actions" className="st-td-actions">
                  <div className="inline-flex items-center gap-1 justify-center">
                    <button type="button" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="st-btn-icon" title="Details">
                      {expandedId === item.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {!item.system && (
                      <button type="button" onClick={() => handleDelete(item.id)} className="st-btn-icon st-btn-icon-danger" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="st-text-xxs st-text-light">
        HSN codes with <span className="st-text-bold">Seed</span> badge are built-in defaults (cannot be deleted). Custom codes can be added and removed. Default GST rates apply when an item&apos;s HSN matches.
      </p>
    </div>
  );
}

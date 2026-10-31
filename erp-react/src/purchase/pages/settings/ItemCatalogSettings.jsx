/**
 * purchase/pages/settings/ItemCatalogSettings.jsx
 * ------------------------------------------------------------------
 * Product / Item catalog — manage reusable line-item templates.
 * Uses the unified settings-polish.css ERP design system.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Search, ChevronDown, ChevronUp, Loader2, Eye, Copy, Trash2, Power, MoreVertical } from 'lucide-react';
import { HSN_DESCRIPTIONS } from '../../constants';
import { getAllItems, addItem, updateItem, hardDeleteItem, removeItem } from '../../services/itemCatalog';
import { listMaster } from '../../services/masterStore';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const INPUT = 'st-input';
const SELECT = 'st-select';
const LABEL = 'st-label';

const EMPTY_FORM = {
  itemCode: '', product: '', description: '', category: '', hsn: '',
  uom: 'Nos', stockUom: '', uomConversionFactor: '', tax: '', standardRate: '',
  preferredVendors: '', leadTimeDays: '', minStock: '', reorderLevel: '',
  warehouse: '', batchTracking: false, serialTracking: false, active: true
};

export default function ItemCatalogSettings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [hsnCodes, setHsnCodes] = useState([]);
  const [error, setError] = useState('');

  /* Action dropdown state */
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, above: false });
  const menuRef = useRef(null);
  const menuBtnRefs = useRef({});

  /* Delete confirmation */
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    queueMicrotask(() => {
      setItems(getAllItems());
      setCategories(listMaster('categories').map((i) => i.name));
      setUoms(listMaster('uoms').map((i) => i.name));
      setHsnCodes(listMaster('hsnCodes').map((i) => i.name));
      setLoading(false);
    });
  }, []);

  /* Close dropdown on outside click or Escape */
  useEffect(() => {
    if (!menuOpenId) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          !Object.values(menuBtnRefs.current).some((el) => el && el.contains(e.target))) {
        setMenuOpenId(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpenId]);

  const filtered = items.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.itemCode.toLowerCase().includes(q) ||
      i.product.toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q) ||
      (i.hsn || '').includes(q);
  });

  /* Build the ERP payload — numeric fields stay numbers, preferred
     vendors become an array, and the UOM conversion factor is wrapped
     in the { factor } shape the catalog stores. */
  const toPayload = (f) => ({
    ...f,
    tax: f.tax === '' ? '' : Number(f.tax),
    standardRate: f.standardRate === '' ? '' : Number(f.standardRate),
    leadTimeDays: f.leadTimeDays === '' ? '' : Number(f.leadTimeDays),
    minStock: f.minStock === '' ? '' : Number(f.minStock),
    reorderLevel: f.reorderLevel === '' ? '' : Number(f.reorderLevel),
    uomConversion: f.stockUom && f.uomConversionFactor !== '' ? { factor: Number(f.uomConversionFactor) } : null,
    preferredVendors: f.preferredVendors
  });

  const handleAdd = useCallback(() => {
    setError('');
    if (!form.itemCode.trim() || !form.product.trim()) {
      setError('Item code and product name are required.');
      return;
    }
    const result = addItem(toPayload(form));
    if (!result.ok) { setError(result.error); return; }
    setItems(getAllItems());
    setForm(EMPTY_FORM);
    setAdding(false);
  }, [form]);

  const handleUpdate = useCallback(() => {
    setError('');
    if (!editId) return;
    const result = updateItem(editId, toPayload(form));
    if (!result.ok) { setError(result.error); return; }
    setItems(getAllItems());
    setEditId(null);
    setForm(EMPTY_FORM);
  }, [editId, form]);

  const startEdit = (item) => {
    setEditId(item.id);
    setForm({
      itemCode: item.itemCode,
      product: item.product,
      description: item.description || '',
      category: item.category || '',
      hsn: item.hsn || '',
      uom: item.uom || 'Nos',
      stockUom: item.stockUom || '',
      uomConversionFactor: item.uomConversion?.factor ?? '',
      tax: item.tax ?? '',
      standardRate: item.standardRate || '',
      preferredVendors: Array.isArray(item.preferredVendors) ? item.preferredVendors.join(', ') : (item.preferredVendors || ''),
      leadTimeDays: item.leadTimeDays || '',
      minStock: item.minStock || '',
      reorderLevel: item.reorderLevel || '',
      warehouse: item.warehouse || '',
      batchTracking: Boolean(item.batchTracking),
      serialTracking: Boolean(item.serialTracking),
      active: item.active !== false
    });
    setAdding(false);
    setMenuOpenId(null);
  };

  const handleToggle = (id, active) => {
    updateItem(id, { active: !active });
    setItems(getAllItems());
    setMenuOpenId(null);
  };

  const updateField = (field, value) => {
    const next = { ...form, [field]: value };
    if (field === 'hsn' && value) {
      const desc = HSN_DESCRIPTIONS[value];
      if (desc && !next.description) next.description = desc;
    }
    setForm(next);
  };

  /* ── Action dropdown positioning ── */
  const toggleMenu = (e, itemId) => {
    e.stopPropagation();
    if (menuOpenId === itemId) {
      setMenuOpenId(null);
      return;
    }
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 220; /* approximate */
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < menuHeight && rect.top > menuHeight;
    setMenuPos({
      top: above ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 210),
      above
    });
    setMenuOpenId(itemId);
  };

  /* ── Menu actions ── */
  const handleMenuView = (item) => {
    setMenuOpenId(null);
    setExpandedId(expandedId === item.id ? null : item.id);
    setEditId(null);
    setAdding(false);
  };

  const handleMenuDuplicate = (item) => {
    setMenuOpenId(null);
    const dupData = {
      ...item,
      id: undefined,
      itemCode: `${item.itemCode}-COPY`,
      product: `${item.product} (Copy)`
    };
    const result = addItem(toPayload({
      ...dupData,
      stockUom: dupData.stockUom || '',
      uomConversionFactor: dupData.uomConversion?.factor ?? '',
      preferredVendors: Array.isArray(dupData.preferredVendors) ? dupData.preferredVendors.join(', ') : (dupData.preferredVendors || '')
    }));
    if (!result.ok) { setError(result.error); return; }
    setItems(getAllItems());
  };

  const handleMenuDeactivate = (item) => {
    handleToggle(item.id, item.active);
  };

  const handleMenuDelete = (item) => {
    setMenuOpenId(null);
    setConfirmDelete(item);
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete) return;
    /* Use hard-delete for non-seed items, soft-delete for seed items */
    const result = hardDeleteItem(confirmDelete.id);
    if (!result.ok) {
      /* Fallback: soft-delete (deactivate) if hard-delete fails (seed item) */
      removeItem(confirmDelete.id);
    }
    setItems(getAllItems());
    setConfirmDelete(null);
    /* If the deleted item was expanded or being edited, clear that state */
    if (expandedId === confirmDelete.id) setExpandedId(null);
    if (editId === confirmDelete.id) { setEditId(null); setForm(EMPTY_FORM); }
  };

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
            placeholder="Search by item code, product, category, or HSN..."
            className="st-input st-input-search"
          />
        </div>
        <button
          type="button"
          onClick={() => { setAdding(!adding); setEditId(null); setForm(EMPTY_FORM); setError(''); }}
          className="st-btn st-btn-outline"
        >
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>

      {/* Error */}
      {error && <p className="st-text-xs st-text-semibold st-text-rose">{error}</p>}

      {/* Add / Edit form */}
      {(adding || editId) && (
        <div className="st-add-form">
          <div className="st-form-grid-3">
            <label className="block">
              <span className={LABEL}>SKU / Item Code *</span>
              <input value={form.itemCode} onChange={(e) => updateField('itemCode', e.target.value)} className={INPUT} placeholder="e.g. VFD-15KW" />
            </label>
            <label className="block st-span-full">
              <span className={LABEL}>Item Name *</span>
              <input value={form.product} onChange={(e) => updateField('product', e.target.value)} className={INPUT} placeholder="e.g. VFD drive 15 kW" />
            </label>
            <label className="block st-span-full">
              <span className={LABEL}>Description</span>
              <input value={form.description} onChange={(e) => updateField('description', e.target.value)} className={INPUT} placeholder="Optional specification notes..." />
            </label>
            <label className="block">
              <span className={LABEL}>Category</span>
              <select value={form.category} onChange={(e) => updateField('category', e.target.value)} className={SELECT}>
                <option value="">Select...</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>HSN / SAC</span>
              <select value={form.hsn} onChange={(e) => updateField('hsn', e.target.value)} className={SELECT}>
                <option value="">Select...</option>
                {hsnCodes.map((h) => <option key={h} value={h}>{h} — {HSN_DESCRIPTIONS[h] || ''}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Tax (GST %)</span>
              <input type="number" min="0" step="any" value={form.tax} onChange={(e) => updateField('tax', e.target.value)} className={INPUT} placeholder="e.g. 18" />
            </label>
            <label className="block">
              <span className={LABEL}>Purchase UOM</span>
              <select value={form.uom} onChange={(e) => updateField('uom', e.target.value)} className={SELECT}>
                {uoms.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Stock UOM</span>
              <select value={form.stockUom} onChange={(e) => updateField('stockUom', e.target.value)} className={SELECT}>
                <option value="">Same as purchase UOM</option>
                {uoms.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>UOM Conversion (stock units per purchase unit)</span>
              <input type="number" min="0" step="any" value={form.uomConversionFactor} onChange={(e) => updateField('uomConversionFactor', e.target.value)} className={INPUT} placeholder="e.g. 1000 for Ton → Kg" />
            </label>
            <label className="block">
              <span className={LABEL}>Default Rate (₹)</span>
              <input type="number" min="0" step="any" value={form.standardRate} onChange={(e) => updateField('standardRate', e.target.value)} className={INPUT} placeholder="0.00" />
            </label>
            <label className="block st-span-full">
              <span className={LABEL}>Preferred Vendors (comma separated)</span>
              <input value={form.preferredVendors} onChange={(e) => updateField('preferredVendors', e.target.value)} className={INPUT} placeholder="e.g. Tata Steel Ltd, JSW Steel" />
            </label>
            <label className="block">
              <span className={LABEL}>Lead Time (days)</span>
              <input type="number" min="0" value={form.leadTimeDays} onChange={(e) => updateField('leadTimeDays', e.target.value)} className={INPUT} placeholder="e.g. 14" />
            </label>
            <label className="block">
              <span className={LABEL}>Minimum Stock</span>
              <input type="number" min="0" value={form.minStock} onChange={(e) => updateField('minStock', e.target.value)} className={INPUT} placeholder="0" />
            </label>
            <label className="block">
              <span className={LABEL}>Reorder Level</span>
              <input type="number" min="0" value={form.reorderLevel} onChange={(e) => updateField('reorderLevel', e.target.value)} className={INPUT} placeholder="0" />
            </label>
            <label className="block">
              <span className={LABEL}>Default Warehouse</span>
              <input value={form.warehouse} onChange={(e) => updateField('warehouse', e.target.value)} className={INPUT} placeholder="e.g. Main Store" />
            </label>
            <label className="block st-span-full">
              <span className={LABEL}>Tracking</span>
              <div className="flex items-center gap-5 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={form.batchTracking} onChange={(e) => updateField('batchTracking', e.target.checked)} />
                  Batch Tracking
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={form.serialTracking} onChange={(e) => updateField('serialTracking', e.target.checked)} />
                  Serial Tracking
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={form.active} onChange={(e) => updateField('active', e.target.checked)} />
                  Active (usable in documents)
                </label>
              </div>
            </label>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button type="button" onClick={editId ? handleUpdate : handleAdd} className="st-btn st-btn-primary st-btn-sm">
              {editId ? 'Update' : 'Save'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setEditId(null); setForm(EMPTY_FORM); setError(''); }} className="st-btn st-btn-ghost st-btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Item Code</th>
              <th style={{ minWidth: 160 }}>Product</th>
              <th style={{ width: 110 }}>Category</th>
              <th style={{ width: 80 }}>HSN</th>
              <th style={{ width: 70 }}>UOM</th>
              <th className="st-td-right" style={{ width: 100 }}>Std Rate</th>
              <th style={{ width: 80 }}>Status</th>
              <th className="st-td-center" style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="st-empty">
                  {search ? 'No matching items found.' : 'No items in catalog. Click "Add Item" to get started.'}
                </td>
              </tr>
            ) : filtered.map((item) => (
              <tr key={item.id}>
                <td data-label="Item Code"><span className="st-td-bold">{item.itemCode}</span></td>
                <td data-label="Product"><span>{item.product}</span></td>
                <td data-label="Category"><span className="st-td-muted">{item.category || '—'}</span></td>
                <td data-label="HSN"><span className="st-td-mono st-td-muted">{item.hsn || '—'}</span></td>
                <td data-label="UOM"><span className="st-td-muted">{item.uom}</span></td>
                <td data-label="Std Rate" className="st-td-right"><span className="st-td-bold st-td-mono">₹{Number(item.standardRate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></td>
                <td data-label="Status">
                  <button type="button" onClick={() => handleToggle(item.id, item.active)} className={`st-badge cursor-pointer transition-colors ${item.active ? 'st-badge-success' : 'st-badge-neutral'}`}>
                    {item.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td data-label="Actions" className="st-td-actions">
                  <div className="inline-flex items-center gap-1 justify-center">
                    <button
                      type="button"
                      ref={(el) => { menuBtnRefs.current[item.id] = el; }}
                      onClick={(e) => toggleMenu(e, item.id)}
                      className={`st-btn-icon ${menuOpenId === item.id ? 'st-btn-icon-active' : ''}`}
                      title="Actions"
                    >
                      {menuOpenId === item.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(item); }} className="st-btn-icon" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {expandedId && filtered.map((item) => (
              item.id === expandedId ? (
                <tr key={`${item.id}-detail`} className="st-detail-row">
                  <td colSpan={8} className="st-detail-cell">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="st-text-xxs st-text-light">Stock UOM</p>
                        <p className="st-text-xs st-text-semibold">{item.stockUom ? `${item.uom} → ${item.stockUom}` : item.uom}</p>
                      </div>
                      <div>
                        <p className="st-text-xxs st-text-light">Conversion</p>
                        <p className="st-text-xs st-text-semibold">{item.uomConversion ? `1 ${item.uom} = ${item.uomConversion.factor} ${item.stockUom}` : '—'}</p>
                      </div>
                      <div>
                        <p className="st-text-xxs st-text-light">Lead Time</p>
                        <p className="st-text-xs st-text-semibold">{item.leadTimeDays ? `${item.leadTimeDays} days` : '—'}</p>
                      </div>
                      <div>
                        <p className="st-text-xxs st-text-light">Warehouse</p>
                        <p className="st-text-xs st-text-semibold">{item.warehouse || '—'}</p>
                      </div>
                      <div>
                        <p className="st-text-xxs st-text-light">Min Stock / Reorder</p>
                        <p className="st-text-xs st-text-semibold">{item.minStock || 0} / {item.reorderLevel || 0}</p>
                      </div>
                      <div>
                        <p className="st-text-xxs st-text-light">Tax</p>
                        <p className="st-text-xs st-text-semibold">{item.tax ? `${item.tax}%` : '—'}</p>
                      </div>
                      <div>
                        <p className="st-text-xxs st-text-light">Preferred Vendors</p>
                        <p className="st-text-xs st-text-semibold">{Array.isArray(item.preferredVendors) && item.preferredVendors.length ? item.preferredVendors.join(', ') : '—'}</p>
                      </div>
                      <div>
                        <p className="st-text-xxs st-text-light">Tracking</p>
                        <p className="st-text-xs st-text-semibold">{[item.batchTracking ? 'Batch' : '', item.serialTracking ? 'Serial' : ''].filter(Boolean).join(', ') || 'None'}</p>
                      </div>
                      {item.description && (
                        <div className="col-span-2 md:col-span-4">
                          <p className="st-text-xxs st-text-light">Description</p>
                          <p className="st-text-xs st-text-muted">{item.description}</p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : null
            ))}
          </tbody>
        </table>
      </div>

      <p className="st-text-xxs st-text-light">
        {items.length} total items · {items.filter((i) => i.active).length} active · The item master feeds PR/RFQ/PO/Quotation line auto-fill, GRN/Invoice line attributes and inventory movements.
      </p>

      {/* ── Action Dropdown Menu (portaled via fixed positioning) ── */}
      {menuOpenId && (() => {
        const item = filtered.find((i) => i.id === menuOpenId);
        if (!item) return null;
        return (
          <div
            ref={menuRef}
            className="st-item-action-menu"
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          >
            <button type="button" className="st-item-action-item" onClick={() => handleMenuView(item)}>
              <Eye className="st-item-action-icon" /> View Item
            </button>
            <button type="button" className="st-item-action-item" onClick={() => startEdit(item)}>
              <Pencil className="st-item-action-icon" /> Edit Item
            </button>
            <button type="button" className="st-item-action-item" onClick={() => handleMenuDuplicate(item)}>
              <Copy className="st-item-action-icon" /> Duplicate Item
            </button>
            <button type="button" className="st-item-action-item" onClick={() => handleMenuDeactivate(item)}>
              <Power className="st-item-action-icon" /> {item.active ? 'Deactivate' : 'Activate'} Item
            </button>
            <div className="st-item-action-divider" />
            <button type="button" className="st-item-action-item st-item-action-danger" onClick={() => handleMenuDelete(item)}>
              <Trash2 className="st-item-action-icon" /> Delete Item
            </button>
          </div>
        );
      })()}

      {/* ── Delete Confirmation Dialog ── */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Item"
        message={`Are you sure you want to delete this item?\n\nItem: ${confirmDelete?.itemCode} — ${confirmDelete?.product}\n\nThis action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        onConfirm={confirmDeleteAction}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
